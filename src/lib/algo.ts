/**
 * v10 · 算法进阶（纯函数）
 *  - 设置 → schedule 的选项（保持目标 / 扰动 / 负荷均衡 / 逾期加成 / 重学步骤 / 四键 / 初始难度）
 *  - 初始难度拟合：按历史新词首答正确率给新卡初始 ease
 *  - 负荷均衡：未来 30 天的到期量、把超载那天的词前后挪 1 天
 *  - 新词自适应：今天复习太多时建议少学新词
 *  - 算法说明：一次评分前后的间隔、连续「认识」的间隔增长
 *  - 计划模拟器：给定每日新词数，按记住率逐日模拟 30 天复习量
 */
import {
  DEFAULT_EASE,
  FIRST_KNOWN_DAYS,
  MASTER_DAYS,
  addDays,
  diffDays,
  retentionScale,
  schedule,
  type AlgoOptions,
  type Card,
  type Rating,
} from "./srs";
import type { RevEntry } from "./stats";

// 与 stats.ts 的 F_NEW / F_REPEAT 一致（这里不引 stats，避免 store → algo → stats 的循环）
const F_NEW = 1;
const F_REPEAT = 2;

export const RETENTION_OPTIONS = [85, 90, 95] as const;
export type Retention = (typeof RETENTION_OPTIONS)[number];

export interface AlgoSettings {
  retention: number;
  fuzz: boolean;
  balance: boolean;
  overdue: boolean;
  steps: boolean;
  fourKey: boolean;
  fitEase: boolean;
}

export const cleanRetention = (r: unknown): Retention => ((RETENTION_OPTIONS as readonly unknown[]).includes(r) ? (r as Retention) : 90);

/** 评分按钮从左到右：四键模式在「认识」前加「简单」；左手模式整体翻转 */
export function rateOrder4(leftHand: boolean, fourKey: boolean): Grade4[] {
  const base: Grade4[] = fourKey ? ["easy", "know", "vague", "forget"] : ["know", "vague", "forget"];
  return leftHand ? base.reverse() : base;
}

// ---------------------------------------------------------------- 初始难度拟合

/** 至少这么多次新词首答才拟合 */
export const FIT_MIN = 30;
export const FIT_WINDOW = 400;
export const FIT_MIN_EASE = 2.1;
export const FIT_MAX_EASE = 2.8;

export interface EaseFit {
  /** 拟合出的初始 ease；样本不够时为默认值 */
  ease: number;
  /** 新词首答正确率 */
  acc: number | null;
  n: number;
  /** 样本够了 */
  ok: boolean;
}

/** 新词首答（不含斩、不含组内重学）正确率 → 初始 ease：80% 对应 2.5，每 ±10% 对应 ±0.2，限制在 2.1–2.8 */
export function fitInitialEase(log: RevEntry[]): EaseFit {
  const firsts = log.filter((e) => (e[3] & F_NEW) && !(e[3] & F_REPEAT) && e[2] !== 3).slice(-FIT_WINDOW);
  const n = firsts.length;
  if (!n) return { ease: DEFAULT_EASE, acc: null, n: 0, ok: false };
  const acc = firsts.filter((e) => e[2] === 2 || e[2] === 4).length / n;
  if (n < FIT_MIN) return { ease: DEFAULT_EASE, acc, n, ok: false };
  const raw = DEFAULT_EASE + (acc - 0.8) * 2;
  const ease = Math.round(Math.min(FIT_MAX_EASE, Math.max(FIT_MIN_EASE, raw)) * 20) / 20;
  return { ease, acc, n, ok: true };
}

// ---------------------------------------------------------------- 负荷

export const LOAD_DAYS = 30;

/** 未来 1..days 天每天的到期量（不含今天和逾期）与均值 */
export function dueLoad(cards: Record<string, Card>, today: string, days = LOAD_DAYS): { counts: Map<string, number>; avg: number } {
  const counts = new Map<string, number>();
  const end = addDays(today, days);
  let total = 0;
  for (const c of Object.values(cards)) {
    if (c.k || c.d <= today || c.d > end) continue;
    counts.set(c.d, (counts.get(c.d) ?? 0) + 1);
    total++;
  }
  return { counts, avg: total / days };
}

