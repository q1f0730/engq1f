import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { confusables, editDistance, isInflection } from "./confusables";
import { posOf, type Word, type WordIndex } from "./data";
import { silentWav } from "./media-session";
import { listenDistractors, listenOptions, samePron, reviewGroup, speedGroup, tapeList, todayNewWords, practiceGroup } from "./plan";
import { answer, createSession, newCard, pickMode, type Card } from "./srs";
import { cleanSettings, defaultSettings, initialState, normalize, type AppState } from "./store";
import { GAP_AFTER_CN, GAP_AFTER_EN, cnSpeech, fmtRemain, sleepLeft, speechTimeout, tapeSteps, ttsRate, wrapIndex } from "./tape";

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
  W("adapt", "适应；改编", { c: 1 }),
  W("adopt", "采用；收养", { c: 1 }),
  W("adept", "熟练的"),
  W("affect", "影响", { c: 1 }),
  W("effect", "效果"),
  W("quiet", "安静的"),
  W("quite", "相当"),
  W("quit", "放弃；离开"),
  W("zebra", "斑马"),
  W("admit", "承认"),
  W("abandon", "放弃"),
  W("ability", "能力"),
];
const IDX = mkIndex(LIST);
const REAL = mkIndex(JSON.parse(readFileSync(new URL("../../public/data/cet4.json", import.meta.url), "utf8")) as Word[]);

function card(over: Partial<Card> = {}): Card {
  return { ...newCard("2026-10-01"), st: "review", i: 4, r: 2, d: T, t: "2026-10-09", ...over };
}
function state(over: Partial<AppState> = {}): AppState {
  const s = initialState();
  return { ...s, onboarded: true, ...over, settings: { ...s.settings, ...(over.settings ?? {}) } };
}

describe("v3 · 磁带模式步骤", () => {
  const word: Word = { w: "adapt", t: [["v", "适应；改编（作品）；使适合"], ["n", "调整，改动，修改"]] };
  it("one pass = en → gap → cn → gap, cn text has no POS and ≤3 senses per line", () => {
    const s = tapeSteps(word, 1);
    expect(s.map((x) => x.kind)).toEqual(["en", "gap", "cn", "gap"]);
    expect(cnSpeech(word)).toBe("适应，改编，使适合；调整，改动，修改");
    expect(s[1]).toMatchObject({ ms: GAP_AFTER_EN });
    expect(s[3]).toMatchObject({ ms: GAP_AFTER_CN });
  });
  it("repeat N reads the pair N times with pass numbers, clamped to 1..3", () => {
    const s = tapeSteps(word, 2);
    expect(s.filter((x) => x.kind === "en").map((x) => x.pass)).toEqual([1, 2]);
    expect(s.filter((x) => x.kind === "cn")).toHaveLength(2);
    expect(tapeSteps(word, 9).filter((x) => x.kind === "en")).toHaveLength(3);
    expect(tapeSteps(word, 0).filter((x) => x.kind === "en")).toHaveLength(1);
  });
  it("gaps shrink with faster speech", () => {
    const fast = tapeSteps(word, 1, 1.25);
    expect(fast[1]).toMatchObject({ ms: Math.round(GAP_AFTER_EN / 1.25) });
    const slow = tapeSteps(word, 1, 0.75);
    expect((slow[3] as { ms: number }).ms).toBeGreaterThan(GAP_AFTER_CN);
  });
  it("identical meanings for different POS are read once", () => {
    expect(cnSpeech({ w: "abuse", t: [["n", "滥用，虐待"], ["v", "滥用；虐待"]] })).toBe("滥用，虐待");
  });
  it("word without Chinese text skips the cn step", () => {
    expect(tapeSteps({ w: "x", t: [["", ""]] }, 1).map((s) => s.kind)).toEqual(["en", "gap"]);
  });
  it("wrapIndex loops both ways", () => {
    expect(wrapIndex(5, 5)).toBe(0);
    expect(wrapIndex(-1, 5)).toBe(4);
    expect(wrapIndex(3, 0)).toBe(0);
  });
});

describe("v3 · 定时停止", () => {
  it("sleepLeft counts down by absolute time, null when off", () => {
    expect(sleepLeft(null, 1000)).toBeNull();
    expect(sleepLeft(10 * 60000, 0)).toBe(600000);
    expect(sleepLeft(1000, 5000)).toBe(0);
  });
  it("fmtRemain → m:ss", () => {
    expect(fmtRemain(600000)).toBe("10:00");
    expect(fmtRemain(59001)).toBe("1:00");
    expect(fmtRemain(1500)).toBe("0:02");
    expect(fmtRemain(-5)).toBe("0:00");
  });
});

