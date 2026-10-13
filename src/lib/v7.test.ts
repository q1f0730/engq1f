import { describe, expect, it, vi } from "vitest";
import { addDays, longestStreak, streak, weekdayOf, type Card, type DayLog } from "./srs";
import {
  MAKEUP_MAX,
  MILESTONES,
  applyCheckIn,
  applyPatch,
  badgeCount,
  bestStreak,
  canPatch,
  curStreak,
  dayDetail,
  isRestDay,
  lastWeek,
  lateWarning,
  milestoneOf,
  minutesToMidnight,
  parseHM,
  patchedStreak,
  reminderDue,
  restOf,
  timeReached,
} from "./habit";
import { F_NEW, F_REPEAT, badgeCtx, type RevEntry } from "./stats";
import { canShareFile, shareImage } from "./share";

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

const { checkIn, patchYesterday, getState, resetAll, normalize, setSettings, initialState, importBackup } = await import("./store");
const { summarize } = await import("./plan");

const T = "2026-10-13"; // 周二
/** 截止昨天往前 n 天连续打卡 */
const run = (n: number, end = 1) => Array.from({ length: n }, (_, k) => addDays(T, -end - k)).sort();
const hs = (checkins: string[], extra: Partial<{ makeup: number; makeupEarned: string; patched: string[]; restDay: number }> = {}) => ({
  checkins,
  makeup: extra.makeup ?? 0,
  makeupEarned: extra.makeupEarned,
  patched: extra.patched ?? [],
  settings: { restDay: extra.restDay ?? -1 },
});
const at = (day: string, h: number) => Math.floor(new Date(`${day}T${String(h).padStart(2, "0")}:00:00`).getTime() / 1000);

describe("v7 · 休息日与连续天数", () => {
  it("weekdayOf / isRestDay / restOf", () => {
    expect(weekdayOf(T)).toBe(2);
    expect(isRestDay(T, 2)).toBe(true);
    expect(isRestDay(T, -1)).toBe(false);
    expect(restOf({ settings: { restDay: 6 } })).toBe(6);
    expect(restOf({ settings: { restDay: 9 } })).toBe(-1);
    expect(restOf({ settings: {} })).toBe(-1);
  });

  it("不设休息日时与旧算法一致", () => {
    const c = run(3);
    expect(streak(c, T)).toBe(3);
    expect(streak(c, T, -1)).toBe(3);
    expect(longestStreak(["2026-10-01", "2026-10-02", "2026-10-05"], -1)).toBe(2);
  });

  it("没打卡的休息日跳过：不断也不计数", () => {
    // 周日 10-11 没打卡，设周日为休息日
    const c = ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-12"];
    expect(streak(c, T)).toBe(1);
    expect(streak(c, T, 0)).toBe(4);
    expect(streak([...c, T], T, 0)).toBe(5);
    // 休息日打了卡照样计数
    expect(streak([...c, "2026-10-11"], T, 0)).toBe(5);
  });

  it("昨天是休息日、今天没打：连续不断", () => {
    // 周一 10-12 是休息日
    expect(streak(["2026-10-10", "2026-10-11"], T, 1)).toBe(2);
    expect(streak(["2026-10-10", "2026-10-11"], T, -1)).toBe(0);
  });

  it("休息日后面也没打卡：照样断", () => {
    expect(streak(["2026-10-09", "2026-10-10"], T, 0)).toBe(0);
  });

  it("最长连续算上休息日", () => {
    const c = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06", "2026-10-08"];
    expect(longestStreak(c)).toBe(3);
    expect(longestStreak(c, 0)).toBe(5); // 10-04 周日
    expect(longestStreak([], 0)).toBe(0);
    expect(bestStreak(hs(c, { restDay: 0 }))).toBe(5);
    expect(curStreak(hs(run(4), { restDay: -1 }), T)).toBe(4);
  });

  it("成就的最长连续也认休息日", () => {
    const c = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];
    expect(badgeCtx({ cards: {}, checkins: c, quizzes: [] }, 0).longest).toBe(4);
    expect(badgeCtx({ cards: {}, checkins: c, quizzes: [], settings: { restDay: 0 } }, 0).longest).toBe(7);
  });
});

