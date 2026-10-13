/**
 * v8 · 体验与无障碍：纯逻辑（字号、左手模式、滑动方向、减少动画、剩余时间、安装引导、对比度）
 * 不依赖 DOM，方便单元测试。
 */
import type { Rating } from "./srs";

// ---------------------------------------------------------------- 字号

export type FontSize = "sm" | "md" | "lg";
export const FONT_SIZES: FontSize[] = ["sm", "md", "lg"];
export const FONT_LABEL: Record<FontSize, string> = { sm: "小", md: "中", lg: "大" };
/** 卡片与释义的缩放比例（CSS zoom） */
export const FONT_ZOOM: Record<FontSize, number> = { sm: 0.88, md: 1, lg: 1.16 };

export function cleanFontSize(v: unknown): FontSize {
  return v === "sm" || v === "lg" ? v : "md";
}

// ---------------------------------------------------------------- 减少动画

export type Motion = "system" | "reduce" | "full";
export const MOTION_LABEL: Record<Motion, string> = { system: "跟随系统", reduce: "减少", full: "正常" };

export function cleanMotion(v: unknown): Motion {
  return v === "reduce" || v === "full" ? v : "system";
}

/** 是否减少动画：手动设置优先，否则跟随系统 prefers-reduced-motion */
export function motionReduced(m: Motion, systemReduce: boolean): boolean {
  if (m === "reduce") return true;
  if (m === "full") return false;
  return systemReduce;
}

// ---------------------------------------------------------------- 左手模式 / 滑动方向

const RIGHT_HAND: Rating[] = ["know", "vague", "forget"];

/** 评分按钮从左到右的顺序；左手模式整体翻转（常用的「认识」靠近左手拇指） */
export function rateOrder(leftHand: boolean): Rating[] {
  return leftHand ? [...RIGHT_HAND].reverse() : RIGHT_HAND.slice();
}

/** 横向滑动对应的评分：默认右滑认识、左滑不认识；交换后相反 */
export function sideRating(side: "left" | "right", swap: boolean): "know" | "forget" {
  const right = side === "right";
  return right !== swap ? "know" : "forget";
}

/**
 * 一次拖动的结果。dx > 0 向右；dy < 0 向上（向上 = 模糊，不受交换影响）。
 * vertical = false 时只认左右（速刷）。
 */
export function swipeRating(dx: number, dy: number, opts: { swap: boolean; threshold?: number; vertical?: boolean }): Rating | null {
  const t = opts.threshold ?? 90;
  if (dx > t) return sideRating("right", opts.swap);
  if (dx < -t) return sideRating("left", opts.swap);
  if (opts.vertical !== false && dy < -t) return "vague";
  return null;
}

/** 速刷两个按钮从左到右：跟随滑动方向（左边按钮 = 左滑的结果） */
export function speedOrder(swap: boolean): ["know" | "forget", "know" | "forget"] {
  return [sideRating("left", swap), sideRating("right", swap)];
}

/** 卡片上的滑动提示文字 */
export function swipeHint(swap: boolean): string {
  return swap ? "左滑认识 · 右滑不认识" : "右滑认识 · 左滑不认识";
}

// ---------------------------------------------------------------- 剩余时间估算

/** 每题最多按 60 秒算（发呆、切出去不算进平均） */
export const ETA_CAP_MS = 60_000;
/** 没有任何数据时的默认每题用时 */
export const ETA_DEFAULT_MS = 8_000;

/**
 * 每题平均用时：本组已经答了 ≥3 题用本组的；否则用历史（≥10 题）；都没有用默认。
 * 本组 1–2 题时与历史平均混合，避免第一题很慢时估得离谱。
 */
export function avgAnswerMs(sessionMs: number[], hist: { ms: number; a: number }): number {
  const capped = sessionMs.filter((x) => Number.isFinite(x) && x >= 0).map((x) => Math.min(ETA_CAP_MS, x));
  const histAvg = hist.a >= 10 && hist.ms > 0 ? Math.min(ETA_CAP_MS, hist.ms / hist.a) : null;
  const mean = capped.length ? capped.reduce((s, x) => s + x, 0) / capped.length : null;
  if (mean !== null && capped.length >= 3) return mean;
  const base = histAvg ?? ETA_DEFAULT_MS;
  if (mean === null) return base;
  // 1–2 题：按题数加权
  return (mean * capped.length + base * (3 - capped.length)) / 3;
}

/** 剩余分钟（四舍五入，至少 1）与显示文字；剩 0 题返回 null */
export function estimateRemaining(remaining: number, sessionMs: number[], hist: { ms: number; a: number }): { ms: number; min: number; label: string } | null {
  if (remaining <= 0) return null;
  const ms = remaining * avgAnswerMs(sessionMs, hist);
  if (ms < 60_000) return { ms, min: 0, label: "不到 1 分钟" };
  const min = Math.max(1, Math.round(ms / 60_000));
  return { ms, min, label: `剩约 ${min} 分钟` };
}

/** 所有学习日志的累计用时与作答数 */
export function historyPace(log: Record<string, { ms?: number; a?: number }>): { ms: number; a: number } {
  let ms = 0;
  let a = 0;
  for (const d of Object.values(log)) {
    if (!d || !d.a || !d.ms) continue;
    ms += d.ms;
    a += d.a;
  }
  return { ms, a };
}

// ---------------------------------------------------------------- 安装引导

/** 关掉安装卡片后多少天内不再出现 */
export const INSTALL_SNOOZE_DAYS = 14;

export function installVisible(o: { canPrompt: boolean; standalone: boolean; installed?: boolean; snoozeUntil?: string; today: string }): boolean {
  if (!o.canPrompt || o.standalone || o.installed) return false;
  if (o.snoozeUntil && o.today < o.snoozeUntil) return false;
  return true;
}

// ---------------------------------------------------------------- 读屏播报

const RATING_CN: Record<Rating, string> = { know: "认识", vague: "模糊", forget: "不认识" };

export function rateAnnouncement(w: string, r: Rating, next?: string): string {
  if (r === "forget") return `${w}，记为不认识，稍后再来一遍`;
  return `${w}，记为${RATING_CN[r]}${next ? `，${next}后复习` : ""}`;
}

export function quizAnnouncement(ok: boolean, w: string, answer: string, gaveUp = false): string {
  if (gaveUp) return `正确答案：${answer}`;
  return ok ? `回答正确，${w}` : `回答错误，正确答案：${answer}`;
}

// ---------------------------------------------------------------- 对比度（WCAG 2.x）

export function relLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [relLuminance(a), relLuminance(b)].sort((p, q) => p - q);
  return (y + 0.05) / (x + 0.05);
}
