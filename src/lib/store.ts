import { useSyncExternalStore } from "react";
import { applyPreviewKill } from "./learnflow";
import { kill, unkill, type Card, type DayLog, type QuizMode } from "./srs";
import { cleanOffModes } from "./modes";
import { today } from "./clock";
import type { QuizRecord } from "./exam";
import { LIST_MAX, addWords, cleanListName, normalizeLists, removeWords, type WordList } from "./lists";
import { appendRev, normalizeRevlog, popRev, type RevEntry } from "./stats";
import { MAKEUP_MAX, TIME_GOALS, applyCheckIn, applyPatch, parseHM, type CheckInResult, type GoalMode, type PatchResult } from "./habit";
import type { ShareTpl } from "./share";
import { cleanFontSize, cleanMotion, motionReduced, type FontSize, type Motion } from "./ux";
import { ACTIVE_PROFILE, revKeyOf, stateKeyOf } from "./profiles";
import { cleanCards, cleanDayMap, cleanDays, cleanFlags, cleanLog, emptyReport, isDay, optDay, type CleanReport } from "./validate";

export type { CleanReport };
export type Book = "all" | "core";
export type Order = "core" | "alpha" | "random";
export type Theme = "system" | "light" | "dark" | "contrast";

export interface Settings {
  book: Book;
  order: Order;
  daily: number;
  accent: "us" | "uk";
  autoplay: boolean;
  cnFirst: boolean;
  theme: Theme;
  /** 每日复习上限，0 = 不限 */
  reviewCap: number;
  /** 震动反馈 */
  haptics: boolean;
  /** 发音语速（有道音频与系统语音）：0.75 / 1 / 1.25 */
  rate: number;
  /** 磁带模式每词朗读遍数 */
  tapeRepeat: number;
  /** 学习页与磁带模式保持屏幕常亮 */
  wakeLock: boolean;
  /** 四级考试日期 YYYY-MM-DD；空 = 自动取下一场 */
  examDate: string;
  /** 打卡标准：按任务（新词 + 复习）或按学习时长 */
  goalMode: GoalMode;
  /** 时长目标（分钟） */
  goalMin: number;
  /** 每周休息日：0 = 周日 … 6 = 周六，-1 = 不设 */
  restDay: number;
  /** 学习提醒 "HH:MM"，空 = 关 */
  remindAt: string;
  /** 图标角标显示待复习数 */
  appBadge: boolean;
  /** 分享图样式 */
  shareTpl: ShareTpl;
  /** 卡片与释义字号 */
  fontSize: FontSize;
  /** 左手模式：评分按钮左右翻转 */
  leftHand: boolean;
  /** 交换左右滑：右滑 = 不认识，左滑 = 认识 */
  swapSwipe: boolean;
  /** 减少动画：跟随系统 / 减少 / 正常 */
  motion: Motion;
  /** 卡片正面显示音标 */
  frontIpa: boolean;
  /** v9 · 关掉的复习题型 */
  offModes: QuizMode[];
  /** v9 · 难度递进题型 */
  progressive: boolean;
  /** v9 · 开始新词前先预习列表 */
  preview: boolean;
  /** v9 · 每组新词学完自动速测 */
  postQuiz: boolean;
  /** v10 · 记忆保持目标 85 / 90 / 95（%） */
  retention: number;
  /** v10 · 间隔随机扰动 ±5% */
  fuzz: boolean;
  /** v10 · 负荷均衡 */
  balance: boolean;
  /** v10 · 逾期加成 */
  overdue: boolean;
  /** v10 · 重学步骤 1 天 → 3 天 */
  steps: boolean;
  /** v10 · 四键模式（多一个「简单」） */
  fourKey: boolean;
  /** v10 · 初始难度拟合 */
  fitEase: boolean;
}

