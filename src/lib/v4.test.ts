import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { posOf, type Word, type WordIndex } from "./data";
import {
  MOCK_PLAN,
  MOCK_SIZE,
  OFFICIAL_EXAMS,
  V4_MODES,
  buildMock,
  choicesFor,
  clampMs,
  clozeChoices,
  clozeFor,
  clozePhrases,
  coreGroupWords,
  coreUnmastered,
  daysUntil,
  effectiveExam,
  eligible,
  examOf,
  fmtClock,
  isCloze,
  isPoly,
  mainPos,
  nextExamDate,
  polyChoices,
  posChoices,
  posFamilies,
  quizDoneOn,
  quizStats,
  reserveDays,
  scoreOf,
  secondSaturday,
  senses,
  sprintPlan,
  upcomingExams,
  v4ModesFor,
} from "./exam";
import { reviewGroup } from "./plan";
import { newCard, pickMode, type Card, type QuizMode } from "./srs";
import { cleanSettings, defaultSettings, initialState, normalize, type AppState } from "./store";

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
const review = (d: string, extra: Partial<Card> = {}): Card => ({ ...newCard("2026-10-01"), st: "review", i: 5, r: 2, d, ...extra });

describe("v4 · 考试日期与倒计时", () => {
  it("knows the announced 2026 dates (Dec 12 / Jun 13)", () => {
    expect(OFFICIAL_EXAMS).toContain("2026-12-12");
    expect(examOf(2026, 12)).toEqual({ day: "2026-12-12", official: true });
    expect(examOf(2026, 6)).toEqual({ day: "2026-06-13", official: true });
  });
  it("estimates unannounced sittings as the 2nd Saturday", () => {
    expect(secondSaturday(2027, 6)).toBe("2027-06-12");
    expect(secondSaturday(2027, 12)).toBe("2027-12-11");
    expect(new Date(2027, 11, 11).getDay()).toBe(6);
    expect(examOf(2027, 6)).toEqual({ day: "2027-06-12", official: false });
    // 近年官方日期都是第二个周六（2024-06 是例外，所以保留官方表）
    expect(secondSaturday(2026, 12)).toBe("2026-12-12");
    expect(secondSaturday(2025, 6)).toBe("2025-06-14");
  });
  it("upcoming exams roll over June/December and include the exam day itself", () => {
    expect(upcomingExams(T, 2).map((e) => e.day)).toEqual(["2026-12-12", "2027-06-12"]);
    expect(nextExamDate("2026-12-12")).toBe("2026-12-12");
    expect(nextExamDate("2026-12-13")).toBe("2027-06-12");
    expect(nextExamDate("2026-01-05")).toBe("2026-06-13");
  });
  it("effective exam: custom date until it passes, then next sitting", () => {
    expect(effectiveExam(T, "")).toEqual({ day: "2026-12-12", custom: false });
    expect(effectiveExam(T, "2026-11-20")).toEqual({ day: "2026-11-20", custom: true });
    expect(effectiveExam("2026-11-21", "2026-11-20")).toEqual({ day: "2026-12-12", custom: false });
    expect(effectiveExam(T, "garbage")).toEqual({ day: "2026-12-12", custom: false });
  });
  it("days until exam (exam day = 0, never negative)", () => {
    expect(daysUntil(T, "2026-12-12")).toBe(60);
    expect(daysUntil("2026-12-12", "2026-12-12")).toBe(0);
    expect(daysUntil("2026-12-20", "2026-12-12")).toBe(0);
  });
});

describe("v4 · 冲刺计划", () => {
  it("reserve days: 14 when >30 days, a third when 10-30, none below", () => {
    expect(reserveDays(60)).toBe(14);
    expect(reserveDays(30)).toBe(10);
    expect(reserveDays(12)).toBe(4);
    expect(reserveDays(10)).toBe(0);
  });
  it("11.1 · rounds the need up to a multiple of 5 (not a daily option) and dates the finish", () => {
    const p = sprintPlan(T, "2026-12-12", 2577);
    expect(p).toMatchObject({ daysLeft: 60, reserve: 14, need: 57, daily: 60, tooMany: false });
    expect(p.finish).toBe("2026-11-24"); // ceil(2577/60)=43 天
    expect(p.spare).toBe(18);
  });
  it("flags plans that need more than 100/day", () => {
    const p = sprintPlan(T, "2026-11-01", 5000);
    expect(p.tooMany).toBe(true);
    expect(p.daily).toBe(100);
  });
  it("nothing left → no plan pressure", () => {
    expect(sprintPlan(T, "2026-12-12", 0)).toMatchObject({ need: 0, finish: T });
  });
  it("exam today → learn everything today (1 learn day)", () => {
    expect(sprintPlan(T, T, 40).need).toBe(40);
  });
});

