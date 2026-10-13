import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { applyLook, applyTheme, bootError, getState } from "./lib/store";
import { AppBoundary, Rescue } from "./components/app/rescue";
import { initInstall } from "./lib/install";
import { loadWords } from "./lib/data";
import { registerSW } from "./lib/sw";
import "./styles.css";

const router = getRouter();
applyTheme(getState().settings.theme);
applyLook(getState().settings);
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme(getState().settings.theme));
window.matchMedia?.("(prefers-reduced-motion: reduce)").addEventListener?.("change", () => applyLook(getState().settings));
// 尽早接住 beforeinstallprompt（它可能在 React 渲染前就触发）
initInstall();
// 词库与界面并行加载
loadWords().catch(() => {});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {bootError ? (
      <Rescue boot message={`错误信息：${bootError}`} />
    ) : (
      <AppBoundary>
        <RouterProvider router={router} />
      </AppBoundary>
    )}
  </React.StrictMode>,
);

if (import.meta.env.PROD) registerSW();

// 11.2 · 动态模块的预加载失败（发新版后旧文件没了 / 网络抖动）：Vite 会派发这个事件，
// 交给路由的错误页（「网络不好…重试」），不再冒成未处理的异常
window.addEventListener("vite:preloadError", (e) => {
  console.warn("preload failed", (e as Event & { payload?: unknown }).payload);
});

// 11.2 · 首页渲染完、空闲时把常用页面的代码块先拉下来：之后断网也能切到这些页面（SW 预缓存之外的第二道保险）
const warm = () => {
  for (const path of ["/study", "/words", "/stats", "/me"] as const) {
    const r = (router.routesByPath as unknown as Record<string, unknown>)[path];
    if (r) Promise.resolve(router.loadRouteChunk(r as never)).catch(() => {});
  }
};
window.addEventListener("load", () => {
  const ric = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  setTimeout(() => (ric ? ric(warm, { timeout: 4000 }) : warm()), 2500);
});
