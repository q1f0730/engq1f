/**
 * v6 · 统计与复盘（纯函数）
 *
 * 复习日志 revlog：每次作答一条，元组省空间
 *   [单词, 时间（epoch 秒）, 评分 0 不认识 / 1 模糊 / 2 认识 / 3 斩, 标记 1 新学 | 2 组内重学, 作答后的间隔（天）]
 */
import { MASTER_DAYS, addDays, dayKey, diffDays, type Card, type DayLog, type Rating, type SessionItem, longestStreak } from "./srs";
import type { WordIndex } from "./data";
import type { AppState } from "./store";
import { reviewItems } from "./plan";

export type Grade = 0 | 1 | 2 | 3;
export type RevEntry = [w: string, t: number, g: Grade, f: number, i: number];

export const REV_MAX = 20000;
export const F_NEW = 1;
export const F_REPEAT = 2;

export const GRADE_LABEL: Record<Grade, string> = { 0: "不认识", 1: "模糊", 2: "认识", 3: "斩" };

export function gradeOf(r: Rating | "kill"): Grade {
  return r === "kill" ? 3 : r === "know" ? 2 : r === "vague" ? 1 : 0;
}

export function revEntry(w: string, ms: number, r: Rating | "kill", opts: { isNew?: boolean; repeat?: boolean; card?: Card }): RevEntry {
  const f = (opts.isNew ? F_NEW : 0) | (opts.repeat ? F_REPEAT : 0);
  const i = opts.card && !opts.card.k ? opts.card.i : r === "kill" ? -1 : 0;
  return [w, Math.floor(ms / 1000), gradeOf(r), f, i];
}

export function appendRev(log: RevEntry[], e: RevEntry, max = REV_MAX): RevEntry[] {
  const out = log.length >= max ? log.slice(log.length - max + 1) : log.slice();
  out.push(e);
  return out;
}

/** 撤销：去掉这个词最后一条记录 */
export function popRev(log: RevEntry[], w: string): RevEntry[] {
  for (let k = log.length - 1; k >= 0; k--) {
    if (log[k][0] === w) return [...log.slice(0, k), ...log.slice(k + 1)];
  }
  return log;
}

export function isRevEntry(x: unknown): x is RevEntry {
  return (
    Array.isArray(x) &&
    x.length === 5 &&
    typeof x[0] === "string" &&
    typeof x[1] === "number" &&
    [0, 1, 2, 3].includes(x[2] as number) &&
    typeof x[3] === "number" &&
    typeof x[4] === "number"
  );
}

export function normalizeRevlog(raw: unknown): RevEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRevEntry).slice(-REV_MAX);
}

export const entryDay = (e: RevEntry) => dayKey(new Date(e[1] * 1000));
export const entryHour = (e: RevEntry) => new Date(e[1] * 1000).getHours();

/** 单词记忆轨迹（旧 → 新） */
export function wordTrack(log: RevEntry[], w: string): RevEntry[] {
  return log.filter((e) => e[0] === w);
}

/** 复习首答：不是新学、不是组内重学 */
export const isReviewFirst = (e: RevEntry) => (e[3] & (F_NEW | F_REPEAT)) === 0;
export const isCorrect = (e: RevEntry) => e[2] >= 2;

export interface RetentionDay {
  day: string;
  ok: number;
  n: number;
  /** 0~100；当天没复习为 null */
  rate: number | null;
}

/** 近 N 天每日复习首答正确率（保持率） */
export function retention(log: RevEntry[], today: string, days = 30): { days: RetentionDay[]; ok: number; n: number; rate: number | null } {
  const start = addDays(today, -(days - 1));
  const out: RetentionDay[] = Array.from({ length: days }, (_, k) => ({ day: addDays(start, k), ok: 0, n: 0, rate: null }));
  let ok = 0;
  let n = 0;
  for (const e of log) {
    if (!isReviewFirst(e)) continue;
    const k = diffDays(start, entryDay(e));
    if (k < 0 || k >= days) continue;
    out[k].n++;
    n++;
    if (isCorrect(e)) {
      out[k].ok++;
      ok++;
    }
  }
  for (const d of out) d.rate = d.n ? Math.round((d.ok / d.n) * 100) : null;
  return { days: out, ok, n, rate: n ? Math.round((ok / n) * 100) : null };
}

