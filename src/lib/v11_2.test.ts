/** 11.2 · Jobs 评审 r2 的回归测试 */
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

const { fmtPct, fmtPctDelta, fmtMinutesShort } = await import("./format");
const { retention } = await import("./stats");
const { recoverTick, homeAdvice } = await import("./coach");
const { examAdvice, capReach, stepUp, sprintPlan, recommendPlan, SPRINT_MAX } = await import("./exam");
const { passedExam, examModeOn } = await import("./examdate");
const { addDays, dueWords } = await import("./srs");
const { rebase, initialState } = await import("./store");
const { comeBackLine } = await import("./come-back");
const { isChunkError } = await import("./chunk-error");
type Card = import("./srs").Card;
type AppState = import("./store").AppState;

const T = "2026-10-13";
const EXAM = "2026-12-12";
const card = (o: Partial<Card> = {}): Card => ({ st: "review", e: 2.5, i: 3, r: 2, l: 0, d: T, f: addDays(T, -40), t: addDays(T, -3), ...o });

describe("R2-1 百分比只乘一次 100", () => {
  it("0.54 → 54%；夹在 0–100", () => {
    expect(fmtPct(0.54)).toBe("54%");
    expect(fmtPct(1)).toBe("100%");
    expect(fmtPct(54)).toBe("100%"); // 传错了也不会出 5400%
    expect(fmtPct(null)).toBe("—");
  });
  it("变化用百分点", () => {
    expect(fmtPctDelta(0.54, 0.57)).toBe("比上周低 3 个百分点");
    expect(fmtPctDelta(0.6, 0.6)).toBe("和上周持平");
    expect(fmtPctDelta(0.6, null)).toBeNull();
  });
  it("retention().rate 是 0–100 的百分数，ok/n 是 0–1 的小数", () => {
    const t = new Date(T + "T12:00:00").getTime() / 1000;
    const log = Array.from({ length: 100 }, (_, k) => [`w${k}`, t, k < 54 ? 2 : 0, 0, 3] as [string, number, 0 | 2, number, number]);
    const r = retention(log, T, 7);
    expect(r.rate).toBe(54);
    expect(fmtPct(r.ok / r.n)).toBe("54%");
  });
  it("统计小格的时长不截断", () => {
    expect(fmtMinutesShort(12 * 3600000 + 5 * 60000)).toBe("12时5分");
  });
});

describe("R2-3 恢复期漏一天：重新摊开，今天 ≤ 额度", () => {
  const backlog = Object.fromEntries(Array.from({ length: 500 }, (_, k) => [`w${k}`, card({ d: addDays(T, k % 5) })]));
  it("第 3 天打开（第 2 天没开）：今天到期 ≤ 100，结束日顺延", () => {
    const day = addDays(T, 2);
    const rec = { from: T, until: addDays(T, 4), n: 5, perDay: 100, spread: addDays(T, 1) };
    // 第 1、2 天的都没清：到第 3 天一共 300 个到期
    expect(dueWords(backlog, day).length).toBe(300);
    const t = recoverTick(backlog, rec, day, 0, 0)!;
    expect(t).not.toBeNull();
    expect(dueWords(t.cards, day).length).toBeLessThanOrEqual(100);
    expect(t.until > rec.until).toBe(true);
    expect(t.shifted).toBe(2);
    // 每天都不超过 100
    for (let k = 0; k < 10; k++) expect(dueWords(t.cards, addDays(day, k)).filter((w) => t.cards[w].d === addDays(day, k)).length).toBeLessThanOrEqual(100);
  });
  it("同一天只摊一次；没超额度不动", () => {
    expect(recoverTick(backlog, { from: T, until: addDays(T, 4), n: 5, perDay: 100, spread: addDays(T, 2) }, addDays(T, 2), 0, 0)).toBeNull();
    const few = { a: card(), b: card() };
    expect(recoverTick(few, { from: T, until: addDays(T, 4), n: 5, perDay: 100 }, T, 0, 0)).toBeNull();
  });
  it("今天已经复习过的算进额度", () => {
    const t = recoverTick(backlog, { from: T, until: addDays(T, 4), n: 5, perDay: 100, spread: addDays(T, -1) }, addDays(T, 2), 0, 60)!;
    expect(dueWords(t.cards, addDays(T, 2)).length).toBeLessThanOrEqual(40);
  });
});

describe("R2-4 / R2-5 / R2-12 一个计划引擎", () => {
  it("核心词 10 天学不完：cap，目标 = 100 × 10", () => {
    const a = examAdvice(T, addDays(T, 10), { book: "core", daily: 20, newLeft: 2607, coreNewLeft: 2607 })!;
    expect(a.kind).toBe("cap");
    if (a.kind === "cap") {
      expect(a.reach).toBe(1000);
      expect(a.canRaise).toBe(40); // 一次最多翻一倍
    }
  });
  it("每天已经是 100：只给信息卡，没有「改成 X」（canRaise = null）", () => {
    const a = examAdvice(T, addDays(T, 20), { book: "core", daily: SPRINT_MAX, newLeft: 2607, coreNewLeft: 2607 })!;
    expect(a.kind).toBe("cap");
    if (a.kind === "cap") expect(a.canRaise).toBeNull();
  });
  it("全部词每天要 >50 个：先提改学核心词（和引导一样），加量不超过翻倍", () => {
    const a = examAdvice(T, EXAM, { book: "all", daily: 5, newLeft: 4544, coreNewLeft: 2607 })!;
    expect(a.kind).toBe("switch");
    if (a.kind === "switch") {
      expect(a.to).toBeLessThanOrEqual(15);
      expect(a.target).toBe(recommendPlan(T, EXAM, { all: 4544, core: 2607 }).plan.daily);
    }
  });
  it("落后但来得及：raise，一次最多翻一倍；达标后 null", () => {
    const p = sprintPlan(T, EXAM, 1500);
    const a = examAdvice(T, EXAM, { book: "core", daily: 10, newLeft: 1500, coreNewLeft: 1500 })!;
    expect(a.kind).toBe("raise");
    if (a.kind === "raise") expect(a.to).toBe(Math.min(p.daily, stepUp(10, p.daily)));
    expect(examAdvice(T, EXAM, { book: "core", daily: p.daily, newLeft: 1500, coreNewLeft: 1500 })).toBeNull();
  });
  it("考试今天 / 明天：考前模式，不给计划建议", () => {
    expect(examAdvice(T, T, { book: "core", daily: 20, newLeft: 2607, coreNewLeft: 2607 })).toBeNull();
    expect(examAdvice(T, addDays(T, 1), { book: "core", daily: 20, newLeft: 2607, coreNewLeft: 2607 })).toBeNull();
    expect(examModeOn(T, addDays(T, 1))).toBe(true);
    expect(examModeOn(T, addDays(T, 2))).toBe(false);
  });
  it("capReach 不超过剩下的词", () => {
    expect(capReach(T, addDays(T, 60), 300)).toBe(300);
  });
});

