-- 13.0.0 · Cloudflare 站点（watercoloreyes.cn）自己的数据：D1（SQLite）。和 Meoo Cloud 那边（migrations/2026*.sql）完全独立。
-- 应用：wrangler d1 migrations apply <库名> --remote（本地测试：--local）。wrangler.toml 里 migrations_dir = "migrations/d1"。
-- 「RLS」在这里是代码约定：functions/api 的每条查询都带 WHERE user_id = ?（从验证过的会话里取），见 server/api.ts。

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                       -- crypto.randomUUID()
  email TEXT NOT NULL UNIQUE COLLATE NOCASE, -- 存小写
  pw_hash TEXT NOT NULL,                     -- PBKDF2-SHA256，base64
  pw_salt TEXT NOT NULL,                     -- 每个用户 16 字节随机盐，base64
  pw_iter INTEGER NOT NULL,                  -- 迭代次数（Workers 的 WebCrypto 上限 100000），以后加大时按用户升级
  created_at INTEGER NOT NULL
);

-- 会话：JWT（HS256，JWT_SECRET 签名）里带 jti；这里记着它，退出登录 / 改密码时吊销
CREATE TABLE IF NOT EXISTS sessions (
  jti TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

-- 每个学过的词一行；card = NULL 是墓碑（这个词在 ts 时刻被删掉 / 重置了）
CREATE TABLE IF NOT EXISTS cards (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  word TEXT NOT NULL CHECK (length(word) BETWEEN 1 AND 64),
  card TEXT,                                 -- JSON；NULL = 墓碑
  ts INTEGER NOT NULL,                       -- 最后作答 / 删除时刻（epoch 毫秒）
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, word)
);

-- 每个用户一行：乱序种子 + 其余要合并的记录（打卡、生词本、词单…）
CREATE TABLE IF NOT EXISTS profile (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  seed INTEGER NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

-- 限流：登录失败 / 注册 / 找回码，按邮箱和 IP 计数（滑动窗口，旧行顺手清掉）
CREATE TABLE IF NOT EXISTS auth_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                        -- login | signup | forgot | reset
  key TEXT NOT NULL,                         -- e:<邮箱> 或 ip:<地址>
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_attempts_key ON auth_attempts (kind, key, at);

-- 找回码（只有配了 RESEND_API_KEY 才会用到）：只存哈希
CREATE TABLE IF NOT EXISTS reset_codes (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0
);
