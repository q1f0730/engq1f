/** 11.4 · Jobs 评审 r4 的回归测试：每天的任务快照、考试日不断签、备份日期 */
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

const { autoCredit, dayMet, ruleMet, brokenStreak, curStreak, bestStreak, canPatch, skipDay, skipKind, examDayOn, STREAK_WARN_MIN } = await import("./habit");
const { parseBackup, initialState, normalize, exportBackup, replaceState, getState, snapDayRule } = await import("./store");
const { dayRuleOf, summarize } = await import("./plan");
const { mergeStates } = await import("./sync");
const { addDays } = await import("./srs");
type AppState = import("./store").AppState;
type WordIndex = import("./data").WordIndex;

const T = "2026-10-14";
const Y = addDays(T, -1);
const days = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => addDays(T, -(a + k)));
const st0 = (o: Partial<AppState> = {}): AppState => ({ ...initialState(), onboarded: true, ...o });
const L = (n: number, r = 0, ms = 60000) => ({ n, r, ok: n + r, a: n + r, ms });

describe("R4-1 补记只认当天的规则", () => {
  it("昨天学 10 个、当天目标 20：今天把每日新词改成 10 也不补", () => {
    const st = st0({ checkins: days(2, 6), dayRule: { [Y]: { g: 20, r: 0 } }, log: { [Y]: L(10) } });
    st.settings = { ...st.settings, daily: 10 };
    expect(dayMet(st, Y)).toBe(false);
    expect(autoCredit(st, T)).toBeNull();
  });
  it("换成按时长打卡：过去按词数没完成的日子不补（快照里是按词数）", () => {
    const st = st0({ checkins: days(3, 6), dayRule: { [Y]: { g: 20, r: 0 }, [addDays(T, -2)]: { g: 20, r: 0 } }, log: { [Y]: L(5, 0, 12 * 60000), [addDays(T, -2)]: L(5, 0, 11 * 60000) } });
    st.settings = { ...st.settings, goalMode: "time", goalMin: 10 };
    expect(autoCredit(st, T)).toBeNull();
  });
  it("新词达标、复习还剩 40（当天卡片写着「还需复习 40」）：第二天也不补", () => {
    const st = st0({ dayRule: { [Y]: { g: 20, r: 40 } }, log: { [Y]: L(20, 0) } });
    expect(dayMet(st, Y)).toBe(false);
    expect(autoCredit(st, T)).toBeNull();
    // 复习也做完了才算
    expect(dayMet({ ...st, log: { [Y]: L(20, 40) } }, Y)).toBe(true);
  });
  it("没有快照、也没有当天记下的「任务完成」：判断不了就不补", () => {
    expect(autoCredit(st0({ log: { [Y]: L(50, 50) } }), T)).toBeNull();
  });
  it("当天记下的「任务完成」照样补（当天用当天的完整规则判断过）", () => {
    const st = st0({ checkins: days(2, 3), goalMet: [Y], log: { [Y]: L(10) } });
    expect(autoCredit(st, T)?.days).toEqual([Y]);
  });
  it("按时长的快照：学满当天的分钟数才算", () => {
    expect(ruleMet({ g: 20, r: 0, t: 10 }, L(0, 3, 11 * 60000))).toBe(true);
    expect(ruleMet({ g: 20, r: 0, t: 10 }, L(30, 3, 9 * 60000))).toBe(false);
    // 什么都没做的一天不算
    expect(ruleMet({ g: 0, r: 0 }, L(0, 0))).toBe(false);
  });
});

