# 部署到 Cloudflare Pages（或任何静态托管）

产物是纯静态文件：`pnpm build` → `dist/`。不需要服务器、不需要重写规则：
- `vite.config.ts` 里 `base: "./"`，所有资源都是相对路径，放在根目录或任意子路径（`https://x.pages.dev/`、`https://user.github.io/repo/`）都能用；
- 路由是 hash 路由（`#/study`、`#/me`），刷新任何页面都只请求 `index.html`，不需要 SPA fallback；
- service worker（`dist/sw.js`）用相对作用域注册，离线可用。

## 现状：watercoloreyes.cn 已在 Cloudflare
- 他的域名 **watercoloreyes.cn 已经托管在 Cloudflare**（DNS + Pages，响应头 `server: cloudflare`），绑在 Cloudflare Pages 项目上。
- **watercoloreyes.cn（CF Pages）和 gz58y2647ucx.meoo.run（Meoo 静态部署）共用同一个 Meoo Cloud**：同一套账号、同一份进度，在一个域名上注册，另一个域名直接登录。云端细节见 `docs/cloud.md`。
- 区别只在前端怎么连：meoo.run 直连云端；watercoloreyes.cn 走同域 `/sb-api` 代理（下面说为什么）。

## 为什么 Pages 要走 /sb-api 代理
Meoo Cloud 的网关按浏览器请求的 `Origin` 放行，只认 `https://gz58y2647ucx.meoo.run`：从 `https://watercoloreyes.cn` 或 `*.pages.dev` 直连 `SUPABASE_URL`，所有接口都回 403（2026-10-14 实测）。`Origin` 是浏览器加的，前端改不了。
所以仓库里带了一个 Pages Function `functions/sb-api/[[path]].js`：浏览器请求同域的 `/sb-api/auth/v1/…`、`/sb-api/rest/v1/…`，它转发到 Meoo Cloud，并把 `Origin` 换成 meoo.run 域名；只转发 `auth / rest / storage / functions / realtime` 这几个前缀，其它路径 404，不会变成开放代理；请求体和响应体原样转发，响应 `cache-control: no-store`。
（Pages 会自动部署仓库根目录的 `functions/`；`wrangler pages deploy dist` 在仓库根目录运行时也会带上它。）

## Pages 的环境变量
在 Pages 项目 → Settings → Environment variables，**Production 和 Preview 都加**：

| 变量 | 用在 | 值 | 说明 |
|---|---|---|---|
| `CET4V_CLOUD` | 构建 | `1` | 开云同步、走同域 `/sb-api` |
| `SUPABASE_ANON_KEY` | 构建 | anon key | `meoo cloud status --json` 的 `sbInfo.anonKey`。公开的 key，RLS 把关；**不要**放 service role key |
| `SB_UPSTREAM` | 运行时（Functions） | `https://<实例>.database.meoo.xyz` | `sbInfo.publicUrl` |
| `SB_ORIGIN` | 运行时（Functions） | `https://gz58y2647ucx.meoo.run` | Meoo 网关认的来源 |
| `NODE_VERSION` | 构建 | `22` | |

**不要在 Pages 上设 `SUPABASE_URL`**：设了前端就会编进直连地址，绕过代理，然后被网关 403。
（`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 也认，同理。）变量在**构建时**编进 JS，改了要重新构建（`SB_UPSTREAM` / `SB_ORIGIN` 是运行时的，改了重新部署即可）。
不设 `CET4V_CLOUD` / `SUPABASE_ANON_KEY` = 纯本机版（「账号」页显示「云同步还没开通」），代理闲着不用。

其它静态托管（没有 Functions 的）：要么设 `SUPABASE_URL` 直连（前提是 Meoo 放行了那个域名），要么在托管那边配一个等价的反向代理到 `/sb-api`，同样把 `Origin` 换成 meoo.run 域名。

## Cloudflare Pages（连 Git 仓库）
Workers & Pages → Create → Pages → Connect to Git，选仓库后：

| 设置 | 值 |
|---|---|
| Framework preset | None |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Root directory | `/`（仓库根目录就是本应用时；否则填应用所在子目录，`functions/` 要在这个目录下） |
| Environment variables | 见上表 |

Pages 看到 `pnpm-lock.yaml` 会自动用 pnpm 安装。`public/_headers` 会被 Pages 读取：`sw.js` 和 `version.json` 不缓存（新版能及时提示刷新），`assets/*` 长期缓存。`_headers` 里**没有 CSP**（13.0.0 核对过，`index.html` 里也没有）；以后要加的话，`connect-src` 至少要有 `'self'`（同域 `/sb-api`）、`https://*.database.meoo.xyz`（直连构建）、`https://dict.youdao.com`（发音）、`https://api.dictionaryapi.dev`（在线例句），`media-src` 要有 `https://dict.youdao.com`，否则云同步 / 发音会被拦。
自定义域名：Pages 项目 → Custom domains → `watercoloreyes.cn`（已在 Cloudflare 的域名会自动加 DNS 记录）。

### 上线后检查
1. `https://watercoloreyes.cn/sb-api/auth/v1/health` 返回 GoTrue 的 JSON（不是 403 / 503）。503 = `SB_UPSTREAM` / `SB_ORIGIN` 没设。
2. 在「账号」页用测试邮箱注册 → 收到 6 位验证码 → 登录；再到 gz58y2647ucx.meoo.run 用同一账号登录，进度一致。

## 可选：GitHub Action + wrangler
`.github/workflows/cloudflare-pages.yml`，**只在手动触发（workflow_dispatch）时运行**，不会随 push 自动发布。

1. Cloudflare 里先建一个 Pages 项目（Direct Upload 类型即可），记下项目名。
2. 仓库 Settings → Secrets and variables → Actions：
   - Secrets：`CLOUDFLARE_API_TOKEN`（权限 Account · Cloudflare Pages · Edit）、`CLOUDFLARE_ACCOUNT_ID`
   - Variables：`CF_PAGES_PROJECT`（项目名）、`SUPABASE_ANON_KEY`（有它 workflow 就带 `CET4V_CLOUD=1` 构建；不设 `SUPABASE_URL`）
   - Pages 项目本身的环境变量里设好 `SB_UPSTREAM`、`SB_ORIGIN`（给 `functions/sb-api`）
3. Actions → Deploy to Cloudflare Pages → Run workflow。它会 `pnpm install --frozen-lockfile` → `pnpm test` → `pnpm build` → `wrangler pages deploy dist --project-name=$CF_PAGES_PROJECT --branch=main`。

本地手动发（装了 wrangler 并 `wrangler login` 之后）：
```bash
pnpm build
npx wrangler pages deploy dist --project-name=<项目名>
```

## 其它静态托管
- **GitHub Pages**：`.github/workflows/pages.yml`（push 到 main 自动发布），云同步变量放在仓库 Variables 的 `SUPABASE_URL` / `SUPABASE_ANON_KEY`。注意 GitHub Pages 没有 Functions，`*.github.io` 直连会被 Meoo 网关 403，云同步在那里用不了，除非 Meoo 放行这个域名。
- **Meoo 静态部署**：见 `docs/cloud.md`（`meoo deploy --skip-build --skip-push --force`）。
- **Netlify / Vercel / 任意 Nginx**：构建命令 `pnpm build`、发布目录 `dist`，同样的环境变量；不需要重写规则。
