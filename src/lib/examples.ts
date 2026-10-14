import { useEffect, useState } from "react";

// ---------------------------------------------------------------- 13.0 · 随应用分发的例句（带中文翻译）

/** [英文, 中文, 来源, 本词在英文里的起点, 长度]；来源 "t<英文id>-<中文id>" = Tatoeba，"a" = 本应用自编 */
export type ExampleRow = [string, string, string, number, number];

export interface Example {
  en: string;
  zh: string;
  /** tatoeba / authored / online（在线词典，没有翻译） */
  kind: "tatoeba" | "authored" | "online";
  /** Tatoeba 英文句 id（署名链接用） */
  id?: string;
  at: number;
  len: number;
}

const shards = new Map<string, Record<string, ExampleRow[]>>();
const shardLoads = new Map<string, Promise<Record<string, ExampleRow[]>>>();

export const shardOf = (w: string) => {
  const c = w.slice(0, 1).toLowerCase();
  return c >= "a" && c <= "z" ? c : "_";
};

export function rowToExample(r: ExampleRow): Example {
  const m = /^t(\d+)-(\d+)$/.exec(r[2]);
  return { en: r[0], zh: r[1], kind: m ? "tatoeba" : r[2] === "a" ? "authored" : "online", id: m?.[1], at: r[3], len: r[4] };
}

function loadShard(sh: string): Promise<Record<string, ExampleRow[]>> {
  const hit = shards.get(sh);
  if (hit) return Promise.resolve(hit);
  let p = shardLoads.get(sh);
  if (!p) {
    p = fetch(new URL(`data/ex/${sh}.json`, document.baseURI).href)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, ExampleRow[]>>) : {}))
      .then((d) => {
        shards.set(sh, d);
        return d;
      })
      .catch(() => {
        shardLoads.delete(sh);
        return {} as Record<string, ExampleRow[]>;
      });
    shardLoads.set(sh, p);
  }
  return p;
}

/** 已经下载过的分片里有没有（同步，不发请求） */
export function bundledSync(word: string): Example[] | undefined {
  const d = shards.get(shardOf(word));
  return d ? (d[word] ?? []).map(rowToExample) : undefined;
}

export function bundledExamples(word: string): Promise<Example[]> {
  return loadShard(shardOf(word)).then((d) => (d[word] ?? []).map(rowToExample));
}

/** 在线例句（旧数据源，没有中文翻译）转成同一个形状：只在随应用的例句里没有这个词时才用 */
function onlineToExample(word: string, s: string): Example {
  const hit = findForm(s, word);
  return { en: s, zh: "", kind: "online", at: hit ? hit.at : -1, len: hit ? hit.form.length : 0 };
}

/**
 * 卡片背面 / 详情的例句：先用随应用分发的（每句都有中文）；某个词一句都没有，才在线取（英文）。
 * enabled=false 时什么都不取（卡片还没翻面）。
 */
export function useExampleList(word: string | undefined, enabled = true): { list: Example[]; ready: boolean } {
  const [st, setSt] = useState<{ w?: string; list: Example[]; ready: boolean }>(() => {
    const hit = word && enabled ? bundledSync(word) : undefined;
    return { w: word, list: hit ?? [], ready: !!hit };
  });
  useEffect(() => {
    if (!word || !enabled) {
      setSt({ w: word, list: [], ready: false });
      return;
    }
    let alive = true;
    const hit = bundledSync(word);
    if (hit?.length) {
      setSt({ w: word, list: hit, ready: true });
      return;
    }
    (hit ? Promise.resolve(hit) : bundledExamples(word))
      .then((b) => (b.length ? b : fetchExamples(word).then((on) => on.map((s) => onlineToExample(word, s)))))
      .then((list) => alive && setSt({ w: word, list, ready: true }));
    return () => {
      alive = false;
    };
  }, [word, enabled]);
  return st.w === word ? { list: st.list, ready: st.ready } : { list: [], ready: false };
}

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

/** v11 · 存储管理：清空例句缓存，返回清掉了多少个词 */
export function clearExamples(): number {
  const n = Object.keys(load()).length;
  mem = {};
  try {
    localStorage.removeItem(EXAMPLES_KEY);
  } catch {
    /* ignore */
  }
  return n;
}

export const examplesCount = () => Object.keys(load()).length;

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

// ---------------------------------------------------------------- v9 · 例句选词

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 例句里本词（或 -s/-es/-d/-ed/-ing/-ly 变形）出现的位置 */
function findForm(sentence: string, word: string): { at: number; form: string } | null {
  if (!/^[A-Za-z-]+$/.test(word)) return null;
  const re = new RegExp(`(^|[^A-Za-z])(${escRe(word)}(?:s|es|d|ed|ing|ly)?)(?=$|[^A-Za-z])`, "i");
  const m = sentence.match(re);
  if (!m || m.index === undefined) return null;
  return { at: m.index + m[1].length, form: m[2] };
}

export interface ExampleCloze {
  /** 原句 */
  sentence: string;
  /** 挖空后的句子（本词换成 ____） */
  blanked: string;
  /** 句子里实际出现的词形 */
  form: string;
}

/** 用缓存的例句挖空本词；没有缓存或句子里找不到本词时返回 null（不发请求） */
export function exampleCloze(word: string, seed = 0, list?: string[]): ExampleCloze | null {
  const sentences = (list ?? cachedExamples(word) ?? []).filter((s) => findForm(s, word));
  if (!sentences.length) return null;
  const sentence = sentences[(seed >>> 0) % sentences.length];
  const hit = findForm(sentence, word)!;
  return { sentence, blanked: sentence.slice(0, hit.at) + "____" + sentence.slice(hit.at + hit.form.length), form: hit.form };
}

export const hasExampleCloze = (word: string) => exampleCloze(word) !== null;
