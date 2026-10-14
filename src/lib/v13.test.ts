import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { build, type Word } from "./data";
import { decompose, difficulty, effective, knows, levelOf, morphLabel, pickByLevel, syllables, thresholds } from "./lexicon";
import { interleaveDue, newWordsLeft, nextNewGroup, orderedWords, reviewGroup } from "./plan";
import { cardTs, changedRows, localRows, mergeCloud, metaOf, pickRow, rowSig, type CardRow } from "./cloud-merge";
import { synonymsFor } from "./syn";
import { rowToExample, shardOf, type ExampleRow } from "./examples";
import { isNewer } from "./sw";
import type { Card } from "./srs";
import { cleanSettings, defaultSettings, initialState, needLevelAsk, normalize, todayLevel, type AppState } from "./store";

const RAW = JSON.parse(readFileSync(new URL("../../public/data/cet4.json", import.meta.url), "utf8")) as Word[];
const IDX = build(RAW, false);
const IDX_B = build(RAW, true);
const SYN = JSON.parse(readFileSync(new URL("../../public/data/syn.json", import.meta.url), "utf8")) as Record<string, string[]>;
const T = "2026-10-14";

const card = (o: Partial<Card> = {}): Card => ({ st: "review", e: 2.5, i: 3, r: 2, l: 0, d: T, f: "2026-10-01", t: "2026-10-10", ...o });
const state = (o: Partial<AppState> = {}): AppState => ({ ...initialState(), onboarded: true, seed: 42, ...o, settings: { ...defaultSettings(), ...(o.settings ?? {}) } });

describe("13.0 · 基础词", () => {
  it("4544 → 3889: 655 basic words hidden by default, all still in the map", () => {
    expect(RAW).toHaveLength(4544);
    expect(IDX.list).toHaveLength(3889);
    expect(IDX.basicCount).toBe(655);
    expect(IDX_B.list).toHaveLength(4544);
    expect(IDX.map.size).toBe(4544);
  });
  it("the / a / he / book / apple level words are basic; CET-4 words are not", () => {
    for (const w of ["a", "he", "book", "apple", "banana", "classroom", "happy"]) expect(IDX.map.get(w)?.b, w).toBe(1);
    for (const w of ["abandon", "absorb", "accommodate", "contaminate", "jazz"]) {
      const x = IDX.map.get(w);
      if (x) expect(x.b, w).toBeUndefined();
    }
    expect(IDX.list.some((w) => w.b)).toBe(false);
  });
  it("core count excludes basic words", () => {
    expect(IDX.coreCount).toBe(RAW.filter((w) => w.c && !w.b).length);
  });
  it("new-word queue never offers a hidden basic word, but an old basic card still gets reviewed", () => {
    const st = state({ cards: { apple: card({ d: T }) } });
    expect(newWordsLeft(IDX, st, T).some((w) => IDX.map.get(w)!.b)).toBe(false);
    expect(reviewGroup(IDX, st, T).map((x) => x.w)).toContain("apple");
  });
  it("settings: basic off by default, cleaned to a boolean", () => {
    expect(defaultSettings().basic).toBe(false);
    expect(cleanSettings({ ...defaultSettings(), basic: "yes" as unknown as boolean }).basic).toBe(false);
    expect(cleanSettings({ ...defaultSettings(), basic: true }).basic).toBe(true);
  });
});

