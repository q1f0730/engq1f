# 站点 2：watercoloreyes.cn（Cloudflare Pages + Pages Functions + D1）

13.0.0 起这是一个**独立的站点**：自己的账号、自己的数据（Cloudflare D1），和站点 1（gz58y2647ucx.meoo.run，Meoo Cloud）**不互通**。两个站点的总览见 `docs/cloud.md`。

| | |
|---|---|
| 前端 | `BACKEND=cloudflare pnpm build` → `dist/`（产物里没有任何 Supabase 地址 / key，也没有 supabase-js） |
| API | 同域 `/api/*` = `functions/api/[[route]].ts` → `server/api.ts`（Pages Functions，Workers 运行时） |
| 数据 | D1，绑定名 `DB`，表结构 `migrations/d1/*.sql`（users / sessions / cards / profile / auth_attempts / reset_codes） |
| 机密 | `JWT_SECRET`（必填）；`RESEND_API_KEY`、`MAIL_FROM`（可选，找回密码发码） |
| 配置 | `wrangler.toml`（`pages_build_output_dir = "dist"` + D1 绑定，`database_id` 是占位，要换） |

## 账号与同步怎么做的
- **注册 / 登录**：邮箱 + 密码。没有邮件服务，所以注册即登录，不发验证码。
- **密码**：PBKDF2-SHA256（WebCrypto），每个用户 16 字节随机盐，100000 次迭代 —— 这是 Workers 的 WebCrypto 允许的上限（更高会直接报错）；迭代次数按用户记在 `users.pw_iter`，以后平台放开可以在登录时升级。比较是常数时间的；邮箱不存在也照样算一遍哈希。
- **会话**：HS256 JWT（`JWT_SECRET` 签名，30 天），里面的 `jti` 记在 D1 的 `sessions` 表里，每次请求都核对：退出登录 = 吊销这一个，重设密码 = 吊销这个用户的所有会话。前端存在 `localStorage["cet4v-auth"]`，放在 `Authorization: Bearer` 头里（不用 cookie，没有 CSRF）。
- **限流**（D1 里的滑动窗口，`auth_attempts`）：登录失败每个邮箱 15 分钟 5 次、每个 IP 30 次，到了以后连正确的密码也回 `429` + `Retry-After`，页面显示「N 分钟后再试」；注册每个 IP 每小时 10 次；找回码每个邮箱 15 分钟 3 次。
- **等价于 RLS**：每条读写 `cards` / `profile` 的 SQL 都是 `WHERE user_id = ?`，这个值只来自验证过的会话，请求体里的 `user_id` 一律不看。
- **推送是服务端裁决的**（`server/merge.ts` 的 `PUSH_SQL`，和 Meoo 的 `vocab_push_cards` 同一个意思）：同一个词 ts 更晚的赢；ts 相同时墓碑（`card = NULL`）赢；旧设备晚到的写入不会把删掉的词写回来。前端的合并 / 墓碑逻辑（`src/lib/cloud-merge.ts`）两个站点共用、没改。
- **输入校验**：邮箱格式 / ≤ 254、密码 6–128 位、词 1–64 个字符、ts 是非负安全整数、单张卡片 JSON ≤ 4KB、一批 ≤ 500 行、请求体 ≤ 1.5MB、profile.meta ≤ 1MB。
- **忘记密码**：没设 `RESEND_API_KEY` 时 `/api/auth/forgot` 回 `501 no_mail`，`/api/auth/config` 回 `resetCode: false`，「账号」页的「忘记密码？」只显示一段说明（这个站点还没接邮件服务），不显示验证码流程。设了 `RESEND_API_KEY`（+ `MAIL_FROM`，发件域名要先在 Resend 验证）就会通过 Resend API 发 6 位找回码（15 分钟有效，最多试 5 次，只存哈希），界面自动出现「发送找回验证码 → 输入验证码 + 新密码」。

## 上线步骤（他要在 Cloudflare 上做的）
watercoloreyes.cn 已经在 Cloudflare DNS 上，现在挂着一个旧版本的 Pages 项目。下面假设沿用那个 Pages 项目；如果它是「Direct Upload」类型（不能连 Git），就新建一个连 Git 的项目，最后把自定义域名挪过去。

### 1. 建 D1 数据库并应用迁移（本机，一次）
```bash
pnpm install
npx wrangler login                                   # 浏览器里授权 Cloudflare 账号
npx wrangler d1 create cet4-vocab                    # 打印 database_id
# 把 wrangler.toml 里 database_id = "00000000-…" 换成上面打印的值，提交到仓库（database_id 不是机密）
npx wrangler d1 migrations apply cet4-vocab --remote # 建表（以后新增 migrations/d1/*.sql 再跑一次）
```
也可以在 Dashboard → Storage & Databases → D1 → Create 建库，再用上面最后一条命令建表。

### 2. Pages 项目连 Git（Workers & Pages → Create → Pages → Connect to Git）
| 设置 | 值 |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Build command | `BACKEND=cloudflare pnpm build` |
| Build output directory | `dist` |
| Root directory | `/`（`functions/`、`server/`、`wrangler.toml` 都要在这个目录下） |
| Build 环境变量 | `NODE_VERSION` = `22`（可选，Pages 构建镜像 v3 默认就是 22）。`BACKEND` 写在构建命令里了，不依赖面板设置 |

