import { useEffect, useState } from "react";

/** 压缩词条：w 单词 / p [美音, 英音] / t [[词性, 释义]] / ph [[短语, 中文]] / c 核心词 / o 基础词 */
export interface Word {
  w: string;
  p?: [string, string];
  t: [string, string][];
  ph?: [string, string][];
  c?: 1;
  o?: 1;
}

export interface WordIndex {
  list: Word[];
  map: Map<string, Word>;
  byPos: Map<string, Word[]>;
  coreCount: number;
}

let promise: Promise<WordIndex> | null = null;
let cached: WordIndex | null = null;

/** 词性归一：vt/vi → v，"n & v" → n */
export function posOf(word: Word): string {
  const raw = (word.t[0]?.[0] ?? "").toLowerCase();
  const m = raw.match(/[a-z]+/);
  let p = m ? m[0] : "x";
  if (p === "vt" || p === "vi") p = "v";
  if (!["n", "v", "adj", "adv"].includes(p)) p = "x";
  return p;
}

export function posLabel(pos: string): string {
  const p = pos.trim();
  if (!p) return "";
  return p.replace(/\s*&\s*/g, "/").replace(/\.$/, "") + ".";
}

/** 简短释义，用于列表和选项 */
export function shortMeaning(word: Word, max = 2): string {
  return word.t
    .slice(0, max)
    .map(([pos, m]) => `${pos ? posLabel(pos) + " " : ""}${m}`)
    .join("；");
}

/** 选项用：只取第一条释义的前几个义项 */
export function optionMeaning(word: Word): string {
  const [pos, m] = word.t[0];
  const parts = m.split(/[；;]/).slice(0, 2).join("；");
  return `${pos ? posLabel(pos) + " " : ""}${parts}`;
}

function build(list: Word[]): WordIndex {
  const map = new Map<string, Word>();
  const byPos = new Map<string, Word[]>();
  let coreCount = 0;
  for (const w of list) {
    map.set(w.w, w);
    const p = posOf(w);
    if (!byPos.has(p)) byPos.set(p, []);
    byPos.get(p)!.push(w);
    if (w.c) coreCount++;
  }
  return { list, map, byPos, coreCount };
}

export function loadWords(): Promise<WordIndex> {
  if (!promise) {
    promise = fetch(new URL("data/cet4.json", document.baseURI).href)
      .then((r) => {
        if (!r.ok) throw new Error(`词库加载失败 ${r.status}`);
        return r.json() as Promise<Word[]>;
      })
      .then((list) => (cached = build(list)))
      .catch((e) => {
        promise = null;
        throw e;
      });
  }
  return promise;
}

export function getWordsSync(): WordIndex | null {
  return cached;
}

export function useWords(): { index: WordIndex | null; error: string | null } {
  const [index, setIndex] = useState<WordIndex | null>(cached);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (cached) return;
    let alive = true;
    loadWords()
      .then((i) => alive && setIndex(i))
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, []);
  return { index, error };
}
