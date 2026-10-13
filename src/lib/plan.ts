import type { WordIndex, Word } from "./data";
import { posOf } from "./data";
import type { AppState, Settings } from "./store";
import {
  addDays,
  canCheckIn,
  dueWords,
  emptyLog,
  finishDate,
  hashStr,
  isLeech,
  pickMode,
  rng,
  shuffle,
  type SessionItem,
} from "./srs";

export const GROUP_SIZE = 10;
export const REVIEW_GROUP = 20;

const orderCache = new Map<string, string[]>();

/** 按词书与顺序排好的学习序列 */
export function orderedWords(index: WordIndex, s: Pick<Settings, "book" | "order">, seed: number): string[] {
  const key = `${s.book}|${s.order}|${seed}|${index.list.length}`;
  const hit = orderCache.get(key);
  if (hit) return hit;
  let list = index.list.filter((w) => s.book === "all" || w.c);
  if (s.order === "alpha") list = list.slice().sort((a, b) => a.w.localeCompare(b.w, "en", { sensitivity: "base" }));
  else if (s.order === "random") list = shuffle(list, seed);
  else {
    // 核心优先：核心词（原顺序）在前，其余在后
    list = [...list.filter((w) => w.c), ...list.filter((w) => !w.c)];
  }
  const out = list.map((w) => w.w);
  orderCache.set(key, out);
  return out;
}

export function bookSize(index: WordIndex, book: Settings["book"]) {
  return book === "all" ? index.list.length : index.coreCount;
}

/** 还没学过的词；给了 day 时排除「明天再说」搁置中的词 */
export function newWordsLeft(index: WordIndex, st: AppState, day?: string): string[] {
  const bury = st.bury ?? {};
  return orderedWords(index, st.settings, st.seed).filter((w) => !st.cards[w] && !(day && bury[w] && bury[w] > day));
}

export interface TodaySummary {
  day: string;
  learned: number;
  reviewed: number;
  goal: number;
  /** 今天要复习的数量（已按上限截断） */
  due: number;
  /** 全部到期 */
  dueList: string[];
  /** 因复习上限顺延到以后的数量 */
  deferred: number;
  /** 明天到期（可提前复习）的数量 */
  aheadCount: number;
  newLeft: number;
  bookTotal: number;
  started: number;
  checked: boolean;
  ready: boolean;
  finish: string;
  remainingGoal: number;
}

export function summarize(index: WordIndex, st: AppState, day: string): TodaySummary {
  const log = st.log[day] ?? emptyLog();
  const dueList = dueWords(st.cards, day);
  const due = cappedDue(st, day, dueList.length);
  const left = newWordsLeft(index, st, day).length;
  const bookTotal = bookSize(index, st.settings.book);
  const goal = st.settings.daily;
  const remainingGoal = Math.max(0, goal - log.n);
  return {
    day,
    learned: log.n,
    reviewed: log.r,
    goal,
    due,
    dueList,
    deferred: dueList.length - due,
    aheadCount: dueList.length === 0 ? aheadWords(st, day).length : 0,
    newLeft: left,
    bookTotal,
    started: bookTotal - left,
    checked: st.checkins.includes(day),
    ready: canCheckIn({ learnedToday: log.n, goal, newLeft: left, due }),
    finish: remainingGoal > 0 ? finishDate(day, left, goal) : finishDate(addDays(day, 1), left, goal),
    remainingGoal,
  };
}

/** 下一组新词：优先补齐今日目标，达标后可以再学一组 10 个 */
export function nextNewGroup(index: WordIndex, st: AppState, day: string): SessionItem[] {
  const sum = summarize(index, st, day);
  const n = sum.remainingGoal > 0 ? Math.min(GROUP_SIZE, sum.remainingGoal) : GROUP_SIZE;
  return newWordsLeft(index, st, day)
    .slice(0, n)
    .map((w) => ({ w, kind: "new" as const, mode: "recall" as const }));
}

/** 复习上限：今天还能复习多少（0 = 不限） */
export function cappedDue(st: AppState, day: string, dueAll: number): number {
  const cap = st.settings.reviewCap ?? 0;
  if (!cap) return dueAll;
  const done = st.log[day]?.r ?? 0;
  return Math.min(dueAll, Math.max(0, cap - done));
}

/** 只有「适合出题的短语」才出短语选义题 */
const hasPhrase = (index: WordIndex, w: string) => hasGoodPhrase(index.map.get(w));

function modeFor(index: WordIndex, st: AppState, w: string, day: string): SessionItem["mode"] {
  return pickMode(w, day, st.settings.cnFirst, hasPhrase(index, w));
}

export function reviewGroup(index: WordIndex, st: AppState, day: string): SessionItem[] {
  const list = dueWords(st.cards, day);
  return list
    .slice(0, Math.min(REVIEW_GROUP, cappedDue(st, day, list.length)))
    .map((w) => ({ w, kind: "review" as const, mode: modeFor(index, st, w, day) }));
}

/** 明天到期的词（提前复习用），间隔短的优先 */
export function aheadWords(st: AppState, day: string): string[] {
  const tomorrow = addDays(day, 1);
  return Object.keys(st.cards)
    .filter((w) => !st.cards[w].k && st.cards[w].d === tomorrow)
    .sort((a, b) => st.cards[a].i - st.cards[b].i || (a < b ? -1 : 1));
}