/** 按小时（0–23，本地时间）统计作答量；返回分布与最高峰 */
export function hourDist(log: RevEntry[]): { hours: number[]; peak: number | null; total: number } {
  const hours = Array.from({ length: 24 }, () => 0);
  for (const e of log) hours[entryHour(e)]++;
  const total = log.length;
  let peak: number | null = null;
  hours.forEach((v, h) => {
    if (v > 0 && (peak === null || v > hours[peak])) peak = h;
  });
  return { hours, peak, total };
}

/** 时段文案 */
export function hourBand(h: number): string {
  if (h < 5) return "深夜";
  if (h < 9) return "早晨";
  if (h < 12) return "上午";
  if (h < 14) return "中午";
  if (h < 18) return "下午";
  if (h < 23) return "晚上";
  return "深夜";
}

// ---------------------------------------------------------------- 周报

export interface WeekSum {
  start: string;
  end: string;
  n: number;
  r: number;
  ok: number;
  a: number;
  ms: number;
  /** 有学习的天数 */
  days: number;
  /** 首答正确率 0~100；没作答为 null */
  acc: number | null;
}

/** 周一 */
export function mondayOf(day: string): string {
  const dow = (new Date(day + "T12:00:00").getDay() + 6) % 7;
  return addDays(day, -dow);
}

export function weekSum(logs: Record<string, DayLog>, start: string): WeekSum {
  const s: WeekSum = { start, end: addDays(start, 6), n: 0, r: 0, ok: 0, a: 0, ms: 0, days: 0, acc: null };
  for (let k = 0; k < 7; k++) {
    const l = logs[addDays(start, k)];
    if (!l) continue;
    s.n += l.n;
    s.r += l.r;
    s.ok += l.ok;
    s.a += l.a;
    s.ms += l.ms;
    if (l.n + l.r > 0) s.days++;
  }
  s.acc = s.a ? Math.round((s.ok / s.a) * 100) : null;
  return s;
}

export interface WeekReport {
  last: WeekSum;
  prev: WeekSum;
  /** 与前一周相比的变化 */
  delta: { n: number; r: number; acc: number | null; ms: number };
}

/** 上周 vs 前一周 */
export function weekReport(logs: Record<string, DayLog>, today: string): WeekReport {
  const thisMon = mondayOf(today);
  const last = weekSum(logs, addDays(thisMon, -7));
  const prev = weekSum(logs, addDays(thisMon, -14));
  return {
    last,
    prev,
    delta: {
      n: last.n - prev.n,
      r: last.r - prev.r,
      acc: last.acc !== null && prev.acc !== null ? last.acc - prev.acc : null,
      ms: last.ms - prev.ms,
    },
  };
}

/** 今日页是否显示周报：周一、上周有学习、这周还没关掉 */
export function showWeekReport(logs: Record<string, DayLog>, today: string, seen?: string): boolean {
  if (mondayOf(today) !== today) return false;
  if (seen === today) return false;
  const w = weekSum(logs, addDays(today, -7));
  return w.n + w.r > 0;
}

// ---------------------------------------------------------------- 月历

/** 某月的日历格子：周一开头，前后用 null 补齐 */
export function monthGrid(ym: string): (string | null)[][] {
  const [y, m] = ym.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const len = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1, 12).getDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 0; d < len; d++) cells.push(addDays(first, d));
  while (cells.length % 7) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let k = 0; k < cells.length; k += 7) rows.push(cells.slice(k, k + 7));
  return rows;
}

