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

export function newWordsLeft(index: WordIndex, st: AppState): string[] {
  return orderedWords(index, st.settings, st.seed).filter((w) => !st.cards[w]);
}

export interface TodaySummary {
  day: string;
  learned: number;
  reviewed: number;
  goal: number;
  due: number;
  dueList: string[];
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
  const left = newWordsLeft(index, st).length;
  const bookTotal = bookSize(index, st.settings.book);
  const goal = st.settings.daily;
  const remainingGoal = Math.max(0, goal - log.n);
  return {
    day,
    learned: log.n,
    reviewed: log.r,
    goal,
    due: dueList.length,
    dueList,
    newLeft: left,
    bookTotal,
    started: bookTotal - left,
    checked: st.checkins.includes(day),
    ready: canCheckIn({ learnedToday: log.n, goal, newLeft: left, due: dueList.length }),
    finish: remainingGoal > 0 ? finishDate(day, left, goal) : finishDate(addDays(day, 1), left, goal),
    remainingGoal,
  };
}

/** 下一组新词：优先补齐今日目标，达标后可以再学一组 10 个 */
export function nextNewGroup(index: WordIndex, st: AppState, day: string): SessionItem[] {
  const sum = summarize(index, st, day);
  const n = sum.remainingGoal > 0 ? Math.min(GROUP_SIZE, sum.remainingGoal) : GROUP_SIZE;
  return newWordsLeft(index, st)
    .slice(0, n)
    .map((w) => ({ w, kind: "new" as const, mode: "recall" as const }));
}

export function reviewGroup(st: AppState, day: string): SessionItem[] {
  return dueWords(st.cards, day)
    .slice(0, REVIEW_GROUP)
    .map((w) => ({ w, kind: "review" as const, mode: pickMode(w, day, st.settings.cnFirst) }));
}

export type Notebook = "star" | "wrong" | "mastered";

export function notebookWords(st: AppState, nb: Notebook): string[] {
  if (nb === "star") return Object.keys(st.star);
  if (nb === "wrong") return Object.keys(st.cards).filter((w) => st.cards[w].l >= 1 && !st.cards[w].k);
  return Object.keys(st.cards).filter((w) => st.cards[w].k);
}

export function notebookGroup(st: AppState, nb: Notebook, day: string): SessionItem[] {
  const words = shuffle(notebookWords(st, nb), hashStr(day + nb)).slice(0, REVIEW_GROUP);
  return words.map((w) => ({
    w,
    kind: "review" as const,
    mode: nb === "mastered" ? ("recall" as const) : pickMode(w, day, st.settings.cnFirst),
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
