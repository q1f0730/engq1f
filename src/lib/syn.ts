/**
 * 13.0 · 同义词（卡片背面 + 单词详情）
 *  来源 1：data/syn.json —— WordNet 3.0 + Moby Thesaurus，构建时只留词库里有、中文释义也对得上的词（scripts/build-extra.py）
 *  来源 2：v9 的「同词性、同一个中文义项」词组（groups.ts），WordNet 没给的时候补上
 *  顺序：当前词库里的词在前，隐藏的基础词在后；最多 5 个。点一下跳到那个词。
 */
import { useEffect, useState } from "react";
import type { Word, WordIndex } from "./data";
import { synonymsOf } from "./groups";

export type SynData = Record<string, string[]>;

let data: SynData | null = null;
let loading: Promise<SynData> | null = null;

export function loadSyn(): Promise<SynData> {
  if (data) return Promise.resolve(data);
  if (!loading) {
    loading = fetch(new URL("data/syn.json", document.baseURI).href)
      .then((r) => (r.ok ? (r.json() as Promise<SynData>) : {}))
      .then((d) => (data = d))
      .catch(() => {
        loading = null;
        return {} as SynData;
      });
  }
  return loading;
}

export const SYN_MAX = 5;

/** 纯函数：给定 syn.json 和索引，算出这个词的同义词（测试直接调用） */
export function synonymsFor(index: WordIndex, word: Word, d: SynData | null, max = SYN_MAX): Word[] {
  const out: Word[] = [];
  const seen = new Set([word.w.toLowerCase()]);
  const add = (w: string) => {
    const x = index.map.get(w);
    if (!x || seen.has(x.w.toLowerCase())) return;
    seen.add(x.w.toLowerCase());
    out.push(x);
  };
  for (const w of d?.[word.w] ?? []) add(w);
  for (const g of synonymsOf(index, word)) for (const w of g.words) add(w);
  // 词库里的在前（稳定排序：各自保持原来的先后）。
  // 性能优化：WordIndex 保证在 index.map 中，词位于 index.list 当且仅当 !w.b || index.basic。
  // 使用 O(1) 属性检查替代每次 synonymsFor 调用都重新构建 4,000+ 元素的 Set。
  const isInactive = (w: Word) => Boolean(w.b && !index.basic);
  return out
    .map((w, i) => [w, i] as const)
    .sort((a, b) => Number(isInactive(a[0])) - Number(isInactive(b[0])) || a[1] - b[1])
    .map(([w]) => w)
    .slice(0, max);
}

export function useSynonyms(index: WordIndex | null, word: Word | null, enabled = true): Word[] {
  const [d, setD] = useState<SynData | null>(data);
  useEffect(() => {
    if (!enabled || data) return;
    let alive = true;
    loadSyn().then((x) => alive && setD(x));
    return () => {
      alive = false;
    };
  }, [enabled]);
  if (!index || !word || !enabled) return [];
  return synonymsFor(index, word, d ?? data);
}