describe("v7 · 补卡", () => {
  it("连续到 7 的倍数得 1 张补卡", () => {
    const r = applyCheckIn(hs(run(6)), T);
    expect(r.streak).toBe(7);
    expect(r.earned).toBe(true);
    expect(r.makeup).toBe(1);
    expect(r.makeupEarned).toBe(T);
    expect(r.checkins[r.checkins.length - 1]).toBe(T);
  });

  it("不是 7 的倍数不发；同一天不重复发；最多 3 张", () => {
    expect(applyCheckIn(hs(run(5)), T).earned).toBe(false);
    expect(applyCheckIn(hs(run(13)), T).earned).toBe(true);
    expect(applyCheckIn(hs(run(6), { makeupEarned: T }), T).earned).toBe(false);
    const full = applyCheckIn(hs(run(20), { makeup: MAKEUP_MAX }), T);
    expect(full.earned).toBe(false);
    expect(full.makeup).toBe(MAKEUP_MAX);
  });

  it("重复打卡不改状态", () => {
    const st = hs([...run(3), T]);
    const r = applyCheckIn(st, T);
    expect(r.checkins).toBe(st.checkins);
    expect(r.milestone).toBeNull();
  });

  it("只能补昨天：昨天没打卡、不是休息日、有补卡", () => {
    const missed = [addDays(T, -3), addDays(T, -2)];
    expect(canPatch(hs(missed, { makeup: 1 }), T)).toBe(true);
    expect(canPatch(hs(missed, { makeup: 0 }), T)).toBe(false);
    expect(canPatch(hs(run(2), { makeup: 1 }), T)).toBe(false);
    expect(canPatch(hs(missed, { makeup: 1, restDay: 1 }), T)).toBe(false); // 昨天周一是休息日
  });

  it("补卡：昨天写进打卡与补卡记录、扣 1 张、连续接上", () => {
    const st = hs([addDays(T, -4), addDays(T, -3), addDays(T, -2)], { makeup: 2 });
    expect(curStreak(st, T)).toBe(0);
    expect(patchedStreak(st, T)).toBe(4);
    const r = applyPatch(st, T)!;
    expect(r.checkins).toContain(addDays(T, -1));
    expect(r.patched).toEqual([addDays(T, -1)]);
    expect(r.makeup).toBe(1);
    expect(r.streak).toBe(4);
    expect(applyPatch(hs(run(2)), T)).toBeNull();
  });

  it("补卡跨过里程碑也庆祝", () => {
    const st = hs(run(6, 2), { makeup: 1 }); // 前天往前 6 天
    expect(applyPatch(st, T)!.milestone).toBe(7);
  });
});

describe("v7 · 里程碑", () => {
  it("跨过 7 / 30 / 100 才算", () => {
    expect(MILESTONES).toEqual([7, 30, 100]);
    expect(milestoneOf(6, 7)).toBe(7);
    expect(milestoneOf(29, 30)).toBe(30);
    expect(milestoneOf(99, 100)).toBe(100);
    expect(milestoneOf(7, 8)).toBeNull();
    expect(milestoneOf(5, 6)).toBeNull();
    expect(milestoneOf(0, 31)).toBe(30);
  });

  it("打卡结果带里程碑", () => {
    expect(applyCheckIn(hs(run(29)), T).milestone).toBe(30);
    expect(applyCheckIn(hs(run(10)), T).milestone).toBeNull();
  });
});

describe("v7 · 时长目标", () => {
  it("timeReached 按分钟判断", () => {
    expect(timeReached(20 * 60000, 20)).toBe(true);
    expect(timeReached(20 * 60000 - 1, 20)).toBe(false);
  });

  it("summarize：按时长打卡时只看用时，不看新词和复习", () => {
    const idx = {
      list: [{ w: "alpha", c: 1, t: [["n", "甲"]] }, { w: "beta", c: 1, t: [["n", "乙"]] }],
      map: new Map(),
      byPos: new Map(),
      coreCount: 2,
    } as never;
    const due: Record<string, Card> = { alpha: { st: "review", e: 2.5, i: 3, r: 2, l: 0, d: T, f: "2026-10-01", t: "2026-10-10" } };
    const base = { ...initialState(), onboarded: true, cards: due };
    const log = (ms: number): Record<string, DayLog> => ({ [T]: { n: 0, r: 0, ok: 0, a: 0, ms } });
    const words = summarize(idx, { ...base, log: log(30 * 60000) }, T);
    expect(words.timeMode).toBe(false);
    expect(words.ready).toBe(false); // 还有复习和新词
    const timeSt = { ...base, settings: { ...base.settings, goalMode: "time" as const, goalMin: 20 } };
    expect(summarize(idx, { ...timeSt, log: log(19 * 60000) }, T).ready).toBe(false);
    const ok = summarize(idx, { ...timeSt, log: log(20 * 60000) }, T);
    expect(ok.ready).toBe(true);
    expect(ok.timeMode).toBe(true);
    expect(ok.goalMin).toBe(20);
    expect(ok.ms).toBe(20 * 60000);
  });
});

