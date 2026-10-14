import { useEffect, useState } from "react";

/**
 * 压缩词条：w 单词 / p [美音, 英音] / t [[词性, 释义]] / ph [[短语, 中文]] / c 核心词 / o Oxford 3000（词汇量测试分层）
 * 13.0：b 基础词（默认隐藏，规则见 data-licenses/README.md）/ z 词频 Zipf × 10（wordfreq）
 */
export interface Word {
  w: string;
  p?: [string, string];
  t: [string, string][];
  ph?: [string, string][];
  c?: 1;
  o?: 1;
  b?: 1;
  z?: number;
}

export interface WordIndex {
  /** 当前词库：默认不含基础词（「我的 → 包含基础词」打开后才有） */
  list: Word[];
  /** 全部词条（含隐藏的基础词）：学过的基础词照样能查、能复习 */
  map: Map<string, Word>;
  byPos: Map<string, Word[]>;
  coreCount: number;
  /** 隐藏 / 包含的基础词个数 */
  basicCount?: number;
  /** 这份索引含不含基础词 */
  basic?: boolean;
}

let promise: Promise<WordIndex> | null = null;
let cached: WordIndex | null = null;
let raw: Word[] | null = null;
let basicOn = false;
const listeners = new Set<() => void>();

/** 13.0 · 基础词开关（store 在读档和改设置时调用）；切换后重建索引并通知 useWords */
export function setBasicMode(on: boolean) {
  if (on === basicOn) return;
  basicOn = on;
  if (raw) cached = build(raw, on);
  for (const f of listeners) f();
}

export const basicMode = () => basicOn;

/** 基础词判断（不管开关） */
export const isBasic = (w: Word | undefined) => !!w?.b;

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

export function build(all: Word[], basic = false): WordIndex {
  const map = new Map<string, Word>();
  const byPos = new Map<string, Word[]>();
  let coreCount = 0;
  let basicCount = 0;
  const list: Word[] = [];
  for (const w of all) {
    map.set(w.w, w);
    if (w.b) basicCount++;
    if (w.b && !basic) continue;
    list.push(w);
    const p = posOf(w);
    if (!byPos.has(p)) byPos.set(p, []);
    byPos.get(p)!.push(w);
    if (w.c) coreCount++;
  }
  return { list, map, byPos, coreCount, basicCount, basic };
}

export function loadWords(): Promise<WordIndex> {
  if (cached && raw) return Promise.resolve(cached);
  if (!promise) {
    promise = fetch(new URL("data/cet4.json", document.baseURI).href)
      .then((r) => {
        if (!r.ok) throw new Error(`词库加载失败 ${r.status}`);
        return r.json() as Promise<Word[]>;
      })
      .then((list) => {
        raw = list;
        return (cached = build(list, basicOn));
      })
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
    const on = () => setIndex(cached);
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
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
