import type { Word, WordIndex } from "./data";

/**
 * 形近词：拼写相近、容易认混的四级词（adapt / adopt，affect / effect）。
 * 纯本地计算：长度差 ≤1，编辑距离 ≤ 阈值；排除只差词尾变化的同族词（use / used）。
 */

// ⚡ Bolt Optimization: Shared TypedArray buffers for editDistance calculation to avoid GC pressure.
// Avoids allocating 2D array matrix per call (saves ~10 array allocations per word comparison x 4000 words).
let buf0 = new Int32Array(64);
let buf1 = new Int32Array(64);
let buf2 = new Int32Array(64);

/** 带上限的编辑距离（相邻字母对调算 1 步，quiet / quite）：超过 max 返回 max+1 */
export function editDistance(a: string, b: string, max = 2): number {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (bl + 1 > buf0.length) {
    const sz = Math.max(bl + 1, buf0.length * 2);
    buf0 = new Int32Array(sz);
    buf1 = new Int32Array(sz);
    buf2 = new Int32Array(sz);
  }
  let r0 = buf0, r1 = buf1, r2 = buf2;
  for (let j = 0; j <= bl; j++) r1[j] = j;

  for (let i = 1; i <= al; i++) {
    r2[0] = i;
    let rowMin = i;
    const ai1 = a.charCodeAt(i - 1);
    const ai2 = i > 1 ? a.charCodeAt(i - 2) : 0;
    for (let j = 1; j <= bl; j++) {
      const bj1 = b.charCodeAt(j - 1);
      let v = Math.min(r1[j] + 1, r2[j - 1] + 1, r1[j - 1] + (ai1 === bj1 ? 0 : 1));
      if (i > 1 && j > 1 && ai1 === b.charCodeAt(j - 2) && ai2 === bj1) {
        v = Math.min(v, r0[j - 2] + 1);
      }
      r2[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const tmp = r0; r0 = r1; r1 = r2; r2 = tmp;
  }
  return r1[bl];
}

/** 只差常见词尾（-s/-es/-d/-ed/-ly/-r/-er）的同族词，不算形近 */
export function isInflection(a: string, b: string): boolean {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (!l.startsWith(s)) return false;
  return ["s", "es", "d", "ed", "ly", "r", "er", "y"].includes(l.slice(s.length));
}

/** 短词只认 1 步之差（adapt / adopt），长词放宽到 2 步（principal / principle） */
function threshold(len: number) {
  return len <= 6 ? 1 : 2;
}

const cache = new Map<string, Word[]>();

export function confusables(index: WordIndex, word: Word, n = 3): Word[] {
  const key = word.w;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = word.w.toLowerCase();
  const out: [Word, number][] = [];
  if (w.length >= 3 && !/[\s.]/.test(w)) {
    const max = threshold(w.length);
    for (const c of index.list) {
      const cw = c.w.toLowerCase();
      if (cw === w || Math.abs(cw.length - w.length) > 1 || /[\s.]/.test(cw)) continue;
      if (cw.length < 3 || isInflection(w, cw)) continue;
      const d = editDistance(w, cw, max);
      if (d > max) continue;
      // 打分：距离优先，同首字母、同长度、核心词更像「真的会认混」
      const score = d * 10 + (cw[0] === w[0] ? 0 : 4) + (cw.length === w.length ? 0 : 2) + (c.c ? 0 : 1);
      out.push([c, score]);
    }
  }
  const res = out
    .sort((a, b) => a[1] - b[1] || a[0].w.localeCompare(b[0].w))
    .slice(0, n)
    .map((x) => x[0]);
  cache.set(key, res);
  return res;
}
