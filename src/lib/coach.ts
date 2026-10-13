/**
 * 11.1 · 首页只回答「现在该干嘛」：所有建议排一个队，同一时间只给一条。
 *
 * 优先级：回归恢复 > 补卡（只今天有效）> 备份（数据安全，可稍后）> 考试计划落后
 *        > 复习压力（不会和考试计划打架）> 安装 > 顽固词 > 提前复习 > 今日小测 > 周报
 * 纯函数，方便测试。
 */
import { addDays, diffDays, dueWords, type Card } from "./srs";
import { adaptiveNew } from "./plan";
import type { ExamAdvice, SprintPlan } from "./exam";

/** 隔了几天没学算「回归」 */
export const RETURN_GAP = 7;
/** 回归时积压至少这么多才给恢复计划 */
export const RETURN_MIN_BACKLOG = 30;
/** 恢复期每天最多清多少积压（复习上限更小时用上限） */
export const RECOVER_MAX = 150;
export const RECOVER_DEFAULT = 100;
/** 今日小测：学过这么多词、今天任务完成之后才出现 */
export const QUIZ_MIN_LEARNED = 20;

export type Advice =
  | { kind: "recover-offer"; backlog: number; days: number; perDay: number; gap: number }
  | { kind: "recovering"; day: number; days: number; due: number; until: string; shifted: number }
  | { kind: "exam-over"; exam: string; custom: boolean; next: string }
  | { kind: "makeup" }
  | { kind: "sprint"; plan: SprintPlan; advice: ExamAdvice; exam: string }
  | { kind: "adaptive"; to: number }
  | { kind: "adaptive-cut"; cut: number }
  | { kind: "backup"; days: number | null }
  | { kind: "install" }
  | { kind: "hard"; n: number }
  | { kind: "ahead"; n: number }
  | { kind: "quiz" }
  | { kind: "week" };

/** 今天之前最后一次学习（有作答或打卡）的日期 */
export function lastActive(log: Record<string, { n: number; r: number; a: number }>, checkins: string[], day: string): string | null {
  let best: string | null = null;
  for (const [d, l] of Object.entries(log)) if (d < day && l.n + l.r + l.a > 0 && (!best || d > best)) best = d;
  for (const d of checkins) if (d < day && (!best || d > best)) best = d;
  return best;
}

/** 恢复期每天清多少：复习上限（≤150）或默认 100 */
export const recoverPerDay = (cap: number) => (cap > 0 ? Math.min(cap, RECOVER_MAX) : RECOVER_DEFAULT);

/**
 * 回归恢复计划：把积压按天摊开（最容易忘的——间隔短的、逾期久的——排在前面），
 * 每天 perDay 个，返回改好的卡片和最后一天。
 */
export function recoveryPlan(cards: Record<string, Card>, day: string, perDay: number): { cards: Record<string, Card>; days: number; until: string; moved: number } {
  const due = dueWords(cards, day)
    .map((w) => [w, cards[w]] as const)
    .sort((a, b) => a[1].i - b[1].i || (a[1].d < b[1].d ? -1 : a[1].d > b[1].d ? 1 : 0) || (a[0] < b[0] ? -1 : 1));
  const days = Math.max(1, Math.ceil(due.length / perDay));
  const out = { ...cards };
  let moved = 0;
  due.forEach(([w, c], k) => {
    const d = addDays(day, Math.floor(k / perDay));
    if (c.d !== d) {
      out[w] = { ...c, d };
      moved++;
    }
  });
  return { cards: out, days, until: addDays(day, days - 1), moved };
}

/**
 * 11.2 · 恢复期每天第一次打开时检查一次：今天到期的比今天剩下的额度多（漏了一天、或者没清完），
 * 就把积压从今天起按额度重新摊开、顺延结束日。今天的额度 = 每天额度 − 今天已经复习的。
 * 返回 null = 不用动。
 */
export function recoverTick(
  cards: Record<string, Card>,
  rec: { from: string; until: string; n: number; perDay?: number; spread?: string } | undefined,
  day: string,
  reviewCap: number,
  reviewedToday: number,
): { cards: Record<string, Card>; until: string; n: number; shifted: number } | null {
  if (!rec || day < rec.from || rec.spread === day) return null;
  // 结束日之后一周内还有大量积压（最后几天没打开）也顺延；更久就当恢复计划结束了
  if (day > rec.until && diffDays(rec.until, day) > RETURN_GAP) return null;
  const perDay = rec.perDay ?? recoverPerDay(reviewCap);
  const q0 = Math.max(0, perDay - reviewedToday);
  if (dueWords(cards, day).length <= q0) return null;
  // 重新摊的是「到计划结束日为止」的全部积压（不只今天到期的），否则顺延过去的会和原本排在后面几天的叠在一起
  const end = rec.until > day ? rec.until : day;
  const due = dueWords(cards, end)
    .map((w) => [w, cards[w]] as const)
    .sort((a, b) => (a[1].d < b[1].d ? -1 : a[1].d > b[1].d ? 1 : 0) || a[1].i - b[1].i || (a[0] < b[0] ? -1 : 1));
  const out = { ...cards };
  let last = day;
  due.forEach(([w, c], k) => {
    const d = k < q0 ? day : addDays(day, 1 + Math.floor((k - q0) / perDay));
    if (d > last) last = d;
    if (c.d !== d) out[w] = { ...c, d };
  });
  const until = last > rec.until ? last : rec.until;
  return { cards: out, until, n: diffDays(rec.from, until) + 1, shifted: Math.max(0, diffDays(rec.until, until)) };
}

