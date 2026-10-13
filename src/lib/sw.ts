import { useSyncExternalStore } from "react";

/**
 * Service worker 注册与更新提示：新版 SW 安装完成后处于 waiting，
 * 页面显示"有新版本，点击刷新"；点击后让它 skipWaiting，接管后自动刷新。
 */
let waiting: ServiceWorker | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function setWaiting(w: ServiceWorker | null) {
  waiting = w;
  emit();
}

function track(reg: ServiceWorkerRegistration) {
  if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
  reg.addEventListener("updatefound", () => {
    const sw = reg.installing;
    if (!sw) return;
    sw.addEventListener("statechange", () => {
      // 有旧版在控制页面时才算"更新"；首次安装不提示
      if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(reg.waiting ?? sw);
    });
  });
}

export function registerSW() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!waiting || reloading) return; // 只在用户点了刷新后才重载
    reloading = true;
    location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        track(reg);
        const check = () => reg.update().catch(() => {});
        document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
        setInterval(check, 60 * 60 * 1000);
      })
      .catch(() => {});
  });
}

export function applyUpdate() {
  if (!waiting) return location.reload();
  waiting.postMessage({ type: "SKIP_WAITING" });
}

export function useSwUpdate(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => !!waiting,
    () => false,
  );
}
