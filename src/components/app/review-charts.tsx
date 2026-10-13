/** v6 · 统计与复盘的图表与小组件 */
import { BookOpen, Brain, CalendarRange, ChevronLeft, ChevronRight, Flag, Flame, Library, Mountain, Star, Swords, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { diffDays, type DayLog } from "@/lib/srs";
import { BADGES, badgeProgress, entryDay, monthGrid, type BadgeCtx, type Bucket, type ForecastDay, type RetentionDay, type RevEntry } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { Ring } from "./charts";
import { GradeChip, hm, kindOf } from "./track";

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

/** 保持率曲线：0~100，没复习的天留空不连线 */
export function RetentionLine({ days, testid }: { days: RetentionDay[]; testid?: string }) {
  const W = 600;
  const H = 190;
  const L = 58;
  const R = 12;
  const T = 14;
  const B = 32;
  const n = days.length;
  const x = (k: number) => L + ((W - L - R) * k) / Math.max(1, n - 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / 100);
  // 连续有数据的天连成一段
  const segs: string[] = [];
  let cur = "";
  days.forEach((d, k) => {
    if (d.rate === null) {
      if (cur) segs.push(cur);
      cur = "";
      return;
    }
    cur += `${cur ? "L" : "M"}${x(k).toFixed(1)},${y(d.rate).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const pts = days.map((d, k) => ({ ...d, k })).filter((d) => d.rate !== null);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="保持率曲线" data-testid={testid} data-points={pts.length}>
      {[0, 50, 80, 100].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeDasharray={g === 80 ? "6 6" : undefined} />
          <text x={L - 6} y={y(g) + 6} fontSize={19} textAnchor="end" fill="var(--muted-foreground)">
            {g}%
          </text>
        </g>
      ))}
      {segs.map((d, k) => (
        <path key={k} d={d} fill="none" stroke="var(--know)" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {pts.map((p) => (
        <circle key={p.k} cx={x(p.k)} cy={y(p.rate!)} r={p.k === n - 1 ? 6.5 : 4.5} fill={p.k === n - 1 ? "var(--know)" : "var(--card)"} stroke="var(--know)" strokeWidth={2.6} data-rate={p.rate}>
          <title>{`${p.day} · ${p.ok}/${p.n} · ${p.rate}%`}</title>
        </circle>
      ))}
      <text x={L} y={H - 4} fontSize={19} fill="var(--muted-foreground)">
        {md(days[0].day)}
      </text>
      <text x={W - R} y={H - 4} fontSize={19} textAnchor="end" fill="var(--muted-foreground)">
        今天
      </text>
    </svg>
  );
}

/** 24 小时作答分布 */
export function HourBars({ hours, peak, testid }: { hours: number[]; peak: number | null; testid?: string }) {
  const max = Math.max(1, ...hours);
  return (
    <div data-testid={testid}>
      <div className="flex h-[110px] items-end gap-[3px]">
        {hours.map((v, h) => (
          <div key={h} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${h}:00 · ${v} 次`}>
            <div
              data-hour={h}
              data-value={v}
              className={cn("w-full rounded-t-[4px] rounded-b-[2px]", h === peak ? "bg-primary" : v ? "bg-primary/30" : "bg-secondary")}
              style={{ height: `${v ? Math.max(6, (v / max) * 100) : 3}%` }}
            />
          </div>
        ))}
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] text-muted-foreground">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} className="absolute top-0" style={h === 0 ? { left: 0 } : h === 24 ? { right: 0 } : { left: `${(h / 24) * 100}%`, transform: "translateX(-50%)" }}>
            {h === 0 ? "0 点" : h}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 间隔分布：横条 */
