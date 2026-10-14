# 账号与云同步（13.0.0 · 已上线的云端）

云端已经开好、在用：Meoo 项目 `gz58y2647ucx` 的 Meoo Cloud（Supabase）。迁移已执行，邮箱验证码注册 / 登录已开启。
两个站点共用这一个云端、同一套账号和进度：

| 站点 | 托管 | 前端怎么连云端 |
|---|---|---|
| https://gz58y2647ucx.meoo.run | Meoo 静态部署 | 直连 `SUPABASE_URL`（或同域 `/sb-api`，Meoo 自带的代理） |
| https://watercoloreyes.cn | Cloudflare Pages | 同域 `/sb-api` → `functions/sb-api/[[path]].js` 代理（见 `docs/deploy-cloudflare.md`） |

在一边注册的账号，另一边直接登录；进度按下面的规则合并。

## 现状（2026-10-14 核对）
- `meoo cloud status --json`：`enabled: true`，地址在 `sbInfo.publicUrl`（`https://<实例>.database.meoo.xyz`）。
- Auth 设置（`GET /auth/v1/settings`）：邮箱注册开、`mailer_autoconfirm: false`——注册后必须输入邮件里的 6 位验证码才能登录。
- 表：`vocab_profile`、`vocab_cards` + RLS + `vocab_push_cards(rows jsonb)`（`migrations/20261014000000_vocab_sync.sql`）。
- 邮件验证码有额度：前 20 封免费。测试时省着用（一次完整的真实测试要 2 封）。

## 构建开关
构建时读环境变量（`.env` 或托管平台的变量），编进 JS：
- `.env` 里有 `SUPABASE_URL` + `SUPABASE_ANON_KEY`（`meoo cloud pull-env` 写的）→ **默认开**云同步，前端直连这个地址。
- `CET4V_CLOUD=1` + 只有 `SUPABASE_ANON_KEY`、没有 URL → 开，前端走同域 `/sb-api` 代理（Cloudflare Pages 用这种）。
- `CET4V_CLOUD=0` → 强制纯本机版，「账号」页显示「云同步还没开通」。
- anon key 本来就是公开的（RLS 把关）；service role key 永远不进前端。`.env` 在 `.gitignore` 里，不要提交、不要贴出来。

## Meoo 网关只认自己的域名（重要）
Meoo Cloud 前面的网关（Tengine）按浏览器请求的 `Origin` 放行，只认本项目的 `https://gz58y2647ucx.meoo.run`：
- 其它域名（`https://watercoloreyes.cn`、`*.pages.dev`、`https://meoo.run`）发来的请求，**所有接口**都回 403 HTML 页；
- 本地 `http://127.0.0.1:3015` / `localhost`：REST 和登录能用，但 `/auth/v1/signup` 回空 body 的 400（supabase-js 报「Unexpected end of JSON input」）；
- 不带 `Origin` 的请求（curl、服务端）正常。

所以：
- **Cloudflare Pages / 其它域名**一定要走同域代理（`functions/sb-api`，把 `Origin` 换成 meoo.run 域名），不能直连。
- **本地真实测试**（`/workspace/work/v13/cloud_real.py`）在浏览器里用 Playwright 路由把发往云端的请求 `Origin` 换成 meoo.run 域名，其它不动。
- 在 Meoo 控制台能改允许来源的话，把 `https://watercoloreyes.cn` 加进去后也可以直连；目前没有找到这个设置，代理是现成可用的方案。

## 涉及的代码
| 文件 | 作用 |
|---|---|
| `src/lib/cloud-config.ts` | 首屏只带这一点：有没有配置、本机有没有登录过。没登录的人不下载 supabase-js |
| `src/lib/cloud.ts` | 邮箱 + 密码注册（6 位验证码）、登录、找回密码（6 位找回码）、拉 / 合并 / 推、改动后 4 秒防抖增量上传，回到前台 / 联网时拉一次 |
| `src/lib/cloud-merge.ts` | 合并规则（纯函数，`src/lib/v13.test.ts` 覆盖） |
| `src/lib/store.ts` `trackTombs` | 每次提交时，消失的卡片记一条墓碑（`state.tomb[词] = 删除时刻`）；撤销删除记成负数（复活），比云端旧墓碑新 |
| `src/routes/account.tsx` | 登录 / 注册 / 验证码 / 找回密码 / 已登录状态页 |
| `migrations/20261014000000_vocab_sync.sql` | 两张表 + RLS + 服务端按 ts 把关的 `vocab_push_cards` |
| `functions/sb-api/[[path]].js` | Cloudflare Pages 的同域代理 |

## 合并规则
- 每个词一行（`vocab_cards`：`user_id, word, card, ts`），按最后作答时间 `ts`，更晚的赢；服务端 `vocab_push_cards` 也按 ts 把关，旧设备晚到的写入不覆盖新的。
- **墓碑**：重置单词、批量重置、撤销第一次作答、清空数据 → 上传成 `card = null` 的一行，`ts` = 删除时刻；ts 相同删除赢。别的设备同步后这个词也删掉，不会再「复活」。
- 其余记录（打卡、日志、词单…）在 `vocab_profile.meta` 里取并集；乱序种子 `seed` 跟账号走（第二台设备登录后用账号的顺序）。`meta` 里不带墓碑。
- 第一次登录：本机进度和云端合并，两边都不丢。退出登录：本机记录保留，只是不再同步。

## 真实测试（2026-10-14 23:10，本地预览 + 线上云端）
`python3 /workspace/work/v13/cloud_real.py`（结果写 `/workspace/work/v13/cloud-real.json`）：mail.tm 一次性邮箱注册 → 收 6 位验证码 → 登录 → 上传 → 第二个浏览器登录看到进度和种子 → 重置一个词 → 墓碑上云 → 另一个浏览器同步后这个词没了 → 第二个用户试读 / 写 / 改 / 删第一个用户的行被 RLS 挡住 → 匿名推送写不进 → 清理。**20/20 通过**，用了 2 封验证码邮件。

清理测试数据（只删测试用户的行；测试账号本身留在 `auth.users` 里，邮箱都是 `q1f730-*@maxxspace.com` / `meoo-e2e-*`）：
```bash
meoo db query "delete from public.vocab_cards  where user_id in (select id from auth.users where email like 'q1f730-%@maxxspace.com')"
meoo db query "delete from public.vocab_profile where user_id in (select id from auth.users where email like 'q1f730-%@maxxspace.com')"
```

## 发布（要他确认后再做）
沙箱里先：`export PATH=/workspace/.npm-global/bin:$PATH NODE_USE_ENV_PROXY=1`，`mkdir -p ~/.meoo && cp /workspace/.meoo/credentials.json ~/.meoo/`。
1. `pnpm build`（`.env` 在 → 云同步开；会先跑 `tsc --noEmit`）。e2e 会临时改 `dist/sw.js`，**跑过 e2e 的 dist 要重新构建再发**。
2. Meoo：`meoo deploy --skip-build --skip-push --force`。
3. Cloudflare Pages：见 `docs/deploy-cloudflare.md`。
4. 上线后各用一个测试邮箱在两个域名上注册 / 登录一次，学 2 个词，换浏览器核对。

不要再跑 `meoo cloud enable`（已经开了）。`meoo cloud enable-register-login` 是幂等的，但需要激活时会重启云服务（约 5 分钟内注册接口不可用）。

## 回滚
- 只想关掉同步：`CET4V_CLOUD=0 pnpm build` 再发布。用户本机记录不受影响（localStorage 一直是主数据源）。
- 表可以留着；`on delete cascade` 保证删用户时连带删掉他的行。