describe("v4 · 一词多义", () => {
  const W = (w: string, t: [string, string][]): Word => ({ w, t });
  it("splits senses across POS lines, drops notes, dedupes", () => {
    expect(senses(W("x", [["n", "企图，努力；喊价"], ["vt", "喊价，投标（正式）；[法]命令"]]))).toEqual(["企图", "努力", "喊价", "投标", "命令"]);
  });
  it("only words with ≥3 senses are poly", () => {
    expect(isPoly(W("a", [["v", "适应；改编"]]))).toBe(false);
    expect(isPoly(W("b", [["v", "适应；改编；使适合"]]))).toBe(true);
  });
  it("3 own senses + 1 foreign one; the foreign one is the answer", () => {
    for (const w of REAL.list.filter((x) => x.c && isPoly(x)).slice(0, 120)) {
      const ch = polyChoices(REAL, w, 3);
      const own = senses(w);
      expect(ch).toHaveLength(4);
      expect(ch.filter((c) => c.correct)).toHaveLength(1);
      for (const c of ch) {
        if (c.correct) {
          expect(own.some((o) => o.includes(c.text) || c.text.includes(o))).toBe(false);
          expect(c.sub).toMatch(/^这是 .+ 的意思$/);
        } else expect(own).toContain(c.text);
      }
    }
  });
  it("stable for the same seed", () => {
    const w = REAL.map.get("absorb")!;
    expect(polyChoices(REAL, w, 9)).toEqual(polyChoices(REAL, w, 9));
  });
});

describe("v4 · 词性判断", () => {
  it("normalizes vt/vi and splits n&v", () => {
    expect([...posFamilies({ w: "x", t: [["vt&n", "a"]] })].sort()).toEqual(["n", "v"]);
    expect([...posFamilies({ w: "x", t: [["vi", "a"], ["vt", "b"]] })]).toEqual(["v"]);
    expect([...posFamilies({ w: "x", t: [["prep", "a"]] })]).toEqual(["x"]);
  });
  it("only single-POS n/v/adj/adv words get a POS question", () => {
    expect(mainPos({ w: "x", t: [["adj", "a"]] })).toBe("adj");
    expect(mainPos({ w: "x", t: [["n", "a"], ["v", "b"]] })).toBeNull();
    expect(mainPos({ w: "x", t: [["conj", "a"]] })).toBeNull();
  });
  it("four fixed options with exactly the main POS correct", () => {
    const c = posChoices({ w: "x", t: [["vt", "a"]] });
    expect(c.map((o) => o.text)).toEqual(["n. 名词", "v. 动词", "adj. 形容词", "adv. 副词"]);
    expect(c.findIndex((o) => o.correct)).toBe(1);
  });
});

describe("v4 · 短语挖空", () => {
  const w: Word = { w: "give", t: [["v", "给"]], ph: [["give up", "v. 放弃"], ["given that", "考虑到"], ["give", "给"], ["give way to [法]", "让步"]] };
  it("needs the word as a whole word inside a multi-word phrase", () => {
    expect(clozePhrases(w).map((p) => p[0])).toEqual(["give up", "give way to [法]"]);
    expect(isCloze({ w: "ice", t: [["n", "冰"]], ph: [["price", "价格"]] })).toBe(false);
  });
  it("blanks the word and cleans the Chinese hint", () => {
    const cz = clozeFor(w, 0)!;
    expect(cz.blanked).toMatch(/^____ /);
    expect(cz.blanked).not.toMatch(/give/);
    expect(["放弃", "让步"]).toContain(cz.cn);
  });
  it("options: the word + 3 lowercase same-POS words not in the phrase", () => {
    for (const x of REAL.list.filter((y) => y.c && isCloze(y)).slice(0, 120)) {
      const ch = clozeChoices(REAL, x, 5);
      const cz = clozeFor(x, 5)!;
      expect(ch).toHaveLength(4);
      expect(ch.filter((c) => c.correct).map((c) => c.text)).toEqual([x.w]);
      expect(new Set(ch.map((c) => c.text)).size).toBe(4);
      for (const c of ch.filter((c) => !c.correct)) {
        expect(c.text).toMatch(/^[a-z]+$/);
        expect(cz.phrase.toLowerCase().split(/[^a-z]+/)).not.toContain(c.text);
      }
    }
  });
});

