/**
 * v7 · 坚持与打卡：补卡、休息日、时长目标、提醒、里程碑、断签预警、当日回看。
 * 都是纯函数，状态的读写在 store.ts。
 */
import type { Card } from "./srs";
import { addDays, dueWords, longestStreak, streak, weekdayOf } from "./srs";
import { F_NEW, F_REPEAT, entryDay, type Grade, type RevEntry } from "./stats";
import { examOf } from "./examdate";

/** 每连续打卡几天得 1 张补卡 */
export const MAKEUP_EVERY = 7;
/** 补卡最多攒几张 */
export const MAKEUP_MAX = 3;
/** 庆祝的连续天数 */
export const MILESTONES = [7, 30, 100] as const;
/** 时长目标（分钟） */
export const TIME_GOALS = [10, 20, 30] as const;
/** 断签预警从几点开始 */
export const LATE_HOUR = 21;
/** 休息日选项：-1 = 不设，0 = 周日 … 6 = 周六（界面按周一在前排） */
export const REST_OPTIONS = [-1, 1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_CN = ["日", "一", "二", "三", "四", "五", "六"];

export type GoalMode = "words" | "time";

/**
 * 11.4 · 每一天的任务快照：这一天第一次打开首页 / 第一次作答时，按「当天」的设置记下来，
 * 以后回头判断这一天有没有完成，只认这份快照（改设置不会回头改旧日子）。
 */
export interface DayRule {
  /** 当天的新词目标（词书学完 / 考前 / 休息 = 0） */
  g: number;
  /** 当天要做完的复习量（快照那一刻还要复习的 + 已经复习的） */
  r: number;
  /** 按时长打卡：目标分钟；按词数打卡时没有 */
  t?: number;
  /** 考前模式：1 = 考前一天，2 = 考试当天 */
  x?: 1 | 2;
  /** 休息中（考后「先休息」） */
  p?: 1;
  /** 11.5 · 这一天生效的考试日（当天最后一次设置；休息中没有）。以后判断「哪天是考试日」读它，不读现在的设置 */
  e?: string;
}

interface HabitState {
  checkins: string[];
  makeup?: number;
  makeupEarned?: string;
  patched?: string[];
  settings: { restDay?: number; examDate?: string };
  /** 11.3 · 考后「先休息」：from 起（到 until 之前）这些天不打卡也不断连续 */
  pause?: { from: string; until?: string };
  /** 11.4 · 确认过「考完了」的那一场（考试当天不算断签） */
  examDone?: string;
  /** 11.4 · 每天的任务快照 */
  dayRule?: Record<string, DayRule>;
  /** 11.5 · 记下来的考试日（考试日一过、或者考完改了日期时写进来，永久保留） */
  examDays?: string[];
}

/**
 * 11.5 · 按快照看 d 是不是考试日：d 之前最近的一份快照里，当时生效的考试日就是 d。
 * 当天才把考试日改成今天，不会让今天变成考试日（今天之前的快照里不是它）；之后再改日期也改不了已经过去的快照。
 * 11.4 的快照没有 e：前一天的快照是「考前一天」（x = 1）就算。
 */
export function snapExamOn(rules: Record<string, DayRule> | undefined, d: string): boolean {
  if (!rules) return false;
  let best: string | undefined;
  for (const k of Object.keys(rules)) if (k < d && (!best || k > best)) best = k;
  if (!best) return false;
  const r = rules[best];
  if (r.e) return r.e === d;
  return r.x === 1 && addDays(best, 1) === d;
}

/** 11.5 · 快照里能确认、已经过去（早于 today）的考试日：写进 examDays，快照只留 21 天也不丢。
 * 11.7 · 只收「算数」的那几场（customExamOk：和上一场记下的考试日隔够 EXAM_GAP 天，官方 / 预估场次不受限） */
export function harvestExamDays(rules: Record<string, DayRule> | undefined, prev: string[] | undefined, today: string): string[] | undefined {
  const out = new Set(prev ?? []);
  const ok = acceptedSnapExams({ dayRule: rules, examDays: prev });
  for (const cand of ok) if (cand < today) out.add(cand);
  if (!out.size) return prev;
  const list = [...out].sort().slice(-EXAM_DAYS_KEEP);
  return prev && list.length === prev.length && list.every((d, i) => d === prev[i]) ? prev : list;
}
export const EXAM_DAYS_KEEP = 12;

/**
 * 11.4 / 11.5 · 这一天是四级考试日：官方 / 预估的场次、记下来的考试日（examDays）、确认过考完的那一场、
 * 按快照当时生效的考试日（snapExamOn）。不读现在的设置——改考试日期不会回头改已经过去的日子。
 * 没有任何快照的老数据（d 和它之前 21 天都没有快照）才退回去看设置里的日期。
 */
export function examDayOn(st: Pick<HabitState, "settings" | "examDone" | "dayRule" | "examDays">, d: string): boolean {
  if (d === st.examDone || st.examDays?.includes(d) || officialDay(d)) return true;
  if (snapExamOn(st.dayRule, d)) return acceptedSnapExams(st).has(d);
  return !!st.settings.examDate && d === st.settings.examDate && !hasSnapNear(st.dayRule, d);
}

/** 官方 / 预估的四级场次（6 月、12 月各一场） */
export function officialDay(d: string): boolean {
  const m = d.slice(5, 7);
  if (m !== "06" && m !== "12") return false;
  return examOf(Number(d.slice(0, 4)), m === "06" ? 6 : 12).day === d;
}

/**
 * 11.7 · 自定的考试日（按快照）和上一场记下的考试日至少隔这么多天，才算一场考试（不打卡也不断签、记进 examDays）。
 * 四级一年两场：「每天把考试日改成明天」最多换来一场（考前一天 + 考试当天），之后照常要打卡（r7 R7-6）。
 */
export const EXAM_GAP = 30;

const acceptCache = new WeakMap<object, { ed?: string[]; done?: string; set: Set<string> }>();
/**
 * 11.7 · 快照里出现过、算数的考试日：按日期先后看每个候选（某天快照里记的 e / 旧数据的 x = 1 → 第二天，且 snapExamOn 成立），
 * 官方 / 预估场次直接算；自定的要和它之前 EXAM_GAP 天内记下的（examDays、examDone、前面已经算数的候选）都不撞。
 */
export function acceptedSnapExams(st: Pick<HabitState, "dayRule" | "examDays"> & { examDone?: string }): Set<string> {
  const rules = st.dayRule;
  if (!rules) return new Set();
  const hit = acceptCache.get(rules);
  if (hit && hit.ed === st.examDays && hit.done === st.examDone) return hit.set;
  const cands = new Set<string>();
  for (const [k, r] of Object.entries(rules)) {
    const c = r.e ?? (r.x === 1 ? addDays(k, 1) : undefined);
    if (c && c > k && snapExamOn(rules, c)) cands.add(c);
  }
  const prior = [...(st.examDays ?? []), ...(st.examDone ? [st.examDone] : [])];
  const set = new Set<string>();
  for (const c of [...cands].sort()) {
    if (officialDay(c) || prior.includes(c)) {
      set.add(c);
      continue;
    }
    const lo = addDays(c, -(EXAM_GAP - 1));
    const clash = prior.some((x) => x < c && x >= lo) || [...set].some((x) => x < c && x >= lo);
    if (!clash) set.add(c);
  }
  acceptCache.set(rules, { ed: st.examDays, done: st.examDone, set });
  return set;
}

const hasSnapNear = (rules: Record<string, DayRule> | undefined, d: string) => {
  const from = addDays(d, -21);
  return Object.keys(rules ?? {}).some((k) => k >= from && k <= d);
};

/**
 * 11.4 · 不打卡也不断连续的日子（周休息日之外）：考后「先休息」期间、考试当天、
 * 考前模式下当天一点任务都没有的日子（快照里记着 考前 + 没有新词 + 没有复习）。
 */
export function skipDay(st: HabitState, d: string): boolean {
  if (pausedOn(st, d) || examDayOn(st, d)) return true;
  const r = st.dayRule?.[d];
  // 11.5 · 考试当天由 examDayOn 按快照判断，快照自己的 x = 2 不算
  return !!r && (!!r.p || eveFree(st, d));
}

/**
 * 11.7 · 考前一天免打卡的唯一规则（结算 skipDay 和首页主卡 / 打卡卡片都调它）：当天最后生效的规则一点任务都没有（idleExamEve），
 * 而且明天真的算一场考试（examDayOn：官方 / 预估场次，或者和上一场隔够 EXAM_GAP 天的自定日期）。
 * 按词数、按时长一个说法：时长模式的考前一天同样不打卡也不断签（r7 R7-1）。rule 不传 = 读今天的快照。
 */
export function eveFree(st: HabitState, d: string, rule: DayRule | undefined = st.dayRule?.[d]): boolean {
  if (!idleExamEve(rule, d)) return false;
  const withRule = rule === st.dayRule?.[d] ? st : { ...st, dayRule: { ...(st.dayRule ?? {}), [d]: rule! } };
  return examDayOn(withRule, addDays(d, 1));
}

/**
 * 11.6 · 考前一天、当天（最后生效的规则）一点任务都没有：不排新词、也没有复习——界面上说「今天没有要做的」，结算也不算断签。
 * 认第一份快照里的「考前一天」（x = 1），也认当天才改出来的（快照里记的考试日 e 就是明天）：前一天晚上才改考试日，
 * 今天变成考前一天、什么都做不了，不能第二天再按断签算（11.5 的已知限制，r6 改掉）。
 */
export function idleExamEve(r: DayRule | undefined, d: string): boolean {
  if (!r || r.g !== 0 || r.r !== 0 || r.p) return false;
  return r.x === 1 || (!!r.e && r.e === addDays(d, 1));
}

/** 11.4 · 周历上的「考」/「休」 */
export function skipKind(st: HabitState, d: string): "exam" | "rest" | null {
  if (examDayOn(st, d)) return "exam";
  return skipDay(st, d) ? "rest" : null;
}

/** 11.3 · 这一天在「先休息」期间（不算断签） */
export const pausedOn = (st: Pick<HabitState, "pause">, d: string) => !!st.pause && d >= st.pause.from && (!st.pause.until || d < st.pause.until);

export const restOf = (st: { settings: { restDay?: number } }) => {
  const r = st.settings.restDay;
  return typeof r === "number" && r >= 0 && r <= 6 ? r : -1;
};

export const isRestDay = (day: string, rest: number) => rest >= 0 && weekdayOf(day) === rest;

/** 当前连续天数（算上休息日） */
export const curStreak = (st: HabitState, day: string) => streak(st.checkins, day, restOf(st), (d) => skipDay(st, d));
export const bestStreak = (st: HabitState) => longestStreak(st.checkins, restOf(st), (d) => skipDay(st, d));

/** 11.4 · 连续几天以上才说「要断了 / 断了」（1–2 天谈不上连续，不拿刚开始的习惯吓人） */
export const STREAK_WARN_MIN = 3;

/** 连续天数从 prev 变成 next 时跨过了哪个里程碑 */
export function milestoneOf(prev: number, next: number): number | null {
  for (let k = MILESTONES.length - 1; k >= 0; k--) {
    const m = MILESTONES[k];
    if (prev < m && next >= m) return m;
  }
  return null;
}

export interface CheckInResult {
  checkins: string[];
  makeup: number;
  makeupEarned?: string;
  streak: number;
  /** 这次打卡得了补卡 */
  earned: boolean;
  milestone: number | null;
}

/** 打卡：写入日期；连续天数到 7 的倍数时得 1 张补卡（上限 3，同一天只发一次） */
export function applyCheckIn(st: HabitState, day: string): CheckInResult {
  const prev = curStreak(st, day);
  const have = Math.max(0, Math.min(MAKEUP_MAX, st.makeup ?? 0));
  if (st.checkins.includes(day)) return { checkins: st.checkins, makeup: have, makeupEarned: st.makeupEarned, streak: prev, earned: false, milestone: null };
  const checkins = [...st.checkins, day].sort();
  const next = curStreak({ ...st, checkins }, day);
  const earned = next > 0 && next % MAKEUP_EVERY === 0 && st.makeupEarned !== day && have < MAKEUP_MAX;
  return {
    checkins,
    makeup: earned ? have + 1 : have,
    makeupEarned: earned ? day : st.makeupEarned,
    streak: next,
    earned,
    milestone: milestoneOf(prev, next),
  };
}

/** 能不能补昨天：昨天没打卡、不是休息日、手里有补卡 */
export function canPatch(st: HabitState, day: string): boolean {
  const y = addDays(day, -1);
  return (st.makeup ?? 0) > 0 && !st.checkins.includes(y) && !isRestDay(y, restOf(st)) && !skipDay(st, y);
}

/** 补上昨天之后的连续天数（预览用） */
export function patchedStreak(st: HabitState, day: string): number {
  return curStreak({ ...st, checkins: [...st.checkins, addDays(day, -1)] }, day);
}

export interface PatchResult {
  checkins: string[];
  patched: string[];
  makeup: number;
  streak: number;
  milestone: number | null;
}

/** 用 1 张补卡补昨天；补出来的天数不再发补卡 */
export function applyPatch(st: HabitState, day: string): PatchResult | null {
  if (!canPatch(st, day)) return null;
  const y = addDays(day, -1);
  const prev = curStreak(st, day);
  const checkins = [...st.checkins, y].sort();
  const next = curStreak({ ...st, checkins }, day);
  return {
    checkins,
    patched: [...new Set([...(st.patched ?? []), y])].sort(),
    makeup: (st.makeup ?? 0) - 1,
    streak: next,
    milestone: milestoneOf(prev, next),
  };
}

/** 时长目标是否达成 */
export const timeReached = (ms: number, goalMin: number) => ms >= goalMin * 60000;

/** 断签预警：21 点后、今天没打卡、今天不是休息日 */
export function lateWarning(hour: number, checked: boolean, restToday: boolean): boolean {
  return hour >= LATE_HOUR && !checked && !restToday;
}

/** 距今天结束还有多少分钟（本地时间） */
export function minutesToMidnight(at: Date): number {
  const end = new Date(at);
  end.setHours(24, 0, 0, 0);
  return Math.max(0, Math.ceil((end.getTime() - at.getTime()) / 60000));
}

/** 提醒时间 "HH:MM" → 当天第几分钟；格式不对返回 null */
export function parseHM(s: string | undefined): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}

