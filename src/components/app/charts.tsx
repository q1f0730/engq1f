import { useEffect, useRef, useState } from "react";
import { addDays, diffDays, type DayLog } from "@/lib/srs";
import { cn } from "@/lib/utils";

/**
 * 12.0 · 柱状读数（统计 → 本周）：像尺子上的刻度。
 * 每根柱子上面写数字（衬线），下面写日期；普通柱是淡墨，「今天」是荧光笔 + 墨色描边。底下一条墨色基线。
 */
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
  const h = (v: number) => Math.max(v ? 6 : 2, (v / max) * height);
  return (
    <figure className={cn("min-w-0", className)} data-testid={testid}>
      <ol className="grid items-end gap-2 border-b border-ink" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`, height: height + 22 }}>
        {data.map((d, k) => (
          <li key={k} className="flex h-full min-w-0 flex-col items-center justify-end gap-1.5">
            <span className={cn("tnum font-serif text-[1rem] leading-none", d.strong ? "text-ink" : "text-ink-3")}>{d.value}</span>
            <span
              className={cn("block w-full max-w-8 rounded-t-[3px]", d.strong ? "bg-mark shadow-[inset_0_0_0_1.5px_var(--ink)]" : "bg-ink-3/45")}
              style={{ height: h(d.value), transition: "height 700ms var(--ease-spring)" }}
            />
          </li>
        ))}
      </ol>
      <figcaption className="mt-1.5 grid gap-2" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
        {data.map((d, k) => (
          <span key={k} className={cn("truncate text-center text-[0.6875rem]", d.strong ? "font-semibold text-ink" : "text-ink-3")}>
            {d.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/**
 * 30 天学习曲线。12.0 · 墨线 = 累计学过的词（只有它是主角），每天的学习量退成线下的一排细刻度；
 * 终点一个荧光笔小方块，旁边写总数。没有面积填充，没有网格。
 */
export function Curve({ logs, firstDays, today, days = 30 }: { logs: Record<string, DayLog>; firstDays: string[]; today: string; days?: number }) {
  const W = 600;
  const H = 180;
  const PAD = 6;
  const BASE = H - 20;
  const range = Array.from({ length: days }, (_, k) => addDays(today, k - days + 1));
  const daily = range.map((d) => (logs[d]?.n ?? 0) + (logs[d]?.r ?? 0));
  const start = range[0];
  const perDay = new Map<string, number>();
  for (const d of firstDays) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  let acc = firstDays.filter((d) => d < start).length;
  const cum = range.map((d) => (acc += perDay.get(d) ?? 0));
  const topBar = Math.max(1, ...daily);
  const topCum = Math.max(1, ...cum);
  const step = (W - PAD * 2) / days;
  const cx = (k: number) => PAD + step * k + step / 2;
  const cy = (v: number) => BASE - 8 - (v / topCum) * (BASE - 40);
  const path = cum.map((v, k) => `${k ? "L" : "M"}${cx(k).toFixed(1)},${cy(v).toFixed(1)}`).join(" ");
  const end = { x: cx(days - 1), y: cy(cum[days - 1]) };
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="30 天学习曲线">
        {daily.map((v, k) => (
          <line key={k} x1={cx(k)} x2={cx(k)} y1={BASE} y2={BASE - 4 - (v / topBar) * 28} stroke="var(--ink-3)" strokeOpacity={0.55} strokeWidth={step * 0.42} />
        ))}
        <line x1={PAD} x2={W - PAD} y1={BASE} y2={BASE} stroke="var(--ink)" />
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
        <rect x={end.x - 5} y={end.y - 5} width={10} height={10} rx={2} fill="var(--mark)" stroke="var(--ink)" strokeWidth={1.5} />
        <text x={end.x - 12} y={end.y - 12} fontSize={20} textAnchor="end" fill="var(--ink)" fontFamily="var(--font-serif)">
          {cum[days - 1]}
        </text>
        <text x={PAD} y={H - 3} fontSize={12} fill="var(--ink-3)">
          {start.slice(5).replace("-", "/")}
        </text>
        <text x={W - PAD} y={H - 3} fontSize={12} fill="var(--ink-3)" textAnchor="end">
          今天
        </text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-[0.75rem] text-ink-3">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-[2px] w-4 bg-ink" />
          累计学过 {cum[days - 1]} 词
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-1 bg-ink-3/55" />
          每日学习+复习
        </span>
      </figcaption>
    </figure>
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
  // 12.0 · 五档墨色：纸 → 淡墨 → 中墨 → 深墨 → 墨；打卡的日子是格子中间一小块荧光笔
  const shade = ["bg-paper-2", "bg-ink/20", "bg-ink/40", "bg-ink/65", "bg-ink"];
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
                        "relative size-[14px] rounded-[2px]",
                        onPick && !future && "cursor-pointer hover:outline hover:outline-2 hover:outline-ink",
                        future ? "bg-transparent outline outline-1 -outline-offset-1 outline-rule" : checked && !lv ? "bg-ink/20" : shade[lv],
                        d === today && "outline outline-[1.5px] outline-offset-1 outline-ink",
                      )}
                    >
                      {checked && <span className="absolute inset-[3.5px] rounded-[1px] bg-mark" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-rule pt-2 text-[0.6875rem] text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="relative inline-block size-3 rounded-[2px] bg-ink/40">
            <span className="absolute inset-[3px] rounded-[1px] bg-mark" />
          </span>
          已打卡
        </span>
        <span className="flex items-center gap-1">
          少
          {shade.map((s) => (
            <i key={s} className={cn("inline-block size-3 rounded-[2px]", s)} />
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

/**
 * 模拟小测成绩曲线：0~100 分。12.0 · 只有两条参考线——底线和「及格 60」的虚线（右端标字）；
 * 点是小圆（最近一次是荧光笔大圆），分数写在点上方，用衬线数字。
 */
export function ScoreLine({ scores, labels, testid }: { scores: number[]; labels: string[]; testid?: string }) {
  const W = 600;
  const H = 170;
  const LEFT = 12;
  const RIGHT = 44;
  const TOP = 28;
  const BOTTOM = 24;
  const n = scores.length;
  const span = W - LEFT - RIGHT;
  const x = (k: number) => (n === 1 ? LEFT + span / 2 : LEFT + 12 + ((span - 24) * k) / (n - 1));
  const y = (v: number) => TOP + (H - TOP - BOTTOM) * (1 - v / 100);
  const path = scores.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = n - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="小测成绩曲线" data-testid={testid} data-points={n}>
      <line x1={LEFT} x2={W - RIGHT} y1={y(0)} y2={y(0)} stroke="var(--ink)" />
      <line x1={LEFT} x2={W - RIGHT} y1={y(60)} y2={y(60)} stroke="var(--rule-strong)" strokeDasharray="5 6" />
      <text x={W - RIGHT + 6} y={y(60) + 4} fontSize={12} fill="var(--ink-3)">
        及格
      </text>
      {n > 1 && <path d={path} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
      {scores.map((v, k) => (
        <g key={k}>
          <circle cx={x(k)} cy={y(v)} r={k === last ? 6.5 : 3.5} fill={k === last ? "var(--mark)" : "var(--paper-3)"} stroke="var(--ink)" strokeWidth={1.75} data-score={v} />
          {(k === last || n <= 8) && (
            <text x={x(k)} y={y(v) - 12} fontSize={k === last ? 18 : 14} textAnchor="middle" fill={k === last ? "var(--ink)" : "var(--ink-2)"} fontFamily="var(--font-serif)">
              {v}
            </text>
          )}
        </g>
      ))}
      {n > 0 && (
        <text x={x(0)} y={H - 4} fontSize={12} textAnchor={n === 1 ? "middle" : "start"} fill="var(--ink-3)">
          {labels[0]}
        </text>
      )}
      {n > 1 && (
        <text x={x(last)} y={H - 4} fontSize={12} textAnchor="end" fill="var(--ink-3)">
          {labels[last]}
        </text>
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
