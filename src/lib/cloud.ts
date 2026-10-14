/**
 * 13.0 · 账号与云同步（Meoo Cloud = Supabase）。按需加载：打开「账号」页或本机已登录时才引入。
 *
 *  - 没登录：一切照旧，localStorage 是唯一的数据源，离线可用。
 *  - 第一次登录：拉云端 → mergeCloud（每个词按最后作答时间，更晚的赢；其余记录取并集）→ 写回本机 → 把本机更新的上传。
 *  - 之后：本机每次改动 4 秒后增量上传；回到前台、联网时拉一次。失败不影响本机学习，下次再试。
 *  - 退出登录：本机记录保留（还是你的），只是不再同步。
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { AUTH_KEY, cloudConfig } from "./cloud-config";
import { changedRows, localRows, mergeCloud, metaOf, rowSig, type CardRow, type CloudSnapshot } from "./cloud-merge";
import { applyMerged, getState, subscribeState } from "./store";

export type SyncPhase = "off" | "signed-out" | "idle" | "syncing" | "error" | "offline";

export interface CloudStatus {
  phase: SyncPhase;
  email?: string;
  /** 上次同步成功（epoch 毫秒） */
  at?: number;
  message?: string;
  /** 上次同步：拉下来几个、传上去几个、按时间戳裁决几个 */
  last?: { pulled: number; pushed: number; conflicts: number; deleted?: number };
}

let status: CloudStatus = { phase: cloudConfig() ? "signed-out" : "off" };
const subs = new Set<() => void>();
const set = (p: Partial<CloudStatus>) => {
  status = { ...status, ...p };
  subs.forEach((f) => f());
};
export const getCloudStatus = () => status;
export function subscribeCloud(f: () => void) {
  subs.add(f);
  return () => void subs.delete(f);
}

let client: SupabaseClient | null = null;

