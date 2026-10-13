/** 11.3 · Jobs 评审 r3 的回归测试 */
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

const { autoCredit, dayMet, brokenStreak, curStreak, canPatch, pausedOn } = await import("./habit");
const { salvageState, unwrapRaw, isRawDump } = await import("./salvage");
const { parseBackup, initialState, normalize } = await import("./store");
const { sniffBackup } = await import("./sync");
const { specialCap, forgetFirst, cappedDue, EXAM_EVE_CAP, EXAM_DAY_CAP, PAUSE_CAP } = await import("./plan");
const { passedExam } = await import("./examdate");
const { homeAdvice, recoverGap } = await import("./coach");
const { sprintPlan, examAdvice } = await import("./exam");
const { backupDue } = await import("./persist");
const { addDays } = await import("./srs");
const { emptyReport } = await import("./validate");
type Card = import("./srs").Card;
type AppState = import("./store").AppState;

const T = "2026-10-14";
const Y = addDays(T, -1);
const card = (o: Partial<Card> = {}): Card => ({ st: "review", e: 2.5, i: 3, r: 2, l: 0, d: T, f: addDays(T, -40), t: addDays(T, -3), ...o });
const days = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => addDays(T, -(a + k)));
const st0 = (o: Partial<AppState> = {}): AppState => ({ ...initialState(), onboarded: true, ...o });

describe("R3-1 任务达标 = 打卡", () => {
  it("昨天新学达到目标但没点打卡：打开时补上，连续天数不断", () => {
    const st = st0({ checkins: days(2, 6), log: { [Y]: { n: 20, r: 0, ok: 18, a: 20, ms: 300000 } } });
    expect(curStreak(st, T)).toBe(0);
    const r = autoCredit(st, T)!;
    expect(r.days).toEqual([Y]);
    expect(r.streak).toBe(6);
  });
  it("记下过 goalMet 的日子也算（例如恢复期 / 考前模式，新词目标是 0）", () => {
    const st = st0({ checkins: days(2, 3), goalMet: [Y], log: { [Y]: { n: 0, r: 30, ok: 25, a: 30, ms: 1 } } });
    expect(dayMet(st, Y)).toBe(true);
    expect(autoCredit(st, T)?.days).toEqual([Y]);
  });
  it("没达标不补；已经打过卡不重复；超过 7 天不补", () => {
    expect(autoCredit(st0({ log: { [Y]: { n: 5, r: 0, ok: 5, a: 5, ms: 1 } } }), T)).toBeNull();
    expect(autoCredit(st0({ checkins: [Y], log: { [Y]: { n: 20, r: 0, ok: 20, a: 20, ms: 1 } } }), T)).toBeNull();
    expect(autoCredit(st0({ log: { [addDays(T, -9)]: { n: 20, r: 0, ok: 20, a: 20, ms: 1 } } }), T)).toBeNull();
  });
  it("按时长打卡：学满目标分钟才算", () => {
    const st = st0({ log: { [Y]: { n: 3, r: 0, ok: 3, a: 3, ms: 21 * 60000 } } });
    st.settings = { ...st.settings, goalMode: "time", goalMin: 20 };
    expect(dayMet(st, Y)).toBe(true);
    expect(dayMet({ ...st, log: { [Y]: { n: 3, r: 0, ok: 3, a: 3, ms: 5 * 60000 } } } as AppState, Y)).toBe(false);
  });
  it("补出来的连续天数照样发补卡（第 7 天）", () => {
    const st = st0({ checkins: days(2, 7), log: { [Y]: { n: 20, r: 0, ok: 20, a: 20, ms: 1 } } });
    const r = autoCredit(st, T)!;
    expect(r.streak).toBe(7);
    expect(r.makeup).toBe(1);
  });
  it("昨天真的没完成：不悄悄清零，给出断之前的天数", () => {
    const st = st0({ checkins: days(2, 6) });
    expect(curStreak(st, T)).toBe(0);
    expect(brokenStreak(st, T)).toBe(5);
    expect(brokenStreak(st0({ checkins: days(1, 5) }), T)).toBe(0);
  });
});

