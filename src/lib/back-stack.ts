/**
 * 11.1 · Android 返回手势：关弹层 / 学习中先确认
 *
 * 弹层打开时往 history 里压一条（URL 不变），按返回只关最上面那个弹层，不离开页面。
 * 用按钮 / 遮罩关掉时不调用 history.back()（那会和紧接着的跳转抢 history，把跳转撤回去），
 * 而是把这一条就地标成「作废」（replaceState，同步、不触发导航）；以后返回经过作废的条目时自动再退一步，
 * 用户感觉不到多出来的那一条。下次再开弹层时直接复用这条作废的条目。
 *
 * 学习 / 游戏 / 小测进行中也压一条「守卫」条目（同一个 URL）：按返回只会退到守卫下面那条同 URL 的条目，
 * 这时立刻把守卫压回去，并让页面弹「退出本组？」——不依赖路由的 index 推算，Android 返回手势、
 * 浏览器返回按钮、地址栏改哈希后的返回都拦得住。会话结束 / 确认退出时守卫同样就地作废。
 *
 * 同时记着「现在有没有弹层开着」，toast 据此挪到顶部，不挡弹层的主按钮。
 */
import { useEffect, useRef, useSyncExternalStore } from "react";

type Entry = { id: number; close: () => void };
type HState = Record<string, unknown> & { __sheet?: number; __guard?: number; __dead?: 1; __TSR_index?: number };
type Guard = { id: number; href: string; onBack: () => void };

const stack: Entry[] = [];
// 刷新后 id 不和刷新前留在 history 里的旧条目撞号
let seq = typeof Date !== "undefined" ? Date.now() % 1_000_000_000 : 0;
let guard: Guard | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const hasWin = typeof window !== "undefined" && typeof window.addEventListener === "function" && !!window.history;
const cur = (): HState => ((hasWin && window.history.state) || {}) as HState;
const href = () => (hasWin ? window.location.href : "");

/** 不再有主人的条目：作废的、弹层已关的、守卫已撤的（包括刷新前留下的） */
function phantom(st: HState): boolean {
  if (st.__sheet !== undefined) return !stack.some((e) => e.id === st.__sheet);
  if (st.__guard !== undefined) return guard?.id !== st.__guard;
  return !!st.__dead;
}

/** 压新条目时不继承上一条的弹层 / 守卫 / 作废标记 */
function clean(st: HState): HState {
  const { __sheet: _s, __guard: _g, __dead: _d, ...rest } = st;
  void _s;
  void _g;
  void _d;
  return rest;
}

// 记住「上一条」：判断返回是不是刚离开一条作废的同 URL 条目
let last: HState = cur();
let lastHref = href();
/**
 * 原生 replaceState（路由包装之前的）。就地作废 / 复用条目时用它：走路由的包装会让路由重新读一遍地址，
 * 而这一刻路由可能正有一条跳转在排队（微任务里才真正 pushState）——读到的是旧地址，路由就以为自己还在旧页面，
 * 新页面不渲染（v5「新建词单 → 跳到词单页」就是这样卡住的）。URL 不变，路由不需要知道。
 */
let nativeReplace: History["replaceState"] | null = null;
function rep(st: HState) {
  if (nativeReplace) nativeReplace.call(window.history, st, "");
  else window.history.replaceState(st, "");
  last = cur();
  lastHref = href();
}
if (hasWin) {
  const h = window.history;
  const op = h.pushState;
  const or = h.replaceState;
  nativeReplace = or;
  h.pushState = function (...a: Parameters<History["pushState"]>) {
    const r = op.apply(h, a);
    last = cur();
    lastHref = href();
    return r;
  };
  h.replaceState = function (...a: Parameters<History["replaceState"]>) {
    const r = or.apply(h, a);
    last = cur();
    lastHref = href();
    return r;
  };
}

const idx = (s: HState) => (typeof s.__TSR_index === "number" ? s.__TSR_index : undefined);

/** 11.2 · 下一次 popstate 由调用方自己处理（不自动「再退一步」） */
let hold = false;
export function holdNextPop() {
  hold = true;
}
/** 当前条目在路由 history 里的序号（没有 = 地址栏直接改的） */
export const historyIndex = () => idx(cur());
/** 当前条目是作废 / 无主的（会话结束后守卫留下的那条） */
export const atPhantom = () => {
  const st = cur();
  return phantom(st) && !!(st.__dead || st.__sheet !== undefined || st.__guard !== undefined);
};

