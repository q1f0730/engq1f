import { useEffect } from "react";
import { MILESTONE_TEXT, dismissCelebration, useCelebration } from "@/lib/celebrate";
import { vibrate } from "@/lib/haptics";

/**
 * 全屏庆祝（连续打卡 7 / 30 / 100 … 天）。
 * 12.0 · 不撒彩纸、不放奖牌：整屏一张纸，一个特大的衬线天数，被荧光笔从左到右划过一道；
 * 下面一句话和一个墨色按钮。点任意处或按 Esc 关闭。
 */
export function MilestoneOverlay() {
  const n = useCelebration();
  useEffect(() => {
    if (!n) return;
    vibrate([20, 60, 20, 60, 40]);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismissCelebration();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n]);
  if (!n) return null;
  const [title, sub] = MILESTONE_TEXT[n] ?? [`连续 ${n} 天！`, "继续保持。"];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="milestone"
      data-days={n}
      className="milestone-in pointer-events-auto fixed inset-0 z-[60] flex flex-col justify-center overflow-hidden bg-paper/[0.97] px-8 backdrop-blur-sm"
      onClick={dismissCelebration}
    >
      <div className="mx-auto w-full max-w-sm text-ink" onClick={(e) => e.stopPropagation()}>
        <div className="text-[0.8125rem] tracking-[0.2em] text-ink-3">连续打卡</div>
        <div className="mt-3 flex items-baseline gap-2 border-b-2 border-ink pb-4">
          <span className="tnum hl-swipe font-serif text-[8rem] leading-[0.8] tracking-[-0.05em]" data-testid="milestone-days">
            {n}
          </span>
          <span className="text-[1.25rem] font-semibold text-ink-2">天</span>
        </div>
        <h2 className="mt-6 text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">{title}</h2>
        <p className="mt-2 max-w-[280px] text-[0.9375rem] leading-relaxed text-ink-2">{sub}</p>
        <button
          type="button"
          autoFocus
          data-testid="milestone-close"
          onClick={dismissCelebration}
          className="press mt-10 h-12 w-full rounded-lg bg-ink text-base font-semibold text-paper-3 hover:bg-ink-2"
        >
          继续加油
        </button>
      </div>
    </div>
  );
}
