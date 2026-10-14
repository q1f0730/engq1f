/**
 * 13.0.0 · Cloudflare 实现：同域 /api（functions/api，Pages Functions + D1）。只用 fetch，不带任何 SDK。
 * 会话：服务端签的 HS256 JWT（服务端还在 D1 里记着它的 jti，退出 / 改密码即吊销），存在 localStorage[AUTH_KEY]。
 * 这个站点的账号和 Meoo 那边的是两套，互不相通。
 */
import { AUTH_KEY } from "../cloud-config";
import type { CardRow } from "../cloud-merge";
import { BackendError, type Backend, type BackendFeatures, type Profile, type SessionUser } from "./types";

interface Stored {
  token: string;
  user: SessionUser;
  exp: number;
}

const MSG: Record<string, string> = {
  invalid_credentials: "邮箱或密码不对",
  email_taken: "这个邮箱已经注册过，直接登录就行",
  rate_limited: "试得太频繁了，过一会儿再试",
  bad_email: "邮箱格式不对",
  weak_password: "密码太短：至少 6 位",
  unauthorized: "登录过期了，请重新登录",
  no_mail: "这个站点还没接邮件服务，暂时没法发找回码",
  bad_code: "验证码不对",
  code_expired: "验证码过期了，请重新发送",
  too_large: "数据太大，传不上去",
  bad_request: "请求格式不对",
  server_config: "服务器还没配置好（JWT_SECRET / D1）",
};

function load(): Stored | null {
  try {
    const s = JSON.parse(localStorage.getItem(AUTH_KEY) || "null") as Stored | null;
    return s && s.token && s.user?.id ? s : null;
  } catch {
    return null;
  }
}
function save(s: Stored | null) {
  try {
    if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s));
    else localStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
}

function apiUrl(path: string): string {
  const w = (window as unknown as { __CET4V_CLOUD__?: { backend?: string; url?: string } }).__CET4V_CLOUD__;
  const base = w?.backend === "cloudflare" && w.url ? w.url.replace(/\/?$/, "/") : new URL("./", location.href.replace(/#.*$/, "")).href;
  return new URL("api/" + path, base).href;
}

async function call<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  const s = auth ? load() : null;
  if (auth) {
    if (!s) throw new BackendError("unauthorized", MSG.unauthorized, 401);
    headers.authorization = `Bearer ${s.token}`;
  }
  const res = await fetch(apiUrl(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  let data: { error?: string; message?: string; retryAfter?: number } & Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* 空 body / HTML */
  }
  if (!res.ok) {
    const code = data.error || (res.status === 401 ? "unauthorized" : `http_${res.status}`);
    if (code === "unauthorized" && auth) save(null);
    let msg = MSG[code] ?? data.message ?? `服务器出错了（${res.status}）`;
    if (code === "rate_limited" && data.retryAfter) msg = `试得太频繁了，${Math.max(1, Math.ceil(Number(data.retryAfter) / 60))} 分钟后再试`;
    throw new BackendError(code, msg, res.status);
  }
  return data as T;
}

const signedIn = (r: { token: string; user: SessionUser; exp: number }): SessionUser => {
  save({ token: r.token, user: r.user, exp: r.exp });
  return r.user;
};

let feats: Promise<BackendFeatures> | null = null;
const PAGE = 1000;

export const backend: Backend = {
  kind: "cloudflare",
  features() {
    feats ??= call<{ resetCode?: boolean }>("GET", "auth/config", undefined, false)
      .then((r) => ({ signupCode: false, resetCode: !!r.resetCode }))
      .catch(() => {
        feats = null;
        return { signupCode: false, resetCode: false };
      });
    return feats;
  },
  async session() {
    const s = load();
    if (!s) return null;
    if (s.exp && s.exp * 1000 < Date.now()) {
      save(null);
      return null;
    }
    return s.user;
  },
  async signUp(email, password) {
    signedIn(await call("POST", "auth/signup", { email, password }, false));
    return { needsCode: false };
  },
  async verifySignup() {
    throw new BackendError("unsupported", "这个站点注册不需要验证码");
  },
  async resend() {
    throw new BackendError("unsupported", "这个站点注册不需要验证码");
  },
  async signIn(email, password) {
    return signedIn(await call("POST", "auth/login", { email, password }, false));
  },
  async signOut() {
    try {
      if (load()) await call("POST", "auth/logout", {});
    } finally {
      save(null);
    }
  },
  async sendRecovery(email) {
    await call("POST", "auth/forgot", { email }, false);
  },
  async resetPassword(email, code, password) {
    return signedIn(await call("POST", "auth/reset", { email, code, password }, false));
  },
  async pullCards() {
    const out: CardRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const r = await call<{ rows: CardRow[] }>("GET", `cards?offset=${offset}&limit=${PAGE}`);
      for (const x of r.rows) out.push({ word: x.word, card: x.card ?? null, ts: Number(x.ts) });
      if (r.rows.length < PAGE) break;
    }
    return out;
  },
  async pushCards(rows) {
    for (let i = 0; i < rows.length; i += 500) await call("POST", "cards", { rows: rows.slice(i, i + 500) });
  },
  async getProfile() {
    const r = await call<{ profile: Profile | null }>("GET", "profile");
    return r.profile ? { seed: Number(r.profile.seed), meta: r.profile.meta ?? null } : null;
  },
  async putProfile(_uid, p) {
    await call("PUT", "profile", { seed: p.seed, meta: p.meta });
  },
};
