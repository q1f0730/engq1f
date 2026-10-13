import { useSyncExternalStore } from "react";
import { kill, unkill, type Card, type DayLog } from "./srs";
import { today } from "./clock";

export type Book = "all" | "core";
export type Order = "core" | "alpha" | "random";
export type Theme = "system" | "light" | "dark";

export interface Settings {
  book: Book;
  order: Order;
  daily: number;
  accent: "us" | "uk";
  autoplay: boolean;
  cnFirst: boolean;
  theme: Theme;
  /** 每日复习上限，0 = 不限 */
  reviewCap: number;
  /** 震动反馈 */
  haptics: boolean;
}

export interface AppState {
  v: 1;
  onboarded: boolean;
  settings: Settings;
  seed: number;
  cards: Record<string, Card>;
  star: Record<string, 1>;
  log: Record<string, DayLog>;
  checkins: string[];
  test?: { at: string; est: number };
  /** 明天再说：新词 → 搁置到哪天（这天之前不出现） */
  bury: Record<string, string>;
  /** 上次导出备份的日期 */
  lastBackup?: string;
  /** 备份提醒稍后再说：这天之前不提醒 */
  backupSnooze?: string;
}

export const DAILY_OPTIONS = [10, 20, 30, 50, 80, 100];
export const REVIEW_CAP_OPTIONS = [0, 50, 100, 200];
const KEY = "cet4v-state-v1";
export const THEME_KEY = "cet4v-theme";

export const defaultSettings = (): Settings => ({
  book: "all",
  order: "core",
  daily: 20,
  accent: "us",
  autoplay: true,
  cnFirst: false,
  theme: "system",
  reviewCap: 0,
  haptics: true,
});

export function initialState(): AppState {
  return {
    v: 1,
    onboarded: false,
    settings: defaultSettings(),
    seed: Math.floor(Math.random() * 1e9) + 1,
    cards: {},
    star: {},
    log: {},
    checkins: [],
    bury: {},
  };
}

/** 校验并补全（导入备份/读取旧数据） */
export function normalize(raw: unknown): AppState {
  if (!raw || typeof raw !== "object") throw new Error("备份格式不对");
  const r = raw as Partial<AppState>;
  if (r.cards && typeof r.cards !== "object") throw new Error("备份格式不对");
  const base = initialState();
  return {
    ...base,
    ...r,
    v: 1,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    cards: r.cards ?? {},
    star: r.star ?? {},
    log: r.log ?? {},
    checkins: Array.isArray(r.checkins) ? r.checkins : [],
    bury: r.bury && typeof r.bury === "object" ? r.bury : {},
    seed: typeof r.seed === "number" ? r.seed : base.seed,
  };
}

function read(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    /* 损坏的数据：从头开始 */
  }
  return initialState();
}

let state: AppState = read();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(THEME_KEY, state.settings.theme);
  } catch {
    /* 存储已满 */
  }
}

function commit(next: AppState) {
  state = next;
  persist();
  applyTheme(state.settings.theme);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useApp(): AppState {
  return useSyncExternalStore(subscribe, () => state);
}

export const getState = () => state;

// ---------------------------------------------------------------- theme

export function resolvedTheme(t: Theme): "light" | "dark" {
  if (t !== "system") return t;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(t: Theme) {
  const r = resolvedTheme(t);
  const el = document.documentElement;
  if (el.classList.contains(r)) return;
  el.classList.remove("light", "dark");
  el.classList.add(r);
  el.setAttribute("data-theme", r);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", r === "dark" ? "#16171d" : "#faf7f2");
}

// ---------------------------------------------------------------- actions

export function setSettings(patch: Partial<Settings>) {
  commit({ ...state, settings: { ...state.settings, ...patch } });
}

export function completeOnboarding(patch: Partial<Settings>) {
  commit({ ...state, onboarded: true, settings: { ...state.settings, ...patch } });
}

/** 一次回答：卡片 + 当日日志 */
export function applyAnswer(w: string, card: Card | undefined, day: string, log: DayLog | undefined) {
  const cards = { ...state.cards };
  if (card) cards[w] = card;
  else delete cards[w];
  const logs = { ...state.log };
  if (log) logs[day] = log;
  else delete logs[day];
  commit({ ...state, cards, log: logs });
}

export function toggleStar(w: string) {
  const star = { ...state.star };
  if (star[w]) delete star[w];
  else star[w] = 1;
  commit({ ...state, star });
}

export function killWord(w: string) {
  commit({ ...state, cards: { ...state.cards, [w]: kill(state.cards[w], today()) } });
}

export function unkillWord(w: string) {
  const c = state.cards[w];
  if (!c) return;
  commit({ ...state, cards: { ...state.cards, [w]: unkill(c, today()) } });
}

export function resetWord(w: string) {
  const cards = { ...state.cards };
  delete cards[w];
  commit({ ...state, cards });
}

export function batchKill(words: string[]) {
  const d = today();
  const cards = { ...state.cards };
  for (const w of words) cards[w] = kill(cards[w], d);
  commit({ ...state, cards });
}

/** 明天再说：新词记入搁置表；已有卡片的到期日由调用方改 */
export function setBury(w: string, until: string | undefined) {
  const bury = { ...state.bury };
  if (until) bury[w] = until;
  else delete bury[w];
  commit({ ...state, bury });
}

export function markBackedUp(day: string) {
  commit({ ...state, lastBackup: day });
}

export function snoozeBackup(until: string) {
  commit({ ...state, backupSnooze: until });
}

export function checkIn(day: string) {
  if (state.checkins.includes(day)) return;
  commit({ ...state, checkins: [...state.checkins, day].sort() });
}

export function saveTest(est: number) {
  commit({ ...state, test: { at: today(), est } });
}

export function exportBackup(): string {
  return JSON.stringify({ app: "cet4-vocab", version: 1, exportedAt: new Date().toISOString(), state }, null, 0);
}

export function importBackup(text: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON");
  }
  const p = parsed as { app?: string; state?: unknown };
  if (p?.app !== "cet4-vocab" || !p.state) throw new Error("这不是四级单词打卡的备份文件");
  const next = normalize(p.state);
  commit({ ...next, onboarded: true });
  return next;
}

export function resetAll() {
  commit(initialState());
}
