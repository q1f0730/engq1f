/** 11.6 · Jobs 评审 r6 的回归测试：已完成的今天不收回、合并导入保留考试日、考前一天无事可做不断签、统一的考前预测 */
import { describe, expect, it } from "vitest";

const mem = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
g.localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};
g.window = { matchMedia: () => ({ matches: false }) };
const el = { classList: { contains: () => false, remove: () => {}, add: () => {} }, setAttribute: () => {} };
g.document = { documentElement: el, querySelector: () => null };

const { autoCredit, curStreak, brokenStreak, skipDay, idleExamEve } = await import("./habit");
const { initialState, replaceState, getState, setSettings, setDayRuleSource, takeFreeze } = await import("./store");
const { mergeStates } = await import("./sync");
const { capReach, examForecast, reserveDays, daysUntil } = await import("./exam");
const { today } = await import("./clock");
const { addDays } = await import("./srs");
type AppState = import("./store").AppState;
type DayRule = import("./habit").DayRule;

const T = today();
const st0 = (o: Partial<AppState> = {}): AppState => ({ ...initialState(), onboarded: true, ...o });
const L = (n: number, r = 0, ms = 60000) => ({ n, r, ok: n + r, a: n + r, ms });
const back = (k: number) => addDays(T, -k);
const days = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => back(from - i));

/** 测试用的「今天的规则」：按设置里的每日新词 / 打卡标准算（不需要词库）；book = core 时目标翻倍不影响判断 */
function fakeSource(st: AppState, d: string) {
  const log = st.log[d] ?? { n: 0, r: 0, ms: 0 };
  const time = st.settings.goalMode === "time";
  const rule: DayRule = { g: st.settings.daily, r: 0, ...(time ? { t: st.settings.goalMin || 20 } : {}) };
  const ready = time ? (log.ms ?? 0) >= rule.t! * 60000 : log.n >= rule.g;
  return { rule, ready, checked: st.checkins.includes(d) };
}

describe("R6-1 今天已经完成：之后调高任务不收回", () => {
  it("连续 12 天、今天 20/20 达标没打卡 → 改学核心词每天 40 个：今天替用户打卡，明天连续 13，不说「断了」", () => {
    setDayRuleSource(fakeSource);
    replaceState(st0({ checkins: days(12, 1), goalMet: [T], log: { [T]: L(20) }, dayRule: { [T]: { g: 20, r: 0 } }, settings: { ...initialState().settings, daily: 20, book: "all" } }));
    takeFreeze();
    setSettings({ book: "core", daily: 40 });
    const s = getState();
    expect(s.checkins).toContain(T);
    expect(s.goalMet).toContain(T);
    expect(s.dayRule?.[T]?.g).toBe(40);
    expect(takeFreeze()).toEqual({ day: T, streak: 13 });
    const D1 = addDays(T, 1);
    expect(brokenStreak(s, D1)).toBe(0);
    expect(curStreak({ ...s, checkins: [...s.checkins, D1] }, D1)).toBe(14);
    expect(curStreak(s, T)).toBe(13);
  });
  it("10/10 达标（还没记 goalMet，只是按改之前的规则已经达标）→ 改成 30：今天替用户打卡，明天不断", () => {
    setDayRuleSource(fakeSource);
    replaceState(st0({ checkins: days(12, 1), log: { [T]: L(10) }, dayRule: { [T]: { g: 10, r: 0 } }, settings: { ...initialState().settings, daily: 10 } }));
    setSettings({ daily: 30 });
    const s = getState();
    expect(s.checkins).toContain(T);
    expect(brokenStreak(s, addDays(T, 1))).toBe(0);
    expect(curStreak(s, T)).toBe(13);
  });
  it("按时长已达标 → 换成按词数（不达标）：今天替用户打卡", () => {
    setDayRuleSource(fakeSource);
    replaceState(st0({ checkins: days(5, 1), goalMet: [T], log: { [T]: L(3, 0, 12 * 60000) }, settings: { ...initialState().settings, daily: 20, goalMode: "time", goalMin: 10 } }));
    setSettings({ goalMode: "words" });
    expect(getState().checkins).toContain(T);
    expect(curStreak(getState(), T)).toBe(6);
  });
  it("R5-1 照旧：还没达标就调高 → 不打卡、不记完成，明天不补", () => {
    setDayRuleSource(fakeSource);
    replaceState(st0({ checkins: days(3, 1), log: { [T]: L(5) }, dayRule: { [T]: { g: 10, r: 0 } }, settings: { ...initialState().settings, daily: 10 } }));
    takeFreeze();
    setSettings({ daily: 30 });
    replaceState({ ...getState(), log: { [T]: L(10) } });
    const s = getState();
    expect(s.checkins.includes(T)).toBe(false);
    expect(s.goalMet?.includes(T) ?? false).toBe(false);
    expect(autoCredit(s, addDays(T, 1))).toBeNull();
    expect(takeFreeze()).toBeNull();
  });
  it("往下调照旧能完成今天（只记 goalMet，不替用户打卡）", () => {
    setDayRuleSource(fakeSource);
    replaceState(st0({ checkins: days(3, 1), log: { [T]: L(10) }, dayRule: { [T]: { g: 20, r: 0 } }, settings: { ...initialState().settings, daily: 20 } }));
    setSettings({ daily: 10 });
    const s = getState();
    expect(s.goalMet).toContain(T);
    expect(s.checkins.includes(T)).toBe(false);
    expect(autoCredit(s, addDays(T, 1))?.days).toEqual([T]);
  });
  it("已经达标、改动没有调高（仍达标）：不多打卡", () => {
    setDayRuleSource(fakeSource);
    replaceState(st0({ goalMet: [T], log: { [T]: L(20) }, settings: { ...initialState().settings, daily: 20 } }));
    setSettings({ daily: 15 });
    expect(getState().checkins.includes(T)).toBe(false);
    expect(getState().goalMet).toContain(T);
  });
  it("词库还没加载时也一样：已经完成过的今天不收回", () => {
    replaceState(st0({ goalMet: [T], log: { [T]: L(20) }, dayRule: { [T]: { g: 20, r: 0 } }, settings: { ...initialState().settings, daily: 20 } }));
    setDayRuleSource(() => null);
    setSettings({ daily: 40 });
    expect(getState().checkins).toContain(T);
    expect(getState().dayRule?.[T]).toBeUndefined();
    setDayRuleSource(fakeSource);
  });
});

