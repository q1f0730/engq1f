/**
 * 11.1 · 救援页：界面崩了 / 存档读不出来时显示。
 * 不依赖主界面（不用路由、不用 store 的 hook），只直接读写 localStorage 和 IndexedDB 里的快照，
 * 所以哪怕状态坏到每个页面都渲染不出来，也能回滚到快照或者把原始数据导出来。
 */
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { KEY, REV_KEY, parseBackup } from "@/lib/store";
import { ACTIVE_PROFILE } from "@/lib/profiles";
import { dayKey } from "@/lib/srs";
import { isChunkError } from "@/lib/chunk-error";
export { isChunkError };
import type { SnapMeta } from "@/lib/snapshots";

export const RESCUE_KEY = "cet4v-rescue-v1";

/** 11.3 · 自动重试的间隔（秒）：5 / 15 / 30 秒退避，之后只在联网时再试 */
export const RETRY_STEPS = [5, 15, 30];
const RETRY_KEY = "cet4v-retry-n";

/** 网络 / 加载失败：重试；5 / 15 / 30 秒自动再试，联网时也会马上再试 */
/** 出错页一出来就撤掉启动画面 */
const useUnboot = () => useEffect(() => document.getElementById("boot")?.remove(), []);

export function LoadFailed({ onRetry, message }: { onRetry: () => void; message?: string }) {
  useUnboot();
  // 重试一般是整页重新加载：第几次自动重试记在 sessionStorage 里，成功打开页面后清掉
  const [n] = useState(() => {
    try {
      return Number(sessionStorage.getItem(RETRY_KEY) || 0);
    } catch {
      return 0;
    }
  });
  const wait = RETRY_STEPS[n];
  const [left, setLeft] = useState(wait ?? 0);
  useEffect(() => {
    const on = () => onRetry();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [onRetry]);
  useEffect(() => {
    if (wait === undefined) return;
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const l = Math.max(0, wait - Math.floor((Date.now() - t0) / 1000));
      setLeft(l);
      if (l === 0) {
        window.clearInterval(id);
        try {
          sessionStorage.setItem(RETRY_KEY, String(n + 1));
        } catch {
          /* 照样重试 */
        }
        onRetry();
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [wait, n, onRetry]);
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center p-6" data-testid="load-failed" data-auto={wait ?? 0}>
      {/* 12.0 · 出错页也是纸和墨：一行大字说发生了什么，一行说记录没事，主按钮在下 */}
      <div className="font-serif text-[3rem] italic leading-none text-rule-strong" aria-hidden>
        …
      </div>
      <h1 className="mt-4 text-[1.375rem] font-semibold tracking-[-0.02em]">网络不好，页面没加载出来</h1>
      <p className="mt-2 border-l-2 border-know pl-3 text-[0.9375rem] leading-relaxed text-ink-2" data-testid="load-failed-body">
        学习记录都在，没有受影响。
        {wait !== undefined ? (
          <span data-testid="load-countdown">
            <b className="tnum font-serif text-[1.125rem] font-normal text-ink">{left}</b> 秒后自动重试
          </span>
        ) : (
          "连上网后会自动重试，也可以点下面的重试。"
        )}
      </p>
      <button
        type="button"
        data-testid="load-retry"
        onClick={() => {
          try {
            sessionStorage.removeItem(RETRY_KEY);
          } catch {
            /* 照样重试 */
          }
          onRetry();
        }}
        className="press mt-6 h-12 w-full rounded-lg bg-ink font-semibold text-paper-3 hover:bg-ink-2"
      >
        现在重试
      </button>
      <button type="button" onClick={() => (location.hash = "#/")} className="press mt-2 h-11 w-full rounded-lg text-[0.875rem] font-medium text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink">
        回首页
      </button>
      {message && <TechDetail testid="load-failed-msg" message={message} />}
    </div>
  );
}

/** 页面成功打开后清掉自动重试的计数 */
export function clearRetry() {
  try {
    sessionStorage.removeItem(RETRY_KEY);
  } catch {
    /* 忽略 */
  }
}

/** 11.3 · 技术报错收进「详细信息」里，反馈问题时再展开 */
function TechDetail({ message, testid }: { message: string; testid: string }) {
  return (
    <details className="mt-4 border-t border-rule pt-2 text-left text-[0.75rem] text-ink-3">
      <summary className="cursor-pointer select-none font-medium">详细信息</summary>
      <p className="mt-1.5 break-all font-mono text-[0.6875rem] leading-snug text-ink-3" data-testid={testid}>
        {message}
      </p>
    </details>
  );
}

function rawDump(): string {
  let main: string | null = null;
  let rev: string | null = null;
  try {
    main = localStorage.getItem(KEY);
    rev = localStorage.getItem(REV_KEY);
  } catch {
    /* 存储不可用 */
  }
  // 读得懂就导出成能直接再导入的备份格式；读不懂就原样保存
  try {
    const state = JSON.parse(main ?? "null");
    if (state && typeof state === "object") {
      try {
        const rl = JSON.parse(rev ?? "[]");
        if (Array.isArray(rl) && !Array.isArray(state.revlog)) state.revlog = rl;
      } catch {
        /* 日志坏了：不带日志 */
      }
      return JSON.stringify({ app: "cet4-vocab", version: 1, exportedAt: new Date().toISOString(), state });
    }
  } catch {
    /* 不是 JSON */
  }
  return JSON.stringify({ app: "cet4-vocab", raw: { [KEY]: main, [REV_KEY]: rev }, exportedAt: new Date().toISOString() });
}

function exportRaw() {
  const blob = new Blob([rawDump()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  // 11.3 · 文件名用本地日期
  a.download = `四级单词打卡-原始数据-${dayKey(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** 把快照写回存储（先把现在的原始数据另存一份），然后整页重载 */
async function restoreSnap(id: string) {
  const m = await import("@/lib/snapshots");
  const data = await m.snapData(id);
  if (!data) throw new Error("快照不见了");
  const st = parseBackup(data);
  try {
    localStorage.setItem(RESCUE_KEY, rawDump());
  } catch {
    /* 空间不够也继续：快照本身还在 */
  }
  const { revlog, ...rest } = st;
  localStorage.setItem(KEY, JSON.stringify({ ...rest, onboarded: true }));
  if (revlog.length) localStorage.setItem(REV_KEY, JSON.stringify(revlog));
  else localStorage.removeItem(REV_KEY);
  // 回滚后回到首页（出事时可能停在数据中心之类的子页面）
  try {
    history.replaceState(null, "", `${location.pathname}${location.search}#/`);
  } catch {
    /* 照样重载 */
  }
  location.reload();
}

export function Rescue({ message, boot }: { message: string; boot?: boolean }) {
  useUnboot();
  const [snaps, setSnaps] = useState<SnapMeta[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [more, setMore] = useState(false);
  useEffect(() => {
    import("@/lib/snapshots")
      .then((m) => m.listSnaps(ACTIVE_PROFILE))
      .then(setSnaps)
      .catch(() => setSnaps([]));
  }, []);
  const go = async (id: string) => {
    setBusy(true);
    setErr("");
    try {
      await restoreSnap(id);
    } catch (e) {
      setErr((e as Error).message || "回滚失败");
      setBusy(false);
    }
  };
  const newest = snaps?.[0];
  const fmt = (s: SnapMeta) => `${s.day.slice(5).replace("-", "/")} ${new Date(s.at).toTimeString().slice(0, 5)} · ${s.words} 词`;
  const row = "press flex min-h-14 w-full items-center gap-3 border-b border-rule py-3 text-left disabled:opacity-50";
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6" data-testid="rescue">
      <div className="font-serif text-[3rem] italic leading-none text-rule-strong" aria-hidden>
        !
      </div>
      <h1 className="mt-3 text-[1.5rem] font-semibold tracking-[-0.02em]">{boot ? "学习记录读不出来" : "出了点问题"}</h1>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2" data-testid="rescue-body">
        {boot ? "存在这台设备上的记录格式坏了，app 读不懂它。" : "有一部分记录 app 读不懂，页面打不开。"}
        {snaps === null
          ? "你的记录没有被删掉。"
          : newest
            ? "你的记录没有被删掉：可以先导出原始数据留底，再回滚到最近一次自动快照。"
            : "你的记录没有被删掉：先导出原始数据留底。以后在「我的 → 数据与备份 → 从文件恢复」导入这个文件，能读的部分（单词记录、打卡）都会救回来。"}
      </p>
      {/* 11.3 · 技术细节收进「详细信息」，给反馈问题用 */}
      <TechDetail testid="rescue-msg" message={message} />
      {/* 12.0 · 几条出路排成一张带编号的清单；最该做的那条是墨色主按钮 */}
      <div className="mt-5">
        {(snaps === null || newest) && (
          <button
            type="button"
            data-testid="rescue-rollback"
            disabled={busy || !newest}
            onClick={() => newest && go(newest.id)}
            className="press mb-3 w-full rounded-lg bg-ink px-4 py-3 text-left font-semibold text-paper-3 hover:bg-ink-2 disabled:opacity-50"
          >
            回滚到最近快照
            <span className="tnum block text-[0.75rem] font-normal opacity-85">{snaps === null ? "查找快照…" : newest ? fmt(newest) : ""}</span>
          </button>
        )}
        <div className="border-t border-ink">
          <button
            type="button"
            data-testid="rescue-export"
            onClick={exportRaw}
            className={snaps !== null && !newest ? "press my-3 w-full rounded-lg bg-ink px-4 py-3 font-semibold text-paper-3 hover:bg-ink-2" : row}
          >
            {snaps !== null && !newest ? (
              "导出原始数据"
            ) : (
              <>
                <span className="tnum w-5 font-serif text-[1rem] text-ink-3">1</span>
                <span className="font-semibold">导出原始数据</span>
              </>
            )}
          </button>
          {boot && (
            <button
              type="button"
              data-testid="rescue-fresh"
              onClick={() => {
                // 11.2 · 先把原始数据下载到手机里（看得见、拿得回来），再在本机留一份（数据与备份里能导出 / 恢复 / 删除）
                exportRaw();
                try {
                  localStorage.setItem(RESCUE_KEY, rawDump());
                  localStorage.removeItem(KEY);
                } catch {
                  /* 存储不可用 */
                }
                setTimeout(() => location.reload(), 600);
              }}
              className={row}
            >
              <span className="tnum w-5 font-serif text-[1rem] text-ink-3">2</span>
              <span className="font-semibold">下载原始数据，然后从头开始</span>
            </button>
          )}
          <button type="button" data-testid="rescue-reload" onClick={() => location.reload()} className={row}>
            <span className="tnum w-5 font-serif text-[1rem] text-ink-3">{boot ? 3 : 2}</span>
            <span className="text-ink-2">重新加载</span>
          </button>
        </div>
      </div>
      {snaps && snaps.length > 1 && (
        <div className="mt-4">
          <button type="button" onClick={() => setMore(!more)} className="press h-10 text-[0.8125rem] font-medium text-ink underline decoration-rule-strong underline-offset-4" data-testid="rescue-more">
            {more ? "收起" : `更早的快照（${snaps.length - 1}）`}
          </button>
          {more && (
            <ul className="mt-1 border-t border-rule">
              {snaps.slice(1).map((s) => (
                <li key={s.id} className="border-b border-rule">
                  <button type="button" disabled={busy} onClick={() => go(s.id)} className="press tnum flex min-h-11 w-full items-center text-left text-[0.8125rem] hover:bg-paper-2/60">
                    回滚到 {fmt(s)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {err && (
        <p className="mt-3 border-l-2 border-forget pl-3 text-[0.8125rem] font-semibold text-forget" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

/** 整个应用外面再包一层：路由之外的渲染错误也接得住 */
export class AppBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn("app crashed", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      if (isChunkError(this.state.error)) return <LoadFailed message={String((this.state.error as Error)?.message ?? "")} onRetry={() => location.reload()} />;
      return <Rescue message={`错误信息：${String((this.state.error as Error)?.message ?? this.state.error)}`} />;
    }
    return this.props.children;
  }
}
