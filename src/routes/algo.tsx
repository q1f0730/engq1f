import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, PanelTitle, Segmented, Spinner } from "@/components/app/shell";
import { today } from "@/lib/clock";
import { useWords } from "@/lib/data";
import { summarize } from "@/lib/plan";
import { MASTER_DAYS, intervalLabel, retentionScale } from "@/lib/srs";
import { setSettings, useApp } from "@/lib/store";
import { FIT_MIN, SIM_MAX, SIM_MIN, SIM_STEP, cleanRetention, fitInitialEase, growthSeries, ratingEffects, simulatePlan, type Grade4 } from "@/lib/algo";
import { cn } from "@/lib/utils";

type Tab = "how" | "sim";

export const Route = createFileRoute("/algo")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab; n?: number } => ({
    tab: s.tab === "sim" ? "sim" : undefined,
    n: typeof s.n === "number" && s.n >= 0 && s.n <= SIM_MAX ? Math.round(s.n) : undefined,
  }),
  component: AlgoPage,
});

/** v10 · 算法说明 + 计划模拟器 */
function AlgoPage() {
  const { index, error } = useWords();
  const { tab = "how", n } = Route.useSearch();
  const navigate = useNavigate();
  if (error) return <div className="p-8 text-center text-sm text-muted-foreground">{error}</div>;
  if (!index) return <Spinner />;
  return (
    <div data-testid="algo" data-tab={tab}>
      <Link to="/me" className="-ml-1 mt-4 flex w-fit items-center gap-0.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground" data-testid="algo-back">
        <ChevronLeft className="size-4" /> 我的
      </Link>
      <PageHeader title="记忆算法" sub="SM-2 变体 · 全部在这台手机上计算" />
      <Segmented<Tab>
        value={tab}
        onChange={(v) => navigate({ to: "/algo", search: v === "sim" ? { tab: "sim" } : {}, replace: true })}
        testid="algo-tabs"
        className="mb-4"
        options={[
          { value: "how", label: "算法说明" },
          { value: "sim", label: "计划模拟器" },
        ]}
      />
      {tab === "sim" ? <SimTab n0={n} /> : <HowTab />}
    </div>
  );
}

// ---------------------------------------------------------------- 算法说明

const IVL_OPTIONS = [-1, 1, 3, 7, 15, 30];
const EASE_OPTIONS = [2.1, 2.5, 2.8];
const EASE_CN: Record<number, string> = { 2.1: "难词", 2.5: "一般", 2.8: "易词" };
const G_CN: Record<Grade4, string> = { forget: "不认识", vague: "模糊", know: "认识", easy: "简单" };
const G_TONE: Record<Grade4, string> = { forget: "bg-forget", vague: "bg-vague", know: "bg-know", easy: "bg-primary" };
const G_TEXT: Record<Grade4, string> = { forget: "text-forget", vague: "text-vague", know: "text-know", easy: "text-primary" };