/** 该不该发提醒：到点了、今天还没发过、今天还没打卡 */
export function reminderDue(at: Date, remindAt: string | undefined, lastSent: string | null, checked: boolean, day: string): boolean {
  const t = parseHM(remindAt);
  if (t === null || checked || lastSent === day) return false;
  return at.getHours() * 60 + at.getMinutes() >= t;
}

/** 应用角标：今天要复习的数量（按复习上限截断） */
export function badgeCount(cards: Record<string, Card>, day: string, cap: number, reviewedToday: number): number {
  const all = dueWords(cards, day).length;
  if (!cap) return all;
  return Math.min(all, Math.max(0, cap - reviewedToday));
}

/** 最近 7 天（含今天）是否打卡，旧 → 新 */
export function lastWeek(checkins: string[], day: string): boolean[] {
  const set = new Set(checkins);
  return Array.from({ length: 7 }, (_, k) => set.has(addDays(day, k - 6)));
}

export interface DayDetail {
  /** 当天第一次学的词 */
  learned: string[];
  /** 当天复习过的词 → 当天最后一次的评分 */
  reviewed: { w: string; g: Grade }[];
}

/** 当日回看：从复习日志取当天新学与复习的词；旧数据没有日志时用卡片的首学日期补新学 */
export function dayDetail(log: RevEntry[], cards: Record<string, Card>, day: string): DayDetail {
  const learned: string[] = [];
  const seenNew = new Set<string>();
  const rev = new Map<string, Grade>();
  for (const e of log) {
    if (entryDay(e) !== day) continue;
    if (e[3] & F_NEW) {
      if (!seenNew.has(e[0])) {
        seenNew.add(e[0]);
        learned.push(e[0]);
      }
    } else if (!(e[3] & F_REPEAT) || rev.has(e[0])) {
      rev.delete(e[0]);
      rev.set(e[0], e[2]);
    }
  }
  if (!log.some((e) => entryDay(e) === day)) {
    for (const [w, c] of Object.entries(cards)) if (c.f === day && !seenNew.has(w)) learned.push(w);
  }
  const reviewed = [...rev.entries()].filter(([w]) => !seenNew.has(w)).map(([w, g]) => ({ w, g }));
  return { learned, reviewed };
}

