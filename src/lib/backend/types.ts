/**
 * 13.0.0 · 后端适配层：账号 + 同步只通过这个接口说话，合并 / 墓碑规则（cloud-merge.ts）和自动同步（cloud.ts）不关心背后是谁。
 * 构建时选一个（BACKEND=supabase | cloudflare，见 vite.config.ts），各自懒加载：没登录的人一个字节都不多下载。
 *  - supabase：Meoo Cloud（gz58y2647ucx.meoo.run），邮箱验证码注册，supabase-js
 *  - cloudflare：同域 /api（Pages Functions + D1，watercoloreyes.cn），邮箱 + 密码，fetch
 * 两个站点的账号、数据互不相通。
 */
import type { CardRow, CloudSnapshot } from "../cloud-merge";

export type BackendKind = "supabase" | "cloudflare";

export interface SessionUser {
  id: string;
  email?: string;
}

export interface BackendFeatures {
  /** 注册要不要输入邮件里的验证码（supabase：要；cloudflare：不要，注册即登录） */
  signupCode: boolean;
  /** 忘记密码能不能发找回码（cloudflare：站点配了 RESEND_API_KEY 才能） */
  resetCode: boolean;
}

export interface Profile {
  seed: number;
  meta: CloudSnapshot["meta"];
}

export interface Backend {
  kind: BackendKind;
  features(): Promise<BackendFeatures>;
  /** 本机保存的会话（不联网也能答；过期 / 被吊销由下一次请求发现） */
  session(): Promise<SessionUser | null>;
  /** 返回 needsCode = true 时还要 verifySignup；否则已经登录 */
  signUp(email: string, password: string): Promise<{ needsCode: boolean }>;
  verifySignup(email: string, code: string): Promise<SessionUser>;
  resend(email: string): Promise<void>;
  signIn(email: string, password: string): Promise<SessionUser>;
  signOut(): Promise<void>;
  sendRecovery(email: string): Promise<void>;
  resetPassword(email: string, code: string, password: string): Promise<SessionUser>;
  pullCards(uid: string): Promise<CardRow[]>;
  /** 服务端按 ts 把关（更晚的赢；cloudflare 另外 ts 相同墓碑赢） */
  pushCards(rows: CardRow[]): Promise<void>;
  getProfile(uid: string): Promise<Profile | null>;
  putProfile(uid: string, p: Profile): Promise<void>;
}

/** 后端报的错：code 给界面换中文，message 原样留着 */
export class BackendError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
