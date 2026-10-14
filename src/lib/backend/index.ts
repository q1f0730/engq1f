/**
 * 13.0.0 · 按构建选后端，懒加载。BACKEND 是构建时常量（vite define），另一个实现在产物里不出现。
 * 测试替身：window.__CET4V_CLOUD__ = { url, anonKey }（只在 supabase 构建里认）/ { backend: "cloudflare", url }（只在 cloudflare 构建里认，换 /api 的地址）。
 */
import { cloudConfig } from "../cloud-config";
import type { Backend } from "./types";

let p: Promise<Backend> | null = null;

export function loadBackend(): Promise<Backend> {
  if (p) return p;
  const cfg = cloudConfig();
  if (!cfg) return Promise.reject(new Error("云同步还没开通"));
  // 用构建常量判断（不是 cfg）：Rollup 把另一支整个删掉，产物里没有它的代码块，SW 也不预缓存 supabase-js
  p = (__CLOUD__.backend === "cloudflare" ? import("./cloudflare") : import("./supabase")).then((m) => m.backend);
  p.catch(() => (p = null));
  return p;
}

export type { Backend, BackendFeatures, SessionUser } from "./types";
