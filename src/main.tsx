import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { applyLook, applyTheme, getState } from "./lib/store";
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
    <RouterProvider router={router} />
  </React.StrictMode>,
);

if (import.meta.env.PROD) registerSW();
