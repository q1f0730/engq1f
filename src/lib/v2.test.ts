import { describe, expect, it } from "vitest";
import { confusables, editDistance, isInflection } from "./confusables";
import { posOf, type Word, type WordIndex } from "./data";
import { backupDue } from "./persist";
import {
  aheadGroup,
  aheadWords,
  cappedDue,
  newWordsLeft,
  notebookWords,
  cleanPhraseCn,
  phraseFor,
  phraseOptions,
  practiceGroup,
  reviewGroup,
  summarize,
} from "./plan";
import {
  addDays,
  answer,
  buryCurrent,
  createSession,
  intervalLabel,
  isLeech,
  newCard,
  pickMode,
  previewIntervals,
  schedule,
  undo,
  type Card,
  type SessionItem,
} from "./srs";
import { initialState, normalize, type AppState } from "./store";
import { VIBE } from "./haptics";

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

const W = (w: string, m: string, extra: Partial<Word> = {}): Word => ({ w, t: [["v", m]], ...extra });

const LIST: Word[] = [
  W("adapt", "适应", { c: 1, ph: [["adapt to", "适应"]] }),
  W("adopt", "采用；收养", { c: 1, ph: [["adopt a child", "收养孩子"]] }),
  W("adept", "熟练的"),
  W("affect", "影响", { c: 1, ph: [["be affected by", "受…影响"]] }),
  W("effect", "效果", { ph: [["in effect", "实际上"]] }),
  W("use", "使用", { ph: [["make use of", "利用"]] }),
  W("used", "用过的"),
  W("abandon", "放弃", { ph: [["abandon oneself to", "沉溺于"]] }),
  W("quiet", "安静的", { ph: [["keep quiet", "保持安静"]] }),
  W("quite", "相当"),
  W("quit", "放弃；离开", { ph: [["quit smoking", "戒烟"]] }),
  W("zebra", "斑马"),
  W("admit", "承认"),
  W("principal", "主要的", { ph: [["principal part", "主要部分"]] }),
  W("principle", "原则", { ph: [["in principle", "原则上"], ["principle of", "n. …的原理；…的原则；…的规律"]] }),
];
const IDX = mkIndex(LIST);

function card(over: Partial<Card> = {}): Card {
  return { ...newCard("2026-10-01"), st: "review", i: 4, r: 2, d: T, t: "2026-10-09", ...over };
}

function state(over: Partial<AppState> = {}): AppState {
  const s = initialState();
  return { ...s, onboarded: true, ...over, settings: { ...s.settings, ...(over.settings ?? {}) } };
}

describe("v2 · 间隔预览", () => {
  it("labels intervals in Chinese", () => {
    expect(intervalLabel(0)).toBe("今天");
    expect(intervalLabel(1)).toBe("1天");
    expect(intervalLabel(29)).toBe("29天");
    expect(intervalLabel(60)).toBe("2个月");
    expect(intervalLabel(730)).toBe("2年");
  });
  it("new word: 认识 2天 / 模糊 今天 / 不认识 今天", () => {
    expect(previewIntervals(undefined, T)).toEqual({ know: "2天", vague: "今天", forget: "今天" });
  });
  it("matches schedule() for a review card", () => {
    const c = card({ i: 10, e: 2.5 });
    const p = previewIntervals(c, T);
    expect(p.know).toBe(intervalLabel(schedule(c, "know", T).i));
    expect(p.know).toBe("25天");
    expect(p.vague).toBe("12天");
    expect(p.forget).toBe("今天");
  });
  it("relearn (repeat) preview: 认识 → 1天", () => {
    const c = card({ i: 0, st: "learning" });
    expect(previewIntervals(c, T, { repeat: true }).know).toBe("1天");
  });
});

describe("v2 · 提前复习", () => {
  it("early 认识 uses elapsed days and never shortens the interval", () => {
    // 上次复习 4 天前，间隔 5 天，明天到期；提前一天复习
    const c = card({ i: 5, t: addDays(T, -4), d: addDays(T, 1), e: 2.5 });
    const n = schedule(c, "know", T, { early: true });
    expect(n.i).toBe(10); // round(4 × 2.5)
    const tiny = card({ i: 5, t: T, d: addDays(T, 1) }); // 今天刚复习过
    expect(schedule(tiny, "know", T, { early: true }).i).toBe(5);
    // 普通复习不受影响
    expect(schedule(c, "know", T).i).toBe(13);
  });
  it("aheadWords returns tomorrow's (not killed) cards; summarize counts them only when today is clear", () => {
    const tomorrow = addDays(T, 1);
    const cards = {
      adapt: card({ d: tomorrow, i: 3 }),
      adopt: card({ d: tomorrow, i: 1 }),
      quit: card({ d: addDays(T, 2) }),
      zebra: { ...card({ d: tomorrow }), k: 1 as const },
    };
    const st = state({ cards });
    expect(aheadWords(st, T)).toEqual(["adopt", "adapt"]);
    const g = aheadGroup(IDX, st, T);
    expect(g.every((x) => x.early && x.kind === "review")).toBe(true);
    expect(summarize(IDX, st, T).aheadCount).toBe(2);
    const busy = state({ cards: { ...cards, quiet: card({ d: T }) } });
    expect(summarize(IDX, busy, T).aheadCount).toBe(0);
  });
  it("session answer passes early through", () => {
    const c = card({ i: 5, t: addDays(T, -4), d: addDays(T, 1) });
    const s = createSession([{ w: "adapt", kind: "review", mode: "recall", early: true }]);
    expect(answer(s, c, "know", T, undefined).card.i).toBe(10);
  });
});

