import { useLayoutEffect, useRef } from "react";

/**
 * 11.8 · 按实际宽度缩字号，让一个词 / 一个数字只占一行（r8 R8-2 / R8-3）。
 *
 * 元素 el 是块级、宽度等于可用宽度；它的第一个子元素（span）包住文字。
 * 先去掉之前缩过的字号，按 nowrap 量 span 的宽度：放得下就什么都不做（CSS 原来的字号不变，
 * 横屏的 --wl 规则照旧生效）；放不下就按比例缩小（同一个 zoom 坐标系里量，大字号 / 小字号都对），
 * 最小 minPx。缩完恢复原来的换行规则，break-all 只是兜底。
 */
export function fitLine(el: HTMLElement | null, minPx = 14): number | null {
  if (!el) return null;
  const inner = (el.firstElementChild as HTMLElement | null) ?? null;
  if (!inner) return null;
  el.style.removeProperty("font-size");
  const ws = el.style.whiteSpace;
  el.style.whiteSpace = "nowrap";
  try {
    const avail = el.clientWidth;
    if (!avail) return null;
    let fs = parseFloat(getComputedStyle(el).fontSize) || 16;
    let applied: number | null = null;
    for (let i = 0; i < 4; i++) {
      const w = inner.offsetWidth;
      if (w <= avail) break;
      const next = Math.max(minPx, Math.floor(fs * (avail / w) * 0.97 * 10) / 10);
      if (next >= fs) break;
      fs = next;
      el.style.setProperty("font-size", `${fs}px`, "important");
      applied = fs;
      if (fs <= minPx) break;
    }
    return applied;
  } finally {
    el.style.whiteSpace = ws;
  }
}

/** 返回给 <h2>/<div> 的 ref；key 变了（换词、翻面）、宽度变了、字号设置变了、字体加载完都重新量 */
export function useFitLine<T extends HTMLElement>(key: unknown, minPx = 14) {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastW = -1;
    const run = (force = false) => {
      const w = el.clientWidth;
      if (!force && w === lastW) return;
      lastW = w;
      fitLine(el, minPx);
    };
    run(true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => run()) : null;
    ro?.observe(el);
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(() => run(true)) : null;
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-fs", "class"] });
    let alive = true;
    document.fonts?.ready?.then(() => alive && run(true)).catch(() => {});
    return () => {
      alive = false;
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [key, minPx]);
  return ref;
}
