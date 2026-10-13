import { Navigate, Outlet, createRootRoute, redirect, useRouter, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { useToasterWanted, wantToaster } from "@/lib/toast";
// 11.3 · 提示条第一次用到时才加载
const Toaster = lazy(() => import("@/components/ui/sonner"));
import { AppShell } from "@/components/app/shell";
import { creditMissed, exportBackup, getState, resolvedTheme, unlockBadges, useApp } from "@/lib/store";
import { addDays } from "@/lib/srs";
import { ACTIVE_PROFILE } from "@/lib/profiles";
import { BADGES, badgeCtx, newlyEarned } from "@/lib/stats";
import { getWordsSync } from "@/lib/data";
import { today } from "@/lib/clock";
import { toast } from "@/lib/toast";
import { applyUpdate, useSwUpdate } from "@/lib/sw";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import { requestPersist } from "@/lib/persist";
import { useAppBadge, useReminder } from "@/lib/nudge";
import { MilestoneOverlay } from "@/components/app/milestone";
import { LoadFailed, Rescue, clearRetry, isChunkError } from "@/components/app/rescue";
import { useSheetOpen } from "@/lib/back-stack";
import { onExternalChange, setDayRuleSource } from "@/lib/store";
import { dayRuleOf, summarize } from "@/lib/plan";

// 11.5 · 当天中途改设置时，store 按改完的设置重算今天的快照（需要词库）
setDayRuleSource((st, d) => {
  const idx = getWordsSync();
  if (!idx) return null;
  const s = summarize(idx, st, d);
  return { rule: dayRuleOf(s), ready: s.ready, checked: s.checked };
});

const BARE = ["/study", "/welcome", "/test", "/tape", "/quiz", "/match", "/judge"];
/** 11.1 · 二级页：不显示底部标签栏（只用左上角返回一种导航） */
const SUB = ["/data", "/algo", "/syn", "/advanced", "/lab"];

function NotFound() {
  return <Navigate to="/" replace />;
}

function ErrorView({ error, reset }: { error: unknown; reset?: () => void }) {
  const router = useRouter();
  // 11.2 · 代码块没下载下来 ≠ 记录坏了：只给重试
  if (isChunkError(error))
    return (
      <LoadFailed
        message={String((error as Error)?.message ?? "")}
        onRetry={() => {
          // 浏览器会记住一次失败的动态 import（同一个地址再 import 还是失败）：重新加载页面才是真的重试
          void reset;
          void router;
          location.reload();
        }}
      />
    );
  // 11.1 · 不依赖主界面的救援页：回滚到快照 / 导出原始数据
  return <Rescue message={String((error as Error)?.message ?? error)} />;
}

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    if (!getState().onboarded && !["/welcome", "/test", "/list-link"].some((p) => location.pathname.startsWith(p))) {
      throw redirect({ to: "/welcome" });
    }
    // 11.2 · 已经完成引导的人打开 #/welcome（返回键 / 旧链接）：直接回首页，不再重走引导、覆盖计划
    if (getState().onboarded && location.pathname === "/welcome") throw redirect({ to: "/", replace: true });
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
  // 11.1 · 有弹层开着时 toast 挪到顶部，不挡弹层底部的主按钮
  const sheetOpen = useSheetOpen();
  const top = bare || sheetOpen;
  // 11.1 · 多窗口：别的窗口改了记录 → 已同步 / 已合并，提示一次（固定 id 去重）
  useEffect(
    () =>
      onExternalChange((why) =>
        toast(why === "replace" ? "记录在另一个窗口被整份替换了" : why === "merge" ? "另一个窗口也改了记录，已合并，两边的进度都保留" : "另一个窗口更新了学习记录，已同步", {
          id: "multi-tab",
          description: "同时开着多个窗口时，记录会自动合并",
          duration: 3000,
        }),
      ),
    [],
  );
  // 11.3 · 任务达标 = 打卡：打开（或切回前台）时把最近几天达标却没点打卡的日子补上，并说一声
  useEffect(() => {
    if (!st.onboarded) return;
    const run = () => {
      const d = today();
      const r = creditMissed(d);
      if (!r.days.length) return;
      const y = r.days.includes(addDays(d, -1));
      const md = (x: string) => `${Number(x.slice(5, 7))}/${Number(x.slice(8))}`;
      toast.success(y && r.days.length === 1 ? "昨天的任务完成了，已帮你打卡" : `${r.days.map(md).join("、")} 的任务完成了，已帮你补上打卡`, {
        id: "auto-credit",
        description: r.streak > 0 ? `连续 ${r.streak} 天` : undefined,
        duration: 3200,
      });
    };
    run();
    const vis = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("focus", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("focus", vis);
    };
    // 换页面时也看一眼（学完一组、过了 0 点直接点回首页）
  }, [st.onboarded, path]);
  // 11.3 · 页面成功打开了：清掉「加载失败自动重试」的计数
  useEffect(() => {
    const t = setTimeout(() => {
      if (!document.querySelector('[data-testid="load-failed"]')) clearRetry();
    }, 1500);
    return () => clearTimeout(t);
  }, [path]);
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
  // v11 · 自动快照：每天第一次打开（或切回前台）时存一份，延后执行，不占首屏
  useEffect(() => {
    if (!st.onboarded) return;
    const run = () => {
      const s = getState();
      if (!Object.keys(s.cards).length && !s.checkins.length) return;
      import("@/lib/snapshots")
        .then((m) => m.autoSnapshot(ACTIVE_PROFILE, today(), exportBackup, Object.keys(s.cards).length))
        .catch(() => {});
    };
    const t = setTimeout(run, 2500);
    const vis = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [st.onboarded]);
  // 11.3 · 提示条：第一次 toast 时加载；首页空闲 4 秒后也预热一下（第一次提示不用等下载）
  const toasterOn = useToasterWanted();
  useEffect(() => {
    const t = setTimeout(wantToaster, 4000);
    // 第一次点按就开始加载（点下去到松手之间就下载完了，提示几乎不用等）
    window.addEventListener("pointerdown", wantToaster, { once: true, passive: true });
    window.addEventListener("keydown", wantToaster, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", wantToaster);
      window.removeEventListener("keydown", wantToaster);
    };
  }, []);
  // 学习提醒（到点发通知）与图标角标（待复习数）
  useReminder(st.settings.remindAt ?? "", st.onboarded);
  useAppBadge(st);
  return (
    <>
      {bare ? <Outlet /> : <AppShell sub={SUB.some((p) => path.startsWith(p))}><Outlet /></AppShell>}
      <UpdatePrompt bare={bare} />
      <MilestoneOverlay />
      {/* 有底栏的页面：底部居中、浮在标签栏之上；学习/测试页底部是作答按钮，放顶部（让开刘海） */}
      {toasterOn && (
        <Suspense fallback={null}>
          <Toaster
            position={top ? "top-center" : "bottom-center"}
            offset={top ? { top: "var(--toast-top)" } : { bottom: "var(--toast-bottom)" }}
            mobileOffset={top ? { top: "var(--toast-top)" } : { bottom: "var(--toast-bottom)" }}
            theme={resolvedTheme(theme)}
            duration={1600}
          />
        </Suspense>
      )}
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
