/**
 * 11.1 · 有鼠标 / 触控板（能悬停、指针精确）且没有触摸屏的设备才显示键盘快捷键相关的提示和入口；
 * 手机横屏宽度再大也不算。带触摸屏的设备（手机、平板、触屏笔记本）一律不显示——快捷键本身照样能用，只是不打广告。
 * 多看一眼 maxTouchPoints：有些环境（模拟器、外接鼠标的手机）会把 (hover: hover) 报成真。
 */
import { useSyncExternalStore } from "react";

const Q = "(hover: hover) and (pointer: fine)";

export function finePointer(): boolean {
  if (typeof window === "undefined") return false;
  if ((navigator.maxTouchPoints ?? 0) > 0) return false;
  return !!window.matchMedia?.(Q).matches;
}

export function useFinePointer(): boolean {
  return useSyncExternalStore(
    (f) => {
      const m = typeof window !== "undefined" ? window.matchMedia?.(Q) : undefined;
      m?.addEventListener?.("change", f);
      return () => m?.removeEventListener?.("change", f);
    },
    finePointer,
    () => false,
  );
}