export interface AppState {
  v: 1;
  onboarded: boolean;
  settings: Settings;
  seed: number;
  cards: Record<string, Card>;
  star: Record<string, 1>;
  log: Record<string, DayLog>;
  checkins: string[];
  test?: { at: string; est: number };
  /** 明天再说：新词 → 搁置到哪天（这天之前不出现） */
  bury: Record<string, string>;
  /** 上次导出备份的日期 */
  lastBackup?: string;
  /** 备份提醒稍后再说：这天之前不提醒 */
  backupSnooze?: string;
  /** 模拟小测成绩（旧 → 新） */
  quizzes: QuizRecord[];
  /** 自定义词单 */
  lists: WordList[];
  /** 复习日志（每次作答一条，旧 → 新；单独存一个 key） */
  revlog: RevEntry[];
  /** 已解锁的成就：id → 解锁日期 */
  badges: Record<string, string>;
  /** 周报已读：哪个周一关掉的 */
  weekSeen?: string;
  /** 补卡张数（0–3） */
  makeup: number;
  /** 上次发补卡的日期（同一天不重复发） */
  makeupEarned?: string;
  /** 用补卡补上的日期（也在 checkins 里） */
  patched: string[];
  /** 已经安装到桌面（安装引导不再出现） */
  installed?: boolean;
  /** 安装卡片关掉了：这天之前不出现 */
  installSnooze?: string;
  /** v9 · 小游戏最高分：match = 配对消消乐得分，judge = 判断对错得分 */
  gameBest: Record<string, number>;
  /** v10 · 新词自适应：某天把新词目标减到 n */
  newCut?: { d: string; n: number };
  /** v10 · 新词自适应建议关掉的那天 */
  newCutSeen?: string;
  /** 11.1 · 回归恢复计划：from–until 这几天只清积压、新词暂停 */
  recover?: { from: string; until: string; n: number };
  /** 11.1 · 欢迎回来卡片关掉的那天 */
  recoverSeen?: string;
}

/** v10 · 记忆保持目标（这里自带一份，不让首屏引入整个 algo.ts） */
export const cleanRetention = (r: unknown): number => (r === 85 || r === 95 ? r : 90);

export const DAILY_OPTIONS = [10, 20, 30, 50, 80, 100];
export const REVIEW_CAP_OPTIONS = [0, 50, 100, 200];
export const RATE_OPTIONS = [0.75, 1, 1.25];
export const REPEAT_OPTIONS = [1, 2, 3];
/** 磁带模式定时停止（分钟），0 = 不定时 */
export const SLEEP_OPTIONS = [0, 10, 20, 30];
/** 当前档案的存储 key（默认档案 = cet4v-state-v1 / cet4v-revlog-v1） */
export const KEY = stateKeyOf(ACTIVE_PROFILE);
export const REV_KEY = revKeyOf(ACTIVE_PROFILE);
export const THEME_KEY = "cet4v-theme";

export const defaultSettings = (): Settings => ({
  book: "all",
  order: "core",
  daily: 20,
  accent: "us",
  autoplay: true,
  cnFirst: false,
  theme: "system",
  reviewCap: 0,
  haptics: true,
  rate: 1,
  tapeRepeat: 1,
  wakeLock: true,
  examDate: "",
  goalMode: "words",
  goalMin: 20,
  restDay: -1,
  remindAt: "",
  appBadge: true,
  shareTpl: "classic",
  fontSize: "md",
  leftHand: false,
  swapSwipe: false,
  motion: "system",
  frontIpa: true,
  offModes: [],
  progressive: false,
  preview: false,
  postQuiz: false,
  retention: 90,
  // v11 · 新安装默认打开高级排程（保持目标仍是 90%，四键模式仍关）
  fuzz: true,
  balance: true,
  overdue: true,
  steps: true,
  fourKey: false,
  fitEase: true,
});

/** v11 之前的默认值：存档里没有这些开关（v10 之前的存档 / 旧备份）时按旧默认补，老用户的排程不变 */
export const LEGACY_ALGO: Pick<Settings, "fuzz" | "balance" | "overdue" | "steps" | "fitEase"> = {
  fuzz: false,
  balance: false,
  overdue: false,
  steps: false,
  fitEase: false,
};

