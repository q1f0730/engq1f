/**
 * v7 · 坚持与打卡：补卡、休息日、时长目标、提醒、里程碑、断签预警、当日回看。
 * 都是纯函数，状态的读写在 store.ts。
 */
import type { Card } from "./srs";
import { addDays, dueWords, longestStreak, streak, weekdayOf } from "./srs";
import { F_NEW, F_REPEAT, entryDay, type Grade, type RevEntry } from "./stats";

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

interface HabitState {
  checkins: string[];
  makeup?: number;
  makeupEarned?: string;
  patched?: string[];
  settings: { restDay?: number };
}

export const restOf = (st: { settings: { restDay?: number } }) => {
  const r = st.settings.restDay;
  return typeof r === "number" && r >= 0 && r <= 6 ? r : -1;
};

export const isRestDay = (day: string, rest: number) => rest >= 0 && weekdayOf(day) === rest;

/** 当前连续天数（算上休息日） */
export const curStreak = (st: HabitState, day: string) => streak(st.checkins, day, restOf(st));
export const bestStreak = (st: HabitState) => longestStreak(st.checkins, restOf(st));

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
  const rest = restOf(st);
  const prev = streak(st.checkins, day, rest);
  const have = Math.max(0, Math.min(MAKEUP_MAX, st.makeup ?? 0));
  if (st.checkins.includes(day)) return { checkins: st.checkins, makeup: have, makeupEarned: st.makeupEarned, streak: prev, earned: false, milestone: null };
  const checkins = [...st.checkins, day].sort();
  const next = streak(checkins, day, rest);
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
  return (st.makeup ?? 0) > 0 && !st.checkins.includes(y) && !isRestDay(y, restOf(st));
}

/** 补上昨天之后的连续天数（预览用） */
export function patchedStreak(st: HabitState, day: string): number {
  return streak([...st.checkins, addDays(day, -1)], day, restOf(st));
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
  const rest = restOf(st);
  const prev = streak(st.checkins, day, rest);
  const checkins = [...st.checkins, y].sort();
  const next = streak(checkins, day, rest);
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
