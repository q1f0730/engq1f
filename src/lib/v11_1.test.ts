/** 11.1 · Jobs 评审 r1 的回归测试 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { posOf, type Word, type WordIndex } from "./data";

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

const store = await import("./store");
const { KEY, NEWER_MSG, normalize, parseBackup, getState, replaceState, setSettings, rebase, syncFromStorage, onExternalChange, initialState } = store;
type AppState = import("./store").AppState;
const { cleanCards, fixCard, emptyReport } = await import("./validate");
const { homeAdvice, recoveryPlan, recoverPerDay, lastActive, RETURN_GAP } = await import("./coach");
const { sprintPlan, recommendPlan, examAdvice } = await import("./exam");
const { familyOf, stemLen } = await import("./groups");
const { hasGoodPhrase, phraseOptions, phraseFor, DOMAIN_RE, summarize } = await import("./plan");
const { addDays, dueWords } = await import("./srs");
type Card = import("./srs").Card;
const { estimateRemaining } = await import("./ux");
const { sniffBackup } = await import("./sync");

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
const RAW = JSON.parse(readFileSync(new URL("../../public/data/cet4.json", import.meta.url), "utf8")) as Word[];
const REAL = mkIndex(RAW);
const has = (w: string) => REAL.map.has(w);
const card = (o: Partial<Card> = {}): Card => ({ st: "review", e: 2.5, i: 3, r: 2, l: 0, d: T, f: addDays(T, -10), t: addDays(T, -3), ...o });
const words = RAW.slice(0, 80).map((w) => w.w);
const cardsOf = (n: number, o: Partial<Card> = {}) => Object.fromEntries(words.slice(0, n).map((w) => [w, card(o)]));

describe("#1 导入坏记录：逐条校验，修或丢，绝不把坏状态写进去", () => {
  const bad = JSON.stringify({
    app: "cet4-vocab",
    version: 1,
    state: { v: 1, onboarded: true, cards: { [words[0]]: 5, [words[1]]: { d: null, i: "x" }, [words[2]]: card(), zzznotaword: card() }, log: "oops", star: [1, 2], checkins: ["2026-10-01", 3, "nope"], bury: { [words[3]]: 7 } },
  });
  it("丢掉不是对象的卡、词库里没有的词；修好字段坏掉的卡；log/checkins 坏了也不抛", () => {
    const rep = emptyReport();
    const st = parseBackup(bad, has, rep);
    expect(Object.keys(st.cards).sort()).toEqual([words[1], words[2]].sort());
    expect(rep.dropped.sort()).toEqual([words[0], "zzznotaword"].sort());
    expect(rep.repaired).toEqual([words[1]]);
    const fixed = st.cards[words[1]];
    expect(fixed.d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isInteger(fixed.i)).toBe(true);
    expect(["learning", "review", "mastered"]).toContain(fixed.st);
    expect(st.log).toEqual({});
    expect(st.checkins).toEqual(["2026-10-01"]);
    expect(st.bury).toEqual({});
    expect(rep.other).toBeGreaterThan(0);
  });
  it("读档时同样逐条修：坏卡不会让 summarize 抛 a.split is not a function", () => {
    const st = normalize({ onboarded: true, cards: { [words[0]]: { d: 123, f: null, t: [], i: "x", e: "y" } }, log: { "2026-10-01": "x" }, settings: { daily: "lots", book: 7 } });
    expect(() => summarize(REAL, st, T)).not.toThrow();
    expect(st.settings.daily).toBe(20);
    expect(st.settings.book).toBe("all");
  });
  it("fixCard 去掉不认识的字段", () => {
    expect(fixCard({ ...card(), junk: 1 }, T)).not.toHaveProperty("junk");
    expect(cleanCards({ a: null }, T)).toEqual({});
  });
});

describe("#4 版本更新的备份拒收", () => {
  it("version 99 或 state.v 7 → 抛出「来自更新的版本」", () => {
    expect(() => parseBackup(JSON.stringify({ app: "cet4-vocab", version: 99, state: { v: 1, cards: {} } }))).toThrow(NEWER_MSG);
    expect(() => parseBackup(JSON.stringify({ app: "cet4-vocab", version: 1, state: { v: 7, cards: {} } }))).toThrow(NEWER_MSG);
    expect(() => sniffBackup(JSON.stringify({ app: "cet4-vocab", version: 2, enc: {} }))).toThrow(NEWER_MSG);
  });
});

describe("#2 多窗口：三方合并，两边的改动都留下", () => {
  it("别的窗口学了 3 个词，本窗口改每日新词：保存前发现冲突 → 63 词 + daily 30", () => {
    const base: AppState = { ...initialState(), onboarded: true, cards: cardsOf(60), settings: { ...initialState().settings, daily: 20 } };
    replaceState(base);
    expect(Object.keys(getState().cards)).toHaveLength(60);
    // 另一个窗口（A）学了 3 个新词并写进存储（11.2：两个窗口读的是同一份存档，epoch 相同）
    const a = { ...getState(), cards: cardsOf(63) };
    const { revlog: _r, ...rest } = a;
    void _r;
    mem.set(KEY, JSON.stringify(rest));
    let merged = 0;
    const off = onExternalChange((why) => why === "merge" && merged++);
    // 本窗口（B）还停在 60 词的内存状态上改设置
    setSettings({ daily: 30 });
    off();
    const st = getState();
    expect(Object.keys(st.cards)).toHaveLength(63);
    expect(st.settings.daily).toBe(30);
    expect(merged).toBe(1);
    const saved = JSON.parse(mem.get(KEY)!);
    expect(Object.keys(saved.cards)).toHaveLength(63);
    expect(saved.settings.daily).toBe(30);
  });
  it("storage 事件同步：别的窗口写入后内存跟上（没有冲突就直接采用）", () => {
    const cur = JSON.parse(mem.get(KEY)!);
    cur.cards[words[70]] = card();
    mem.set(KEY, JSON.stringify(cur));
    expect(syncFromStorage()).toBe(true);
    expect(getState().cards[words[70]]).toBeTruthy();
    expect(syncFromStorage()).toBe(false);
  });
  it("rebase：删除、日志、打卡都按改动合并", () => {
    const prev: AppState = { ...initialState(), cards: cardsOf(3), checkins: ["2026-10-10"], revlog: [] };
    const next: AppState = { ...prev, cards: { [words[0]]: prev.cards[words[0]], [words[1]]: card({ i: 9 }) }, checkins: ["2026-10-10", T], revlog: [[words[1], 100, 3, 3, 0]] };
    const other: AppState = { ...prev, cards: { ...prev.cards, [words[5]]: card() }, checkins: ["2026-10-10", "2026-10-11"], revlog: [[words[5], 90, 3, 0, 0]] };
    const r = rebase(prev, next, other);
    expect(Object.keys(r.cards).sort()).toEqual([words[0], words[1], words[5]].sort());
    expect(r.cards[words[1]].i).toBe(9);
    expect(r.checkins).toEqual(["2026-10-10", "2026-10-11", T]);
    expect(r.revlog.map((e) => e[0])).toEqual([words[5], words[1]]);
  });
});

describe("#11 #6 #13 唯一的计划引擎", () => {
  it("60 天、全部词每天要 ~99 个 → 推荐核心词，约每天 60 个，考前 ≥14 天学完", () => {
    const r = recommendPlan(T, "2026-12-12", { all: REAL.list.length, core: REAL.coreCount });
    expect(r.book).toBe("core");
    expect(r.plan.daily).toBeGreaterThanOrEqual(55);
    expect(r.plan.daily).toBeLessThanOrEqual(65);
    expect(r.plan.spare).toBeGreaterThanOrEqual(14);
  });
  it("引导给的量在首页算出来一定「来得及」（不出第二套计划）", () => {
    const r = recommendPlan(T, "2026-12-12", { all: REAL.list.length, core: REAL.coreCount });
    expect(sprintPlan(T, "2026-12-12", REAL.coreCount).daily).toBe(r.plan.daily);
  });
  it("来不及：tooMany，daily 封顶 100", () => {
    const p = sprintPlan(T, "2026-11-01", 4544);
    expect(p.tooMany).toBe(true);
    expect(p.daily).toBe(100);
  });
  const baseIn = {
    day: T,
    dueAll: 0,
    due: 0,
    learned: 0,
    daily: 20,
    newLeft: 2000,
    started: 100,
    reviewCap: 0,
    taskDone: false,
    checked: false,
    last: addDays(T, -1),
    cut: null,
    cutSeen: false,
    patchable: false,
    backupDays: null,
    install: false,
    hard: 0,
    aheadCount: 0,
    quizDone: false,
    week: false,
  };
  it("考试计划落后 + 复习压力大：只给一条（冲刺），永远不会同时出现「加到 100」和「减到 5」", () => {
    const plan = sprintPlan(T, "2026-12-12", 4000);
    const exam = examAdvice(T, "2026-12-12", { book: "all", daily: baseIn.daily, newLeft: 4000, coreNewLeft: 2600 });
    const a = homeAdvice({ ...baseIn, due: 122, dueAll: 122, plan, exam });
    expect(a?.kind).toBe("sprint");
  });
  it("计划来得及时，复习压力建议不会把新词减到计划需要的量以下", () => {
    const plan = sprintPlan(T, "2026-12-12", 600); // need 13 → 15
    const a = homeAdvice({ ...baseIn, daily: 30, due: 200, dueAll: 200, plan });
    expect(a?.kind).toBe("adaptive");
    if (a?.kind === "adaptive") expect(a.to).toBeGreaterThanOrEqual(plan.daily);
  });
  it("周一的周报排在常驻的顽固词前面（不然有顽固词的人永远看不到周报）", () => {
    const plan = sprintPlan(T, "2026-12-12", 0);
    expect(homeAdvice({ ...baseIn, newLeft: 0, plan, hard: 15, week: true })?.kind).toBe("week");
    expect(homeAdvice({ ...baseIn, newLeft: 0, plan, hard: 15, week: false })?.kind).toBe("hard");
  });
  it("#21 今日小测：学过 ≥20 个且今天任务完成后才出现", () => {
    const plan = sprintPlan(T, "2026-12-12", 0);
    expect(homeAdvice({ ...baseIn, newLeft: 0, started: 0, plan, taskDone: true })).toBeNull();
    expect(homeAdvice({ ...baseIn, newLeft: 0, started: 50, plan, taskDone: false })).toBeNull();
    expect(homeAdvice({ ...baseIn, newLeft: 0, started: 50, plan, taskDone: true })?.kind).toBe("quiz");
  });
});

describe("#5 一个月没来：欢迎回来 + 恢复计划", () => {
  const plan = sprintPlan(T, "2026-12-12", 2000);
  it("间隔 ≥7 天、积压 420 → 只给欢迎回来（分 5 天，每天 100）", () => {
    const a = homeAdvice({
      day: T, dueAll: 420, due: 420, learned: 0, daily: 20, newLeft: 2000, started: 420, reviewCap: 0, taskDone: false, checked: false, plan,
      last: addDays(T, -35), cut: null, cutSeen: false, patchable: false, backupDays: 55, install: false, hard: 66, aheadCount: 0, quizDone: false, week: false,
    });
    expect(a).toMatchObject({ kind: "recover-offer", backlog: 420, days: 5, perDay: 100, gap: 35 });
    expect(RETURN_GAP).toBe(7);
  });
  it("recoveryPlan：今天 ≤ 每天上限，其余按天摊开；复习上限更小时用上限，最多 150", () => {
    const cards = Object.fromEntries(Array.from({ length: 420 }, (_, k) => [`w${k}`, card({ d: addDays(T, -(k % 30) - 1), i: (k % 20) + 1 })]));
    const r = recoveryPlan(cards, T, recoverPerDay(0));
    expect(r.days).toBe(5);
    expect(dueWords(r.cards, T)).toHaveLength(100);
    expect(r.until).toBe(addDays(T, 4));
    expect(recoverPerDay(50)).toBe(50);
    expect(recoverPerDay(200)).toBe(150);
  });
  it("恢复期内只显示恢复进度（其他劝告不出现），并且新词目标为 0", () => {
    const a = homeAdvice({
      day: addDays(T, 1), dueAll: 100, due: 100, learned: 0, daily: 20, newLeft: 2000, started: 420, reviewCap: 0, taskDone: false, checked: false, plan,
      last: T, recover: { from: T, until: addDays(T, 4), n: 5 }, cut: null, cutSeen: false, patchable: true, backupDays: 55, install: false, hard: 66, aheadCount: 0, quizDone: false, week: false,
    });
    expect(a).toMatchObject({ kind: "recovering", day: 2, days: 5 });
    const st = { ...initialState(), onboarded: true, recover: { from: T, until: addDays(T, 4), n: 5 } };
    expect(summarize(REAL, st, addDays(T, 2)).goal).toBe(0);
    expect(summarize(REAL, st, addDays(T, 5)).goal).toBe(20);
  });
  it("lastActive：今天之前最后一次有作答或打卡的那天", () => {
    expect(lastActive({ "2026-09-01": { n: 1, r: 0, a: 1 }, "2026-09-05": { n: 0, r: 0, a: 0 } }, ["2026-09-03"], T)).toBe("2026-09-03");
  });
});

describe("#16 音标：美音不再被截断", () => {
  it("administration 等 13 个词的美音完整；全库没有明显截断的美音", () => {
    const n = (s: string) => s.replace(/[()ːˈˌ'.]/g, "");
    for (const w of ["administration", "appreciation", "evaluation", "communication", "enthusiastic", "accommodation", "association", "congratulation", "consideration", "discrimination", "imagination", "developmental", "coordination"]) {
      const p = REAL.map.get(w)!.p!;
      expect(n(p[0]).length, w).toBeGreaterThan(6);
    }
    const bad = RAW.filter((w) => w.p && n(w.p[0]).length <= 0.6 * n(w.p[1]).length && n(w.p[1]).length - n(w.p[0]).length >= 3);
    expect(bad.map((w) => w.w)).toEqual([]);
  });
});

describe("#24 拼写相近：只留真正的派生词", () => {
  it("competitiveness 下没有 compel / compensate，有 compete 一族", () => {
    const f = familyOf(REAL, REAL.map.get("competitiveness")!).map((x) => x.w);
    expect(f).not.toContain("compel");
    expect(f).not.toContain("compensate");
    expect(f).toEqual(expect.arrayContaining(["compete", "competitive", "competition"]));
    expect(stemLen("compete")).toBe(6);
  });
});

describe("#25 短语题：专业术语不进题、不当干扰项", () => {
  it("wave equation 这类术语短语被排除", () => {
    expect(DOMAIN_RE.test("波动方程")).toBe(true);
    expect(DOMAIN_RE.test("[化] 氧化物")).toBe(true);
    expect(DOMAIN_RE.test("保证；承担义务")).toBe(false);
    for (const w of REAL.list.slice(0, 400)) {
      if (!hasGoodPhrase(w)) continue;
      const opts = phraseOptions(REAL, w, 7);
      for (const o of opts) {
        const p = phraseFor(o, 7);
        expect(DOMAIN_RE.test(p?.[1] ?? ""), `${w.w} → ${p?.[0]}`).toBe(false);
      }
    }
  });
});

describe("#23 时间预估用保守默认值", () => {
  it("新用户：新词按 15 秒一张算", () => {
    const e = estimateRemaining(20, [], { ms: 0, a: 0 }, 15000);
    expect(e?.min).toBe(5);
  });
});
