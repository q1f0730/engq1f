/**
 * 11.3 · 救援导出的「原始数据」（{app, raw: {存档 key: 原文}}）也能导入：
 *  - 原文能解析 → 当成普通备份
 *  - 原文坏了（写到一半被杀、被截断）→ 逐条抢救：读得完整的字段 / 单词记录都留下，坏掉的尾巴丢掉
 * 纯函数，不碰存储。
 */

export interface Unwrapped {
  /** 能交给 normalize 的状态对象 */
  state: Record<string, unknown>;
  /** 原文是坏的、抢救出来的：救回几个单词记录（原文完好时为 undefined） */
  salvaged?: number;
}

/** 从 i 开始跳过空白，返回下一个非空白字符的位置 */
function ws(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

/** 读一个 JSON 字符串字面量（i 指向开头的引号），返回结束后的位置；不完整返回 -1 */
function strEnd(s: string, i: number): number {
  for (let k = i + 1; k < s.length; k++) {
    if (s[k] === "\\") k++;
    else if (s[k] === '"') return k + 1;
  }
  return -1;
}

/** 读一个完整的 JSON 值（对象 / 数组 / 字符串 / 字面量），返回结束后的位置；不完整返回 -1 */
function valueEnd(s: string, i: number): number {
  const c = s[i];
  if (c === '"') return strEnd(s, i);
  if (c === "{" || c === "[") {
    let depth = 0;
    for (let k = i; k < s.length; k++) {
      const ch = s[k];
      if (ch === '"') {
        const e = strEnd(s, k);
        if (e < 0) return -1;
        k = e - 1;
      } else if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) return k + 1;
      }
    }
    return -1;
  }
  const m = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(s.slice(i, i + 40));
  if (!m) return -1;
  const end = i + m[0].length;
  // 数字可能被截断在中间：后面必须还有分隔符
  return end < s.length ? end : -1;
}

/**
 * 抢救一个（可能被截断的）JSON 对象：从 start（指向 `{`）开始逐个读键值，读不完整就停。
 * deep = 被截断的最后一个值如果也是对象，往里再抢救一层（cards / log 这种大对象）。
 */
export function salvageObject(s: string, start: number, deep = 1): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let i = ws(s, start);
  if (s[i] !== "{") return out;
  i++;
  for (let guard = 0; guard < 100000; guard++) {
    i = ws(s, i);
    if (s[i] === ",") i = ws(s, i + 1);
    if (i >= s.length || s[i] === "}" || s[i] !== '"') break;
    const ke = strEnd(s, i);
    if (ke < 0) break;
    let key: string;
    try {
      key = JSON.parse(s.slice(i, ke)) as string;
    } catch {
      break;
    }
    i = ws(s, ke);
    if (s[i] !== ":") break;
    i = ws(s, i + 1);
    const ve = valueEnd(s, i);
    if (ve < 0) {
      if (deep > 0 && s[i] === "{") {
        const inner = salvageObject(s, i, deep - 1);
        if (Object.keys(inner).length) out[key] = inner;
      }
      break;
    }
    try {
      out[key] = JSON.parse(s.slice(i, ve));
    } catch {
      break;
    }
    i = ve;
  }
  return out;
}

/** 坏掉的存档原文 → 尽量救出来的状态（至少要救出一个单词记录或打卡，才算救回来了） */
export function salvageState(text: string): Unwrapped | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  const obj = salvageObject(text, start, 1);
  const cards = obj.cards && typeof obj.cards === "object" && !Array.isArray(obj.cards) ? (obj.cards as Record<string, unknown>) : {};
  const n = Object.keys(cards).length;
  if (!n && !Array.isArray(obj.checkins)) return null;
  return { state: { ...obj, cards, onboarded: true }, salvaged: n };
}

/** 是不是救援导出的原始数据格式 */
export function isRawDump(p: unknown): p is { app: string; raw: Record<string, string | null>; exportedAt?: string } {
  const r = p as { app?: unknown; raw?: unknown; state?: unknown };
  return !!r && r.app === "cet4-vocab" && !r.state && !!r.raw && typeof r.raw === "object" && !Array.isArray(r.raw);
}

/** 原始数据 → 状态：主存档原文能解析就直接用（带上单独存的复习日志），坏了就抢救；什么都救不出来返回 null */
export function unwrapRaw(raw: Record<string, string | null>): Unwrapped | null {
  const keys = Object.keys(raw);
  const mainKey = keys.find((k) => /^cet4v-state/.test(k));
  const revKey = keys.find((k) => /^cet4v-rev/.test(k));
  const main = mainKey ? raw[mainKey] : null;
  if (typeof main !== "string" || !main) return null;
  let rev: unknown[] | null = null;
  try {
    const r = JSON.parse(raw[revKey ?? ""] ?? "null");
    if (Array.isArray(r)) rev = r;
  } catch {
    /* 日志坏了：不带日志 */
  }
  let res: Unwrapped | null = null;
  try {
    const st = JSON.parse(main);
    if (st && typeof st === "object" && !Array.isArray(st)) res = { state: st as Record<string, unknown> };
  } catch {
    res = salvageState(main);
  }
  if (!res) return null;
  if (rev && !Array.isArray(res.state.revlog)) res.state.revlog = rev;
  return res;
}
