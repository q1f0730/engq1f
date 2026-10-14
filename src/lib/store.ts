import { useSyncExternalStore } from "react";
import { applyPreviewKill } from "./learnflow";
import { kill, unkill, type Card, type DayLog, type QuizMode } from "./srs";
import { cleanOffModes } from "./modes";
import { today } from "./clock";
import { toast } from "./toast";
import { celebrate } from "./celebrate";
import type { QuizRecord } from "./exam";
import { LIST_MAX, addWords, cleanListName, normalizeLists, removeWords, type WordList } from "./lists";
import { appendRev, normalizeRevlog, popRev, type RevEntry } from "./stats";
import { MAKEUP_MAX, TIME_GOALS, applyCheckIn, applyPatch, autoCredit, examDayOn, examGapClash, examTaken, harvestExamDays, postponedOn, parseHM, type CheckInResult, type DayRule, type GoalMode, type PatchResult } from "./habit";
import { passedExam } from "./examdate";
import type { ShareTpl } from "./share";
import { setBasicMode } from "./data";
import { LEVELS, type Level } from "./level";
import { cleanFontSize, cleanMotion, motionReduced, type FontSize, type Motion } from "./ux";
import { ACTIVE_PROFILE, revKeyOf, stateKeyOf } from "./profiles";
import { isRawDump, unwrapRaw } from "./salvage";
import { cleanCards, cleanDayMap, cleanDays, cleanFlags, cleanLog, emptyReport, isDay, optDay, type CleanReport } from "./validate";

export type { CleanReport };
export type Book = "all" | "core";
/** 13.0 · 新词一律乱序：core = 核心词在前（各自乱序），random = 全部乱序。旧存档的 alpha 读成 core */
export type Order = "core" | "random";
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
  /** 13.0 · 包含基础词（小学 / 初中就学过的词，默认不学） */
  basic: boolean;
  /** 13.0 · 每天新词难度：不问的时候用它；问的时候是默认选中的那一项 */
  level: Level;
  /** 13.0 · 每天第一次学新词时问「今天想学什么难度？」 */
  levelAsk: boolean;
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
  recover?: { from: string; until: string; n: number; perDay?: number; spread?: string; shifted?: number; mix?: number; asked?: boolean };
  /** 11.1 · 欢迎回来卡片关掉的那天 */
  recoverSeen?: string;
  /** 11.2 · 冲刺卡今天处理过（应用 / 关掉）：当天不再出现 */
  sprintSeen?: string;
  /** 11.2 · 「每天 100 个也学不完」的信息卡关掉了：这一场考试（值 = 考试日）不再出现 */
  sprintOff?: string;
  /** 11.2 · 已经确认过「考完了」的那一场 */
  examDone?: string;
  /** 11.2 · 考完选了「先休息」：不排考试计划，直到重新选考试日期 */
  examPause?: boolean;
  /** 11.3 · 记下「任务完成」的日子（最近 14 天）：过了 0 点 / 没点打卡也照样算打卡 */
  goalMet?: string[];
  /** 11.3 · 考后「先休息」：from 起不排新词、复习只留维持量、不算断签；until = 结束休息的那天 */
  pause?: { from: string; until?: string };
  /** 11.4 · 每天的任务快照（当天第一次打开 / 第一次作答时按当天的设置记下，最近 21 天）：自动补记只按它判断 */
  dayRule?: Record<string, DayRule>;
  /** 11.5 · 记下来的考试日（考试日过去、或者考完改了日期时写进来）：改考试日期不影响已经过去的日子 */
  examDays?: string[];
  /** 11.4 · 用户在引导 / 设置里知情选了「考后才学完」的量：这一天起 7 天内不弹冲刺卡 */
  paceOk?: string;
  /** 11.4 · 冲刺卡点了「知道了」：这天之前不再出现 */
  sprintSnooze?: string;
  /** 11.2 · 整份替换（清空 / 覆盖导入 / 回滚）时换一个新值：别的窗口据此知道「记录被整份换掉了」，不再往上合并 */
  epoch?: string;
  /** 13.0 · 今天选的新词难度（每天第一次学新词时问） */
  levelDay?: { d: string; lv: Level };
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
  basic: false,
  level: "mix",
  levelAsk: true,
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
    order: s.order === "random" ? "random" : "core",
    basic: s.basic === true,
    level: LEVELS.includes(s.level) ? s.level : d.level,
    levelAsk: typeof s.levelAsk === "boolean" ? s.levelAsk : d.levelAsk,
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
        ? {
            from: r.recover.from,
            until: r.recover.until,
            n: r.recover.n,
            ...(Number.isInteger(r.recover.perDay) && (r.recover.perDay as number) > 0 ? { perDay: r.recover.perDay } : {}),
            ...(isDay(r.recover.spread) ? { spread: r.recover.spread } : {}),
            ...(Number.isInteger(r.recover.shifted) && (r.recover.shifted as number) > 0 ? { shifted: r.recover.shifted } : {}),
            ...(Number.isInteger(r.recover.mix) && (r.recover.mix as number) > 0 ? { mix: r.recover.mix } : {}),
            ...(r.recover.asked === true ? { asked: true } : {}),
          }
        : undefined,
    recoverSeen: optDay(r.recoverSeen),
    sprintSeen: optDay(r.sprintSeen),
    sprintOff: optDay(r.sprintOff),
    examDone: optDay(r.examDone),
    examPause: r.examPause === true ? true : undefined,
    goalMet: Array.isArray(r.goalMet) ? r.goalMet.filter(isDay).slice(-14) : undefined,
    pause: r.pause && typeof r.pause === "object" && isDay(r.pause.from) ? { from: r.pause.from, ...(isDay(r.pause.until) ? { until: r.pause.until } : {}) } : undefined,
    dayRule: cleanDayRules(r.dayRule),
    examDays: cleanExamDays(r.examDays),
    paceOk: optDay(r.paceOk),
    sprintSnooze: optDay(r.sprintSnooze),
    epoch: str(r.epoch),
    levelDay: r.levelDay && typeof r.levelDay === "object" && isDay(r.levelDay.d) && LEVELS.includes(r.levelDay.lv) ? { d: r.levelDay.d, lv: r.levelDay.lv } : undefined,
  };
}

