import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { posOf, type Word, type WordIndex } from "./data";
import {
  FIT_MIN,
  adaptiveNew,
  algoOptions,
  balanceAll,
  cleanRetention,
  dueLoad,
  fitInitialEase,
  growthSeries,
  overloadedDays,
  rateOrder4,
  ratingEffects,
  simulatePlan,
} from "./algo";
import { summarize } from "./plan";
import {
  DEFAULT_EASE,
  addDays,
  answer,
  balancedDue,
  createSession,
  diffDays,
  fuzzDays,
  longOverdue,
  newCard,
  previewIntervals,
  retentionScale,
  schedule,
  type Card,
} from "./srs";
import { revEntry, type RevEntry } from "./stats";
import { LEGACY_ALGO, cleanSettings, defaultSettings, initialState, normalize, type AppState } from "./store";

const T = "2026-10-13";

function mkIndex(list: Word[]): WordIndex {
  const map = new Map<string, Word>();
  const byPos = new Map<string, Word[]>();
  for (const w of list) {
    map.set(w.w, w);
    const p = posOf(w);
    if (!byPos.has(p)) byPos.set(p, []);
    byPos.get(p)!.push(w);
  }
  return { list, map, byPos, coreCount: list.filter((w) => w.c).length };
}
const REAL = mkIndex(JSON.parse(readFileSync(new URL("../../public/data/cet4.json", import.meta.url), "utf8")) as Word[]);
const st = (patch: Partial<AppState> = {}): AppState => ({ ...initialState(), onboarded: true, seed: 7, ...patch });
/** 间隔 i、ease e、上次复习在 i 天前、今天到期的复习卡 */
const rev = (i: number, extra: Partial<Card> = {}): Card => ({ ...newCard(addDays(T, -40)), st: "review", e: 2.5, i, r: 2, d: T, t: addDays(T, -i), ...extra });
const ivl = (c: Card) => diffDays(T, c.d);

// ---------------------------------------------------------------- 0 默认不变
describe("v10 · 旧默认设置与 v9 算法完全一致", () => {
  it("不给 algo / v11 之前的默认设置（高级排程全关）时，所有评分结果相同", () => {
    const opts = algoOptions({ ...defaultSettings(), ...LEGACY_ALGO }, { cards: {}, revlog: [], today: T });
    expect(opts).toEqual({});
    for (const c of [undefined, rev(0, { st: "learning" }), rev(1), rev(3), rev(10), rev(30, { e: 1.7 }), rev(5, { t: addDays(T, -20) })])
      for (const r of ["know", "vague", "forget"] as const) expect(schedule(c, r, T, { algo: opts })).toEqual(schedule(c, r, T));
  });
  it("旧备份没有 v10 字段：补默认值；越界值回默认", () => {
    const s = normalize({ cards: {}, settings: { daily: 20 } });
    expect(s.settings).toMatchObject({ retention: 90, fuzz: false, balance: false, overdue: false, steps: false, fourKey: false, fitEase: false });
    expect(s.newCut).toBeUndefined();
    const bad = cleanSettings({ ...defaultSettings(), retention: 70, fuzz: "yes" as unknown as boolean, fourKey: 1 as unknown as boolean });
    expect(bad.retention).toBe(90);
    expect(bad.fuzz).toBe(false);
    expect(bad.fourKey).toBe(false);
    expect(cleanSettings({ ...defaultSettings(), retention: 95 }).retention).toBe(95);
    expect(cleanRetention(85)).toBe(85);
    expect(cleanRetention("95")).toBe(90);
  });
});

