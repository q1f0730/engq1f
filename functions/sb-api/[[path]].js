/**
 * 13.0.0 · Cloudflare Pages Function：同域 /sb-api/* → Meoo Cloud（Supabase）的反向代理。
 *
 * 为什么要它：Meoo Cloud 的网关按请求的 Origin 放行，只认本项目的 Meoo 域名（https://gz58y2647ucx.meoo.run）。
 * 浏览器从 watercoloreyes.cn / *.pages.dev 直接请求 SUPABASE_URL 会被网关 403（注册接口对其它来源回空 400），
 * 而 Origin 是浏览器自己加的、前端改不了。所以 Pages 上的构建不编进 SUPABASE_URL，前端改走同域 /sb-api
 * （见 src/lib/cloud-config.ts），由这里转发并把 Origin 换成 Meoo 域名。只改请求头，不碰请求体和响应体。
 *
 * Pages 项目里要设的环境变量（运行时，Functions 读）：
 *   SB_UPSTREAM  Meoo Cloud 地址，例如 https://xxxx.database.meoo.xyz（`meoo cloud status --json` 的 sbInfo.publicUrl）
 *   SB_ORIGIN    Meoo 网关认的来源，例如 https://gz58y2647ucx.meoo.run
 * 构建时另外要 CET4V_CLOUD=1 + SUPABASE_ANON_KEY，并且**不要**设 SUPABASE_URL（设了前端就会绕开代理直连）。
 */
const DROP_REQ = new Set(["host", "origin", "referer", "cookie", "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor", "x-forwarded-for", "x-forwarded-proto", "x-real-ip"]);

export async function onRequest({ request, env }) {
  const upstream = (env.SB_UPSTREAM || "").replace(/\/+$/, "");
  const origin = env.SB_ORIGIN || "";
  if (!upstream || !origin) return new Response(JSON.stringify({ msg: "sb-api proxy not configured (SB_UPSTREAM / SB_ORIGIN)" }), { status: 503, headers: { "content-type": "application/json" } });

  const inUrl = new URL(request.url);
  const rest = inUrl.pathname.replace(/^.*?\/sb-api(?=\/|$)/, "");
  // 只转发 Supabase 的几个服务，别的路径一律 404，免得变成开放代理
  if (!/^\/(auth|rest|storage|functions|realtime)\/v1(\/|$)/.test(rest)) return new Response("not found", { status: 404 });

  const headers = new Headers();
  for (const [k, v] of request.headers) if (!DROP_REQ.has(k.toLowerCase())) headers.set(k, v);
  headers.set("origin", origin);

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
  const res = await fetch(upstream + rest + inUrl.search, init);

  const out = new Headers(res.headers);
  for (const k of [...out.keys()]) if (k.startsWith("access-control-")) out.delete(k); // 同域请求，不需要 CORS 头
  out.set("cache-control", "no-store");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}
