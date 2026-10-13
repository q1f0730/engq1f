/**
 * v5 · 词库与词单管理（纯逻辑，无副作用）
 *
 *  - 自定义词单：命名、增删词、去重、备份校验
 *  - 词单学习：到期复习 → 未学新词 → 提前巩固，依次给出下一组
 *  - 词库排序 / 词性筛选 / 字母索引
 *  - 导出 CSV、Anki TSV
 */
import type { Word, WordIndex } from "./data";
import { posLabel } from "./data";
import type { AppState } from "./store";
import { NEVER, hashStr, shuffle, type Card, type SessionItem } from "./srs";
import { GROUP_SIZE, REVIEW_GROUP, reviewItems } from "./plan";

// ---------------------------------------------------------------- 自定义词单

export interface WordList {
  id: string;
  name: string;
  words: string[];
  /** 创建日期 YYYY-MM-DD */
  at: string;
}

export const LIST_NAME_MAX = 20;
export const LIST_MAX = 50;
export const LIST_WORDS_MAX = 3000;

/** 词单名：去首尾空白、压缩空格、截到 20 字；空名 → 「词单 N」（N 不和现有重复） */
export function cleanListName(name: string, existing: string[] = []): string {
  const n = name.replace(/\s+/g, " ").trim().slice(0, LIST_NAME_MAX).trim();
  if (n) return n;
  let k = 1;
  while (existing.includes(`词单 ${k}`)) k++;
  return `词单 ${k}`;
}

/** 加词：保持原有顺序，新词追加在后，去重，最多 3000 个 */
export function addWords(list: WordList, words: string[]): WordList {
  const have = new Set(list.words);
  const next = list.words.slice();
  for (const w of words) {
    if (!w || have.has(w)) continue;
    have.add(w);
    next.push(w);
  }
  return { ...list, words: next.slice(0, LIST_WORDS_MAX) };
}

export function removeWords(list: WordList, words: string[]): WordList {
  const rm = new Set(words);
  return { ...list, words: list.words.filter((w) => !rm.has(w)) };
}

/** 读备份 / 旧数据：丢掉格式不对的词单，词去重 */
export function normalizeLists(raw: unknown): WordList[] {
  if (!Array.isArray(raw)) return [];
  const out: WordList[] = [];
  const ids = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const l = r as Partial<WordList>;
    if (typeof l.id !== "string" || !l.id || ids.has(l.id) || !Array.isArray(l.words)) continue;
    ids.add(l.id);
    const words = [...new Set(l.words.filter((w): w is string => typeof w === "string" && !!w))].slice(0, LIST_WORDS_MAX);
    out.push({
      id: l.id,
      name: cleanListName(typeof l.name === "string" ? l.name : "", out.map((x) => x.name)),
      words,
      at: typeof l.at === "string" ? l.at : "",
    });
    if (out.length >= LIST_MAX) break;
  }
  return out;
}

/** 某个词在哪些词单里 */
export function listsOf(lists: WordList[], w: string): WordList[] {
  return lists.filter((l) => l.words.includes(w));
}

export interface ListProgress {
  total: number;
  unlearned: number;
  learning: number;
  mastered: number;
  due: number;
}

export function listProgress(index: WordIndex, st: Pick<AppState, "cards">, list: WordList, day: string): ListProgress {
  const p: ListProgress = { total: 0, unlearned: 0, learning: 0, mastered: 0, due: 0 };
  for (const w of list.words) {
    if (!index.map.has(w)) continue;
    p.total++;
    const c = st.cards[w];
    if (!c) p.unlearned++;
    else if (c.st === "mastered") p.mastered++;
    else p.learning++;
    if (c && !c.k && c.d <= day) p.due++;
  }
  return p;
}

// ---------------------------------------------------------------- 词单学习

export type ListStep = "due" | "new" | "review" | "done";

export interface ListGroup {
  step: ListStep;
  items: SessionItem[];
}

/**
 * 词单的下一组：
 *  1. 词单里到期的词（最早到期优先，最多 20）
 *  2. 没有到期 → 词单里还没学的词（按词单顺序，10 个，跳过「明天再说」搁置中的）
 *  3. 都学过了 → 随机 20 个没斩的词提前巩固（按提前复习排期，间隔不会变短）
 *  4. 全斩了 → done
 */
export function listGroup(index: WordIndex, st: AppState, words: string[], day: string): ListGroup {
  const valid = words.filter((w) => index.map.has(w));
  const due = valid.filter((w) => st.cards[w] && !st.cards[w].k && st.cards[w].d <= day).sort((a, b) => (st.cards[a].d < st.cards[b].d ? -1 : st.cards[a].d > st.cards[b].d ? 1 : 0));
  if (due.length) return { step: "due", items: reviewItems(index, st, due.slice(0, REVIEW_GROUP), day) };
  const bury = st.bury ?? {};
  const fresh = valid.filter((w) => !st.cards[w] && !(bury[w] && bury[w] > day));
  if (fresh.length) return { step: "new", items: fresh.slice(0, GROUP_SIZE).map((w) => ({ w, kind: "new" as const, mode: "recall" as const })) };
  const rest = shuffle(
    valid.filter((w) => st.cards[w] && !st.cards[w].k),
    hashStr(day + "list" + valid.length),
  ).slice(0, REVIEW_GROUP);
  if (rest.length) return { step: "review", items: reviewItems(index, st, rest, day).map((it) => ({ ...it, early: true })) };
  return { step: "done", items: [] };
}