// ---------------------------------------------------------------- 1 记忆保持目标
describe("v10 · 1 记忆保持目标", () => {
  it("缩放系数 = ln R / ln 0.9", () => {
    expect(retentionScale(90)).toBeCloseTo(1, 10);
    expect(retentionScale(85)).toBeCloseTo(Math.log(0.85) / Math.log(0.9), 10);
    expect(retentionScale(95)).toBeCloseTo(0.4868, 3);
    expect(retentionScale(85)).toBeGreaterThan(1.5);
  });
  it("95% 间隔更短、85% 更长；都不短于原间隔 + 1", () => {
    for (const i of [2, 5, 10, 25]) {
      const base = ivl(schedule(rev(i), "know", T));
      const hi = ivl(schedule(rev(i), "know", T, { algo: { retention: 95 } }));
      const lo = ivl(schedule(rev(i), "know", T, { algo: { retention: 85 } }));
      expect(hi).toBeLessThanOrEqual(base);
      expect(lo).toBeGreaterThanOrEqual(base);
      expect(hi).toBeGreaterThanOrEqual(i + 1);
    }
    expect(ivl(schedule(rev(10), "know", T, { algo: { retention: 95 } }))).toBe(Math.max(11, Math.round(25 * retentionScale(95))));
    expect(ivl(schedule(rev(10), "know", T, { algo: { retention: 85 } }))).toBe(Math.round(25 * retentionScale(85)));
  });
  it("新词首答、学习中、模糊、不认识不缩放", () => {
    const a = { retention: 95 };
    expect(ivl(schedule(undefined, "know", T, { algo: a }))).toBe(2);
    expect(ivl(schedule(rev(0, { st: "learning" }), "know", T, { algo: a }))).toBe(1);
    expect(schedule(rev(10), "vague", T, { algo: a })).toEqual(schedule(rev(10), "vague", T));
    expect(schedule(rev(10), "forget", T, { algo: a })).toEqual(schedule(rev(10), "forget", T));
  });
});

// ---------------------------------------------------------------- 2 间隔随机扰动
describe("v10 · 2 间隔随机扰动", () => {
  it("<4 天不抖；≥4 天在 ±max(1, 5%) 以内；同词同日稳定", () => {
    expect(fuzzDays(3, "abandon", T)).toBe(0);
    for (const i of [4, 8, 20, 60, 200]) {
      const span = Math.max(1, Math.round(i * 0.05));
      for (const w of REAL.list.slice(0, 200)) {
        const f = fuzzDays(i, w.w, T);
        expect(Math.abs(f)).toBeLessThanOrEqual(span);
        expect(fuzzDays(i, w.w, T)).toBe(f);
      }
    }
  });
  it("同一天到期、同样间隔的一批词被分散到几天", () => {
    const days = new Set(REAL.list.slice(0, 100).map((w) => schedule(rev(10), "know", T, { algo: { fuzz: true, key: w.w } }).d));
    expect(days.size).toBeGreaterThanOrEqual(3);
    const plain = new Set(REAL.list.slice(0, 100).map(() => schedule(rev(10), "know", T).d));
    expect(plain.size).toBe(1);
  });
  it("间隔与到期日一致；没有 key 不抖", () => {
    for (const w of REAL.list.slice(0, 50)) {
      const c = schedule(rev(10), "know", T, { algo: { fuzz: true, key: w.w } });
      expect(ivl(c)).toBe(c.i);
    }
    expect(schedule(rev(10), "know", T, { algo: { fuzz: true } })).toEqual(schedule(rev(10), "know", T));
  });
});

