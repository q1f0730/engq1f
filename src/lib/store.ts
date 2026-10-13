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
}

/** v10 · 记忆保持目标（这里自带一份，不让首屏引入整个 algo.ts） */
export const cleanRetention = (r: unknown): number => (r === 85 || r === 95 ? r : 90);

export const DAILY_OPTIONS = [10, 20, 30, 50, 80, 100];
export const REVIEW_CAP_OPTIONS = [0, 50, 100, 200];
export const RATE_OPTIONS = [0.75, 1, 1.25];
export const REPEAT_OPTIONS = [1, 2, 3];
/** 磁带模式定时停止（分钟），0 = 不定时 */
export const SLEEP_OPTIONS = [0, 10, 20, 30];
const KEY = "cet4v-state-v1";
export const REV_KEY = "cet4v-revlog-v1";
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
  fuzz: false,
  balance: false,
  overdue: false,
  steps: false,
  fourKey: false,
  fitEase: false,
});

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
  return {
    ...s,
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

/** 校验并补全（导入备份/读取旧数据） */
export function normalize(raw: unknown): AppState {
  if (!raw || typeof raw !== "object") throw new Error("备份格式不对");
  const r = raw as Partial<AppState>;
  if (r.cards && typeof r.cards !== "object") throw new Error("备份格式不对");
  const base = initialState();
  return {
    ...base,
    ...r,
    v: 1,
    settings: cleanSettings({ ...base.settings, ...(r.settings ?? {}) }),
    cards: r.cards ?? {},
    star: r.star ?? {},
    log: r.log ?? {},
    checkins: Array.isArray(r.checkins) ? r.checkins : [],
    bury: r.bury && typeof r.bury === "object" ? r.bury : {},
    quizzes: Array.isArray(r.quizzes) ? r.quizzes.filter((q) => q && typeof q.ok === "number" && typeof q.n === "number" && typeof q.at === "string") : [],
    lists: normalizeLists(r.lists),
    revlog: normalizeRevlog(r.revlog),
    badges: r.badges && typeof r.badges === "object" && !Array.isArray(r.badges) ? Object.fromEntries(Object.entries(r.badges).filter(([, v]) => typeof v === "string")) : {},
    weekSeen: typeof r.weekSeen === "string" ? r.weekSeen : undefined,
    makeup: typeof r.makeup === "number" && Number.isFinite(r.makeup) ? Math.max(0, Math.min(MAKEUP_MAX, Math.floor(r.makeup))) : 0,
    makeupEarned: typeof r.makeupEarned === "string" ? r.makeupEarned : undefined,
    patched: Array.isArray(r.patched) ? r.patched.filter((d) => typeof d === "string") : [],
    installed: r.installed === true ? true : undefined,
    installSnooze: typeof r.installSnooze === "string" ? r.installSnooze : undefined,
    seed: typeof r.seed === "number" ? r.seed : base.seed,
    gameBest: cleanBest(r.gameBest),
    newCut:
      r.newCut && typeof r.newCut === "object" && typeof r.newCut.d === "string" && Number.isInteger(r.newCut.n) && r.newCut.n >= 0 ? { d: r.newCut.d, n: r.newCut.n } : undefined,
    newCutSeen: typeof r.newCutSeen === "string" ? r.newCutSeen : undefined,
  };
}

function cleanBest(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v >= 0));
}

function read(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const st = normalize(JSON.parse(raw));
      // 复习日志单独存（主状态里带了就用主状态里的，例如刚导入）
      if (!st.revlog.length) {
        try {
          st.revlog = normalizeRevlog(JSON.parse(localStorage.getItem(REV_KEY) || "[]"));
        } catch {
          /* 日志损坏：丢掉日志，不影响学习记录 */
        }
      }
      return st;
    }
  } catch {
    /* 损坏的数据：从头开始 */
  }
  return initialState();
}

let state: AppState = read();
let savedRev: RevEntry[] | null = null;
const listeners = new Set<() => void>();

function persist() {
  try {
    // 日志可能上万条：只在变了的时候写它自己的 key
    if (state.revlog !== savedRev) {
      if (state.revlog.length) localStorage.setItem(REV_KEY, JSON.stringify(state.revlog));
      else localStorage.removeItem(REV_KEY);
      savedRev = state.revlog;
    }
    const { revlog: _omit, ...rest } = state;
    void _omit;
    localStorage.setItem(KEY, JSON.stringify(rest));
    localStorage.setItem(THEME_KEY, state.settings.theme);
  } catch {
    /* 存储已满 */
  }
}

function commit(next: AppState) {
  state = next;
  persist();
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

export function saveTest(est: number) {
  commit({ ...state, test: { at: today(), est } });
}

export function exportBackup(): string {
  return JSON.stringify({ app: "cet4-vocab", version: 1, exportedAt: new Date().toISOString(), state }, null, 0);
}

export function importBackup(text: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON");
  }
  const p = parsed as { app?: string; state?: unknown };
  if (p?.app !== "cet4-vocab" || !p.state) throw new Error("这不是四级单词打卡的备份文件");
  const next = normalize(p.state);
  commit({ ...next, onboarded: true });
  return next;
}

export function resetAll() {
  commit(initialState());
}
