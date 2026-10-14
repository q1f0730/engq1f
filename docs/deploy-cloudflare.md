# 部署到 Cloudflare Pages（或任何静态托管）

产物是纯静态文件：`pnpm build` → `dist/`。不需要服务器、不需要重写规则：
- `vite.config.ts` 里 `base: "./"`，所有资源都是相对路径，放在根目录或任意子路径（`https://x.pages.dev/`、`https://user.github.io/repo/`）都能用；
- 路由是 hash 路由（`#/study`、`#/me`），刷新任何页面都只请求 `index.html`，不需要 SPA fallback；
- service worker（`dist/sw.js`）用相对作用域注册，离线可用。

## 构建时读的环境变量
| 变量 | 必填 | 说明 |
|---|---|---|
| `SUPABASE_URL` | 云同步要 | Meoo Cloud（Supabase）地址，例如 `https://xxxx.database.meoo.xyz`。`meoo cloud status --json` 的 `sbInfo.publicUrl` |
| `SUPABASE_ANON_KEY` | 云同步要 | 公开的 anon key（RLS 把关）。`sbInfo.anonKey`。**不要**放 service role key |
| `CET4V_CLOUD` | 否 | 上面两个都在时默认开云同步；设 `0` 强制做纯本机版 |
| `NODE_VERSION` | 建议 | `22` |

`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 也认。两个都不设 = 纯本机版（「账号」页显示「云同步还没开通」）。
变量在**构建时**编进 JS，改了要重新构建。

## Cloudflare Pages（连 Git 仓库）
Workers & Pages → Create → Pages → Connect to Git，选仓库后：

| 设置 | 值 |
|---|---|
| Framework preset | None |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Root directory | `/`（仓库根目录就是本应用时；否则填应用所在子目录） |
| Environment variables（Production 和 Preview 都加） | `NODE_VERSION=22`、`SUPABASE_URL=…`、`SUPABASE_ANON_KEY=…` |

Pages 看到 `pnpm-lock.yaml` 会自动用 pnpm 安装。`public/_headers` 会被 Pages 读取：`sw.js` 和 `version.json` 不缓存（新版能及时提示刷新），`assets/*` 长期缓存。

### 云同步的跨域
浏览器直接请求 `SUPABASE_URL`（Supabase 默认允许任意来源的 CORS），所以 `*.pages.dev` 或自定义域名不用额外配置。
上线后在「账号」页注册一个账号试一次；如果请求被拦，检查 Meoo Cloud 的允许来源设置。

## 可选：GitHub Action + wrangler
`.github/workflows/cloudflare-pages.yml`，**只在手动触发（workflow_dispatch）时运行**，不会随 push 自动发布。

1. Cloudflare 里先建一个 Pages 项目（Direct Upload 类型即可），记下项目名。
2. 仓库 Settings → Secrets and variables → Actions：
   - Secrets：`CLOUDFLARE_API_TOKEN`（权限 Account · Cloudflare Pages · Edit）、`CLOUDFLARE_ACCOUNT_ID`
   - Variables：`CF_PAGES_PROJECT`（项目名）、`SUPABASE_URL`、`SUPABASE_ANON_KEY`
3. Actions → Deploy to Cloudflare Pages → Run workflow。它会 `pnpm install --frozen-lockfile` → `pnpm test` → `pnpm build` → `wrangler pages deploy dist --project-name=$CF_PAGES_PROJECT --branch=main`。

本地手动发（装了 wrangler 并 `wrangler login` 之后）：
```bash
pnpm build
npx wrangler pages deploy dist --project-name=<项目名>
```

## 其它静态托管
- **GitHub Pages**：`.github/workflows/pages.yml`（push 到 main 自动发布），云同步变量放在仓库 Variables 的 `SUPABASE_URL` / `SUPABASE_ANON_KEY`。
- **Meoo 静态部署**：见 `docs/cloud.md`（`meoo deploy --skip-build --skip-push --force`）。
- **Netlify / Vercel / 任意 Nginx**：构建命令 `pnpm build`、发布目录 `dist`，同样的环境变量；不需要重写规则。
