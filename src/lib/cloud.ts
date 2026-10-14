/**
 * 13.0 · 账号与云同步。按需加载：打开「账号」页或本机已登录时才引入。
 * 13.0.0 · 背后是哪个后端由适配层决定（backend/：supabase = Meoo Cloud，cloudflare = Pages Functions + D1），这里只管合并和何时同步。
 *
 *  - 没登录：一切照旧，localStorage 是唯一的数据源，离线可用。
 *  - 第一次登录：拉云端 → mergeCloud（每个词按最后作答时间，更晚的赢；其余记录取并集）→ 写回本机 → 把本机更新的上传。
 *  - 之后：本机每次改动 4 秒后增量上传；回到前台、联网时拉一次。失败不影响本机学习，下次再试。
 *  - 退出登录：本机记录保留（还是你的），只是不再同步。
 */
import { AUTH_KEY, cloudConfig } from "./cloud-config";
import { changedRows, localRows, mergeCloud, metaOf, rowSig, type CardRow, type CloudSnapshot } from "./cloud-merge";
import { applyMerged, getState, subscribeState } from "./store";
import { loadBackend, type Backend, type BackendFeatures, type SessionUser } from "./backend";

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

/** 13.0.0 · 后端适配层（supabase / cloudflare，构建时选，懒加载） */
const be = (): Promise<Backend> => loadBackend();

/** 这个站点的账号能力：注册要不要验证码、能不能发找回码 */
export async function features(): Promise<BackendFeatures> {
  return (await be()).features();
}

/** 把后端的英文错误换成一句中文（cloudflare 后端自己已经给了中文） */
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

const isUnauthorized = (e: unknown) => (e as { code?: string })?.code === "unauthorized";

// ---------------------------------------------------------------- 账号

export async function currentUser(): Promise<SessionUser | null> {
  return (await be()).session();
}

/** 注册：supabase 先发验证码到邮箱（needsCode）；cloudflare 注册即登录 */
export async function signUp(email: string, password: string): Promise<{ needsCode: boolean }> {
  const b = await be();
  const r = await b.signUp(email, password);
  if (!r.needsCode) await afterSignIn(await b.session());
  return r;
}

/** 注册第二步：邮件里的 6 位验证码 */
export async function verifySignup(email: string, token: string) {
  await afterSignIn(await (await be()).verifySignup(email, token));
}

export async function signIn(email: string, password: string) {
  await afterSignIn(await (await be()).signIn(email, password));
}

export async function resend(email: string) {
  await (await be()).resend(email);
}

/** 忘记密码：发 6 位找回码（不用链接） */
export async function sendRecovery(email: string) {
  await (await be()).sendRecovery(email);
}

export async function resetPassword(email: string, token: string, password: string) {
  await afterSignIn(await (await be()).resetPassword(email, token, password));
}

export async function signOut() {
  stopAuto();
  try {
    await (await be()).signOut();
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

async function afterSignIn(user: SessionUser | null) {
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

async function pullAll(b: Backend, uid: string): Promise<CloudSnapshot> {
  const prof = await b.getProfile(uid);
  const cards: CardRow[] = await b.pullCards(uid);
  return { seed: prof ? prof.seed : null, meta: prof?.meta ?? null, cards };
}

async function pushRows(b: Backend, rows: CardRow[]) {
  if (rows.length) await b.pushCards(rows);
}

async function pushProfile(b: Backend, uid: string) {
  const st = getState();
  await b.putProfile(uid, { seed: st.seed, meta: metaOf(st) });
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
    const c = await be();
    const user = await c.session();
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
      // 会话被服务端吊销 / 过期（cloudflare 后端已经清掉本机会话）：回到登录
      if (isUnauthorized(e)) set({ phase: "signed-out", email: undefined, message: cnError(e) });
      else set({ phase: "error", message: cnError(e) });
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
  const c = await be();
  const user = await c.session();
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
    if (isUnauthorized(e)) set({ phase: "signed-out", email: undefined, message: cnError(e) });
    else set({ phase: navigator.onLine === false ? "offline" : "error", message: cnError(e) });
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
