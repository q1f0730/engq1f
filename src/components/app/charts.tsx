import { useEffect, useRef, useState } from "react";
import { addDays, diffDays, type DayLog } from "@/lib/srs";
import { cn } from "@/lib/utils";

export function Ring({
  value,
  size = 120,
  stroke = 12,
  className,
  track = "color-mix(in oklab, currentColor 18%, transparent)",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function Bars({
  data,
  height = 120,
  className,
  testid,
}: {
  data: { label: string; value: number; strong?: boolean }[];
  height?: number;
  className?: string;
  testid?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={cn("flex items-end gap-2", className)} style={{ height: height + 40 }} data-testid={testid}>
      {data.map((d, k) => (
        <div key={k} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className={cn("tnum text-[11px] font-semibold", d.strong ? "text-primary" : "text-muted-foreground")}>{d.value}</span>
          <div className="flex w-full justify-center" style={{ height }}>
            <div
              className={cn("w-full max-w-9 self-end rounded-t-lg rounded-b-sm", d.strong ? "bg-primary" : "bg-primary/25")}
              style={{ height: `${Math.max(d.value ? 6 : 2, (d.value / max) * height)}px`, transition: "height 600ms ease" }}
            />
          </div>
          <span className={cn("truncate text-[11px]", d.strong ? "font-bold text-foreground" : "text-muted-foreground")}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** 30 天学习曲线：柱 = 每日学习量，线 = 累计学会的词 */
export function Curve({ logs, firstDays, today, days = 30 }: { logs: Record<string, DayLog>; firstDays: string[]; today: string; days?: number }) {
  const W = 600;
  const H = 180;
  const P = 6;
  const range = Array.from({ length: days }, (_, k) => addDays(today, k - days + 1));
  const daily = range.map((d) => (logs[d]?.n ?? 0) + (logs[d]?.r ?? 0));
  const start = range[0];
  const before = firstDays.filter((d) => d < start).length;
  const perDay = new Map<string, number>();
  for (const d of firstDays) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  let acc = before;
  const cum = range.map((d) => (acc += perDay.get(d) ?? 0));
  const maxBar = Math.max(1, ...daily);
  const maxCum = Math.max(1, ...cum);
  const bw = (W - P * 2) / days;
  const pts = cum.map((v, k) => [P + bw * k + bw / 2, H - 18 - (v / maxCum) * (H - 40)] as const);
  const line = pts.map((p, k) => `${k ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0]},${H - 18} L${pts[0][0]},${H - 18} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="30 天学习曲线">
        <defs>
          <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--primary)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {daily.map((v, k) => (
          <rect
            key={k}
            x={P + bw * k + bw * 0.18}
            y={H - 18 - (v / maxBar) * (H - 60)}
            width={bw * 0.64}
            height={(v / maxBar) * (H - 60)}
            rx={2}
            fill="var(--know)"
            opacity={0.35}
          />
        ))}
        <path d={area} fill="url(#curveFill)" />
        <path d={line} fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={5} fill="var(--primary)" />
        <line x1={P} x2={W - P} y1={H - 18} y2={H - 18} stroke="var(--border)" />
        <text x={P} y={H - 2} fontSize={12} fill="var(--muted-foreground)">
          {start.slice(5).replace("-", "/")}
        </text>
        <text x={W - P} y={H - 2} fontSize={12} fill="var(--muted-foreground)" textAnchor="end">
          今天
        </text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-[3px] w-4 rounded bg-primary" />
          累计学过 {cum[cum.length - 1]} 词
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-sm bg-know/40" />
          每日学习+复习
        </span>
      </div>
    </div>
  );
}

/** 打卡日历热力图：列 = 周，行 = 周一…周日；最近一周在最右侧 */
export function Heatmap({
  logs,
  checkins,
  today,
  maxWeeks = 53,
}: {
  logs: Record<string, DayLog>;
  checkins: string[];
  today: string;
  maxWeeks?: number;
}) {
  // 按容器宽度决定显示多少周，整列显示、不裁切
  const box = useRef<HTMLDivElement>(null);
  const [weeks, setWeeks] = useState(18);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setWeeks(Math.max(8, Math.min(maxWeeks, Math.floor((el.clientWidth - 4 + 3) / 17))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxWeeks]);
  const set = new Set(checkins);
  const t = new Date(today + "T12:00:00");
  const dow = (t.getDay() + 6) % 7; // 周一 = 0
  const end = addDays(today, 6 - dow);
  const start = addDays(end, -(weeks * 7 - 1));
  const cols: string[][] = [];
  for (let w = 0; w < weeks; w++) cols.push(Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  const level = (d: string) => {
    const v = (logs[d]?.n ?? 0) + (logs[d]?.r ?? 0);
    if (!v) return 0;
    if (v < 10) return 1;
    if (v < 30) return 2;
    if (v < 60) return 3;
    return 4;
  };
  const shade = ["bg-secondary", "bg-primary/25", "bg-primary/45", "bg-primary/70", "bg-primary"];
  const months: { col: number; label: string }[] = [];
  cols.forEach((c, k) => {
    const first = c.find((d) => d.endsWith("-01"));
    if (!first) return;
    const prev = months[months.length - 1];
    if (prev && k - prev.col < 3) return;
    months.push({ col: k, label: `${Number(first.slice(5, 7))}月` });
  });
  return (
    <div data-testid="heatmap" ref={box}>
      <div className="flex justify-center overflow-hidden px-[2px] py-[2px]">
        <div className="shrink-0">
          <div className="relative mb-1 h-4 text-[10px] text-muted-foreground">
            {months.map((m) => (
              <span key={m.col} className="absolute" style={{ left: m.col * 17 }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {cols.map((c, k) => (
              <div key={k} className="flex flex-col gap-[3px]">
                {c.map((d) => {
                  const future = diffDays(today, d) > 0;
                  const lv = level(d);
                  const checked = set.has(d);
                  return (
                    <div
                      key={d}
                      title={`${d}${checked ? " · 已打卡" : ""}${lv ? ` · ${(logs[d]?.n ?? 0) + (logs[d]?.r ?? 0)} 词` : ""}`}
                      data-day={d}
                      data-checked={checked ? 1 : 0}
                      className={cn(
                        "relative size-[14px] rounded-[4px]",
                        future ? "bg-transparent" : checked && !lv ? "bg-primary/45" : shade[lv],
                        d === today && "ring-2 ring-foreground/70 ring-offset-1 ring-offset-card",
                      )}
                    >
                      {checked && <span className="absolute inset-[4px] rounded-full bg-white/90 dark:bg-white/80" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="relative inline-block size-3 rounded-[3px] bg-primary">
            <span className="absolute inset-[3.5px] rounded-full bg-white/90" />
          </span>
          已打卡
        </span>
        <span className="flex items-center gap-1">
          少
          {shade.map((s) => (
            <i key={s} className={cn("inline-block size-3 rounded-[3px]", s)} />
          ))}
          多
        </span>
      </div>
    </div>
  );
}

export function WeekStrip({ checkins, logs, today }: { checkins: string[]; logs: Record<string, DayLog>; today: string }) {
  const set = new Set(checkins);
  const names = ["一", "二", "三", "四", "五", "六", "日"];
  const t = new Date(today + "T12:00:00");
  const dow = (t.getDay() + 6) % 7;
  const monday = addDays(today, -dow);
  return (
    <div className="grid grid-cols-7 gap-1.5" data-testid="week-strip">
      {names.map((n, k) => {
        const d = addDays(monday, k);
        const checked = set.has(d);
        const studied = (logs[d]?.n ?? 0) + (logs[d]?.r ?? 0) > 0;
        const isToday = d === today;
        return (
          <div key={d} className="flex flex-col items-center gap-1.5">
            <span className={cn("text-[11px]", isToday ? "font-bold text-foreground" : "text-muted-foreground")}>{n}</span>
            <span
              className={cn(
                "grid size-9 place-items-center rounded-full text-[12px] font-semibold tnum",
                checked
                  ? "bg-primary text-primary-foreground"
                  : studied
                    ? "bg-brand-soft text-primary"
                    : "bg-secondary text-muted-foreground",
                isToday && !checked && "ring-2 ring-primary/60",
              )}
            >
              {checked ? "✓" : Number(d.slice(8))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
