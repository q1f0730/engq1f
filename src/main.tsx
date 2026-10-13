import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { applyTheme, getState } from "./lib/store";
import { loadWords } from "./lib/data";
import { registerSW } from "./lib/sw";
import "./styles.css";

const router = getRouter();
applyTheme(getState().settings.theme);
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme(getState().settings.theme));
// 词库与界面并行加载
loadWords().catch(() => {});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);

if (import.meta.env.PROD) registerSW();
