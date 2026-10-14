/**
 * 13.0.0 · Cloudflare 站点（watercoloreyes.cn）的 API：Pages Functions（functions/api/[[route]].ts 只是把请求转到这里）+ D1。
 * 和 Meoo 站点的账号 / 数据完全独立。
 *
 *  GET  /api/auth/config            { resetCode }：配了 RESEND_API_KEY 才有找回码
 *  POST /api/auth/signup            { email, password } → { token, user, exp }（注册即登录：没有邮件服务，不发验证码）
 *  POST /api/auth/login             { email, password } → { token, user, exp }；失败按邮箱 / IP 限流
 *  POST /api/auth/logout            吊销当前会话
 *  GET  /api/auth/session           { user }
 *  POST /api/auth/forgot            { email } → 发 6 位找回码（Resend）；没配邮件服务 → 501 no_mail
 *  POST /api/auth/reset             { email, code, password } → { token, user, exp }；吊销该用户所有旧会话
 *  GET  /api/cards?offset&limit     { rows: [{ word, card|null, ts }] }
 *  POST /api/cards                  { rows } → { written }：服务端裁决（server/merge.ts：ts 更晚的赢，ts 相同墓碑赢）
 *  GET  /api/profile                { profile: { seed, meta } | null }
 *  PUT  /api/profile                { seed, meta }
 *
 * 安全：
 *  - 密码：PBKDF2-SHA256（WebCrypto），每个用户 16 字节随机盐，100000 次迭代（Workers 的 WebCrypto 允许的上限），常数时间比较。
 *  - 会话：HS256 JWT（env.JWT_SECRET，≥ 32 字符），带 jti；D1 sessions 表里记着，退出 / 改密码即吊销，每次请求都核对。
 *  - 「RLS」：每条读写 cards / profile 的查询都是 WHERE user_id = ?，这个 ? 只来自验证过的会话（不读请求体里的 user_id）。
 *  - 输入校验：邮箱格式 / 长度、密码 6–128 位、词 1–64 字符、ts 是安全整数、单张卡片 JSON ≤ 4KB、一批 ≤ 500 行、请求体 ≤ 1.5MB。
 *  - 只认同域请求（不发 CORS 头）；会话放在 Authorization 头里，不用 cookie，所以没有 CSRF。
 */
import { dedupe, PUSH_SQL, type Row } from "./merge";

// ------------------------------------------------------------------ D1 的最小类型（不依赖 @cloudflare/workers-types）
export interface D1Stmt {
  bind(...v: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}
export interface D1 {
  prepare(q: string): D1Stmt;
  batch(s: D1Stmt[]): Promise<{ meta?: { changes?: number } }[]>;
}
export interface Env {
  DB: D1;
  JWT_SECRET?: string;
  RESEND_API_KEY?: string;
  /** 找回码的发件人，例如 "四级单词打卡 <noreply@watercoloreyes.cn>"（域名要在 Resend 验证过） */
  MAIL_FROM?: string;
}

export const PBKDF2_ITER = 100_000;
const SESSION_DAYS = 30;
const MAX_BODY = 1_500_000;
const MAX_CARD = 4096;
const MAX_META = 1_000_000;
const MAX_ROWS = 500;
const PAGE_MAX = 1000;
/** 限流：窗口内的次数上限 */
export const LIMITS = {
  login: { win: 15 * 60_000, email: 5, ip: 30 },
  signup: { win: 60 * 60_000, email: 5, ip: 10 },
  forgot: { win: 15 * 60_000, email: 3, ip: 10 },
  reset: { win: 15 * 60_000, email: 5, ip: 20 },
} as const;
type Kind = keyof typeof LIMITS;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// eslint-disable-next-line no-control-regex
const WORD_RE = /^[^\u0000-\u001f\u007f]{1,64}$/;

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers },
  });