describe("homeAdvice 的新规则", () => {
  const plan = sprintPlan(T, addDays(T, 20), 2607);
  const base = {
    day: T, dueAll: 0, due: 0, learned: 0, daily: 100, newLeft: 2607, started: 0, reviewCap: 0, taskDone: false, checked: false,
    last: addDays(T, -1), cut: null, cutSeen: false, patchable: false, backupDays: null, install: false, hard: 0, aheadCount: 0, quizDone: false, week: false, plan,
  };
  const cap = examAdvice(T, addDays(T, 20), { book: "core", daily: 100, newLeft: 2607, coreNewLeft: 2607 });
  it("信息卡关掉后这一场不再出现；今天处理过不再出现", () => {
    expect(homeAdvice({ ...base, exam: cap })?.kind).toBe("sprint");
    expect(homeAdvice({ ...base, exam: cap, sprintOff: true })).toBeNull();
    expect(homeAdvice({ ...base, exam: cap, sprintSeen: true })).toBeNull();
  });
  it("R2-10 今天任务完成后不劝加量", () => {
    expect(homeAdvice({ ...base, exam: cap, taskDone: true })?.kind).not.toBe("sprint");
  });
  it("R2-13 考完了排第一；考前模式不弹欢迎回来", () => {
    expect(homeAdvice({ ...base, exam: cap, examOver: { day: addDays(T, -1), custom: false, next: "2027-06-12" } })?.kind).toBe("exam-over");
    const back = { ...base, last: addDays(T, -30), dueAll: 300, due: 300 };
    expect(homeAdvice(back)?.kind).toBe("recover-offer");
    expect(homeAdvice({ ...back, examMode: true })?.kind).not.toBe("recover-offer");
  });
});

describe("R2-13 考完了", () => {
  const act = () => true;
  it("自定日期过了总是问；确认过不再问", () => {
    expect(passedExam(T, "2026-10-10", undefined, act)).toEqual({ day: "2026-10-10", custom: true });
    expect(passedExam(T, "2026-10-10", "2026-10-10", act)).toBeNull();
  });
  it("自动场次：考后 30 天内、考前在学才问", () => {
    expect(passedExam("2026-12-13", "", undefined, act)).toEqual({ day: "2026-12-12", custom: false });
    expect(passedExam("2026-12-13", "", undefined, () => false)).toBeNull();
    expect(passedExam("2026-12-13", "", "2026-12-12", act)).toBeNull();
    expect(passedExam(T, "", undefined, act)).toBeNull(); // 6 月那场早过了 30 天
  });
});

describe("R2-8 第一组完成的文案按真实到期日", () => {
  it("都是后天 → 「后天」；不一样 → 「最早明天」", () => {
    expect(comeBackLine([addDays(T, 2), addDays(T, 2)], T, 2)).toBe("这 2 个词后天会回来复习一次");
    expect(comeBackLine([addDays(T, 1), addDays(T, 2)], T, 2)).toBe("这 2 个词最早明天回来复习");
  });
});

describe("R2-6 加载失败 ≠ 数据坏了", () => {
  it("动态模块加载失败 → chunk error；JSON 解析错误不是", () => {
    expect(isChunkError(new TypeError("Failed to fetch dynamically imported module: http://x/assets/words-CbWtE4cm.js"))).toBe(true);
    expect(isChunkError(new Error("Importing a module script failed."))).toBe(true);
    expect(isChunkError(new SyntaxError("Unexpected token } in JSON at position 3"))).toBe(false);
    expect(isChunkError(new Error("Cannot read properties of undefined (reading 'd')"))).toBe(false);
  });
});

describe("R2-14 两个窗口同时学：同一个新词只算一次", () => {
  it("日志按差值合并，重复的新词扣掉", () => {
    const base: AppState = { ...initialState(), onboarded: true, cards: {}, log: {} };
    const c = card({ f: T, st: "learning" });
    // 本窗口：学了 a、b
    const next: AppState = { ...base, cards: { a: c, b: c }, log: { [T]: { n: 2, r: 0, ok: 2, a: 2, ms: 1000 } } };
    // 别的窗口：学了 a、c
    const other: AppState = { ...base, cards: { a: c, c }, log: { [T]: { n: 2, r: 0, ok: 2, a: 2, ms: 1000 } } };
    const m = rebase(base, next, other);
    expect(Object.keys(m.cards).sort()).toEqual(["a", "b", "c"]);
    expect(m.log[T].n).toBe(3);
    expect(m.log[T].ms).toBe(2000);
  });
});
