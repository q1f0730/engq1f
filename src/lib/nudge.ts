/**
 * v7 · 学习提醒（Notification API）与应用角标（Badging API）。
 * 没有后端推送：只有应用打开着、或在后台还活着的时候能到点提醒。
 */
import { useEffect } from "react";
import { now, today } from "./clock";
import { badgeCount, curStreak, reminderDue } from "./habit";
import { getState, type AppState } from "./store";

export const REMIND_KEY = "cet4v-remind-sent";

export const notifySupported = () => typeof window !== "undefined" && "Notification" in window;
export const notifyPermission = (): NotificationPermission | "unsupported" => (notifySupported() ? Notification.permission : "unsupported");

/** 申请通知权限；拿到返回 true */
export async function askNotify(): Promise<boolean> {
  if (!notifySupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** 发一条通知：优先走 service worker（安卓 Chrome 只认这个），不行再用页面通知 */
export async function notify(title: string, body: string): Promise<boolean> {
  if (!notifySupported() || Notification.permission !== "granted") return false;
  const opts: NotificationOptions = { body, icon: "icon.svg", tag: "cet4v-remind" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, opts);
      return true;
    }
  } catch {
    /* 退回页面通知 */
  }
  try {
    new Notification(title, opts);
    return true;
  } catch {
    return false;
  }
}

function lastSent(): string | null {
  try {
    return localStorage.getItem(REMIND_KEY);
  } catch {
    return null;
  }
}

/** 检查一次：到点、没打卡、今天没提醒过 → 发通知 */
export async function checkReminder(st: AppState = getState()): Promise<boolean> {
  const day = today();
  if (!st.onboarded || !reminderDue(new Date(now()), st.settings.remindAt, lastSent(), st.checkins.includes(day), day)) return false;
  if (notifyPermission() !== "granted") return false;
  const s = curStreak(st, day);
  const ok = await notify("该背单词了", s > 0 ? `已经连续 ${s} 天，今天还没打卡，别断了` : "今天还没打卡，花 10 分钟把单词背完吧");
  if (ok) {
    try {
      localStorage.setItem(REMIND_KEY, day);
    } catch {
      /* ignore */
    }
  }
  return ok;
}

/** 应用打开期间每 30 秒检查一次提醒，切回前台时也检查 */
export function useReminder(remindAt: string, onboarded: boolean) {
  useEffect(() => {
    if (!remindAt || !onboarded) return;
    const tick = () => void checkReminder();
    tick();
    const id = window.setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [remindAt, onboarded]);
}

type BadgeNav = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

export const badgeSupported = () => typeof navigator !== "undefined" && typeof (navigator as BadgeNav).setAppBadge === "function";

/** 在图标上显示待复习数；0 或关闭时清掉 */
export function syncAppBadge(st: AppState = getState()) {
  const nav = navigator as BadgeNav;
  if (!badgeSupported()) return;
  const day = today();
  const n = st.onboarded && st.settings.appBadge !== false ? badgeCount(st.cards, day, st.settings.reviewCap ?? 0, st.log[day]?.r ?? 0) : 0;
  try {
    const p = n > 0 ? nav.setAppBadge!(n) : nav.clearAppBadge ? nav.clearAppBadge() : nav.setAppBadge!(0);
    p?.catch?.(() => {});
  } catch {
    /* 不支持 */
  }
}

export function useAppBadge(st: AppState) {
  useEffect(() => {
    syncAppBadge(st);
    const onVis = () => document.visibilityState === "visible" && syncAppBadge();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [st.cards, st.log, st.settings.reviewCap, st.settings.appBadge, st.onboarded]);
}