// ------------------------------------------------------------------ 编码 / 加密小工具
const enc = new TextEncoder();
function b64(u: Uint8Array): string {
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function sha256(s: string): Promise<string> {
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
}

/** 常数时间比较（长度不同直接 false，长度不是秘密） */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export async function hashPassword(password: string, salt: Uint8Array, iter = PBKDF2_ITER): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter }, key, 256);
  return new Uint8Array(bits);
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function secretOf(env: Env): string {
  const s = env.JWT_SECRET ?? "";
  if (s.length < 32) throw new HttpError(500, "server_config", { message: "JWT_SECRET is missing or shorter than 32 characters" });
  return s;
}

export async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const head = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<{ sub: string; jti: string; email?: string; exp: number } | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const head = JSON.parse(new TextDecoder().decode(unb64url(parts[0]))) as { alg?: string };
    if (head.alg !== "HS256") return null;
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), unb64url(parts[2]) as BufferSource, enc.encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64url(parts[1]))) as { sub?: string; jti?: string; email?: string; exp?: number };
    if (!p.sub || !p.jti || typeof p.exp !== "number" || p.exp * 1000 < Date.now()) return null;
    return { sub: p.sub, jti: p.jti, email: p.email, exp: p.exp };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ 输入
async function body(req: Request): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY) throw new HttpError(413, "too_large");
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, "too_large");
  try {
    const v = JSON.parse(text || "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "bad_request");
  }
}

function emailOf(v: unknown): string {
  const e = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!e || e.length > 254 || !EMAIL_RE.test(e)) throw new HttpError(400, "bad_email");
  return e;
}

function passwordOf(v: unknown): string {
  if (typeof v !== "string" || v.length < 6) throw new HttpError(400, "weak_password");
  if (v.length > 128) throw new HttpError(400, "bad_request", { message: "password longer than 128 characters" });
  return v;
}

export function rowsOf(v: unknown): Row[] {
  if (!Array.isArray(v) || v.length > MAX_ROWS) throw new HttpError(400, "bad_request", { message: `rows must be an array of at most ${MAX_ROWS}` });
  return v.map((r) => {
    const o = r as { word?: unknown; card?: unknown; ts?: unknown };
    if (!o || typeof o !== "object" || typeof o.word !== "string" || !WORD_RE.test(o.word)) throw new HttpError(400, "bad_request", { message: "bad word" });
    if (typeof o.ts !== "number" || !Number.isSafeInteger(o.ts) || o.ts < 0) throw new HttpError(400, "bad_request", { message: "bad ts" });
    let card: string | null = null;
    if (o.card !== null && o.card !== undefined) {
      if (typeof o.card !== "object" || Array.isArray(o.card)) throw new HttpError(400, "bad_request", { message: "card must be an object or null" });
      card = JSON.stringify(o.card);
      if (card.length > MAX_CARD) throw new HttpError(413, "too_large");
    }
    return { word: o.word, card, ts: o.ts };
  });
}

const ipOf = (req: Request) => req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "local";

// ------------------------------------------------------------------ 限流（D1 里的滑动窗口）
async function limited(env: Env, kind: Kind, email: string | null, ip: string, now: number): Promise<number> {
  const L = LIMITS[kind];
  const since = now - L.win;
  const checks: [string, number][] = [[`ip:${ip}`, L.ip]];
  if (email) checks.push([`e:${email}`, L.email]);
  for (const [key, max] of checks) {
    const r = await env.DB.prepare("SELECT count(*) AS n, min(at) AS first FROM auth_attempts WHERE kind = ?1 AND key = ?2 AND at > ?3").bind(kind, key, since).first<{ n: number; first: number | null }>();
    if (r && r.n >= max) return Math.max(1, Math.ceil(((r.first ?? now) + L.win - now) / 1000));
  }
  return 0;
}

async function record(env: Env, kind: Kind, email: string | null, ip: string, now: number) {
  const s = [env.DB.prepare("INSERT INTO auth_attempts (kind, key, at) VALUES (?1, ?2, ?3)").bind(kind, `ip:${ip}`, now)];
  if (email) s.push(env.DB.prepare("INSERT INTO auth_attempts (kind, key, at) VALUES (?1, ?2, ?3)").bind(kind, `e:${email}`, now));
  // 顺手清一天前的旧记录
  s.push(env.DB.prepare("DELETE FROM auth_attempts WHERE at < ?1").bind(now - 86_400_000));
  await env.DB.batch(s);
}