function HowTab() {
  const st = useApp();
  const s = st.settings;
  const [ivl, setIvl] = useState(7);
  const [ease, setEase] = useState(2.5);
  const eff = ratingEffects(ivl, ease, s);
  const max = Math.max(1, ...Object.values(eff));
  const order: Grade4[] = ["forget", "vague", "know", "easy"];
  const ret = cleanRetention(s.retention);
  const fit = fitInitialEase(st.revlog);
  const series = EASE_OPTIONS.map((e) => growthSeries(e, 6, s));
  const rules: { k: string; title: string; on: boolean; text: string }[] = [
    { k: "retention", title: `保持目标 ${ret}%`, on: ret !== 90, text: ret === 90 ? "默认目标，间隔不缩放。" : `「认识」后的间隔 ×${retentionScale(ret).toFixed(2)}（ln ${ret}% ÷ ln 90%）。` },
    { k: "fuzz", title: "间隔随机扰动", on: !!s.fuzz, text: "≥4 天的间隔随机 ±5%（至少 ±1 天），同一天学的词错开复习。" },
    { k: "balance", title: "负荷均衡", on: !!s.balance, text: "某天到期量超过未来 30 天均值的 1.5 倍，≥4 天间隔的词挪到前后较空的一天。" },
    { k: "overdue", title: "逾期加成", on: !!s.overdue, text: "实际隔了 ≥1.5 倍间隔（且逾期 ≥2 天）还记得，按实际天数 × 系数算新间隔。" },
    { k: "steps", title: "重学步骤", on: !!s.steps, text: "复习中忘掉的词：当天重学 → 1 天 → 3 天，之后恢复 × 系数增长。" },
    { k: "fourKey", title: "四键模式", on: !!s.fourKey, text: "「简单」= 认识的间隔再 ×1.3，系数 +0.15。" },
    {
      k: "fitEase",
      title: "初始难度拟合",
      on: !!s.fitEase,
      text: fit.ok
        ? `你的新词首答正确率 ${Math.round((fit.acc ?? 0) * 100)}%，新词初始系数 ${fit.ease.toFixed(2)}（80% 对应 2.50）。`
        : `需要 ${FIT_MIN} 次新词首答，现在 ${fit.n} 次；之前用默认系数 2.50。`,
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-5">
      <Panel data-testid="algo-effects">
        <PanelTitle>一次评分，间隔怎么变</PanelTitle>
        <div className="mb-1.5 text-[12px] font-bold tracking-wider text-muted-foreground">这张卡现在的间隔</div>
        <Segmented<number> value={ivl} onChange={setIvl} testid="eff-ivl" options={IVL_OPTIONS.map((v) => ({ value: v, label: v < 0 ? "新词" : `${v}天` }))} />
        <div className="mb-1.5 mt-3 text-[12px] font-bold tracking-wider text-muted-foreground">记忆系数（ease）</div>
        <Segmented<number> value={ease} onChange={setEase} testid="eff-ease" options={EASE_OPTIONS.map((v) => ({ value: v, label: `${EASE_CN[v]} ${v.toFixed(1)}` }))} />
        <div className="mt-4 space-y-2.5" data-testid="eff-bars">
          {order.map((g) => {
            const d = eff[g];
            const dim = g === "easy" && !s.fourKey;
            return (
              <div key={g} className={cn("flex items-center gap-3", dim && "opacity-45")} data-testid={`eff-${g}`} data-days={d}>
                <span className={cn("w-12 shrink-0 text-[13px] font-bold", G_TEXT[g])}>{G_CN[g]}</span>
                <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-secondary">
                  <div className={cn("h-full rounded-lg transition-all duration-500", G_TONE[g])} style={{ width: `${d ? Math.max(6, (d / max) * 100) : 0}%`, opacity: 0.85 }} />
                </div>
                <span className="tnum w-14 shrink-0 text-right text-[14px] font-bold">{d === 0 ? "今天" : intervalLabel(d)}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground" data-testid="eff-note">
          {ivl < 0
            ? "新词第一次就认识 → 2 天后；模糊 / 不认识 → 本组里再来一遍，直到认识。"
            : `认识：${ivl} × ${ease.toFixed(1)}${ret !== 90 ? ` × ${retentionScale(ret).toFixed(2)}` : ""}；模糊：×1.2 且系数 −0.15；不认识：当天重学，系数 −0.2。`}
          {!s.fourKey && " 「简单」在四键模式下才有。"}
        </p>
      </Panel>

      <Panel data-testid="algo-growth">
        <PanelTitle>一直答「认识」，间隔这样涨</PanelTitle>
        <GrowthChart series={series} />
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          间隔到 {MASTER_DAYS} 天算「已掌握」。系数越高涨得越快；答「模糊」「不认识」会压低系数，所以难词复习更勤。
        </p>
      </Panel>

      <Panel data-testid="algo-rules" className="md:col-span-2">
        <PanelTitle
          right={
            <Link to="/me" className="flex items-center text-[13px] text-muted-foreground hover:text-foreground">
              去设置 <ChevronRight className="size-4" />
            </Link>
          }
        >
          进阶规则
        </PanelTitle>
        <ul className="divide-y divide-border/60">
          {rules.map((r) => (
            <li key={r.k} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0" data-testid={`rule-${r.k}`} data-on={r.on ? 1 : 0}>
              <span className={cn("mt-0.5 w-10 shrink-0 rounded-full py-px text-center text-[11px] font-bold", r.on ? "bg-know-soft text-know" : "bg-secondary text-muted-foreground")}>{r.on ? "已开" : "关"}</span>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold">{r.title}</div>
                <div className="text-[12px] leading-relaxed text-muted-foreground">{r.text}</div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

const SERIES_COLOR = ["var(--forget)", "var(--primary)", "var(--know)"];

function GrowthChart({ series }: { series: number[][] }) {
  const W = 600;
  const H = 230;
  const L = 44;
  const R = 16;
  const T = 14;
  const B = 34;
  const n = series[0].length;
  const max = Math.max(MASTER_DAYS + 5, ...series.flat());
  const x = (k: number) => L + ((W - L - R) * k) / (n - 1);
  // 平方根刻度：前几次的几天和后面的几个月都看得清
  const y = (v: number) => T + (H - T - B) * (1 - Math.sqrt(v / max));
  const ticks = [0, 7, 60, 180, 365].filter((v) => v <= max);
  return (
    <div data-testid="growth-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="连续认识时的间隔增长">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={L - 8} y={y(v) + 6} fontSize={17} textAnchor="end" fill="var(--muted-foreground)">
              {v}
            </text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(MASTER_DAYS)} y2={y(MASTER_DAYS)} stroke="var(--know)" strokeDasharray="6 6" strokeWidth={2} opacity={0.7} />
        <text x={L + 8} y={y(MASTER_DAYS) - 7} fontSize={16} textAnchor="start" fill="var(--know)" fontWeight={700}>
          {MASTER_DAYS} 天 · 已掌握
        </text>
        {series.map((s, si) => (
          <g key={si} data-testid="growth-series" data-ease={EASE_OPTIONS[si]} data-values={s.join(",")}>
            <path d={s.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} fill="none" stroke={SERIES_COLOR[si]} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
            {s.map((v, k) => (
              <circle key={k} cx={x(k)} cy={y(v)} r={4.5} fill={SERIES_COLOR[si]} />
            ))}
          </g>
        ))}
        {series[0].map((_, k) => (
          <text key={k} x={x(k)} y={H - 8} fontSize={17} textAnchor="middle" fill="var(--muted-foreground)">
            第{k + 1}次
          </text>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        {EASE_OPTIONS.map((e, si) => (
          <span key={e} className="flex items-center gap-1.5">
            <i className="inline-block h-[3px] w-4 rounded" style={{ background: SERIES_COLOR[si] }} />
            {EASE_CN[e]} {e.toFixed(1)}：{series[si].slice(0, 4).join(" → ")} 天…
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 计划模拟器

function SimTab({ n0 }: { n0?: number }) {
  const { index } = useWords();
  const st = useApp();
  const day = today();
  const daily = st.settings.daily;
  const [n, setN] = useState(n0 ?? daily);
  const sum = index ? summarize(index, st, day) : null;
  const newLeft = sum?.newLeft ?? 0;
  const ret = cleanRetention(st.settings.retention);
  const fit = fitInitialEase(st.revlog);
  const initEase = st.settings.fitEase && fit.ok ? fit.ease : undefined;
  const res = useMemo(() => simulatePlan(st.cards, day, { perDay: n, newLeft, retention: ret, initEase }), [st.cards, day, n, newLeft, ret, initEase]);
  const cur = useMemo(() => (n === daily ? null : simulatePlan(st.cards, day, { perDay: daily, newLeft, retention: ret, initEase })), [st.cards, day, n, daily, newLeft, ret, initEase]);
  const daysToFinish = n > 0 ? Math.ceil(newLeft / n) : null;
  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-5">
      <Panel data-testid="sim-input">
        <PanelTitle>每天学多少新词？</PanelTitle>
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-1.5">
            <span className="tnum font-display text-[52px] font-extrabold leading-none tracking-tight text-primary" data-testid="sim-n">
              {n}
            </span>
            <span className="text-[15px] font-bold text-muted-foreground">词 / 天</span>
          </div>
          <div className="pb-1 text-right text-[12px] leading-tight text-muted-foreground" data-testid="sim-finish">
            {newLeft === 0 ? "词书已学完" : daysToFinish ? `剩 ${newLeft} 词 · 约 ${daysToFinish} 天学完` : `剩 ${newLeft} 词 · 不学新词`}
          </div>
        </div>
        <input
          type="range"
          min={SIM_MIN}
          max={SIM_MAX}
          step={SIM_STEP}
          value={n}
          onChange={(e) => setN(Number(e.target.value))}
          aria-label="每日新词数"
          data-testid="sim-range"
          className="mt-4 w-full accent-[var(--primary)]"
        />
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span>{SIM_MIN}</span>
          <span>50</span>
          <span>{SIM_MAX}</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" data-testid="sim-minus" aria-label="减 5" onClick={() => setN((v) => Math.max(SIM_MIN, v - SIM_STEP))} className="h-10 w-12 rounded-xl bg-secondary text-[18px] font-bold">
            −
          </button>
          <button type="button" data-testid="sim-plus" aria-label="加 5" onClick={() => setN((v) => Math.min(SIM_MAX, v + SIM_STEP))} className="h-10 w-12 rounded-xl bg-secondary text-[18px] font-bold">
            +
          </button>
          <button
            type="button"
            data-testid="sim-apply"
            disabled={n === daily || n === 0}
            onClick={() => {
              setSettings({ daily: n });
              toast.success(`每日新词改为 ${n}`);
            }}
            className="h-10 flex-1 rounded-xl bg-primary text-[14px] font-bold text-primary-foreground transition disabled:bg-secondary disabled:text-muted-foreground"
          >
            {n === daily ? `就是现在的计划（${daily}）` : `设为每日新词（现在 ${daily}）`}
          </button>
        </div>
      </Panel>

      <Panel data-testid="sim-result">
        <PanelTitle right={<span className="text-[12px] text-muted-foreground">按记住率 {ret}% 估算</span>}>未来 30 天</PanelTitle>
        <div className="grid grid-cols-3 gap-2">
          <Stat testid="sim-tail" label="第 4 周日均" value={res.tail} hint={cur ? diffHint(res.tail, cur.tail) : "复习 / 天"} />
          <Stat testid="sim-peak" label="最忙一天" value={res.peak} hint={`第 ${res.peakDay + 1} 天`} />
          <Stat testid="sim-total" label="30 天总复习" value={res.total} hint={`新学 ${res.learned}`} />
        </div>
        <SimBars res={res} cur={cur} />
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground" data-testid="sim-note">
          含你现有的 {Object.values(st.cards).filter((c) => !c.k).length} 个学习记录；每次复习按 {ret}% 记得、其余第二天重学来估，和实际会有出入。
          {res.tail > 150 && " 每天要复习 150 个以上，很难坚持，建议少学一点。"}
        </p>
      </Panel>
    </div>
  );
}

function diffHint(a: number, b: number) {
  const d = a - b;
  return d === 0 ? "和现在一样" : `比现在${d > 0 ? "多" : "少"} ${Math.abs(d)}`;
}

function Stat({ label, value, hint, testid }: { label: string; value: number; hint: string; testid: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-secondary/70 px-3 py-2.5" data-testid={testid} data-value={value}>
      <div className="truncate text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="tnum font-display text-[24px] font-extrabold leading-tight">{value}</div>
      <div className="truncate text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function SimBars({ res, cur }: { res: ReturnType<typeof simulatePlan>; cur: ReturnType<typeof simulatePlan> | null }) {
  const W = 600;
  const H = 180;
  const P = 6;
  const n = res.days.length;
  const bw = (W - P * 2) / n;
  const max = Math.max(1, ...res.days.map((d) => d.reviews), ...(cur?.days.map((d) => d.reviews) ?? []));
  const y = (v: number) => H - 28 - (v / max) * (H - 50);
  const line = cur?.days.map((d, k) => `${k ? "L" : "M"}${(P + bw * k + bw / 2).toFixed(1)},${y(d.reviews).toFixed(1)}`).join(" ");
  return (
    <div className="mt-3" data-testid="sim-chart" data-reviews={res.days.map((d) => d.reviews).join(",")}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="30 天每日复习量">
        {res.days.map((d, k) => {
          const h = d.reviews ? Math.max(3, H - 28 - y(d.reviews)) : 0;
          return <rect key={k} x={P + bw * k + bw * 0.15} y={H - 28 - h} width={bw * 0.7} height={h} rx={2.5} fill="var(--primary)" opacity={k === res.peakDay ? 0.95 : 0.35} />;
        })}
        {line && <path d={line} fill="none" stroke="var(--muted-foreground)" strokeWidth={2.5} strokeDasharray="5 5" strokeLinejoin="round" />}
        <line x1={P} x2={W - P} y1={H - 28} y2={H - 28} stroke="var(--border)" />
        <text x={P} y={H - 6} fontSize={18} fill="var(--muted-foreground)">
          今天
        </text>
        <text x={W / 2} y={H - 6} fontSize={18} textAnchor="middle" fill="var(--muted-foreground)">
          第 15 天
        </text>
        <text x={W - P} y={H - 6} fontSize={18} textAnchor="end" fill="var(--muted-foreground)">
          第 30 天
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-sm bg-primary/50" />
          每日复习量
        </span>
        {cur && (
          <span className="flex items-center gap-1.5" data-testid="sim-cur-legend">
            <i className="inline-block h-0 w-4 border-t-2 border-dashed border-muted-foreground" />
            现在的计划
          </span>
        )}
      </div>
    </div>
  );
}