describe("v2 · 每日复习上限", () => {
  const cards: Record<string, Card> = {};
  LIST.forEach((w) => (cards[w.w] = card({ d: T })));
  it("caps due and reports deferred", () => {
    const st = state({ cards, settings: { reviewCap: 5 } as AppState["settings"] });
    expect(cappedDue(st, T, 12)).toBe(5);
    const sum = summarize(IDX, st, T);
    expect(sum.due).toBe(5);
    expect(sum.deferred).toBe(LIST.length - 5);
    expect(reviewGroup(IDX, st, T)).toHaveLength(5);
  });
  it("reviews done today count against the cap; cap reached → can check in", () => {
    const st = state({
      cards,
      settings: { reviewCap: 5, daily: 10, book: "all" } as AppState["settings"],
      log: { [T]: { n: 10, r: 5, ok: 10, a: 15, ms: 0 } },
    });
    const sum = summarize(IDX, st, T);
    expect(sum.due).toBe(0);
    expect(sum.ready).toBe(true);
    expect(reviewGroup(IDX, st, T)).toHaveLength(0);
  });
  it("0 = unlimited", () => {
    const st = state({ cards });
    expect(summarize(IDX, st, T).due).toBe(LIST.length);
    expect(summarize(IDX, st, T).deferred).toBe(0);
  });
});

describe("v2 · 明天再说", () => {
  const items: SessionItem[] = [
    { w: "adapt", kind: "review", mode: "recall" },
    { w: "adopt", kind: "new", mode: "recall" },
  ];
  it("existing card moves to tomorrow, leaves the queue, undo restores", () => {
    const c = card({ d: T });
    const s0 = createSession(items);
    const r = buryCurrent(s0, c, T, undefined);
    expect(r.card?.d).toBe(addDays(T, 1));
    expect(r.card?.i).toBe(c.i);
    expect(r.card?.l).toBe(c.l);
    expect(r.session.queue.map((q) => q.w)).toEqual(["adopt"]);
    expect(r.session.done).toEqual(["adapt"]);
    expect(r.session.firsts).toEqual({}); // 不计对错
    const u = undo(r.session)!;
    expect(u.card).toEqual(c);
    expect(u.session.queue).toHaveLength(2);
  });
  it("new word returns no card; buried new words are skipped until that day", () => {
    const s0 = createSession(items.slice(1));
    expect(buryCurrent(s0, undefined, T, undefined).card).toBeUndefined();
    const st = state({ bury: { abandon: addDays(T, 1) } });
    expect(newWordsLeft(IDX, st, T)).not.toContain("abandon");
    expect(newWordsLeft(IDX, st, addDays(T, 1))).toContain("abandon");
    expect(newWordsLeft(IDX, st)).toContain("abandon");
  });
  it("removes pending relearn items of the same word", () => {
    let s = createSession(items);
    s = answer(s, undefined, "forget", T, undefined).session; // adapt → relearn later
    s = { ...s, queue: [s.queue.find((q) => q.w === "adapt")!, ...s.queue.filter((q) => q.w !== "adapt")] };
    const r = buryCurrent(s, card(), T, undefined);
    expect(r.session.queue.some((q) => q.w === "adapt")).toBe(false);
  });
});

describe("v2 · 形近词", () => {
  it("bounded edit distance", () => {
    expect(editDistance("adapt", "adopt")).toBe(1);
    expect(editDistance("affect", "effect")).toBe(1);
    expect(editDistance("quiet", "quite")).toBe(1); // 对调算一步
    expect(editDistance("adapt", "admit")).toBe(2);
    expect(editDistance("abandon", "zebra", 2)).toBe(3);
  });
  it("inflections are not confusables", () => {
    expect(isInflection("use", "used")).toBe(true);
    expect(isInflection("quit", "quite")).toBe(false);
  });
  it("finds look-alikes, best first, max 3, excludes inflections", () => {
    const c = confusables(IDX, IDX.map.get("adapt")!).map((w) => w.w);
    expect(c[0]).toBe("adopt");
    expect(c).toContain("adept");
    expect(c).not.toContain("admit");
    expect(c.length).toBeLessThanOrEqual(3);
    expect(confusables(IDX, IDX.map.get("use")!).map((w) => w.w)).not.toContain("used");
    expect(confusables(IDX, IDX.map.get("quiet")!).map((w) => w.w)).toEqual(expect.arrayContaining(["quite", "quit"]));
    expect(confusables(IDX, IDX.map.get("zebra")!)).toEqual([]);
  });
});

