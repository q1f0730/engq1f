# 账号与云同步：两个独立的站点（13.0.0）

同一份代码，构建时用 `BACKEND` 选后端，发成两个站点。**两个站点的账号和数据互不相通**：在一个站点注册的邮箱，到另一个站点要重新注册，进度也不会过去。两个都是动态部署（push 到 `main` 自动构建发布），都有自己存数据的地方。

| | 站点 1 | 站点 2 |
|---|---|---|
| 地址 | https://gz58y2647ucx.meoo.run | https://watercoloreyes.cn |
| 构建 | `BACKEND=supabase pnpm build`（默认） | `BACKEND=cloudflare pnpm build` |
| 托管 | Meoo 静态部署 | Cloudflare Pages |
| 账号 / API | Meoo Cloud（Supabase Auth + PostgREST），前端直连 `SUPABASE_URL` | 同域 `/api/*`（Pages Functions，`functions/` + `server/`） |
| 数据 | Meoo Cloud 的 Postgres：`vocab_profile` / `vocab_cards` + RLS（`migrations/20261014000000_vocab_sync.sql`） | Cloudflare D1：`users` / `sessions` / `cards` / `profile` …（`migrations/d1/*.sql`） |
| 注册 | 邮箱 + 密码 + 6 位邮件验证码 | 邮箱 + 密码，注册即登录（没有邮件服务） |
| 忘记密码 | 6 位找回码（Supabase 发邮件） | 默认没有（说明页）；设了 `RESEND_API_KEY` 才发找回码 |
| 自动发布 | `.github/workflows/meoo-deploy.yml`（GitHub Actions + Meoo CLI） | Cloudflare Pages 的 Git 集成（Cloudflare 自己构建） |
| 部署文档 | 本文「站点 1」 | `docs/deploy-cloudflare.md` |

## 前端：一个适配层，两个实现
- `src/lib/backend/types.ts`：`Backend` 接口 —— `features / session / signUp / verifySignup / resend / signIn / signOut / sendRecovery / resetPassword / pullCards / pushCards / getProfile / putProfile`。
- `src/lib/backend/supabase.ts`：原来 `cloud.ts` 里的 supabase-js 调用，搬过来，行为不变。
- `src/lib/backend/cloudflare.ts`：同域 `/api`，只用 `fetch`；会话（JWT）存在 `localStorage["cet4v-auth"]`，401 时清掉、回到登录。
- `src/lib/backend/index.ts`：`loadBackend()` 按**构建常量**动态 `import()` 其中一个；另一个整个不进产物（Cloudflare 构建里没有 supabase-js，Supabase 构建里没有 cloudflare 块），SW 也不会预缓存它。
- `src/lib/cloud.ts`：只管什么时候同步（第一次登录全量合并、改动后 4 秒增量上传、回到前台 / 联网时拉一次），通过适配层说话。合并 / 墓碑规则 `src/lib/cloud-merge.ts` 两个站点共用、13.0.0 没改。
- `src/lib/cloud-config.ts`（首屏唯一带的那一点）：这次构建开没开云同步、是哪个后端、本机有没有登录过。没登录的人不下载任何后端代码。
- `src/routes/account.tsx`：按 `features()` 决定注册要不要验证码、「忘记密码」是流程还是说明页。

## 构建开关（构建时编进 JS）
| 变量 | 作用 |
|---|---|
| `BACKEND` | `supabase`（默认）或 `cloudflare`；别的值构建直接报错 |
| `SUPABASE_URL` + `SUPABASE_ANON_KEY`（或 `VITE_` 前缀） | 只在 `BACKEND=supabase` 时读。都在 → 开云同步、直连；`.env`（`meoo cloud pull-env` 写的，gitignore）或 CI 的 Secret |
| `CET4V_CLOUD=0` | 两种后端都强制纯本机版（「账号」页显示「云同步还没开通」） |
| `CET4V_CLOUD=1` + 只有 key 没有 URL | 只对 supabase：走同域 `/sb-api`（Meoo 自带的代理）。Cloudflare 构建不走这条 |

anon key 本来就是公开的（RLS 把关）；service role key 永远不进前端；`BACKEND=cloudflare` 的产物里没有任何 Supabase 地址或 key（e2e 检查）。

## 两边相同的合并规则
- 每个词一行（`user_id, word, card, ts`），按最后作答时间 `ts` 更晚的赢；服务端也按 ts 把关，旧设备晚到的写入不覆盖新的。
  - Meoo：`vocab_push_cards` 是 `where c.ts <= excluded.ts`（ts 相同时后到的覆盖）。
  - Cloudflare：`server/merge.ts` 的 `PUSH_SQL`，ts 相同时**墓碑赢**、两张卡片留已有的（重复推送不改任何东西）。客户端合并本来就是「ts 相同删除赢」，两边结果一致。
