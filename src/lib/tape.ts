import type { Word } from "./data";

/**
 * 磁带模式（纯逻辑）：每个词按「英文发音 → 停顿 → 中文释义 → 停顿」朗读 N 遍，
 * 列表放完从头循环；定时停止按绝对时间判断（锁屏后计时器被节流也不会多放）。
 */

export type TapeStep =
  | { kind: "en"; pass: number }
  | { kind: "cn"; pass: number; text: string }
  | { kind: "gap"; pass: number; ms: number };

/** 英文后停顿、中文后停顿（毫秒，1× 语速） */
export const GAP_AFTER_EN = 700;
export const GAP_AFTER_CN = 1200;

/** 中文释义的朗读文本：去掉词性标记，最多两条释义、每条最多三个义项 */
export function cnSpeech(word: Word): string {
  return word.t
    .slice(0, 2)
    .map(([, m]) =>
      m
        .replace(/[（(][^）)]*[）)]/g, "")
        .split(/[；;，,]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join("，"),
    )
    .filter((x, k, arr) => !!x && arr.indexOf(x) === k)
    .join("；");
}

export function tapeSteps(word: Word, repeat: number, rate = 1): TapeStep[] {
  const n = Math.max(1, Math.min(3, Math.round(repeat)));
  const text = cnSpeech(word);
  const r = rate > 0 ? rate : 1;
  const out: TapeStep[] = [];
  for (let pass = 1; pass <= n; pass++) {
    out.push({ kind: "en", pass });
    out.push({ kind: "gap", pass, ms: Math.round(GAP_AFTER_EN / r) });
    if (text) {
      out.push({ kind: "cn", pass, text });
      out.push({ kind: "gap", pass, ms: Math.round(GAP_AFTER_CN / r) });
    }
  }
  return out;
}

/** 列表循环：下一个 / 上一个 */
export function wrapIndex(i: number, len: number): number {
  if (len <= 0) return 0;
  return ((i % len) + len) % len;
}

/** 定时停止：剩余毫秒（未定时返回 null，到点返回 0） */
export function sleepLeft(endAt: number | null, now: number): number | null {
  if (endAt === null) return null;
  return Math.max(0, endAt - now);
}

/** 剩余时间 → m:ss */
export function fmtRemain(ms: number): string {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 系统语音的语速：1× 时 0.9（更清楚），随设置等比缩放 */
export function ttsRate(rate: number): number {
  return Math.round(0.9 * (rate > 0 ? rate : 1) * 100) / 100;
}

/** 系统语音读完一段文字的最长等待（防止某些浏览器不触发 onend 卡住磁带） */
export function speechTimeout(text: string, rate: number): number {
  const r = rate > 0 ? rate : 1;
  const zh = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const other = text.length - zh;
  return Math.round((1500 + zh * 280 + other * 70) / r);
}