// ---------------------------------------------------------------- 3 负荷均衡
describe("v10 · 3 负荷均衡", () => {
  const D = addDays(T, 10);
  const deck = (): Record<string, Card> => {
    const cards: Record<string, Card> = {};
    for (let k = 0; k < 30; k++) cards[`w${k}`] = rev(8, { d: D, t: addDays(T, -2) });
    for (let k = 1; k <= 30; k++) if (k !== 10) cards[`x${k}`] = rev(6, { d: addDays(T, k), t: T });
    return cards;
  };
  it("到期量 / 均值统计未来 30 天，不含今天", () => {
    const { counts, avg } = dueLoad({ ...deck(), today: rev(3) }, T);
    expect(counts.get(D)).toBe(30);
    expect(counts.has(T)).toBe(false);
    expect(avg).toBeCloseTo(59 / 30, 5);
  });
  it("落在超载的一天 → 挪到前后较空的一天；不超载不动；不挪到今天", () => {
    const counts = new Map([[D, 12], [addDays(D, -1), 2], [addDays(D, 1), 5]]);
    const load = { count: (d: string) => counts.get(d) ?? 0, avg: 4 };
    expect(balancedDue(D, T, load)).toBe(addDays(D, -1));
    expect(balancedDue(addDays(D, 1), T, load)).toBe(addDays(D, 1));
    const c2 = new Map([[addDays(T, 1), 12]]);
    expect(balancedDue(addDays(T, 1), T, { count: (d) => c2.get(d) ?? 0, avg: 2 })).toBe(addDays(T, 2));
  });
  it("schedule 带 load：≥4 天的间隔避开超载日，间隔随之 ±1", () => {
    const counts = new Map([[addDays(T, 25), 20]]);
    const c = schedule(rev(10), "know", T, { algo: { load: { count: (d) => counts.get(d) ?? 0, avg: 3 } } });
    expect(Math.abs(c.i - 25)).toBe(1);
    expect(ivl(c)).toBe(c.i);
    // 短间隔不挪
    const c3 = new Map([[addDays(T, 2), 20]]);
    expect(ivl(schedule(undefined, "know", T, { algo: { load: { count: (d) => c3.get(d) ?? 0, avg: 1 } } }))).toBe(2);
  });
  it("balanceAll：把超载日削到均值 1.5 倍附近，只挪 ≥4 天间隔的词，只挪 ±1 天", () => {
    const cards = deck();
    cards.short = rev(2, { d: D });
    const { cards: out, moved } = balanceAll(cards, T);
    expect(moved.length).toBeGreaterThan(0);
    expect(moved).not.toContain("short");
    for (const w of moved) {
      expect(Math.abs(diffDays(cards[w].d, out[w].d))).toBe(1);
      expect(out[w].i - cards[w].i).toBe(diffDays(cards[w].d, out[w].d));
      expect(out[w].d > T).toBe(true);
    }
    const before = dueLoad(cards, T).counts.get(D)!;
    const after = dueLoad(out, T).counts.get(D)!;
    expect(after).toBeLessThan(before);
    expect(overloadedDays(cards, T)).toContain(D);
    // 总数不变
    expect(Object.keys(out)).toHaveLength(Object.keys(cards).length);
  });
  it("没有扎堆时什么都不挪；algoOptions 只在开关打开时带 load", () => {
    const flat: Record<string, Card> = {};
    for (let k = 1; k <= 30; k++) flat[`x${k}`] = rev(6, { d: addDays(T, k) });
    expect(balanceAll(flat, T).moved).toEqual([]);
    expect(algoOptions({ balance: false }, { cards: flat, revlog: [], today: T }).load).toBeUndefined();
    const o = algoOptions({ balance: true }, { cards: flat, revlog: [], today: T });
    expect(o.load?.count(addDays(T, 3))).toBe(1);
    expect(o.load?.avg).toBe(1);
  });
});

// ---------------------------------------------------------------- 4 逾期加成
describe("v10 · 4 逾期加成", () => {
  it("逾期很久：经过 ≥ 1.5 倍间隔且逾期 ≥2 天", () => {
    expect(longOverdue(rev(4, { t: addDays(T, -20) }), T)).toBe(true);
    expect(longOverdue(rev(4, { t: addDays(T, -5) }), T)).toBe(false);
    expect(longOverdue(rev(10, { t: addDays(T, -13) }), T)).toBe(false);
    expect(longOverdue(rev(10, { t: addDays(T, -15) }), T)).toBe(true);
  });
  it("答认识：按实际经过天数 × ease 算；关掉时按原间隔", () => {
    const c = rev(4, { t: addDays(T, -20) });
    expect(ivl(schedule(c, "know", T))).toBe(10);
    expect(ivl(schedule(c, "know", T, { algo: { overdue: true } }))).toBe(50);
    // 稍微逾期不加成
    const c2 = rev(4, { t: addDays(T, -5) });
    expect(schedule(c2, "know", T, { algo: { overdue: true } })).toEqual(schedule(c2, "know", T));
    // 逾期后忘了：照常归零
    expect(schedule(c, "forget", T, { algo: { overdue: true } }).i).toBe(0);
  });
});

