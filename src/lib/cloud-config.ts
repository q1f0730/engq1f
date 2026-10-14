/**
 * 13.0 · 云同步是否可用（首屏只带这一点点；supabase-js 和同步逻辑在 cloud.ts，登录过才加载）
 *  - 构建时：CET4V_CLOUD=1 + .env 里的 SUPABASE_URL / SUPABASE_ANON_KEY（meoo cloud pull-env 写的）
 *  - 运行时覆盖：window.__CET4V_CLOUD__ = { url, anonKey }（自托管 / 测试替身后端用）
 */
export interface CloudConfig {
  url: string;
  anonKey: string;
}

export const AUTH_KEY = "cet4v-auth";

export function cloudConfig(): CloudConfig | null {
  const w = (typeof window !== "undefined" ? (window as unknown as { __CET4V_CLOUD__?: Partial<CloudConfig> }).__CET4V_CLOUD__ : undefined) ?? undefined;
  if (w?.url && w.anonKey) return { url: w.url, anonKey: w.anonKey };
  const c = typeof __CLOUD__ !== "undefined" ? __CLOUD__ : { on: false, url: "", key: "" };
  if (!c.on || !c.key) return null;
  // Meoo 静态部署：同域的 /sb-api 代理到 Supabase（和 Meoo 模板一致）
  const url = c.url || (typeof location !== "undefined" ? new URL("sb-api", location.href.replace(/#.*$/, "")).href.replace(/\/$/, "") : "");
  return url ? { url, anonKey: c.key } : null;
}

/** 本机有没有登录过（不加载 supabase-js 就能判断，决定启动时要不要拉 cloud.ts） */
export function hasSession(): boolean {
  try {
    return !!localStorage.getItem(AUTH_KEY);
  } catch {
    return false;
  }
}
