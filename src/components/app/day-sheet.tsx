import { CalendarCheck, Coffee, Ticket } from "@/components/app/icons";
import { useMemo } from "react";
import { shortMeaning, type WordIndex } from "@/lib/data";
import { fmtMinutes } from "@/lib/format";
import { dayDetail, isRestDay, restOf } from "@/lib/habit";
import { emptyLog } from "@/lib/srs";
import type { AppState } from "@/lib/store";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./sheet";
import { GradeChip } from "./track";
import { Tag } from "./kit";

const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 当日回看：点打卡日历某天，看那天新学和复习的词 */
export function DaySheet({
  day,
  index,
  st,
  onOpenChange,
  onOpenWord,
}: {
  day: string | null;
  index: WordIndex;
  st: AppState;
  onOpenChange: (v: boolean) => void;
  onOpenWord: (w: string) => void;
}) {
  const detail = useMemo(() => (day ? dayDetail(st.revlog ?? [], st.cards, day) : null), [day, st.revlog, st.cards]);
  const d = day ?? "2000-01-01";
  const log = st.log[d] ?? emptyLog();
  const checked = st.checkins.includes(d);
  const patched = checked && (st.patched ?? []).includes(d);
  const rest = !checked && isRestDay(d, restOf(st));
  const acc = log.a ? Math.round((log.ok / log.a) * 100) : null;
  const title = `${Number(d.slice(5, 7))}月${Number(d.slice(8))}日 ${WEEK[new Date(d + "T12:00:00").getDay()]}`;
  const learned = (detail?.learned ?? []).filter((w) => index.map.has(w));
  const reviewed = (detail?.reviewed ?? []).filter((r) => index.map.has(r.w));
  const state = patched ? "patched" : checked ? "checked" : rest ? "rest" : "none";
  const statusText = patched ? "补卡" : checked ? "已打卡" : rest ? "休息日" : "未打卡";
  const minutes = log.ms ? fmtMinutes(log.ms).replace(" 分钟", "分").replace(" 小时 ", "时") : "—";
  return (
    <BottomSheet open={!!day} onOpenChange={onOpenChange} title={title} testid="day-sheet">
      <article data-day={d} className="min-w-0">
        {/* 12.0 · 像日记本的一页：左边一个大号日期数字，右边状态和年份；下面一行流水账读数 */}
        <header className="flex items-end gap-4 border-b border-ink pb-3">
          <span aria-hidden className="tnum font-serif text-[3rem] leading-[0.85] tracking-[-0.02em]">
            <span className={cn(checked && !patched && "hl")}>{Number(d.slice(8))}</span>
          </span>
          <div className="min-w-0 flex-1 pb-0.5">
            <span data-testid="day-status" data-state={state} className="flex items-center gap-1.5">
              <StatusIcon state={state} />
              <Tag tone={patched ? "vague" : rest ? "know" : checked ? "mark" : undefined}>{statusText}</Tag>
            </span>
            <span className="tnum mt-1.5 block text-[0.75rem] text-ink-3">{d.replace(/-/g, " / ")}</span>
          </div>
        </header>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          <Tally label="新学" value={String(log.n)} testid="day-n" />
          <Tally label="复习" value={String(log.r)} testid="day-r" />
          <Tally label="正确率" value={acc === null ? "—" : `${acc}%`} />
          <Tally label="用时" value={minutes} />
        </dl>

        <WordList title="新学" n={learned.length} testid="day-learned" empty="这天没有学新词">
          {learned.map((w) => (
            <WordRow key={w} w={w} meaning={shortMeaning(index.map.get(w)!, 1)} onClick={() => onOpenWord(w)} />
          ))}
        </WordList>
        <WordList title="复习" n={reviewed.length} testid="day-reviewed" empty="这天没有复习">
          {reviewed.map((r) => (
            <WordRow key={r.w} w={r.w} meaning={shortMeaning(index.map.get(r.w)!, 1)} onClick={() => onOpenWord(r.w)} right={<GradeChip g={r.g} />} />
          ))}
        </WordList>
        {!st.revlog?.length && learned.length > 0 && <p className="mt-4 border-l-2 border-rule-strong pl-3 text-[0.75rem] text-ink-3">v6 之前的复习没有日志，只能看到新学的词。</p>}
      </article>
    </BottomSheet>
  );
}

function StatusIcon({ state }: { state: string }) {
  const cls = "size-3.5 text-ink-3";
  if (state === "patched") return <Ticket className={cls} />;
  if (state === "rest") return <Coffee className={cls} />;
  return <CalendarCheck className={cls} />;
}

/** 一条读数：衬线数字 + 小字名字，横着排成一行，不分格 */
function Tally({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5" data-testid={testid} data-value={value}>
      <dd className="tnum font-serif text-[1.375rem] leading-none">{value}</dd>
      <dt className="text-[0.75rem] text-ink-3">{label}</dt>
    </div>
  );
}

function WordList({ title, n, testid, empty, children }: { title: string; n: number; testid: string; empty: string; children: React.ReactNode }) {
  return (
    <section className="mt-7" data-testid={testid} data-n={n}>
      <div className="flex items-center gap-3 text-[0.8125rem] font-medium text-ink-3">
        <h3 className="text-ink">{title}</h3>
        <span className="tnum">{n} 词</span>
        <span aria-hidden className="h-px flex-1 bg-rule" />
      </div>
      {n ? <ol className="mt-1">{children}</ol> : <p className="py-3 text-[0.8125rem] text-ink-3">{empty}</p>}
    </section>
  );
}

function WordRow({ w, meaning, onClick, right }: { w: string; meaning: string; onClick: () => void; right?: React.ReactNode }) {
  return (
    <li className="border-b border-rule last:border-b-0">
      <button type="button" onClick={onClick} data-testid="day-word" data-word={w} className="press flex min-h-12 w-full min-w-0 items-baseline gap-3 py-2.5 text-left hover:bg-paper-2/60">
        <span className="word-head shrink-0 text-[1.1875rem] leading-tight">{w}</span>
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink-2">{meaning}</span>
        {right && <span className="shrink-0 self-center">{right}</span>}
      </button>
    </li>
  );
}