async function guard(env: Env, kind: Kind, email: string | null, ip: string, now: number) {
  const wait = await limited(env, kind, email, ip, now);
  if (wait) throw new HttpError(429, "rate_limited", { retryAfter: wait });
}

// ------------------------------------------------------------------ 会话
interface UserRow {
  id: string;
  email: string;
  pw_hash: string;
  pw_salt: string;
  pw_iter: number;
}

async function issue(env: Env, user: { id: string; email: string }, now: number) {
  const jti = b64url(rand(18));
  const exp = Math.floor(now / 1000) + SESSION_DAYS * 86400;
  await env.DB.prepare("INSERT INTO sessions (jti, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)").bind(jti, user.id, now, exp * 1000).run();
  const token = await signJwt({ sub: user.id, email: user.email, jti, iat: Math.floor(now / 1000), exp }, secretOf(env));
  return { token, exp, user: { id: user.id, email: user.email } };
}

/** 验证 Authorization: Bearer <jwt>，并核对 D1 里的会话没被吊销。返回的 uid 是之后所有查询唯一的 user_id 来源 */
async function authed(req: Request, env: Env): Promise<{ uid: string; jti: string; email?: string }> {
  const secret = secretOf(env);
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") || "");
  if (!m) throw new HttpError(401, "unauthorized");
  const p = await verifyJwt(m[1], secret);
  if (!p) throw new HttpError(401, "unauthorized");
  const s = await env.DB.prepare("SELECT user_id FROM sessions WHERE jti = ?1 AND revoked = 0 AND expires_at > ?2").bind(p.jti, Date.now()).first<{ user_id: string }>();
  if (!s || s.user_id !== p.sub) throw new HttpError(401, "unauthorized");
  return { uid: p.sub, jti: p.jti, email: p.email };
}

// ------------------------------------------------------------------ 路由
async function signup(req: Request, env: Env) {
  const now = Date.now();
  const b = await body(req);
  const email = emailOf(b.email);
  const password = passwordOf(b.password);
  const ip = ipOf(req);
  await guard(env, "signup", email, ip, now);
  await record(env, "signup", email, ip, now);
  const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?1").bind(email).first();
  if (exists) throw new HttpError(409, "email_taken");
  const salt = rand(16);
  const hash = await hashPassword(password, salt);
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare("INSERT INTO users (id, email, pw_hash, pw_salt, pw_iter, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(id, email, b64(hash), b64(salt), PBKDF2_ITER, now).run();
  } catch (e) {
    if (/unique/i.test(String((e as Error)?.message))) throw new HttpError(409, "email_taken");
    throw e;
  }
  return json(200, await issue(env, { id, email }, now));
}

/** 用户不存在时也算一遍 PBKDF2，响应时间不泄露邮箱是否注册过 */
const DUMMY_SALT = new Uint8Array(16);

async function login(req: Request, env: Env) {
  const now = Date.now();
  const b = await body(req);
  const email = emailOf(b.email);
  const password = typeof b.password === "string" && b.password.length <= 128 ? b.password : "";
  const ip = ipOf(req);
  await guard(env, "login", email, ip, now);
  const u = await env.DB.prepare("SELECT id, email, pw_hash, pw_salt, pw_iter FROM users WHERE email = ?1").bind(email).first<UserRow>();
  const got = await hashPassword(password, u ? unb64(u.pw_salt) : DUMMY_SALT, u ? u.pw_iter : PBKDF2_ITER);
  if (!u || !password || !sameBytes(got, unb64(u.pw_hash))) {
    await record(env, "login", email, ip, now);
    throw new HttpError(400, "invalid_credentials");
  }
  // 登录成功：这个邮箱的失败计数清零（IP 的留着）
  await env.DB.prepare("DELETE FROM auth_attempts WHERE kind = 'login' AND key = ?1").bind(`e:${email}`).run();
  return json(200, await issue(env, u, now));
}

