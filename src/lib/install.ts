/**
 * v8 · 安装引导：接住 beforeinstallprompt，等用户点「添加到桌面」时再弹系统安装框。
 * 安装成功（appinstalled）后记下来，卡片永不再出现。
 */
import { useSyncExternalStore } from "react";
import { markInstalled } from "./store";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallEvent | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let inited = false;

export function initInstall() {
  if (inited || typeof window === "undefined") return;
  inited = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    markInstalled();
    emit();
  });
}

/** 是否已经以桌面应用（独立窗口）打开 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function useInstallPrompt(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => deferred !== null,
  );
}

/** 弹出系统安装框；返回用户的选择（没有可用的安装事件时返回 null） */
export async function promptInstall(): Promise<"accepted" | "dismissed" | null> {
  const e = deferred;
  if (!e) return null;
  // 一个事件只能 prompt 一次
  deferred = null;
  emit();
  try {
    await e.prompt();
    const c = await e.userChoice;
    if (c.outcome === "accepted") markInstalled();
    return c.outcome;
  } catch {
    return null;
  }
}