function onPop() {
  if (hold) {
    hold = false;
    last = cur();
    lastHref = href();
    return;
  }
  const st = cur();
  const prev = last;
  const prevHref = lastHref;
  last = st;
  lastHref = href();
  const pi = idx(prev);
  const ni = idx(st);
  const forward = pi !== undefined && ni !== undefined && ni > pi;
  // 1. 落到了没有主人的条目：顺着方向再走一步（同一个页面，用户感觉不到）
  if (phantom(st) && (st.__dead || st.__sheet !== undefined || st.__guard !== undefined)) {
    if (forward) window.history.forward();
    else window.history.back();
    return;
  }
  // 2. 弹层开着：返回之后当前条目已不是最上面弹层的 → 关掉它
  const top = stack[stack.length - 1];
  if (top) {
    if (st.__sheet !== top.id) {
      stack.pop();
      emit();
      top.close();
    }
    return;
  }
  // 3. 学习中：从守卫退到了它下面的同 URL 条目 → 把守卫压回去，让页面弹确认
  if (guard && st.__guard !== guard.id && href() === guard.href && !forward) {
    const g = guard;
    try {
      window.history.pushState({ ...clean(st), ...(ni !== undefined ? { __TSR_index: ni + 1 } : {}), __guard: g.id }, "");
    } catch {
      /* history 不可用 */
    }
    g.onBack();
    return;
  }
  // 4. 刚从一条作废的同 URL 条目退回来（例如按钮关掉弹层 / 会话结束后的第一次返回）：再退一步，不让这次返回白按。
  //    只认真正的「后退」（两边都有 index 且变小）：跳到同一个哈希的导航也会触发 popstate，那不是返回。
  const back = pi !== undefined && ni !== undefined && ni < pi;
  if (back && phantom(prev) && (prev.__dead || prev.__sheet !== undefined || prev.__guard !== undefined) && prevHref === href()) {
    window.history.back();
  }
}

if (hasWin) window.addEventListener("popstate", onPop);

/** 当前条目是作废的 / 无主的：就地改写复用，不再多压一条 */
function place(mark: Record<string, number>) {
  const st = cur();
  if (phantom(st) && (st.__dead || st.__sheet !== undefined || st.__guard !== undefined)) {
    rep({ ...clean(st), ...mark });
  } else {
    const i = idx(st);
    window.history.pushState({ ...clean(st), ...(i !== undefined ? { __TSR_index: i + 1 } : {}), ...mark }, "");
  }
}

function push(close: () => void): number {
  const id = ++seq;
  stack.push({ id, close });
  try {
    place({ __sheet: id });
  } catch {
    /* history 不可用 */
  }
  emit();
  return id;
}

/** 这一条还是当前条目就就地作废，不发起导航 */
function kill(key: "__sheet" | "__guard", id: number) {
  try {
    const st = cur();
    if (st[key] === id) rep({ ...clean(st), __dead: 1 });
  } catch {
    /* history 不可用 */
  }
}

/** 用按钮 / 遮罩关掉（或组件卸载） */
function release(id: number) {
  const k = stack.findIndex((e) => e.id === id);
  if (k < 0) return;
  stack.splice(k, 1);
  emit();
  kill("__sheet", id);
}

/** 弹层开着时接管返回键；enabled = false 时不压 history（例如拦截离开页面的确认框） */
export function useBackClose(open: boolean, close: () => void, enabled = true) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open || !enabled) return;
    const id = push(() => closeRef.current());
    return () => release(id);
  }, [open, enabled]);
}

/** 撤掉守卫（会话结束 / 确认退出）：守卫条目就地作废 */
function disarm(id: number) {
  if (guard?.id !== id) return;
  guard = null;
  kill("__guard", id);
}

/**
 * 学习 / 游戏 / 小测进行中：按返回先调 onBack（弹确认），不离开页面。
 * 返回 leave()：确认退出时调用——撤掉守卫并真的退回上一页；退不回去（这是第一条记录）时返回 false，
 * 由调用方自己跳到首页。disarm()：不退回、只撤守卫（例如按 × 已经要跳转了）。
 */
export function useBackGuard(active: boolean, onBack: () => void) {
  const cb = useRef(onBack);
  cb.current = onBack;
  const idRef = useRef(0);
  useEffect(() => {
    if (!active || !hasWin) return;
    const id = ++seq;
    idRef.current = id;
    guard = { id, href: href(), onBack: () => cb.current() };
    try {
      place({ __guard: id });
    } catch {
      /* history 不可用 */
    }
    return () => disarm(id);
  }, [active]);
  return {
    disarm: () => disarm(idRef.current),
    leave: (): boolean => {
      const id = idRef.current;
      const i = idx(cur());
      disarm(id);
      // 守卫下面那条就是第一条记录：没有「上一页」可回
      if (i !== undefined && i <= 1) return false;
      // 有 index：退一步到同 URL 的那条，第 4 步会自动再退一步；没有 index（地址栏直接改的哈希）：一次退两步
      if (i === undefined) window.history.go(-2);
      else window.history.back();
      return true;
    },
  };
}

export const sheetsOpen = () => stack.length;

export function useSheetOpen(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    () => stack.length > 0,
    () => false,
  );
}
