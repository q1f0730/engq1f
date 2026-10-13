/** 单词记忆轨迹与评分标签（单词详情里用，保持轻量） */
import { intervalLabel } from "@/lib/srs";
import { F_NEW, F_REPEAT, GRADE_LABEL, entryDay, type RevEntry } from "@/lib/stats";
import { cn } from "@/lib/utils";

const GRADE_TONE: Record<number, string> = {
  0: "bg-forget text-white",
  1: "bg-vague text-white dark:text-[oklch(0.2_0.02_80)]",
  2: "bg-know text-white dark:text-[oklch(0.2_0.02_170)]",
  3: "bg-foreground text-background",
};

export function GradeChip({ g, className }: { g: number; className?: string }) {
  return <span className={cn("inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-bold", GRADE_TONE[g], className)}>{GRADE_LABEL[g as 0]}</span>;
}

export function hm(t: number) {
  const d = new Date(t * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function kindOf(e: RevEntry) {
  return e[3] & F_REPEAT ? "重学" : e[3] & F_NEW ? "新学" : "复习";
}

/** 单词记忆轨迹：竖向时间轴 */
export function WordTrack({ entries, max = 12, testid }: { entries: RevEntry[]; max?: number; testid?: string }) {
  const shown = entries.slice(-max).reverse();
  return (
    <ol className="relative ml-1.5 space-y-2.5 border-l-2 border-border pl-4" data-testid={testid} data-count={entries.length}>
      {shown.map((e, k) => (
        <li key={`${e[1]}-${k}`} className="relative" data-testid="track-item" data-grade={e[2]}>
          <span className={cn("absolute -left-[23px] top-1 size-3 rounded-full ring-[3px] ring-secondary", GRADE_TONE[e[2]].split(" ")[0])} />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="tnum text-[13px] font-semibold">
              {entryDay(e).slice(5).replace("-", "/")} <span className="font-normal text-muted-foreground">{hm(e[1])}</span>
            </span>
            <GradeChip g={e[2]} />
            <span className="text-[12px] text-muted-foreground">{kindOf(e)}</span>
            {e[4] >= 0 && e[2] !== 3 && <span className="tnum ml-auto text-[12px] text-muted-foreground">→ {intervalLabel(e[4])}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

