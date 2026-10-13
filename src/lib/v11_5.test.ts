/** 11.5 · Jobs 评审 r5 的回归测试：当天最后生效的规则、考试日按快照记、备份日期、时区回跳 */
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

const { autoCredit, curStreak, brokenStreak, examDayOn, snapExamOn, harvestExamDays, skipDay } = await import("./habit");
const { parseBackup, initialState, replaceState, getState, setSettings, setDayRuleSource, snapDayRule, ackExam, BACKUP_VERSION } = await import("./store");
const { passedExam } = await import("./examdate");
const { today } = await import("./clock");
const { addDays } = await import("./srs");
type AppState = import("./store").AppState;
type DayRule = import("./habit").DayRule;

const T = today();
const Y = addDays(T, -1);
const st0 = (o: Partial<AppState> = {}): AppState => ({ ...initialState(), onboarded: true, ...o });
const L = (n: number, r = 0, ms = 60000) => ({ n, r, ok: n + r, a: n + r, ms });
const back = (k: number) => addDays(T, -k);

/** 测试用的「今天的规则」：按设置里的每日新词 / 打卡标准算（不需要词库） */
function fakeSource(st: AppState, d: string) {
  const log = st.log[d] ?? { n: 0, r: 0, ms: 0 };
  const time = st.settings.goalMode === "time";
  const rule: DayRule = { g: st.settings.daily, r: 0, ...(time ? { t: st.settings.goalMin || 20 } : {}), ...(st.settings.examDate ? { e: st.settings.examDate } : {}) };
  if (st.settings.examDate && addDays(d, 1) === st.settings.examDate) rule.x = 1;
  const ready = time ? (log.ms ?? 0) >= rule.t! * 60000 : log.n >= rule.g;
  return { rule, ready, checked: st.checkins.includes(d) };
}

describe("R5-1 当天中途改设置：覆盖今天的快照（当天最后生效的规则）", () => {
  it("快照 g=10 → 改成 30 → 学 10 个：今天的快照变成 30，第二天不补", () => {
    setDayRuleSource(fakeSource);
    replaceState(st0({ checkins: [back(1), back(2)], settings: { ...initialState().settings, daily: 10 } }));
    snapDayRule(T, { g: 10, r: 0 });
    setSettings({ daily: 30 });
    expect(getState().dayRule?.[T]?.g).toBe(30);
    replaceState({ ...getState(), log: { [T]: L(10) } });
    const next = getState();
    expect(next.goalMet?.includes(T) ?? false).toBe(false);
    expect(autoCredit(next, addDays(T, 1))).toBeNull();
  });
  it("按时长 10 分钟已经达标（goalMet）→ 换成按词数 20、只学了 3 个：撤掉今天的「任务完成」，第二天不补", () => {
    setDayRuleSource(fakeSource);
    replaceState(st0({ goalMet: [T], log: { [T]: L(3, 0, 12 * 60000) }, dayRule: { [T]: { g: 20, r: 0, t: 10 } }, settings: { ...initialState().settings, daily: 20, goalMode: "time", goalMin: 10 } }));
    setSettings({ goalMode: "words" });
    const s = getState();
    expect(s.dayRule?.[T]?.t).toBeUndefined();
    expect(s.dayRule?.[T]?.g).toBe(20);
    expect(s.goalMet?.includes(T) ?? false).toBe(false);
    expect(autoCredit(s, addDays(T, 1))).toBeNull();
  });
  it("快照 g=20、学了 10 个 → 改成 10：今天马上记下任务完成，第二天照常补", () => {
    setDayRuleSource(fakeSource);
    replaceState(st0({ checkins: [back(1)], log: { [T]: L(10) }, dayRule: { [T]: { g: 20, r: 0 } }, settings: { ...initialState().settings, daily: 20 } }));
    setSettings({ daily: 10 });
    const s = getState();
    expect(s.dayRule?.[T]?.g).toBe(10);
    expect(s.goalMet).toContain(T);
    expect(autoCredit(s, addDays(T, 1))?.days).toEqual([T]);
  });
  it("只改今天：过去的快照不动", () => {
    setDayRuleSource(fakeSource);
    replaceState(st0({ dayRule: { [Y]: { g: 10, r: 0 }, [T]: { g: 10, r: 0 } }, settings: { ...initialState().settings, daily: 10 } }));
    setSettings({ daily: 50 });
    expect(getState().dayRule?.[Y]).toEqual({ g: 10, r: 0 });
    expect(getState().dayRule?.[T]?.g).toBe(50);
  });
  it("已经打过卡的今天：改设置不撤打卡、不撤任务完成", () => {
    setDayRuleSource(fakeSource);
    replaceState(st0({ checkins: [T], goalMet: [T], log: { [T]: L(10) }, dayRule: { [T]: { g: 10, r: 0 } }, settings: { ...initialState().settings, daily: 10 } }));
    setSettings({ daily: 30 });
    expect(getState().checkins).toContain(T);
    expect(getState().goalMet).toContain(T);
  });
  it("当天才改出来的「考前一天」标记（x）不算：不能临时把今天变成免打卡日", () => {
    setDayRuleSource(fakeSource);
    replaceState(st0({ dayRule: { [T]: { g: 10, r: 0 } }, settings: { ...initialState().settings, daily: 0, examDate: "" } }));
    setSettings({ examDate: addDays(T, 1) });
    const r = getState().dayRule?.[T];
    expect(r?.e).toBe(addDays(T, 1));
    expect(r?.x).toBeUndefined();
    expect(skipDay(getState(), T)).toBe(false);
  });
  it("词库还没加载（拿不到今天的规则）：作废今天的快照和没打卡的任务完成，回首页时重记", () => {
    setDayRuleSource(() => null);
    replaceState(st0({ goalMet: [T], dayRule: { [Y]: { g: 10, r: 0 }, [T]: { g: 10, r: 0 } }, settings: { ...initialState().settings, daily: 10 } }));
    setSettings({ daily: 30 });
    expect(getState().dayRule?.[T]).toBeUndefined();
    expect(getState().dayRule?.[Y]).toBeDefined();
    expect(getState().goalMet?.includes(T) ?? false).toBe(false);
    setDayRuleSource(fakeSource);
  });
});