export interface AdviceInput {
  day: string;
  /** 全部到期（未截断） */
  dueAll: number;
  /** 今天要复习（已按上限截断） */
  due: number;
  learned: number;
  daily: number;
  newLeft: number;
  started: number;
  reviewCap: number;
  /** 今天任务完成（可打卡）或已打卡 */
  taskDone: boolean;
  checked: boolean;
  plan: SprintPlan;
  /** 11.2 · 统一计划引擎给出的建议（examAdvice） */
  exam?: ExamAdvice | null;
  examDay?: string;
  /** 考试当天 / 前一天 */
  examMode?: boolean;
  examPause?: boolean;
  examOver?: { day: string; custom: boolean; next: string } | null;
  /** 冲刺卡今天处理过 */
  sprintSeen?: boolean;
  /** 「学不完」信息卡这一场关掉了 */
  sprintOff?: boolean;
  /** 今天之前最后一次学习的日期 */
  last: string | null;
  recover?: { from: string; until: string; n: number; shifted?: number };
  recoverSeen?: string;
  cut: number | null;
  cutSeen: boolean;
  patchable: boolean;
  backupDays: number | null;
  install: boolean;
  hard: number;
  aheadCount: number;
  quizDone: boolean;
  week: boolean;
}

export function homeAdvice(x: AdviceInput): Advice | null {
  // 11.2 · 考完了：先问一句，用户选了才换计划
  if (x.examOver) return { kind: "exam-over", exam: x.examOver.day, custom: x.examOver.custom, next: x.examOver.next };
  // 回归：正在恢复
  if (x.recover && x.day >= x.recover.from && x.day <= x.recover.until)
    return { kind: "recovering", day: diffDays(x.recover.from, x.day) + 1, days: x.recover.n, due: x.due, until: x.recover.until, shifted: x.recover.shifted ?? 0 };
  // 回归：隔了 ≥ 7 天、积压一大堆 → 只给欢迎回来
  const gap = x.last ? diffDays(x.last, x.day) : 0;
  // 考试当天 / 前一天不摊恢复计划（考前模式只复习）
  if (gap >= RETURN_GAP && x.dueAll >= RETURN_MIN_BACKLOG && x.recoverSeen !== x.day && !x.examMode) {
    const perDay = recoverPerDay(x.reviewCap);
    return { kind: "recover-offer", backlog: x.dueAll, perDay, days: Math.ceil(x.dueAll / perDay), gap };
  }
  if (x.patchable) return { kind: "makeup" };
  // 数据安全排在计划建议前面（可以「稍后」3 天）
  if (x.backupDays !== null) return { kind: "backup", days: x.backupDays };
  const p = x.plan;
  // 考试计划（11.2）：统一引擎给的建议；考前模式 / 先休息 / 今天任务已完成（不在完成的这一刻劝加量）/ 今天处理过 都不出现；
  // 「每天 100 个也学不完」的信息卡关掉后这一场不再出现
  const e = x.exam;
  if (e && !x.examMode && !x.examPause && !x.taskDone && !x.sprintSeen && !(e.kind === "cap" && e.canRaise === null && x.sprintOff))
    return { kind: "sprint", plan: p, advice: e, exam: x.examDay ?? "" };
  // 今天已经按复习压力减过新词
  if (x.cut !== null && x.cut < x.daily && x.newLeft > 0) return { kind: "adaptive-cut", cut: x.cut };
  // 复习压力：减新词，但不减到考试计划需要的量以下（两条建议不会打架）
  if (x.newLeft > 0 && !x.cutSeen && x.learned < x.daily) {
    const n = adaptiveNew(x.due, x.daily);
    const floor = p.newLeft > 0 && !x.examPause ? p.daily : 0;
    if (n !== null) {
      const to = Math.max(n, x.learned, floor);
      if (to < x.daily) return { kind: "adaptive", to };
    }
  }
  if (x.install) return { kind: "install" };
  // 周报只在周一出现、看过就关：排在常驻的顽固词前面，不然有顽固词的人永远看不到
  if (x.week) return { kind: "week" };
  if (x.hard > 0) return { kind: "hard", n: x.hard };
  if (x.due === 0 && x.aheadCount > 0) return { kind: "ahead", n: x.aheadCount };
  if (!x.quizDone && x.started >= QUIZ_MIN_LEARNED && (x.taskDone || x.checked)) return { kind: "quiz" };
  return null;
}
