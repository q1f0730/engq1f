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
  return (
    <BottomSheet open={!!day} onOpenChange={onOpenChange} title={title} testid="day-sheet">
      <div data-day={d}>
        <div className="flex items-center gap-3">
          <span
            data-testid="day-status"
            data-state={patched ? "patched" : checked ? "checked" : rest ? "rest" : "none"}
            className={cn("flex items-center gap-1.5 text-[0.8125rem] font-semibold", patched ? "text-vague" : checked ? "text-ink" : rest ? "text-know" : "text-ink-3")}
          >
            {patched ? <Ticket className="size-3.5" /> : rest ? <Coffee className="size-3.5" /> : <CalendarCheck className="size-3.5" />}
            <span className={cn(checked && !patched && "hl")}>{patched ? "补卡" : checked ? "已打卡" : rest ? "休息日" : "未打卡"}</span>
          </span>
          <span className="tnum text-[0.75rem] text-ink-3">{d.replace(/-/g, "/")}</span>
        </div>
        {/* 这一天的四个读数：细线分格，衬线数字 */}
        <dl className="mt-3 grid grid-cols-4 divide-x divide-rule border-y border-ink py-3">
          <Mini label="新学" value={String(log.n)} testid="day-n" />
          <Mini label="复习" value={String(log.r)} testid="day-r" />
          <Mini label="正确率" value={acc === null ? "—" : `${acc}%`} />
          <Mini label="用时" value={log.ms ? fmtMinutes(log.ms).replace(" 分钟", "分").replace(" 小时 ", "时") : "—"} />
        </dl>

        <Section title="新学" n={learned.length} testid="day-learned" empty="这天没有学新词">
          {learned.map((w) => (
            <Row key={w} w={w} meaning={shortMeaning(index.map.get(w)!, 1)} onClick={() => onOpenWord(w)} />
          ))}
        </Section>
        <Section title="复习" n={reviewed.length} testid="day-reviewed" empty="这天没有复习">
          {reviewed.map((r) => (
            <Row key={r.w} w={r.w} meaning={shortMeaning(index.map.get(r.w)!, 1)} onClick={() => onOpenWord(r.w)} right={<GradeChip g={r.g} />} />
          ))}
        </Section>
        {!st.revlog?.length && learned.length > 0 && <p className="mt-3 text-[0.75rem] text-ink-3">v6 之前的复习没有日志，只能看到新学的词。</p>}
      </div>
    </BottomSheet>
  );
}

function Mini({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="min-w-0 px-2.5 first:pl-0" data-testid={testid} data-value={value}>
      <dt className="text-[0.6875rem] text-ink-3">{label}</dt>
      <dd className="tnum mt-1 truncate font-serif text-[1.375rem] leading-none">{value}</dd>
    </div>
  );
}

function Section({ title, n, testid, empty, children }: { title: string; n: number; testid: string; empty: string; children: React.ReactNode }) {
  return (
    <section className="mt-6" data-testid={testid} data-n={n}>
      <h3 className="flex items-baseline gap-2 border-b border-ink pb-1.5 text-[0.875rem] font-semibold">
        {title}
        <span className="tnum font-serif text-[1rem] font-normal text-ink-3">{n}</span>
      </h3>
      {n ? <div>{children}</div> : <p className="py-3 text-[0.8125rem] text-ink-3">{empty}</p>}
    </section>
  );
}

function Row({ w, meaning, onClick, right }: { w: string; meaning: string; onClick: () => void; right?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} data-testid="day-word" data-word={w} className="press grid min-h-11 w-full grid-cols-[minmax(0,38%)_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-2 text-left hover:bg-paper-2/60">
      <span className="word-head truncate text-[1.1875rem] leading-tight">{w}</span>
      <span className="min-w-0 truncate text-[0.78rem] text-ink-2">{meaning}</span>
      {right ?? <span />}
    </button>
  );
}