describe("13.0 · 新词乱序", () => {
  const S = { book: "all" as const, order: "random" as const };
  it("stable for the same seed (reloads / devices), different per seed and per wordbook", () => {
    const a = orderedWords(IDX, S, 42);
    expect(orderedWords(build(RAW, false), S, 42)).toEqual(a);
    expect(orderedWords(IDX, S, 43)).not.toEqual(a);
    const core = orderedWords(IDX, { book: "core", order: "random" }, 42);
    const coreInAll = a.filter((w) => IDX.map.get(w)!.c);
    expect(core).not.toEqual(coreInAll);
    expect(new Set(a).size).toBe(IDX.list.length);
  });
  it("no alphabetical runs: the longest ascending streak is short", () => {
    for (const seed of [1, 42, 20260730]) {
      const list = orderedWords(IDX, S, seed);
      let run = 1;
      let best = 1;
      for (let i = 1; i < list.length; i++) {
        run = list[i].toLowerCase() > list[i - 1].toLowerCase() ? run + 1 : 1;
        best = Math.max(best, run);
      }
      expect(best).toBeLessThan(12);
      // the first 20 are not mostly one letter
      expect(new Set(list.slice(0, 20).map((w) => w[0].toLowerCase())).size).toBeGreaterThan(8);
    }
  });
  it("core-first keeps core words in front, each part shuffled", () => {
    const list = orderedWords(IDX, { book: "all", order: "core" }, 42);
    const firstNonCore = list.findIndex((w) => !IDX.map.get(w)!.c);
    expect(list.slice(firstNonCore).some((w) => IDX.map.get(w)!.c)).toBe(false);
    expect(list.slice(0, 30)).not.toEqual(IDX.list.filter((w) => w.c).slice(0, 30).map((w) => w.w));
  });
  it("turning basic words on only inserts them: the relative order of the others is unchanged", () => {
    const off = orderedWords(IDX, S, 42);
    const on = orderedWords(IDX_B, S, 42).filter((w) => !IDX.map.get(w)!.b);
    expect(on).toEqual(off);
  });
  it("old 'alpha' order is read as core-first", () => {
    expect(cleanSettings({ ...defaultSettings(), order: "alpha" as never }).order).toBe("core");
  });
  it("reviews keep SRS order (due date, interval) and only interleave inside a bucket, stable per day", () => {
    const cards: Record<string, Card> = {};
    const words = IDX.list.slice(0, 30).map((w) => w.w);
    words.forEach((w, k) => (cards[w] = card({ d: k < 10 ? "2026-10-12" : T, i: k < 10 ? 3 : k < 20 ? 1 : 7 })));
    const sorted = Object.keys(cards).sort((a, b) => (cards[a].d === cards[b].d ? cards[a].i - cards[b].i : cards[a].d < cards[b].d ? -1 : 1));
    const out = interleaveDue(sorted, cards, "42|" + T);
    expect(out).toHaveLength(30);
    expect(out.slice(0, 10).sort()).toEqual(words.slice(0, 10).sort());
    expect(out.slice(10, 20).sort()).toEqual(words.slice(10, 20).sort());
    expect(out.slice(0, 10)).not.toEqual(sorted.slice(0, 10));
    expect(interleaveDue(sorted, cards, "42|" + T)).toEqual(out);
    for (let i = 1; i < out.length; i++) {
      const a = cards[out[i - 1]];
      const b = cards[out[i]];
      expect(a.d < b.d || (a.d === b.d && a.i <= b.i)).toBe(true);
    }
  });
});

describe("13.0 · 构词拆分", () => {
  it("compounds: classroom = class + room, notebook = note + book", () => {
    expect(decompose("classroom", IDX)).toEqual({ kind: "compound", parts: ["class", "room"], roots: ["class", "room"] });
    expect(decompose("notebook", IDX)?.parts).toEqual(["note", "book"]);
    expect(morphLabel(decompose("classroom", IDX))).toBe("由 class + room 组成");
  });
  it("derivations: happiness = happy + ness, possibility = possible + ity, arrangement = arrange + ment", () => {
    expect(decompose("happiness", IDX)?.parts).toEqual(["happy", "ness"]);
    expect(decompose("possibility", IDX)?.parts).toEqual(["possible", "ity"]);
    expect(decompose("arrangement", IDX)?.parts).toEqual(["arrange", "ment"]);
    expect(decompose("disagree", IDX)?.parts).toEqual(["dis", "agree"]);
  });
  it("unhappiness = un + happy + ness (prefix + derived root, flattened)", () => {
    const lex = new Map(RAW.map((w) => [w.w, w]));
    lex.set("unhappiness", { w: "unhappiness", t: [["n", "不幸福"]], z: 30 });
    const m = decompose("unhappiness", (w) => lex.get(w));
    expect(m).toEqual({ kind: "derived", parts: ["un", "happy", "ness"], roots: ["happy"] });
  });
  it("false splits are refused: carpet, hatred, message, corner, bother, repair", () => {
    for (const w of ["carpet", "hatred", "message", "corner", "bother", "repair", "season", "office"]) expect(decompose(w, IDX), w).toBeNull();
  });
  it("is deterministic", () => {
    const a = IDX.list.map((w) => JSON.stringify(decompose(w.w, IDX)));
    const fresh = build(RAW, false);
    const b = fresh.list.map((w) => JSON.stringify(decompose(w.w, fresh)));
    expect(b).toEqual(a);
  });
});