// ---------------------------------------------------------------- 11.3 · 任务达标 = 打卡

interface MetState extends HabitState {
  log: Record<string, { n: number; r: number; ms?: number } | undefined>;
  goalMet?: string[];
}

/** 往回看几天：这几天里任务达标、却没点打卡的，打开时自动补记 */
export const AUTO_CREDIT_DAYS = 7;

/**
 * 11.4 · 按这一天的快照判断：当天的完整规则（新词达标且复习做完；按时长打卡时学满时长）。
 * 没有快照 = 判断不了 → 不算。
 */
export function ruleMet(rule: DayRule | undefined, log: { n: number; r: number; ms?: number } | undefined): boolean {
  if (!rule || !log) return false;
  if (rule.t) return (log.ms ?? 0) >= rule.t * 60000;
  if (log.n + log.r <= 0) return false;
  return log.n >= rule.g && log.r >= rule.r;
}

/**
 * 某一天的任务达标了吗（11.4 · 只认「当天」）：当天按当天的完整规则记下过「任务完成」（goalMet），
 * 或者当天的日志达到了当天快照里的目标。不用今天的设置回头重算旧日子；没有快照又没有 goalMet 的不补。
 */
export function dayMet(st: MetState, d: string): boolean {
  if (st.goalMet?.includes(d)) return true;
  return ruleMet(st.dayRule?.[d], st.log[d]);
}