describe("R3-5 先休息：不算断签", () => {
  it("休息期间的日子不断连续，也不能补卡", () => {
    const st = st0({ checkins: days(4, 8), pause: { from: addDays(T, -3) }, makeup: 2 });
    expect(pausedOn(st, Y)).toBe(true);
    expect(curStreak(st, T)).toBe(5);
    expect(canPatch(st, T)).toBe(false);
    expect(brokenStreak(st, T)).toBe(0);
  });
  it("休息结束（until）之后照常算", () => {
    const st = st0({ checkins: days(4, 8), pause: { from: addDays(T, -3), until: Y } });
    expect(curStreak(st, T)).toBe(0);
  });
  it("休息期间：复习只留维持量，最容易忘的先来", () => {
    const cards: Record<string, Card> = {};
    for (let k = 0; k < 50; k++) cards[`w${k}`] = card({ i: 10 + k, l: k === 7 ? 4 : 0 });
    const st = st0({ cards, pause: { from: addDays(T, -2) } });
    expect(specialCap(st, T)).toBe(PAUSE_CAP);
    expect(cappedDue(st, T, 50)).toBe(PAUSE_CAP);
    expect(forgetFirst(st, Object.keys(cards))[0]).toBe("w7");
  });
});

describe("R3-4 考前模式的复习有上限", () => {
  it("考前一天 ≤ 60 个，考试当天只给一组热身", () => {
    const st = st0({});
    st.settings = { ...st.settings, examDate: addDays(T, 1) };
    expect(specialCap(st, T)).toBe(EXAM_EVE_CAP);
    expect(cappedDue(st, T, 420)).toBe(EXAM_EVE_CAP);
    st.settings = { ...st.settings, examDate: T };
    expect(specialCap(st, T)).toBe(EXAM_DAY_CAP);
    st.settings = { ...st.settings, examDate: addDays(T, 30) };
    expect(specialCap(st, T)).toBe(Infinity);
  });
  it("复习上限更小时用更小的", () => {
    const st = st0({});
    st.settings = { ...st.settings, examDate: addDays(T, 1), reviewCap: 50 };
    expect(cappedDue(st, T, 420)).toBe(50);
  });
});

describe("R3-2 / R2-7 原始数据能导入", () => {
  const good = JSON.stringify({ ...st0({ cards: { apple: card(), banana: card() }, checkins: [Y] }) });
  it("完好的原文：直接当备份", () => {
    const u = unwrapRaw({ "cet4v-state-v1": good, "cet4v-rev-v1": "[]" })!;
    expect(Object.keys(u.state.cards as object)).toEqual(["apple", "banana"]);
    expect(u.salvaged).toBeUndefined();
  });
  it("被截断的原文：读得完整的单词记录救回来", () => {
    const cards: Record<string, Card> = {};
    for (let k = 0; k < 30; k++) cards[`word${k}`] = card({ i: k + 1 });
    const text = JSON.stringify(st0({ cards, checkins: [Y] }));
    const cut = text.slice(0, text.indexOf('"word20"') + 12);
    const s = salvageState(cut)!;
    expect(s.salvaged).toBe(20);
    // 排在 cards 前面的字段（设置等）完整读出来；截断点之后的丢掉
    expect((s.state.settings as { daily: number }).daily).toBe(20);
  });
  it("parseBackup / sniffBackup 认得 {app, raw} 格式，报告救回几个词", () => {
    const cards: Record<string, Card> = {};
    for (let k = 0; k < 10; k++) cards[`word${k}`] = card();
    const text = JSON.stringify(st0({ cards }));
    const dump = JSON.stringify({ app: "cet4-vocab", raw: { "cet4v-state-v1": text.slice(0, text.indexOf('"word6"')), "cet4v-rev-v1": null }, exportedAt: "2026-10-13T16:44:00.000Z" });
    expect(isRawDump(JSON.parse(dump))).toBe(true);
    const rep = emptyReport();
    const st = parseBackup(dump, undefined, rep);
    expect(Object.keys(st.cards).length).toBe(6);
    expect(rep.salvaged).toBe(6);
    const sn = sniffBackup(dump);
    expect(sn.kind).toBe("plain");
  });
  it("一个词都救不出来：给出明确的提示", () => {
    const dump = JSON.stringify({ app: "cet4-vocab", raw: { "cet4v-state-v1": "{\"v\":1,\"sett" } });
    expect(() => parseBackup(dump)).toThrow(/一个单词记录都没救出来/);
  });
  it("救回来的状态能通过校验", () => {
    const s = salvageState(good.slice(0, good.length - 20))!;
    expect(() => normalize(s.state)).not.toThrow();
  });
});

