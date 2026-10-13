import { dayKey } from "./srs";

/**
 * 时钟：所有「今天」都从这里取，便于测试。
 * 调试：?debugDays=N 把时钟向后拨 N 天（只用于自测，不影响正常使用）。
 */
let offsetMs = 0;
try {
  const q = new URLSearchParams(window.location.search).get("debugDays");
  if (q && !Number.isNaN(Number(q))) offsetMs = Number(q) * 86400000;
} catch {
  /* ignore */
}

export const now = () => Date.now() + offsetMs;
export const today = () => dayKey(new Date(now()));