- **墓碑**：重置单词、批量重置、撤销第一次作答、清空数据 → 上传 `card = null` 的一行，`ts` = 删除时刻；别的设备同步后这个词也删掉，不会「复活」。删掉以后又学了，新卡片 ts 更晚，照常同步。
- 其余记录（打卡、日志、词单…）在 profile 的 `meta` 里取并集；乱序种子 `seed` 跟账号走。第一次登录本机和云端合并，两边都不丢；退出登录本机记录保留。

---

## 站点 1：gz58y2647ucx.meoo.run（Meoo Cloud）
- Meoo 项目 `gz58y2647ucx`，Meoo Cloud 已开（`meoo cloud status --json`：`enabled: true`，地址在 `sbInfo.publicUrl`）。**不要再跑 `meoo cloud enable`。**
- Auth：邮箱注册开、`mailer_autoconfirm: false`（必须输入 6 位验证码）。邮件验证码有额度（前 20 封免费），测试省着用。
- Meoo 网关按浏览器的 `Origin` 放行，只认 `https://gz58y2647ucx.meoo.run`：别的域名直连会 403。所以这个后端只服务站点 1；站点 2 有自己的后端，不再需要以前的 `/sb-api` 代理（已删）。本地真实测试在 Playwright 里把发往云端的请求 `Origin` 换成 meoo.run 域名。

### 动态部署（GitHub Actions）
`.github/workflows/meoo-deploy.yml`：push 到 `main` → `pnpm install` → `pnpm test` → `BACKEND=supabase pnpm build`（读 Secret `SUPABASE_URL` / `SUPABASE_ANON_KEY`）→ 装 `@aliyun-meoo/cli` → 写一个只含 `MEOO_PROJECT_URL_ID=gz58y2647ucx` 的 `.env` → `meoo login --ak "$MEOO_AK"` → `meoo deploy --skip-build --skip-push --force --json`（发布 CI 刚构建的 `dist/`，不把源码推到秒悟沙箱）→ `meoo logout`。

他要做的（一次）：
1. 把仓库推到 GitHub（`main` 分支）。
2. 仓库 Settings → Secrets and variables → Actions → **Secrets**：
   - `MEOO_AK`：Meoo API Key（meoo.com 账号设置里新建一个专给 CI 用的）
   - `SUPABASE_URL`：`meoo cloud status --json` 的 `sbInfo.publicUrl`（或本地 `.env` 里的值）
   - `SUPABASE_ANON_KEY`：`sbInfo.anonKey`（或本地 `.env`）
   - （可选 Variable）`MEOO_PROJECT_URL_ID`，默认 `gz58y2647ucx`
3. 之后每次 push 到 `main` 就会发布；Actions 页能手动 Run workflow。

手动发布（沙箱里）：`export PATH=/workspace/.npm-global/bin:$PATH NODE_USE_ENV_PROXY=1`，`mkdir -p ~/.meoo && cp /workspace/.meoo/credentials.json ~/.meoo/`，`BACKEND=supabase pnpm build`，`meoo deploy --skip-build --skip-push --force`。e2e 会临时改 `dist/sw.js`，**跑过 e2e 的 dist 要重新构建再发**。

### 真实测试（2026-10-14 23:10，本地预览 + 线上 Meoo Cloud）
`/workspace/work/v13/cloud_real.py`：mail.tm 邮箱注册 → 6 位验证码 → 登录 → 上传 → 第二个浏览器看到进度和种子 → 重置一个词 → 墓碑上云 → 另一个浏览器同步后没了 → 第二个用户读 / 写 / 改 / 删第一个用户的行被 RLS 挡住 → 匿名推送写不进 → 清理。20/20 通过（最后清理时代理断过一次 SSL）。2026-10-15 已把两个测试账号（`q1f730-*@maxxspace.com`）从 `auth.users` 删掉，测试行之前已清空；剩下的 `meoo-e2e-*@e2e.meoo.invalid` 是 Meoo 自己开通登录时建的，没动。

清理命令（以后再测时用）：
```bash
meoo db query "delete from auth.users where email like 'q1f730-%@maxxspace.com'"   # on delete cascade 连带删两张表的行
```

## 站点 2：watercoloreyes.cn（Cloudflare）
见 `docs/deploy-cloudflare.md`：D1 建库和迁移、Pages Git 集成的构建设置、`JWT_SECRET`、自定义域名、本地 `wrangler pages dev` 测试。

## 回滚
- 只想关掉某个站点的同步：那个站点用 `CET4V_CLOUD=0` 构建再发布。用户本机记录不受影响（localStorage 一直是主数据源）。
- 表 / D1 库可以留着；两边都是 `on delete cascade`，删用户连带删他的行。
