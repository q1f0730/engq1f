/**
 * v9 · 小游戏（纯函数）：配对消消乐、判断对错。
 * 只练不排期：不改复习计划、不记复习日志，只保存最高分。
 */
import { optionMeaning, posOf, type Word, type WordIndex } from "./data";
import { distractors, orderedWords } from "./plan";
import { senses } from "./exam";
import { hashStr, rng, shuffle } from "./srs";
import type { AppState } from "./store";

// ---------------------------------------------------------------- 选词

/**
 * 游戏词池：学过的词够 minSize 个就只用学过的（到期的、忘过的优先）；
 * 不够时用词书里接下来要学的词补到 2 × minSize。斩过的词不出。
 */
export function gamePool(index: WordIndex, st: AppState, day: string, minSize = 20): string[] {
  const learned = Object.keys(st.cards).filter((w) => !st.cards[w].k && index.map.has(w) && /^[a-z][a-z-]*$/i.test(w));
  const score = (w: string) => {
    const c = st.cards[w];
    return (c.d <= day ? 0 : 2) + (c.l > 0 ? 0 : 1);
  };
  const ranked = learned.slice().sort((a, b) => score(a) - score(b) || (a < b ? -1 : 1));
  if (ranked.length >= minSize) return ranked;
  const taken = new Set(ranked);
  const more = orderedWords(index, st.settings, st.seed).filter((w) => !taken.has(w) && !st.cards[w]?.k && /^[a-z][a-z-]*$/i.test(w));
  return [...ranked, ...more.slice(0, minSize * 2 - ranked.length)];
}

/** 配对方块上的中文：第一条释义的第一个义项，去掉括号说明，最多 8 个字 */
export function tileMeaning(word: Word): string {
  const first = (word.t[0]?.[1] ?? "").split(/[；;，,]/).map((x) => x.replace(/[（(][^）)]*[）)]/g, "").replace(/\[[^\]]*\]/g, "").trim()).find(Boolean) ?? word.t[0]?.[1] ?? "";
  return first.length > 8 ? first.slice(0, 8) + "…" : first;
}

// ---------------------------------------------------------------- 配对消消乐

export const MATCH_PAIRS = 5;
export const MATCH_MS = 60_000;
export const MATCH_POINT = 10;
export const MATCH_PENALTY = 5;

export interface MatchRound {
  /** 本轮的词（英文列按这个顺序显示） */
  left: string[];
  /** 中文列：[单词, 释义]，打乱顺序 */
  right: [string, string][];
}

/** 一轮 5 对：从词池里按轮次稳定取词，同一轮中文不重复、不和英文同词 */
export function matchRound(index: WordIndex, pool: string[], round: number, seed: number, n = MATCH_PAIRS): MatchRound {
  const order = shuffle(pool, (seed ^ hashStr("match")) >>> 0);
  const start = (round * n) % Math.max(1, order.length);
  const rotated = [...order.slice(start), ...order.slice(0, start)];
  const words: string[] = [];
  const seen = new Set<string>();
  for (const w of rotated) {
    const word = index.map.get(w);
    if (!word) continue;
    const m = tileMeaning(word);
    if (!m || seen.has(m)) continue;
    seen.add(m);
    words.push(w);
    if (words.length >= n) break;
  }
  const right = shuffle(
    words.map((w) => [w, tileMeaning(index.map.get(w)!)] as [string, string]),
    (seed ^ hashStr("r" + round)) >>> 0,
  );
  return { left: shuffle(words, (seed ^ hashStr("l" + round)) >>> 0), right };
}

export interface MatchScore {
  score: number;
  /** 连对次数（答错归零） */
  combo: number;
  pairs: number;
  misses: number;
  best: number;
}

export const emptyMatch = (): MatchScore => ({ score: 0, combo: 0, pairs: 0, misses: 0, best: 0 });

/** 连对加分：第 2 对起每对多 2 分，最多多 8 分 */
export const comboBonus = (combo: number) => Math.min(Math.max(0, combo - 1), 4) * 2;

/** 一次配对：对了 +10（含连对加分），错了 −5（不低于 0）、连对归零 */
export function matchStep(s: MatchScore, ok: boolean): MatchScore {
  if (ok) {
    const combo = s.combo + 1;
    return { ...s, combo, pairs: s.pairs + 1, score: s.score + MATCH_POINT + comboBonus(combo), best: Math.max(s.best, combo) };
  }
  return { ...s, combo: 0, misses: s.misses + 1, score: Math.max(0, s.score - MATCH_PENALTY) };
}

/** 剩余时间（按绝对时间算，切到后台也不会多给） */
export const timeLeft = (startedAt: number, now: number, limit = MATCH_MS) => Math.max(0, limit - (now - startedAt));

// ---------------------------------------------------------------- 判断对错

export const JUDGE_SIZE = 20;

export interface JudgeItem {
  w: string;
  /** 展示的释义 */
  shown: string;
  /** 释义是不是这个词的 */
  truth: boolean;
  /** 释义真正属于哪个词（错配时） */
  from?: string;
}

/** 出题：一半配对正确、一半换成同词性别的词的释义（按种子稳定，正确数恰好一半） */
export function buildJudge(index: WordIndex, pool: string[], seed: number, n = JUDGE_SIZE): JudgeItem[] {
  const words = shuffle(pool.filter((w) => index.map.has(w)), (seed ^ hashStr("judge")) >>> 0).slice(0, n);
  const truths = shuffle(
    words.map((_, k) => k < Math.ceil(words.length / 2)),
    (seed ^ hashStr("jt")) >>> 0,
  );
  return words.map((w, k) => {
    const word = index.map.get(w)!;
    if (truths[k]) return { w, shown: optionMeaning(word), truth: true };
    // 错配的释义不能和本词意思重叠（quit 配「放弃」其实是对的）
    const own = senses(word);
    const d = distractors(index, word, 3, (seed + k) >>> 0).find((c) => !senses(c).some((s) => own.some((o) => o === s || o.includes(s) || s.includes(o))));
    if (!d) return { w, shown: optionMeaning(word), truth: true };
    return { w, shown: optionMeaning(d), truth: false, from: d.w };
  });
}

/** 判断对错得分：答对 1 题 5 分，满分 100（20 题） */
export const judgeScore = (ok: number, n = JUDGE_SIZE) => Math.round((ok / Math.max(1, n)) * 100);

/** 滑动方向 → 判断：默认右滑 = 对；交换滑动方向时左滑 = 对 */
export function swipeJudge(dx: number, swap: boolean, threshold = 80): boolean | null {
  if (Math.abs(dx) < threshold) return null;
  const right = dx > 0;
  return swap ? !right : right;
}

/** 词性归一后的同词性判断（测试用） */
export const samePos = (a: Word, b: Word) => posOf(a) === posOf(b);
