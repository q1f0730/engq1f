import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { PageHeader } from "@/components/app/shell";
import { toast } from "@/lib/toast";
import { cloudConfig, hasSession } from "@/lib/cloud-config";
import {
  cnError,
  features,
  getCloudStatus,
  resend,
  resetPassword,
  resume,
  sendRecovery,
  signIn,
  signOut,
  signUp,
  subscribeCloud,
  syncNow,
  verifySignup,
} from "@/lib/cloud";
import { cn } from "@/lib/utils";
import type { BackendFeatures } from "@/lib/backend/types";

export const Route = createFileRoute("/account")({ component: AccountPage });

type Step = "login" | "register" | "verify" | "forgot" | "reset";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** 验证码 5 分钟有效；重发间隔 60 秒 */
const CODE_TTL = 5 * 60 * 1000;
const RESEND_GAP = 60;

function useCloud() {
  return useSyncExternalStore(subscribeCloud, getCloudStatus, getCloudStatus);
}

function AccountPage() {
  const cfg = cloudConfig();
  const status = useCloud();
  useEffect(() => {
    if (cfg && hasSession() && status.phase === "signed-out") void resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div data-testid="account" className="mx-auto max-w-md">
      <PageHeader title="账号与同步" sub="登录后，学习进度在你的手机之间同步" />
      {!cfg ? <NoCloud /> : status.email && status.phase !== "signed-out" ? <SignedIn /> : <AuthForms />}
      <p className="mt-10 text-[0.75rem] leading-relaxed text-ink-3">
        不登录也能一直用：记录存在这台手机上，离线可用。登录后第一次同步会把这台手机上的进度并进账号，两边都不丢；之后同一个词以最后一次作答的那台设备为准。
      </p>
    </div>
  );
}

function NoCloud() {
  return (
    <section className="border-y border-rule py-5" data-testid="account-off">
      <h2 className="song text-[1.25rem]">云同步还没开通</h2>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-2">这一版只在本机保存记录。换手机前请在「我的 → 数据与备份」里导出备份，到新手机上导入。</p>
      <Link to="/me" className="press mt-4 inline-flex h-11 items-center rounded-[4px] px-4 text-[0.875rem] font-semibold ring-1 ring-inset ring-rule-strong hover:bg-paper-2">
        去备份
      </Link>
    </section>
  );
}

function SignedIn() {
  const s = useCloud();
  const [busy, setBusy] = useState(false);
  const when = s.at ? new Date(s.at) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <section data-testid="account-in" className="border-t border-rule">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-rule py-3">
        <span className="min-w-0">
          <span className="block text-[0.75rem] text-ink-3">已登录</span>
          <span className="block truncate font-serif text-[1.25rem]" data-testid="account-email">
            {s.email}
          </span>
        </span>
        <span
          data-testid="sync-phase"
          data-phase={s.phase}
          className={cn("shrink-0 text-[0.8125rem]", s.phase === "error" ? "text-forget" : s.phase === "offline" ? "text-vague" : "text-ink-2")}
        >
          {s.phase === "syncing" ? "同步中…" : s.phase === "error" ? "同步失败" : s.phase === "offline" ? "离线" : when ? `已同步 · ${pad(when.getHours())}:${pad(when.getMinutes())}` : "待同步"}
        </span>
      </div>
      {s.message && (
        <p className="border-b border-rule py-2.5 text-[0.8125rem] text-ink-2" data-testid="sync-message">
          {s.message}
        </p>
      )}
      {s.last && (
        <p className="border-b border-rule py-2.5 text-[0.8125rem] text-ink-2" data-testid="sync-last">
          上次：从云端拿到 {s.last.pulled} 个词，上传 {s.last.pushed} 个{s.last.conflicts ? `，${s.last.conflicts} 个两边都改过、按最后作答时间取了较新的` : ""}{s.last.deleted ? `，${s.last.deleted} 个在别的设备上删掉 / 重置了，这里也删了` : ""}
        </p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="sync-now"
          disabled={busy || s.phase === "syncing"}
          onClick={() => {
            setBusy(true);
            syncNow()
              .then(() => toast.success("已同步"))
              .catch((e) => toast.error(cnError(e)))
              .finally(() => setBusy(false));
          }}
          className="btn-ink press h-12 rounded-[4px] text-[0.9375rem] font-semibold disabled:opacity-60"
        >
          立即同步
        </button>
        <button
          type="button"
          data-testid="sign-out"
          onClick={() => void signOut().then(() => toast.success("已退出登录", { description: "这台手机上的记录还在" }))}
          className="press h-12 rounded-[4px] text-[0.9375rem] font-semibold ring-1 ring-inset ring-rule-strong hover:bg-paper-2"
        >
          退出登录
        </button>
      </div>
    </section>
  );
}

/** 13.0.0 · 这个站点的账号能力（supabase：注册验证码 + 找回码；cloudflare：注册即登录，配了邮件服务才有找回码） */
function useFeatures(): BackendFeatures | null {
  const [f, setF] = useState<BackendFeatures | null>(null);
  useEffect(() => {
    let alive = true;
    features()
      .then((x) => alive && setF(x))
      .catch(() => alive && setF({ signupCode: false, resetCode: false }));
    return () => {
      alive = false;
    };
  }, []);
  return f;
}

function AuthForms() {
  const feats = useFeatures();
  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!sentAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sentAt]);
  const wait = Math.max(0, RESEND_GAP - Math.floor((now - sentAt) / 1000));
  const expired = !!sentAt && now - sentAt > CODE_TTL;

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      setErr(cnError(e));
    } finally {
      setBusy(false);
    }
  };
  const emailOk = EMAIL_RE.test(email.trim());
  const pwOk = password.length >= 6;
  const go = (s: Step) => {
    setErr(null);
    setCode("");
    setStep(s);
  };

  const tabs = (
    <div className="mb-5 flex gap-6 border-b border-rule" role="tablist">
      {(["login", "register"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={step === t}
          data-testid={`auth-tab-${t}`}
          onClick={() => go(t)}
          className={cn("press relative h-11 text-[0.9375rem] font-medium", step === t ? "text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:bg-ink" : "text-ink-3")}
        >
          {t === "login" ? "登录" : "注册"}
        </button>
      ))}
    </div>
  );

  const emailField = (
    <label className="block">
      <span className="text-[0.8125rem] text-ink-2">邮箱</span>
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        data-testid="auth-email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="field mt-1 h-12 w-full"
        placeholder="you@example.com"
      />
    </label>
  );
  const pwField = (label: string, auto: string) => (
    <label className="mt-3 block">
      <span className="text-[0.8125rem] text-ink-2">{label}</span>
      <input
        type="password"
        autoComplete={auto}
        data-testid="auth-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="field mt-1 h-12 w-full"
        placeholder="至少 6 位"
      />
    </label>
  );
  const codeField = (
    <label className="mt-3 block">
      <span className="text-[0.8125rem] text-ink-2">邮件里的 6 位验证码</span>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        data-testid="auth-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="field tnum mt-1 h-12 w-full font-serif text-[1.5rem] tracking-[0.3em]"
        placeholder="······"
      />
    </label>
  );
  const error = err && (
    <p className="mt-3 text-[0.8125rem] text-forget" role="alert" data-testid="auth-error">
      {err}
    </p>
  );
  const primary = (label: string, onClick: () => void, disabled: boolean, testid: string) => (
    <button type="button" data-testid={testid} disabled={disabled || busy} onClick={onClick} className="btn-ink press mt-5 h-12 w-full rounded-[4px] text-[0.9375rem] font-semibold disabled:opacity-50">
      {busy ? "请稍候…" : label}
    </button>
  );
  const resendBtn = (fn: () => Promise<void>) => (
    <div className="mt-3 flex items-center justify-between text-[0.8125rem]">
      <span className={cn(expired ? "text-vague" : "text-ink-3")} data-testid="code-ttl">
        {expired ? "验证码过期了，请重新发送" : "验证码 5 分钟内有效"}
      </span>
      <button type="button" data-testid="auth-resend" disabled={wait > 0 || busy} onClick={() => void run(async () => (await fn(), setSentAt(Date.now())), "已重新发送")} className="press h-10 font-medium text-ink underline decoration-rule-strong underline-offset-4 disabled:text-ink-3 disabled:no-underline">
        {wait > 0 ? `${wait} 秒后可重发` : "重新发送"}
      </button>
    </div>
  );

  if (step === "verify")
    return (
      <section data-testid="auth-verify">
        <h2 className="song text-[1.25rem]">验证邮箱</h2>
        <p className="mt-1.5 text-[0.875rem] text-ink-2">验证码已经发到 {email.trim()}。</p>
        {codeField}
        {resendBtn(() => resend(email.trim()))}
        {error}
        {primary("验证并登录", () => void run(() => verifySignup(email.trim(), code), "注册成功，已开始同步"), code.length !== 6, "auth-verify-go")}
        <button type="button" onClick={() => go("register")} className="press mt-2 h-11 w-full text-[0.8125rem] text-ink-3">
          ‹ 换个邮箱
        </button>
      </section>
    );

  if ((step === "forgot" || step === "reset") && feats && !feats.resetCode)
    return (
      <section data-testid="auth-forgot-off">
        <h2 className="song text-[1.25rem]">找回密码</h2>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-2">
          这个站点还没接邮件服务，暂时没法把找回码发到你的邮箱。记得密码的话直接登录；不记得的话，可以换个邮箱重新注册，再在「我的 → 数据与备份」里用本机的记录接着学。
        </p>
        <button type="button" onClick={() => go("login")} className="press mt-4 h-11 w-full text-[0.8125rem] text-ink-3">
          ‹ 回到登录
        </button>
      </section>
    );

  if (step === "forgot" || step === "reset")
    return (
      <section data-testid="auth-forgot">
        <h2 className="song text-[1.25rem]">找回密码</h2>
        {emailField}
        {step === "reset" && (
          <>
            {codeField}
            {pwField("新密码", "new-password")}
            {resendBtn(() => sendRecovery(email.trim()))}
          </>
        )}
        {error}
        {step === "forgot"
          ? primary("发送找回验证码", () => void run(async () => (await sendRecovery(email.trim()), setSentAt(Date.now()), setStep("reset"))), !emailOk, "auth-forgot-go")
          : primary("重设密码并登录", () => void run(() => resetPassword(email.trim(), code, password), "密码已重设"), code.length !== 6 || !pwOk, "auth-reset-go")}
        <button type="button" onClick={() => go("login")} className="press mt-2 h-11 w-full text-[0.8125rem] text-ink-3">
          ‹ 回到登录
        </button>
      </section>
    );

  return (
    <section data-testid={`auth-${step}`}>
      {tabs}
      {emailField}
      {pwField("密码", step === "login" ? "current-password" : "new-password")}
      {error}
      {step === "login"
        ? primary("登录", () => void run(() => signIn(email.trim(), password), "已登录，正在同步"), !emailOk || !pwOk, "auth-login-go")
        : primary(
            feats && !feats.signupCode ? "注册并登录" : "注册并发送验证码",
            () =>
              void run(async () => {
                const r = await signUp(email.trim(), password);
                if (r.needsCode) {
                  setSentAt(Date.now());
                  setStep("verify");
                } else toast.success("注册成功，已开始同步");
              }),
            !emailOk || !pwOk || !feats,
            "auth-register-go",
          )}
      {step === "login" && (
        <button type="button" data-testid="auth-forgot-link" onClick={() => go("forgot")} className="press mt-2 h-11 w-full text-[0.8125rem] text-ink-3 hover:text-ink">
          忘记密码？
        </button>
      )}
    </section>
  );
}
