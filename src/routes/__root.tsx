import { Navigate, Outlet, createRootRoute, redirect, useRouterState } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app/shell";
import { getState, resolvedTheme, unlockBadges, useApp } from "@/lib/store";
import { BADGES, badgeCtx, newlyEarned } from "@/lib/stats";
import { getWordsSync } from "@/lib/data";
import { today } from "@/lib/clock";
import { toast } from "sonner";
import { applyUpdate, useSwUpdate } from "@/lib/sw";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import { requestPersist } from "@/lib/persist";
import { useAppBadge, useReminder } from "@/lib/nudge";
import { MilestoneOverlay } from "@/components/app/milestone";

const BARE = ["/study", "/welcome", "/test", "/tape", "/quiz"];

function NotFound() {
  return <Navigate to="/" replace />;
}

function ErrorView({ error }: { error: unknown }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-bold">出了点问题</h1>
        <p className="mt-2 text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
        <button className="mt-6 rounded-2xl bg-primary px-6 py-3 font-semibold text-primary-foreground" onClick={() => location.reload()}>
          重新加载
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    if (!getState().onboarded && !["/welcome", "/test"].some((p) => location.pathname.startsWith(p))) {
      throw redirect({ to: "/welcome" });
    }
  },
  component: Root,
  notFoundComponent: NotFound,
  errorComponent: ErrorView,
});

function Root() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const st = useApp();
  const booted = useRef(false);
  const theme = st.settings.theme;
  const bare = BARE.some((p) => path.startsWith(p));
  // 申请持久化存储，避免浏览器清理学习记录
  useEffect(() => {
    void requestPersist();
  }, []);
  // 成就：状态变化时检查有没有新达成的，记下解锁日期并提示
  useEffect(() => {
    if (!st.onboarded) return;
    const ids = newlyEarned(badgeCtx(st, getWordsSync()?.list.length ?? 0), st.badges ?? {});
    if (!ids.length) return;
    unlockBadges(ids, today());
    // 打开应用时就已达成的（例如从旧版本升级）：静默补记，不弹提示
    if (!booted.current) return;
    const names = ids.map((id) => BADGES.find((b) => b.id === id)?.name).filter(Boolean);
    toast.success(`解锁成就：${names.join("、")}`, { description: "去「统计 → 成就」看看", duration: 2600 });
  }, [st.cards, st.checkins, st.quizzes, st.onboarded, st.badges, st.settings.restDay]);
  useEffect(() => {
    booted.current = true;
  }, []);
  // 学习提醒（到点发通知）与图标角标（待复习数）
  useReminder(st.settings.remindAt ?? "", st.onboarded);
  useAppBadge(st);
  return (
    <>
      {bare ? <Outlet /> : <AppShell><Outlet /></AppShell>}
      <UpdatePrompt bare={bare} />
      <MilestoneOverlay />
      {/* 有底栏的页面：底部居中、浮在标签栏之上；学习/测试页底部是作答按钮，放顶部（让开刘海） */}
      <Toaster
        position={bare ? "top-center" : "bottom-center"}
        offset={bare ? { top: "var(--toast-top)" } : { bottom: "var(--toast-bottom)" }}
        mobileOffset={bare ? { top: "var(--toast-top)" } : { bottom: "var(--toast-bottom)" }}
        theme={resolvedTheme(theme)}
        duration={1600}
      />
    </>
  );
}

/** 新版本已下载、等待接管时的小提示 */
function UpdatePrompt({ bare }: { bare: boolean }) {
  const ready = useSwUpdate();
  if (!ready) return null;
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4",
        bare ? "top-[var(--toast-top)]" : "bottom-[var(--toast-bottom)]",
      )}
    >
      <button
        type="button"
        onClick={applyUpdate}
        data-testid="sw-update"
        className="pop pointer-events-auto flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2.5 text-[13px] font-semibold shadow-[0_10px_30px_-12px_rgba(40,20,10,0.35)]"
      >
        <RefreshCw className="size-4 text-primary" />
        有新版本，点击刷新
      </button>
    </div>
  );
}