/** 11.5 · 记下来的考试日：日期列表，去重排序，最多 12 个 */
function cleanExamDays(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = [...new Set(raw.filter((d): d is string => isDay(d)))].sort().slice(-12);
  return list.length ? list : undefined;
}

/** 11.4 · 每天的任务快照：日期 → { g, r, t?, x?, p? }，只留格式对的、最近 21 天 */
export const DAY_RULE_KEEP = 21;
function cleanDayRules(raw: unknown): Record<string, DayRule> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const nat = (x: unknown) => typeof x === "number" && Number.isInteger(x) && x >= 0;
  const out: Record<string, DayRule> = {};
  for (const [d, v] of Object.entries(raw as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-DAY_RULE_KEEP)) {
    const o = v as Record<string, unknown> | null;
    if (!isDay(d) || !o || typeof o !== "object" || !nat(o.g) || !nat(o.r)) continue;
    out[d] = {
      g: o.g as number,
      r: o.r as number,
      ...(nat(o.t) && (o.t as number) > 0 ? { t: o.t as number } : {}),
      ...(o.x === 1 || o.x === 2 ? { x: o.x } : {}),
      ...(o.p === 1 ? { p: 1 as const } : {}),
      ...(isDay(o.e) ? { e: o.e as string } : {}),
    };
  }
  return Object.keys(out).length ? out : undefined;
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
setBasicMode(!!state.settings.basic);
let savedRev: RevEntry[] | null = null;
const listeners = new Set<() => void>();
export type ExternalWhy = "sync" | "merge" | "replace";
const external = new Set<(why: ExternalWhy) => void>();