export function initialState(): AppState {
  return {
    v: 1,
    onboarded: false,
    settings: defaultSettings(),
    seed: Math.floor(Math.random() * 1e9) + 1,
    cards: {},
    star: {},
    log: {},
    checkins: [],
    bury: {},
    quizzes: [],
    lists: [],
    revlog: [],
    badges: {},
    makeup: 0,
    patched: [],
    gameBest: {},
  };
}

/** 越界的设置值回到默认（导入旧备份或手改数据时） */
export function cleanSettings(s: Settings): Settings {
  const d = defaultSettings();
  const bool = (v: unknown, dv: boolean) => (typeof v === "boolean" ? v : dv);
  return {
    ...s,
    book: s.book === "core" ? "core" : "all",
    order: s.order === "alpha" || s.order === "random" ? s.order : "core",
    daily: Number.isInteger(s.daily) && s.daily >= 1 && s.daily <= 300 ? s.daily : d.daily,
    accent: s.accent === "uk" ? "uk" : "us",
    autoplay: bool(s.autoplay, d.autoplay),
    cnFirst: s.cnFirst === true,
    haptics: bool(s.haptics, d.haptics),
    reviewCap: Number.isInteger(s.reviewCap) && s.reviewCap >= 0 && s.reviewCap <= 10000 ? s.reviewCap : 0,
    rate: RATE_OPTIONS.includes(s.rate) ? s.rate : d.rate,
    tapeRepeat: REPEAT_OPTIONS.includes(s.tapeRepeat) ? s.tapeRepeat : d.tapeRepeat,
    wakeLock: typeof s.wakeLock === "boolean" ? s.wakeLock : d.wakeLock,
    goalMode: s.goalMode === "time" ? "time" : "words",
    goalMin: (TIME_GOALS as readonly number[]).includes(s.goalMin) ? s.goalMin : d.goalMin,
    restDay: Number.isInteger(s.restDay) && s.restDay >= -1 && s.restDay <= 6 ? s.restDay : d.restDay,
    remindAt: parseHM(s.remindAt) !== null ? s.remindAt : "",
    appBadge: typeof s.appBadge === "boolean" ? s.appBadge : d.appBadge,
    shareTpl: s.shareTpl === "paper" || s.shareTpl === "night" ? s.shareTpl : "classic",
    theme: s.theme === "light" || s.theme === "dark" || s.theme === "contrast" ? s.theme : "system",
    fontSize: cleanFontSize(s.fontSize),
    leftHand: s.leftHand === true,
    swapSwipe: s.swapSwipe === true,
    motion: cleanMotion(s.motion),
    frontIpa: typeof s.frontIpa === "boolean" ? s.frontIpa : d.frontIpa,
    offModes: cleanOffModes(s.offModes),
    progressive: s.progressive === true,
    preview: s.preview === true,
    postQuiz: s.postQuiz === true,
    retention: cleanRetention(s.retention),
    fuzz: s.fuzz === true,
    balance: s.balance === true,
    overdue: s.overdue === true,
    steps: s.steps === true,
    fourKey: s.fourKey === true,
    fitEase: s.fitEase === true,
    examDate: typeof s.examDate === "string" && (s.examDate === "" || /^\d{4}-\d{2}-\d{2}$/.test(s.examDate)) ? s.examDate : d.examDate,
  };
}

