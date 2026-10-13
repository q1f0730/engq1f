import { diffDays } from "./srs";

/** 11.2 · 「这些词什么时候回来」按真实的到期日说：都一样就说那天，不一样说「最早…」 */
export function comeBackLine(dues: string[], day: string, n: number): string {
  const fut = dues.filter((d) => d > day).sort();
  if (!fut.length) return `这 ${n} 个词今天还会再来一遍`;
  const rel = (d: string) => {
    const k = diffDays(day, d);
    return k === 1 ? "明天" : k === 2 ? "后天" : `${k} 天后`;
  };
  const first = fut[0];
  const same = fut.every((d) => d === first) && fut.length === dues.length;
  return same ? `这 ${n} 个词${rel(first)}会回来复习一次` : `这 ${n} 个词最早${rel(first)}回来复习`;
}