describe("v4 · 统一题目与复习题型", () => {
  const modes: QuizMode[] = ["en2cn", "cn2en", "audio", "phrase", "listen", "poly", "pos", "cloze"];
  it("every mode yields 4 options with exactly one correct", () => {
    const pool = REAL.list.filter((w) => w.c).slice(0, 400);
    for (const m of modes) {
      const words = pool.filter((w) => eligible(REAL, w, m)).slice(0, 15);
      expect(words.length).toBeGreaterThan(0);
      for (const w of words) {
        const ch = choicesFor(REAL, w, m, 11);
        expect(ch).toHaveLength(4);
        expect(ch.filter((c) => c.correct)).toHaveLength(1);
      }
    }
  });
  it("pickMode swaps only some recall slots, only to eligible v4 modes", () => {
    const words = Array.from({ length: 300 }, (_, k) => `w${k}`);
    let swapped = 0;
    for (const w of words) {
      const base = pickMode(w, T);
      const m = pickMode(w, T, false, false, false, ["pos"]);
      if (base !== "recall") expect(m).toBe(base);
      else if (m !== "recall") {
        expect(m).toBe("pos");
        swapped++;
      }
    }
    expect(swapped).toBeGreaterThan(5);
    const recalls = words.filter((w) => pickMode(w, T) === "recall").length;
    expect(swapped).toBeLessThan(recalls);
  });
  it("cn-first still turns kept recall slots into cn2en", () => {
    for (let k = 0; k < 200; k++) expect(pickMode(`w${k}`, T, true, false, false, ["poly"])).not.toBe("recall");
  });
  it("reviews on real data include v4 types (registered by exam.ts)", () => {
    const words = REAL.list.filter((w) => w.c && v4ModesFor(REAL, w.w).length === 3).slice(0, 200).map((w) => w.w);
    const cards = Object.fromEntries(words.map((w) => [w, review(T)]));
    const s = st({ cards, settings: { ...defaultSettings(), reviewCap: 0 } });
    const seen = new Set<string>();
    for (let k = 0; k < 10; k++) {
      const left = Object.fromEntries(words.slice(k * 20).map((w) => [w, cards[w]]));
      reviewGroup(REAL, { ...s, cards: left }, T).forEach((it) => seen.add(it.mode));
    }
    expect(V4_MODES.some((m) => seen.has(m))).toBe(true);
  });
});

describe("v4 · 模拟小测", () => {
  it("plan mixes 8 types into 20 questions", () => {
    expect(MOCK_PLAN).toHaveLength(MOCK_SIZE);
    expect(new Set(MOCK_PLAN).size).toBe(8);
  });
  it("builds 20 distinct questions, eligible for their type, incl. poly/pos/cloze", () => {
    const qs = buildMock(REAL, st(), T, 42);
    expect(qs).toHaveLength(20);
    expect(new Set(qs.map((q) => q.w)).size).toBe(20);
    for (const q of qs) expect(eligible(REAL, REAL.map.get(q.w)!, q.mode)).toBe(true);
    for (const m of V4_MODES) expect(qs.some((q) => q.mode === m)).toBe(true);
    for (const q of qs) expect(q.w).toMatch(/^[a-z]+$/);
  });
  it("learned words first (wrong ones preferred), killed words never", () => {
    const learned = REAL.list.filter((w) => w.c && /^[a-z]+$/.test(w.w)).slice(0, 40).map((w) => w.w);
    const cards: Record<string, Card> = {};
    learned.forEach((w, k) => (cards[w] = review("2026-10-20", { l: k < 5 ? 2 : 0 })));
    const killed = learned.slice(30);
    killed.forEach((w) => (cards[w] = { ...cards[w], k: 1, st: "mastered" }));
    const qs = buildMock(REAL, st({ cards }), T, 1);
    const fromLearned = qs.filter((q) => cards[q.w] && !cards[q.w].k);
    expect(fromLearned.length).toBeGreaterThanOrEqual(8);
    expect(qs.some((q) => killed.includes(q.w))).toBe(false);
  });
  it("same seed → same paper; different seed → different paper", () => {
    expect(buildMock(REAL, st(), T, 5)).toEqual(buildMock(REAL, st(), T, 5));
    expect(buildMock(REAL, st(), T, 5)).not.toEqual(buildMock(REAL, st(), T, 6));
  });
  it("score, clock and time cap", () => {
    expect(scoreOf(16, 20)).toBe(80);
    expect(scoreOf(0, 0)).toBe(0);
    expect(clampMs(400000)).toBe(300000);
    expect(clampMs(-5)).toBe(0);
    expect(fmtClock(300000)).toBe("5:00");
    expect(fmtClock(59001)).toBe("1:00");
    expect(fmtClock(3000)).toBe("0:03");
  });
});