- Pages 看到 `pnpm-lock.yaml` 会用 pnpm 安装（lockfile v9）。
- 仓库里有带 `pages_build_output_dir` 的 `wrangler.toml` 时，**Pages 以它为准**：D1 绑定 `DB` 从 `wrangler.toml` 来（所以第 1 步要把真实的 `database_id` 提交进去），面板里的绑定变成只读。
- 不想把 `database_id` 放进仓库的话：删掉 `wrangler.toml` 里的 `[[d1_databases]]` 段，改在 Pages 项目 → Settings → Bindings → D1 database 加 `DB` → `cet4-vocab`（Production 和 Preview 都加）。

### 3. 机密（Pages 项目 → Settings → Variables and Secrets，类型选 Secret，Production 和 Preview 都加）
| 名字 | 值 |
|---|---|
| `JWT_SECRET` | 至少 32 个字符的随机串，例如 `openssl rand -base64 48` 的输出。**少了它所有账号接口回 500 `server_config`** |
| `RESEND_API_KEY` | 可选。不设 = 忘记密码是说明页 |
| `MAIL_FROM` | 可选，例如 `四级单词打卡 <noreply@watercoloreyes.cn>`（域名要在 Resend 验证过） |

也可以用命令行：`npx wrangler pages secret put JWT_SECRET --project-name <Pages 项目名>`。
换了 `JWT_SECRET` = 所有人都要重新登录（旧 JWT 验不过），数据不受影响。

### 4. 自定义域名
Pages 项目 → Custom domains → Set up a custom domain → `watercoloreyes.cn`（域名已经在 Cloudflare，会自动改 DNS 记录）。如果它还绑在旧的 Pages 项目上，先在旧项目里删掉这个自定义域名，再在新项目里加。

### 5. 之后
push 到 `main` → Cloudflare 自动构建、部署（动态部署）；其它分支 → Preview 部署（同一个 D1，除非给 Preview 绑另一个库）。

### 上线后检查
1. `https://watercoloreyes.cn/api/auth/config` 返回 `{"resetCode":false,"backend":"cloudflare"}`（500 `server_config` = `JWT_SECRET` 没设 / 太短，或 D1 没绑）。
2. 「我的 → 登录 / 注册」：注册一个测试邮箱 → 马上是已登录；学 2 个词，换一个浏览器登录，进度一致。
3. `npx wrangler d1 execute cet4-vocab --remote --command "select count(*) from users"` 能看到用户数。
4. 在 gz58y2647ucx.meoo.run 用同一个邮箱登录**登不上**（那是另一套账号），这是预期的。

## 本地开发 / 测试（真实的 Cloudflare 语义：workerd + 本地 D1）
```bash
cp .dev.vars.example .dev.vars       # 填 JWT_SECRET（.dev.vars 已 gitignore）
BACKEND=cloudflare pnpm build
npx wrangler d1 migrations apply cet4-vocab --local
npx wrangler pages dev dist --d1 DB=00000000-0000-0000-0000-000000000000   # http://127.0.0.1:8788
```
- 单元测试：`src/lib/cf-backend.test.ts`（裁决规则、迁移 + `PUSH_SQL` 跑在 SQLite 上、整个 API 跑在 node:sqlite 做的 D1 替身上、前端适配层打同一个 API）。
- e2e：评审工作区的 `ONLY=cf` 套件对着 `wrangler pages dev` 跑（注册、登录、密码错、限流、上传、第二个浏览器、墓碑、B 读不到 A、退出、游客离线）。

## 备用：GitHub Action + wrangler（手动触发）
`.github/workflows/cloudflare-pages.yml`，只在 Actions → Run workflow 时运行：`pnpm test` → `BACKEND=cloudflare pnpm build` → `wrangler d1 migrations apply cet4-vocab --remote` → `wrangler pages deploy dist`。要 `CLOUDFLARE_API_TOKEN`（Pages Edit + D1 Edit）、`CLOUDFLARE_ACCOUNT_ID` 两个 Secret 和 `CF_PAGES_PROJECT` 变量。和 Git 集成二选一，别两个都开。

## 其它
- `public/_headers`：`sw.js` / `version.json` 不缓存，`assets/*` 长期缓存；没有 CSP。以后要加 CSP，`connect-src` 至少要 `'self'`（`/api`）、`https://dict.youdao.com`、`https://api.dictionaryapi.dev`，`media-src` 要 `https://dict.youdao.com`。
- service worker 不缓存 `/api/*`；Pages 会把 `/index.html` 308 到 `/`，离线打开时 SW 用缓存里的 `./`（或把重定向过的 index.html 复制成干净的响应），13.0.0 修过、e2e 覆盖。
- 13.0.0 之前的 `/sb-api` 同域代理（把 Cloudflare 的流量转到 Meoo Cloud）已经删掉：两个站点不再共用数据。
