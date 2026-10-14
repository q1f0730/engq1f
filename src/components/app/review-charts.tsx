/**
 * v6 · 统计与复盘的图表与小组件。
 * 12.0 · 全部改成单色：墨色的线和柱，唯一的强调是荧光笔（今天 / 最高 / 达成）。
 * 文字用正文字体，数字用衬线；网格只有细线，没有底色块。
 */
import { ChevronLeft, ChevronRight } from "@/components/app/icons";
import { diffDays, type DayLog } from "@/lib/srs";
import { BADGES, badgeProgress, entryDay, monthGrid, type BadgeCtx, type Bucket, type ForecastDay, type RetentionDay, type RevEntry } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { GradeChip, hm, kindOf } from "./track";

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
const AXIS = { fontSize: 18, fill: "var(--ink-3)" } as const;

/** 保持率曲线：0~100，没复习的天留空不连线；最后一个点（今天）是荧光笔圆点 */
export function RetentionLine({ days, testid }: { days: RetentionDay[]; testid?: string }) {
  const W = 600;
  const H = 190;
  const L = 52;
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
      {/* 80% 那条线用荧光笔底色带标出来：「及格线」 */}
      <rect x={L} y={y(100)} width={W - L - R} height={y(80) - y(100)} fill="var(--mark-soft)" opacity={0.55} />
      {[0, 50, 80, 100].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--rule)" strokeDasharray={g === 80 ? "5 5" : undefined} />
          <text x={L - 8} y={y(g) + 6} textAnchor="end" {...AXIS}>
            {g}%
          </text>
        </g>
      ))}
      {segs.map((d, k) => (
        <path key={k} d={d} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {pts.map((p) => (
        <circle
          key={p.k}
          cx={x(p.k)}
          cy={y(p.rate!)}
          r={p.k === n - 1 ? 7 : 3.5}
          fill={p.k === n - 1 ? "var(--mark)" : "var(--paper)"}
          stroke="var(--ink)"
          strokeWidth={p.k === n - 1 ? 2 : 1.6}
          data-rate={p.rate}
        >
          <title>{`${p.day} · ${p.ok}/${p.n} · ${p.rate}%`}</title>
        </circle>
      ))}
      <text x={L} y={H - 4} {...AXIS}>
        {md(days[0].day)}
      </text>
      <text x={W - R} y={H - 4} textAnchor="end" {...AXIS}>
        今天
      </text>
    </svg>
  );
}

/** 24 小时作答分布：一排细竖线，最常学的那个小时是荧光笔底的墨色柱 */
export function HourBars({ hours, peak, testid }: { hours: number[]; peak: number | null; testid?: string }) {
  const max = Math.max(1, ...hours);
  return (
    <div data-testid={testid}>
      <div className="flex h-[110px] items-end gap-[3px] border-b border-ink">
        {hours.map((v, h) => (
          <div key={h} className={cn("flex h-full min-w-0 flex-1 flex-col justify-end", h === peak && "bg-mark-soft")} title={`${h}:00 · ${v} 次`}>
            <div
              data-hour={h}
              data-value={v}
              className={cn("mx-auto w-[62%] rounded-t-[2px]", h === peak ? "bg-ink" : v ? "bg-ink-3" : "bg-transparent")}
              style={{ height: `${v ? Math.max(5, (v / max) * 100) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="relative mt-1.5 h-4 text-[0.6875rem] text-ink-3">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} className="tnum absolute top-0" style={h === 0 ? { left: 0 } : h === 24 ? { right: 0 } : { left: `${(h / 24) * 100}%`, transform: "translateX(-50%)" }}>
            {h === 0 ? "0 点" : h}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 间隔分布：一张小表，每行一条细横线（越久的间隔墨色越深），右边是数量和占比 */
export function IntervalBars({ buckets, total, testid }: { buckets: Bucket[]; total: number; testid?: string }) {
  const tones = ["bg-rule-strong", "bg-ink-3", "bg-ink-2", "bg-ink"];
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="border-t border-rule" data-testid={testid}>
      {buckets.map((b, k) => (
        <div key={b.key} className="grid grid-cols-[4.25rem_minmax(0,1fr)_4.5rem] items-center gap-3 border-b border-rule py-2.5" data-testid={`bucket-${b.key}`} data-value={b.count}>
          <span className="text-[0.75rem] text-ink-2">{b.label}</span>
          <div className="h-2 min-w-0 bg-paper-2">
            <div className={cn("h-full transition-all", tones[k], k === buckets.length - 1 && "shadow-[inset_0_-3px_0_var(--mark)]")} style={{ width: `${b.count ? Math.max(3, (b.count / max) * 100) : 0}%` }} />
          </div>
          <span className="tnum text-right">
            <span className="font-serif text-[1.125rem] leading-none">{b.count}</span>
            <span className="ml-1 text-[0.6875rem] text-ink-3">{total ? Math.round((b.count / total) * 100) : 0}%</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** 30 天预测：柱 = 每日复习量（今天是荧光笔），线 = 预计掌握数（墨线） */
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
          return (
            <rect
              key={k}
              x={P + bw * k + bw * 0.2}
              y={H - 30 - h}
              width={bw * 0.6}
              height={h}
              rx={1.5}
              fill={k === 0 ? "var(--mark)" : "var(--rule-strong)"}
              stroke={k === 0 ? "var(--ink)" : "none"}
              strokeWidth={1.2}
              data-reviews={d.reviews}
            />
          );
        })}
        <path d={line} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r={4.5} fill="var(--ink)" />
        <text x={pts[n - 1][0] - 9} y={pts[n - 1][1] - 10} fontSize={24} textAnchor="end" fill="var(--ink)" fontFamily="var(--font-serif)">
          {last.mastered}
        </text>
        <line x1={P} x2={W - P} y1={H - 30} y2={H - 30} stroke="var(--ink)" />
        <text x={P} y={H - 6} {...AXIS}>
          今天
        </text>
        <text x={W / 2} y={H - 6} textAnchor="middle" {...AXIS}>
          {md(data[Math.floor(n / 2)].day)}
        </text>
        <text x={W - P} y={H - 6} textAnchor="end" {...AXIS}>
          {md(last.day)}
        </text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-[0.75rem] text-ink-3">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-[2px] bg-rule-strong" />
          每日复习量
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-[2px] w-4 bg-ink" />
          预计掌握（按时复习且都记得）
        </span>
      </div>
    </div>
  );
}

/** 月历：一张细线格子的日历。打卡的日子日期下面一道荧光笔，补卡写「补」，休息日写「休」；今天是一个墨色圆点 */
export function MonthCalendar({
  ym,
  logs,
  checkins,
  today,
  onShift,
  canNext,
  onPick,
  rest = -1,
  patched = [],
}: {
  ym: string;
  logs: Record<string, DayLog>;
  checkins: string[];
  today: string;
  onShift: (n: number) => void;
  canNext: boolean;
  /** 点某天（当日回看） */
  onPick?: (day: string) => void;
  rest?: number;
  patched?: string[];
}) {
  const set = new Set(checkins);
  const patchSet = new Set(patched);
  const rows = monthGrid(ym);
  const [y, m] = ym.split("-").map(Number);
  const navBtn = "press grid size-10 place-items-center rounded-md text-ink-2 hover:bg-paper-2 hover:text-ink disabled:opacity-30";
  return (
    <div data-testid="month-cal" data-month={ym}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => onShift(-1)} data-testid="month-prev" aria-label="上个月" className={navBtn}>
          <ChevronLeft className="size-4" />
        </button>
        <div className="tnum text-[0.9375rem] font-semibold" data-testid="month-title">
          <span className="font-serif text-[1.375rem] font-normal">{y}</span> 年 <span className="font-serif text-[1.375rem] font-normal">{m}</span> 月
        </div>
        <button type="button" onClick={() => onShift(1)} disabled={!canNext} data-testid="month-next" aria-label="下个月" className={navBtn}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 border-b border-ink text-center text-[0.6875rem] text-ink-3">
        {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="border-l border-rule">
        {rows.map((r, k) => (
          <div key={k} className="grid grid-cols-7">
            {r.map((d, j) => {
              if (!d) return <div key={j} className="border-b border-r border-rule" />;
              const v = (logs[d]?.n ?? 0) + (logs[d]?.r ?? 0);
              const checked = set.has(d);
              const future = diffDays(today, d) > 0;
              const isPatch = checked && patchSet.has(d);
              const isRest = !checked && !v && rest >= 0 && new Date(d + "T12:00:00").getDay() === rest && !future;
              return (
                <button
                  type="button"
                  key={d}
                  data-day={d}
                  data-checked={checked ? 1 : 0}
                  data-patched={isPatch ? 1 : 0}
                  data-count={v}
                  disabled={future || !onPick}
                  onClick={() => onPick?.(d)}
                  aria-label={`${Number(d.slice(5, 7))}月${Number(d.slice(8))}日${checked ? (isPatch ? " 补卡" : " 已打卡") : ""}${v ? ` ${v} 词` : ""}`}
                  className={cn(
                    "press relative flex aspect-square min-w-0 flex-col items-start justify-between border-b border-r border-rule p-1.5 text-left",
                    future && "opacity-35",
                    onPick && !future && "enabled:hover:bg-paper-2",
                  )}
                >
                  <span className={cn("tnum relative font-serif text-[1.0625rem] leading-none", checked ? "text-ink" : v ? "text-ink-2" : "text-ink-3")}>
                    <span className={cn(checked && "hl")}>{Number(d.slice(8))}</span>
                    {d === today && <span className="absolute -right-2 -top-0.5 size-1.5 rounded-full bg-ink" aria-hidden />}
                  </span>
                  <span className={cn("tnum h-3 text-[0.625rem] font-medium leading-3", isRest ? "text-know" : isPatch ? "text-vague" : "text-ink-3")}>
                    {v ? v : isPatch ? "补" : isRest ? "休" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 复习日志：按天分组的流水账。时间是衬线小字，单词是词头，右边是题型和评分 */
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
            {head && <div className="tnum border-b border-ink pb-1 pt-5 text-[0.75rem] font-semibold text-ink-2 first:pt-0">{d.replace(/-/g, "/")}</div>}
            <button
              type="button"
              onClick={() => onOpen(e[0])}
              data-testid="revlog-row"
              data-word={e[0]}
              className="press grid min-h-11 w-full grid-cols-[3rem_minmax(0,1fr)_auto_auto] items-center gap-x-3 border-b border-rule py-1.5 text-left hover:bg-paper-2/60"
            >
              <span className="tnum font-serif text-[0.9375rem] text-ink-3">{hm(e[1])}</span>
              <span className="word-head min-w-0 truncate text-[1.1875rem] leading-tight">{e[0]}</span>
              <span className="shrink-0 text-[0.6875rem] text-ink-3">{kindOf(e)}</span>
              <GradeChip g={e[2]} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 成就墙：不是图标奖牌，是一页「里程碑」清单。
 * 每一项左边一个衬线序号；达成的序号划荧光笔、写上哪天解锁；没达成的下面一条细进度线。
 */
export function BadgeGrid({ ctx, unlocked }: { ctx: BadgeCtx; unlocked: Record<string, string> }) {
  return (
    <ol className="grid border-t border-ink md:grid-cols-2 md:gap-x-10" data-testid="badges">
      {BADGES.map((b, k) => {
        const p = badgeProgress(b, ctx);
        const on = !!unlocked[b.id] || p.done;
        const date = unlocked[b.id];
        return (
          <li key={b.id} data-testid={`badge-${b.id}`} data-unlocked={on ? 1 : 0} className="grid min-h-[4.5rem] grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-rule py-3">
            <span className={cn("tnum font-serif text-[1.75rem] leading-none", on ? "text-ink" : "text-rule-strong")}>
              <span className={cn(on && "hl")}>{String(k + 1).padStart(2, "0")}</span>
            </span>
            <span className="min-w-0">
              <span className={cn("block truncate text-[0.9375rem] font-semibold", !on && "text-ink-2")}>{b.name}</span>
              <span className="mt-0.5 block text-[0.75rem] leading-snug text-ink-3">{b.desc}</span>
              {!on && Number.isFinite(p.goal) && (
                <span className="mt-2 block h-[3px] bg-rule" aria-hidden>
                  <span className="block h-full bg-ink" style={{ width: `${Math.round(p.pct * 100)}%` }} />
                </span>
              )}
            </span>
            <span className={cn("tnum shrink-0 pt-0.5 text-right text-[0.6875rem] font-medium", on ? "text-ink" : "text-ink-3")}>
              {on ? (date ? `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日解锁` : "已达成") : Number.isFinite(p.goal) ? `${p.cur} / ${p.goal}` : "—"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
