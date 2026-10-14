import { useSyncExternalStore } from "react";

/**
 * Service worker 注册与更新提示：新版 SW 安装完成后处于 waiting，
 * 页面显示"有新版本，点击刷新"；点击后让它 skipWaiting，接管后自动刷新。
 */
let waiting: ServiceWorker | null = null;
/** 13.0 · 服务器上的版本号（version.json）比当前新：没有等待中的 SW 也提示刷新（例如 SW 被浏览器清掉、或还没装好） */
let newer: string | null = null;
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
        const check = () => {
          reg.update().catch(() => {});
          checkVersion();
        };
        document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
        setInterval(check, 60 * 60 * 1000);
      })
      .catch(() => {});
  });
}

/** 版本号比较：13.0.1 > 13.0.0 */
export function isNewer(remote: string, local: string): boolean {
  const a = remote.split(".").map((x) => parseInt(x, 10) || 0);
  const b = local.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

/** 13.0 · 发布后（meoo deploy）version.json 换成新版本号：取一下（不走缓存），比现在的新就提示 */
export function checkVersion(): Promise<string | null> {
  if (typeof fetch === "undefined") return Promise.resolve(null);
  return fetch(new URL("version.json", document.baseURI).href + "?t=" + Date.now(), { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ version?: string }>) : null))
    .then((j) => {
      const v = j?.version;
      if (v && isNewer(v, __APP_VERSION__) && newer !== v) {
        newer = v;
        emit();
      }
      return newer;
    })
    .catch(() => null);
}

export const newerVersion = () => newer;

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
    () => !!waiting || !!newer,
    () => false,
  );
}