/** 别的窗口改了记录（已同步 / 已合并）时通知界面 */
export function onExternalChange(fn: (why: ExternalWhy) => void) {
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
    } else if (k === "log") {
      out.log = mergeLog(prev, next, other);
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

/**
 * 11.2 · 日志按差值合并：本窗口这一步加了多少就在对方的数上加多少（不再整条覆盖丢掉对方的计数）；
 * 同一个新词在两个窗口都学了（两边都新建了这张卡）只算一次。
 */
function mergeLog(prev: AppState, next: AppState, other: AppState): AppState["log"] {
  const out = { ...other.log };
  const F = ["n", "r", "ok", "a", "ms"] as const;
  for (const day of Object.keys(next.log)) {
    const a = prev.log[day];
    const b = next.log[day];
    if (a === b) continue;
    const base = other.log[day] ?? { n: 0, r: 0, ok: 0, a: 0, ms: 0 };
    const row = { ...base };
    for (const f of F) row[f] = Math.max(0, base[f] + (b[f] ?? 0) - (a?.[f] ?? 0));
    // 两个窗口都把同一个词学成了新词：只算一次
    let dup = 0;
    for (const w of Object.keys(next.cards)) if (!prev.cards[w] && next.cards[w]?.f === day && other.cards[w] && !prev.cards[w] && other.cards[w].f === day) dup++;
    if (dup) {
      row.n = Math.max(0, row.n - dup);
      row.a = Math.max(0, row.a - dup);
      row.ok = Math.min(row.ok, row.a);
    }
    out[day] = row;
  }
  return out;
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
    let replaced = false;
    if (cur !== null && lastRaw !== null && cur !== lastRaw) {
      // 别的窗口在我们上次同步之后写过：先合并，再写（谁最后写谁赢会丢数据）
      try {
        const other = fromRaw(cur);
        if ((other.epoch ?? "") !== (prev.epoch ?? "") && state.epoch === prev.epoch) {
          // 11.2 · 对方把记录整份换掉了（清空 / 覆盖导入 / 回滚）：不往上合并本窗口这一步，直接用对方的
          state = other;
          lastRaw = cur;
          savedRev = null;
          replaced = true;
        } else {
          state = rebase(prev, state, other);
          merged = true;
        }
      } catch {
        /* 对方写的读不出来：保留本窗口 */
      }
    }
    if (replaced) {
      external.forEach((f) => f("replace"));
      return;
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
  const replaced = (next.epoch ?? "") !== (state.epoch ?? "");
  state = next;
  savedRev = null;
  applyTheme(state.settings.theme);
  applyLook(state.settings);
  listeners.forEach((l) => l());
  external.forEach((f) => f(replaced ? "replace" : "sync"));
  return true;
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) syncFromStorage();
  });
  if (bc) bc.onmessage = (e) => (e.data as { key?: string })?.key === KEY && syncFromStorage();
}

/**
 * 11.5 · 今天的规则从哪来（需要词库，由 __root 注册 plan.summarize）：返回今天的快照、今天按现在的设置算不算完成、打没打卡。
 * 词库还没加载时返回 null。
 */
type RuleSource = (st: AppState, day: string) => { rule: DayRule; ready: boolean; checked: boolean } | null;
let ruleSource: RuleSource | null = null;
export function setDayRuleSource(fn: RuleSource | null) {
  ruleSource = fn;
}

/** 11.5 · 影响「今天的任务是什么」的状态变了吗（设置、自适应减量、恢复期、休息、考完） */
const ruleInputsChanged = (a: AppState, b: AppState) =>
  a.settings !== b.settings || a.newCut !== b.newCut || a.recover !== b.recover || a.examPause !== b.examPause || a.pause !== b.pause || a.examDone !== b.examDone;

/**
 * 11.5 · 当天中途改了设置：**覆盖**今天的快照（只改今天，过去的日子不动），快照 = 当天最后生效的规则；
 * 「任务完成」也按改完的规则重算（没打卡时：达标就记、不达标就撤）——今天卡片上的说法和明天的自动补记永远一致。
 * 例外：考前 / 考试当天的「不打卡」标记（x）只认当天第一份快照里就有的，当天才改出来的不算（不能临时把今天变成免打卡）。
 */