describe("R6-3 合并导入：考试日取并集", () => {
  it("备份里记着 12-19 那场（examDays / examDone）：合并后保留，连续天数不断", () => {
    const X = back(10);
    const remoteDays = days(40, 1).filter((d) => d !== X);
    const remote = st0({ checkins: remoteDays, examDays: [back(17), X], examDone: X });
    const local = st0({ checkins: [back(1)], examDays: [back(17)] });
    const { state } = mergeStates(local, remote);
    expect(state.examDays).toContain(X);
    expect(state.examDays).toContain(back(17));
    expect(state.examDone).toBe(X);
    expect(skipDay(state, X)).toBe(true);
    expect(curStreak(state, T)).toBe(39);
  });
  it("examDone 取较晚的；并集最多 12 个；两边都没有时保持 undefined", () => {
    const a = st0({ examDone: back(100), examDays: Array.from({ length: 8 }, (_, i) => back(300 - i * 10)) });
    const b = st0({ examDone: back(5), examDays: Array.from({ length: 8 }, (_, i) => back(200 - i * 10)) });
    const { state } = mergeStates(a, b);
    expect(state.examDone).toBe(back(5));
    expect(state.examDays?.length).toBe(12);
    expect(state.examDays?.[11]).toBe(back(130));
    const { state: e } = mergeStates(st0(), st0());
    expect(e.examDays).toBeUndefined();
    expect(e.examDone).toBeUndefined();
  });
  it("合并后按快照补一遍：备份快照里能确认的考试日也写进 examDays", () => {
    const X = back(3);
    const remote = st0({ dayRule: { [back(4)]: { g: 0, r: 0, x: 1, e: X } } });
    const { state } = mergeStates(st0(), remote);
    expect(state.examDays).toContain(X);
  });
});

describe("R6-5 考前一天什么都不用做：不算断签", () => {
  it("连续 8 天、今天没学 → 当天改成明天考试（快照 g=0, r=0, e=明天，没有 x）：今天不断签", () => {
    const D1 = addDays(T, 1);
    const st = st0({ checkins: days(8, 1), dayRule: { [T]: { g: 0, r: 0, e: D1 } }, settings: { ...initialState().settings, examDate: D1 } });
    expect(idleExamEve(st.dayRule![T], T)).toBe(true);
    expect(skipDay(st, T)).toBe(true);
    // 明天（考试日）：昨天不算断签，连续还是 8
    expect(brokenStreak(st, D1)).toBe(0);
    expect(curStreak(st, D1)).toBe(8);
  });
  it("有任务（有复习 / 有新词）的考前一天照旧要完成", () => {
    const D1 = addDays(T, 1);
    expect(idleExamEve({ g: 0, r: 5, e: D1 }, T)).toBe(false);
    expect(idleExamEve({ g: 10, r: 0, e: D1 }, T)).toBe(false);
    expect(idleExamEve({ g: 0, r: 0, e: addDays(T, 5) }, T)).toBe(false);
    expect(idleExamEve({ g: 0, r: 0, p: 1 }, T)).toBe(false);
    expect(idleExamEve({ g: 0, r: 0, x: 1 }, T)).toBe(true);
  });
});

describe("R6-6 首页和统计页共用一个考前预测", () => {
  it("examForecast = capReach（扣掉只复习的天数），考前模式不排新词", () => {
    const ex = addDays(T, 59);
    const f = examForecast(T, ex, 4544, 20, false);
    expect(f.reach).toBe(capReach(T, ex, 4544, 20));
    expect(f.reach).toBe(20 * (daysUntil(T, ex) - reserveDays(daysUntil(T, ex))));
    expect(f.reach).toBe(900);
    expect(f.left).toBe(4544 - 900);
    expect(examForecast(T, addDays(T, 1), 500, 20, true)).toEqual({ reach: 0, left: 500, examMode: true });
    expect(examForecast(T, ex, 0, 20, false).reach).toBe(0);
    expect(examForecast(T, ex, 300, 20, false)).toEqual({ reach: 300, left: 0, examMode: false });
  });
});
