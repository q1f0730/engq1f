/** 单词记忆轨迹与评分标签（单词详情里用，保持轻量） */
import { intervalLabel } from "@/lib/srs";
import { F_NEW, F_REPEAT, GRADE_LABEL, entryDay, type RevEntry } from "@/lib/stats";
import { cn } from "@/lib/utils";

/** 12.0 · 评分只用一个小色块 + 字（语气色只在色块上），不是一排彩色实心标签 */
const GRADE_DOT: Record<number, string> = {
  0: "bg-forget",
  1: "bg-vague",
  2: "bg-know",
  3: "bg-ink",
  4: "bg-mark ring-1 ring-ink ring-inset",
};
const GRADE_TEXT: Record<number, string> = { 0: "text-forget", 1: "text-vague", 2: "text-know", 3: "text-ink", 4: "text-ink" };

export function GradeChip({ g, className }: { g: number; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap text-[0.6875rem] font-semibold", GRADE_TEXT[g], className)}>
      <span className={cn("size-2 rounded-[2px]", GRADE_DOT[g])} aria-hidden />
      {GRADE_LABEL[g as 0]}
    </span>
  );
}

export function hm(t: number) {
  const d = new Date(t * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function kindOf(e: RevEntry) {
  return e[3] & F_REPEAT ? "重学" : e[3] & F_NEW ? "新学" : "复习";
}

/** 单词记忆轨迹：竖向时间轴（一条细墨线，每次作答一个方点，颜色 = 评分） */
export function WordTrack({ entries, max = 12, testid }: { entries: RevEntry[]; max?: number; testid?: string }) {
  const shown = entries.slice(-max).reverse();
  return (
    <ol className="relative ml-1 border-l border-ink pl-4" data-testid={testid} data-count={entries.length}>
      {shown.map((e, k) => (
        <li key={`${e[1]}-${k}`} className="relative grid min-h-9 grid-cols-[auto_auto_1fr_auto] items-center gap-x-3 border-b border-rule py-1.5 last:border-b-0" data-testid="track-item" data-grade={e[2]}>
          <span className={cn("absolute -left-[21px] top-1/2 size-2 -translate-y-1/2 rounded-[2px]", GRADE_DOT[e[2]])} aria-hidden />
          <span className="tnum text-[0.8125rem] font-medium">
            {entryDay(e).slice(5).replace("-", "/")} <span className="font-serif text-[0.9375rem] font-normal text-ink-3">{hm(e[1])}</span>
          </span>
          <GradeChip g={e[2]} />
          <span className="text-[0.75rem] text-ink-3">{kindOf(e)}</span>
          {e[4] >= 0 && e[2] !== 3 ? <span className="tnum text-right font-serif text-[0.9375rem] text-ink-2">→ {intervalLabel(e[4])}</span> : <span />}
        </li>
      ))}
    </ol>
  );
}