/** 校验并补全（导入备份/读取旧数据）：逐条检查，能修的修、修不了的丢，绝不抛出坏状态 */
export function normalize(raw: unknown, has?: (w: string) => boolean, rep: CleanReport = emptyReport()): AppState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("备份格式不对");
  const r = raw as Partial<AppState>;
  const base = initialState();
  const day = today();
  const rs = (r.settings && typeof r.settings === "object" && !Array.isArray(r.settings) ? r.settings : {}) as Partial<Settings>;
  // 已有存档：v10 起每次保存都会写全这些开关；缺了就是更早的存档，沿用旧默认（关）
  const defaults = "fuzz" in rs ? base.settings : { ...base.settings, ...LEGACY_ALGO };
  const checkins = cleanDays(r.checkins, rep);
  const str = (x: unknown) => (typeof x === "string" ? x : undefined);
  return {
    ...base,
    v: 1,
    onboarded: r.onboarded === true,
    settings: cleanSettings({ ...defaults, ...rs }),
    cards: cleanCards(r.cards, day, has, rep),
    star: cleanFlags(r.star, has, rep),
    log: cleanLog(r.log, rep),
    checkins,
    bury: cleanDayMap(r.bury, has, rep),
    test: r.test && typeof r.test === "object" && isDay(r.test.at) && typeof r.test.est === "number" && Number.isFinite(r.test.est) ? { at: r.test.at, est: r.test.est } : undefined,
    lastBackup: optDay(r.lastBackup),
    backupSnooze: optDay(r.backupSnooze),
    quizzes: Array.isArray(r.quizzes)
      ? r.quizzes
          .filter((q) => q && typeof q === "object" && typeof q.ok === "number" && typeof q.n === "number" && typeof q.at === "string")
          .map((q) => ({ ...q, ts: typeof q.ts === "number" ? q.ts : 0, ms: typeof q.ms === "number" ? q.ms : 0 }))
      : [],
    lists: normalizeLists(r.lists),
    revlog: normalizeRevlog(r.revlog),
    badges: r.badges && typeof r.badges === "object" && !Array.isArray(r.badges) ? Object.fromEntries(Object.entries(r.badges).filter(([, v]) => typeof v === "string")) : {},
    weekSeen: str(r.weekSeen),
    makeup: typeof r.makeup === "number" && Number.isFinite(r.makeup) ? Math.max(0, Math.min(MAKEUP_MAX, Math.floor(r.makeup))) : 0,
    makeupEarned: str(r.makeupEarned),
    patched: cleanDays(r.patched),
    installed: r.installed === true ? true : undefined,
    installSnooze: str(r.installSnooze),
    seed: typeof r.seed === "number" && Number.isFinite(r.seed) ? r.seed : base.seed,
    gameBest: cleanBest(r.gameBest),
    newCut:
      r.newCut && typeof r.newCut === "object" && typeof r.newCut.d === "string" && Number.isInteger(r.newCut.n) && r.newCut.n >= 0 ? { d: r.newCut.d, n: r.newCut.n } : undefined,
    newCutSeen: str(r.newCutSeen),
    recover:
      r.recover && typeof r.recover === "object" && isDay(r.recover.from) && isDay(r.recover.until) && Number.isInteger(r.recover.n) && r.recover.n > 0
        ? { from: r.recover.from, until: r.recover.until, n: r.recover.n }
        : undefined,
    recoverSeen: optDay(r.recoverSeen),
  };
}

function cleanBest(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v >= 0));
}

/** 从存储里的原文读出状态（复习日志单独存；主状态里带了就用主状态里的，例如刚导入） */
function fromRaw(raw: string): AppState {
  const st = normalize(JSON.parse(raw));
  if (!st.revlog.length) {
    try {
      st.revlog = normalizeRevlog(JSON.parse(localStorage.getItem(REV_KEY) || "[]"));
    } catch {
      /* 日志损坏：丢掉日志，不影响学习记录 */
    }
  }
  return st;
}

/** 11.1 · 存档读不出来时不再静默从头开始（那样下一次保存就把原始数据覆盖了）：交给救援页处理 */
export let bootError: string | null = null;
/** 上次和存储同步（写入或读入）的原文：保存前对比，发现别的窗口写过就先合并 */
let lastRaw: string | null = null;

function read(): AppState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return initialState();
  }
  if (!raw) return initialState();
  try {
    const st = fromRaw(raw);
    lastRaw = raw;
    return st;
  } catch (e) {
    bootError = (e as Error)?.message || "存档损坏";
    return initialState();
  }
}