describe("v7 · 提醒、角标、断签预警", () => {
  it("parseHM", () => {
    expect(parseHM("20:30")).toBe(20 * 60 + 30);
    expect(parseHM("00:00")).toBe(0);
    expect(parseHM("24:00")).toBeNull();
    expect(parseHM("8:00")).toBeNull();
    expect(parseHM("")).toBeNull();
  });

  it("reminderDue：到点、没发过、没打卡", () => {
    const at = (h: number, m: number) => new Date(2026, 9, 13, h, m);
    expect(reminderDue(at(20, 0), "20:00", null, false, T)).toBe(true);
    expect(reminderDue(at(19, 59), "20:00", null, false, T)).toBe(false);
    expect(reminderDue(at(21, 0), "20:00", T, false, T)).toBe(false);
    expect(reminderDue(at(21, 0), "20:00", "2026-10-12", false, T)).toBe(true);
    expect(reminderDue(at(21, 0), "20:00", null, true, T)).toBe(false);
    expect(reminderDue(at(21, 0), "", null, false, T)).toBe(false);
  });

  it("badgeCount：今天到期数，按复习上限截断", () => {
    const c = (d: string, k?: 1): Card => ({ st: "review", e: 2.5, i: 3, r: 2, l: 0, d, f: "2026-10-01", t: "2026-10-10", ...(k ? { k } : {}) });
    const cards = { a: c(T), b: c(addDays(T, -2)), x: c(addDays(T, 1)), y: c(T, 1) };
    expect(badgeCount(cards, T, 0, 0)).toBe(2);
    expect(badgeCount(cards, T, 50, 49)).toBe(1);
    expect(badgeCount(cards, T, 50, 60)).toBe(0);
    expect(badgeCount({}, T, 0, 0)).toBe(0);
  });

  it("lateWarning：21 点后、没打卡、不是休息日", () => {
    expect(lateWarning(21, false, false)).toBe(true);
    expect(lateWarning(23, false, false)).toBe(true);
    expect(lateWarning(20, false, false)).toBe(false);
    expect(lateWarning(22, true, false)).toBe(false);
    expect(lateWarning(22, false, true)).toBe(false);
  });

  it("minutesToMidnight", () => {
    expect(minutesToMidnight(new Date(2026, 9, 13, 21, 30))).toBe(150);
    expect(minutesToMidnight(new Date(2026, 9, 13, 23, 59, 30))).toBe(1);
  });

  it("lastWeek：最近 7 天，旧 → 新", () => {
    const w = lastWeek([T, addDays(T, -2), addDays(T, -9)], T);
    expect(w).toEqual([false, false, false, false, true, false, true]);
  });
});

describe("v7 · 当日回看", () => {
  const D = "2026-10-12";
  const log: RevEntry[] = [
    ["old", at("2026-10-11", 9), 2, 0, 3],
    ["apple", at(D, 8), 0, F_NEW, 0],
    ["apple", at(D, 8), 2, F_REPEAT, 1],
    ["bread", at(D, 9), 1, 0, 2],
    ["bread", at(D, 9), 2, F_REPEAT, 2],
    ["cider", at(D, 21), 2, 0, 5],
    ["dates", at(D, 22), 2, F_NEW, 1],
    ["cider", at(T, 8), 0, 0, 1],
  ];
  it("新学按首次出现排序、复习去重并取当天最后一次评分", () => {
    const d = dayDetail(log, {}, D);
    expect(d.learned).toEqual(["apple", "dates"]);
    expect(d.reviewed).toEqual([
      { w: "bread", g: 2 },
      { w: "cider", g: 2 },
    ]);
  });

  it("没有日志的日子：用卡片的首学日期补新学", () => {
    const c: Card = { st: "review", e: 2.5, i: 3, r: 2, l: 0, d: T, f: "2026-10-05", t: "2026-10-05" };
    const d = dayDetail(log, { kiwi: c, lime: { ...c, f: D } }, "2026-10-05");
    expect(d.learned).toEqual(["kiwi"]);
    expect(d.reviewed).toEqual([]);
    expect(dayDetail(log, { lime: { ...c, f: D } }, D).learned).toEqual(["apple", "dates"]);
  });
});

