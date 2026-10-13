import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { posOf, type Word, type WordIndex } from "./data";
import {
  LETTERS,
  LIST_MAX,
  LIST_NAME_MAX,
  addWords,
  cleanListName,
  fileSafe,
  hasPos,
  jumpTarget,
  letterIndex,
  letterOf,
  listGroup,
  listProgress,
  listStepLabel,
  listsOf,
  meaningLine,
  normalizeLists,
  posSet,
  removeWords,
  sortWords,
  toAnki,
  toCSV,
  type WordList,
} from "./lists";
import { NEVER, newCard, type Card } from "./srs";
import {
  addToList,
  batchKill,
  batchReset,
  createList,
  deleteList,
  getState,
  initialState,
  normalize,
  removeFromList,
  renameList,
  resetAll,
  restoreSnapshot,
  snapshot,
  starWords,
  type AppState,
} from "./store";

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
const card = (d: string, extra: Partial<Card> = {}): Card => ({ ...newCard("2026-10-01"), st: "review", i: 5, r: 2, d, ...extra });
const L = (words: string[], name = "测试"): WordList => ({ id: "l1", name, words, at: T });

describe("v5 · 自定义词单（纯函数）", () => {
  it("cleans names: trims, collapses spaces, caps length, fills 词单 N", () => {
    expect(cleanListName("  阅读   真题 ")).toBe("阅读 真题");
    expect(cleanListName("x".repeat(40))).toHaveLength(LIST_NAME_MAX);
    expect(cleanListName("   ")).toBe("词单 1");
    expect(cleanListName("", ["词单 1", "词单 2"])).toBe("词单 3");
  });
  it("adds words in order without duplicates and removes them", () => {
    const a = addWords(L(["apple"]), ["book", "apple", "book", "", "cat"]);
    expect(a.words).toEqual(["apple", "book", "cat"]);
    expect(removeWords(a, ["apple", "zzz"]).words).toEqual(["book", "cat"]);
    // 原对象不变
    expect(L(["apple"]).words).toEqual(["apple"]);
  });
  it("normalizes backups: drops bad entries, dedupes ids and words, caps count", () => {
    const raw = [
      { id: "a", name: "A", words: ["x", "x", 3, "y"], at: T },
      { id: "a", name: "dup id", words: [] },
      { name: "no id", words: [] },
      { id: "b", name: "", words: "nope" },
      { id: "c", name: "", words: [] },
      null,
    ];
    const out = normalizeLists(raw);
    expect(out.map((l) => l.id)).toEqual(["a", "c"]);
    expect(out[0].words).toEqual(["x", "y"]);
    expect(out[1].name).toBe("词单 1");
    expect(normalizeLists("bad")).toEqual([]);
    const many = Array.from({ length: LIST_MAX + 5 }, (_, k) => ({ id: `l${k}`, name: `n${k}`, words: [] }));
    expect(normalizeLists(many)).toHaveLength(LIST_MAX);
  });
  it("normalize() keeps lists from a backup and defaults to []", () => {
    expect(normalize({ cards: {} }).lists).toEqual([]);
    expect(normalize({ lists: [{ id: "q", name: "Q", words: ["able"] }] }).lists[0].words).toEqual(["able"]);
  });
  it("listsOf finds membership; progress counts unlearned / learning / mastered / due", () => {
    const lists = [L(["able", "about"]), { ...L(["about"]), id: "l2" }];
    expect(listsOf(lists, "about").map((l) => l.id)).toEqual(["l1", "l2"]);
    const s = st({ cards: { able: card(T), above: card("2026-12-01", { st: "mastered", i: 30 }) } });
    const p = listProgress(REAL, s, L(["able", "above", "about", "notaword"]), T);
    expect(p).toEqual({ total: 3, unlearned: 1, learning: 1, mastered: 1, due: 1 });
  });
});