async function logout(req: Request, env: Env) {
  const a = await authed(req, env);
  await env.DB.prepare("UPDATE sessions SET revoked = 1 WHERE jti = ?1 AND user_id = ?2").bind(a.jti, a.uid).run();
  return json(200, { ok: true });
}

async function session(req: Request, env: Env) {
  const a = await authed(req, env);
  const u = await env.DB.prepare("SELECT id, email FROM users WHERE id = ?1").bind(a.uid).first<{ id: string; email: string }>();
  if (!u) throw new HttpError(401, "unauthorized");
  return json(200, { user: u });
}

async function forgot(req: Request, env: Env) {
  if (!env.RESEND_API_KEY) throw new HttpError(501, "no_mail", { message: "password reset needs a mail provider: set RESEND_API_KEY (and MAIL_FROM)" });
  const now = Date.now();
  const b = await body(req);
  const email = emailOf(b.email);
  const ip = ipOf(req);
  await guard(env, "forgot", email, ip, now);
  await record(env, "forgot", email, ip, now);
  const u = await env.DB.prepare("SELECT id FROM users WHERE email = ?1").bind(email).first();
  // 没注册过也回 ok：不泄露哪些邮箱注册过
  if (!u) return json(200, { ok: true });
  const n = new DataView(rand(4).buffer).getUint32(0) % 1_000_000;
  const code = String(n).padStart(6, "0");
  await env.DB.prepare("INSERT INTO reset_codes (email, code_hash, expires_at, tries) VALUES (?1, ?2, ?3, 0) ON CONFLICT (email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0")
    .bind(email, await sha256(`${secretOf(env)}:${email}:${code}`), now + 15 * 60_000)
    .run();
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM || "四级单词打卡 <onboarding@resend.dev>",
      to: [email],
      subject: `找回密码验证码：${code}`,
      text: `你的找回密码验证码是 ${code}，15 分钟内有效。不是你本人操作的话，忽略这封邮件即可。\n\n— 四级单词打卡 · Q1f730`,
    }),
  });
  if (!r.ok) throw new HttpError(502, "mail_failed", { message: `mail provider answered ${r.status}` });
  return json(200, { ok: true });
}

async function reset(req: Request, env: Env) {
  if (!env.RESEND_API_KEY) throw new HttpError(501, "no_mail");
  const now = Date.now();
  const b = await body(req);
  const email = emailOf(b.email);
  const code = typeof b.code === "string" && /^\d{6}$/.test(b.code) ? b.code : "";
  const password = passwordOf(b.password);
  const ip = ipOf(req);
  await guard(env, "reset", email, ip, now);
  const rc = await env.DB.prepare("SELECT code_hash, expires_at, tries FROM reset_codes WHERE email = ?1").bind(email).first<{ code_hash: string; expires_at: number; tries: number }>();
  if (!rc || rc.expires_at < now || rc.tries >= 5) throw new HttpError(400, "code_expired");
  const ok = code && sameBytes(enc.encode(await sha256(`${secretOf(env)}:${email}:${code}`)), enc.encode(rc.code_hash));
  if (!ok) {
    await env.DB.prepare("UPDATE reset_codes SET tries = tries + 1 WHERE email = ?1").bind(email).run();
    await record(env, "reset", email, ip, now);
    throw new HttpError(400, "bad_code");
  }
  const u = await env.DB.prepare("SELECT id, email FROM users WHERE email = ?1").bind(email).first<{ id: string; email: string }>();
  if (!u) throw new HttpError(400, "code_expired");
  const salt = rand(16);
  const hash = await hashPassword(password, salt);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET pw_hash = ?1, pw_salt = ?2, pw_iter = ?3 WHERE id = ?4").bind(b64(hash), b64(salt), PBKDF2_ITER, u.id),
    env.DB.prepare("UPDATE sessions SET revoked = 1 WHERE user_id = ?1").bind(u.id),
    env.DB.prepare("DELETE FROM reset_codes WHERE email = ?1").bind(email),
  ]);
  return json(200, await issue(env, u, now));
}

