/**
 * 四级单词打卡 · 记忆算法（纯函数，无副作用）
 *
 * SM-2 变体（spec R3）：
 *  - 认识：间隔 × ease；首次见到就认识 → 2 天；学习中（间隔 0）认识 → 1 天
 *  - 模糊：间隔 × 1.2，ease −0.15；新词/学习中 → 当天重学
 *  - 不认识：间隔归零（当天重学），ease −0.2，lapses +1
 *  - 间隔 ≥ 21 天 → 已掌握；「斩」→ 永久掌握，不再出现
 *
 * 组内重学（spec R2）：模糊/不认识的词放回队列，直到拿到一次干净的「认识」。
 * 重学时的回答（repeat）不会再次放大间隔，也不重复计 lapse。
 */

export type Rating = "know" | "vague" | "forget";
export type CardState = "learning" | "review" | "mastered";
export type Mastery = "new" | "learning" | "mastered";

export interface Card {
  /** 状态 */
  st: CardState;
  /** ease 系数 */
  e: number;
  /** 间隔（天） */
  i: number;
  /** 成功回忆次数 */
  r: number;
  /** 遗忘次数 */
  l: number;
  /** 到期日 YYYY-MM-DD */
  d: string;
  /** 首次学习日 */
  f: string;
  /** 最近复习日 */
  t: string;
  /** 已斩（永久掌握） */
  k?: 1;
}

export const MASTER_DAYS = 21;
export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const FIRST_KNOWN_DAYS = 2;
export const NEVER = "9999-12-31";
export const RELEARN_GAP = 3;

// ---------------------------------------------------------------- dates

const pad = (n: number) => String(n).padStart(2, "0");

/** 本地日期 → YYYY-MM-DD */
export function dayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12); // 中午，避开夏令时边界
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** b − a（天） */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}

// ---------------------------------------------------------------- scheduling

const clampEase = (e: number) => Math.round(Math.min(MAX_EASE, Math.max(MIN_EASE, e)) * 100) / 100;

function stateFor(i: number, k?: 1): CardState {
  if (k || i >= MASTER_DAYS) return "mastered";
  return i === 0 ? "learning" : "review";
}

export function newCard(today: string): Card {
  return { st: "learning", e: DEFAULT_EASE, i: 0, r: 0, l: 0, d: today, f: today, t: today };
}

export interface ScheduleOptions {
  /** 组内重学的再次回答 */
  repeat?: boolean;
  /** 提前复习（还没到期就复习）：认识时按实际经过天数计算，且不短于原间隔 */
  early?: boolean;
}

/** 根据一次评分计算新的卡片状态 */
export function schedule(card: Card | undefined, rating: Rating, today: string, opts: ScheduleOptions = {}): Card {
  const isNew = !card;
  const base: Card = card ? { ...card } : newCard(today);

  // 已斩的词：认识/模糊保持斩；不认识 → 取消斩，回到学习
  if (base.k) {
    if (rating !== "forget") return { ...base, t: today };
    delete base.k;
    return { ...base, st: "learning", i: 0, d: today, t: today, l: base.l + 1, e: clampEase(base.e - 0.2) };
  }

  if (opts.repeat) {
    if (rating === "know") {
      const i = base.i > 0 ? base.i : 1;
      return { ...base, i, d: addDays(today, i), st: stateFor(i), t: today };
    }
    // 还没记住：保持当天到期，不重复扣分
    return { ...base, d: today, t: today, st: base.i === 0 ? "learning" : base.st };
  }

  let { e, i, r, l } = base;
  switch (rating) {
    case "know":
      if (isNew) i = FIRST_KNOWN_DAYS;
      else if (i === 0) i = 1;
      else if (opts.early) i = Math.max(i, Math.round(Math.max(1, diffDays(base.t, today)) * e));
      else i = Math.max(i + 1, Math.round(i * e));
      r += 1;
      break;
    case "vague":
      e = clampEase(e - 0.15);
      i = isNew || i === 0 ? 0 : Math.max(1, Math.round(i * 1.2));
      break;
    case "forget":
      e = clampEase(e - 0.2);
      i = 0;
      l += 1;
      break;
  }
  return { ...base, e, i, r, l, d: addDays(today, i), st: stateFor(i), t: today };
}

/** 斩：永久掌握 */
export function kill(card: Card | undefined, today: string): Card {
  const base = card ?? newCard(today);
  return { ...base, st: "mastered", k: 1, d: NEVER, t: today };
}

/** 取消斩 → 明天复习 */
export function unkill(card: Card, today: string): Card {
  const c: Card = { ...card };
  delete c.k;
  const i = Math.max(1, Math.min(c.i, MASTER_DAYS - 1));
  return { ...c, i, st: stateFor(i), d: addDays(today, 1) };
}

export function isDue(card: Card | undefined, today: string): boolean {
  return !!card && !card.k && card.d <= today;
}

