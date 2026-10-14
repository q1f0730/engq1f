/**
 * 13.0 · 云同步是否可用（首屏只带这一点点；后端实现和同步逻辑在 cloud.ts / backend/*，登录过才加载）
 * 13.0.0 · 两个后端，构建时选（BACKEND，见 vite.config.ts / docs/cloud.md），两个站点的数据互不相通：
 *  - supabase（默认）：.env / 平台变量里的 SUPABASE_URL + SUPABASE_ANON_KEY（meoo cloud pull-env 写的）→ gz58y2647ucx.meoo.run
 *  - cloudflare：同域 /api（Pages Functions + D1）→ watercoloreyes.cn。不编进任何 Supabase 地址 / key
 *  - CET4V_CLOUD=0：纯本机版
 *  - 运行时覆盖（测试替身用）：supabase 构建认 window.__CET4V_CLOUD__ = { url, anonKey }；cloudflare 构建认 { backend: "cloudflare", url? }
 */
export type CloudBackend = "supabase" | "cloudflare";

export interface CloudConfig {
  backend: CloudBackend;
  /** supabase：项目地址；cloudflare：空 = 同域 /api */
  url: string;
  anonKey: string;
}

export const AUTH_KEY = "cet4v-auth";

type Built = { on: boolean; backend?: CloudBackend; url: string; key: string };

export function cloudConfig(): CloudConfig | null {
  const c: Built = typeof __CLOUD__ !== "undefined" ? __CLOUD__ : { on: false, url: "", key: "" };
  const backend: CloudBackend = c.backend === "cloudflare" ? "cloudflare" : "supabase";
  const w = (typeof window !== "undefined" ? (window as unknown as { __CET4V_CLOUD__?: Partial<CloudConfig> }).__CET4V_CLOUD__ : undefined) ?? undefined;
  if (backend === "cloudflare") {
    if (w?.backend === "cloudflare") return { backend, url: w.url ?? "", anonKey: "" };
    return c.on ? { backend, url: "", anonKey: "" } : null;
  }
  if (w?.url && w.anonKey && w.backend !== "cloudflare") return { backend, url: w.url, anonKey: w.anonKey };
  if (!c.on || !c.key) return null;
  // 只有 key 没有 URL（CET4V_CLOUD=1）：同域 /sb-api（Meoo 静态部署自带的代理）。Cloudflare 构建不走这里。
  const url = c.url || (typeof location !== "undefined" ? new URL("sb-api", location.href.replace(/#.*$/, "")).href.replace(/\/$/, "") : "");
  return url ? { backend, url, anonKey: c.key } : null;
}

/** 本机有没有登录过（不加载后端代码就能判断，决定启动时要不要拉 cloud.ts） */
export function hasSession(): boolean {
  try {
    return !!localStorage.getItem(AUTH_KEY);
  } catch {
    return false;
  }
}
