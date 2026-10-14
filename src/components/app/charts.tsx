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
          <span className={cn("tnum text-[0.6875rem] font-semibold", d.strong ? "text-ink" : "text-ink-3")}>{d.value}</span>
          <div className="flex w-full justify-center" style={{ height }}>
            <div
              className={cn("w-full max-w-9 self-end rounded-t-lg rounded-b-sm", d.strong ? "bg-ink" : "bg-ink")}
              style={{ height: `${Math.max(d.value ? 6 : 2, (d.value / max) * height)}px`, transition: "height 600ms ease" }}
            />
          </div>
          <span className={cn("truncate text-[0.6875rem]", d.strong ? "font-semibold text-ink" : "text-ink-3")}>{d.label}</span>
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
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-3">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-[3px] w-4 rounded bg-ink" />
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
  onPick,
}: {
  logs: Record<string, DayLog>;
  checkins: string[];
  today: string;
  maxWeeks?: number;
  /** 点某天（当日回看） */
  onPick?: (day: string) => void;
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
  const shade = ["bg-paper-2", "bg-ink", "bg-ink", "bg-ink", "bg-ink"];
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
          <div className="relative mb-1 h-4 text-[0.625rem] text-ink-3">
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
                      role={onPick && !future ? "button" : undefined}
                      aria-label={onPick && !future ? `${d} 当日回看` : undefined}
                      onClick={onPick && !future ? () => onPick(d) : undefined}
                      className={cn(
                        "relative size-[14px] rounded-[4px]",
                        onPick && !future && "cursor-pointer hover:ring-2 hover:ring-ink",
                        future ? "bg-transparent" : checked && !lv ? "bg-ink" : shade[lv],
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
      <div className="mt-3 flex items-center justify-between text-[0.6875rem] text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="relative inline-block size-3 rounded-[3px] bg-ink">
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

export function WeekStrip({
  checkins,
  logs,
  today,
  rest = -1,
  patched = [],
  pause,
  skip,
}: {
  checkins: string[];
  logs: Record<string, DayLog>;
  today: string;
  rest?: number;
  patched?: string[];
  /** 11.3 · 考后「先休息」的日子也显示成「休」 */
  pause?: { from: string; until?: string };
  /** 11.4 · 不算断签的日子：exam = 考试当天（「考」），rest = 考前没任务 / 休息中（「休」） */
  skip?: (d: string) => "exam" | "rest" | null;
}) {
  const set = new Set(checkins);
  const patchSet = new Set(patched);
  const names = ["一", "二", "三", "四", "五", "六", "日"];
  const t = new Date(today + "T12:00:00");
  const dow = (t.getDay() + 6) % 7;
  const monday = addDays(today, -dow);
  return (
    // 11.3 · 圆圈直径跟着列宽走（最大 2.25rem）：系统字号放大到 130% 时也不挤在一起
    <div className="grid grid-cols-7 gap-1" data-testid="week-strip">
      {names.map((n, k) => {
        const d = addDays(monday, k);
        const checked = set.has(d);
        const studied = (logs[d]?.n ?? 0) + (logs[d]?.r ?? 0) > 0;
        const isToday = d === today;
        const isPatch = checked && patchSet.has(d);
        const sk = !checked && d <= today && skip ? skip(d) : null;
        const isExam = sk === "exam";
        const isRest = !checked && (isExam || sk === "rest" || (rest >= 0 && new Date(d + "T12:00:00").getDay() === rest) || (!!pause && d >= pause.from && (!pause.until || d < pause.until) && d <= today));
        const future = d > today;
        return (
          <div key={d} className="flex min-w-0 flex-col items-center gap-1.5" data-day={d} data-state={isPatch ? "patched" : checked ? "checked" : isExam ? "exam" : isRest ? "rest" : studied ? "studied" : "none"}>
            <span className={cn("text-[0.6875rem]", isToday ? "font-semibold text-ink" : "text-ink-3")}>{n}</span>
            {/* 12.0 · 方格：打卡 = 荧光笔涂满；补卡 = 斜线涂；学了没打卡 = 底部一道；休 / 考 = 虚线框；今天 = 墨色框 */}
            <span
              className={cn(
                "tnum grid aspect-square w-full max-w-10 place-items-center rounded-lg text-[0.8125rem] font-medium",
                isPatch
                  ? "bg-[repeating-linear-gradient(135deg,var(--mark)_0_4px,var(--mark-soft)_4px_7px)] text-mark-ink"
                  : checked
                  ? "bg-mark text-mark-ink"
                  : isRest
                  ? "border border-dashed border-know/60 text-know"
                  : studied
                    ? "bg-paper-2 text-ink shadow-[inset_0_-3px_0_var(--mark)]"
                    : future
                      ? "text-ink-3/70"
                      : "bg-paper-2 text-ink-3",
                isToday && !checked && "ring-[1.5px] ring-ink ring-inset text-ink",
              )}
            >
              {isPatch ? "补" : checked ? "✓" : isExam ? "考" : isRest ? "休" : Number(d.slice(8))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 模拟小测成绩曲线：0~100 分，虚线 = 60 分 */
export function ScoreLine({ scores, labels, testid }: { scores: number[]; labels: string[]; testid?: string }) {
  const W = 600;
  const H = 170;
  const L = 30;
  const R = 14;
  const T = 26;
  const B = 24;
  const PAD = 14;
  const n = scores.length;
  const x = (k: number) => (n === 1 ? (L + W - R) / 2 : L + PAD + ((W - L - R - PAD * 2) * k) / (n - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / 100);
  const line = scores.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = n > 1 ? `${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z` : "";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="小测成绩曲线" data-testid={testid} data-points={n}>
      <defs>
        <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 60, 100].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeDasharray={g === 60 ? "6 6" : undefined} />
          <text x={L - 6} y={y(g) + 4} fontSize={12} textAnchor="end" fill="var(--muted-foreground)">
            {g}
          </text>
        </g>
      ))}
      {area && <path d={area} fill="url(#scoreFill)" />}
      {n > 1 && <path d={line} fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />}
      {scores.map((v, k) => (
        <g key={k}>
          <circle cx={x(k)} cy={y(v)} r={k === n - 1 ? 6 : 4} fill={k === n - 1 ? "var(--primary)" : "var(--card)"} stroke="var(--primary)" strokeWidth={2.5} data-score={v} />
          {(k === n - 1 || n <= 8) && (
            <text x={x(k)} y={y(v) - 11} fontSize={12} fontWeight={700} textAnchor="middle" fill="var(--foreground)">
              {v}
            </text>
          )}
        </g>
      ))}
      {n > 0 && (
        <>
          <text x={x(0)} y={H - 4} fontSize={12} textAnchor={n === 1 ? "middle" : "start"} fill="var(--muted-foreground)">
            {labels[0]}
          </text>
          {n > 1 && (
            <text x={x(n - 1)} y={H - 4} fontSize={12} textAnchor="end" fill="var(--muted-foreground)">
              {labels[n - 1]}
            </text>
          )}
        </>
      )}
    </svg>
  );
}

/**
 * 12.0 · 荧光笔进度条：下沉纸色的槽，荧光黄从左往右填；满了以后右端多一道墨色的收笔。
 * 宽度变化走 transform（scaleX），不触发布局。
 */
export function Meter({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div
      className={cn("relative h-2.5 overflow-hidden rounded-[3px] bg-paper-2", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
    >
      <div className="absolute inset-0 origin-left bg-mark transition-transform duration-700 ease-[var(--ease-spring)]" style={{ transform: `scaleX(${v})` }} />
      {v >= 1 && <div className="absolute inset-y-0 right-0 w-1 bg-ink" />}
    </div>
  );
}
