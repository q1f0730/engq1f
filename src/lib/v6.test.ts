import { describe, expect, it } from "vitest";
import { addDays, schedule, type Card, type DayLog } from "./srs";
import {
  BADGES,
  F_NEW,
  F_REPEAT,
  REV_MAX,
  appendRev,
  badgeCtx,
  badgeProgress,
  entryDay,
  forecast30,
  gradeOf,
  hardest,
  hourBand,
  hourDist,
  intervalBuckets,
  mondayOf,
  monthGrid,
  monthSum,
  newlyEarned,
  normalizeRevlog,
  popRev,
  retention,
  revEntry,
  revlogCsv,
  shiftMonth,
  showWeekReport,
  weekReport,
  wordTrack,
  type RevEntry,
} from "./stats";
import { exportBackup, getState, importBackup, normalize, resetAll, applyAnswer, REV_KEY } from "./store";

// store 依赖浏览器全局：node 环境里给最小替身
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

const T = "2026-10-13"; // 周二
const at = (day: string, h: number, m = 0) => Math.floor(new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`).getTime() / 1000);
const e = (w: string, day: string, h: number, g: 0 | 1 | 2 | 3, f = 0, i = 3): RevEntry => [w, at(day, h), g, f, i];
const card = (p: Partial<Card>): Card => ({ st: "review", e: 2.5, i: 3, r: 2, l: 0, d: T, f: "2026-09-01", t: "2026-10-10", ...p });
const log = (n: number, r: number, ok: number, a: number, ms: number): DayLog => ({ n, r, ok, a, ms });

describe("v6 · 复习日志", () => {
  it("revEntry 记录评分、标记与作答后的间隔", () => {
    const c = schedule(undefined, "know", T);
    const x = revEntry("apple", Date.UTC(2026, 9, 13, 2, 30), "know", { isNew: true, card: c });
    expect(x).toEqual(["apple", Math.floor(Date.UTC(2026, 9, 13, 2, 30) / 1000), 2, F_NEW, 2]);
    expect(revEntry("a", 0, "vague", { repeat: true })[3]).toBe(F_REPEAT);
    expect(revEntry("a", 0, "kill", { card: { ...c, k: 1 } })[4]).toBe(-1);
    expect([gradeOf("forget"), gradeOf("vague"), gradeOf("know"), gradeOf("kill")]).toEqual([0, 1, 2, 3]);
  });

  it("appendRev 不改原数组，超过上限丢最旧的", () => {
    const a: RevEntry[] = [e("a", T, 9, 2), e("b", T, 9, 2)];
    const b = appendRev(a, e("c", T, 9, 2), 2);
    expect(a.length).toBe(2);
    expect(b.map((x) => x[0])).toEqual(["b", "c"]);
    expect(REV_MAX).toBeGreaterThanOrEqual(10000);
  });

  it("popRev 只去掉该词最后一条", () => {
    const a: RevEntry[] = [e("a", T, 8, 0), e("b", T, 9, 2), e("a", T, 10, 2)];
    expect(popRev(a, "a")).toEqual([a[0], a[1]]);
    expect(popRev(a, "zzz")).toBe(a);
  });

  it("normalizeRevlog 丢掉格式不对的条目", () => {
    expect(normalizeRevlog([e("a", T, 9, 2), ["x"], null, ["b", 1, 9, 0, 1], ["c", "1", 2, 0, 1]]).length).toBe(1);
    expect(normalizeRevlog("nope")).toEqual([]);
  });

  it("store：作答写日志、撤销去掉、主状态 key 不含日志、备份带日志", () => {
    resetAll();
    applyAnswer("apple", card({}), T, log(0, 1, 1, 1, 0), e("apple", T, 9, 2));
    applyAnswer("pear", card({}), T, log(0, 2, 1, 2, 0), e("pear", T, 9, 0));
    expect(getState().revlog.length).toBe(2);
    applyAnswer("pear", card({}), T, log(0, 1, 1, 1, 0), "pop");
    expect(getState().revlog.map((x) => x[0])).toEqual(["apple"]);
    expect(JSON.parse(localStorage.getItem("cet4v-state-v1")!).revlog).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(REV_KEY)!).length).toBe(1);
    const backup = exportBackup();
    expect(JSON.parse(backup).state.revlog.length).toBe(1);
    resetAll();
    expect(localStorage.getItem(REV_KEY)).toBeNull();
    importBackup(backup);
    expect(getState().revlog.length).toBe(1);
    expect(normalize({ revlog: [["x", 1, 2, 0, 1], "bad"], badges: { first: T, bad: 3 } }).badges).toEqual({ first: T });
    resetAll();
  });
});

describe("v6 · 记忆轨迹 / 保持率 / 时段", () => {
  const L: RevEntry[] = [
    e("apple", addDays(T, -40), 9, 0), // 窗口外
    e("apple", addDays(T, -3), 9, 2, F_NEW),
    e("apple", addDays(T, -2), 21, 0),
    e("apple", addDays(T, -2), 21, 2, F_REPEAT),
    e("pear", addDays(T, -2), 21, 2),
    e("pear", T, 7, 1),
    e("kiwi", T, 21, 3),
  ];

  it("wordTrack 按时间返回该词全部记录", () => {
    expect(wordTrack(L, "apple").length).toBe(4);
    expect(wordTrack(L, "none")).toEqual([]);
  });

  it("retention 只算 30 天内复习首答（不含新学、重学），斩算记得", () => {
    const r = retention(L, T, 30);
    expect(r.n).toBe(4);
    expect(r.ok).toBe(2);
    expect(r.rate).toBe(50);
    expect(r.days.length).toBe(30);
    expect(r.days[29].day).toBe(T);
    expect(r.days[29]).toMatchObject({ n: 2, ok: 1, rate: 50 });
    expect(r.days[27]).toMatchObject({ n: 2, ok: 1, rate: 50 });
    expect(r.days[0].rate).toBeNull();
    expect(retention([], T).rate).toBeNull();
  });

  it("hourDist 按本地小时计数并找出高峰", () => {
    const h = hourDist(L);
    expect(h.total).toBe(7);
    expect(h.hours[21]).toBe(4);
    expect(h.peak).toBe(21);
    expect(hourDist([]).peak).toBeNull();
    expect(hourBand(21)).toBe("晚上");
    expect(hourBand(7)).toBe("早晨");
    expect(entryDay(L[1])).toBe(addDays(T, -3));
  });

  it("revlogCsv 带 BOM、表头和中文评分", () => {
    const csv = revlogCsv(L.slice(1, 3));
    const lines = csv.slice(1).split("\r\n");
    expect(csv.startsWith("\ufeff时间,单词,评分,类型,间隔(天)")).toBe(true);
    expect(lines[1]).toBe(`${addDays(T, -3)} 09:00,apple,认识,新学,3`);
    expect(lines[2]).toContain(",不认识,复习,");
  });
});

describe("v6 · 周报 / 月历", () => {
  const logs: Record<string, DayLog> = {
    "2026-10-05": log(20, 30, 40, 50, 600000), // 上周一
    "2026-10-11": log(10, 10, 15, 20, 300000), // 上周日
    "2026-09-30": log(10, 20, 15, 30, 600000), // 前一周
    "2026-10-12": log(5, 5, 5, 10, 60000), // 本周一（不算）
  };

  it("mondayOf", () => {
    expect(mondayOf(T)).toBe("2026-10-12");
    expect(mondayOf("2026-10-12")).toBe("2026-10-12");
    expect(mondayOf("2026-10-18")).toBe("2026-10-12");
  });

  it("weekReport 汇总上周并与前一周对比", () => {
    const w = weekReport(logs, "2026-10-12");
    expect(w.last).toMatchObject({ start: "2026-10-05", end: "2026-10-11", n: 30, r: 40, ok: 55, a: 70, ms: 900000, days: 2, acc: 79 });
    expect(w.prev).toMatchObject({ n: 10, r: 20, acc: 50, days: 1 });
    expect(w.delta).toEqual({ n: 20, r: 20, acc: 29, ms: 300000 });
    expect(weekReport({}, "2026-10-12").delta.acc).toBeNull();
  });

  it("showWeekReport 只在周一、上周有学习且没关掉时显示", () => {
    expect(showWeekReport(logs, "2026-10-12")).toBe(true);
    expect(showWeekReport(logs, "2026-10-13")).toBe(false);
    expect(showWeekReport(logs, "2026-10-12", "2026-10-12")).toBe(false);
    expect(showWeekReport(logs, "2026-10-12", "2026-10-05")).toBe(true);
    expect(showWeekReport({}, "2026-10-12")).toBe(false);
  });

  it("monthGrid 周一开头、补齐整周", () => {
    const g = monthGrid("2026-10"); // 10/1 是周四
    expect(g[0].slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(g.flat().filter(Boolean).length).toBe(31);
    expect(g.every((r) => r.length === 7)).toBe(true);
    expect(monthGrid("2026-02").flat().filter(Boolean).length).toBe(28);
    expect(monthGrid("2024-02").flat().filter(Boolean).length).toBe(29);
  });

  it("shiftMonth 跨年", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
  });

  it("monthSum", () => {
    expect(monthSum(logs, ["2026-10-05", "2026-10-11", "2026-09-30"], "2026-10")).toEqual({ n: 35, r: 45, days: 3, checked: 2 });
  });
});

describe("v6 · 难词榜 / 间隔分布 / 30 天预测", () => {
  const cards: Record<string, Card> = {
    a: card({ l: 5, e: 1.5 }),
    b: card({ l: 5, e: 1.3 }),
    c: card({ l: 2 }),
    d: card({ l: 9, k: 1, st: "mastered" }),
    e: card({ l: 0 }),
  };

  it("hardest 按遗忘次数、再按难度系数排，排除已斩和没忘过的", () => {
    expect(hardest(cards)).toEqual(["b", "a", "c"]);
    expect(hardest(cards, 1)).toEqual(["b"]);
  });

  it("intervalBuckets 分 4 桶、已斩单独计", () => {
    const r = intervalBuckets({
      a: card({ i: 0, st: "learning" }),
      b: card({ i: 1 }),
      c: card({ i: 2 }),
      d: card({ i: 7 }),
      e: card({ i: 8 }),
      f: card({ i: 20 }),
      g: card({ i: 21, st: "mastered" }),
      h: card({ i: 3, k: 1 }),
    });
    expect(r.buckets.map((b) => b.count)).toEqual([2, 2, 2, 1]);
    expect(r.killed).toBe(1);
    expect(r.total).toBe(8);
  });

  it("forecast30 模拟按时复习：逾期算今天，间隔与 schedule 的「认识」一致", () => {
    const one = { x: card({ i: 3, e: 2.5, d: addDays(T, -2) }) };
    const f = forecast30(one, T, 30);
    expect(f.length).toBe(30);
    // 3 → 8（第 0 天）→ 20（第 8 天）→ 50（第 28 天，掌握）
    expect(f.map((d, k) => (d.reviews ? k : -1)).filter((k) => k >= 0)).toEqual([0, 8, 28]);
    expect(f[27].mastered).toBe(0);
    expect(f[28].mastered).toBe(1);
    // 与 schedule 一致
    const s1 = schedule(one.x, "know", T);
    expect(s1.i).toBe(8);
  });

  it("forecast30：已斩算掌握、不复习；学习中的词明天起每天复习", () => {
    const f = forecast30({ k: card({ k: 1, st: "mastered", d: "9999-12-31" }), n: card({ i: 0, st: "learning", d: T }) }, T, 30);
    expect(f[0].mastered).toBe(1);
    expect(f[0].reviews).toBe(1);
    expect(f[1].reviews).toBe(1); // 0 → 1 天
    expect(f[4].reviews).toBe(1); // 1 → max(2, round(1×2.5)) = 3 天
    expect(f[2].reviews + f[3].reviews).toBe(0);
  });
});

describe("v6 · 成就徽章", () => {
  it("badgeCtx 汇总进度", () => {
    const st = {
      cards: { a: card({ k: 1, st: "mastered" }), b: card({ st: "mastered", i: 30 }), c: card({}) },
      checkins: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05"],
      quizzes: [{ at: T, ok: 20, n: 20, ms: 1, wrong: [] }, { at: T, ok: 10, n: 20, ms: 1, wrong: [] }] as never,
    };
    expect(badgeCtx(st, 7508)).toEqual({ longest: 3, learned: 3, total: 7508, killed: 1, mastered: 2, perfect: 1, checkins: 4 });
  });

  it("badgeProgress / newlyEarned", () => {
    const ctx = { longest: 7, learned: 600, total: 0, killed: 0, mastered: 0, perfect: 0, checkins: 7 };
    expect(newlyEarned(ctx, {})).toEqual(["first", "streak7", "learn500"]);
    expect(newlyEarned(ctx, { first: T, streak7: T })).toEqual(["learn500"]);
    const all = BADGES.find((b) => b.id === "learnAll")!;
    expect(badgeProgress(all, ctx).done).toBe(false); // 词库总数未知时不判定
    expect(badgeProgress(all, { ...ctx, total: 600 }).done).toBe(true);
    const s30 = badgeProgress(BADGES.find((b) => b.id === "streak30")!, ctx);
    expect(s30).toMatchObject({ cur: 7, goal: 30, done: false });
    expect(s30.pct).toBeCloseTo(7 / 30);
    expect(BADGES.length).toBe(10);
  });
});
