import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, BookOpen, Sun, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const TABS = [
  { to: "/", label: "今日", icon: Sun },
  { to: "/words", label: "词库", icon: BookOpen },
  { to: "/stats", label: "统计", icon: BarChart3 },
  { to: "/me", label: "我的", icon: UserRound },
] as const;

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ee6a3c" />
          <stop offset="1" stopColor="#c7362a" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#lg)" />
      <rect x="150" y="104" width="236" height="300" rx="36" fill="#fff" opacity=".28" transform="rotate(8 268 254)" />
      <rect x="126" y="112" width="236" height="300" rx="36" fill="#fff" />
      <path d="M182 268l46 46 92-104" fill="none" stroke="#d9452c" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="386" cy="122" r="30" fill="#ffd166" />
    </svg>
  );
}

function isActive(path: string, to: string) {
  if (to === "/words" && path.startsWith("/syn")) return true; // 同义词组属于词库
  if (to === "/me" && (path.startsWith("/algo") || path.startsWith("/data"))) return true; // 算法说明、数据中心属于我的
  return to === "/" ? path === "/" : path.startsWith(to);
}

export function AppShell({ children, sub = false }: { children: ReactNode; sub?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-dvh">
      {/* 桌面顶栏 */}
      <header className="sticky top-0 z-30 hidden border-b border-border/70 bg-background/80 backdrop-blur-xl md:block">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo className="size-8" />
            <span className="font-display text-[17px] font-bold tracking-tight">四级单词打卡</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 rounded-full bg-secondary p-1" aria-label="主导航">
            {TABS.map((t) => {
              const active = isActive(path, t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  data-testid={`nav-${t.label}`}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <t.icon className="size-4" />
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main
        className={cn("mx-auto w-full max-w-5xl px-4 pt-safe md:px-6 md:pb-16", sub ? "pb-[calc(env(safe-area-inset-bottom)+2rem)]" : "pb-[calc(4rem+env(safe-area-inset-bottom)+2rem)]")}
        data-testid="shell-main"
        data-sub={sub ? 1 : 0}
      >
        {children}
      </main>

      {/* 手机底部标签栏（11.1 · 二级页不显示，只用左上角返回） */}
      {!sub && <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/85 pb-safe backdrop-blur-xl md:hidden"
        aria-label="底部导航"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-4">
          {TABS.map((t) => {
            const active = isActive(path, t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                data-testid={`tab-${t.label}`}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-12 place-items-center rounded-full transition-colors",
                    active && "bg-brand-soft",
                  )}
                >
                  <t.icon className="size-[19px]" strokeWidth={active ? 2.4 : 2} />
                </span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>}
    </div>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 pb-4 pt-6 md:pt-8">
      <div className="min-w-0">
        {sub && <div className="text-[13px] font-medium text-muted-foreground">{sub}</div>}
        <h1 className="font-display text-[28px] font-extrabold leading-tight tracking-tight md:text-[32px]">{title}</h1>
      </div>
      {right}
    </div>
  );
}

export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={cn("min-w-0 rounded-3xl border border-border/70 bg-card p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]", className)} {...rest}>
      {children}
    </section>
  );
}

export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[15px] font-bold tracking-tight">{children}</h2>
      {right}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
  testid,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
  testid?: string;
}) {
  return (
    <div role="radiogroup" className={cn("flex gap-1 rounded-2xl bg-secondary p-1", className)} data-testid={testid}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-w-0 flex-1 truncate rounded-xl px-2.5 py-1.5 text-[13px] font-medium transition-all",
            o.value === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ label = "加载词库…" }: { label?: string }) {
  return (
    <div className="grid min-h-[50dvh] place-items-center text-sm text-muted-foreground">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-[3px] border-primary/25 border-t-primary" />
        {label}
      </div>
    </div>
  );
}
