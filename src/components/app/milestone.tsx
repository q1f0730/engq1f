import { Flame } from "@/components/app/icons";
import { useEffect } from "react";
import { MILESTONE_TEXT, dismissCelebration, useCelebration } from "@/lib/celebrate";
import { vibrate } from "@/lib/haptics";

const COLORS = ["#ee6a3c", "#f2c46d", "#ffffff", "#3fb68b", "#ff9a5a", "#c7362a"];

/** 全屏庆祝：彩纸 + 大号天数 */
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
      className="milestone-in pointer-events-auto fixed inset-0 z-[60] grid place-items-center overflow-hidden px-8"
      onClick={dismissCelebration}
    >
      <div className="milestone-bg absolute inset-0" />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {Array.from({ length: 42 }, (_, k) => (
          <i
            key={k}
            className="confetti"
            style={
              {
                left: `${(k * 37) % 100}%`,
                background: COLORS[k % COLORS.length],
                animationDelay: `${(k % 14) * 90}ms`,
                animationDuration: `${2200 + ((k * 53) % 1400)}ms`,
                "--drift": `${((k * 29) % 120) - 60}px`,
                "--spin": `${((k * 71) % 720) - 360}deg`,
                width: k % 3 ? 8 : 12,
                height: k % 3 ? 14 : 8,
                borderRadius: k % 4 === 0 ? 999 : 2,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="relative flex flex-col items-center text-center text-white" onClick={(e) => e.stopPropagation()}>
        <div className="milestone-medal grid size-36 place-items-center rounded-full">
          <div className="flex flex-col items-center leading-none">
            <Flame className="size-7 fill-current text-[#ffe2a8]" />
            <span className="tnum mt-1 font-display text-[56px] font-extrabold tracking-tight" data-testid="milestone-days">
              {n}
            </span>
            <span className="text-[13px] font-bold text-white/85">天</span>
          </div>
        </div>
        <h2 className="mt-7 font-display text-[30px] font-extrabold tracking-tight">{title}</h2>
        <p className="mt-2 max-w-[280px] text-[15px] leading-relaxed text-white/85">{sub}</p>
        <button
          type="button"
          autoFocus
          data-testid="milestone-close"
          onClick={dismissCelebration}
          className="mt-8 h-12 rounded-2xl bg-white px-10 text-[16px] font-bold text-[oklch(0.5_0.19_30)] shadow-xl transition active:scale-[0.98]"
        >
          继续加油
        </button>
      </div>
    </div>
  );
}
