/** 11.2 · 考试日期（从 exam.ts 拆出来，plan.ts / coach.ts 也能用，不形成循环依赖） */
import { addDays, diffDays } from "./srs";

// ---------------------------------------------------------------- 考试日期

/** 已公布的笔试日期（12/2026 来自中国教育考试网 cet.neea.edu.cn 2026-09-02 公告） */
export const OFFICIAL_EXAMS = ["2024-06-15", "2024-12-14", "2025-06-14", "2025-12-13", "2026-06-13", "2026-12-12"];

/** 某年某月的第二个星期六（未公布的场次按近年规律预估） */
export function secondSaturday(year: number, month: number): string {
  const d = new Date(year, month - 1, 1, 12);
  const first = 1 + ((6 - d.getDay() + 7) % 7);
  const day = first + 7;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 11.8 · 6 月场次：落在 6 月 11–17 日之间的那个星期六（r8 R8-1）。
 * 核对过 2019-06-15、2021-06-12、2022-06-11、2023-06-17、2024-06-15、2025-06-14、2026-06-13：7 场全中；
 * 「第二个周六」只中 4 场（2019、2023、2024 是第三个周六），「第三个周六」只中 3 场（2021、2022、2025、2026 是第二个）。
 * 12 月没有这么整齐（2021-12-18、2022-12-10、2023-12-16），照旧按第二个周六估（近 7 场中 5 场）。
 */
export function juneSaturday(year: number): string {
  const d = new Date(year, 5, 11, 12);
  const day = 11 + ((6 - d.getDay() + 7) % 7);
  return `${year}-06-${String(day).padStart(2, "0")}`;
}

/** 某一场（年 + 6/12 月）的日期：已公布用官方日期，否则预估 */
export function examOf(year: number, month: 6 | 12): { day: string; official: boolean } {
  const pre = `${year}-${String(month).padStart(2, "0")}`;
  const hit = OFFICIAL_EXAMS.find((d) => d.startsWith(pre));
  return hit ? { day: hit, official: true } : { day: month === 6 ? juneSaturday(year) : secondSaturday(year, month), official: false };
}

/** 从今天起接下来的 n 场考试（考试当天也算「接下来」） */
export function upcomingExams(today: string, n = 2): { day: string; official: boolean }[] {
  const out: { day: string; official: boolean }[] = [];
  let y = Number(today.slice(0, 4));
  let m: 6 | 12 = 6;
  while (out.length < n) {
    const e = examOf(y, m);
    if (e.day >= today) out.push(e);
    if (m === 6) m = 12;
    else {
      m = 6;
      y += 1;
    }
  }
  return out;
}

export function nextExamDate(today: string): string {
  return upcomingExams(today, 1)[0].day;
}

/** 实际使用的考试日：用户设置的日期还没过就用它，否则自动换成下一场 */
export function effectiveExam(today: string, setting?: string): { day: string; custom: boolean } {
  if (setting && /^\d{4}-\d{2}-\d{2}$/.test(setting) && setting >= today) return { day: setting, custom: true };
  return { day: nextExamDate(today), custom: false };
}

/** 距离考试还有几天（考试当天 = 0） */
export function daysUntil(today: string, exam: string): number {
  return Math.max(0, diffDays(today, exam));
}


// ---------------------------------------------------------------- 11.2 · 考前模式 / 考完了

/** 考试当天或前一天：只复习、不报学完日期、不出新的计划建议 */
export const EXAM_MODE_DAYS = 1;
export function examModeOn(today: string, setting?: string): boolean {
  return daysUntil(today, effectiveExam(today, setting).day) <= EXAM_MODE_DAYS;
}

/** 考后多少天内还会问「考完了吗」（自动场次；自定日期过了总是问） */
export const EXAM_OVER_WINDOW = 30;

/**
 * 刚考完的那一场：自定日期已经过了；或者自动场次已经过去、用户考前在用（考后 30 天内，或者考后还没打开过）。
 * 已经确认过（examDone）的不再返回。
 */
export function passedExam(
  today: string,
  setting: string | undefined,
  done: string | undefined,
  activeIn: (from: string, to: string) => boolean,
  taken?: (d: string) => boolean,
): { day: string; custom: boolean } | null {
  const valid = !!setting && /^\d{4}-\d{2}-\d{2}$/.test(setting);
  if (valid && setting! < today) return setting === done ? null : { day: setting!, custom: true };
  const y = Number(today.slice(0, 4));
  const cands = [examOf(y - 1, 12), examOf(y, 6), examOf(y, 12)].map((e) => e.day).filter((d) => d < today);
  const last = cands.sort().pop();
  // 11.5 · 确认过的是这一场或者更晚的一场（例如自定的 12-19）：不再冒出更早的官方场次
  if (!last || (!!done && done >= last)) return null;
  // 11.8 · 自定的考试日还没到、比这场自动场次晚：自定日期说了算，除非按每天的快照那一场确实是他考的（taken：
  // 考前一天的快照记的就是它、当天没有推迟），不然官方那天一过不能就「考完了」（r8 R8-1）
  if (valid && setting! > last && !taken?.(last)) return null;
  // 11.3 · 考前半年里用过就算在备考这一场（不再要求「考前一个月在学」）；
  // 考后 30 天内问；更久才回来、考后一次都没打开过的也问（不静默换成下一场）
  if (!activeIn(addDays(last, -EXAM_PREP_DAYS), last)) return null;
  const within = diffDays(last, today) <= EXAM_OVER_WINDOW;
  return within || !activeIn(addDays(last, 1), addDays(today, -1)) ? { day: last, custom: false } : null;
}

/** 11.3 · 考前多少天内用过 app 就算在备考这一场 */
export const EXAM_PREP_DAYS = 180;