describe("R5-2 考试日按当时的快照记，改日期不改历史", () => {
  const EX = "2026-12-19";
  const prep = Array.from({ length: 14 }, (_, k) => addDays(EX, -(k + 1)));
  const snaps = Object.fromEntries(prep.slice(0, 12).map((d) => [d, { g: 20, r: 10, e: EX }]));
  const after = addDays(EX, 1);
  it("前一份快照里的考试日就是它 → 是考试日；改了设置也还是", () => {
    const st = st0({ checkins: prep, dayRule: snaps });
    st.settings = { ...st.settings, examDate: "" };
    expect(snapExamOn(st.dayRule, EX)).toBe(true);
    expect(examDayOn(st, EX)).toBe(true);
    expect(curStreak(st, after)).toBe(14);
  });
  it("考试日一过就写进 examDays（快照只留 21 天也不丢）", () => {
    expect(harvestExamDays(snaps, undefined, after)).toEqual([EX]);
    // 还没过的不写
    expect(harvestExamDays(snaps, undefined, EX)).toBeUndefined();
    const st = st0({ checkins: prep, examDays: [EX] });
    st.settings = { ...st.settings, examDate: "2027-06-12" };
    expect(curStreak(st, after)).toBe(14);
  });
  it("当天才把考试日设成今天：今天之前的快照不是它 → 不是考试日，第二天照样断", () => {
    const D = "2026-11-03";
    const ck = Array.from({ length: 8 }, (_, k) => addDays(D, -(k + 1)));
    const st = st0({ checkins: ck, dayRule: { [addDays(D, -1)]: { g: 10, r: 0, e: "2026-12-12" }, [D]: { g: 0, r: 0, x: 2, e: D } } });
    st.settings = { ...st.settings, examDate: D };
    expect(examDayOn(st, D)).toBe(false);
    expect(curStreak(st, addDays(D, 1))).toBe(0);
    expect(brokenStreak(st, addDays(D, 1))).toBe(8);
  });
  it("提前一天设好（前一天的快照 e = 明天）→ 是考试日", () => {
    const D = "2026-11-03";
    expect(snapExamOn({ [addDays(D, -1)]: { g: 10, r: 0, e: D } }, D)).toBe(true);
    // 更早设了别的日期、前一天改掉了：以前一天为准
    expect(snapExamOn({ [addDays(D, -3)]: { g: 10, r: 0, e: D }, [addDays(D, -1)]: { g: 10, r: 0, e: "2027-06-12" } }, D)).toBe(false);
  });
  it("11.4 的快照（没有 e）：前一天是「考前一天」（x = 1）就算", () => {
    const D = "2026-11-03";
    expect(snapExamOn({ [addDays(D, -1)]: { g: 0, r: 5, x: 1 } }, D)).toBe(true);
    expect(snapExamOn({ [addDays(D, -1)]: { g: 10, r: 5 } }, D)).toBe(false);
  });
  it("完全没有快照的老数据：退回去看设置里的日期", () => {
    const st = st0({ checkins: prep });
    st.settings = { ...st.settings, examDate: EX };
    expect(examDayOn(st, EX)).toBe(true);
  });
  it("考完还没选、直接在「我的」改日期 = 备考下一场：记下用户考的那一场，不冒出更早的官方场次", () => {
    setDayRuleSource(fakeSource);
    const s = st0({ checkins: prep, log: Object.fromEntries(prep.map((d) => [d, L(20, 10)])) });
    s.settings = { ...s.settings, examDate: EX };
    // passedExam 按真实的今天算；这里直接验证改日期时的规则：done 晚于官方场次 → 不再问
    expect(passedExam(after, "", EX, () => true)).toBeNull();
    expect(passedExam(after, "", undefined, () => true)?.day).toBe("2026-12-12");
  });
  it("ackExam 把这一场写进 examDays", () => {
    replaceState(st0());
    ackExam("2026-12-12", "next", "2026-12-13");
    expect(getState().examDays).toContain("2026-12-12");
  });
});