export async function sb(): Promise<SupabaseClient> {
  if (client) return client;
  const cfg = cloudConfig();
  if (!cfg) throw new Error("云同步还没开通");
  const { createClient } = await import("@supabase/supabase-js");
  client = createClient(cfg.url, cfg.anonKey, {
    auth: { storageKey: AUTH_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

/** 把 Supabase 的英文错误换成一句中文 */
export function cnError(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e ?? "");
  if (/invalid login credentials/i.test(m)) return "邮箱或密码不对";
  if (/email not confirmed/i.test(m)) return "邮箱还没验证：先输入邮件里的验证码";
  if (/already registered|already exists/i.test(m)) return "这个邮箱已经注册过，直接登录就行";
  if (/token has expired|otp.*expired|expired/i.test(m)) return "验证码过期了，请重新发送";
  if (/invalid.*(token|otp)|token.*invalid/i.test(m)) return "验证码不对";
  if (/password.*(at least|short|weak)/i.test(m)) return "密码太短：至少 6 位";
  if (/rate limit|too many/i.test(m)) return "发得太频繁了，过一会儿再试";
  if (/failed to fetch|network|load failed|fetch failed/i.test(m)) return "连不上服务器：检查网络后再试";
  return m || "出错了，稍后再试";
}

// ---------------------------------------------------------------- 账号

export async function currentUser(): Promise<User | null> {
  const c = await sb();
  const { data } = await c.auth.getSession();
  return data.session?.user ?? null;
}

/** 注册第一步：邮箱 + 密码 → 发验证码到邮箱 */
export async function signUp(email: string, password: string) {
  const c = await sb();
  const { error } = await c.auth.signUp({ email, password });
  if (error) throw error;
}

/** 注册第二步：邮件里的 6 位验证码 */
export async function verifySignup(email: string, token: string) {
  const c = await sb();
  const { error } = await c.auth.verifyOtp({ email, token, type: "signup" });
  if (error) throw error;
  const { data, error: e2 } = await c.auth.getUser();
  if (e2 || !data.user) throw e2 ?? new Error("登录状态还没同步，请重试");
  await afterSignIn(data.user);
}

export async function signIn(email: string, password: string) {
  const c = await sb();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await afterSignIn(data.user);
}

export async function resend(email: string) {
  const c = await sb();
  const { error } = await c.auth.resend({ type: "signup", email });
  if (error) throw error;
}

/** 忘记密码：发 6 位找回码（不用链接） */
export async function sendRecovery(email: string) {
  const c = await sb();
  const { error } = await c.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

export async function resetPassword(email: string, token: string, password: string) {
  const c = await sb();
  const { error } = await c.auth.verifyOtp({ email, token, type: "recovery" });
  if (error) throw error;
  const { data, error: e2 } = await c.auth.getUser();
  if (e2 || !data.user) throw e2 ?? new Error("登录状态还没同步，请重试");
  const { error: e3 } = await c.auth.updateUser({ password });
  if (e3) throw e3;
  await afterSignIn(data.user);
}

export async function signOut() {
  stopAuto();
  try {
    const c = await sb();
    await c.auth.signOut();
  } catch {
    /* 离线也让本机退出 */
  }
  try {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(SYNCED_KEY);
  } catch {
    /* ignore */
  }
  set({ phase: "signed-out", email: undefined, at: undefined, last: undefined, message: undefined });
}

async function afterSignIn(user: User | null) {
  if (!user) return;
  set({ phase: "idle", email: user.email ?? undefined });
  await syncNow();
  startAuto();
}

// ---------------------------------------------------------------- 同步

/** 上次同步过的卡片签名（增量上传用），按账号分开存 */
const SYNCED_KEY = "cet4v-synced";

function loadSynced(uid: string): Map<string, string> {
  try {
    const o = JSON.parse(localStorage.getItem(SYNCED_KEY) || "{}") as { uid?: string; rows?: Record<string, string> };
    return o.uid === uid ? new Map(Object.entries(o.rows ?? {})) : new Map();
  } catch {
    return new Map();
  }
}

function saveSynced(uid: string, m: Map<string, string>) {
  try {
    localStorage.setItem(SYNCED_KEY, JSON.stringify({ uid, rows: Object.fromEntries(m) }));
  } catch {
    /* 存不下：下次全量比较 */
  }
}

const PAGE = 1000;

async function pullAll(c: SupabaseClient, uid: string): Promise<CloudSnapshot> {
  const { data: prof, error } = await c.from("vocab_profile").select("seed, meta").eq("user_id", uid).maybeSingle();
  if (error) throw error;
  const cards: CardRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error: e2 } = await c.from("vocab_cards").select("word, card, ts").eq("user_id", uid).range(from, from + PAGE - 1);
    if (e2) throw e2;
    for (const r of (data ?? []) as { word: string; card: CardRow["card"]; ts: number | string }[]) cards.push({ word: r.word, card: r.card, ts: Number(r.ts) });
    if (!data || data.length < PAGE) break;
  }
  return { seed: prof ? Number(prof.seed) : null, meta: (prof?.meta as CloudSnapshot["meta"]) ?? null, cards };
}

async function pushRows(c: SupabaseClient, rows: CardRow[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await c.rpc("vocab_push_cards", { rows: rows.slice(i, i + 500) });
    if (error) throw error;
  }
}

async function pushProfile(c: SupabaseClient, uid: string) {
  const st = getState();
  const { error } = await c.from("vocab_profile").upsert({ user_id: uid, seed: st.seed, meta: metaOf(st), updated_at: new Date().toISOString() });
  if (error) throw error;
}

let running: Promise<void> | null = null;

/** 拉 + 合并 + 推；同时只跑一个 */
export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      set({ phase: "offline", message: "离线中：联网后自动同步" });
      return;
    }
    const c = await sb();
    const user = await currentUser();
    if (!user) {
      set({ phase: "signed-out" });
      return;
    }
    set({ phase: "syncing", email: user.email ?? undefined, message: undefined });
    try {
      const snap = await pullAll(c, user.id);
      const m = mergeCloud(getState(), snap);
      if (JSON.stringify(m.state) !== JSON.stringify(getState())) applyMerged(m.state);
      await pushRows(c, m.push);
      if (m.profileDirty || m.push.length) await pushProfile(c, user.id);
      const synced = new Map(localRows(getState()).map((r) => [r.word, rowSig(r)]));
      saveSynced(user.id, synced);
      set({ phase: "idle", at: Date.now(), last: { pulled: m.pulled, pushed: m.push.length, conflicts: m.conflicts, deleted: m.deleted } });
    } catch (e) {
      set({ phase: "error", message: cnError(e) });
      throw e;
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** 增量：只推本机改过的卡片 + profile */
async function pushChanges() {
  if (running) return;
  const c = await sb();
  const user = await currentUser();
  if (!user) return;
  const synced = loadSynced(user.id);
  const rows = changedRows(getState(), synced);
  if (!rows.length) return;
  try {
    set({ phase: "syncing" });
    await pushRows(c, rows);
    await pushProfile(c, user.id);
    for (const r of rows) synced.set(r.word, rowSig(r));
    saveSynced(user.id, synced);
    set({ phase: "idle", at: Date.now(), last: { pulled: 0, pushed: rows.length, conflicts: 0 } });
  } catch (e) {
    set({ phase: navigator.onLine === false ? "offline" : "error", message: cnError(e) });
  }
}

let unsub: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const onVisible = () => document.visibilityState === "visible" && syncNow().catch(() => {});
const onOnline = () => syncNow().catch(() => {});

export function startAuto() {
  if (unsub) return;
  unsub = subscribeState(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void pushChanges(), 4000);
  });
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
}

function stopAuto() {
  unsub?.();
  unsub = null;
  if (timer) clearTimeout(timer);
  document.removeEventListener("visibilitychange", onVisible);
  window.removeEventListener("online", onOnline);
}

/** 启动时（本机登录过）：恢复会话、同步一次、开自动同步 */
export async function resume() {
  const user = await currentUser().catch(() => null);
  if (!user) {
    set({ phase: "signed-out" });
    return;
  }
  set({ phase: "idle", email: user.email ?? undefined });
  startAuto();
  await syncNow().catch(() => {});
}