/** 设置 + 卡片 + 日志 → schedule 用的算法选项（load 可变：均衡时边答边更新） */
export function algoOptions(s: Partial<AlgoSettings>, ctx: { cards: Record<string, Card>; revlog: RevEntry[]; today: string }): AlgoOptions {
  const a: AlgoOptions = {};
  const r = cleanRetention(s.retention);
  if (r !== 90) a.retention = r;
  if (s.fuzz) a.fuzz = true;
  if (s.overdue) a.overdue = true;
  if (s.steps) a.steps = true;
  if (s.fitEase) {
    const fit = fitInitialEase(ctx.revlog);
    if (fit.ok) a.initEase = fit.ease;
  }
  if (s.balance) {
    const { counts, avg } = dueLoad(ctx.cards, ctx.today);
    a.load = { count: (d) => counts.get(d) ?? 0, avg };
  }
  return a;
}

/** 把超载（> 均值 × 1.5）那天的词挪到前后一天里较空的那天（邻日挪完也不超过 1.5 倍）；只挪间隔 ≥4 天的词，不挪到今天及以前 */
export function balanceAll(cards: Record<string, Card>, today: string, days = LOAD_DAYS): { cards: Record<string, Card>; moved: string[] } {
  const { counts, avg } = dueLoad(cards, today, days);
  const out = { ...cards };
  const moved: string[] = [];
  if (avg <= 0) return { cards: out, moved };
  const limit = avg * 1.5;
  const byDay = new Map<string, string[]>();
  for (const w of Object.keys(cards)) {
    const c = cards[w];
    if (c.k || c.i < 4 || !counts.has(c.d)) continue;
    const list = byDay.get(c.d) ?? [];
    list.push(w);
    byDay.set(c.d, list);
  }
  for (let k = 1; k <= days; k++) {
    const d = addDays(today, k);
    const list = (byDay.get(d) ?? []).sort((a, b) => cards[b].i - cards[a].i || (a < b ? -1 : 1));
    for (const w of list) {
      const n = counts.get(d) ?? 0;
      if (n < 3 || n <= limit) break;
      const prev = addDays(d, -1);
      const next = addDays(d, 1);
      const pn = prev > today ? (counts.get(prev) ?? 0) : Infinity;
      const nn = counts.get(next) ?? 0;
      const to = pn <= nn ? prev : next;
      const tn = Math.min(pn, nn);
      // 邻日也不能因此超载
      if (tn + 1 >= n || tn + 1 > limit) break;
      counts.set(d, n - 1);
      counts.set(to, tn + 1);
      const c = cards[w];
      const i = c.i + diffDays(d, to);
      out[w] = { ...c, d: to, i, st: c.st === "mastered" || i >= MASTER_DAYS ? "mastered" : i === 0 ? "learning" : "review" };
      moved.push(w);
    }
  }
  return { cards: out, moved };
}

/** 超载的天（> 均值 × 1.5 且 ≥3 个） */
export function overloadedDays(cards: Record<string, Card>, today: string, days = LOAD_DAYS): string[] {
  const { counts, avg } = dueLoad(cards, today, days);
  return [...counts.entries()].filter(([, n]) => n >= 3 && n > avg * 1.5).map(([d]) => d).sort();
}

// ---------------------------------------------------------------- 新词自适应（实现在 plan.ts，今日页首屏要用）

export { adaptiveNew } from "./plan";

// ---------------------------------------------------------------- 算法说明

export type Grade4 = Rating | "easy";

/** 一张「间隔 i 天、ease e」的卡在今天按时复习，各评分之后的间隔（真实调用 schedule） */
export function ratingEffects(i: number, e: number, s: Partial<AlgoSettings>, today = "2026-01-01"): Record<Grade4, number> {
  const algo: AlgoOptions = {};
  const r = cleanRetention(s.retention);
  if (r !== 90) algo.retention = r;
  const card: Card | undefined =
    i < 0 ? undefined : { st: i === 0 ? "learning" : "review", e, i, r: 1, l: 0, d: today, f: addDays(today, -Math.max(1, i)), t: addDays(today, -i) };
  const after = (rating: Rating, easy = false) => {
    const c = schedule(card, rating, today, { algo: { ...algo, easy } });
    return diffDays(today, c.d);
  };
  return { forget: after("forget"), vague: after("vague"), know: after("know"), easy: after("know", true) };
}

