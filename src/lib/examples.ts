import { useEffect, useState } from "react";

/**
 * 英文例句：在线时从 dictionaryapi.dev 懒加载 1-2 条，缓存在 localStorage。
 * 离线、接口没有例句或出错时返回空数组，界面静默隐藏，不阻塞任何操作。
 */
export const EXAMPLES_KEY = "cet4v-examples-v1";
const API = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const MAX_CACHE = 3000;
const MAX = 2;

type Cache = Record<string, string[]>;
let mem: Cache | null = null;
const inflight = new Map<string, Promise<string[]>>();

function load(): Cache {
  if (mem) return mem;
  try {
    mem = JSON.parse(localStorage.getItem(EXAMPLES_KEY) || "{}") as Cache;
    if (!mem || typeof mem !== "object") mem = {};
  } catch {
    mem = {};
  }
  return mem;
}

function save(word: string, list: string[]) {
  const c = load();
  delete c[word]; // 重新插入到末尾，按插入顺序淘汰最旧的
  c[word] = list;
  const keys = Object.keys(c);
  if (keys.length > MAX_CACHE) for (const k of keys.slice(0, keys.length - MAX_CACHE)) delete c[k];
  try {
    localStorage.setItem(EXAMPLES_KEY, JSON.stringify(c));
  } catch {
    /* 存储已满：只留在内存里 */
  }
}

export function cachedExamples(word: string): string[] | undefined {
  return load()[word.toLowerCase()];
}

/** 从接口返回里挑例句：含该词、长度适中、去重，短句优先 */
export function pickExamples(word: string, data: unknown, max = MAX): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const w = word.toLowerCase();
  if (!Array.isArray(data)) return out;
  for (const entry of data as { meanings?: { definitions?: { example?: string }[] }[] }[]) {
    for (const m of entry?.meanings ?? []) {
      for (const d of m?.definitions ?? []) {
        const ex = typeof d?.example === "string" ? d.example.replace(/\s+/g, " ").trim() : "";
        if (!ex || ex.length < 8 || ex.length > 160) continue;
        const k = ex.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(ex);
      }
    }
  }
  // 包含原词（或其变形前缀）的句子更有用；其次短句优先
  const stem = w.length > 4 ? w.slice(0, w.length - 2) : w;
  const score = (s: string) => (s.toLowerCase().includes(stem) ? 0 : 1000) + s.length;
  return out.sort((a, b) => score(a) - score(b)).slice(0, max);
}

export function fetchExamples(word: string): Promise<string[]> {
  const key = word.toLowerCase();
  const hit = cachedExamples(key);
  if (hit) return Promise.resolve(hit);
  if (typeof navigator !== "undefined" && !navigator.onLine) return Promise.resolve([]);
  const running = inflight.get(key);
  if (running) return running;
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), 8000);
  const p = fetch(API + encodeURIComponent(key), { signal: ctrl?.signal })
    .then(async (res) => {
      if (res.status === 404) {
        save(key, []); // 词典里没有：记住，不再请求
        return [];
      }
      if (!res.ok) return [];
      const list = pickExamples(key, await res.json());
      save(key, list);
      return list;
    })
    .catch(() => [] as string[]) // 网络错误不缓存，下次在线再试
    .finally(() => {
      clearTimeout(timer);
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/** enabled=false 时不发请求（例如卡片还没翻到背面） */
export function useExamples(word: string | undefined, enabled = true): string[] {
  const [list, setList] = useState<string[]>(() => (word ? cachedExamples(word) ?? [] : []));
  useEffect(() => {
    if (!word) {
      setList([]);
      return;
    }
    const hit = cachedExamples(word);
    setList(hit ?? []);
    if (hit || !enabled) return;
    let alive = true;
    fetchExamples(word).then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, [word, enabled]);
  return list;
}