describe("v7 · 系统分享", () => {
  const blob = new Blob(["x"], { type: "image/png" });
  it("支持文件分享时调起系统分享，不下载", async () => {
    const share = vi.fn(async () => {});
    const nav = { share, canShare: () => true } as unknown as Navigator;
    const dl = vi.fn();
    expect(await shareImage(blob, "a.png", dl, nav)).toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    const arg = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(arg.files?.[0].name).toBe("a.png");
    expect(dl).not.toHaveBeenCalled();
  });

  it("用户取消不下载；分享出错或不支持时下载", async () => {
    const abort = Object.assign(new Error("x"), { name: "AbortError" });
    const dl = vi.fn();
    expect(await shareImage(blob, "a.png", dl, { share: async () => Promise.reject(abort), canShare: () => true } as unknown as Navigator)).toBe("cancelled");
    expect(dl).not.toHaveBeenCalled();
    expect(await shareImage(blob, "a.png", dl, { share: async () => Promise.reject(new Error("boom")), canShare: () => true } as unknown as Navigator)).toBe("downloaded");
    expect(await shareImage(blob, "a.png", dl, { canShare: () => false, share: async () => {} } as unknown as Navigator)).toBe("downloaded");
    expect(await shareImage(blob, "a.png", dl, {} as Navigator)).toBe("downloaded");
    expect(dl).toHaveBeenCalledTimes(3);
  });

  it("canShareFile：canShare 抛错时当不支持", () => {
    const f = new File(["x"], "a.png", { type: "image/png" });
    expect(canShareFile(f, { share: () => {}, canShare: () => { throw new Error("x"); } } as unknown as Navigator)).toBe(false);
    expect(canShareFile(f, undefined)).toBe(false);
  });
});

describe("v7 · store", () => {
  const seedState = (extra: Record<string, unknown>) =>
    importBackup(JSON.stringify({ app: "cet4-vocab", state: { ...initialState(), onboarded: true, ...extra } }));

  it("checkIn：第 7 天发补卡，再点不重复", () => {
    seedState({ checkins: run(6) });
    const r = checkIn(T);
    expect(r).toMatchObject({ streak: 7, earned: true, makeup: 1, milestone: 7 });
    expect(getState().makeup).toBe(1);
    expect(getState().makeupEarned).toBe(T);
    expect(getState().checkins).toContain(T);
    const again = checkIn(T);
    expect(again.earned).toBe(false);
    expect(getState().makeup).toBe(1);
  });

  it("patchYesterday：补上昨天、扣 1 张、只能补一次", () => {
    seedState({ checkins: [addDays(T, -4), addDays(T, -3), addDays(T, -2)], makeup: 2 });
    const r = patchYesterday(T)!;
    expect(r.streak).toBe(4);
    expect(getState().patched).toEqual([addDays(T, -1)]);
    expect(getState().makeup).toBe(1);
    expect(getState().checkins).toContain(addDays(T, -1));
    expect(patchYesterday(T)).toBeNull();
  });

  it("设置休息日后连续天数跨过休息日", () => {
    seedState({ checkins: ["2026-10-10", "2026-10-11"] });
    expect(curStreak(getState(), T)).toBe(0);
    setSettings({ restDay: 1 }); // 周一 10-12
    expect(curStreak(getState(), T)).toBe(2);
    expect(canPatch(getState(), T)).toBe(false);
    resetAll();
  });

  it("normalize：新字段的默认值与越界修正", () => {
    const n = normalize({ cards: {}, makeup: 9, patched: ["2026-10-01", 3], settings: { goalMode: "x", goalMin: 15, restDay: 8, remindAt: "25:00", shareTpl: "neon", appBadge: "y" } });
    expect(n.makeup).toBe(MAKEUP_MAX);
    expect(n.patched).toEqual(["2026-10-01"]);
    expect(n.settings.goalMode).toBe("words");
    expect(n.settings.goalMin).toBe(20);
    expect(n.settings.restDay).toBe(-1);
    expect(n.settings.remindAt).toBe("");
    expect(n.settings.shareTpl).toBe("classic");
    expect(n.settings.appBadge).toBe(true);
    const ok = normalize({ cards: {}, makeup: 2, settings: { goalMode: "time", goalMin: 30, restDay: 0, remindAt: "07:30", shareTpl: "night", appBadge: false } });
    expect(ok.makeup).toBe(2);
    expect(ok.settings).toMatchObject({ goalMode: "time", goalMin: 30, restDay: 0, remindAt: "07:30", shareTpl: "night", appBadge: false });
    expect(normalize({ cards: {} }).makeup).toBe(0);
  });

});