export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export function monthSum(logs: Record<string, DayLog>, checkins: string[], ym: string) {
  let n = 0;
  let r = 0;
  let days = 0;
  for (const [d, l] of Object.entries(logs)) {
    if (!d.startsWith(ym + "-")) continue;
    n += l.n;
    r += l.r;
    if (l.n + l.r > 0) days++;
  }
  const checked = checkins.filter((d) => d.startsWith(ym + "-")).length;
  return { n, r, days, checked };
}

// ---------------------------------------------------------------- 难词榜 / 间隔分布 / 预测

/** 遗忘次数最多的词（同次数难度系数低的在前）；已斩、没忘过的不算 */
export function hardest(cards: Record<string, Card>, n = 20): string[] {
  return Object.keys(cards)
    .filter((w) => !cards[w].k && cards[w].l > 0)
    .sort((a, b) => cards[b].l - cards[a].l || cards[a].e - cards[b].e || (a < b ? -1 : 1))
    .slice(0, n);
}

export interface Bucket {
  key: string;
  label: string;
  count: number;
}

/** 间隔分桶：≤1 / 2–7 / 8–20 / 21+ 天；已斩单独计 */
export function intervalBuckets(cards: Record<string, Card>): { buckets: Bucket[]; killed: number; total: number } {
  const b: Bucket[] = [
    { key: "d1", label: "≤1 天", count: 0 },
    { key: "d7", label: "2–7 天", count: 0 },
    { key: "d20", label: `8–${MASTER_DAYS - 1} 天`, count: 0 },
    { key: "d21", label: `${MASTER_DAYS}+ 天`, count: 0 },
  ];
  let killed = 0;
  for (const c of Object.values(cards)) {
    if (c.k) {
      killed++;
      continue;
    }
    if (c.i <= 1) b[0].count++;
    else if (c.i <= 7) b[1].count++;
    else if (c.i < MASTER_DAYS) b[2].count++;
    else b[3].count++;
  }
  return { buckets: b, killed, total: killed + b.reduce((s, x) => s + x.count, 0) };
}

export interface ForecastDay {
  day: string;
  reviews: number;
  /** 这天结束时预计已掌握（含斩） */
  mastered: number;
}

/**
 * 未来 N 天预测：假设每次到期都按时复习且答「认识」，
 * 逐日模拟间隔增长（与 schedule 的「认识」一致），得到每日复习量和预计掌握数。
 * 第 0 天含逾期。
 */
export function forecast30(cards: Record<string, Card>, today: string, days = 30): ForecastDay[] {
  const out: ForecastDay[] = Array.from({ length: days }, (_, k) => ({ day: addDays(today, k), reviews: 0, mastered: 0 }));
  const masteredAt = Array.from({ length: days }, () => 0);
  let base = 0;
  for (const c of Object.values(cards)) {
    if (c.k || c.st === "mastered") {
      // 已掌握的词仍会到期复习，但已经算掌握
      base++;
      if (c.k) continue;
    }
    let due = Math.max(0, diffDays(today, c.d));
    let i = c.i;
    let mastered = c.st === "mastered";
    let guard = 0;
    while (due < days && guard++ < 60) {
      out[due].reviews++;
      i = i === 0 ? 1 : Math.max(i + 1, Math.round(i * c.e));
      if (!mastered && i >= MASTER_DAYS) {
        mastered = true;
        masteredAt[due]++;
      }
      due += i;
    }
  }
  let acc = base;
  for (let k = 0; k < days; k++) {
    acc += masteredAt[k];
    out[k].mastered = acc;
  }
  return out;
}

// ---------------------------------------------------------------- 成就徽章

export interface BadgeCtx {
  /** 最长连续打卡 */
  longest: number;
  /** 学过的词（有卡片，含斩） */
  learned: number;
  /** 词库总词数；未知时为 0（「学完全部」不判定） */
  total: number;
  /** 已斩 */
  killed: number;
  /** 已掌握（含斩） */
  mastered: number;
  /** 小测满分次数 */
  perfect: number;
  /** 累计打卡天数 */
  checkins: number;
}