describe("v5 · 词单学习", () => {
  const words = ["abandon", "ability", "able", "aboard", "about", "above", "abroad", "absence", "absent", "absolute", "absorb", "abstract"];
  it("due words first (earliest first)", () => {
    const s = st({ cards: { able: card("2026-10-12"), abroad: card("2026-10-10"), absorb: card("2026-11-01") } });
    const g = listGroup(REAL, s, words, T);
    expect(g.step).toBe("due");
    expect(g.items.map((i) => i.w)).toEqual(["abroad", "able"]);
    expect(g.items.every((i) => i.kind === "review")).toBe(true);
    expect(listStepLabel(g)).toBe("复习到期 2 词");
  });
  it("then up to 10 unlearned words in list order, skipping buried ones", () => {
    const s = st({ cards: { able: card("2026-11-01") }, bury: { abandon: "2026-10-14" } });
    const g = listGroup(REAL, s, words, T);
    expect(g.step).toBe("new");
    expect(g.items).toHaveLength(10);
    expect(g.items[0]).toEqual({ w: "ability", kind: "new", mode: "recall" });
    expect(g.items.map((i) => i.w)).not.toContain("able");
    expect(g.items.map((i) => i.w)).not.toContain("abandon");
    expect(listStepLabel(g)).toBe("学 10 个新词");
  });
  it("all learned → early consolidation (never killed words); all killed → done", () => {
    const cards: Record<string, Card> = {};
    for (const w of words) cards[w] = card("2026-11-01");
    cards.abstract = { ...card(NEVER), k: 1, st: "mastered" };
    const g = listGroup(REAL, st({ cards }), words, T);
    expect(g.step).toBe("review");
    expect(g.items).toHaveLength(11);
    expect(g.items.every((i) => i.early)).toBe(true);
    expect(g.items.map((i) => i.w)).not.toContain("abstract");
    const killed: Record<string, Card> = Object.fromEntries(words.map((w) => [w, { ...card(NEVER), k: 1 as const, st: "mastered" as const }]));
    expect(listGroup(REAL, st({ cards: killed }), words, T)).toEqual({ step: "done", items: [] });
    expect(listGroup(REAL, st(), ["notaword"], T).step).toBe("done");
  });
});

describe("v5 · 排序 / 词性 / 字母索引", () => {
  const list = ["absorb", "Africa", "able", "zone", "about"].map(W);
  it("alpha sort is case-insensitive", () => {
    expect(sortWords(list, {}, "alpha").map((w) => w.w)).toEqual(["able", "about", "absorb", "Africa", "zone"]);
    expect(sortWords(list, {}, "default")).toBe(list);
  });
  it("lapses desc, due asc (killed after), ease asc; unlearned always last", () => {
    const cards: Record<string, Card> = {
      absorb: card("2026-10-20", { l: 1, e: 2.1 }),
      able: card("2026-10-15", { l: 4, e: 1.5 }),
      zone: { ...card(NEVER, { l: 0, e: 2.5 }), k: 1 },
      about: card("2026-10-15", { l: 4, e: 2.8 }),
    };
    expect(sortWords(list, cards, "lapses").map((w) => w.w)).toEqual(["able", "about", "absorb", "zone", "Africa"]);
    expect(sortWords(list, cards, "due").map((w) => w.w)).toEqual(["able", "about", "absorb", "zone", "Africa"]);
    expect(sortWords(list, cards, "ease").map((w) => w.w)).toEqual(["able", "absorb", "zone", "about", "Africa"]);
  });
  it("posSet splits combined tags and folds vt/vi into v", () => {
    const fake: Word = { w: "x", t: [["n&vt", "a"], ["adj", "b"]] };
    expect([...posSet(fake)].sort()).toEqual(["adj", "n", "v"]);
    expect(hasPos(fake, "v")).toBe(true);
    expect(hasPos(fake, "adv")).toBe(false);
    expect(hasPos(fake, "any")).toBe(true);
    // 真实词：所有释义行都算
    const abs = W("absent");
    expect(hasPos(abs, "adj")).toBe(true);
  });
  it("pos filter on the real list matches every line, not only the first", () => {
    const verbs = REAL.list.filter((w) => hasPos(w, "v"));
    const firstOnly = REAL.list.filter((w) => posOf(w) === "v");
    expect(verbs.length).toBeGreaterThan(firstOnly.length);
    expect(firstOnly.every((w) => hasPos(w, "v"))).toBe(true);
  });
  it("letter index + jump falls through to the next letter that exists", () => {
    const sorted = sortWords(["apple", "axe", "cat", "dog", "zebra"].map((w) => ({ w, t: [["n", "x"]] }) as Word), {}, "alpha");
    const idx = letterIndex(sorted);
    expect([...idx.entries()]).toEqual([["A", 0], ["C", 2], ["D", 3], ["Z", 4]]);
    expect(jumpTarget(idx, "C", 5)).toBe(2);
    expect(jumpTarget(idx, "B", 5)).toBe(2);
    expect(jumpTarget(idx, "E", 5)).toBe(4);
    expect(letterOf("Africa")).toBe("A");
    expect(letterOf("3D")).toBe("#");
    expect(LETTERS).toHaveLength(26);
    // 词库里 26 个字母都有词吗？至少 A 和 Z 有
    const real = letterIndex(sortWords(REAL.list, {}, "alpha"));
    expect(real.get("A")).toBe(0);
    expect(real.has("Z")).toBe(true);
  });
});