export function IntervalBars({ buckets, total, testid }: { buckets: Bucket[]; total: number; testid?: string }) {
  const tones = ["bg-forget", "bg-vague", "bg-chart-4", "bg-know"];
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="space-y-2.5" data-testid={testid}>
      {buckets.map((b, k) => (
        <div key={b.key} className="flex items-center gap-3" data-testid={`bucket-${b.key}`} data-value={b.count}>
          <span className="w-[54px] shrink-0 text-[12px] font-semibold text-muted-foreground">{b.label}</span>
          <div className="h-6 min-w-0 flex-1 overflow-hidden rounded-lg bg-secondary">
            <div className={cn("h-full rounded-lg transition-all", tones[k])} style={{ width: `${b.count ? Math.max(3, (b.count / max) * 100) : 0}%` }} />
          </div>
          <span className="tnum w-[64px] shrink-0 text-right text-[13px] font-bold">
            {b.count}
            <span className="ml-1 text-[11px] font-medium text-muted-foreground">{total ? Math.round((b.count / total) * 100) : 0}%</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** 30 天预测：柱 = 每日复习量，线 = 预计掌握数 */
export function Forecast30({ data, testid }: { data: ForecastDay[]; testid?: string }) {
  const W = 600;
  const H = 196;
  const P = 6;
  const n = data.length;
  const bw = (W - P * 2) / n;
  const maxR = Math.max(1, ...data.map((d) => d.reviews));
  const minM = Math.min(...data.map((d) => d.mastered));
  const maxM = Math.max(minM + 1, ...data.map((d) => d.mastered));
  const yM = (v: number) => H - 30 - ((v - minM) / (maxM - minM)) * (H - 80) - 4;
  const pts = data.map((d, k) => [P + bw * k + bw / 2, yM(d.mastered)] as const);
  const line = pts.map((p, k) => `${k ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const last = data[n - 1];
  return (
    <div data-testid={testid} data-days={n}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="30 天复习预测">
        {data.map((d, k) => {
          const h = d.reviews ? Math.max(4, (d.reviews / maxR) * (H - 70)) : 0;
          return <rect key={k} x={P + bw * k + bw * 0.16} y={H - 30 - h} width={bw * 0.68} height={h} rx={2.5} fill="var(--primary)" opacity={k === 0 ? 0.9 : 0.3} data-reviews={d.reviews} />;
        })}
        <path d={line} fill="none" stroke="var(--know)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r={5} fill="var(--know)" />
        <text x={pts[n - 1][0] - 8} y={pts[n - 1][1] - 10} fontSize={21} fontWeight={700} textAnchor="end" fill="var(--know)">
          {last.mastered}
        </text>
        <line x1={P} x2={W - P} y1={H - 30} y2={H - 30} stroke="var(--border)" />
        <text x={P} y={H - 6} fontSize={19} fill="var(--muted-foreground)">
          今天
        </text>
        <text x={W / 2} y={H - 6} fontSize={19} textAnchor="middle" fill="var(--muted-foreground)">
          {md(data[Math.floor(n / 2)].day)}
        </text>
        <text x={W - P} y={H - 6} fontSize={19} textAnchor="end" fill="var(--muted-foreground)">
          {md(last.day)}
        </text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-sm bg-primary/40" />
          每日复习量
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-[3px] w-4 rounded bg-know" />
          预计掌握（按时复习且都记得）
        </span>
      </div>
    </div>
  );
}

/** 月历：每格显示日期、学习量，打卡的格子实心 */
export function MonthCalendar({
  ym,
  logs,
  checkins,
  today,
  onShift,
  canNext,
}: {
  ym: string;
  logs: Record<string, DayLog>;
  checkins: string[];
  today: string;
  onShift: (n: number) => void;
  canNext: boolean;
}) {
  const set = new Set(checkins);
  const rows = monthGrid(ym);
  const [y, m] = ym.split("-").map(Number);
  return (
    <div data-testid="month-cal" data-month={ym}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => onShift(-1)} data-testid="month-prev" aria-label="上个月" className="grid size-9 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
        </button>
        <div className="text-[15px] font-bold" data-testid="month-title">
          {y} 年 {m} 月
        </div>
        <button
          type="button"
          onClick={() => onShift(1)}
          disabled={!canNext}
          data-testid="month-next"
          aria-label="下个月"
          className="grid size-9 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-35"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid gap-1">
        {rows.map((r, k) => (
          <div key={k} className="grid grid-cols-7 gap-1">
            {r.map((d, j) => {
              if (!d) return <div key={j} />;
              const v = (logs[d]?.n ?? 0) + (logs[d]?.r ?? 0);
              const checked = set.has(d);
              const future = diffDays(today, d) > 0;
              return (
                <div
                  key={d}
                  data-day={d}
                  data-checked={checked ? 1 : 0}
                  data-count={v}
                  className={cn(
                    "flex aspect-square min-w-0 flex-col items-center justify-center rounded-xl",
                    checked ? "bg-primary text-primary-foreground" : v ? "bg-brand-soft text-primary" : "bg-secondary/60",
                    future && "opacity-40",
                    d === today && "ring-2 ring-foreground/70 ring-offset-1 ring-offset-card",
                  )}
                >
                  <span className={cn("tnum text-[13px] font-bold leading-none", !checked && !v && "text-muted-foreground")}>{Number(d.slice(8))}</span>
                  <span className={cn("tnum mt-0.5 h-3 text-[9.5px] font-semibold leading-3", checked ? "text-primary-foreground/85" : "text-primary/80")}>{v ? v : ""}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 复习日志列表 */
export function RevList({ entries, onOpen }: { entries: RevEntry[]; onOpen: (w: string) => void }) {
  let lastDay = "";
  return (
    <div data-testid="revlog-list">
      {entries.map((e, k) => {
        const d = entryDay(e);
        const head = d !== lastDay;
        lastDay = d;
        return (
          <div key={`${e[1]}-${k}`}>
            {head && <div className="pb-1 pt-3 text-[11px] font-bold tracking-wider text-muted-foreground first:pt-0">{d.replace(/-/g, "/")}</div>}
            <button
              type="button"
              onClick={() => onOpen(e[0])}
              data-testid="revlog-row"
              data-word={e[0]}
              className="flex w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left hover:bg-secondary/70"
            >
              <span className="tnum w-11 shrink-0 text-[12px] text-muted-foreground">{hm(e[1])}</span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{e[0]}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{kindOf(e)}</span>
              <GradeChip g={e[2]} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

const BADGE_ICON: Record<string, ReactNode> = {
  first: <Flag className="size-6" />,
  streak7: <Flame className="size-6" />,
  streak30: <CalendarRange className="size-6" />,
  streak100: <Mountain className="size-6" />,
  learn500: <BookOpen className="size-6" />,
  learn1000: <Library className="size-6" />,
  learnAll: <Trophy className="size-6" />,
  master500: <Brain className="size-6" />,
  kill100: <Swords className="size-6" />,
  perfect: <Star className="size-6" />,
};

/** 成就墙 */
export function BadgeGrid({ ctx, unlocked }: { ctx: BadgeCtx; unlocked: Record<string, string> }) {
  return (
    <div className="grid grid-cols-3 gap-2.5 md:grid-cols-5" data-testid="badges">
      {BADGES.map((b) => {
        const p = badgeProgress(b, ctx);
        const on = !!unlocked[b.id] || p.done;
        const date = unlocked[b.id];
        return (
          <div
            key={b.id}
            data-testid={`badge-${b.id}`}
            data-unlocked={on ? 1 : 0}
            className={cn("flex min-w-0 flex-col items-center rounded-3xl border px-2 pb-3 pt-3.5 text-center", on ? "border-primary/25 bg-brand-soft/60" : "border-border/70 bg-card")}
          >
            {on ? (
              <div className="badge-medal grid size-[60px] place-items-center rounded-full text-white">{BADGE_ICON[b.id]}</div>
            ) : (
              <Ring value={p.pct} size={60} stroke={4} className="text-primary/70">
                <span className="grid size-[44px] place-items-center rounded-full bg-secondary text-muted-foreground/60">{BADGE_ICON[b.id]}</span>
              </Ring>
            )}
            <div className={cn("mt-2 truncate text-[13px] font-bold", !on && "text-muted-foreground")}>{b.name}</div>
            <div className="mt-0.5 line-clamp-2 min-h-[30px] text-[11px] leading-[15px] text-muted-foreground">{b.desc}</div>
            <div className={cn("tnum mt-1 text-[10.5px] font-semibold", on ? "text-primary" : "text-muted-foreground")}>
              {on ? (date ? `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日解锁` : "已达成") : Number.isFinite(p.goal) ? `${p.cur} / ${p.goal}` : "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