let state: AppState = read();
let savedRev: RevEntry[] | null = null;
const listeners = new Set<() => void>();
const external = new Set<(why: "sync" | "merge") => void>();

/** 别的窗口改了记录（已同步 / 已合并）时通知界面 */
export function onExternalChange(fn: (why: "sync" | "merge") => void) {
  external.add(fn);
  return () => {
    external.delete(fn);
  };
}

const REC_KEYS = ["cards", "log", "star", "bury", "badges", "gameBest"] as const;

/** a → b 的改动套到 base 上（只改动过的 key） */
function applyDiff<T>(base: Record<string, T>, a: Record<string, T>, b: Record<string, T>): Record<string, T> {
  const out = { ...base };
  for (const k of Object.keys(b)) if (b[k] !== a[k]) out[k] = b[k];
  for (const k of Object.keys(a)) if (!(k in b)) delete out[k];
  return out;
}

/**
 * 11.1 · 三方合并：prev → next 是本窗口这一步的改动，other 是别的窗口刚写进存储的状态。
 * 把本窗口的改动重放到 other 上，两边的改动都留下（学过的词、设置、日志、打卡）。
 */
export function rebase(prev: AppState, next: AppState, other: AppState): AppState {
  const out = { ...other } as Record<string, unknown>;
  const P = prev as unknown as Record<string, unknown>;
  const N = next as unknown as Record<string, unknown>;
  for (const k of Object.keys(N)) {
    const a = P[k];
    const b = N[k];
    if (a === b) continue;
    if (k === "revlog") {
      const key = (e: RevEntry) => `${e[0]}|${e[1]}|${e[2]}`;
      const had = new Set((a as RevEntry[]).map(key));
      const seen = new Set(other.revlog.map(key));
      const added = (b as RevEntry[]).filter((e) => !had.has(key(e)) && !seen.has(key(e)));
      const removed = new Set((a as RevEntry[]).filter((e) => !(b as RevEntry[]).some((x) => key(x) === key(e))).map(key));
      out.revlog = [...other.revlog.filter((e) => !removed.has(key(e))), ...added].sort((x, y) => x[1] - y[1]);
    } else if (k === "checkins" || k === "patched") {
      out[k] = [...new Set([...((other as unknown as Record<string, string[]>)[k] ?? []), ...(b as string[])])].sort();
    } else if (k === "settings") {
      const sa = a as Record<string, unknown>;
      const sb = b as Record<string, unknown>;
      const ns = { ...other.settings } as Record<string, unknown>;
      for (const f of Object.keys(sb)) if (sb[f] !== sa[f]) ns[f] = sb[f];
      out.settings = ns;
    } else if ((REC_KEYS as readonly string[]).includes(k) && a && b && typeof a === "object" && typeof b === "object") {
      out[k] = applyDiff(((other as unknown as Record<string, Record<string, unknown>>)[k] ?? {}) as Record<string, unknown>, a as Record<string, unknown>, b as Record<string, unknown>);
    } else out[k] = b;
  }
  return out as unknown as AppState;
}

function writeOut() {
  // 日志可能上万条：只在变了的时候写它自己的 key
  if (state.revlog !== savedRev) {
    if (state.revlog.length) localStorage.setItem(REV_KEY, JSON.stringify(state.revlog));
    else localStorage.removeItem(REV_KEY);
    savedRev = state.revlog;
  }
  const { revlog: _omit, ...rest } = state;
  void _omit;
  const raw = JSON.stringify(rest);
  localStorage.setItem(KEY, raw);
  lastRaw = raw;
  localStorage.setItem(THEME_KEY, state.settings.theme);
}

let bc: BroadcastChannel | null = null;
try {
  bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("cet4v-sync") : null;
} catch {
  bc = null;
}

