/**
 * 11.1 · 数据校验（首屏里，保持很小）
 *
 * 读档、导入、多窗口同步都走这里：每张卡、每天的日志逐条检查，
 * 能修的修、修不了的丢，绝不把一个坏字段带进界面（坏状态会让整个应用打不开）。
 */
import { MASTER_DAYS, MAX_EASE, MIN_EASE, NEVER, type Card, type DayLog } from "./srs";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (d: unknown): d is string => typeof d === "string" && DAY_RE.test(d) && !Number.isNaN(Date.parse(d + "T12:00:00"));
const nonNegInt = (x: unknown) => typeof x === "number" && Number.isInteger(x) && x >= 0;
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const plainObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** 修一张卡片；没坏返回 null，修不了（不是对象）返回 "drop" */
export function fixCard(c: unknown, today: string): Card | null | "drop" {
  if (!plainObj(c)) return "drop";
  const x = c as unknown as Card;
  const out: Card = { ...x };
  let bad = false;
  if (!finite(x.e) || x.e < MIN_EASE || x.e > MAX_EASE) {
    out.e = finite(x.e) ? Math.min(MAX_EASE, Math.max(MIN_EASE, x.e)) : 2.5;
    bad = true;
  }
  if (!nonNegInt(x.i)) {
    out.i = finite(x.i) && x.i > 0 ? Math.min(36500, Math.round(x.i)) : 0;
    bad = true;
  }
  if (!nonNegInt(x.r)) (out.r = 0, (bad = true));
  if (!nonNegInt(x.l)) (out.l = 0, (bad = true));
  if (!isDay(x.f)) (out.f = isDay(x.t) ? x.t : today, (bad = true));
  if (!isDay(x.t)) (out.t = out.f, (bad = true));
  if (x.k !== undefined && x.k !== 1) (delete out.k, (bad = true));
  if (x.rs !== undefined && x.rs !== 1) (delete out.rs, (bad = true));
  if (out.k) {
    if (x.d !== NEVER) (out.d = NEVER, (bad = true));
  } else if (!isDay(x.d) || x.d === NEVER) (out.d = today, (bad = true));
  const st = out.k || out.i >= MASTER_DAYS ? "mastered" : out.i === 0 ? "learning" : "review";
  if (x.st !== st) (out.st = st, (bad = true));
  // 只留认识的字段
  for (const k of Object.keys(out)) if (!CARD_KEYS.has(k)) (delete (out as unknown as Record<string, unknown>)[k], (bad = true));
  return bad ? out : null;
}

const CARD_KEYS = new Set(["st", "e", "i", "r", "l", "d", "f", "t", "k", "rs"]);

export interface CleanReport {
  /** 丢掉的单词记录（不是对象 / 词库里没有） */
  dropped: string[];
  /** 修正过的单词记录 */
  repaired: string[];
  /** 其他被丢掉或修正的条目（日志、打卡、生词本…） */
  other: number;
  /** 11.3 · 从坏掉的原始数据里抢救出来的单词记录数（原文完好时没有） */
  salvaged?: number;
}

export const emptyReport = (): CleanReport => ({ dropped: [], repaired: [], other: 0 });

/** 逐卡校验：has 给了就顺便丢掉词库里没有的词 */
export function cleanCards(raw: unknown, today: string, has?: (w: string) => boolean, rep: CleanReport = emptyReport()): Record<string, Card> {
  const out: Record<string, Card> = {};
  if (!plainObj(raw)) {
    if (raw !== undefined && raw !== null) rep.other++;
    return out;
  }
  for (const [w, c] of Object.entries(raw)) {
    if (!w || (has && !has(w))) {
      rep.dropped.push(w);
      continue;
    }
    const f = fixCard(c, today);
    if (f === "drop") {
      rep.dropped.push(w);
      continue;
    }
    if (f) rep.repaired.push(w);
    out[w] = f ?? (c as Card);
  }
  return out;
}

const LOG_FIELDS = ["n", "r", "ok", "a", "ms"] as const;

export function cleanLog(raw: unknown, rep: CleanReport = emptyReport()): Record<string, DayLog> {
  const out: Record<string, DayLog> = {};
  if (!plainObj(raw)) {
    if (raw !== undefined && raw !== null) rep.other++;
    return out;
  }
  for (const [d, l] of Object.entries(raw)) {
    if (!isDay(d) || !plainObj(l)) {
      rep.other++;
      continue;
    }
    const ok = LOG_FIELDS.every((f) => nonNegInt(l[f]));
    const fixed = Object.fromEntries(LOG_FIELDS.map((f) => [f, nonNegInt(l[f]) ? l[f] : 0])) as unknown as DayLog;
    fixed.ok = Math.min(fixed.ok, fixed.a);
    if (!ok || fixed.ok !== l.ok) rep.other++;
    out[d] = fixed;
  }
  return out;
}

/** 字符串 → 1 的表（生词本）；has 给了就去掉词库里没有的 */
export function cleanFlags(raw: unknown, has?: (w: string) => boolean, rep: CleanReport = emptyReport()): Record<string, 1> {
  const out: Record<string, 1> = {};
  if (!plainObj(raw)) return out;
  for (const w of Object.keys(raw)) (has && !has(w) ? rep.other++ : (out[w] = 1));
  return out;
}

/** 词 → 日期 的表（明天再说） */
export function cleanDayMap(raw: unknown, has?: (w: string) => boolean, rep: CleanReport = emptyReport()): Record<string, string> {
  const out: Record<string, string> = {};
  if (!plainObj(raw)) return out;
  for (const [w, d] of Object.entries(raw)) (isDay(d) && (!has || has(w)) ? (out[w] = d) : rep.other++);
  return out;
}

/** 日期列表：去掉无效、去重、排序 */
export function cleanDays(raw: unknown, rep: CleanReport = emptyReport()): string[] {
  if (!Array.isArray(raw)) return [];
  const s = new Set<string>();
  for (const d of raw) (isDay(d) ? s.add(d) : rep.other++);
  return [...s].sort();
}

export const optDay = (x: unknown): string | undefined => (isDay(x) ? x : undefined);