function withTodayRule(prev: AppState, next: AppState): AppState {
  if (!next.onboarded || !ruleInputsChanged(prev, next)) return next;
  const d = today();
  const src = ruleSource?.(next, d) ?? null;
  const old = next.dayRule?.[d];
  const checked = next.checkins.includes(d);
  // 11.6 · 今天的任务已经完成过（记了 goalMet，或按改之前的规则已经达标）：完成在那一刻就冻结，之后调高任务不收回
  const doneBefore = !checked && prev.onboarded && (prev.epoch ?? "") === (next.epoch ?? "") && (!!prev.goalMet?.includes(d) || !!ruleSource?.(prev, d)?.ready);
  if (!src) {
    // 词库还没加载：先把今天的快照作废，回到首页时按改完的设置重新记；「任务完成」没完成过才撤
    if (!old && !next.goalMet?.includes(d) && !doneBefore) return next;
    const rules = { ...(next.dayRule ?? {}) };
    delete rules[d];
    const base = { ...next, dayRule: Object.keys(rules).length ? rules : undefined };
    if (doneBefore) return freezeDone(base, d);
    return { ...base, goalMet: checked ? next.goalMet : next.goalMet?.filter((x) => x !== d) };
  }
  const rule: DayRule = { ...src.rule };
  if (old && !(old.x && rule.x)) delete rule.x;
  else if (old?.x && rule.x) rule.x = old.x;
  const all = { ...(next.dayRule ?? {}), [d]: rule };
  const keep = Object.keys(all).sort().slice(-DAY_RULE_KEEP);
  let goalMet = next.goalMet;
  const out = { ...next, dayRule: Object.fromEntries(keep.map((k) => [k, all[k]])) };
  if (!src.checked) {
    const has = !!goalMet?.includes(d);
    if (src.ready && !has) goalMet = [...(goalMet ?? []), d].sort().slice(-14);
    else if (!src.ready && doneBefore) return freezeDone({ ...out, goalMet }, d);
    else if (!src.ready && has) goalMet = goalMet!.filter((x) => x !== d);
  }
  return { ...out, goalMet };
}

/**
 * 11.6 · 今天已经完成、改动又把今天的任务调高了：先替用户打上今天的卡（goalMet 也留着），新目标从明天开始算，
 * 今天多学的算额外的。今天的卡片（已打卡）和明天的补记（已经打过、不用补）还是同一个说法。
 */
function freezeDone(st: AppState, d: string): AppState {
  const r = applyCheckIn(st, d);
  const goalMet = st.goalMet?.includes(d) ? st.goalMet : [...(st.goalMet ?? []), d].sort().slice(-14);
  lastFreeze = { day: d, streak: r.streak, milestone: r.milestone };
  const n = r.streak;
  const ms = r.milestone;
  // 11.7 · 替用户打卡正好跨过 7 / 30 / 100 天：和手动打卡一样全屏庆祝（r7 R7-3），toast 照常说明今天已打卡
  const say = () => {
    toast.success(`今天的任务已完成，已帮你打卡${n > 0 ? ` · 连续 ${n} 天` : ""}`, { id: "freeze-done", description: "新目标从明天开始算，今天再学的算额外的" });
    celebrate(ms);
  };
  if (typeof queueMicrotask === "function") queueMicrotask(say);
  else say();
  return { ...st, checkins: r.checkins, makeup: r.makeup, makeupEarned: r.makeupEarned, goalMet };
}
/** 11.6 · 最近一次「已完成 → 调高任务 → 替用户打卡」（测试 / 界面读） */
let lastFreeze: { day: string; streak: number; milestone: number | null } | null = null;
export const takeFreeze = () => {
  const f = lastFreeze;
  lastFreeze = null;
  return f;
};

