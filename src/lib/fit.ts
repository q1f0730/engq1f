import { useLayoutEffect, useRef } from "react";

/**
 * 11.8 · 按实际宽度缩字号，让一个词 / 一个数字只占一行（r8 R8-2 / R8-3）。
 *
 * 元素 el 是块级、宽度等于可用宽度（不随内容收缩）。
 * 先去掉之前缩过的字号，按 nowrap 量一行的宽度（scrollWidth）：放得下就什么都不做（CSS 原来的字号不变，
 * 横屏的 --wl 规则照旧生效）；放不下就按比例缩小（同一个 zoom 坐标系里量，大字号 / 小字号都对），
 * 最小 minPx。缩完恢复原来的换行规则，break-all 只是兜底。
 */
export function fitLine(el: HTMLElement | null, minPx = 14): number | null {
  if (!el) return null;
  // 「减少动画」把所有过渡缩到 0.01ms（transition-duration !important）：字号一改就起一个过渡，同步读到的还是旧字号，
  // 量出来就是错的。这个元素不要字号过渡（行内 !important 盖过样式表里的 !important）
  // 子元素继承字号，也会各自起过渡，一起关掉
  for (const n of [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))]) {
    n.style.setProperty("transition", "none", "important");
    n.getAnimations?.().forEach((a) => a.finish?.());
  }
  el.style.removeProperty("font-size");
  const ws = el.style.whiteSpace;
  const ta = el.style.textAlign;
  // 量的时候不换行、靠左：放不下的部分全在右边，scrollWidth 就是一行的宽度。
  // 只用元素自己的 clientWidth / scrollWidth（同一个坐标系；行内元素的 offsetWidth 在 zoom 下会多乘一次缩放，不能用）
  el.style.whiteSpace = "nowrap";
  el.style.textAlign = "left";
  try {
    const avail = el.clientWidth;
    if (!avail) return null;
    let fs = parseFloat(getComputedStyle(el).fontSize) || 16;
    let applied: number | null = null;
    for (let i = 0; i < 4; i++) {
      const w = el.scrollWidth;
      if (w <= avail + 0.5) break;
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
    el.style.textAlign = ta;
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
    // 网络字体换上来以后字宽会变（块的宽度不变，ResizeObserver 不会响）：字体加载完再量一次，不然会按后备字体缩过头
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    const onFonts = () => alive && run(true);
    fonts?.ready?.then(onFonts).catch(() => {});
    fonts?.addEventListener?.("loadingdone", onFonts);
    return () => {
      alive = false;
      fonts?.removeEventListener?.("loadingdone", onFonts);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [key, minPx]);
  return ref;
}