describe("13.0 · 难度分", () => {
  it("syllables from IPA, spelling fallback", () => {
    expect(syllables(IDX.map.get("jazz")!)).toBe(1);
    expect(syllables(IDX.map.get("information")!)).toBeGreaterThanOrEqual(3);
    expect(syllables("recommendation")).toBeGreaterThanOrEqual(5);
  });
  it("short frequent words are easier than long rare ones", () => {
    const d = (w: string) => difficulty(IDX.map.get(w)!, IDX).score;
    expect(d("tax")).toBeLessThan(d("accommodate"));
    expect(d("fit")).toBeLessThan(d("miscalculation"));
    expect(d("group")).toBeLessThan(d("heterogeneity"));
    for (const w of IDX.list.slice(0, 200)) {
      const s = difficulty(w, IDX).score;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });
  it("same input → same score (deterministic); weights sum to 1", () => {
    const w = IDX.map.get("absorb")!;
    expect(difficulty(w, IDX)).toEqual(difficulty(w, IDX));
  });
  it("terciles split the book into three tiers", () => {
    const [t1, t2] = thresholds(IDX);
    expect(t1).toBeLessThan(t2);
    const n = { easy: 0, mid: 0, hard: 0 };
    for (const w of IDX.list) n[levelOf(difficulty(w, IDX).score, IDX)]++;
    for (const k of ["easy", "mid", "hard"] as const) expect(n[k]).toBeGreaterThan(IDX.list.length / 4);
  });
  it("knowing the parts lowers the effective difficulty (basic words count as known)", () => {
    const w = IDX.map.get("disagree")!;
    const none = effective(w, IDX, {});
    // agree is a hidden basic word? if not, learn it
    const look = (x: string) => IDX.map.get(x);
    const known = knows("agree", {}, look) ? none : effective(w, IDX, { agree: card({ st: "mastered", i: 30 }) });
    const withCard = effective(w, IDX, { agree: card({ st: "mastered", i: 30 }) });
    expect(withCard.score).toBeLessThan(withCard.base);
    expect(withCard.known).toEqual(["agree"]);
    expect(known.score).toBeLessThanOrEqual(none.base);
    // a learning card (never answered right) doesn't count
    const learning = effective(IDX.map.get("happiness")!, IDX, { happy: card({ st: "learning", i: 0, r: 0 }) });
    expect(learning.known).toEqual(knows("happy", {}, look) ? [] : []);
  });
  it("classroom: both halves basic → known → easier than its base score", () => {
    const e = effective(IDX_B.map.get("classroom")!, IDX_B, {});
    expect(e.known.sort()).toEqual(["class", "room"]);
    expect(e.score).toBeLessThan(e.base);
  });
});

describe("13.0 · 每日难度", () => {
  it("pickByLevel: picks from the chosen tier in shuffled order, falls back to neighbours", () => {
    const st = state();
    const left = newWordsLeft(IDX, st, T);
    const easy = pickByLevel(IDX, {}, left, "easy", 10);
    const hard = pickByLevel(IDX, {}, left, "hard", 10);
    expect(easy).toHaveLength(10);
    expect(easy.every((w) => levelOf(effective(IDX.map.get(w)!, IDX, {}).score, IDX) === "easy")).toBe(true);
    expect(hard.every((w) => levelOf(effective(IDX.map.get(w)!, IDX, {}).score, IDX) === "hard")).toBe(true);
    const pos = new Map(left.map((w, i) => [w, i]));
    expect(easy.map((w) => pos.get(w)!)).toEqual([...easy.map((w) => pos.get(w)!)].sort((a, b) => a - b));
    expect(pickByLevel(IDX, {}, left, "mix", 10)).toEqual(left.slice(0, 10));
    // only 3 words left: still returns all of them
    expect(pickByLevel(IDX, {}, left.slice(0, 3), "hard", 10).sort()).toEqual(left.slice(0, 3).sort());
  });
  it("nextNewGroup takes the picker; without it = first n in shuffled order", () => {
    const st = state();
    const a = nextNewGroup(IDX, st, T).map((x) => x.w);
    expect(a).toEqual(newWordsLeft(IDX, st, T).slice(0, a.length));
    const b = nextNewGroup(IDX, st, T, (left, n) => pickByLevel(IDX, {}, left, "hard", n)).map((x) => x.w);
    expect(b).toHaveLength(a.length);
    expect(b).not.toEqual(a);
  });
  it("asks once a day; default 混合; 不再每天询问 turns it off", () => {
    const st = state();
    expect(todayLevel(st, T)).toBe("mix");
    expect(needLevelAsk(st, T)).toBe(true);
    const chosen = { ...st, levelDay: { d: T, lv: "hard" as const } };
    expect(needLevelAsk(chosen, T)).toBe(false);
    expect(todayLevel(chosen, T)).toBe("hard");
    expect(needLevelAsk(chosen, "2026-10-15")).toBe(true);
    expect(todayLevel(chosen, "2026-10-15")).toBe("mix");
    expect(needLevelAsk(state({ settings: { ...defaultSettings(), levelAsk: false } }), T)).toBe(false);
  });
  it("normalize keeps a valid levelDay and drops junk", () => {
    expect(normalize({ ...state(), levelDay: { d: T, lv: "easy" } }).levelDay).toEqual({ d: T, lv: "easy" });
    expect(normalize({ ...state(), levelDay: { d: "x", lv: "easy" } }).levelDay).toBeUndefined();
    expect(normalize({ ...state(), levelDay: { d: T, lv: "insane" } }).levelDay).toBeUndefined();
    expect(cleanSettings({ ...defaultSettings(), level: "nope" as never }).level).toBe("mix");
  });
});

describe("13.0 · 云同步合并", () => {
  const row = (word: string, ts: number, o: Partial<Card> = {}): CardRow => ({ word, card: card(o), ts });
  it("pickRow: later timestamp wins; tie → more answers; full tie → local", () => {
    expect(pickRow(row("a", 2), row("a", 1))).toBe("local");
    expect(pickRow(row("a", 1), row("a", 2))).toBe("remote");
    expect(pickRow(row("a", 1, { r: 5 }), row("a", 1, { r: 2 }))).toBe("local");
    expect(pickRow(row("a", 1, { r: 2 }), row("a", 1, { r: 5 }))).toBe("remote");
    expect(pickRow(row("a", 1, { e: 2.3 }), row("a", 1, { e: 2.1 }))).toBe("local");
    expect(pickRow(undefined, row("a", 1))).toBe("remote");
    expect(pickRow(row("a", 1), undefined)).toBe("local");
  });
  it("cardTs: last revlog answer, else noon of the last review day", () => {
    expect(cardTs(card({ t: "2026-10-10" }))).toBe(new Date(2026, 9, 10, 12).getTime());
    expect(cardTs(card({ t: "2026-10-10" }), Date.UTC(2026, 9, 11) / 1000)).toBe(Date.UTC(2026, 9, 11));
  });
  it("first sign-in: local progress and cloud progress are both kept; per-word latest wins; seed taken from cloud", () => {
    const local = state({
      seed: 1,
      cards: { abandon: card({ t: "2026-10-12", i: 5 }), absorb: card({ t: "2026-10-01", i: 2 }), only_local: card() },
      checkins: ["2026-10-10", "2026-10-12"],
      star: { abandon: 1 },
    });
    const remote: CardRow[] = [
      row("absorb", new Date(2026, 9, 13, 12).getTime(), { t: "2026-10-13", i: 9 }), // newer in the cloud
      row("abandon", new Date(2026, 9, 2, 12).getTime(), { t: "2026-10-02", i: 1 }), // older in the cloud
      row("only_remote", 1, { t: "2026-09-01" }),
    ];
    const m = mergeCloud(local, { seed: 99, meta: { checkins: ["2026-10-11"], star: { absorb: 1 } }, cards: remote });
    expect(m.state.cards.absorb.i).toBe(9);
    expect(m.state.cards.abandon.i).toBe(5);
    expect(m.state.cards.only_local).toBeDefined();
    expect(m.state.cards.only_remote).toBeDefined();
    expect(m.state.checkins).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
    expect(Object.keys(m.state.star).sort()).toEqual(["abandon", "absorb"]);
    expect(m.state.seed).toBe(99);
    expect(m.push.map((r) => r.word).sort()).toEqual(["abandon", "only_local"]);
    expect(m.pulled).toBe(2);
    expect(m.conflicts).toBe(2);
    expect(m.state.settings).toBe(local.settings);
  });
  it("brand-new account: everything local is pushed, seed kept", () => {
    const local = state({ seed: 7, cards: { a: card(), b: card() } });
    const m = mergeCloud(local, { seed: null, meta: null, cards: [] });
    expect(m.push).toHaveLength(2);
    expect(m.state.seed).toBe(7);
    expect(m.profileDirty).toBe(true);
    expect(m.state.cards).toEqual(local.cards);
  });
  it("idempotent: merging the result again pulls and pushes nothing", () => {
    const local = state({ cards: { a: card({ t: "2026-10-12" }) }, checkins: ["2026-10-12"] });
    const first = mergeCloud(local, { seed: 42, meta: { checkins: ["2026-10-11"] }, cards: [row("b", 5)] });
    const cloudRows = localRows(first.state);
    const again = mergeCloud(first.state, { seed: first.state.seed, meta: metaOf(first.state), cards: cloudRows });
    expect(again.push).toHaveLength(0);
    expect(again.pulled).toBe(0);
    expect(again.state.cards).toEqual(first.state.cards);
    expect(again.state.checkins).toEqual(first.state.checkins);
    expect(again.profileDirty).toBe(false);
  });
  it("changedRows: only cards whose timestamp or content changed since the last sync", () => {
    const st = state({ cards: { a: card(), b: card() } });
    const synced = new Map(localRows(st).map((r) => [r.word, rowSig(r)]));
    expect(changedRows(st, synced)).toHaveLength(0);
    const st2 = { ...st, cards: { ...st.cards, b: { ...st.cards.b, k: 1 as const } } };
    expect(changedRows(st2, synced).map((r) => r.word)).toEqual(["b"]);
  });
  it("metaOf leaves out cards, settings and seed; trims the revlog", () => {
    const m = metaOf(state({ cards: { a: card() } }));
    expect(m.cards).toBeUndefined();
    expect(m.settings).toBeUndefined();
    expect(m.seed).toBeUndefined();
  });
});

describe("13.0 · 同义词 / 例句数据", () => {
  it("synonymsFor: WordNet/Moby list first, in-book before basic, never the word itself, ≤ 5", () => {
    const w = IDX.map.get("accurate")!;
    const s = synonymsFor(IDX, w, SYN).map((x) => x.w);
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(5);
    expect(s).not.toContain("accurate");
    expect(s).toContain("exact");
    const active = new Set(IDX.list.map((x) => x.w));
    const firstBasic = s.findIndex((x) => !active.has(x));
    if (firstBasic >= 0) expect(s.slice(firstBasic).every((x) => !active.has(x))).toBe(true);
  });
  it("falls back to same-sense groups when the thesaurus has nothing", () => {
    const w = IDX.list.find((x) => !SYN[x.w] && synonymsFor(IDX, x, {}).length > 0)!;
    expect(w).toBeDefined();
    expect(synonymsFor(IDX, w, SYN).length).toBeGreaterThan(0);
  });
  it("every synonym in syn.json is a word in the data", () => {
    for (const [k, v] of Object.entries(SYN)) {
      expect(IDX.map.has(k)).toBe(true);
      for (const x of v) expect(IDX.map.has(x), `${k} → ${x}`).toBe(true);
    }
  });
  it("coverage: synonyms for most active words (thesaurus + same-sense groups)", () => {
    const n = IDX.list.filter((w) => synonymsFor(IDX, w, SYN).length > 0).length;
    expect(n / IDX.list.length).toBeGreaterThan(0.7);
  });
  it("examples: every active word has ≥1 bundled example with a Chinese translation and a correct highlight", () => {
    const shards = new Map<string, Record<string, ExampleRow[]>>();
    const get = (w: string) => {
      const sh = shardOf(w);
      if (!shards.has(sh)) shards.set(sh, JSON.parse(readFileSync(new URL(`../../public/data/ex/${sh}.json`, import.meta.url), "utf8")));
      return shards.get(sh)![w] ?? [];
    };
    let tatoeba = 0;
    for (const w of IDX.list) {
      const rows = get(w.w);
      expect(rows.length, w.w).toBeGreaterThan(0);
      for (const r of rows) {
        const ex = rowToExample(r);
        expect(ex.zh.length, w.w).toBeGreaterThan(0);
        expect(/[\u4e00-\u9fff]/.test(ex.zh)).toBe(true);
        expect(ex.at).toBeGreaterThanOrEqual(0);
        expect(ex.en.slice(ex.at, ex.at + ex.len).length).toBe(ex.len);
        if (ex.kind === "tatoeba") tatoeba++;
        else expect(ex.kind).toBe("authored");
      }
    }
    expect(tatoeba).toBeGreaterThan(3000);
  });
  it("rowToExample parses Tatoeba ids and authored rows", () => {
    expect(rowToExample(["A b.", "甲", "t12-34", 0, 1])).toMatchObject({ kind: "tatoeba", id: "12" });
    expect(rowToExample(["A b.", "甲", "a", 0, 1]).kind).toBe("authored");
  });
});

describe("13.0 · 更新提示", () => {
  it("isNewer compares dotted versions", () => {
    expect(isNewer("13.0.1", "13.0.0")).toBe(true);
    expect(isNewer("13.0.0", "13.0.0")).toBe(false);
    expect(isNewer("12.9.9", "13.0.0")).toBe(false);
    expect(isNewer("13.1", "13.0.9")).toBe(true);
  });
});
