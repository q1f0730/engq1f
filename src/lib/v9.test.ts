import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { optionMeaning, posOf, type Word, type WordIndex } from "./data";
import { MODE_HINT, MODE_LABEL, choicesFor, cnPhraseChoices, cnPhraseOf, eligible, exampleChoices, senses } from "./exam";
import { exampleCloze } from "./examples";
import {
  JUDGE_SIZE,
  MATCH_MS,
  MATCH_PAIRS,
  MATCH_PENALTY,
  MATCH_POINT,
  buildJudge,
  comboBonus,
  emptyMatch,
  gamePool,
  judgeScore,
  matchRound,
  matchStep,
  swipeJudge,
  tileMeaning,
  timeLeft,
} from "./games";
import { FAMILY_MAX, GROUP_MAX, commonPrefix, familyOf, lineSenses, searchGroups, senseKeys, synonymGroups, synonymsOf } from "./groups";
import { applyPreviewKill, postQuizWords, postSummary, retryWords } from "./learnflow";
import { BASE_MODES, REVIEW_MODES, chooseMode, cleanOffModes, eligibleModes, practiceMode, progressiveMode, tierOf, toggleMode } from "./modes";
import { hasGoodPhrase, nextNewGroup, phraseFor, practiceGroup, reviewGroup } from "./plan";
import { addDays, newCard, pickMode, type Card, type QuizMode } from "./srs";
import { revEntry } from "./stats";
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
const W = (w: string) => REAL.map.get(w)!;
const st = (patch: Partial<AppState> = {}): AppState => ({ ...initialState(), onboarded: true, seed: 7, ...patch });
const review = (d: string, extra: Partial<Card> = {}): Card => ({ ...newCard("2026-10-01"), st: "review", i: 5, r: 2, d, ...extra });

