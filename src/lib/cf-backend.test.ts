/**
 * 13.0.0 · Cloudflare 后端：服务端裁决规则（server/merge.ts）、真 SQL（migrations/d1 + PUSH_SQL 跑在 SQLite 上，D1 就是 SQLite）、
 * API（server/api.ts，用 node:sqlite 做的 D1 替身）、前端适配层（backend/cloudflare.ts 直接打到同一个 API）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handle, LIMITS, rowsOf, signJwt, verifyJwt, type D1, type D1Stmt, type Env } from "../../server/api";
import { dedupe, PUSH_SQL, wins } from "../../server/merge";

// vite 不认识 node:sqlite（Node 22.13+ 才有、没在 builtinModules 里），用 require 绕开
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

const MIG = new URL("../../migrations/d1/", import.meta.url);

/** D1 的替身：同样的 SQLite 方言、?N 参数、batch 原子 */
function fakeD1(): D1 & { db: InstanceType<typeof DatabaseSync> } {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const f of readdirSync(MIG).filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(f, MIG), "utf8"));
  const stmt = (q: string, args: unknown[] = []): D1Stmt & { exec(): { meta: { changes: number } } } => {
    const norm = () => args.map((a) => (a === undefined ? null : typeof a === "boolean" ? Number(a) : a)) as (string | number | null)[];
    return {
      bind: (...v: unknown[]) => stmt(q, v),
      first: async <T,>() => (db.prepare(q).get(...norm()) as T) ?? null,
      all: async <T,>() => ({ results: db.prepare(q).all(...norm()) as T[] }),
      run: async () => ({ meta: { changes: Number(db.prepare(q).run(...norm()).changes) } }),
      exec: () => ({ meta: { changes: Number(db.prepare(q).run(...norm()).changes) } }),
    };
  };
  return {
    db,
    prepare: (q) => stmt(q),
    batch: async (list) => {
      db.exec("BEGIN");
      try {
        const out = list.map((s) => (s as ReturnType<typeof stmt>).exec());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

const SECRET = "unit-test-secret-0123456789abcdef-q1f730";
let env: Env & { DB: ReturnType<typeof fakeD1> };
beforeEach(() => {
  env = { DB: fakeD1(), JWT_SECRET: SECRET };
});

async function api(method: string, path: string, body?: unknown, token?: string, ip = "203.0.113.7") {
  const headers: Record<string, string> = { "cf-connecting-ip": ip };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await handle(new Request(`https://watercoloreyes.cn/api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
const signup = async (email: string, password = "secret-730") => (await api("POST", "auth/signup", { email, password })).body.token as string;

describe("server merge rule (later ts wins, tombstone wins ties)", () => {
  it("wins()", () => {
    expect(wins(null, { card: "{}", ts: 1 })).toBe(true);
    expect(wins({ card: "{}", ts: 5 }, { card: "{}", ts: 6 })).toBe(true);
    expect(wins({ card: "{}", ts: 5 }, { card: "{}", ts: 4 })).toBe(false);
    expect(wins({ card: null, ts: 5 }, { card: "{}", ts: 6 })).toBe(true); // 删掉以后又学了：新卡片更晚，照常
    expect(wins({ card: "{}", ts: 5 }, { card: null, ts: 5 })).toBe(true); // 同一时刻：删除赢
    expect(wins({ card: null, ts: 5 }, { card: "{}", ts: 5 })).toBe(false);
    expect(wins({ card: "{}", ts: 5 }, { card: '{"i":9}', ts: 5 })).toBe(false); // 同一时刻两张卡：留已有的（重复推送不改东西）
    expect(wins({ card: null, ts: 5 }, { card: null, ts: 5 })).toBe(false);
  });
  it("dedupe() keeps the winner when one batch has the same word twice", () => {
    expect(dedupe([{ word: "a", card: "{}", ts: 2 }, { word: "a", card: null, ts: 2 }, { word: "a", card: "{}", ts: 1 }])).toEqual([{ word: "a", card: null, ts: 2 }]);
  });
  it("PUSH_SQL applies the same rule inside SQLite (D1)", () => {
    const db = env.DB.db;
    db.prepare("INSERT INTO users (id, email, pw_hash, pw_salt, pw_iter, created_at) VALUES ('u1', 'u1@x.test', '', '', 1, 0)").run();
    const push = (word: string, card: string | null, ts: number) => Number(db.prepare(PUSH_SQL).run("u1", word, card, ts, 0).changes);
    const get = (word: string) => db.prepare("SELECT card, ts FROM cards WHERE user_id = 'u1' AND word = ?").get(word) as { card: string | null; ts: number };
    expect(push("w", '{"i":1}', 10)).toBe(1);
    expect(push("w", '{"i":0}', 9)).toBe(0); // 旧设备晚到：不覆盖
    expect(get("w")).toEqual({ card: '{"i":1}', ts: 10 });
    expect(push("w", null, 10)).toBe(1); // 同一时刻删除：墓碑赢
    expect(get("w")).toEqual({ card: null, ts: 10 });
    expect(push("w", '{"i":2}', 10)).toBe(0); // 同一时刻的卡片不能复活
    expect(push("w", '{"i":3}', 11)).toBe(1); // 更晚又学了：复活
    expect(get("w")).toEqual({ card: '{"i":3}', ts: 11 });
    expect(push("w", '{"i":3}', 11)).toBe(0); // 幂等
  });
  it("rowsOf() validates rows", () => {
    expect(rowsOf([{ word: "abandon", card: { i: 1 }, ts: 5 }, { word: "x", card: null, ts: 0 }])).toEqual([
      { word: "abandon", card: '{"i":1}', ts: 5 },
      { word: "x", card: null, ts: 0 },
    ]);
    for (const bad of [[{ word: "", card: null, ts: 1 }], [{ word: "a".repeat(65), card: null, ts: 1 }], [{ word: "a", card: null, ts: 1.5 }], [{ word: "a", card: [1], ts: 1 }], [{ word: "a", card: { x: "y".repeat(5000) }, ts: 1 }], {}])
      expect(() => rowsOf(bad)).toThrow();
    expect(() => rowsOf(Array.from({ length: 501 }, (_, i) => ({ word: `w${i}`, card: null, ts: 1 })))).toThrow();
  });
});

describe("Cloudflare API (server/api.ts on a D1 stand-in)", () => {
  it("signup → session → push → pull; passwords are PBKDF2 with a per-user salt", async () => {
    const t = await signup("A@Example.com");
    expect(t).toMatch(/^ey/);
    const s = await api("GET", "auth/session", undefined, t);
    expect(s.body.user.email).toBe("a@example.com");
    const u = env.DB.db.prepare("SELECT pw_hash, pw_salt, pw_iter FROM users").get() as { pw_hash: string; pw_salt: string; pw_iter: number };
    expect(u.pw_iter).toBe(100_000);
    expect(u.pw_hash).not.toContain("secret");
    await signup("b@example.com", "secret-730");
    const salts = env.DB.db.prepare("SELECT pw_salt, pw_hash FROM users").all() as { pw_salt: string; pw_hash: string }[];
    expect(salts[0].pw_salt).not.toBe(salts[1].pw_salt);
    expect(salts[0].pw_hash).not.toBe(salts[1].pw_hash); // 同一个密码，不同的盐 → 不同的哈希
    const w = await api("POST", "cards", { rows: [{ word: "abandon", card: { i: 3 }, ts: 100 }, { word: "absorb", card: null, ts: 90 }] }, t);
    expect(w.body.written).toBe(2);
    const p = await api("GET", "cards", undefined, t);
    expect(p.body.rows).toEqual([
      { word: "abandon", card: { i: 3 }, ts: 100 },
      { word: "absorb", card: null, ts: 90 },
    ]);
    expect((await api("POST", "auth/signup", { email: "a@example.com", password: "whatever-1" })).body.error).toBe("email_taken");
  });

  it("login: right / wrong password, and the per-email rate limit (also blocks the right password)", async () => {
    await signup("c@example.com", "right-pass-730");
    const ok = await api("POST", "auth/login", { email: "c@example.com", password: "right-pass-730" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe("c@example.com");
    for (let i = 0; i < LIMITS.login.email; i++) expect((await api("POST", "auth/login", { email: "c@example.com", password: "wrong" })).body.error).toBe("invalid_credentials");
    const blocked = await api("POST", "auth/login", { email: "c@example.com", password: "right-pass-730" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("rate_limited");
    expect(blocked.body.retryAfter).toBeGreaterThan(0);
    // 别的邮箱不受影响
    await signup("d@example.com");
    expect((await api("POST", "auth/login", { email: "d@example.com", password: "secret-730" })).status).toBe(200);
    // 不存在的邮箱：同样的错误（不泄露是否注册过）
    expect((await api("POST", "auth/login", { email: "nobody@example.com", password: "x" })).body.error).toBe("invalid_credentials");
  });

  it("every query is scoped to the token's user: B cannot read or overwrite A", async () => {
    const a = await signup("a@example.com");
    const b = await signup("b@example.com");
    await api("POST", "cards", { rows: [{ word: "abandon", card: { i: 3 }, ts: 100 }] }, a);
    await api("PUT", "profile", { seed: 730, meta: { star: { abandon: 1 } } }, a);
    expect((await api("GET", "cards", undefined, b)).body.rows).toEqual([]);
    expect((await api("GET", "profile", undefined, b)).body.profile).toBeNull();
    // 请求体里塞 user_id 也没用
    await api("POST", "cards", { rows: [{ word: "abandon", card: { i: 0 }, ts: 999, user_id: "x" }], user_id: "x" }, b);
    expect((await api("GET", "cards", undefined, a)).body.rows[0].card).toEqual({ i: 3 });
    expect((await api("GET", "profile", undefined, a)).body.profile).toEqual({ seed: 730, meta: { star: { abandon: 1 } } });
  });

  it("logout revokes the session; forged / tampered / expired tokens are rejected", async () => {
    const t = await signup("e@example.com");
    expect((await api("POST", "auth/logout", {}, t)).status).toBe(200);
    expect((await api("GET", "cards", undefined, t)).status).toBe(401);
    const t2 = (await api("POST", "auth/login", { email: "e@example.com", password: "secret-730" })).body.token as string;
    const [h, p, s] = t2.split(".");
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    const evil = Buffer.from(JSON.stringify({ ...claims, sub: "someone-else" })).toString("base64url");
    expect((await api("GET", "cards", undefined, `${h}.${evil}.${s}`)).status).toBe(401);
    expect((await api("GET", "cards", undefined, await signJwt(claims, "another-secret-another-secret-123456"))).status).toBe(401);
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${p}.`;
    expect((await api("GET", "cards", undefined, none)).status).toBe(401);
    expect(await verifyJwt(await signJwt({ ...claims, exp: 1 }, SECRET), SECRET)).toBeNull();
    expect((await api("GET", "cards", undefined, t2)).status).toBe(200);
  });

  it("input validation and config errors", async () => {
    expect((await api("POST", "auth/signup", { email: "not-an-email", password: "secret-730" })).body.error).toBe("bad_email");
    expect((await api("POST", "auth/signup", { email: "f@example.com", password: "123" })).body.error).toBe("weak_password");
    const t = await signup("f@example.com");
    expect((await api("POST", "cards", { rows: [{ word: "", card: null, ts: 1 }] }, t)).status).toBe(400);
    expect((await api("PUT", "profile", { seed: "x" }, t)).status).toBe(400);
    expect((await api("DELETE", "cards", undefined, t)).status).toBe(405);
    expect((await api("GET", "nope")).status).toBe(404);
    // 没配邮件服务：找回码是桩，明确说要邮件服务
    const fg = await api("POST", "auth/forgot", { email: "f@example.com" });
    expect(fg.status).toBe(501);
    expect(fg.body.error).toBe("no_mail");
    expect((await api("GET", "auth/config")).body.resetCode).toBe(false);
    env.JWT_SECRET = "short";
    expect((await api("POST", "auth/login", { email: "f@example.com", password: "secret-730" })).body.error).toBe("server_config");
  });

  it("forgot / reset with RESEND_API_KEY: code goes out through Resend, resets the password, revokes old sessions", async () => {
    env.RESEND_API_KEY = "re_test";
    const old = await signup("g@example.com");
    let sent = "";
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
      sent = String(init?.body ?? "");
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      expect((await api("GET", "auth/config")).body.resetCode).toBe(true);
      expect((await api("POST", "auth/forgot", { email: "g@example.com" })).body.ok).toBe(true);
      const code = /(\d{6})/.exec(JSON.parse(sent).subject)![1];
      expect((await api("POST", "auth/reset", { email: "g@example.com", code: code === "000000" ? "111111" : "000000", password: "new-pass-730" })).body.error).toBe("bad_code");
      const r = await api("POST", "auth/reset", { email: "g@example.com", code, password: "new-pass-730" });
      expect(r.status).toBe(200);
      expect((await api("GET", "cards", undefined, old)).status).toBe(401);
      expect((await api("POST", "auth/login", { email: "g@example.com", password: "new-pass-730" })).status).toBe(200);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("frontend adapter (backend/cloudflare.ts) against the same API", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    vi.stubGlobal("location", { href: "https://watercoloreyes.cn/#/account" });
    vi.stubGlobal("window", {});
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => handle(new Request(url, init), env));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sign up (no code) → push → pull → profile → sign out; errors come back in Chinese", async () => {
    const { backend } = await import("./backend/cloudflare");
    expect(await backend.features()).toEqual({ signupCode: false, resetCode: false });
    expect(await backend.session()).toBeNull();
    expect(await backend.signUp("h@example.com", "secret-730")).toEqual({ needsCode: false });
    const u = await backend.session();
    expect(u?.email).toBe("h@example.com");
    expect(JSON.parse(store.get("cet4v-auth")!).token).toMatch(/^ey/);
    const rows = Array.from({ length: 1203 }, (_, i) => ({ word: `w${String(i).padStart(4, "0")}`, card: i % 7 ? ({ i } as never) : null, ts: 1000 + i }));
    await backend.pushCards(rows); // 分 3 批（每批 ≤ 500）
    const back = await backend.pullCards(u!.id); // 分页（每页 1000）
    expect(back.length).toBe(1203);
    expect(back[7]).toEqual({ word: "w0007", card: null, ts: 1007 });
    expect(back[8]).toEqual({ word: "w0008", card: { i: 8 }, ts: 1008 });
    expect(await backend.getProfile(u!.id)).toBeNull();
    await backend.putProfile(u!.id, { seed: 42, meta: { checkins: ["2026-10-14"] } as never });
    expect(await backend.getProfile(u!.id)).toEqual({ seed: 42, meta: { checkins: ["2026-10-14"] } });
    await backend.signOut();
    expect(store.has("cet4v-auth")).toBe(false);
    await expect(backend.pullCards(u!.id)).rejects.toMatchObject({ code: "unauthorized" });
    await expect(backend.signIn("h@example.com", "wrong-pass")).rejects.toMatchObject({ code: "invalid_credentials", message: "邮箱或密码不对" });
    await expect(backend.signUp("h@example.com", "secret-730")).rejects.toMatchObject({ code: "email_taken" });
    await expect(backend.sendRecovery("h@example.com")).rejects.toMatchObject({ code: "no_mail" });
  });

  it("a revoked session (401) clears the local session", async () => {
    const { backend } = await import("./backend/cloudflare");
    const u = await backend.signIn("h2@example.com", "secret-730").catch(async () => (await backend.signUp("h2@example.com", "secret-730"), backend.session()));
    expect(u).toBeTruthy();
    env.DB.db.exec("UPDATE sessions SET revoked = 1");
    await expect(backend.getProfile("x")).rejects.toMatchObject({ code: "unauthorized", status: 401 });
    expect(await backend.session()).toBeNull();
  });

  it("rate limit message says how many minutes to wait", async () => {
    const { backend } = await import("./backend/cloudflare");
    for (let i = 0; i < LIMITS.login.email; i++) await backend.signIn("nobody@example.com", "x").catch(() => {});
    await expect(backend.signIn("nobody@example.com", "x")).rejects.toMatchObject({ code: "rate_limited", message: expect.stringMatching(/\d+ 分钟后再试/) });
  });
});

describe("loadBackend picks the build-time backend", () => {
  it("this build's backend module exports the same interface", async () => {
    const sb = await import("./backend/supabase");
    const cf = await import("./backend/cloudflare");
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(cf.backend)).toEqual(keys(sb.backend));
    expect(sb.backend.kind).toBe("supabase");
    expect(cf.backend.kind).toBe("cloudflare");
  });
});