// ---------------------------------------------------------------- 5 新词自适应
describe("v10 · 5 新词自适应", () => {
  it("复习量 > 每日新词 × 3 且 ≥30 才建议；按比例缩、5 的倍数、至少 5", () => {
    expect(adaptiveNew(60, 20)).toBeNull();
    expect(adaptiveNew(29, 5)).toBeNull();
    expect(adaptiveNew(120, 20)).toBe(10);
    expect(adaptiveNew(90, 20)).toBe(10);
    expect(adaptiveNew(61, 20)).toBe(15);
    expect(adaptiveNew(400, 20)).toBe(5);
    expect(adaptiveNew(150, 50)).toBeNull();
    expect(adaptiveNew(200, 50)).toBe(35);
    expect(adaptiveNew(300, 50)).toBe(25);
    expect(adaptiveNew(500, 5)).toBeNull();
  });
  it("newCut 只影响当天的目标，不改设置；第二天恢复", () => {
    const s = st({ settings: { ...defaultSettings(), daily: 20 }, newCut: { d: T, n: 10 } });
    expect(summarize(REAL, s, T).goal).toBe(10);
    expect(summarize(REAL, s, T).cut).toBe(true);
    expect(summarize(REAL, s, addDays(T, 1)).goal).toBe(20);
    expect(summarize(REAL, s, addDays(T, 1)).cut).toBe(false);
    expect(s.settings.daily).toBe(20);
    expect(normalize({ ...s, newCut: { d: T, n: -1 } }).newCut).toBeUndefined();
    expect(normalize(s).newCut).toEqual({ d: T, n: 10 });
  });
});

// ---------------------------------------------------------------- 6 重学步骤
describe("v10 · 6 重学步骤", () => {
  it("复习卡遗忘 → 记 rs；当天重学认识 1 天；下次认识固定 3 天并清掉 rs；之后恢复 × ease", () => {
    const a = { steps: true };
    const f = schedule(rev(20), "forget", T, { algo: a });
    expect(f.rs).toBe(1);
    expect(f.i).toBe(0);
    const r1 = schedule(f, "know", T, { repeat: true, algo: a });
    expect(r1.i).toBe(1);
    expect(r1.rs).toBe(1);
    const d1 = addDays(T, 1);
    const s2 = schedule(r1, "know", d1, { algo: a });
    expect(s2.i).toBe(3);
    expect(s2.rs).toBeUndefined();
    const s3 = schedule(s2, "know", addDays(d1, 3), { algo: a });
    expect(s3.i).toBe(Math.max(4, Math.round(3 * s2.e)));
  });
  it("关掉时不记 rs；没复习过的新词 / 学习中的词遗忘不进步骤；步骤中模糊保持 rs", () => {
    expect(schedule(rev(20), "forget", T).rs).toBeUndefined();
    expect(schedule(undefined, "forget", T, { algo: { steps: true } }).rs).toBeUndefined();
    expect(schedule(rev(0, { st: "learning" }), "forget", T, { algo: { steps: true } }).rs).toBeUndefined();
    const v = schedule(rev(1, { rs: 1 }), "vague", T, { algo: { steps: true } });
    expect(v.rs).toBe(1);
    // 步骤里的词：关掉开关后按普通规则走（rs 不影响）
    expect(ivl(schedule(rev(1, { rs: 1, e: 2.3 }), "know", T))).toBe(2);
  });
});

