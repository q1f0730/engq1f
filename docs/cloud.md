# 账号与云同步：上线步骤

13.0.0 的云同步代码已经在仓库里，但**没有上线**：构建时没有 `CET4V_CLOUD=1`，产物是纯本机版，「我的 → 数据与备份 → 账号」显示「云同步还没开通」。
原因：这个 Meoo 账号的云服务额度已满（QUOTA_EXCEEDED），`meoo cloud enable` 开不出新实例。

## 涉及的代码
| 文件 | 作用 |
|---|---|
| `src/lib/cloud-config.ts` | 首屏只带这一点：有没有配置、本机有没有登录过。没登录的人不下载 supabase-js |
| `src/lib/cloud.ts` | 邮箱 + 密码注册（6 位验证码）、登录、找回密码、拉 / 合并 / 推、4 秒防抖增量上传 |
| `src/lib/cloud-merge.ts` | 合并规则（纯函数，`src/lib/v13.test.ts` 覆盖）：每个词按最后作答时间 ts，更晚的赢；**墓碑**：删除 / 重置的词上传成 `card = null` 的一行，ts = 删除时刻，ts 相同删除赢 |
| `migrations/20261014000000_vocab_sync.sql` | 两张表 `vocab_profile`、`vocab_cards` + RLS + `vocab_push_cards(rows jsonb)`（服务端按 ts 把关，旧设备晚到的写入不覆盖新的） |
| `src/routes/account.tsx` | 登录 / 注册 / 验证码 / 找回密码 / 已登录状态页 |
| `vite.config.ts` | `CET4V_CLOUD=1` 时把 `.env` 里的 `SUPABASE_URL` / `SUPABASE_ANON_KEY` 编进产物（anon key 本来就是公开的，RLS 把关；service role key 永远不进前端）。没有 URL 时用同域 `/sb-api`（Meoo 静态部署的代理） |

## 上线步骤（按顺序）
所有命令在仓库根目录跑。沙箱里先：`export PATH=/workspace/.npm-global/bin:$PATH NODE_USE_ENV_PROXY=1`，并恢复登录 `mkdir -p ~/.meoo && cp /workspace/.meoo/credentials.json ~/.meoo/`。

1. **腾出一个云服务名额，或升级套餐。**
   - 看额度：`meoo account`（云实例数、存储）。
   - 二选一：在 https://meoo.com 关掉一个不用的项目的云服务（会删掉那个项目的数据库，先确认），或按 https://docs.meoo.com/coindesc 升级套餐。
   - 额度报错（QUOTA_EXCEEDED / STORAGE_EXCEEDED）时停下，不要重试或绕开。
2. **确认项目绑定**：`.env` 里的 `MEOO_PROJECT_URL_ID` 是这个应用的项目（`meoo projects list` 核对）。
3. **开云服务**：`meoo cloud enable`，然后 `meoo cloud status` 确认是 running。
4. **拉连接信息**：`meoo cloud pull-env` → `.env` 里出现 `SUPABASE_URL`、`SUPABASE_ANON_KEY`（不要提交 `.env`）。
5. **建表（迁移）**：`meoo db query --file migrations/20261014000000_vocab_sync.sql`，再 `meoo db tables` 确认有 `vocab_profile`、`vocab_cards`。
   （这个迁移文件已经在仓库里，所以用 `db query --file` 执行它；不要再用 `db migrate` 另生成一份。）
6. **开邮箱验证码注册 / 登录**（会重启云服务，所以放在迁移之后、最后做）：
   `meoo cloud enable-register-login --providers email --confirmed-provider-set`
7. **带开关重新构建**：`CET4V_CLOUD=1 pnpm build`（会先跑 `tsc --noEmit`）。
   - 检查：`grep -l "anon" dist/assets/index-*.js` 能找到；`pnpm test` 照常全绿。
   - 一定要在这一步**之后**立刻部署：e2e 会临时改 `dist/sw.js`，跑过 e2e 的 dist 不能直接发。
8. **部署（用刚构建好的 dist，不再在沙箱里构建，不推源码）**：
   `meoo deploy --skip-build --skip-push --force`
9. **上线后验证**：用一个测试邮箱注册 → 收到 6 位验证码 → 登录；学 2 个词，换一个浏览器登录同一账号，进度一致；在一边「重置」一个词，另一边刷新后这个词也没了（墓碑）。

## 回滚
- 只想关掉同步：不带 `CET4V_CLOUD` 重新 `pnpm build`，再 `meoo deploy --skip-build --skip-push --force`。用户本机记录不受影响（localStorage 一直是主数据源）。
- 数据库里的表可以留着；`on delete cascade` 保证删用户时连带删掉他的行。