describe("v4 · 小测历史与提醒", () => {
  const rec = (at: string, ok: number) => ({ at, ts: 0, n: 20, ok, ms: 60000 });
  it("stats: last/best/avg/trend", () => {
    expect(quizStats([])).toEqual({ count: 0, best: 0, avg: 0, last: 0, trend: 0 });
    expect(quizStats([rec("2026-10-12", 12), rec(T, 16), rec(T, 20)])).toEqual({ count: 3, best: 100, avg: 80, last: 100, trend: 20 });
  });
  it("reminder hides once a quiz is done today", () => {
    expect(quizDoneOn(st(), T)).toBe(false);
    expect(quizDoneOn(st({ quizzes: [rec("2026-10-12", 10)] }), T)).toBe(false);
    expect(quizDoneOn(st({ quizzes: [rec(T, 10)] }), T)).toBe(true);
  });
  it("store: quizzes and examDate survive normalize, junk is dropped", () => {
    const n = normalize({ quizzes: [rec(T, 15), { bad: 1 }, null], settings: { examDate: "2026-12-12" } });
    expect(n.quizzes).toEqual([rec(T, 15)]);
    expect(n.settings.examDate).toBe("2026-12-12");
    expect(normalize({}).quizzes).toEqual([]);
    expect(cleanSettings({ ...defaultSettings(), examDate: "12/12" }).examDate).toBe("");
  });
});

describe("v4 · 核心未掌握", () => {
  it("splits core words into unlearned / learning; mastered and killed excluded", () => {
    const core = REAL.list.filter((w) => w.c).map((w) => w.w);
    const cards: Record<string, Card> = {
      [core[0]]: review("2026-10-20"),
      [core[1]]: review("2026-10-20", { st: "mastered", i: 30 }),
      [core[2]]: { ...review(NEVER), k: 1, st: "mastered" },
    };
    const cu = coreUnmastered(REAL, st({ cards }));
    expect(cu.learning).toEqual([core[0]]);
    expect(cu.unlearned).toHaveLength(REAL.coreCount - 3);
    expect(cu.unlearned).not.toContain(core[1]);
  });
  it("next group: unlearned core words in study order, skipping buried", () => {
    const s0 = st();
    const g = coreGroupWords(REAL, s0, T);
    expect(g.kind).toBe("new");
    expect(g.words).toHaveLength(10);
    expect(g.words.every((w) => REAL.map.get(w)!.c)).toBe(true);
    const g2 = coreGroupWords(REAL, st({ bury: { [g.words[0]]: "2026-10-14" } }), T);
    expect(g2.words).not.toContain(g.words[0]);
  });
  it("all core learned → reviews learning core words, earliest due first", () => {
    const core = REAL.list.filter((w) => w.c).map((w) => w.w);
    const cards: Record<string, Card> = {};
    core.forEach((w, k) => (cards[w] = k < 3 ? review(`2026-10-1${5 - k}`) : review("2026-10-20", { st: "mastered", i: 30 })));
    const g = coreGroupWords(REAL, st({ cards }), T);
    expect(g).toEqual({ words: [core[2], core[1], core[0]], kind: "review" });
  });
});

const NEVER = "9999-12-31";