/**
 * 11.3 · 打开时补记：最近 7 天（不含今天）里任务达标、却没打卡的日子，按日期先后补上打卡
 * （跨 0 点学完、学完直接锁屏都算）。返回补上的日子和补完后的打卡状态；没有要补的返回 null。
 */
export function autoCredit(st: MetState, day: string): { days: string[]; checkins: string[]; makeup: number; makeupEarned?: string; streak: number } | null {
  const days: string[] = [];
  let cur: MetState = st;
  for (let k = AUTO_CREDIT_DAYS; k >= 1; k--) {
    const d = addDays(day, -k);
    if (cur.checkins.includes(d) || !dayMet(cur, d)) continue;
    const r = applyCheckIn(cur, d);
    cur = { ...cur, checkins: r.checkins, makeup: r.makeup, makeupEarned: r.makeupEarned };
    days.push(d);
  }
  if (!days.length) return null;
  return { days, checkins: cur.checkins, makeup: cur.makeup ?? 0, makeupEarned: cur.makeupEarned, streak: curStreak(cur, day) };
}

/**
 * 11.3 · 连续天数刚断（昨天没完成、不是休息日、前天之前有连续）：给出断之前的天数，用来说一句话 / 提供补卡。
 * 没断返回 0。
 */
export function brokenStreak(st: HabitState, day: string): number {
  const y = addDays(day, -1);
  if (st.checkins.includes(y) || isRestDay(y, restOf(st)) || skipDay(st, y)) return 0;
  return curStreak(st, y);
}