// ---------------------------------------------------------------- 7 四键模式
describe("v10 · 7 四键模式（简单）", () => {
  it("简单 = 认识的间隔再 ×1.3（至少多 1 天），ease +0.15", () => {
    const k = schedule(rev(10), "know", T);
    const e = schedule(rev(10), "know", T, { algo: { easy: true } });
    expect(k.i).toBe(25);
    expect(e.i).toBe(Math.round(25 * 1.3));
    expect(e.e).toBe(2.65);
    expect(e.r).toBe(k.r);
    expect(ivl(schedule(undefined, "know", T, { algo: { easy: true } }))).toBe(3);
    expect(ivl(schedule(rev(0, { st: "learning" }), "know", T, { algo: { easy: true } }))).toBe(2);
    expect(schedule(rev(10, { e: 2.95 }), "know", T, { algo: { easy: true } }).e).toBe(3);
  });
  it("按钮预览带「简单」且与实际一致；session 作答透传 algo", () => {
    expect(previewIntervals(rev(10), T).easy).toBeUndefined();
    const p = previewIntervals(rev(10), T, {}, true);
    expect(p.know).toBe("25天");
    expect(p.easy).toBe("1个月");
    const s = createSession([{ w: "abandon", kind: "review", mode: "recall" }]);
    const res = answer(s, rev(10), "know", T, undefined, 1000, { easy: true });
    expect(res.card.i).toBe(33);
    expect(res.session.firsts.abandon).toBe("know");
    // 撤销链不受影响：首答记为认识
    expect(revEntry("abandon", 0, "know", { card: res.card })[2]).toBe(2);
  });
  it("按钮顺序：四键在最前加「简单」，左手模式整体翻转", () => {
    expect(rateOrder4(false, false)).toEqual(["know", "vague", "forget"]);
    expect(rateOrder4(false, true)).toEqual(["easy", "know", "vague", "forget"]);
    expect(rateOrder4(true, true)).toEqual(["forget", "vague", "know", "easy"]);
    expect(rateOrder4(true, false)).toEqual(["forget", "vague", "know"]);
  });
});

// ---------------------------------------------------------------- 8 初始难度拟合
describe("v10 · 8 初始难度拟合", () => {
  const firsts = (ok: number, bad: number, extra: RevEntry[] = []): RevEntry[] => [
    ...Array.from({ length: ok }, (_, k): RevEntry => [`o${k}`, k, 2, 1, 2]),
    ...Array.from({ length: bad }, (_, k): RevEntry => [`b${k}`, k, 0, 1, 0]),
    ...extra,
  ];
  it(`样本不足 ${FIT_MIN} 次用默认 2.5`, () => {
    expect(fitInitialEase([])).toEqual({ ease: DEFAULT_EASE, acc: null, n: 0, ok: false });
    const f = fitInitialEase(firsts(20, 5));
    expect(f.ok).toBe(false);
    expect(f.ease).toBe(DEFAULT_EASE);
    expect(f.acc).toBeCloseTo(0.8, 5);
  });
  it("80% → 2.5；90% → 2.7；100% 封顶 2.8；50% 封底 2.1；取 0.05 的倍数", () => {
    expect(fitInitialEase(firsts(40, 10)).ease).toBe(2.5);
    expect(fitInitialEase(firsts(45, 5)).ease).toBe(2.7);
    expect(fitInitialEase(firsts(50, 0)).ease).toBe(2.8);
    expect(fitInitialEase(firsts(25, 25)).ease).toBe(2.1);
    const e = fitInitialEase(firsts(37, 13)).ease;
    expect(Math.round(e * 20)).toBeCloseTo(e * 20, 6);
  });
  it("只看新词首答：组内重学、复习、斩都不算", () => {
    const noise: RevEntry[] = [
      ...Array.from({ length: 30 }, (_, k): RevEntry => [`r${k}`, k, 0, 3, 0]),
      ...Array.from({ length: 30 }, (_, k): RevEntry => [`v${k}`, k, 0, 0, 0]),
      ...Array.from({ length: 30 }, (_, k): RevEntry => [`k${k}`, k, 3, 1, -1]),
    ];
    expect(fitInitialEase(firsts(45, 5, noise))).toMatchObject({ n: 50, ease: 2.7 });
  });
  it("打开后新卡用拟合的 ease；样本不够不给 initEase", () => {
    const log = firsts(45, 5);
    const o = algoOptions({ fitEase: true }, { cards: {}, revlog: log, today: T });
    expect(o.initEase).toBe(2.7);
    expect(schedule(undefined, "know", T, { algo: o }).e).toBe(2.7);
    expect(schedule(undefined, "forget", T, { algo: o }).e).toBe(2.5);
    expect(algoOptions({ fitEase: true }, { cards: {}, revlog: firsts(3, 1), today: T }).initEase).toBeUndefined();
    // 已有卡片不受影响
    expect(schedule(rev(10), "know", T, { algo: o }).e).toBe(2.5);
  });
});

