/** 11.8 · Jobs 评审 r8 的回归测试：自定考试日比自动场次晚不提前「考完了」、6 月场次估算、考试当天临时推迟、30 天规则的提前提示 */
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

const { examDayOn, examTaken, examGapClash, postponedOn, acceptedSnapExams, harvestExamDays, curStreak, officialDay } = await import("./habit");
const { passedExam, examOf, juneSaturday, secondSaturday, OFFICIAL_EXAMS } = await import("./examdate");
const { initialState } = await import("./store");
const { examActiveIn } = await import("./store");
const { addDays } = await import("./srs");
type AppState = import("./store").AppState;
type DayRule = import("./habit").DayRule;

const st0 = (o: Partial<AppState> = {}): AppState => ({ ...initialState(), onboarded: true, ...o });
const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
/** from..to 每天一份快照，考试日都记 e */
const rules = (from: string, n: number, e: string, extra: Record<string, DayRule> = {}) => ({
  ...Object.fromEntries(range(from, n).map((d) => [d, { g: 20, r: 5, e } as DayRule])),
  ...extra,
});

describe("R8-1 6 月场次估算：落在 6 月 11–17 日的星期六", () => {
  const past: Record<number, string> = { 2019: "2019-06-15", 2021: "2021-06-12", 2022: "2022-06-11", 2023: "2023-06-17", 2024: "2024-06-15", 2025: "2025-06-14", 2026: "2026-06-13" };
  it("近 7 场 6 月考试全部对上", () => {
    for (const [y, d] of Object.entries(past)) expect(juneSaturday(Number(y))).toBe(d);
  });
  it("「第二个周六」对不上 2019 / 2023 / 2024（旧规则的错）", () => {
    expect([2019, 2023, 2024].map((y) => secondSaturday(y, 6))).toEqual(["2019-06-08", "2023-06-10", "2024-06-08"]);
  });
  it("没公布的 6 月用新规则：2027-06-12，2028-06-17（第二个周六是 06-10）", () => {
    expect(examOf(2027, 6)).toEqual({ day: "2027-06-12", official: false });
    expect(examOf(2028, 6)).toEqual({ day: "2028-06-17", official: false });
    expect(officialDay("2028-06-17")).toBe(true);
    expect(officialDay("2028-06-10")).toBe(false);
  });
  it("12 月照旧：已公布的用官方，2027-12 按第二个周六", () => {
    expect(examOf(2026, 12)).toEqual({ day: "2026-12-12", official: true });
    expect(examOf(2027, 12).day).toBe("2027-12-11");
    expect(OFFICIAL_EXAMS).toContain("2026-12-12");
  });
});

describe("R8-1 自定考试日比自动场次晚：自定日期说了算", () => {
  // 4 月就把考试日设成 06-19，每天学
  const june = (): AppState =>
    st0({ checkins: range("2027-04-20", 54), settings: { ...initialState().settings, examDate: "2027-06-19" }, dayRule: rules("2027-05-24", 21, "2027-06-19") });
  it("06-13 … 06-18：不返回已经过去的预估场次 06-12", () => {
    const st = june();
    for (const d of range("2027-06-13", 6)) expect(passedExam(d, "2027-06-19", undefined, examActiveIn(st), (x) => examTaken(st, x))).toBeNull();
  });
  it("06-12 那场不是他考的：examTaken = false，30 天规则也不拿它挡 06-19", () => {
    const st = june();
    expect(examTaken(st, "2027-06-12")).toBe(false);
    expect(examGapClash(st, "2027-06-19")).toBeNull();
  });
  it("06-20 问的是 06-19 那场（自定）", () => {
    const st = june();
    expect(passedExam("2027-06-20", "2027-06-19", undefined, examActiveIn(st), (x) => examTaken(st, x))).toEqual({ day: "2027-06-19", custom: true });
  });
  it("12 月推迟（12-05 改成 12-19）：12-13 … 12-18 不提前「考完了」", () => {
    const st = st0({
      checkins: range("2026-11-01", 40),
      settings: { ...initialState().settings, examDate: "2026-12-19" },
      dayRule: { ...rules("2026-11-20", 15, "2026-12-12"), ...rules("2026-12-05", 9, "2026-12-19") },
    });
    for (const d of range("2026-12-13", 6)) expect(passedExam(d, "2026-12-19", undefined, examActiveIn(st), (x) => examTaken(st, x))).toBeNull();
  });
  it("官方 12-12 用户（没自定）12-13 照常问「考完了吗」", () => {
    const st = st0({ checkins: range("2026-11-01", 41), dayRule: rules("2026-11-25", 18, "2026-12-12") });
    expect(passedExam("2026-12-13", "", undefined, examActiveIn(st), (x) => examTaken(st, x))).toEqual({ day: "2026-12-12", custom: false });
  });
  it("官方那场按快照确实考了、之后才定了更晚的自定日期：照常问 12-12 那场", () => {
    const st = st0({ checkins: range("2026-11-01", 41), dayRule: rules("2026-11-25", 18, "2026-12-12") });
    expect(examTaken(st, "2026-12-12")).toBe(true);
    expect(passedExam("2026-12-13", "2027-06-12", undefined, examActiveIn(st), (x) => examTaken(st, x))).toEqual({ day: "2026-12-12", custom: false });
  });
});

