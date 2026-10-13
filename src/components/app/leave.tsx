/**
 * 11.1 · 学习 / 游戏 / 小测进行中：按返回、点 ×、按 Esc 先确认，不直接丢掉这一局。
 * 走路由的拦截（返回键也会被拦住，URL 自动回滚）。
 */
import { useBlocker, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useBackGuard } from "@/lib/back-stack";
import { BottomSheet } from "./sheet";

export type Guard = ReturnType<typeof useLeaveGuard>;

/**
 * active 为真时，离开当前页面要先确认：
 * - 应用里的跳转（× / Esc / 底部 Tab / 链接）：路由拦截（useBlocker），同一路径内换参数不拦；
 * - 返回键 / 返回手势：history 守卫（lib/back-stack 的 useBackGuard），不依赖路由的 index 推算。
 * 直接改地址栏、外部打开链接（GO）不拦。
 */
export function useLeaveGuard(active: boolean) {
  const on = useRef(active);
  on.current = active;
  const bypass = useRef(false);
  const router = useRouter();
  const [back, setBack] = useState(false);
  const guard = useBackGuard(active, () => setBack(true));
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next, action }) => on.current && !bypass.current && action !== "GO" && current.pathname !== next.pathname,
    withResolver: true,
    enableBeforeUnload: false,
  });
  const routed = blocker.status === "blocked";
  return {
    status: routed || back ? "blocked" : "idle",
    reset: () => {
      setBack(false);
      if (routed) blocker.reset?.();
    },
    proceed: () => {
      bypass.current = true;
      if (routed) {
        // × / Esc / Tab：守卫条目作废，再放行这次跳转
        setBack(false);
        guard.disarm();
        blocker.proceed?.();
        return;
      }
      setBack(false);
      // 返回键触发的：真的退回上一页；没有上一页时回首页
      // 兜底：退不动（history 里已经没有更早的记录，返回不会触发 popstate）就回首页。
      // 只看「有没有发生返回」，不看地址：用户可能已经很快又点进了新的一组。
      let moved = false;
      const onPop = () => {
        moved = true;
      };
      window.addEventListener("popstate", onPop, { once: true });
      if (!guard.leave()) {
        window.removeEventListener("popstate", onPop);
        void router.navigate({ to: "/", replace: true });
      } else
        window.setTimeout(() => {
          window.removeEventListener("popstate", onPop);
          if (!moved) void router.navigate({ to: "/", replace: true });
        }, 500);
    },
  };
}

export function LeaveSheet({
  blocker,
  title,
  desc,
  stay = "继续",
  leave = "退出",
  extra,
}: {
  blocker: { status: string; proceed?: () => void; reset?: () => void };
  title: string;
  desc: string;
  stay?: string;
  leave?: string;
  /** 额外的动作（小测：交卷） */
  extra?: { label: string; onClick: () => void; testid: string };
}) {
  const open = blocker.status === "blocked";
  return (
    <BottomSheet open={open} onOpenChange={(v) => !v && blocker.reset?.()} title={title} testid="leave-confirm" noHistory>
      <p className="text-[14px] text-muted-foreground">{desc}</p>
      {extra && (
        <button
          type="button"
          data-testid={extra.testid}
          onClick={() => {
            blocker.reset?.();
            extra.onClick();
          }}
          className="mt-5 h-12 w-full rounded-2xl bg-primary font-semibold text-primary-foreground"
        >
          {extra.label}
        </button>
      )}
      <div className={extra ? "mt-2 grid grid-cols-2 gap-2" : "mt-5 grid grid-cols-2 gap-2"}>
        <button type="button" data-testid="leave-stay" onClick={() => blocker.reset?.()} className={extra ? "h-12 rounded-2xl bg-secondary font-semibold" : "h-12 rounded-2xl bg-primary font-semibold text-primary-foreground"}>
          {stay}
        </button>
        <button type="button" data-testid="leave-go" onClick={() => blocker.proceed?.()} className="h-12 rounded-2xl bg-secondary font-semibold text-destructive">
          {leave}
        </button>
      </div>
    </BottomSheet>
  );
}