export function aheadGroup(index: WordIndex, st: AppState, day: string): SessionItem[] {
  return aheadWords(st, day)
    .slice(0, REVIEW_GROUP)
    .map((w) => ({ w, kind: "review" as const, mode: modeFor(index, st, w, day), early: true }));
}

/** 错词再练：只练不排期，题型换一套（和刚才的回想卡区分开） */
export function practiceGroup(index: WordIndex, st: AppState, words: string[], day: string): SessionItem[] {
  return words
    .filter((w) => index.map.has(w))
    .map((w) => {
      let mode = pickMode(w, day + "practice", false, hasPhrase(index, w));
      if (mode === "recall") mode = "en2cn";
      return { w, kind: "review" as const, mode };
    });
}

export type Notebook = "star" | "wrong" | "mastered" | "hard";

export function notebookWords(st: AppState, nb: Notebook): string[] {
  if (nb === "star") return Object.keys(st.star);
  if (nb === "wrong") return Object.keys(st.cards).filter((w) => st.cards[w].l >= 1 && !st.cards[w].k);
  if (nb === "hard") return Object.keys(st.cards).filter((w) => isLeech(st.cards[w]));
  return Object.keys(st.cards).filter((w) => st.cards[w].k);
}

export function notebookGroup(index: WordIndex, st: AppState, nb: Notebook, day: string): SessionItem[] {
  const words = shuffle(notebookWords(st, nb), hashStr(day + nb)).slice(0, REVIEW_GROUP);
  return words.map((w) => ({
    w,
    kind: "review" as const,
    mode: nb === "mastered" ? ("recall" as const) : modeFor(index, st, w, day),
  }));
}

/** 干扰项：同词性、释义不同 */
export function distractors(index: WordIndex, word: Word, n = 3, seed = 1): Word[] {
  const pool = index.byPos.get(posOf(word)) ?? index.list;
  const r = rng(hashStr(word.w) ^ seed);
  const out: Word[] = [];
  const seen = new Set([word.w, word.t[0][1]]);
  let guard = 0;
  while (out.length < n && guard++ < 200) {
    const src = guard > 100 ? index.list : pool;
    const c = src[Math.floor(r() * src.length)];
    if (!c || seen.has(c.w) || seen.has(c.t[0][1])) continue;
    seen.add(c.w);
    seen.add(c.t[0][1]);
    out.push(c);
  }
  return out;
}

/** 四选一选项（含正确答案），返回打乱后的顺序 */
export function quizOptions(index: WordIndex, word: Word, seed: number): Word[] {
  return shuffle([word, ...distractors(index, word, 3, seed)], hashStr(word.w) ^ seed);
}

/** 每日一词：按日期从核心词里稳定挑一个 */
export function wordOfDay(index: WordIndex, day: string): Word {
  const pool = index.list.filter((w) => w.c && w.ph?.length);
  const list = pool.length ? pool : index.list;
  return list[hashStr("wod" + day) % list.length];
}

/** 短语中文清洗：去掉开头的词性标记，最多留两个义项 */
export function cleanPhraseCn(t: string): string {
  return t
    .replace(/^\s*(?:[a-z]+\.\s*)+/i, "")
    .split(/[；;]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("；");
}

/** 适合出题的短语：含本词、中文干净（无英文、不太长） */
function goodPhrase(word: Word, p: [string, string]) {
  const cn = cleanPhraseCn(p[1]);
  return !!cn && cn.length <= 18 && !/[A-Za-z]/.test(cn) && p[0].toLowerCase().includes(word.w.toLowerCase());
}

/** 短语选义：按种子稳定挑一个短语（优先适合出题的），中文已清洗 */
export function phraseFor(word: Word, seed: number): [string, string] | undefined {
  const all = word.ph;
  if (!all?.length) return undefined;
  const good = all.filter((p) => goodPhrase(word, p));
  const ph = good.length ? good : all;
  const p = ph[((hashStr(word.w) ^ seed) >>> 0) % ph.length];
  return [p[0], cleanPhraseCn(p[1]) || p[1]];
}

export function hasGoodPhrase(word: Word | undefined): boolean {
  return !!word?.ph?.some((p) => goodPhrase(word, p));
}

/** 短语选义的四个选项：干扰项来自有短语的同词性词，中文不重复 */
export function phraseOptions(index: WordIndex, word: Word, seed: number): Word[] {
  const correct = phraseFor(word, seed);
  if (!correct) return quizOptions(index, word, seed);
  const pool = (index.byPos.get(posOf(word)) ?? index.list).filter(hasGoodPhrase);
  const src = pool.length > 20 ? pool : index.list.filter(hasGoodPhrase);
  const r = rng(hashStr(word.w + "ph") ^ seed);
  const seen = new Set([word.w, correct[1]]);
  const out: Word[] = [];
  let guard = 0;
  while (out.length < 3 && guard++ < 300) {
    const c = src[Math.floor(r() * src.length)];
    const p = c && phraseFor(c, seed);
    if (!c || !p || seen.has(c.w) || seen.has(p[1])) continue;
    seen.add(c.w);
    seen.add(p[1]);
    out.push(c);
  }
  return shuffle([word, ...out], hashStr(word.w) ^ seed);
}
