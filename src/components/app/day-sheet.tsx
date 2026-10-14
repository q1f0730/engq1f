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
        <div className="flex items-center gap-2">
          <span
            data-testid="day-status"
            data-state={patched ? "patched" : checked ? "checked" : rest ? "rest" : "none"}
            className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold",
              patched ? "bg-vague-soft text-vague" : checked ? "bg-brand-soft text-primary" : rest ? "bg-know-soft text-know" : "bg-secondary text-muted-foreground",
            )}
          >
            {patched ? <Ticket className="size-3.5" /> : rest ? <Coffee className="size-3.5" /> : <CalendarCheck className="size-3.5" />}
            {patched ? "补卡" : checked ? "已打卡" : rest ? "休息日" : "未打卡"}
          </span>
          <span className="text-[12px] text-muted-foreground">{d.replace(/-/g, "/")}</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
          <Mini label="新学" value={String(log.n)} testid="day-n" />
          <Mini label="复习" value={String(log.r)} testid="day-r" />
          <Mini label="正确率" value={acc === null ? "—" : `${acc}%`} />
          <Mini label="用时" value={log.ms ? fmtMinutes(log.ms).replace(" 分钟", "分").replace(" 小时 ", "时") : "—"} />
        </div>

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
        {!st.revlog?.length && learned.length > 0 && <p className="mt-3 text-[12px] text-muted-foreground">v6 之前的复习没有日志，只能看到新学的词。</p>}
      </div>
    </BottomSheet>
  );
}

function Mini({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-secondary/70 px-1 py-2" data-testid={testid} data-value={value}>
      <div className="tnum truncate text-[16px] font-extrabold leading-tight">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Section({ title, n, testid, empty, children }: { title: string; n: number; testid: string; empty: string; children: React.ReactNode }) {
  return (
    <div className="mt-4" data-testid={testid} data-n={n}>
      <div className="mb-1 flex items-baseline gap-1.5 text-[13px] font-bold">
        {title}
        <span className="tnum text-[12px] font-semibold text-muted-foreground">{n}</span>
      </div>
      {n ? <div className="divide-y divide-border/60 rounded-2xl border border-border/70">{children}</div> : <p className="rounded-2xl bg-secondary/50 px-3 py-3 text-[13px] text-muted-foreground">{empty}</p>}
    </div>
  );
}

function Row({ w, meaning, onClick, right }: { w: string; meaning: string; onClick: () => void; right?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} data-testid="day-word" data-word={w} className="flex w-full items-center gap-3 px-3 py-2.5 text-left first:rounded-t-2xl last:rounded-b-2xl hover:bg-secondary/60">
      <span className="w-[38%] shrink-0 truncate text-[15px] font-semibold">{w}</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">{meaning}</span>
      {right}
    </button>
  );
}