describe("R4-1 每天的任务快照", () => {
  const index = { list: Array.from({ length: 30 }, (_, k) => ({ w: `w${k}`, c: 1 })), coreCount: 30, map: new Map() } as unknown as WordIndex;
  it("按当天的设置记下：新词目标、要做完的复习、打卡标准", () => {
    const st = st0();
    st.settings = { ...st.settings, daily: 20 };
    const r = dayRuleOf(summarize(index, st, T));
    expect(r).toEqual({ g: 20, r: 0 });
    st.settings = { ...st.settings, goalMode: "time", goalMin: 10 };
    expect(dayRuleOf(summarize(index, st, T)).t).toBe(10);
  });
  it("只记第一次：之后改设置不改这一天的标准", () => {
    replaceState(st0());
    snapDayRule(T, { g: 20, r: 5 });
    snapDayRule(T, { g: 10, r: 0 });
    expect(getState().dayRule?.[T]).toEqual({ g: 20, r: 5 });
  });
  it("存档 / 备份里坏掉的快照被清掉，好的留下；只留最近 21 天", () => {
    const raw = { ...st0(), dayRule: { [T]: { g: 20, r: 3, t: 0, x: 5 }, bad: { g: 1, r: 1 }, [Y]: { g: -1, r: 0 } } };
    expect(normalize(raw).dayRule).toEqual({ [T]: { g: 20, r: 3 } });
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, k) => [addDays(T, -k), { g: 10, r: 0 }]));
    expect(Object.keys(normalize({ ...st0(), dayRule: many }).dayRule ?? {}).length).toBe(21);
  });
  it("两个窗口合并：先记下的快照为准，「任务完成」两边都算", () => {
    const a = st0({ dayRule: { [T]: { g: 20, r: 0 } }, goalMet: [Y] });
    const b = st0({ dayRule: { [T]: { g: 10, r: 0 }, [Y]: { g: 20, r: 0 } }, goalMet: [addDays(T, -2)] });
    const m = mergeStates(a, b).state;
    expect(m.dayRule).toEqual({ [T]: { g: 20, r: 0 }, [Y]: { g: 20, r: 0 } });
    expect(m.goalMet).toEqual([addDays(T, -2), Y]);
  });
});

describe("R4-2 考试当天 / 休息不断签", () => {
  const E = "2026-12-12";
  const D1 = "2026-12-13";
  const before = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => addDays(E, -(a + k)));
  it("考前连续 14 天、考试当天没打开：第二天连续还是 14，没有「断了」", () => {
    const st = st0({ checkins: before(1, 14) });
    expect(examDayOn(st, E)).toBe(true);
    expect(curStreak(st, D1)).toBe(14);
    expect(brokenStreak(st, D1)).toBe(0);
    expect(canPatch({ ...st, makeup: 2 }, D1)).toBe(false);
    expect(skipKind(st, E)).toBe("exam");
  });
  it("自定的考试日、确认过考完的那一场也算", () => {
    const C = "2026-11-20";
    const st = st0({ checkins: [addDays(C, -2), addDays(C, -1)] });
    st.settings = { ...st.settings, examDate: C };
    expect(curStreak(st, addDays(C, 1))).toBe(2);
    expect(curStreak(st0({ checkins: [addDays(C, -1)], examDone: C }), addDays(C, 1))).toBe(1);
  });
  it("考前模式里一点任务都没有的那天（快照）不断；有复习没做的那天照常断", () => {
    const eve = Y;
    expect(skipDay(st0({ dayRule: { [eve]: { g: 0, r: 0, x: 1 } } }), eve)).toBe(true);
    expect(skipDay(st0({ dayRule: { [eve]: { g: 0, r: 30, x: 1 } } }), eve)).toBe(false);
  });
  it("休息期间不断签；最长连续也跳过考试日", () => {
    expect(curStreak(st0({ checkins: days(3, 6), pause: { from: addDays(T, -2) } }), T)).toBe(4);
    expect(bestStreak(st0({ checkins: [...before(1, 3), D1, addDays(D1, 1)] }))).toBe(5);
  });
  it("连续 1–2 天不说「要断了 / 断了」", () => {
    expect(STREAK_WARN_MIN).toBe(3);
  });
});

describe("R4-6 备份带备份日期", () => {
  it("导出的备份里写着今天；从它恢复后 lastBackup = 那一天", () => {
    replaceState(st0({ lastBackup: undefined }));
    const text = exportBackup(true);
    const o = JSON.parse(text);
    expect(o.backupDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(o.state.lastBackup).toBe(o.backupDay);
    expect(parseBackup(text).lastBackup).toBe(o.backupDay);
  });
  it("自动快照不算备份", () => {
    replaceState(st0({ lastBackup: undefined }));
    const o = JSON.parse(exportBackup());
    expect(o.backupDay).toBeUndefined();
    expect(parseBackup(exportBackup()).lastBackup).toBeUndefined();
  });
  it("备份里的日期比存档里的新：用备份的", () => {
    const text = JSON.stringify({ app: "cet4-vocab", version: 1, backupDay: T, state: { ...st0(), lastBackup: "2026-09-01" } });
    expect(parseBackup(text).lastBackup).toBe(T);
  });
});
