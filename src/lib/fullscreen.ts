/** v8 · 专注模式：学习页一键全屏（Fullscreen API） */
import { useCallback, useEffect, useState } from "react";

export function fullscreenSupported(): boolean {
  return typeof document !== "undefined" && !!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function";
}

export function useFullscreen(): [boolean, () => void] {
  const [on, setOn] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  useEffect(() => {
    const f = () => setOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => {
      document.removeEventListener("fullscreenchange", f);
      // 离开学习页时退出全屏
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    };
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {});
  }, []);
  return [on, toggle];
}
