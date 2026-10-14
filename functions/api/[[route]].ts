/**
 * 13.0.0 · Cloudflare Pages Function：/api/* → server/api.ts（账号 + 同步，D1 绑定名 DB）。
 * 只在 Cloudflare 站点（BACKEND=cloudflare 构建）用得到；Meoo 站点只发 dist/，不带 functions/。
 */
import { handle, type Env } from "../../server/api";

export const onRequest = (ctx: { request: Request; env: Env }) => handle(ctx.request, ctx.env);
