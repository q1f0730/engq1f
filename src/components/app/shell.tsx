import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, BookOpen, Sun, UserRound } from "@/components/app/icons";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const TABS = [
  { to: "/", label: "今日", icon: Sun },
  { to: "/words", label: "词库", icon: BookOpen },
  { to: "/stats", label: "统计", icon: BarChart3 },
  { to: "/me", label: "我的", icon: UserRound },
] as const;

/** 12.0 · 标志：墨色方块里一张索引卡，荧光笔划过第一行 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <rect width="512" height="512" rx="112" fill="#1a1a18" />
      <rect x="112" y="128" width="288" height="256" rx="18" fill="#fcfcfa" />
      <rect x="148" y="214" width="196" height="54" rx="6" fill="#f2e05a" />
      <path d="M156 252h188M156 312h128" stroke="#1a1a18" strokeWidth="22" strokeLinecap="round" />
      <path d="M156 184h72" stroke="#1a1a18" strokeOpacity=".35" strokeWidth="14" strokeLinecap="round" />
    </svg>
  );
}

function isActive(path: string, to: string) {
  if (to === "/words" && path.startsWith("/syn")) return true; // 同义词组属于词库
  if (to === "/me" && (path.startsWith("/algo") || path.startsWith("/data") || path.startsWith("/advanced") || path.startsWith("/lab"))) return true; // 算法说明、数据中心属于我的
  return to === "/" ? path === "/" : path.startsWith(to);
}

/**
 * 12.0 · 外壳。
 * 手机：页面就是一张纸，底部一条安静的标签栏（细线 + 纸色，没有毛玻璃药丸）；选中项文字下面一道荧光笔。
 * 桌面：顶部一行字标 + 四个纯文字链接，内容收在 36rem 的「放大的手机」里。
 */
export function AppShell({ children, sub = false }: { children: ReactNode; sub?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-30 hidden border-b border-rule bg-paper md:block">
        <div className="mx-auto flex h-16 max-w-[36rem] items-center gap-6 px-6 lg:max-w-[40rem]">
          <Link to="/" className="press flex items-center gap-2.5 rounded-md">
            <Logo className="size-7" />
            <span className="text-[1rem] font-semibold tracking-[-0.01em]">四级单词打卡</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1" aria-label="主导航">
            {TABS.map((t) => {
              const active = isActive(path, t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  data-testid={`nav-${t.label}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "press relative rounded-md px-3 py-2 text-[0.9375rem] font-medium",
                    active ? "text-ink" : "text-ink-3 hover:text-ink",
                  )}
                >
                  <span className={cn("relative", active && "hl hl-low")}>{t.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main
        className={cn(
          "mx-auto w-full max-w-[36rem] px-5 pt-safe max-[380px]:px-4 md:px-6 md:pb-20 lg:max-w-[40rem]",
          sub ? "pb-[calc(env(safe-area-inset-bottom)+2.5rem)]" : "pb-[calc(4rem+env(safe-area-inset-bottom)+2.5rem)]",
        )}
        data-testid="shell-main"
        data-sub={sub ? 1 : 0}
      >
        {children}
      </main>

      {/* 手机底部标签栏（二级页不显示，只用左上角返回） */}
      {!sub && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper pb-safe md:hidden" aria-label="底部导航">
          <div className="mx-auto grid h-16 max-w-md grid-cols-4">
            {TABS.map((t) => {
              const active = isActive(path, t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  data-testid={`tab-${t.label}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "press flex flex-col items-center justify-center gap-[3px] text-[0.6875rem] font-medium",
                    active ? "text-ink" : "text-ink-3",
                  )}
                >
                  <t.icon className="size-[22px]" strokeWidth={active ? 1.9 : 1.5} />
                  <span className="relative px-1 leading-none">
                    {active && <span className="absolute inset-x-0 bottom-[-1px] h-[5px] rounded-[1px] bg-mark" aria-hidden />}
                    <span className="relative">{t.label}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

/** 页头：上面一行小字（日期 / 说明），下面是页名。页名是全页最大的中文 */
export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 pb-6 pt-7 md:pt-10">
      <div className="min-w-0">
        {sub && <div className="mb-1 text-[0.8125rem] text-ink-3">{sub}</div>}
        <h1 className="text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em]">{title}</h1>
      </div>
      {right}
    </div>
  );
}

/** 分区：不再是白卡片。上方一条细线、上下留白，像词典里的一栏 */
export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={cn("min-w-0 border-t border-rule pb-2 pt-5", className)} {...rest}>
      {children}
    </section>
  );
}

export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">{children}</h2>
      {right && <div className="shrink-0 text-[0.8125rem] text-ink-3">{right}</div>}
    </div>
  );
}

/** 分段控件：细线框里一排选项，选中的是墨色块 */
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
    <div role="radiogroup" className={cn("flex gap-0.5 rounded-lg p-0.5 ring-1 ring-rule-strong ring-inset", className)} data-testid={testid}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "press min-h-9 min-w-0 flex-1 truncate rounded-md px-2.5 py-1.5 text-[0.8125rem] font-medium",
            o.value === value ? "bg-ink text-paper-3" : "text-ink-2 hover:bg-paper-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 加载：一道荧光笔在细线上来回划，不用转圈 */
export function Spinner({ label = "加载词库…" }: { label?: string }) {
  return (
    <div className="grid min-h-[50dvh] place-items-center text-[0.875rem] text-ink-3" role="status">
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-[3px] w-20 overflow-hidden rounded-full bg-rule" aria-hidden>
          <div className="loading-sweep absolute inset-y-0 left-0 w-1/2 rounded-full bg-ink" />
        </div>
        {label}
      </div>
    </div>
  );
}