// ---------------------------------------------------------------- 1 配对消消乐
describe("v9 · 1 配对消消乐", () => {
  const pool = REAL.list.filter((w) => w.c && /^[a-z]+$/.test(w.w)).slice(0, 60).map((w) => w.w);
  it("每轮 5 对：左右是同一组词，中文不重复、和词一一对应", () => {
    for (let r = 0; r < 6; r++) {
      const m = matchRound(REAL, pool, r, 99);
      expect(m.left).toHaveLength(MATCH_PAIRS);
      expect(new Set(m.right.map(([w]) => w))).toEqual(new Set(m.left));
      expect(new Set(m.right.map(([, x]) => x)).size).toBe(MATCH_PAIRS);
      for (const [w, x] of m.right) expect(x).toBe(tileMeaning(W(w)));
    }
  });
  it("同一种子同一轮结果稳定，下一轮换一批词", () => {
    expect(matchRound(REAL, pool, 0, 5)).toEqual(matchRound(REAL, pool, 0, 5));
    const a = new Set(matchRound(REAL, pool, 0, 5).left);
    const b = matchRound(REAL, pool, 1, 5).left;
    expect(b.filter((w) => a.has(w)).length).toBe(0);
  });
  it("方块中文：第一条释义第一个义项，去括号，最长 8 字", () => {
    for (const w of REAL.list.slice(0, 500)) {
      const t = tileMeaning(w);
      expect(t.length).toBeLessThanOrEqual(9);
      expect(t).not.toMatch(/[（(]/);
    }
    expect(tileMeaning(W("abandon"))).toBe("丢弃");
  });
  it("计分：配对 +10，连对从第 2 对起加分（最多 +8），配错 −5 不低于 0、连对归零", () => {
    let s = emptyMatch();
    s = matchStep(s, true);
    expect(s.score).toBe(MATCH_POINT);
    s = matchStep(s, true);
    expect(s.score).toBe(MATCH_POINT * 2 + 2);
    expect(comboBonus(1)).toBe(0);
    expect(comboBonus(5)).toBe(8);
    expect(comboBonus(20)).toBe(8);
    s = matchStep(s, false);
    expect(s).toMatchObject({ score: 22 - MATCH_PENALTY, combo: 0, misses: 1, pairs: 2, best: 2 });
    let z = matchStep(emptyMatch(), false);
    z = matchStep(z, false);
    expect(z.score).toBe(0);
  });
  it("剩余时间按绝对时间算", () => {
    expect(timeLeft(1000, 1000)).toBe(MATCH_MS);
    expect(timeLeft(1000, 31000)).toBe(30000);
    expect(timeLeft(1000, 999999)).toBe(0);
  });
  it("词池：学过的词优先（到期、忘过的在前），斩过的不出，不够时用词书补", () => {
    const cards: Record<string, Card> = {
      abandon: review(addDays(T, 3)),
      ability: review(T, { l: 2 }),
      able: { ...review(T), k: 1 },
    };
    const p = gamePool(REAL, st({ cards }), T, 40);
    expect(p[0]).toBe("ability");
    expect(p).toContain("abandon");
    expect(p).not.toContain("able");
    expect(p.length).toBeGreaterThanOrEqual(40);
  });
  it("学过的词够多时只用学过的词", () => {
    const cards: Record<string, Card> = {};
    for (const w of REAL.list.filter((x) => x.c && /^[a-z]+$/.test(x.w)).slice(0, 25)) cards[w.w] = review(T);
    const p = gamePool(REAL, st({ cards }), T);
    expect(new Set(p)).toEqual(new Set(Object.keys(cards)));
    expect(matchRound(REAL, p, 0, 3).left.every((w) => w in cards)).toBe(true);
    expect(buildJudge(REAL, p, 3).every((x) => x.w in cards)).toBe(true);
  });
});

// ---------------------------------------------------------------- 2 判断对错
describe("v9 · 2 判断对错", () => {
  const pool = REAL.list.filter((w) => w.c && /^[a-z]+$/.test(w.w)).slice(100, 200).map((w) => w.w);
  const items = buildJudge(REAL, pool, 1234);
  it("20 题，大约一半配对正确", () => {
    expect(items).toHaveLength(JUDGE_SIZE);
    const t = items.filter((x) => x.truth).length;
    expect(t).toBeGreaterThanOrEqual(10);
    expect(t).toBeLessThanOrEqual(12);
  });
  it("正确的题就是本词的释义；错配的释义来自同词性的别的词、且意思不重叠", () => {
    for (const it of items) {
      const w = W(it.w);
      if (it.truth) expect(it.shown).toBe(optionMeaning(w));
      else {
        const d = W(it.from!);
        expect(it.shown).toBe(optionMeaning(d));
        expect(d.w).not.toBe(w.w);
        const own = senses(w);
        expect(senses(d).some((s) => own.some((o) => o === s || o.includes(s) || s.includes(o)))).toBe(false);
      }
    }
  });
  it("得分满分 100；滑动方向可交换", () => {
    expect(judgeScore(20)).toBe(100);
    expect(judgeScore(13)).toBe(65);
    expect(swipeJudge(120, false)).toBe(true);
    expect(swipeJudge(-120, false)).toBe(false);
    expect(swipeJudge(120, true)).toBe(false);
    expect(swipeJudge(-120, true)).toBe(true);
    expect(swipeJudge(30, false)).toBeNull();
  });
});

// ---------------------------------------------------------------- 3 同义词组
describe("v9 · 3 同义词组", () => {
  const groups = synonymGroups(REAL);
  it("义项清洗：去括号、去领域标记，只留 2–8 字中文", () => {
    expect(lineSenses("丢弃；放弃，抛弃（指人）；[医]切除；a")).toEqual(["丢弃", "放弃", "抛弃", "切除"]);
    expect(senseKeys(W("abandon"))).toContain("v|放弃");
  });
  it("「v. 放弃」一组里有 abandon、quit、yield，且都是动词义", () => {
    const g = groups.find((x) => x.key === "v|放弃")!;
    expect(g).toBeTruthy();
    expect(g.words).toEqual(expect.arrayContaining(["abandon", "quit", "yield"]));
  });
  it("每组 2–12 个词、无重复、组里每个词都真有这个义项", () => {
    expect(groups.length).toBeGreaterThan(500);
    for (const g of groups.slice(0, 300)) {
      expect(g.words.length).toBeGreaterThanOrEqual(2);
      expect(g.words.length).toBeLessThanOrEqual(GROUP_MAX);
      expect(new Set(g.words).size).toBe(g.words.length);
      for (const w of g.words) expect(senseKeys(W(w))).toContain(g.key);
    }
  });
  it("按词数从多到少排序", () => {
    for (let k = 1; k < groups.length; k++) expect(groups[k - 1].words.length).toBeGreaterThanOrEqual(groups[k].words.length);
  });
  it("synonymsOf：按本词释义顺序列出所在的组；搜索中文 / 英文", () => {
    const s = synonymsOf(REAL, W("abandon"));
    expect(s.map((g) => g.sense)).toContain("放弃");
    expect(s.every((g) => g.words.includes("abandon"))).toBe(true);
    expect(searchGroups(groups, "放弃")[0].sense).toBe("放弃");
    expect(searchGroups(groups, "aband").every((g) => g.words.some((w) => w.startsWith("aband")))).toBe(true);
    expect(searchGroups(groups, "")).toBe(groups);
  });
});

// ---------------------------------------------------------------- 4 同根形词
describe("v9 · 4 同根形词", () => {
  it("nation → national / nationality，共享 ≥5 字母，不含本词", () => {
    const f = familyOf(REAL, W("nation"));
    expect(f.map((x) => x.w)).toEqual(expect.arrayContaining(["national", "nationality"]));
    expect(f.map((x) => x.w)).not.toContain("nation");
    for (const x of f) {
      expect(x.prefix).toBeGreaterThanOrEqual(5);
      expect(commonPrefix("nation", x.w.toLowerCase())).toBe(x.prefix);
    }
  });
  it("共同前缀长的排前面，最多 12 个；短于 5 个字母的词没有词族", () => {
    for (const w of REAL.list.filter((x) => x.w.length >= 5).slice(0, 400)) {
      const f = familyOf(REAL, w);
      expect(f.length).toBeLessThanOrEqual(FAMILY_MAX);
      for (let k = 1; k < f.length; k++) expect(f[k - 1].prefix).toBeGreaterThanOrEqual(f[k].prefix);
    }
    expect(familyOf(REAL, W("able"))).toEqual([]);
    expect(familyOf(REAL, W("produce")).map((x) => x.w)).toEqual(expect.arrayContaining(["product", "production"]));
  });
});

// ---------------------------------------------------------------- 5 新词预习 · 6 学后速测
describe("v9 · 5 新词预习", () => {
  it("斩掉的词标记已斩，按新词首答认识计入今日与复习日志", () => {
    const s0 = st();
    const r = applyPreviewKill(s0, ["abandon", "ability"], T, (w, c) => revEntry(w, 0, "kill", { isNew: true, card: c }));
    expect(r.cards.abandon.k).toBe(1);
    expect(r.cards.ability.k).toBe(1);
    expect(r.log[T]).toMatchObject({ n: 2, ok: 2, a: 2 });
    expect(r.revlog).toHaveLength(2);
    expect(r.revlog[0][0]).toBe("abandon");
  });
  it("已经学过的词不重复斩，空列表原样返回", () => {
    const s0 = st({ cards: { abandon: review(T) } });
    const r = applyPreviewKill(s0, ["abandon"], T, (w, c) => revEntry(w, 0, "kill", { isNew: true, card: c }));
    expect(r).toBe(s0);
  });
  it("斩完以后下一组新词跳过它们", () => {
    const s0 = st();
    const g1 = nextNewGroup(REAL, s0, T).map((x) => x.w);
    const r = applyPreviewKill(s0, g1, T, (w, c) => revEntry(w, 0, "kill", { isNew: true, card: c }));
    const g2 = nextNewGroup(REAL, { ...s0, ...r }, T).map((x) => x.w);
    expect(g2.length).toBe(10);
    expect(g2.some((w) => g1.includes(w))).toBe(false);
  });
  it("设置默认关闭，导入时清洗", () => {
    expect(defaultSettings().preview).toBe(false);
    expect(cleanSettings({ ...defaultSettings(), preview: "yes" as unknown as boolean }).preview).toBe(false);
    expect(cleanSettings({ ...defaultSettings(), preview: true }).preview).toBe(true);
  });
});

describe("v9 · 6 学后速测", () => {
  it("出题：本组答过的词，去掉斩掉的", () => {
    const firsts = { abandon: "know", ability: "forget", able: "know" } as const;
    expect(postQuizWords(firsts, { able: { ...review(T), k: 1 } })).toEqual(["abandon", "ability"]);
  });
  it("小结：答对数 / 正确率 / 答错的词", () => {
    expect(postSummary({ a: true, b: false, c: true, d: true })).toEqual({ n: 4, ok: 3, wrong: ["b"], pct: 75 });
    expect(postSummary(null)).toEqual({ n: 0, ok: 0, wrong: [], pct: 0 });
  });
  it("错词再练合并速测答错的词（去重）", () => {
    expect(retryWords({ a: "know", b: "vague", c: "know" }, { a: false, b: false, c: true })).toEqual(["b", "a"]);
    expect(retryWords({ a: "know" })).toEqual([]);
  });
  it("速测题目都是英选中四选一", () => {
    const c = choicesFor(REAL, W("abandon"), "en2cn", 3);
    expect(c).toHaveLength(4);
    expect(c.filter((x) => x.correct)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- 7 例句选词
describe("v9 · 7 例句选词", () => {
  const ex = ["They had to abandon the car in the snow.", "No example here.", "He abandoned his plan."];
  it("挖空本词（含 -ed 等变形），句子里没有本词的不用", () => {
    const a = exampleCloze("abandon", 0, ex)!;
    expect(a.blanked).toBe("They had to ____ the car in the snow.");
    expect(a.form).toBe("abandon");
    const b = exampleCloze("abandon", 1, ex)!;
    expect(b.blanked).toBe("He ____ his plan.");
    expect(b.form).toBe("abandoned");
    expect(exampleCloze("abandon", 0, ["No example here."])).toBeNull();
    // 只认整词：abandonment 不算
    expect(exampleCloze("abandon", 0, ["Total abandonment of hope."])).toBeNull();
  });
  it("没有缓存的例句就不能出题", () => {
    expect(exampleCloze("abandon")).toBeNull();
    expect(eligible(REAL, W("abandon"), "example")).toBe(false);
  });
  it("四个英文选项，只有一个正确，干扰项不在句子里、不是本词变形、同词性", () => {
    for (const w of ["abandon", "achieve", "decide", "increase", "remain"]) {
      const sentence = `We decided to ${w} it later, the teacher said.`;
      const c = exampleChoices(REAL, W(w), 7, sentence);
      expect(c).toHaveLength(4);
      expect(c.filter((x) => x.correct).map((x) => x.text)).toEqual([w]);
      for (const o of c.filter((x) => !x.correct)) {
        expect(sentence.toLowerCase().split(/[^a-z]+/)).not.toContain(o.text.toLowerCase());
        expect(o.en).toBe(true);
        expect(posOf(W(o.text))).toBe(posOf(W(w)));
      }
    }
  });
  it("题型名称与提示", () => {
    expect(MODE_LABEL.example).toBe("例句选词");
    expect(MODE_HINT.example).toContain("例句");
  });
});

// ---------------------------------------------------------------- 8 自选题型 · 9 难度递进
describe("v9 · 8 自选题型", () => {
  it("清洗：只留合法题型；基础题型不能全关", () => {
    expect(cleanOffModes(["phrase", "bogus", "en2cn"])).toEqual(["en2cn", "phrase"]);
    expect(cleanOffModes([...BASE_MODES, "poly"])).toEqual(["poly"]);
    expect(cleanOffModes("x")).toEqual([]);
  });
  it("切换：关掉最后一个基础题型会被拒绝", () => {
    expect(toggleMode([], "phrase")).toEqual(["phrase"]);
    expect(toggleMode(["phrase"], "phrase")).toEqual([]);
    expect(toggleMode(["recall", "en2cn", "cn2en"], "audio")).toBeNull();
    expect(toggleMode(["recall", "en2cn", "cn2en"], "poly")).toEqual(["recall", "en2cn", "cn2en", "poly"]);
  });
  it("关掉的题型永远不会出现（逐个关、组合关）", () => {
    const words = REAL.list.slice(0, 300).map((w) => w.w);
    const combos: QuizMode[][] = [["recall"], ["en2cn", "cn2en", "audio"], ["phrase", "listen", "cnphrase"], ["recall", "en2cn", "cn2en", "poly", "pos", "cloze"]];
    for (const off of combos)
      for (const w of words) {
        const m = chooseMode({ w, day: T, hasPhrase: true, hasListen: true, v4: ["poly", "pos", "cloze"], extra: ["cnphrase", "example"], off });
        expect(off).not.toContain(m);
      }
  });
  it("没关任何题型时与原分配完全一致", () => {
    for (let k = 0; k < 80; k++) {
      const w = `w${k}`;
      expect(chooseMode({ w, day: T, hasPhrase: true })).toBe(pickMode(w, T, false, true));
    }
  });
  it("复习组遵守设置；错词再练也不出关掉的题型", () => {
    const cards: Record<string, Card> = {};
    for (const w of REAL.list.filter((x) => x.c).slice(0, 60)) cards[w.w] = review(T);
    const off: QuizMode[] = ["recall", "en2cn", "phrase"];
    const s = st({ cards, settings: { ...defaultSettings(), offModes: off } });
    const g = reviewGroup(REAL, s, T);
    expect(g.length).toBe(20);
    expect(g.some((x) => off.includes(x.mode))).toBe(false);
    const p = practiceGroup(REAL, s, Object.keys(cards).slice(0, 30), T);
    expect(p.some((x) => off.includes(x.mode) || x.mode === "recall")).toBe(false);
    expect(practiceMode({ w: "x", day: T, hasPhrase: true, off: ["en2cn", "cn2en", "audio"] })).toBe("phrase");
    // 只剩「回想」时，错词再练仍要选择题：退回英选中
    expect(practiceMode({ w: "x", day: T, off: ["en2cn", "cn2en", "audio"] })).toBe("en2cn");
  });
  it("设置里的题型列表覆盖全部 11 种，都有中文名", () => {
    expect(REVIEW_MODES).toHaveLength(11);
    for (const m of REVIEW_MODES) expect(MODE_LABEL[m]).toBeTruthy();
    expect(normalize({ settings: { offModes: ["recall", "en2cn", "cn2en", "audio"] } }).settings.offModes).toEqual([]);
  });
});

describe("v9 · 9 难度递进", () => {
  it("三档：≤3 天英选中，4–9 天中选英，≥10 天听音（有形近词时听音辨词）", () => {
    expect(tierOf(1)).toBe("short");
    expect(tierOf(3)).toBe("short");
    expect(tierOf(4)).toBe("mid");
    expect(tierOf(9)).toBe("mid");
    expect(tierOf(10)).toBe("long");
    expect(progressiveMode(2, true)).toBe("en2cn");
    expect(progressiveMode(6, true)).toBe("cn2en");
    expect(progressiveMode(30, true)).toBe("listen");
    expect(progressiveMode(30, false)).toBe("audio");
  });
  it("开启后按间隔出题；关掉的题型退回普通分配", () => {
    const base = { w: "abandon", day: T, hasListen: true, progressive: true };
    expect(chooseMode({ ...base, ivl: 1 })).toBe("en2cn");
    expect(chooseMode({ ...base, ivl: 5 })).toBe("cn2en");
    expect(chooseMode({ ...base, ivl: 12 })).toBe("listen");
    expect(chooseMode({ ...base, ivl: 12, off: ["listen"] })).toBe("audio");
    expect(chooseMode({ ...base, ivl: 1, off: ["en2cn"] })).not.toBe("en2cn");
    // 没卡片（生词本里没学过的）不递进
    expect(chooseMode({ ...base, ivl: undefined })).toBe(pickMode("abandon", T, false, false, true));
  });
  it("复习组：开关决定是否按间隔出题", () => {
    const words = REAL.list.filter((x) => x.c && /^[a-z]+$/.test(x.w)).slice(0, 30).map((x) => x.w);
    const cards: Record<string, Card> = {};
    words.forEach((w, k) => (cards[w] = review(T, { i: k < 10 ? 2 : k < 20 ? 6 : 15 })));
    const on = reviewGroup(REAL, st({ cards, settings: { ...defaultSettings(), progressive: true } }), T);
    for (const it of on) {
      const i = cards[it.w].i;
      if (i <= 3) expect(it.mode).toBe("en2cn");
      else if (i < 10) expect(it.mode).toBe("cn2en");
      else expect(["listen", "audio"]).toContain(it.mode);
    }
    const off = reviewGroup(REAL, st({ cards }), T);
    expect(new Set(off.map((x) => x.mode)).size).toBeGreaterThan(3);
    expect(cleanSettings({ ...defaultSettings(), progressive: 1 as unknown as boolean }).progressive).toBe(false);
  });
});

// ---------------------------------------------------------------- 10 中选短语
describe("v9 · 10 中选短语", () => {
  const phraseWords = REAL.list.filter((w) => w.c && hasGoodPhrase(w)).slice(0, 40);
  it("只给有合适短语的词出", () => {
    expect(eligible(REAL, phraseWords[0], "cnphrase")).toBe(true);
    const none = REAL.list.find((w) => !hasGoodPhrase(w))!;
    expect(eligible(REAL, none, "cnphrase")).toBe(false);
  });
  it("四个英文短语只有一个正确，正确的就是题干中文对应的短语，中文互不相同", () => {
    for (const w of phraseWords) {
      const c = cnPhraseChoices(REAL, w, 11);
      expect(c).toHaveLength(4);
      const right = c.filter((x) => x.correct);
      expect(right).toHaveLength(1);
      expect(right[0].text).toBe(phraseFor(w, 11)![0]);
      expect(right[0].sub).toBe(cnPhraseOf(w, 11)![1]);
      expect(right[0].sub).not.toMatch(/\[/);
      expect(new Set(c.map((x) => x.sub)).size).toBe(4);
      expect(c.every((x) => x.en && /[a-z]/i.test(x.text))).toBe(true);
    }
    expect(MODE_LABEL.cnphrase).toBe("中选短语");
  });
  it("进入日常复习：有短语的词会出到中选短语", () => {
    const cards: Record<string, Card> = {};
    for (const w of phraseWords) cards[w.w] = review(T);
    const modes = new Set<QuizMode>();
    for (let d = 0; d < 6; d++) {
      const day = addDays(T, d);
      const cs = Object.fromEntries(Object.entries(cards).map(([w, c]) => [w, { ...c, d: day }]));
      reviewGroup(REAL, st({ cards: cs }), day).forEach((x) => modes.add(x.mode));
    }
    expect(modes.has("cnphrase")).toBe(true);
    expect(eligibleModes({ w: "x", day: T, hasPhrase: true, extra: ["cnphrase"] })).toContain("cnphrase");
  });
});

describe("v9 · 存储", () => {
  it("新设置有默认值；小游戏最高分只留有效数字", () => {
    const d = defaultSettings();
    expect(d).toMatchObject({ offModes: [], progressive: false, preview: false, postQuiz: false });
    expect(initialState().gameBest).toEqual({});
    const n = normalize({ gameBest: { match: 120, judge: "x", bad: -3, nan: NaN } });
    expect(n.gameBest).toEqual({ match: 120 });
    expect(normalize({ gameBest: [1, 2] }).gameBest).toEqual({});
  });
});