export interface Badge {
  id: string;
  name: string;
  desc: string;
  /** 进度：当前 / 目标 */
  goal: (c: BadgeCtx) => [number, number];
}

export const BADGES: Badge[] = [
  { id: "first", name: "开张", desc: "第一次打卡", goal: (c) => [c.checkins, 1] },
  { id: "streak7", name: "一周不断", desc: "连续打卡 7 天", goal: (c) => [c.longest, 7] },
  { id: "streak30", name: "月度坚持", desc: "连续打卡 30 天", goal: (c) => [c.longest, 30] },
  { id: "streak100", name: "百日筑基", desc: "连续打卡 100 天", goal: (c) => [c.longest, 100] },
  { id: "learn500", name: "五百词", desc: "学过 500 个词", goal: (c) => [c.learned, 500] },
  { id: "learn1000", name: "千词斩", desc: "学过 1000 个词", goal: (c) => [c.learned, 1000] },
  { id: "learnAll", name: "通关词库", desc: "学过全部四级词", goal: (c) => [c.learned, c.total || Infinity] },
  { id: "master500", name: "牢牢记住", desc: "掌握 500 个词", goal: (c) => [c.mastered, 500] },
  { id: "kill100", name: "斩立决", desc: "斩掉 100 个熟词", goal: (c) => [c.killed, 100] },
  { id: "perfect", name: "满分小测", desc: "模拟小测拿满分", goal: (c) => [c.perfect, 1] },
];

export function badgeProgress(b: Badge, c: BadgeCtx): { cur: number; goal: number; done: boolean; pct: number } {
  const [cur, goal] = b.goal(c);
  const done = Number.isFinite(goal) && cur >= goal;
  return { cur: Math.min(cur, Number.isFinite(goal) ? goal : cur), goal, done, pct: Number.isFinite(goal) && goal > 0 ? Math.min(1, cur / goal) : 0 };
}

/** 这次新达成、还没记录的徽章 */
export function newlyEarned(c: BadgeCtx, unlocked: Record<string, string>): string[] {
  return BADGES.filter((b) => !unlocked[b.id] && badgeProgress(b, c).done).map((b) => b.id);
}

// ---------------------------------------------------------------- 日志导出

export function revlogCsv(log: RevEntry[]): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const lines = ["时间,单词,评分,类型,间隔(天)"];
  for (const e of log) {
    const d = new Date(e[1] * 1000);
    const t = `${dayKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const kind = e[3] & F_NEW ? "新学" : e[3] & F_REPEAT ? "重学" : "复习";
    lines.push([t, e[0], GRADE_LABEL[e[2]], kind, e[4] < 0 ? "" : String(e[4])].join(","));
  }
  return "\ufeff" + lines.join("\r\n");
}

/** 难词榜专项：前 20 个难词全部复习；没到期的按提前复习排期（间隔不会变短） */
export function rankGroup(index: WordIndex, st: AppState, day: string): SessionItem[] {
  return reviewItems(index, st, hardest(st.cards, 20), day).map((it) => (st.cards[it.w].d > day ? { ...it, early: true } : it));
}

/** 从应用状态算成就进度 */
export function badgeCtx(st: Pick<AppState, "cards" | "checkins" | "quizzes"> & { settings?: { restDay?: number } }, total: number): BadgeCtx {
  let killed = 0;
  let mastered = 0;
  const cards = Object.values(st.cards);
  for (const c of cards) {
    if (c.k) killed++;
    if (c.k || c.st === "mastered") mastered++;
  }
  return {
    longest: longestStreak(st.checkins, typeof st.settings?.restDay === "number" ? st.settings.restDay : -1),
    learned: cards.length,
    total,
    killed,
    mastered,
    perfect: (st.quizzes ?? []).filter((q) => q.n > 0 && q.ok === q.n).length,
    checkins: st.checkins.length,
  };
}