function commit(next: AppState) {
  const prev = state;
  next = withTodayRule(prev, next);
  if (next.dayRule !== prev.dayRule) {
    const ed = harvestExamDays(next.dayRule, next.examDays, today());
    if (ed !== next.examDays) next = { ...next, examDays: ed };
  }
  state = next;
  persist(prev);
  setBasicMode(!!state.settings.basic);
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", hc ? "#ffffff" : r === "dark" ? "#14171e" : "#f7f3ea");
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

/** 11.5 · 这段时间里用过 app 吗（考完了那张卡判断「是不是在备考这一场」） */
export const examActiveIn = (st: Pick<AppState, "log" | "checkins">) => (from: string, to: string) =>
  Object.entries(st.log).some(([d, l]) => d >= from && d <= to && !!l && l.n + l.r + l.a > 0) || st.checkins.some((d) => d >= from && d <= to);

const addExamDay = (list: string[] | undefined, d: string) => [...new Set([...(list ?? []), d])].sort().slice(-12);

export function setSettings(patch: Partial<Settings>) {
  let extra: Partial<AppState> = {};
  if ("examDate" in patch && patch.examDate !== state.settings.examDate) {
    const d = today();
    // 11.2 · 重新选了考试日期 = 结束「先休息」
    extra = { examPause: undefined, ...(state.pause && !state.pause.until ? { pause: { ...state.pause, until: d } } : {}) };
    // 11.5 · 考完还没选、直接在「我的」改了日期 = 选了「备考下一场」：刚考完的那一场记下来（不算断签、不再问、不冒出另一场）
    const over = passedExam(d, state.settings.examDate, state.examDone, examActiveIn(state), (x) => examTaken(state, x));
    if (over) extra = { ...extra, examDone: over.day, examDays: addExamDay(state.examDays, over.day), sprintSeen: d };
  }
  const was = state.settings.examDate;
  commit({ ...state, ...extra, settings: { ...state.settings, ...patch } });
  if ("examDate" in patch && patch.examDate !== was) examDateNotice(was);
}

/**
 * 11.8 · 改考试日期后的提示（r8 R8-4）：考试当天临时推迟 = 这一场不算考过，连续天数保留；
 * 新日期离上一场算数的考试不到 30 天 = 不算新的一场，提前说清楚「照常学一组才能打卡」，不让火苗悄悄断掉。
 */
function examDateNotice(was: string | undefined) {
  const d = today();
  const nd = state.settings.examDate;
  if (!nd || nd <= d) return;
  const md = (x: string) => `${Number(x.slice(5, 7))}月${Number(x.slice(8, 10))}日`;
  const clash = examGapClash(state, nd);
  const say = () => {
    if (clash) toast.warning(`离上次考试（${md(clash)}）不到 30 天`, { id: "exam-gap", description: `${md(nd)} 不算新的一场：考前一天和当天照常学一组就能打卡，不然连续天数会断` });
    else if (examDayOn(state, d) && (was || "") !== nd && postponedOn(state.dayRule, d)) toast.success(`考试推迟到 ${md(nd)}`, { id: "exam-moved", description: "今天这场不算考过，连续天数保留；新日期的考前一天和当天照样不用打卡" });
  };
  if (typeof queueMicrotask === "function") queueMicrotask(say);
  else say();
}

/** extra：引导里已经看过的计划提示（当天不再弹冲刺卡等） */
export function completeOnboarding(patch: Partial<Settings>, extra: Partial<Pick<AppState, "sprintSeen" | "sprintOff" | "paceOk">> = {}) {
  commit({ ...state, ...extra, onboarded: true, settings: { ...state.settings, ...patch } });
}

/** 一次回答：卡片 + 当日日志；rev = 追加一条复习日志，"pop" = 撤销这个词最后一条 */
export function applyAnswer(w: string, card: Card | undefined, day: string, log: DayLog | undefined, rev?: RevEntry | "pop") {
  // 11.2 · 两个窗口同时学到同一个新词：这个窗口以为是新词（新学 +1），但卡片已经由另一个窗口建好了 → 不再重复计数
  const before = state.log[day];
  if (log && card && state.cards[w] && state.cards[w].f === day && log.n > (before?.n ?? 0)) {
    const dn = log.n - (before?.n ?? 0);
    log = { ...log, n: log.n - dn, a: Math.max(before?.a ?? 0, log.a - dn), ok: Math.min(log.ok, Math.max(before?.ok ?? 0, log.ok - dn)) };
  }
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

/** 11.3 · 记下「这一天的任务完成了」（之后没点打卡、过了 0 点也照样算打卡） */
export function markGoalMet(day: string) {
  if (state.goalMet?.includes(day)) return;
  commit({ ...state, goalMet: [...(state.goalMet ?? []), day].sort().slice(-14) });
}

/** 11.4 · 记下这一天的任务快照（只记第一次：之后改设置不改旧日子的标准） */
export function snapDayRule(day: string, rule: DayRule) {
  if (state.dayRule?.[day]) return;
  const all = { ...(state.dayRule ?? {}), [day]: rule };
  const keep = Object.keys(all).sort().slice(-DAY_RULE_KEEP);
  commit({ ...state, dayRule: Object.fromEntries(keep.map((d) => [d, all[d]])) });
}

/** 11.4 · 用户知情选了「考后才学完」的量（引导 / 我的）：冲刺卡先别劝 */
export function markPaceOk(day: string | undefined) {
  commit({ ...state, paceOk: day });
}

/** 11.3 · 打开时补记最近几天达标却没打卡的日子；返回补上的日子（没有就是空数组） */
export function creditMissed(day: string): { days: string[]; streak: number } {
  const r = autoCredit(state, day);
  if (!r) return { days: [], streak: 0 };
  commit({ ...state, checkins: r.checkins, makeup: r.makeup, makeupEarned: r.makeupEarned });
  return { days: r.days, streak: r.streak };
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
export function startRecover(cards: Record<string, Card>, from: string, until: string, n: number, perDay?: number) {
  commit({ ...state, cards, recover: { from, until, n, ...(perDay ? { perDay } : {}), spread: from }, recoverSeen: from });
}

export function endRecover() {
  commit({ ...state, recover: undefined });
}

/** 11.2 · 恢复期里漏了一天：剩下的积压从今天起按额度重新摊开、顺延结束日（cards / until 由 coach.recoverTick 算好） */
export function respreadRecover(cards: Record<string, Card>, until: string, n: number, shifted: number, day: string) {
  if (!state.recover) return;
  commit({ ...state, cards, recover: { ...state.recover, until, n, spread: day, shifted } });
}

/** 11.2 · 冲刺卡：今天处理过（应用 / 关掉）就不再出现；off = 这一场考试都不再出现 */
export function dismissSprint(day: string, offExam?: string, snoozeUntil?: string) {
  commit({ ...state, sprintSeen: day, ...(offExam ? { sprintOff: offExam } : {}), ...(snoozeUntil ? { sprintSnooze: snoozeUntil } : {}) });
}

/**
 * 11.2 · 考完了：next = 备考下一场（examDate 清空 = 自动下一场；plan = 按新日期重新推荐的词书和每日新词）；
 * 11.3 · rest = 真的休息：不排新词、复习只留维持量、休息期间不算断签（pause）
 */
export function ackExam(passed: string, choice: "next" | "rest", day = today(), plan?: { book: Book; daily: number }, paceOk?: boolean) {
  commit({
    ...state,
    examDone: passed,
    examDays: addExamDay(state.examDays, passed),
    // 11.5 · 「保持现在的」而且要考后才学完：知情选择，7 天内不说「赶不上」
    ...(paceOk ? { paceOk: day } : {}),
    examPause: choice === "rest" ? true : undefined,
    pause: choice === "rest" ? { from: day } : state.pause,
    sprintSeen: choice === "next" ? day : state.sprintSeen,
    settings: { ...state.settings, examDate: "", ...(plan ? { book: plan.book, daily: plan.daily } : {}) },
  });
}

/**
 * 11.3 · 结束休息：休息期间攒下的复习从今天起按天摊开（cards / until 由调用方算好；没有积压就不摊），
 * 休息那几天照样不算断签（pause.until = 今天）。
 */
export function endPause(day: string, spread?: { cards: Record<string, Card>; until: string; n: number; perDay: number }) {
  const pause = state.pause ? { from: state.pause.from, until: day } : undefined;
  commit({
    ...state,
    examPause: undefined,
    pause,
    sprintSeen: day,
    ...(spread ? { cards: spread.cards, recover: { from: day, until: spread.until, n: spread.n, perDay: spread.perDay, spread: day }, recoverSeen: day } : {}),
  });
}

/** 11.3 · 恢复期和考试撞了：mix = 边复习边每天学几个新词；0 = 先清积压（只问一次） */
export function chooseRecoverMix(mix: number) {
  if (!state.recover) return;
  const { mix: _old, ...rest } = state.recover;
  void _old;
  commit({ ...state, recover: { ...rest, ...(mix > 0 ? { mix } : {}), asked: true } });
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

/**
 * 导出整份记录。asBackup = 用户导出的备份文件 / 复制（11.4 · 文件里写上备份日期，从它恢复后不再说「还没备份过」）；
 * 自动快照不算备份。
 */
export function exportBackup(asBackup = false): string {
  if (!asBackup) return JSON.stringify({ app: "cet4-vocab", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), state }, null, 0);
  const d = today();
  return JSON.stringify({ app: "cet4-vocab", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), backupDay: d, state: { ...state, lastBackup: d } }, null, 0);
}

export const NEWER_MSG = "这份备份来自更新的版本，请先更新 app 再导入";
export const RAW_DEAD_MSG = "这份原始数据坏得太厉害，一个单词记录都没救出来";

/** 解析明文备份（不提交）：文件 / 剪贴板 / 快照共用。has 给了就丢掉词库里没有的词；rep 收集丢掉 / 修正的条数 */
export function parseBackup(text: string, has?: (w: string) => boolean, rep: CleanReport = emptyReport()): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON");
  }
  let p = parsed as { app?: string; version?: unknown; state?: unknown; salvaged?: unknown; backupDay?: unknown };
  // 11.3 · 救援页导出的原始数据：能读就读，坏了就逐条抢救
  if (isRawDump(p)) {
    const u = unwrapRaw(p.raw);
    if (!u) throw new Error(RAW_DEAD_MSG);
    p = { app: p.app, version: BACKUP_VERSION, state: u.state, salvaged: u.salvaged };
  }
  if (p?.app !== "cet4-vocab" || !p.state || typeof p.state !== "object") throw new Error("这不是四级单词打卡的备份文件");
  if (typeof p.salvaged === "number") rep.salvaged = p.salvaged;
  const sv = (p.state as { v?: unknown }).v;
  if ((typeof p.version === "number" && p.version > BACKUP_VERSION) || (typeof sv === "number" && sv > STATE_VERSION)) throw new Error(NEWER_MSG);
  const next = normalize(p.state, has, rep);
  // 11.4 · 用户导出的备份：恢复后按这份备份的日期算「上次备份」
  if (isDay(p.backupDay) && (!next.lastBackup || next.lastBackup < (p.backupDay as string))) next.lastBackup = p.backupDay as string;
  // 11.5 · 日期在未来（手机时间被调过）：按今天算
  if (next.lastBackup && next.lastBackup > today()) next.lastBackup = today();
  return next;
}