/** 新词首答「认识」后一直答「认识」，每次复习后的间隔 */
export function growthSeries(e: number, steps: number, s: Partial<AlgoSettings>): number[] {
  const algo: AlgoOptions = {};
  const r = cleanRetention(s.retention);
  if (r !== 90) algo.retention = r;
  let day = "2026-01-01";
  let card: Card | undefined = undefined;
  const out: number[] = [];
  for (let k = 0; k < steps; k++) {
    card = schedule(card, "know", day, { algo: { ...algo, initEase: e } });
    out.push(card.i);
    day = card.d;
  }
  return out;
}

// ---------------------------------------------------------------- 计划模拟器

export interface SimDay {
  day: string;
  /** 这天的复习量（含新词首学之后的复习，不含新词本身） */
  reviews: number;
  /** 这天新学 */
  learned: number;
}

export interface SimResult {
  days: SimDay[];
  total: number;
  peak: number;
  peakDay: number;
  /** 最后 7 天的日均复习量 */
  tail: number;
  learned: number;
}

interface Cohort {
  due: number;
  i: number;
  e: number;
  w: number;
}

/**
 * 计划模拟器：现有卡片 + 每天 perDay 个新词（不超过剩余词数），逐日模拟 days 天。
 * 每次复习按记住率 R 拆分：R 答「认识」（间隔 × ease × 保持目标缩放），1 − R 遗忘（第二天重学，ease −0.2）。
 * 新词首答：R 认识（2 天后），其余当天学会（1 天后）。用小数权重做期望值，最后取整。
 */
export function simulatePlan(
  cards: Record<string, Card>,
  today: string,
  opts: { perDay: number; newLeft: number; retention?: number; initEase?: number; days?: number },
): SimResult {
  const days = opts.days ?? 30;
  const R = cleanRetention(opts.retention ?? 90) / 100;
  const scale = retentionScale(cleanRetention(opts.retention ?? 90));
  const e0 = opts.initEase ?? DEFAULT_EASE;
  const out: SimDay[] = Array.from({ length: days }, (_, k) => ({ day: addDays(today, k), reviews: 0, learned: 0 }));
  const buckets: Map<string, Cohort>[] = Array.from({ length: days }, () => new Map());
  const add = (c: Cohort) => {
    if (c.due >= days || c.w < 1e-6) return;
    const key = `${c.i}|${c.e.toFixed(2)}`;
    const b = buckets[c.due];
    const old = b.get(key);
    if (old) old.w += c.w;
    else b.set(key, { ...c });
  };
  for (const c of Object.values(cards)) {
    if (c.k) continue;
    add({ due: Math.max(0, diffDays(today, c.d)), i: c.i, e: c.e, w: 1 });
  }
  let left = Math.max(0, opts.newLeft);
  for (let k = 0; k < days; k++) {
    const n = Math.min(left, Math.max(0, opts.perDay));
    left -= n;
    out[k].learned = n;
    if (n) {
      add({ due: k + FIRST_KNOWN_DAYS, i: FIRST_KNOWN_DAYS, e: e0, w: n * R });
      add({ due: k + 1, i: 1, e: Math.max(1.3, e0 - 0.2), w: n * (1 - R) });
    }
    let reviews = 0;
    for (const c of buckets[k].values()) {
      reviews += c.w;
      const grown = c.i === 0 ? 1 : Math.max(c.i + 1, Math.round(Math.max(c.i + 1, Math.round(c.i * c.e)) * (c.i > 0 ? scale : 1)));
      add({ due: k + grown, i: grown, e: c.e, w: c.w * R });
      const e = Math.max(1.3, Math.round((c.e - 0.2) * 100) / 100);
      add({ due: k + 1, i: 1, e, w: c.w * (1 - R) });
    }
    out[k].reviews = Math.round(reviews);
  }
  const total = out.reduce((s, d) => s + d.reviews, 0);
  let peakDay = 0;
  out.forEach((d, k) => {
    if (d.reviews > out[peakDay].reviews) peakDay = k;
  });
  const tailDays = out.slice(-7);
  return {
    days: out,
    total,
    peak: out[peakDay]?.reviews ?? 0,
    peakDay,
    tail: Math.round(tailDays.reduce((s, d) => s + d.reviews, 0) / Math.max(1, tailDays.length)),
    learned: out.reduce((s, d) => s + d.learned, 0),
  };
}

export const SIM_MIN = 0;
export const SIM_MAX = 100;
export const SIM_STEP = 5;