export function listStepLabel(g: ListGroup): string {
  const n = g.items.length;
  if (g.step === "due") return `复习到期 ${n} 词`;
  if (g.step === "new") return `学 ${n} 个新词`;
  if (g.step === "review") return `提前巩固 ${n} 词`;
  return "全部斩完了";
}

// ---------------------------------------------------------------- 排序 / 筛选 / 索引

export type SortKey = "default" | "alpha" | "lapses" | "due" | "ease";
export const SORT_KEYS: SortKey[] = ["default", "alpha", "lapses", "due", "ease"];
export const SORT_LABEL: Record<SortKey, string> = {
  default: "默认顺序",
  alpha: "按字母",
  lapses: "遗忘次数",
  due: "下次复习",
  ease: "难度系数",
};

export type PosKey = "any" | "n" | "v" | "adj" | "adv";
export const POS_KEYS: PosKey[] = ["any", "n", "v", "adj", "adv"];
export const POS_LABEL: Record<PosKey, string> = { any: "全部词性", n: "n. 名词", v: "v. 动词", adj: "adj. 形容词", adv: "adv. 副词" };

/** 一个词所有释义行的词性（vt/vi → v，n&v 拆开） */
export function posSet(word: Word): Set<string> {
  const out = new Set<string>();
  for (const [pos] of word.t) {
    for (const raw of pos.toLowerCase().split(/[&/,\s]+/)) {
      const p = raw.replace(/\.$/, "");
      if (!p) continue;
      out.add(p === "vt" || p === "vi" ? "v" : p);
    }
  }
  return out;
}

export function hasPos(word: Word, pos: PosKey): boolean {
  return pos === "any" || posSet(word).has(pos);
}

const alphaCmp = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" }) || (a < b ? -1 : a > b ? 1 : 0);

/**
 * 排序（稳定）。没学过的词总在最后；同值按字母。
 *  - 遗忘次数：多 → 少
 *  - 下次复习：早 → 晚，已斩的排在学过的最后
 *  - 难度系数：ease 低（难）→ 高
 */
export function sortWords(words: Word[], cards: Record<string, Card>, key: SortKey): Word[] {
  if (key === "default") return words;
  if (key === "alpha") return words.slice().sort((a, b) => alphaCmp(a.w, b.w));
  const val = (c: Card): number | string => (key === "lapses" ? -c.l : key === "ease" ? c.e : c.k ? NEVER : c.d);
  return words.slice().sort((a, b) => {
    const ca = cards[a.w];
    const cb = cards[b.w];
    if (!ca || !cb) return ca ? -1 : cb ? 1 : alphaCmp(a.w, b.w);
    const va = val(ca);
    const vb = val(cb);
    if (va < vb) return -1;
    if (va > vb) return 1;
    return alphaCmp(a.w, b.w);
  });
}

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export const letterOf = (w: string) => {
  const c = w.charAt(0).toUpperCase();
  return c >= "A" && c <= "Z" ? c : "#";
};

/** 按字母排好的列表：每个字母第一次出现的位置 */
export function letterIndex(words: Word[]): Map<string, number> {
  const m = new Map<string, number>();
  words.forEach((w, k) => {
    const L = letterOf(w.w);
    if (!m.has(L)) m.set(L, k);
  });
  return m;
}

/** 跳到某个字母：没有这个字母的词时，跳到后面最近的字母；都没有 → 最后一个 */
export function jumpTarget(idx: Map<string, number>, letter: string, total: number): number {
  const start = LETTERS.indexOf(letter);
  for (let k = Math.max(0, start); k < LETTERS.length; k++) {
    const hit = idx.get(LETTERS[k]);
    if (hit !== undefined) return hit;
  }
  return Math.max(0, total - 1);
}

// ---------------------------------------------------------------- 导出

const phoneticOf = (w: Word, accent: "us" | "uk") => (w.p ? (accent === "uk" ? w.p[1] : w.p[0]) : "");

/** 一行释义：「n. 苹果；v. 跑」 */
export function meaningLine(w: Word): string {
  return w.t.map(([pos, m]) => `${pos ? posLabel(pos) + " " : ""}${m}`).join("；");
}

function csvCell(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV：表头「单词,音标,释义」，带 BOM 让 Excel 认出 UTF-8，CRLF 换行 */
export function toCSV(words: Word[], accent: "us" | "uk" = "us"): string {
  const rows = [["单词", "音标", "释义"], ...words.map((w) => [w.w, phoneticOf(w, accent) ? `/${phoneticOf(w, accent)}/` : "", meaningLine(w)])];
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const tsvCell = (s: string) => s.replace(/[\t\r\n]+/g, " ").trim();
const html = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Anki 文本导入（TSV）：正面 = 单词，背面 = 音标 + 释义（HTML 换行），第三列标签。
 * 文件头用 Anki 2.1.54+ 认识的 #separator / #html / #tags column 指令。
 */
export function toAnki(words: Word[], accent: "us" | "uk" = "us", tag = "CET4"): string {
  const t = tag.replace(/\s+/g, "_");
  const head = ["#separator:tab", "#html:true", "#tags column:3"];
  const rows = words.map((w) => {
    const p = phoneticOf(w, accent);
    const back = [p ? `/${html(p)}/` : "", ...w.t.map(([pos, m]) => html(`${pos ? posLabel(pos) + " " : ""}${m}`))].filter(Boolean).join("<br>");
    return [tsvCell(w.w), tsvCell(back), t].join("\t");
  });
  return [...head, ...rows].join("\n") + "\n";
}

/** 导出文件名里不能有的字符 */
export function fileSafe(s: string): string {
  return s.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "词单";
}
