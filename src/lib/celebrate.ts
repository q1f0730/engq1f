import { useSyncExternalStore } from "react";

/** 里程碑庆祝：打卡时跨过 7 / 30 / 100 天就弹全屏动画 */
let current: number | null = null;
let after: (() => void) | null = null;
const subs = new Set<() => void>();

/** 有里程碑就庆祝，关掉后再执行 then（例如弹分享图）；没有里程碑直接执行 then */
export function celebrate(n: number | null | undefined, then?: () => void) {
  if (!n) {
    then?.();
    return;
  }
  current = n;
  after = then ?? null;
  subs.forEach((f) => f());
}

export function dismissCelebration() {
  const fn = after;
  current = null;
  after = null;
  subs.forEach((f) => f());
  fn?.();
}

export function useCelebration(): number | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
  );
}

export const MILESTONE_TEXT: Record<number, [string, string]> = {
  7: ["一周不断！", "第一个 7 天最难，你做到了。还送你 1 张补卡。"],
  30: ["坚持一个月！", "30 天，背单词已经成了习惯。"],
  100: ["百日筑基！", "100 天不间断，四级词汇稳了。"],
};