async function pullCards(req: Request, env: Env, url: URL) {
  const { uid } = await authed(req, env);
  const offset = Math.max(0, Math.floor(Number(url.searchParams.get("offset") || 0)) || 0);
  const limit = Math.min(PAGE_MAX, Math.max(1, Math.floor(Number(url.searchParams.get("limit") || PAGE_MAX)) || PAGE_MAX));
  const r = await env.DB.prepare("SELECT word, card, ts FROM cards WHERE user_id = ?1 ORDER BY word LIMIT ?2 OFFSET ?3").bind(uid, limit, offset).all<{ word: string; card: string | null; ts: number }>();
  return json(200, { rows: r.results.map((x) => ({ word: x.word, card: x.card === null ? null : JSON.parse(x.card), ts: Number(x.ts) })) });
}

async function pushCards(req: Request, env: Env) {
  const { uid } = await authed(req, env);
  const rows = dedupe(rowsOf((await body(req)).rows));
  if (!rows.length) return json(200, { written: 0 });
  const now = Date.now();
  const res = await env.DB.batch(rows.map((r) => env.DB.prepare(PUSH_SQL).bind(uid, r.word, r.card, r.ts, now)));
  const written = res.reduce((n, x) => n + (x?.meta?.changes ?? 0), 0);
  return json(200, { written });
}

async function getProfile(req: Request, env: Env) {
  const { uid } = await authed(req, env);
  const p = await env.DB.prepare("SELECT seed, meta FROM profile WHERE user_id = ?1").bind(uid).first<{ seed: number; meta: string }>();
  return json(200, { profile: p ? { seed: Number(p.seed), meta: JSON.parse(p.meta || "{}") } : null });
}

async function putProfile(req: Request, env: Env) {
  const { uid } = await authed(req, env);
  const b = await body(req);
  if (typeof b.seed !== "number" || !Number.isSafeInteger(b.seed)) throw new HttpError(400, "bad_request", { message: "bad seed" });
  const meta = b.meta === null || b.meta === undefined ? {} : b.meta;
  if (typeof meta !== "object" || Array.isArray(meta)) throw new HttpError(400, "bad_request", { message: "meta must be an object" });
  const m = JSON.stringify(meta);
  if (m.length > MAX_META) throw new HttpError(413, "too_large");
  await env.DB.prepare("INSERT INTO profile (user_id, seed, meta, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (user_id) DO UPDATE SET seed = excluded.seed, meta = excluded.meta, updated_at = excluded.updated_at")
    .bind(uid, b.seed, m, Date.now())
    .run();
  return json(200, { ok: true });
}

type H = (req: Request, env: Env, url: URL) => Promise<Response>;
const ROUTES: Record<string, Partial<Record<string, H>>> = {
  "auth/config": { GET: async (_r, env) => json(200, { resetCode: !!env.RESEND_API_KEY, backend: "cloudflare" }) },
  "auth/signup": { POST: signup },
  "auth/login": { POST: login },
  "auth/logout": { POST: logout },
  "auth/session": { GET: session },
  "auth/forgot": { POST: forgot },
  "auth/reset": { POST: reset },
  cards: { GET: pullCards, POST: pushCards },
  profile: { GET: getProfile, PUT: putProfile },
};

export async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*?\/api\/?/, "").replace(/\/+$/, "");
  const route = ROUTES[path];
  if (!route) return json(404, { error: "not_found" });
  const h = route[req.method];
  if (!h) return json(405, { error: "method_not_allowed" }, { allow: Object.keys(route).join(", ") });
  try {
    if (!env.DB) throw new HttpError(500, "server_config", { message: "D1 binding DB is missing" });
    return await h(req, env, url);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.code, ...e.extra }, e.status === 429 ? { "retry-after": String(e.extra.retryAfter ?? 60) } : {});
    console.error("api error", e);
    return json(500, { error: "server_error" });
  }
}