describe("R5-6 「保持现在的」= 知情选择", () => {
  it("ackExam(…, paceOk) 记下 paceOk = 这一天", () => {
    replaceState(st0());
    ackExam("2026-12-12", "next", "2026-12-13", undefined, true);
    expect(getState().paceOk).toBe("2026-12-13");
    replaceState(st0());
    ackExam("2026-12-12", "next", "2026-12-13");
    expect(getState().paceOk).toBeUndefined();
  });
});

describe("R5-4 备份日期不在未来", () => {
  it("backupDay / lastBackup 晚于今天：按今天算", () => {
    const text = JSON.stringify({ app: "cet4-vocab", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), backupDay: addDays(T, 4), state: { ...st0(), lastBackup: addDays(T, 4) } });
    expect(parseBackup(text).lastBackup).toBe(T);
  });
  it("文件里的 lastBackup 比 backupDay 新也不会被调旧", () => {
    const text = JSON.stringify({ app: "cet4-vocab", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), backupDay: back(5), state: { ...st0(), lastBackup: back(2) } });
    expect(parseBackup(text).lastBackup).toBe(back(2));
  });
  it("examDays 经过清洗：去重、排序、只留日期", () => {
    const text = JSON.stringify({ app: "cet4-vocab", version: BACKUP_VERSION, state: { ...st0(), examDays: ["2026-12-19", "x", "2026-06-13", "2026-12-19"] } });
    expect(parseBackup(text).examDays).toEqual(["2026-06-13", "2026-12-19"]);
  });
  it("快照里的 e 保留下来", () => {
    const text = JSON.stringify({ app: "cet4-vocab", version: BACKUP_VERSION, state: { ...st0(), dayRule: { [Y]: { g: 10, r: 0, e: "2026-12-19" }, [T]: { g: 10, r: 0, e: "bad" } } } });
    const s = parseBackup(text);
    expect(s.dayRule?.[Y]?.e).toBe("2026-12-19");
    expect(s.dayRule?.[T]?.e).toBeUndefined();
  });
});