function persist(prev: AppState) {
  try {
    const cur = localStorage.getItem(KEY);
    let merged = false;
    if (cur !== null && lastRaw !== null && cur !== lastRaw) {
      // 别的窗口在我们上次同步之后写过：先合并，再写（谁最后写谁赢会丢数据）
      try {
        state = rebase(prev, state, fromRaw(cur));
        merged = true;
      } catch {
        /* 对方写的读不出来：保留本窗口 */
      }
    }
    writeOut();
    bc?.postMessage({ key: KEY });
    if (merged) external.forEach((f) => f("merge"));
  } catch {
    /* 存储已满 */
  }
}

/** 别的窗口写了存储：读进来替换内存（本窗口每一步都已即时写入，不会丢） */
export function syncFromStorage(): boolean {
  let cur: string | null;
  try {
    cur = localStorage.getItem(KEY);
  } catch {
    return false;
  }
  if (cur === null || cur === lastRaw) return false;
  let next: AppState;
  try {
    next = fromRaw(cur);
  } catch {
    return false;
  }
  lastRaw = cur;
  state = next;
  savedRev = null;
  applyTheme(state.settings.theme);
  applyLook(state.settings);
  listeners.forEach((l) => l());
  external.forEach((f) => f("sync"));
  return true;
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) syncFromStorage();
  });
  if (bc) bc.onmessage = (e) => (e.data as { key?: string })?.key === KEY && syncFromStorage();
}

