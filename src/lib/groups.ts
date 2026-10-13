/**
 * v9 · 词与词的关系（纯函数，按需计算并缓存）
 *  - 同义词组：同词性、某个义项完全相同的四级词聚在一起（「v. 放弃」：abandon / quit / yield …）
 *  - 同根形词：和本词共享 ≥5 个字母前缀的词族（nation → national / nationality）
 */
import { isInflection } from "./confusables";
import type { Word, WordIndex } from "./data";
import { posFamilies } from "./exam";

/** 义项最短 2 个字（单字义太宽泛），最长 8 个字 */
export const SENSE_MIN = 2;
export const SENSE_MAX = 8;
/** 一组最多展示的词数（再多就不像「同义」了） */
export const GROUP_MAX = 12;
export const POS_ORDER = ["v", "n", "adj", "adv", "x"] as const;
export const POS_CN: Record<string, string> = { v: "v.", n: "n.", adj: "adj.", adv: "adv.", x: "" };

/** 一条释义拆成干净的义项（去括号说明、领域标记、省略号） */
export function lineSenses(m: string): string[] {
  const out: string[] = [];
  for (const raw of m.split(/[；;，,、]/)) {
    const s = raw
      .replace(/[（(][^）)]*[）)]/g, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\s+/g, "")
      .replace(/^[…．.]+|[…．.]+$/g, "")
      .trim();
    if (s.length >= SENSE_MIN && s.length <= SENSE_MAX && !/[A-Za-z0-9]/.test(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

/** 词的「词性 + 义项」键：v|放弃 */
export function senseKeys(word: Word): string[] {
  const out: string[] = [];
  for (const [pos, m] of word.t) {
    const fams = [...posFamilies({ w: word.w, t: [[pos, m]] })];
    const p = POS_ORDER.find((x) => fams.includes(x)) ?? "x";
    for (const s of lineSenses(m)) {
      const k = `${p}|${s}`;
      if (!out.includes(k)) out.push(k);
    }
  }
  return out;
}

export interface SynGroup {
  /** v|放弃 */
  key: string;
  pos: string;
  sense: string;
  words: string[];
}

let synCache: { index: WordIndex; groups: SynGroup[]; byWord: Map<string, SynGroup[]> } | null = null;

/** 去掉只差词尾变化的同族词（act / acts），保留先出现的 */
function dedupeInflections(words: string[]): string[] {
  const out: string[] = [];
  for (const w of words) if (!out.some((o) => isInflection(o.toLowerCase(), w.toLowerCase()))) out.push(w);
  return out;
}

/** 全部同义词组：至少 2 个词，按词数从多到少、再按义项排序 */
export function synonymGroups(index: WordIndex): SynGroup[] {
  return buildSyn(index).groups;
}

function buildSyn(index: WordIndex) {
  if (synCache && synCache.index === index) return synCache;
  const map = new Map<string, string[]>();
  for (const w of index.list) {
    if (/[\s.]/.test(w.w)) continue;
    for (const k of senseKeys(w)) {
      const arr = map.get(k);
      if (arr) arr.push(w.w);
      else map.set(k, [w.w]);
    }
  }
  const groups: SynGroup[] = [];
  for (const [key, ws] of map) {
    const words = dedupeInflections(ws).slice(0, GROUP_MAX);
    if (words.length < 2) continue;
    const [pos, sense] = key.split("|");
    groups.push({ key, pos, sense, words });
  }
  groups.sort((a, b) => b.words.length - a.words.length || a.sense.localeCompare(b.sense, "zh"));
  const byWord = new Map<string, SynGroup[]>();
  for (const g of groups) for (const w of g.words) (byWord.get(w) ?? byWord.set(w, []).get(w)!).push(g);
  synCache = { index, groups, byWord };
  return synCache;
}

/** 这个词所在的同义词组（义项顺序跟随释义） */
export function synonymsOf(index: WordIndex, word: Word, max = 4): SynGroup[] {
  const mine = buildSyn(index).byWord.get(word.w) ?? [];
  const order = senseKeys(word);
  return mine
    .slice()
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    .slice(0, max);
}

/** 搜索同义词组：中文搜义项，英文搜组里的词 */
export function searchGroups(groups: SynGroup[], q: string): SynGroup[] {
  const t = q.trim().toLowerCase();
  if (!t) return groups;
  if (/[\u4e00-\u9fa5]/.test(t)) return groups.filter((g) => g.sense.includes(t)).sort((a, b) => (a.sense === t ? -1 : b.sense === t ? 1 : a.sense.length - b.sense.length));
  return groups.filter((g) => g.words.some((w) => w.toLowerCase().startsWith(t)));
}

// ---------------------------------------------------------------- 同根形词

export const FAMILY_PREFIX = 5;
export const FAMILY_MAX = 12;

let famCache: { index: WordIndex; byPrefix: Map<string, string[]> } | null = null;

export function commonPrefix(a: string, b: string): number {
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  return k;
}

/** 去掉一个常见后缀，得到大致的词干（compete → compet，competitiveness → competit） */
const SUFFIXES = ["ization", "isation", "iveness", "fulness", "ousness", "ation", "ition", "ness", "ment", "ance", "ence", "able", "ible", "tion", "sion", "ious", "eous", "ally", "ity", "ive", "ous", "ful", "ion", "ing", "ant", "ent", "ism", "ist", "ize", "ise", "ate", "al", "er", "or", "ed", "ly", "ic", "es", "y", "e", "s"];
export function stemLen(w: string): number {
  for (const s of SUFFIXES) if (w.endsWith(s) && w.length - s.length >= 4) return w.length - s.length;
  return w.length;
}

/**
 * 拼写相近（多为同根派生）：共享 ≥5 个字母、并且共同前缀至少覆盖较短词的词干
 * （compete 的一族是 competitive / competition / competitor，compel、compensate 只是前缀相同，不算）。
 * 共同前缀长的在前，其次短词在前
 */
export function familyOf(index: WordIndex, word: Word, max = FAMILY_MAX): { w: string; prefix: number }[] {
  const lw = word.w.toLowerCase();
  if (lw.length < FAMILY_PREFIX || !/^[a-z]+$/.test(lw)) return [];
  if (!famCache || famCache.index !== index) {
    const byPrefix = new Map<string, string[]>();
    for (const w of index.list) {
      const l = w.w.toLowerCase();
      if (l.length < FAMILY_PREFIX || !/^[a-z]+$/.test(l)) continue;
      const p = l.slice(0, FAMILY_PREFIX);
      (byPrefix.get(p) ?? byPrefix.set(p, []).get(p)!).push(w.w);
    }
    famCache = { index, byPrefix };
  }
  return (famCache.byPrefix.get(lw.slice(0, FAMILY_PREFIX)) ?? [])
    .filter((w) => w.toLowerCase() !== lw)
    .map((w) => ({ w, prefix: commonPrefix(lw, w.toLowerCase()) }))
    .filter((x) => x.prefix >= Math.max(FAMILY_PREFIX, Math.min(stemLen(lw), stemLen(x.w.toLowerCase()))))
    .sort((a, b) => b.prefix - a.prefix || a.w.length - b.w.length || a.w.localeCompare(b.w))
    .slice(0, max);
}
