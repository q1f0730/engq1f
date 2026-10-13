import { useEffect, useState } from "react";
import { diffDays } from "./srs";
import type { AppState } from "./store";

/**
 * 数据安全：申请持久化存储（避免浏览器在空间紧张时清掉 localStorage），
 * 以及「多久没备份了」的提醒判定。
 */
export type PersistState = "persisted" | "best-effort" | "unsupported";

let asked: Promise<PersistState> | null = null;

export function requestPersist(): Promise<PersistState> {
  if (asked) return asked;
  const s = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!s?.persist || !s.persisted) {
    asked = Promise.resolve("unsupported");
    return asked;
  }
  asked = s
    .persisted()
    .then((p) => (p ? true : s.persist()))
    .then((p) => (p ? "persisted" : "best-effort") as PersistState)
    .catch(() => "unsupported" as PersistState);
  return asked;
}

export function usePersist(): PersistState | null {
  const [st, setSt] = useState<PersistState | null>(null);
  useEffect(() => {
    let alive = true;
    requestPersist().then((v) => alive && setSt(v));
    return () => {
      alive = false;
    };
  }, []);
  return st;
}

export const BACKUP_EVERY = 7;
export const BACKUP_MIN_CARDS = 10;
/** 11.3 · 从没备份过：学满 3 天或 50 个词就第一次提醒（不用等 7 天） */
export const FIRST_BACKUP_DAYS = 3;
export const FIRST_BACKUP_WORDS = 50;

/** 需要提醒备份时返回「多少天没备份」，否则 null */
export function backupDue(st: Pick<AppState, "cards" | "lastBackup" | "backupSnooze"> & { log?: AppState["log"] }, day: string): number | null {
  const cards = Object.values(st.cards);
  if (cards.length < BACKUP_MIN_CARDS) return null;
  if (st.backupSnooze && st.backupSnooze > day) return null;
  const ref = st.lastBackup ?? cards.reduce((m, c) => (c.f < m ? c.f : m), day);
  const n = diffDays(ref, day);
  if (n >= BACKUP_EVERY) return n;
  if (!st.lastBackup) {
    const days = Object.values(st.log ?? {}).filter((l) => l.n + l.r > 0).length;
    if (days >= FIRST_BACKUP_DAYS || cards.length >= FIRST_BACKUP_WORDS) return n;
  }
  return null;
}