describe("v5 · 导出 CSV / Anki", () => {
  it("CSV has BOM, header, quotes cells with commas/quotes, CRLF", () => {
    const fake: Word[] = [
      { w: "say", p: ["seɪ", "seɪ"], t: [["v", "说，讲"], ["n", '发言权 "x"']] },
      { w: "nop", t: [["n", "无音标"]] },
    ];
    const csv = toCSV(fake);
    expect(csv.startsWith("\uFEFF单词,音标,释义\r\n")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('say,/seɪ/,"v. 说，讲；n. 发言权 ""x"""');
    expect(lines[2]).toBe("nop,,n. 无音标");
  });
  it("CSV round-trips the real first meanings", () => {
    const words = REAL.list.slice(0, 50);
    const csv = toCSV(words);
    for (const w of words) expect(csv).toContain(w.w);
    expect(meaningLine(W("able"))).toContain("adj.");
  });
  it("Anki TSV: header directives, 3 tab-separated columns, HTML-escaped back with <br>", () => {
    const fake: Word[] = [{ w: "lt", p: ["a", "b"], t: [["n", "<小于>\t号"], ["v", "比较"]] }];
    const tsv = toAnki(fake, "uk", "CET4 词单");
    const lines = tsv.trimEnd().split("\n");
    expect(lines.slice(0, 3)).toEqual(["#separator:tab", "#html:true", "#tags column:3"]);
    const cols = lines[3].split("\t");
    expect(cols).toEqual(["lt", "/b/<br>n. &lt;小于&gt; 号<br>v. 比较", "CET4_词单"]);
  });
  it("file names drop unsafe characters", () => {
    expect(fileSafe('阅读/真题: "U3"')).toBe("阅读-真题-U3");
    expect(fileSafe("  ")).toBe("词单");
  });
});

describe("v5 · store 词单与批量操作", () => {
  beforeAll(() => {
    // store 的 commit 会碰 document/window（主题），node 下给个最小替身
    const g = globalThis as Record<string, unknown>;
    g.window ??= { matchMedia: () => ({ matches: false }) };
    g.document ??= { documentElement: { classList: { contains: () => true } }, querySelector: () => null };
  });
  it("create / add / remove / rename / delete", () => {
    resetAll();
    const id = createList("  我的  词单 ", ["able", "about", "able"])!;
    expect(getState().lists[0]).toMatchObject({ id, name: "我的 词单", words: ["able", "about"] });
    addToList(id, ["above", "able"]);
    expect(getState().lists[0].words).toEqual(["able", "about", "above"]);
    removeFromList(id, ["about"]);
    expect(getState().lists[0].words).toEqual(["able", "above"]);
    const id2 = createList("")!;
    expect(getState().lists.find((l) => l.id === id2)!.name).toBe("词单 1");
    renameList(id2, "听力");
    expect(getState().lists.find((l) => l.id === id2)!.name).toBe("听力");
    deleteList(id);
    expect(getState().lists.map((l) => l.id)).toEqual([id2]);
  });
  it("caps at LIST_MAX lists", () => {
    resetAll();
    for (let k = 0; k < LIST_MAX; k++) expect(createList(`l${k}`)).toBeTruthy();
    expect(createList("one too many")).toBeNull();
  });
  it("batch star / kill / reset, and snapshot undo restores everything", () => {
    resetAll();
    const id = createList("x", ["able"])!;
    const snap = snapshot();
    starWords(["able", "about"]);
    batchKill(["able", "about"]);
    expect(getState().cards.able.k).toBe(1);
    removeFromList(id, ["able"]);
    restoreSnapshot(snap);
    expect(getState().cards).toEqual({});
    expect(getState().star).toEqual({});
    expect(getState().lists[0].words).toEqual(["able"]);
    batchKill(["able"]);
    batchReset(["able", "zzz"]);
    expect(getState().cards.able).toBeUndefined();
  });
});
