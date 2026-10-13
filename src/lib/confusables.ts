import type { Word, WordIndex } from "./data";

/**
 * 形近词：拼写相近、容易认混的四级词（adapt / adopt，affect / effect）。
 * 纯本地计算：长度差 ≤1，编辑距离 ≤ 阈值；排除只差词尾变化的同族词（use / used）。
 */

/** 带上限的编辑距离（相邻字母对调算 1 步，quiet / quite）：超过 max 返回 max+1 */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(rows[i - 1][j] + 1, cur[j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    rows.push(cur);
  }
  return rows[a.length][b.length];
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