const newEpoch = () => Math.random().toString(36).slice(2, 10);

export function importBackup(text: string): AppState {
  const next = parseBackup(text);
  commit({ ...next, onboarded: true, epoch: newEpoch() });
  return next;
}

/** v11 · 整体替换当前档案的状态（合并导入、快照回滚、数据体检修复） */
export function replaceState(next: AppState) {
  commit({ ...next, epoch: newEpoch() });
}

export function resetAll() {
  commit({ ...initialState(), epoch: newEpoch() });
}

// ---------------------------------------------------------------- 13.0 · 每日新词难度

/** 关掉提示（点「先跳过」）只在这次打开里不再问；e2e 的旧用例也靠它跳过 */
export const LEVEL_SKIP_KEY = "cet4v-level-skip";

/** 今天用哪一档：今天选过 → 选的那档；没选 → 设置里的默认档 */
export function todayLevel(st: Pick<AppState, "levelDay" | "settings">, day: string): Level {
  return st.levelDay?.d === day ? st.levelDay.lv : st.settings.level ?? "mix";
}

/** 今天第一次学新词要不要先问难度 */
export function needLevelAsk(st: Pick<AppState, "levelDay" | "settings">, day: string): boolean {
  if (st.settings.levelAsk === false || st.levelDay?.d === day) return false;
  try {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(LEVEL_SKIP_KEY)) return false;
  } catch {
    /* ignore */
  }
  return true;
}

/** 选了今天的难度；always = 「不再每天询问」：以后都用这一档（「我的」里能改回来） */
export function chooseLevel(lv: Level, day = today(), always = false) {
  commit({
    ...state,
    levelDay: { d: day, lv },
    settings: always ? { ...state.settings, level: lv, levelAsk: false } : state.settings,
  });
}

/** 先跳过：今天按默认档，这次打开不再问 */
export function skipLevelAsk() {
  try {
    sessionStorage.setItem(LEVEL_SKIP_KEY, "1");
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- 13.0 · 云同步

/** 云端合并后的状态写回本机：不换 epoch（别的窗口照常合并，不会被当成「整份替换」） */
export function applyMerged(next: AppState) {
  commit(next);
}

/** 记录有变化时通知（云同步的增量上传用） */
export function subscribeState(fn: () => void) {
  return subscribe(fn);
}
