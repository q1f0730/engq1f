import { useEffect } from "react";
import { useApp } from "./store";

/**
 * 屏幕常亮（Screen Wake Lock）：学习页和磁带模式打开时申请，离开时释放；
 * 切到后台系统会自动释放，回到前台重新申请。设置里关闭或浏览器不支持时什么都不做。
 */
type Sentinel = { release: () => Promise<void> };
type WakeLockApi = { request: (type: "screen") => Promise<Sentinel> };

export function wakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
}

export function useWakeLock(active: boolean) {
  const enabled = useApp().settings.wakeLock ?? true;
  useEffect(() => {
    if (!active || !enabled || !wakeLockSupported()) return;
    const api = (navigator as Navigator & { wakeLock: WakeLockApi }).wakeLock;
    let lock: Sentinel | null = null;
    let alive = true;
    const acquire = () => {
      if (document.visibilityState !== "visible" || lock) return;
      api
        .request("screen")
        .then((s) => {
          if (!alive) void s.release().catch(() => {});
          else {
            lock = s;
            (s as unknown as EventTarget).addEventListener?.("release", () => {
              if (lock === s) lock = null;
            });
          }
        })
        .catch(() => {
          /* 省电模式等情况下会被拒绝，静默 */
        });
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        lock = null;
        acquire();
      }
    };
    acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
      lock = null;
    };
  }, [active, enabled]);
}
