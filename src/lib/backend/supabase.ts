/** 13.0 · Meoo Cloud（Supabase）实现：就是 12.x→13.0 cloud.ts 里原来的那些调用，搬进适配层，行为不变 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_KEY, cloudConfig } from "../cloud-config";
import type { CardRow } from "../cloud-merge";
import type { Backend, Profile, SessionUser } from "./types";

let client: SupabaseClient | null = null;

async function sb(): Promise<SupabaseClient> {
  if (client) return client;
  const cfg = cloudConfig();
  if (!cfg || cfg.backend !== "supabase") throw new Error("云同步还没开通");
  const { createClient } = await import("@supabase/supabase-js");
  client = createClient(cfg.url, cfg.anonKey, {
    auth: { storageKey: AUTH_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

const toUser = (u: { id: string; email?: string | null } | null | undefined): SessionUser | null => (u ? { id: u.id, email: u.email ?? undefined } : null);

async function signedInUser(): Promise<SessionUser> {
  const c = await sb();
  const { data, error } = await c.auth.getUser();
  if (error || !data.user) throw error ?? new Error("登录状态还没同步，请重试");
  return toUser(data.user)!;
}

const PAGE = 1000;

export const backend: Backend = {
  kind: "supabase",
  async features() {
    return { signupCode: true, resetCode: true };
  },
  async session() {
    const c = await sb();
    const { data } = await c.auth.getSession();
    return toUser(data.session?.user);
  },
  async signUp(email, password) {
    const c = await sb();
    const { error } = await c.auth.signUp({ email, password });
    if (error) throw error;
    return { needsCode: true };
  },
  async verifySignup(email, token) {
    const c = await sb();
    const { error } = await c.auth.verifyOtp({ email, token, type: "signup" });
    if (error) throw error;
    return signedInUser();
  },
  async resend(email) {
    const c = await sb();
    const { error } = await c.auth.resend({ type: "signup", email });
    if (error) throw error;
  },
  async signIn(email, password) {
    const c = await sb();
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return toUser(data.user)!;
  },
  async signOut() {
    const c = await sb();
    await c.auth.signOut();
  },
  async sendRecovery(email) {
    const c = await sb();
    const { error } = await c.auth.resetPasswordForEmail(email);
    if (error) throw error;
  },
  async resetPassword(email, token, password) {
    const c = await sb();
    const { error } = await c.auth.verifyOtp({ email, token, type: "recovery" });
    if (error) throw error;
    const u = await signedInUser();
    const { error: e3 } = await c.auth.updateUser({ password });
    if (e3) throw e3;
    return u;
  },
  async pullCards(uid) {
    const c = await sb();
    const cards: CardRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await c.from("vocab_cards").select("word, card, ts").eq("user_id", uid).range(from, from + PAGE - 1);
      if (error) throw error;
      for (const r of (data ?? []) as { word: string; card: CardRow["card"]; ts: number | string }[]) cards.push({ word: r.word, card: r.card, ts: Number(r.ts) });
      if (!data || data.length < PAGE) break;
    }
    return cards;
  },
  async pushCards(rows) {
    const c = await sb();
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await c.rpc("vocab_push_cards", { rows: rows.slice(i, i + 500) });
      if (error) throw error;
    }
  },
  async getProfile(uid) {
    const c = await sb();
    const { data: prof, error } = await c.from("vocab_profile").select("seed, meta").eq("user_id", uid).maybeSingle();
    if (error) throw error;
    return prof ? ({ seed: Number(prof.seed), meta: (prof.meta as Profile["meta"]) ?? null } satisfies Profile) : null;
  },
  async putProfile(uid, p) {
    const c = await sb();
    const { error } = await c.from("vocab_profile").upsert({ user_id: uid, seed: p.seed, meta: p.meta, updated_at: new Date().toISOString() });
    if (error) throw error;
  },
};
