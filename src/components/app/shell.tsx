import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, BookOpen, Flame, Sun, UserRound } from "@/components/app/icons";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useDesk } from "@/lib/media";
import { useApp } from "@/lib/store";
import { getWordsSync, useWords } from "@/lib/data";
import { summarize } from "@/lib/plan";
import { curStreak } from "@/lib/habit";
import { today } from "@/lib/clock";
import { useMemo } from "react";

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
 * 13.1 · 平板（768–1199）：顶部一行字标 + 四个纯文字链接，内容放宽到 48 / 60rem。
 * 电脑（≥ 1200）：同一个 <header> 变成左侧栏——字标、四个栏目（图标 + 字）、底下是连续天数和今天的进度；
 * 内容区用满剩下的宽度（最多 80rem，居中）。同一套 data-testid，手机版面一像素不动。
 */
export function AppShell({ children, sub = false }: { children: ReactNode; sub?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const desk = useDesk();
  return (
    <div className="min-h-dvh bg-paper text-ink xl:pl-60">
      <header className="sticky top-0 z-30 hidden border-b border-rule bg-paper md:block xl:fixed xl:inset-y-0 xl:left-0 xl:w-60 xl:overflow-y-auto xl:border-r xl:border-b-0" data-testid="app-nav">
        <div className="mx-auto flex h-16 max-w-[36rem] items-center gap-6 px-6 md:max-w-[48rem] lg:max-w-[60rem] xl:h-auto xl:min-h-full xl:max-w-none xl:flex-col xl:items-stretch xl:gap-0 xl:px-4 xl:py-6">
          <Link to="/" className="press flex items-center gap-2.5 rounded-md xl:px-2 xl:py-1">
            <Logo className="size-7" />
            <span className="text-[1rem] font-semibold tracking-[-0.01em]">四级单词打卡</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 xl:ml-0 xl:mt-8 xl:flex-col xl:items-stretch xl:gap-0.5" aria-label="主导航">
            {TABS.map((t) => {
              const active = isActive(path, t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  data-testid={`nav-${t.label}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "press relative rounded-md px-3 py-2 text-[0.9375rem] font-medium xl:flex xl:min-h-11 xl:items-center xl:gap-3 xl:py-2.5 xl:text-[1rem]",
                    active ? "text-ink xl:bg-paper-2" : "text-ink-3 hover:text-ink xl:hover:bg-paper-2/70",
                  )}
                >
                  {active && <span className="absolute inset-y-2 left-0 hidden w-[3px] rounded-[1px] bg-ink xl:block" aria-hidden />}
                  <t.icon className="hidden size-[19px] shrink-0 xl:block" strokeWidth={active ? 1.9 : 1.5} />
                  <span className={cn("relative", active && "hl hl-low")}>{t.label}</span>
                </Link>
              );
            })}
          </nav>
          {desk && <SideProgress />}
        </div>
      </header>

      <main
        className={cn(
          "mx-auto w-full max-w-[36rem] px-5 pt-safe max-[380px]:px-4 md:max-w-[48rem] md:px-6 md:pb-20 lg:max-w-[60rem] xl:max-w-[80rem] xl:px-10 xl:pb-16",
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

/**
 * 13.1 · 电脑侧栏底部：连续天数 + 今天的进度（新词 / 复习 / 打卡），一条细墨线做进度条。
 * 只在电脑版渲染（手机不算这一份）。
 */
function SideProgress() {
  const st = useApp();
  const { index } = useWords();
  const day = today();
  const sum = useMemo(() => {
    const idx = index ?? getWordsSync();
    return idx && st.onboarded ? summarize(idx, st, day) : null;
  }, [index, st, day]);
  const s = curStreak(st, day);
  if (!sum) return null;
  const parts = sum.timeMode
    ? [{ label: "今日学习", v: `${Math.floor(sum.ms / 60000)}/${sum.goalMin} 分钟`, p: Math.min(1, sum.ms / Math.max(1, sum.goalMin * 60000)) }]
    : [
        { label: "新词", v: sum.goal ? `${Math.min(sum.learned, sum.goal)}/${sum.goal}` : "—", p: sum.goal ? Math.min(1, sum.learned / sum.goal) : 1 },
        { label: "复习", v: sum.due + sum.reviewed ? `${sum.reviewed}/${sum.reviewed + sum.due}` : "—", p: sum.due + sum.reviewed ? sum.reviewed / (sum.reviewed + sum.due) : 1 },
      ];
  return (
    <div className="mt-auto border-t border-rule px-2 pt-5" data-testid="side-progress">
      <div className="flex items-baseline gap-1.5" data-testid="side-streak" data-streak={s}>
        <Flame className={cn("size-4 translate-y-[2px] text-ink-2", s > 0 && "fill-mark")} />
        <span className="tnum font-serif text-[2rem] leading-none">{s}</span>
        <span className="text-[0.8125rem] text-ink-3">天连续打卡</span>
      </div>
      <div className="mt-4 space-y-3" data-testid="side-today">
        {parts.map((x) => (
          <div key={x.label}>
            <div className="flex items-baseline justify-between text-[0.8125rem]">
              <span className="text-ink-2">{x.label}</span>
              <span className="tnum font-serif text-[1rem] text-ink">{x.v}</span>
            </div>
            <div className="mt-1.5 h-[3px] overflow-hidden rounded-[1px] bg-rule" aria-hidden>
              <div className="h-full bg-ink" style={{ width: `${Math.round(x.p * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[0.75rem] text-ink-3" data-testid="side-checkin">
        {sum.checked ? <span className="hl font-medium text-ink">今日已打卡</span> : sum.ready ? "任务完成了，去首页打卡" : "今天还没打卡"}
      </p>
    </div>
  );
}

/** 页头：上面一行小字（日期 / 说明），下面是页名。页名是全页最大的中文 */
export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 pb-6 pt-7 md:pt-10">
      <div className="min-w-0">
        {sub && <div className="mb-1 text-[0.8125rem] text-ink-3">{sub}</div>}
        <h1 className="song text-[1.75rem] leading-[1.15]">{title}</h1>
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
      <h2 className="song text-[1.0625rem]">{children}</h2>
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