function commit(next: AppState) {
  const prev = state;
  state = next;
  persist(prev);
  applyTheme(state.settings.theme);
  applyLook(state.settings);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useApp(): AppState {
  return useSyncExternalStore(subscribe, () => state);
}

export const getState = () => state;

// ---------------------------------------------------------------- theme

/** 高对比度是浅色底的一套配色：这里归为 light（toast 等只认 light/dark） */
export function resolvedTheme(t: Theme): "light" | "dark" {
  if (t === "contrast") return "light";
  if (t !== "system") return t;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(t: Theme) {
  const r = resolvedTheme(t);
  const hc = t === "contrast";
  const el = document.documentElement;
  const want = hc ? "contrast" : r;
  // data-theme 记着当前是哪套（高对比度也是 light 类）
  if (el.classList.contains(r) && ((el as HTMLElement).dataset?.theme ?? want) === want) return;
  el.classList.remove("light", "dark", "contrast");
  el.classList.add(r);
  if (hc) el.classList.add("contrast");
  el.setAttribute("data-theme", want);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", hc ? "#ffffff" : r === "dark" ? "#16171d" : "#faf7f2");
}

/** 字号与动画：写到 <html> 的 data 属性上，CSS 据此缩放 / 关动画 */
export function applyLook(s: Pick<Settings, "fontSize" | "motion">) {
  const el = typeof document !== "undefined" ? document.documentElement : null;
  if (!el || typeof el.setAttribute !== "function" || typeof el.getAttribute !== "function") return;
  const sys = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const motion = motionReduced(s.motion ?? "system", sys) ? "reduce" : "full";
  if (el.getAttribute("data-motion") !== motion) el.setAttribute("data-motion", motion);
  const fs = s.fontSize ?? "md";
  if (el.getAttribute("data-fs") !== fs) el.setAttribute("data-fs", fs);
}

// ---------------------------------------------------------------- actions

export function setSettings(patch: Partial<Settings>) {
  commit({ ...state, settings: { ...state.settings, ...patch } });
}

export function completeOnboarding(patch: Partial<Settings>) {
  commit({ ...state, onboarded: true, settings: { ...state.settings, ...patch } });
}

/** 一次回答：卡片 + 当日日志；rev = 追加一条复习日志，"pop" = 撤销这个词最后一条 */
export function applyAnswer(w: string, card: Card | undefined, day: string, log: DayLog | undefined, rev?: RevEntry | "pop") {
  const cards = { ...state.cards };
  if (card) cards[w] = card;
  else delete cards[w];
  const logs = { ...state.log };
  if (log) logs[day] = log;
  else delete logs[day];
  const revlog = rev === "pop" ? popRev(state.revlog, w) : rev ? appendRev(state.revlog, rev) : state.revlog;
  commit({ ...state, cards, log: logs, revlog });
}

/** 记录新解锁的成就 */
export function unlockBadges(ids: string[], day: string) {
  if (!ids.length) return;
  const badges = { ...state.badges };
  for (const id of ids) if (!badges[id]) badges[id] = day;
  commit({ ...state, badges });
}

export function dismissWeekReport(day: string) {
  commit({ ...state, weekSeen: day });
}

export function toggleStar(w: string) {
  const star = { ...state.star };
  if (star[w]) delete star[w];
  else star[w] = 1;
  commit({ ...state, star });
}

export function killWord(w: string) {
  commit({ ...state, cards: { ...state.cards, [w]: kill(state.cards[w], today()) } });
}

export function unkillWord(w: string) {
  const c = state.cards[w];
  if (!c) return;
  commit({ ...state, cards: { ...state.cards, [w]: unkill(c, today()) } });
}

export function resetWord(w: string) {
  const cards = { ...state.cards };
  delete cards[w];
  commit({ ...state, cards });
}

export function batchKill(words: string[]) {
  const d = today();
  const cards = { ...state.cards };
  for (const w of words) cards[w] = kill(cards[w], d);
  commit({ ...state, cards });
}

/** 明天再说：新词记入搁置表；已有卡片的到期日由调用方改 */
export function setBury(w: string, until: string | undefined) {
  const bury = { ...state.bury };
  if (until) bury[w] = until;
  else delete bury[w];
  commit({ ...state, bury });
}

export function markInstalled() {
  commit({ ...state, installed: true });
}

export function snoozeInstall(until: string) {
  commit({ ...state, installSnooze: until });
}

export function markBackedUp(day: string) {
  commit({ ...state, lastBackup: day });
}

export function snoozeBackup(until: string) {
  commit({ ...state, backupSnooze: until });
}

/** 打卡：返回连续天数、是否得了补卡、跨过的里程碑 */
export function checkIn(day: string): CheckInResult {
  const r = applyCheckIn(state, day);
  if (r.checkins !== state.checkins) commit({ ...state, checkins: r.checkins, makeup: r.makeup, makeupEarned: r.makeupEarned });
  return r;
}

/** 用 1 张补卡补昨天 */
export function patchYesterday(day: string): PatchResult | null {
  const r = applyPatch(state, day);
  if (r) commit({ ...state, checkins: r.checkins, patched: r.patched, makeup: r.makeup });
  return r;
}

/** 保存一次模拟小测成绩（最多保留 60 次） */
export function saveQuiz(rec: QuizRecord) {
  commit({ ...state, quizzes: [...(state.quizzes ?? []), rec].slice(-60) });
}

/** 批量加入生词本（小测错题） */
export function starWords(words: string[]) {
  const star = { ...state.star };
  for (const w of words) star[w] = 1;
  commit({ ...state, star });
}

// ---------------------------------------------------------------- v5 · 词单与批量操作

/** 新建词单，返回 id；超过上限返回 null */
export function createList(name: string, words: string[] = []): string | null {
  const lists = state.lists ?? [];
  if (lists.length >= LIST_MAX) return null;
  const id = "l" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  const list = addWords({ id, name: cleanListName(name, lists.map((l) => l.name)), words: [], at: today() }, words);
  commit({ ...state, lists: [...lists, list] });
  return id;
}

function updateList(id: string, fn: (l: WordList) => WordList) {
  commit({ ...state, lists: (state.lists ?? []).map((l) => (l.id === id ? fn(l) : l)) });
}

export function renameList(id: string, name: string) {
  const others = (state.lists ?? []).filter((l) => l.id !== id).map((l) => l.name);
  updateList(id, (l) => ({ ...l, name: cleanListName(name, others) }));
}

export function deleteList(id: string) {
  commit({ ...state, lists: (state.lists ?? []).filter((l) => l.id !== id) });
}

export function addToList(id: string, words: string[]) {
  updateList(id, (l) => addWords(l, words));
}

export function removeFromList(id: string, words: string[]) {
  updateList(id, (l) => removeWords(l, words));
}

/** 批量重置：删掉这些词的学习记录（回到未学） */
export function batchReset(words: string[]) {
  const cards = { ...state.cards };
  for (const w of words) delete cards[w];
  commit({ ...state, cards });
}

/** 批量操作前拍快照，撤销时整体恢复（只含批量会改的部分） */
export type Snapshot = Pick<AppState, "cards" | "star" | "lists">;
export function snapshot(): Snapshot {
  return { cards: state.cards, star: state.star, lists: state.lists };
}
export function restoreSnapshot(s: Snapshot) {
  commit({ ...state, ...s });
}

// ---------------------------------------------------------------- v9 · 更多玩法

/** 小游戏成绩：比最高分高才记；返回是否破纪录 */
export function saveGameBest(game: string, score: number): boolean {
  const prev = state.gameBest?.[game] ?? 0;
  if (score <= prev) return false;
  commit({ ...state, gameBest: { ...(state.gameBest ?? {}), [game]: score } });
  return true;
}

/** 新词预习里斩掉的词：标记永久掌握，按「新词首答认识」计入今日（与学习中斩一致） */
export function previewKill(words: string[], day: string, rev: (w: string, card: Card) => RevEntry) {
  const next = applyPreviewKill(state, words, day, rev);
  if (next.cards !== state.cards) commit({ ...state, ...next });
}

// ---------------------------------------------------------------- v10 · 算法进阶

/** 新词自适应：今天新词目标减到 n；n = null 恢复 */
export function setNewCut(day: string, n: number | null) {
  commit({ ...state, newCut: n === null ? undefined : { d: day, n } });
}

export function dismissNewCut(day: string) {
  commit({ ...state, newCutSeen: day });
}

/** 批量替换卡片（负荷均衡挪动到期日） */
export function replaceCards(cards: Record<string, Card>) {
  commit({ ...state, cards });
}

// ---------------------------------------------------------------- 11.1 · 回归恢复计划

/** 开始恢复：积压按天摊开（cards 由调用方算好），这几天新词暂停 */
export function startRecover(cards: Record<string, Card>, from: string, until: string, n: number) {
  commit({ ...state, cards, recover: { from, until, n }, recoverSeen: from });
}

export function endRecover() {
  commit({ ...state, recover: undefined });
}

export function dismissRecover(day: string) {
  commit({ ...state, recoverSeen: day });
}

export function saveTest(est: number) {
  commit({ ...state, test: { at: today(), est } });
}

/** 备份文件格式版本（state.v 是存档版本）：比这个新的备份来自更新的应用，拒收 */
export const BACKUP_VERSION = 1;
export const STATE_VERSION = 1;

export function exportBackup(): string {
  return JSON.stringify({ app: "cet4-vocab", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), state }, null, 0);
}

export const NEWER_MSG = "这份备份来自更新的版本，请先更新 app 再导入";

/** 解析明文备份（不提交）：文件 / 剪贴板 / 快照共用。has 给了就丢掉词库里没有的词；rep 收集丢掉 / 修正的条数 */
export function parseBackup(text: string, has?: (w: string) => boolean, rep: CleanReport = emptyReport()): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON");
  }
  const p = parsed as { app?: string; version?: unknown; state?: unknown };
  if (p?.app !== "cet4-vocab" || !p.state || typeof p.state !== "object") throw new Error("这不是四级单词打卡的备份文件");
  const sv = (p.state as { v?: unknown }).v;
  if ((typeof p.version === "number" && p.version > BACKUP_VERSION) || (typeof sv === "number" && sv > STATE_VERSION)) throw new Error(NEWER_MSG);
  return normalize(p.state, has, rep);
}

export function importBackup(text: string): AppState {
  const next = parseBackup(text);
  commit({ ...next, onboarded: true });
  return next;
}

/** v11 · 整体替换当前档案的状态（合并导入、快照回滚、数据体检修复） */
export function replaceState(next: AppState) {
  commit(next);
}

export function resetAll() {
  commit(initialState());
}
