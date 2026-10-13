import type { Rating } from "./srs";
import { getState } from "./store";

/** 震动反馈：答对轻震、模糊一震、答错双震。设备不支持或用户关闭时静默 */
export const VIBE: Record<Rating, number | number[]> = {
  know: 12,
  vague: 28,
  forget: [30, 50, 30],
};

export function buzz(rating: Rating) {
  if (!getState().settings.haptics) return;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(VIBE[rating]);
  } catch {
    /* 不支持 */
  }
}

/** 任意震动图案（里程碑庆祝等），同样受「震动反馈」开关控制 */
export function vibrate(pattern: number | number[]) {
  if (!getState().settings.haptics) return;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    /* 不支持 */
  }
}