describe("v2 · 顽固词", () => {
  it("lapses ≥ 3 and not killed", () => {
    expect(isLeech(card({ l: 2 }))).toBe(false);
    expect(isLeech(card({ l: 3 }))).toBe(true);
    expect(isLeech({ ...card({ l: 5 }), k: 1 })).toBe(false);
    expect(isLeech(undefined)).toBe(false);
  });
  it("notebook 'hard' lists leeches", () => {
    const st = state({ cards: { adapt: card({ l: 4 }), adopt: card({ l: 1 }) } });
    expect(notebookWords(st, "hard")).toEqual(["adapt"]);
    expect(notebookWords(st, "wrong").sort()).toEqual(["adapt", "adopt"]);
  });
});

describe("v2 · 短语选义", () => {
  it("pickMode only gives phrase mode to words with phrases", () => {
    const without = new Set(Array.from({ length: 80 }, (_, k) => pickMode(`w${k}`, T)));
    expect(without.has("phrase")).toBe(false);
    const withPh = new Set(Array.from({ length: 80 }, (_, k) => pickMode(`w${k}`, T, false, true)));
    expect(withPh.has("phrase")).toBe(true);
  });
  it("long words allow 2 edits", () => {
    expect(confusables(IDX, IDX.map.get("principal")!).map((w) => w.w)).toContain("principle");
  });
  it("cleans phrase Chinese: drops POS prefix, keeps ≤2 senses", () => {
    expect(cleanPhraseCn("n. …的原理；…的原则；…的规律")).toBe("…的原理；…的原则");
    expect(cleanPhraseCn("adv. 大家都同意（公认）")).toBe("大家都同意（公认）");
  });
  it("phraseFor prefers phrases that contain the word", () => {
    const w: Word = W("take", "拿", { ph: [["make off", "逃走"], ["take off", "起飞"]] });
    expect(phraseFor(w, 1)?.[0]).toBe("take off");
    expect(phraseFor(w, 2)?.[0]).toBe("take off");
  });
  it("phraseFor is stable; options are 4 distinct translations incl. the right one", () => {
    const w = IDX.map.get("adapt")!;
    expect(phraseFor(w, 7)).toEqual(["adapt to", "适应"]);
    expect(phraseFor(IDX.map.get("zebra")!, 7)).toBeUndefined();
    const opts = phraseOptions(IDX, w, 7);
    expect(opts).toHaveLength(4);
    expect(opts.map((o) => o.w)).toContain("adapt");
    const texts = opts.map((o) => phraseFor(o, 7)![1]);
    expect(new Set(texts).size).toBe(4);
  });
});

describe("v2 · 错词再练", () => {
  it("builds quiz items (never plain recall) for known words only", () => {
    const g = practiceGroup(IDX, state(), ["adapt", "nonexistent", "quit"], T);
    expect(g.map((x) => x.w)).toEqual(["adapt", "quit"]);
    expect(g.every((x) => x.mode !== "recall")).toBe(true);
  });
});

describe("v2 · 震动 & 数据安全", () => {
  it("vibration patterns: short / medium / double", () => {
    expect(VIBE.know).toBeLessThan(VIBE.vague as number);
    expect(Array.isArray(VIBE.forget)).toBe(true);
  });
  it("backup reminder after 7 days with ≥10 cards, snoozable", () => {
    const cards: Record<string, Card> = {};
    for (let k = 0; k < 10; k++) cards[`w${k}`] = card({ f: addDays(T, -8) });
    expect(backupDue({ cards }, T)).toBe(8);
    expect(backupDue({ cards, lastBackup: addDays(T, -2) }, T)).toBeNull();
    expect(backupDue({ cards, lastBackup: addDays(T, -7) }, T)).toBe(7);
    expect(backupDue({ cards, backupSnooze: addDays(T, 1) }, T)).toBeNull();
    expect(backupDue({ cards: { a: card({ f: "2020-01-01" }) } }, T)).toBeNull();
  });
  it("old backups normalize with new defaults", () => {
    const n = normalize({ cards: {}, settings: { daily: 30 } });
    expect(n.bury).toEqual({});
    expect(n.settings.reviewCap).toBe(0);
    expect(n.settings.haptics).toBe(true);
    expect(n.settings.daily).toBe(30);
  });
});
