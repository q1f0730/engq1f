/**
 * v9 · 复习题型的选择（纯函数）
 *  - 自选题型：用户关掉的题型不再出现，至少保留一种基础题型
 *  - 难度递进：间隔短的词出「英选中」，中等出「中选英」，间隔长的出听音题
 */
import { hashStr, pickMode, type QuizMode } from "./srs";

/** 设置里可以勾选的全部复习题型（顺序即界面顺序） */
export const REVIEW_MODES: QuizMode[] = ["recall", "en2cn", "cn2en", "audio", "listen", "phrase", "cnphrase", "poly", "pos", "cloze", "example"];

/** 任何词都能出的基础题型：至少要保留一种 */
export const BASE_MODES: QuizMode[] = ["recall", "en2cn", "cn2en", "audio"];

/** 清洗「关掉的题型」：只留合法值；基础题型全关了就恢复全部基础题型 */
export function cleanOffModes(raw: unknown): QuizMode[] {
  if (!Array.isArray(raw)) return [];
  const off = REVIEW_MODES.filter((m) => raw.includes(m));
  return BASE_MODES.every((m) => off.includes(m)) ? off.filter((m) => !BASE_MODES.includes(m)) : off;
}

/** 切换一个题型；会把基础题型全部关掉时返回 null（不允许） */
export function toggleMode(off: QuizMode[], m: QuizMode): QuizMode[] | null {
  const next = off.includes(m) ? off.filter((x) => x !== m) : [...off, m];
  if (BASE_MODES.every((b) => next.includes(b))) return null;
  return REVIEW_MODES.filter((x) => next.includes(x));
}

/** 难度递进的三档（按当前间隔） */
export const TIER_SHORT = 3;
export const TIER_LONG = 10;
export type Tier = "short" | "mid" | "long";
export function tierOf(ivl: number): Tier {
  if (ivl <= TIER_SHORT) return "short";
  if (ivl < TIER_LONG) return "mid";
  return "long";
}

/** 递进题型：短 → 英选中；中 → 中选英；长 → 听音（有形近词时听音辨词） */
export function progressiveMode(ivl: number, hasListen: boolean): QuizMode {
  const t = tierOf(ivl);
  if (t === "short") return "en2cn";
  if (t === "mid") return "cn2en";
  return hasListen ? "listen" : "audio";
}

export interface ModeInput {
  w: string;
  day: string;
  cnFirst?: boolean;
  hasPhrase?: boolean;
  hasListen?: boolean;
  /** v4 题型（一词多义 / 词性 / 挖空）中这个词能出的 */
  v4?: QuizMode[];
  /** v9 题型（例句选词 / 中选短语）中这个词能出的 */
  extra?: QuizMode[];
  /** 关掉的题型 */
  off?: QuizMode[];
  /** 难度递进 */
  progressive?: boolean;
  /** 当前间隔（天）；没有卡片时不递进 */
  ivl?: number;
}

/** 这个词能出的全部题型 */
export function eligibleModes(x: ModeInput): QuizMode[] {
  const out: QuizMode[] = [...BASE_MODES];
  if (x.hasPhrase) out.push("phrase");
  if (x.hasListen) out.push("listen");
  for (const m of [...(x.v4 ?? []), ...(x.extra ?? [])]) if (!out.includes(m)) out.push(m);
  return out;
}

/** 复习题型：难度递进优先，其次原有分配；落在关掉的题型上时换成一个开着的 */
export function chooseMode(x: ModeInput): QuizMode {
  const off = x.off ?? [];
  if (x.progressive && x.ivl !== undefined) {
    const m = progressiveMode(x.ivl, !!x.hasListen);
    if (!off.includes(m)) return m;
    if (m === "listen" && !off.includes("audio")) return "audio";
  }
  const m = pickMode(x.w, x.day, !!x.cnFirst, !!x.hasPhrase, !!x.hasListen, x.v4 ?? [], x.extra ?? []);
  if (!off.includes(m)) return m;
  const ok = eligibleModes(x).filter((k) => !off.includes(k));
  if (!ok.length) return "en2cn";
  return ok[hashStr(x.w + x.day + "alt") % ok.length];
}

/** 错词再练：只出选择题；关掉的题型同样不出（全关时退回英选中） */
export function practiceMode(x: ModeInput): QuizMode {
  const off = x.off ?? [];
  let m = pickMode(x.w, x.day + "practice", false, !!x.hasPhrase, !!x.hasListen);
  if (m === "recall") m = "en2cn";
  if (!off.includes(m)) return m;
  const ok = eligibleModes({ ...x, v4: [], extra: [] }).filter((k) => k !== "recall" && !off.includes(k));
  return ok.length ? ok[hashStr(x.w + x.day + "palt") % ok.length] : "en2cn";
}