describe("R3-5 / R2-13 考完了：只要考前在用就问一次", () => {
  const act = () => true;
  it("考前一个多月没学（但这一季在用）也问，不静默换场", () => {
    const active = (from: string, to: string) => from <= "2026-10-20" && to >= "2026-10-20";
    expect(passedExam("2026-12-13", "", undefined, active)).toEqual({ day: "2026-12-12", custom: false });
  });
  it("考后很久才回来、考后一次都没打开过：也问", () => {
    const before = (from: string, to: string) => to <= "2026-12-12" && from <= "2026-11-01";
    expect(passedExam("2027-03-01", "", undefined, before)).toEqual({ day: "2026-12-12", custom: false });
  });
  it("考后一直在用（老版本升级上来的）、超过 30 天：不再问", () => {
    expect(passedExam(T, "", undefined, act)).toBeNull();
  });
  it("从没用过：不问", () => {
    expect(passedExam("2026-12-13", "", undefined, () => false)).toBeNull();
  });
});

describe("R3-7 恢复期中途又断了几天：重新给欢迎回来", () => {
  const plan = sprintPlan(T, "2026-12-12", 2000);
  const base = {
    day: T, dueAll: 300, due: 100, learned: 0, daily: 20, newLeft: 2000, started: 500, reviewCap: 0, taskDone: false, checked: false,
    last: addDays(T, -9), cut: null, cutSeen: false, patchable: false, backupDays: null, install: false, hard: 0, aheadCount: 0, quizDone: false, week: false, plan,
  };
  const rec = { from: addDays(T, -11), until: addDays(T, 3), n: 15 };
  it("断了 ≥3 天 → recover-offer（从第 1 天重新算）", () => {
    const gap = recoverGap(rec, addDays(T, -9), T);
    expect(gap).toBe(8);
    const a = homeAdvice({ ...base, recover: rec, recoverGap: gap });
    expect(a?.kind).toBe("recover-offer");
  });
  it("只漏了 1 天 → 照常顺延（recovering）", () => {
    const a = homeAdvice({ ...base, last: addDays(T, -2), recover: rec, recoverGap: recoverGap(rec, addDays(T, -2), T) });
    expect(a?.kind).toBe("recovering");
  });
  it("今天关掉了欢迎回来 → 回到恢复卡", () => {
    const a = homeAdvice({ ...base, recover: rec, recoverGap: 8, recoverSeen: T });
    expect(a?.kind).toBe("recovering");
  });
});

describe("R3-6 能学完但缓冲少：同一个判定", () => {
  it("每天 50 个能在考前学完时，引擎仍建议多留复习（raise），界面据当前学完日期措辞", () => {
    const exam = "2026-12-12";
    const a = examAdvice(T, exam, { book: "core", daily: 50, newLeft: 2587, coreNewLeft: 2587 });
    expect(a?.kind).toBe("raise");
    const cur = sprintPlan(T, exam, 2587);
    expect(cur.daily).toBeGreaterThan(50);
  });
});

describe("R3-3 第一次备份提醒更早", () => {
  const cards: Record<string, Card> = {};
  for (let k = 0; k < 12; k++) cards[`w${k}`] = card({ f: addDays(T, -2) });
  it("从没备份过、学满 3 天：提醒（不用等 7 天）", () => {
    const log = { [T]: { n: 4, r: 0, ok: 4, a: 4, ms: 1 }, [Y]: { n: 4, r: 0, ok: 4, a: 4, ms: 1 }, [addDays(T, -2)]: { n: 4, r: 0, ok: 4, a: 4, ms: 1 } };
    expect(backupDue({ cards, log }, T)).not.toBeNull();
    expect(backupDue({ cards, log: { [T]: log[T] } }, T)).toBeNull();
  });
  it("学满 50 个词：提醒；备份过的照旧 7 天一次", () => {
    const many: Record<string, Card> = {};
    for (let k = 0; k < 50; k++) many[`w${k}`] = card({ f: T });
    expect(backupDue({ cards: many, log: {} }, T)).toBe(0);
    expect(backupDue({ cards: many, log: {}, lastBackup: addDays(T, -3) }, T)).toBeNull();
  });
});