describe("R8-4 考试当天临时推迟", () => {
  // 连续 40 天（11-02 … 12-11），12-11 的快照记 12-12；12-12 早上改成 12-19（当天快照 e = 12-19）
  const base = () =>
    st0({
      checkins: range("2026-11-02", 40),
      settings: { ...initialState().settings, examDate: "2026-12-19" },
      dayRule: { ...rules("2026-11-22", 20, "2026-12-12"), "2026-12-12": { g: 0, r: 0, x: 2, e: "2026-12-19" } },
    });
  it("当天推迟到 30 天内 = 推迟：12-12 不记成考过的一场，当天照旧免打卡", () => {
    const st = base();
    expect(postponedOn(st.dayRule, "2026-12-12")).toBe(true);
    expect(acceptedSnapExams(st).has("2026-12-12")).toBe(false);
    expect(harvestExamDays(st.dayRule, st.examDays, "2026-12-13")).toBeUndefined();
    expect(examDayOn(st, "2026-12-12")).toBe(true);
  });
  it("12-19 算一场：12-18 考前一天、12-19 不学，火苗保住（≥ 45）", () => {
    const st = base();
    const r: Record<string, DayRule> = { ...st.dayRule! };
    for (const d of range("2026-12-13", 5)) r[d] = { g: 20, r: 5, e: "2026-12-19" };
    r["2026-12-18"] = { g: 0, r: 0, x: 1, e: "2026-12-19" };
    const s2 = { ...st, dayRule: r, checkins: [...st.checkins, ...range("2026-12-13", 5)] };
    expect(examGapClash(s2, "2026-12-19")).toBeNull();
    expect(examDayOn(s2, "2026-12-19")).toBe(true);
    expect(curStreak(s2, "2026-12-20")).toBeGreaterThanOrEqual(45);
  });
  it("考完了再推迟不算：examDone = 12-12 时 12-12 照样算考过，12-19 被 30 天规则挡、有提示", () => {
    const st = { ...base(), examDone: "2026-12-12" };
    expect(acceptedSnapExams(st).has("2026-12-12")).toBe(true);
    expect(examGapClash(st, "2026-12-19")).toBe("2026-12-12");
  });
  it("考完当晚定下明年 6 月（> 30 天）不算推迟：12-12 照样算考过", () => {
    const st = st0({ checkins: range("2026-11-02", 40), dayRule: { ...rules("2026-11-22", 20, "2026-12-12"), "2026-12-12": { g: 0, r: 0, x: 2, e: "2027-06-12" } } });
    expect(postponedOn(st.dayRule, "2026-12-12")).toBe(false);
    expect(acceptedSnapExams(st).has("2026-12-12")).toBe(true);
  });
  it("自定的考试日当天再往后挪不算推迟（R7-6 的漏洞不回来）", () => {
    const r = { "2026-10-01": { g: 0, r: 0, e: "2026-10-02" }, "2026-10-02": { g: 0, r: 0, x: 2, e: "2026-10-03" } } as Record<string, DayRule>;
    expect(postponedOn(r, "2026-10-02")).toBe(false);
    expect(acceptedSnapExams(st0({ dayRule: r })).has("2026-10-02")).toBe(true);
  });
});