export function masteryOf(card: Card | undefined): Mastery {
  if (!card) return "new";
  return card.st === "mastered" ? "mastered" : "learning";
}

/** 顽固词：遗忘次数达到这个数（Anki 的 leech） */
export const LEECH_LAPSES = 3;

export function isLeech(card: Card | undefined): boolean {
  return !!card && !card.k && card.l >= LEECH_LAPSES;
}

/** 间隔 → 按钮上的简短文案 */
export function intervalLabel(i: number): string {
  if (i <= 0) return "今天";
  if (i < 30) return `${i}天`;
  if (i < 365) return `${Math.round(i / 30)}个月`;
  return `${Math.round((i / 365) * 10) / 10}年`;
}

/** 三个评分各自的下次复习时间（与 schedule 完全一致） */
export function previewIntervals(
  card: Card | undefined,
  today: string,
  opts: ScheduleOptions = {},
): Record<Rating, string> {
  const out = {} as Record<Rating, string>;
  for (const r of ["know", "vague", "forget"] as Rating[]) {
    const c = schedule(card, r, today, opts);
    out[r] = c.k ? "已斩" : intervalLabel(diffDays(today, c.d));
  }
  return out;
}

/** 到期词（最早到期、间隔最短优先） */
export function dueWords(cards: Record<string, Card>, today: string): string[] {
  return Object.keys(cards)
    .filter((w) => isDue(cards[w], today))
    .sort((a, b) => (cards[a].d === cards[b].d ? cards[a].i - cards[b].i : cards[a].d < cards[b].d ? -1 : 1));
}

/** 未来 N 天每天到期数；第 0 天含逾期 */
export function forecast(cards: Record<string, Card>, today: string, days = 7): { day: string; count: number }[] {
  const out = Array.from({ length: days }, (_, k) => ({ day: addDays(today, k), count: 0 }));
  for (const c of Object.values(cards)) {
    if (c.k) continue;
    const k = Math.max(0, diffDays(today, c.d));
    if (k < days) out[k].count += 1;
  }
  return out;
}

export function masteryCounts(cards: Record<string, Card>, total: number) {
  let learning = 0;
  let mastered = 0;
  for (const c of Object.values(cards)) {
    if (c.st === "mastered") mastered++;
    else learning++;
  }
  return { new: Math.max(0, total - learning - mastered), learning, mastered };
}

// ---------------------------------------------------------------- daily log

export interface DayLog {
  /** 新学 */
  n: number;
  /** 复习 */
  r: number;
  /** 首答正确 */
  ok: number;
  /** 首答总数 */
  a: number;
  /** 用时 ms */
  ms: number;
}

export const emptyLog = (): DayLog => ({ n: 0, r: 0, ok: 0, a: 0, ms: 0 });

/** 一次「首答」写入日志（重学不计） */
export function logAnswer(log: DayLog | undefined, kind: "new" | "review", rating: Rating, ms = 0): DayLog {
  const l = { ...emptyLog(), ...log };
  if (kind === "new") l.n += 1;
  else l.r += 1;
  l.a += 1;
  if (rating === "know") l.ok += 1;
  l.ms += Math.max(0, Math.min(ms, 60000));
  return l;
}

// ---------------------------------------------------------------- check-in / streak

