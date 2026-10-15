/**
 * 13.1 · 电脑端适配：版面断点（和 styles.css 里的 --breakpoint-* 一致）。
 * 手机 < 768（原样不动）· 平板 768–1199（顶栏 + 加宽的单 / 双栏）· 电脑 ≥ 1200（左侧栏 + 多栏）。
 * 只有「电脑版才有的东西」（侧栏里的进度、词库右侧的详情栏）才用 JS 判断，其余全走 CSS。
 */
import { useSyncExternalStore } from "react";

export const DESK_QUERY = "(min-width: 75rem)";

function matches(q: string): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(q).matches;
}

export function useMedia(q: string): boolean {
  return useSyncExternalStore(
    (f) => {
      const m = typeof window !== "undefined" ? window.matchMedia?.(q) : undefined;
      m?.addEventListener?.("change", f);
      return () => m?.removeEventListener?.("change", f);
    },
    () => matches(q),
    () => false,
  );
}

/** 电脑版（≥ 1200px）：左侧栏 + 多栏 */
export const useDesk = () => useMedia(DESK_QUERY);