// ---------------------------------------------------------------- 9 算法说明
describe("v10 · 9 算法说明", () => {
  it("评分效果直接来自 schedule", () => {
    const e = ratingEffects(10, 2.5, {});
    expect(e).toEqual({ forget: 0, vague: 12, know: 25, easy: 33 });
    expect(ratingEffects(-1, 2.5, {})).toEqual({ forget: 0, vague: 0, know: 2, easy: 3 });
    expect(ratingEffects(10, 2.5, { retention: 95 }).know).toBeLessThan(25);
    expect(ratingEffects(10, 2.1, {}).know).toBe(21);
  });
  it("连续认识的间隔：从 2 天开始单调增长，系数越高越快", () => {
    const lo = growthSeries(2.1, 6, {});
    const mid = growthSeries(2.5, 6, {});
    const hi = growthSeries(2.8, 6, {});
    expect(mid.slice(0, 3)).toEqual([2, 5, 13]);
    for (const s of [lo, mid, hi]) for (let k = 1; k < s.length; k++) expect(s[k]).toBeGreaterThan(s[k - 1]);
    expect(hi[5]).toBeGreaterThan(mid[5]);
    expect(mid[5]).toBeGreaterThan(lo[5]);
    expect(growthSeries(2.5, 6, { retention: 85 })[4]).toBeGreaterThan(mid[4]);
  });
});

// ---------------------------------------------------------------- 10 计划模拟器
describe("v10 · 10 计划模拟器", () => {
  it("空卡组每天 10 个新词：第 0 天无复习，第 1 天是没记住的那部分，复习量随新词数增长", () => {
    const r = simulatePlan({}, T, { perDay: 10, newLeft: 4000, retention: 90 });
    expect(r.days).toHaveLength(30);
    expect(r.days[0].reviews).toBe(0);
    expect(r.days[1].reviews).toBe(1);
    expect(r.days[2].reviews).toBe(Math.round(10 * 0.9 + 10 * 0.1 + 10 * 0.1 * 0.1 + 0));
    expect(r.learned).toBe(300);
    const more = simulatePlan({}, T, { perDay: 30, newLeft: 4000 });
    expect(more.total).toBeGreaterThan(r.total * 2);
    expect(more.tail).toBeGreaterThan(r.tail);
    expect(simulatePlan({}, T, { perDay: 0, newLeft: 4000 }).total).toBe(0);
  });
  it("新词不超过剩余词数；总量 = 每日之和；峰值是最大一天", () => {
    const r = simulatePlan({}, T, { perDay: 20, newLeft: 50 });
    expect(r.learned).toBe(50);
    expect(r.days.slice(0, 3).map((d) => d.learned)).toEqual([20, 20, 10]);
    expect(r.total).toBe(r.days.reduce((s, d) => s + d.reviews, 0));
    expect(r.peak).toBe(Math.max(...r.days.map((d) => d.reviews)));
    expect(r.days[r.peakDay].reviews).toBe(r.peak);
  });
  it("现有卡片按到期日计入（逾期算今天），已斩不算", () => {
    const cards: Record<string, Card> = { a: rev(5, { d: addDays(T, -3) }), b: rev(5, { d: addDays(T, 4) }), k: { ...rev(5), k: 1 } };
    const r = simulatePlan(cards, T, { perDay: 0, newLeft: 0, retention: 90 });
    expect(r.days[0].reviews).toBe(1);
    expect(r.days[4].reviews).toBe(1);
    expect(r.days[1].reviews).toBe(0);
  });
  it("保持目标越高，长期复习越多", () => {
    const a = simulatePlan({}, T, { perDay: 20, newLeft: 4000, retention: 85 });
    const b = simulatePlan({}, T, { perDay: 20, newLeft: 4000, retention: 95 });
    expect(b.tail).toBeGreaterThan(a.tail);
  });
});