/** 连续打卡天数：截止今天（或昨天，今天还没打也不断） */
export function streak(checkins: string[], today: string): number {
  const set = new Set(checkins);
  let day = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function longestStreak(checkins: string[]): number {
  const days = [...new Set(checkins)].sort();
  let best = 0;
  let cur = 0;
  let prev = "";
  for (const d of days) {
    cur = prev && diffDays(prev, d) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

/** 今日能否打卡：新词达标（或词库已学完）且到期复习清零 */
export function canCheckIn(opts: { learnedToday: number; goal: number; newLeft: number; due: number }): boolean {
  const newDone = opts.learnedToday >= opts.goal || opts.newLeft === 0;
  return newDone && opts.due === 0;
}

/** 预计学完日期 */
export function finishDate(today: string, remaining: number, perDay: number): string {
  if (remaining <= 0) return today;
  return addDays(today, Math.ceil(remaining / Math.max(1, perDay)) - 1);
}

// ---------------------------------------------------------------- session (group study)

export type QuizMode = "recall" | "en2cn" | "cn2en" | "audio" | "phrase" | "listen";

export interface SessionItem {
  w: string;
  kind: "new" | "review";
  mode: QuizMode;
  /** 组内重学 */
  repeat?: boolean;
  /** 提前复习 */
  early?: boolean;
}

interface HistoryEntry {
  queue: SessionItem[];
  done: string[];
  firsts: Record<string, Rating>;
  w: string;
  prev: Card | undefined;
  prevLog: DayLog | undefined;
}

export interface Session {
  queue: SessionItem[];
  done: string[];
  /** 每个词的首答 */
  firsts: Record<string, Rating>;
  history: HistoryEntry[];
  total: number;
}

export function createSession(items: SessionItem[]): Session {
  return { queue: items.slice(), done: [], firsts: {}, history: [], total: items.length };
}

export const current = (s: Session): SessionItem | undefined => s.queue[0];
export const isFinished = (s: Session) => s.queue.length === 0;
export const progress = (s: Session) => (s.total ? s.done.length / s.total : 1);

export interface AnswerResult {
  session: Session;
  card: Card;
  log: DayLog;
}

/** 回答当前词：更新卡片、日志与队列（模糊/不认识 → 放回 RELEARN_GAP 位之后） */
export function answer(
  s: Session,
  prev: Card | undefined,
  rating: Rating,
  today: string,
  log: DayLog | undefined,
  ms = 0,
): AnswerResult {
  const item = s.queue[0];
  if (!item) throw new Error("session finished");
  const first = !(item.w in s.firsts);
  const card = schedule(prev, rating, today, { repeat: !first, early: item.early });
  const nextLog = first ? logAnswer(log, item.kind, rating, ms) : { ...emptyLog(), ...log, ms: (log?.ms ?? 0) + Math.min(ms, 60000) };
  const rest = s.queue.slice(1);
  let queue = rest;
  let done = s.done;
  if (rating === "know") {
    done = [...s.done, item.w];
  } else {
    const again: SessionItem = { ...item, repeat: true, mode: "recall" };
    const at = Math.min(RELEARN_GAP, rest.length);
    queue = [...rest.slice(0, at), again, ...rest.slice(at)];
  }
  const firsts = first ? { ...s.firsts, [item.w]: rating } : s.firsts;
  const entry: HistoryEntry = { queue: s.queue, done: s.done, firsts: s.firsts, w: item.w, prev, prevLog: log };
  return { session: { ...s, queue, done, firsts, history: [...s.history, entry] }, card, log: nextLog };
}

/** 斩当前词：直接完成并移出队列（含之后的重学项） */
export function killCurrent(s: Session, prev: Card | undefined, today: string, log: DayLog | undefined): AnswerResult {
  const item = s.queue[0];
  if (!item) throw new Error("session finished");
  const first = !(item.w in s.firsts);
  const card = kill(prev, today);
  const nextLog = first ? logAnswer(log, item.kind, "know") : { ...emptyLog(), ...log };
  const queue = s.queue.slice(1).filter((q) => q.w !== item.w);
  const entry: HistoryEntry = { queue: s.queue, done: s.done, firsts: s.firsts, w: item.w, prev, prevLog: log };
  return {
    session: {
      ...s,
      queue,
      done: [...s.done, item.w],
      firsts: first ? { ...s.firsts, [item.w]: "know" } : s.firsts,
      history: [...s.history, entry],
    },
    card,
    log: nextLog,
  };
}

/** 明天再说：当前词移出本组（含重学项），不计对错；已有卡片推到明天，新词由调用方记到搁置表 */
export function buryCurrent(s: Session, prev: Card | undefined, today: string, log: DayLog | undefined): { session: Session; card: Card | undefined } {
  const item = s.queue[0];
  if (!item) throw new Error("session finished");
  const card = prev ? { ...prev, d: addDays(today, 1) } : undefined;
  const queue = s.queue.slice(1).filter((q) => q.w !== item.w);
  const entry: HistoryEntry = { queue: s.queue, done: s.done, firsts: s.firsts, w: item.w, prev, prevLog: log };
  return {
    session: { ...s, queue, done: [...s.done, item.w], history: [...s.history, entry] },
    card,
  };
}

export interface UndoResult {
  session: Session;
  w: string;
  card: Card | undefined;
  log: DayLog | undefined;
}

/** 撤销上一步：恢复队列、卡片和日志 */
export function undo(s: Session): UndoResult | null {
  const last = s.history[s.history.length - 1];
  if (!last) return null;
  return {
    session: { ...s, queue: last.queue, done: last.done, firsts: last.firsts, history: s.history.slice(0, -1) },
    w: last.w,
    card: last.prev,
    log: last.prevLog,
  };
}

/** 本组正确率（首答） */
export function sessionAccuracy(s: Session): number {
  const vals = Object.values(s.firsts);
  return vals.length ? vals.filter((r) => r === "know").length / vals.length : 0;
}

// ---------------------------------------------------------------- helpers

/** 可复现的伪随机（mulberry32） */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 复习题型：按词+日期稳定分配；有短语的词多一种「短语选义」，有形近词的词多一种「听音辨词」 */
export function pickMode(w: string, today: string, cnFirst = false, hasPhrase = false, hasListen = false): QuizMode {
  const modes: QuizMode[] = ["en2cn", "cn2en", "audio", "recall"];
  if (hasPhrase) modes.push("phrase");
  if (hasListen) modes.push("listen");
  const m = modes[hashStr(w + today) % modes.length];
  return cnFirst && m === "recall" ? "cn2en" : m;
}