describe("v3 · 发音语速", () => {
  it("TTS rate scales from 0.9 at 1×", () => {
    expect(ttsRate(1)).toBe(0.9);
    expect(ttsRate(0.75)).toBe(0.68);
    expect(ttsRate(1.25)).toBe(1.13);
    expect(ttsRate(0)).toBe(0.9);
  });
  it("speech timeout grows with Chinese length and shrinks with rate", () => {
    expect(speechTimeout("适应，改编", 1)).toBeGreaterThan(speechTimeout("适应", 1));
    expect(speechTimeout("适应，改编", 1.25)).toBeLessThan(speechTimeout("适应，改编", 1));
  });
  it("defaults and cleanup of out-of-range settings", () => {
    const d = defaultSettings();
    expect([d.rate, d.tapeRepeat, d.wakeLock]).toEqual([1, 1, true]);
    expect(cleanSettings({ ...d, rate: 3, tapeRepeat: 7, wakeLock: "x" as unknown as boolean })).toMatchObject({ rate: 1, tapeRepeat: 1, wakeLock: true });
    expect(cleanSettings({ ...d, rate: 0.75, tapeRepeat: 3, wakeLock: false })).toMatchObject({ rate: 0.75, tapeRepeat: 3, wakeLock: false });
  });
  it("old v2 backups get the new settings filled in", () => {
    const old = { ...initialState(), settings: { book: "core", daily: 30 } };
    const n = normalize(old);
    expect(n.settings).toMatchObject({ book: "core", daily: 30, rate: 1, tapeRepeat: 1, wakeLock: true });
  });
});

describe("v3 · 磁带范围", () => {
  const st = state({
    cards: {
      adapt: card({ f: T, d: "2026-10-15" }),
      adopt: card({ f: T, k: 1, d: "9999-12-31" }),
      quiet: card({ d: T, l: 1 }),
      quite: card({ d: "2026-10-10", l: 3 }),
      zebra: card({ d: "2026-10-20" }),
      ghost: card({ d: T }),
    },
    star: { effect: 1, zebra: 1 },
  });
  it("今日新词 = first learned today (not killed); before studying → preview next daily words", () => {
    expect(todayNewWords(IDX, st, T)).toEqual({ words: ["adapt"], preview: false });
    const fresh = state({ settings: { ...defaultSettings(), daily: 10, order: "alpha" } });
    const p = todayNewWords(IDX, fresh, T);
    expect(p.preview).toBe(true);
    expect(p.words).toHaveLength(10);
    expect(p.words[0]).toBe("abandon");
  });
  it("due / star / wrong / hard lists; unknown words dropped", () => {
    expect(tapeList(IDX, st, "due", T)).toEqual(["quite", "quiet"]);
    expect(tapeList(IDX, st, "star", T).sort()).toEqual(["effect", "zebra"]);
    expect(tapeList(IDX, st, "wrong", T).sort()).toEqual(["quiet", "quite"]);
    expect(tapeList(IDX, st, "hard", T)).toEqual(["quite"]);
  });
});

describe("v3 · 速刷", () => {
  it("speed group = due reviews (capped like review) all as recall cards", () => {
    const cards: Record<string, Card> = {};
    for (const w of LIST.slice(0, 8)) cards[w.w] = card();
    const st = state({ cards, settings: { ...defaultSettings(), reviewCap: 5 } });
    const g = speedGroup(IDX, st, T);
    expect(g.map((x) => x.w)).toEqual(reviewGroup(IDX, st, T).map((x) => x.w));
    expect(g).toHaveLength(5);
    expect(g.every((x) => x.mode === "recall" && x.kind === "review")).toBe(true);
  });
  it("left swipe (forget) requeues and adds a lapse; right swipe advances the interval", () => {
    const s = createSession([{ w: "adapt", kind: "review", mode: "recall" }, { w: "adopt", kind: "review", mode: "recall" }]);
    const r1 = answer(s, card(), "forget", T, undefined);
    expect(r1.card.l).toBe(1);
    expect(r1.session.queue.map((q) => q.w)).toEqual(["adopt", "adapt"]);
    const r2 = answer(r1.session, card(), "know", T, r1.log);
    expect(r2.card.i).toBe(10);
  });
});

