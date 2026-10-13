/** 11.7 · Jobs 评审 r7 的回归测试：考前一天一个规则（按词数 / 按时长）、替用户打卡也庆祝里程碑、预测不重复算今天、考试日改来改去不能无限续 */
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as (number | null | undefined)[]);
vi.mock("./celebrate", () => ({ celebrate: (n: number | null | undefined) => calls.push(n) }));

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

const { curStreak, brokenStreak, skipDay, eveFree, examDayOn, harvestExamDays, acceptedSnapExams, EXAM_GAP } = await import("./habit");
const { initialState, replaceState, getState, setSettings, setDayRuleSource, takeFreeze } = await import("./store");
const { examForecast } = await import("./exam");
const { today } = await import("./clock");
const { addDays } = await import("./srs");
type AppState = import("./store").AppState;
type DayRule = import("./habit").DayRule;

const T = today();
const st0 = (o: Partial<AppState> = {}): AppState => ({ ...initialState(), onboarded: true, ...o });
const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

describe("R7-1 考前一天：按词数、按时长同一个规则", () => {
  it("官方考前一天（12-11）、按时长 20 分钟、没有复习：eveFree = true，结算不断签", () => {
    const eve = "2026-12-11";
    const rule: DayRule = { g: 0, r: 0, t: 20, x: 1, e: "2026-12-12" };
    const st = st0({ checkins: range("2026-12-03", 8), dayRule: { [eve]: rule } });
    expect(eveFree(st, eve)).toBe(true);
    expect(skipDay(st, eve)).toBe(true);
    expect(curStreak(st, "2026-12-13")).toBe(8);
    // 首页第一次渲染还没有快照时传 rule 进去，结果一样
    expect(eveFree(st0({ checkins: st.checkins }), eve, rule)).toBe(true);
  });
  it("有复习的时长模式考前一天照旧要做", () => {
    expect(eveFree(st0(), "2026-12-11", { g: 0, r: 6, t: 20, x: 1, e: "2026-12-12" })).toBe(false);
  });
});

describe("R7-6 自定考试日改来改去不能无限续连续天数", () => {
  // 连续 8 天（09-23 … 09-30），10 月没有官方场次
  const chain = (): AppState =>
    st0({
      checkins: range("2026-09-23", 8),
      dayRule: {
        "2026-10-01": { g: 0, r: 0, e: "2026-10-02" },
        "2026-10-02": { g: 0, r: 0, x: 2, e: "2026-10-03" },
        "2026-10-03": { g: 0, r: 0, e: "2026-10-04" },
        "2026-10-04": { g: 0, r: 0, x: 2, e: "2026-10-05" },
      },
    });
  it("第一场（当天改成明天）照常免打卡：考前一天 + 考试当天", () => {
    const st = chain();
    expect(skipDay(st, "2026-10-01")).toBe(true);
    expect(examDayOn(st, "2026-10-02")).toBe(true);
  });
  it("30 天内再改出来的考试日不算：第 3 天要打卡，第 4 天连续归零", () => {
    const st = chain();
    expect(examDayOn(st, "2026-10-03")).toBe(false);
    expect(skipDay(st, "2026-10-03")).toBe(false);
    expect(curStreak(st, "2026-10-03")).toBe(8);
    expect(brokenStreak(st, "2026-10-04")).toBe(8);
    expect(curStreak(st, "2026-10-04")).toBe(0);
    expect(skipDay(st, "2026-10-04")).toBe(false);
    expect([...acceptedSnapExams(st)]).toEqual(["2026-10-02"]);
  });
  it("只记下算数的那一场", () => {
    expect(harvestExamDays(chain().dayRule, undefined, "2026-10-10")).toEqual(["2026-10-02"]);
  });
  it(`离上一场记下的考试日满 ${EXAM_GAP} 天才算`, () => {
    const rules = { "2026-10-01": { g: 0, r: 0, e: "2026-10-02" } };
    expect(eveFree(st0({ dayRule: rules, examDays: [addDays("2026-10-02", -EXAM_GAP)] }), "2026-10-01")).toBe(true);
    expect(eveFree(st0({ dayRule: rules, examDays: [addDays("2026-10-02", -(EXAM_GAP - 1))] }), "2026-10-01")).toBe(false);
    expect(eveFree(st0({ dayRule: rules, examDone: "2026-09-20" }), "2026-10-01")).toBe(false);
  });
  it("官方场次不受限；已经记下的考试日（例如合并来的）照样算", () => {
    const st = st0({ examDays: ["2026-12-05"], dayRule: { "2026-12-11": { g: 0, r: 0, x: 1, e: "2026-12-12" } } });
    expect(eveFree(st, "2026-12-11")).toBe(true);
    expect(examDayOn(st, "2026-12-12")).toBe(true);
    expect(examDayOn(st0({ examDays: ["2026-12-12", "2026-12-19"] }), "2026-12-19")).toBe(true);
  });
});

describe("R7-3 替用户打卡跨过里程碑也全屏庆祝", () => {
  it("连续 29 天、今天 10/10 → 改成 30：替用户打卡，milestone 30，调用 celebrate(30)", async () => {
    setDayRuleSource((st, d) => {
      const log = st.log[d] ?? { n: 0, r: 0, ms: 0 };
      return { rule: { g: st.settings.daily, r: 0 }, ready: log.n >= st.settings.daily, checked: st.checkins.includes(d) };
    });
    const days = Array.from({ length: 29 }, (_, i) => addDays(T, -(29 - i)));
    replaceState(st0({ checkins: days, log: { [T]: { n: 10, r: 0, ok: 10, a: 10, ms: 60000 } }, dayRule: { [T]: { g: 10, r: 0 } }, settings: { ...initialState().settings, daily: 10 } }));
    takeFreeze();
    calls.length = 0;
    setSettings({ daily: 30 });
    expect(getState().checkins).toContain(T);
    expect(takeFreeze()).toEqual({ day: T, streak: 30, milestone: 30 });
    await Promise.resolve();
    expect(calls).toContain(30);
    setDayRuleSource(null);
  });
});

describe("R7-4 考前预测不重复算今天", () => {
  it("学之前 / 学完今天的 20 个 / 第二天：已学 + reach 不变，来不及不变", () => {
    const ex = addDays(T, 59);
    const before = examForecast(T, ex, 4544, 20, false, 20);
    const after = examForecast(T, ex, 4524, 20, false, 0);
    const next = examForecast(addDays(T, 1), ex, 4524, 20, false, 20);
    expect(before.reach).toBe(900);
    expect(before.left).toBe(3644);
    expect(20 + after.reach).toBe(900);
    expect(after.left).toBe(3644);
    expect(20 + next.reach).toBe(900);
    expect(next.left).toBe(3644);
    // 学了一半：只算今天剩下的
    expect(10 + examForecast(T, ex, 4534, 20, false, 10).reach).toBe(900);
  });
});