describe("v3 · 听音辨词", () => {
  it("pickMode offers listen only to words with confusables", () => {
    const without = new Set(Array.from({ length: 80 }, (_, k) => pickMode(`w${k}`, T, false, true)));
    expect(without.has("listen")).toBe(false);
    const withL = new Set(Array.from({ length: 80 }, (_, k) => pickMode(`w${k}`, T, false, false, true)));
    expect(withL.has("listen")).toBe(true);
    expect(withL.has("phrase")).toBe(false);
  });
  it("hasPhrase-only distribution unchanged from v2 (same modes, same order)", () => {
    for (let k = 0; k < 40; k++) {
      const m = pickMode(`w${k}`, T, false, true);
      expect(["en2cn", "cn2en", "audio", "recall", "phrase"]).toContain(m);
    }
  });
  it("review groups give listen mode to words with look-alikes", () => {
    const cards: Record<string, Card> = {};
    for (const w of REAL.list.filter((x) => x.c).slice(0, 400)) cards[w.w] = card();
    const st = state({ cards, settings: { ...defaultSettings(), reviewCap: 0 } });
    const modes = new Set<string>();
    for (let d = 0; d < 6; d++) for (const it of reviewGroup(REAL, st, `2026-10-1${d}`)) modes.add(it.mode);
    expect(modes.has("listen")).toBe(true);
  });
  it("distractors are 3 distinct spelling-similar words, confusables first", () => {
    const d = listenDistractors(IDX, IDX.map.get("adapt")!).map((w) => w.w);
    expect(d).toHaveLength(3);
    expect(new Set(d).size).toBe(3);
    expect(d).not.toContain("adapt");
    expect(d[0]).toBe("adopt");
    // affect / effect：首字母不同的形近词也算
    expect(listenDistractors(IDX, IDX.map.get("affect")!).map((w) => w.w)).toContain("effect");
    expect(d).toContain("adept");
  });
  it("real data: options are 4 English words, each a look-alike (confusable or same first letter), none an inflection", () => {
    for (const w of ["adapt", "quite", "principal", "affect", "abandon", "vacuum", "economy"]) {
      const word = REAL.map.get(w)!;
      const opts = listenOptions(REAL, word, 7);
      expect(opts).toHaveLength(4);
      expect(new Set(opts.map((o) => o.w)).size).toBe(4);
      expect(opts.some((o) => o.w === w)).toBe(true);
      const conf = new Set(confusables(REAL, word).map((c) => c.w));
      for (const o of opts) {
        expect(conf.has(o.w) || o.w[0].toLowerCase() === w[0]).toBe(true);
        if (o.w !== w) {
          expect(isInflection(w, o.w.toLowerCase())).toBe(false);
          expect(editDistance(w, o.w.toLowerCase(), 4)).toBeLessThanOrEqual(4);
        }
      }
    }
  });
  it("homophones (site / cite) are never distractors", () => {
    const cite = REAL.map.get("cite")!;
    const site = REAL.map.get("site")!;
    expect(samePron(cite, site)).toBe(true);
    expect(samePron(cite, REAL.map.get("city")!)).toBe(false);
    expect(listenDistractors(REAL, cite).map((w) => w.w)).not.toContain("site");
    expect(listenDistractors(REAL, site).map((w) => w.w)).not.toContain("cite");
    for (const w of ["right", "write", "piece", "peace", "weather", "principal", "whole"]) {
      const word = REAL.map.get(w);
      if (!word) continue;
      for (const d of listenDistractors(REAL, word)) expect(samePron(word, d)).toBe(false);
    }
  });
  it("options are stable for a seed and shuffled across seeds", () => {
    const word = REAL.map.get("adapt")!;
    expect(listenOptions(REAL, word, 3).map((o) => o.w)).toEqual(listenOptions(REAL, word, 3).map((o) => o.w));
    const orders = new Set(Array.from({ length: 12 }, (_, k) => listenOptions(REAL, word, k).map((o) => o.w).join(",")));
    expect(orders.size).toBeGreaterThan(1);
  });
  it("practice may use listen but never recall", () => {
    const g = practiceGroup(REAL, state(), ["adapt", "adopt", "quite", "affect", "effect", "principal"], T);
    expect(g.every((x) => x.mode !== "recall")).toBe(true);
  });
});

describe("v3 · 锁屏保活", () => {
  it("silent WAV has a valid PCM header and silent samples", () => {
    const b = silentWav(1);
    const txt = (o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));
    expect(txt(0, 4)).toBe("RIFF");
    expect(txt(8, 4)).toBe("WAVE");
    expect(txt(36, 4)).toBe("data");
    const dv = new DataView(b.buffer);
    expect(dv.getUint32(24, true)).toBe(8000);
    expect(dv.getUint32(40, true)).toBe(8000);
    expect(b.length).toBe(44 + 8000);
    expect(b[44]).toBe(128);
    expect(b[b.length - 1]).toBe(128);
  });
});
