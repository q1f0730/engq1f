import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "@/components/app/icons";
import { useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { Segmented, Spinner } from "@/components/app/shell";
import { Sec, SubHead, TabLine, actClass } from "@/components/app/kit";
import { Label } from "@/components/app/settings-panels";
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
  if (error) return <div className="p-8 text-center text-sm text-ink-3">{error}</div>;
  if (!index) return <Spinner />;
  return (
    <div data-testid="algo" data-tab={tab}>
      <SubHead back={{ to: "/me", label: "我的", testid: "algo-back" }} title="记忆算法" sub="全部在这台设备上计算，不联网" />
      <TabLine<Tab>
        value={tab}
        onChange={(v) => navigate({ to: "/algo", search: v === "sim" ? { tab: "sim" } : {}, replace: true })}
        testid="algo-tabs"
        className="mb-6"
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
const G_TONE: Record<Grade4, string> = { forget: "bg-forget", vague: "bg-vague", know: "bg-know", easy: "bg-ink" };
const G_TEXT: Record<Grade4, string> = { forget: "text-forget", vague: "text-vague", know: "text-know", easy: "text-ink" };

function HowTab() {
  const st = useApp();
  const s = st.settings;
  const [ivl, setIvl] = useState(7);
  const [ease, setEase] = useState(2.5);
  const [details, setDetailsState] = useState(() => {
    try {
      return sessionStorage.getItem("cet4v-algo-details") === "1";
    } catch {
      return false;
    }
  });
  const setDetails = (v: boolean) => {
    try {
      sessionStorage.setItem("cet4v-algo-details", v ? "1" : "0");
    } catch {
      /* 无痕模式 */
    }
    setDetailsState(v);
  };
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
    <>
      {/* 11.1 · 第一句讲人话；参数和公式收在「看细节」里。12.0 · 排成一段「凡例」：大字一句话 + 四条带编号的说明 */}
      <section data-testid="algo-plain" className="mb-10">
        <p className="text-[1.375rem] font-semibold leading-snug tracking-[-0.02em]">
          答错的词明天再来，<span className="hl">答对的越隔越久</span>。
        </p>
        <ol className="mt-5 border-t border-rule text-[0.875rem] leading-relaxed text-ink-2">
          {[
            "不认识：今天这一组里再来一遍，明天再复习。",
            "认识：下次隔得更久（1 天 → 3 天 → 一周 → 半个月……），越熟越少打扰你。",
            "连续隔 21 天还记得，就算掌握了；本来就会的词点「斩」直接跳过。",
            "每天要复习的量会自动摊平，不会某天突然堆一大堆。",
          ].map((t, k) => (
            <li key={k} className="grid grid-cols-[1.5rem_1fr] gap-x-2 border-b border-rule py-2.5">
              <span className="tnum font-serif text-[1rem] text-ink-3">{k + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <button type="button" data-testid="algo-details" aria-expanded={details} onClick={() => setDetails(!details)} className={actClass("quiet") + " mt-3 h-10 text-[0.875rem] text-ink"}>
          {details ? "收起细节" : "看细节：间隔具体怎么算"}
        </button>
      </section>
      {details && (
        <div className="grid gap-12 md:grid-cols-2 md:gap-x-10">
          <Sec title="一次评分，间隔怎么变" testid="algo-effects">
            <Label>这张卡现在的间隔</Label>
            <Segmented<number> value={ivl} onChange={setIvl} testid="eff-ivl" options={IVL_OPTIONS.map((v) => ({ value: v, label: v < 0 ? "新词" : `${v}天` }))} />
            <Label>这个词难不难</Label>
            <Segmented<number> value={ease} onChange={setEase} testid="eff-ease" options={EASE_OPTIONS.map((v) => ({ value: v, label: `${EASE_CN[v]} ${v.toFixed(1)}` }))} />
            {/* 四条细横线：长度 = 下次隔几天；颜色只在左边那一小格 */}
            <div className="mt-5 border-t border-ink" data-testid="eff-bars">
              {order.map((g) => {
                const d = eff[g];
                const dim = g === "easy" && !s.fourKey;
                return (
                  <div key={g} className={cn("grid grid-cols-[3.25rem_minmax(0,1fr)_3.75rem] items-center gap-3 border-b border-rule py-2.5", dim && "opacity-45")} data-testid={`eff-${g}`} data-days={d}>
                    <span className={cn("flex items-center gap-1.5 text-[0.8125rem] font-semibold", G_TEXT[g])}>
                      <span className={cn("size-2 shrink-0 rounded-[2px]", G_TONE[g])} aria-hidden />
                      {G_CN[g]}
                    </span>
                    <div className="h-2 min-w-0 bg-paper-2">
                      <div className="h-full bg-ink transition-all duration-500" style={{ width: `${d ? Math.max(4, (d / max) * 100) : 0}%` }} />
                    </div>
                    <span className="tnum text-right font-serif text-[1.125rem] leading-none">{d === 0 ? "今天" : intervalLabel(d)}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-3" data-testid="eff-note">
              {ivl < 0
                ? "新词第一次就认识 → 2 天后；模糊 / 不认识 → 本组里再来一遍，直到认识。"
                : `认识：${ivl} × ${ease.toFixed(1)}${ret !== 90 ? ` × ${retentionScale(ret).toFixed(2)}` : ""}；模糊：×1.2 且系数 −0.15；不认识：当天重学，系数 −0.2。`}
              {!s.fourKey && " 「简单」在四键模式下才有。"}
            </p>
          </Sec>

          <Sec title="一直答「认识」，间隔这样涨" testid="algo-growth">
            <GrowthChart series={series} />
            <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-3">
              间隔到 {MASTER_DAYS} 天算「已掌握」。系数越高涨得越快；答「模糊」「不认识」会压低系数，所以难词复习更勤。
            </p>
          </Sec>

          <Sec
            title="进阶规则"
            testid="algo-rules"
            className="md:col-span-2"
            aside={
              <Link to="/me" className="press inline-flex h-9 items-center underline decoration-rule-strong underline-offset-4 hover:text-ink">
                去设置
              </Link>
            }
          >
            <ul className="border-t border-rule md:columns-2 md:gap-x-10">
              {rules.map((r) => (
                <li key={r.k} className="grid break-inside-avoid grid-cols-[2.75rem_1fr] gap-x-3 border-b border-rule py-3" data-testid={`rule-${r.k}`} data-on={r.on ? 1 : 0}>
                  <span className={cn("pt-0.5 text-[0.75rem] font-semibold", r.on ? "text-ink" : "text-ink-3")}>
                    <span className={cn(r.on && "hl")}>{r.on ? "已开" : "关"}</span>
                  </span>
                  <div className="min-w-0">
                    <div className="text-[0.875rem] font-semibold">{r.title}</div>
                    <div className="mt-0.5 text-[0.75rem] leading-relaxed text-ink-3">{r.text}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Sec>
        </div>
      )}
    </>
  );
}

/** 12.0 · 三条线都是墨色，用粗细和虚实区分（难词细虚线、一般实线、易词粗线），不用三种颜色 */
const SERIES_W = [1.5, 2.5, 3.5];
const SERIES_DASH: (string | undefined)[] = ["6 5", undefined, undefined];

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
        {/* 「已掌握」以上是一条荧光笔带 */}
        <rect x={L} y={T} width={W - L - R} height={y(MASTER_DAYS) - T} fill="var(--mark-soft)" opacity={0.5} />
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--rule)" strokeWidth={1} />
            <text x={L - 8} y={y(v) + 6} fontSize={17} textAnchor="end" fill="var(--ink-3)">
              {v}
            </text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(MASTER_DAYS)} y2={y(MASTER_DAYS)} stroke="var(--ink)" strokeDasharray="5 5" strokeWidth={1.5} />
        <text x={L + 8} y={y(MASTER_DAYS) - 7} fontSize={16} textAnchor="start" fill="var(--ink)">
          {MASTER_DAYS} 天 · 已掌握
        </text>
        {series.map((s, si) => (
          <g key={si} data-testid="growth-series" data-ease={EASE_OPTIONS[si]} data-values={s.join(",")}>
            <path
              d={s.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={SERIES_W[si]}
              strokeDasharray={SERIES_DASH[si]}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.map((v, k) => (
              <circle key={k} cx={x(k)} cy={y(v)} r={3.5} fill={si === 1 ? "var(--ink)" : "var(--paper)"} stroke="var(--ink)" strokeWidth={1.5} />
            ))}
          </g>
        ))}
        {series[0].map((_, k) => (
          <text key={k} x={x(k)} y={H - 8} fontSize={17} textAnchor="middle" fill="var(--ink-3)">
            第{k + 1}次
          </text>
        ))}
      </svg>
      <div className="mt-2 space-y-1 border-t border-rule pt-2 text-[0.75rem] text-ink-3">
        {EASE_OPTIONS.map((e, si) => (
          <div key={e} className="flex items-center gap-2">
            <svg width="20" height="6" aria-hidden>
              <line x1="0" x2="20" y1="3" y2="3" stroke="var(--ink)" strokeWidth={SERIES_W[si] / 1.5} strokeDasharray={SERIES_DASH[si] ? "3 3" : undefined} />
            </svg>
            {EASE_CN[e]} {e.toFixed(1)}：<span className="tnum font-serif text-[0.9375rem] text-ink-2">{series[si].slice(0, 4).join(" → ")}</span> 天…
          </div>
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
    <div className="grid gap-12 md:grid-cols-2 md:gap-x-10">
      <Sec title="每天学多少新词？" testid="sim-input">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="tnum font-serif text-[4.5rem] leading-[0.85] tracking-[-0.03em]" data-testid="sim-n">
              {n}
            </span>
            <span className="text-[0.9375rem] text-ink-2">词 / 天</span>
          </div>
          <div className="pb-1 text-right text-[0.75rem] leading-tight text-ink-3" data-testid="sim-finish">
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
          className="mt-5 w-full accent-[var(--ink)]"
        />
        <div className="tnum mt-1 flex justify-between font-serif text-[0.875rem] text-ink-3">
          <span>{SIM_MIN}</span>
          <span>50</span>
          <span>{SIM_MAX}</span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" data-testid="sim-minus" aria-label="减 5" onClick={() => setN((v) => Math.max(SIM_MIN, v - SIM_STEP))} className={actClass("secondary") + " h-11 w-12 px-0 text-lg"}>
            −
          </button>
          <button type="button" data-testid="sim-plus" aria-label="加 5" onClick={() => setN((v) => Math.min(SIM_MAX, v + SIM_STEP))} className={actClass("secondary") + " h-11 w-12 px-0 text-lg"}>
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
            className={cn(actClass("primary", true), "h-11 truncate px-3 text-[0.8125rem] disabled:bg-transparent disabled:text-ink-3 disabled:ring-1 disabled:ring-inset disabled:ring-rule")}
          >
            {n === daily ? `就是现在的计划（${daily}）` : `设为每日新词（现在 ${daily}）`}
          </button>
        </div>
      </Sec>

      <Sec title="未来 30 天" aside={`按记住率 ${ret}% 估算`} testid="sim-result">
        <dl className="grid grid-cols-3 divide-x divide-rule border-y border-rule py-3">
          <Stat testid="sim-tail" label="第 4 周日均" value={res.tail} hint={cur ? diffHint(res.tail, cur.tail) : "复习 / 天"} />
          <Stat testid="sim-peak" label="最忙一天" value={res.peak} hint={`第 ${res.peakDay + 1} 天`} />
          <Stat testid="sim-total" label="30 天总复习" value={res.total} hint={`新学 ${res.learned}`} />
        </dl>
        <SimBars res={res} cur={cur} />
        <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-3" data-testid="sim-note">
          含你现有的 {Object.values(st.cards).filter((c) => !c.k).length} 个学习记录；每次复习按 {ret}% 记得、其余第二天重学来估，和实际会有出入。
          {res.tail > 150 && " 每天要复习 150 个以上，很难坚持，建议少学一点。"}
        </p>
      </Sec>
    </div>
  );
}

function diffHint(a: number, b: number) {
  const d = a - b;
  return d === 0 ? "和现在一样" : `比现在${d > 0 ? "多" : "少"} ${Math.abs(d)}`;
}

function Stat({ label, value, hint, testid }: { label: string; value: number; hint: string; testid: string }) {
  return (
    <div className="min-w-0 px-3 first:pl-0" data-testid={testid} data-value={value}>
      <dt className="truncate text-[0.6875rem] text-ink-3">{label}</dt>
      <dd className="tnum mt-1 font-serif text-[2rem] leading-none">{value}</dd>
      <dd className="mt-1 truncate text-[0.6875rem] text-ink-3">{hint}</dd>
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
    <div className="mt-4" data-testid="sim-chart" data-reviews={res.days.map((d) => d.reviews).join(",")}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="30 天每日复习量">
        {res.days.map((d, k) => {
          const h = d.reviews ? Math.max(3, H - 28 - y(d.reviews)) : 0;
          return (
            <rect
              key={k}
              x={P + bw * k + bw * 0.2}
              y={H - 28 - h}
              width={bw * 0.6}
              height={h}
              rx={1.5}
              fill={k === res.peakDay ? "var(--mark)" : "var(--rule-strong)"}
              stroke={k === res.peakDay ? "var(--ink)" : "none"}
              strokeWidth={1.2}
            />
          );
        })}
        {line && <path d={line} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="5 5" strokeLinejoin="round" />}
        <line x1={P} x2={W - P} y1={H - 28} y2={H - 28} stroke="var(--ink)" />
        <text x={P} y={H - 6} fontSize={18} fill="var(--ink-3)">
          今天
        </text>
        <text x={W / 2} y={H - 6} fontSize={18} textAnchor="middle" fill="var(--ink-3)">
          第 15 天
        </text>
        <text x={W - P} y={H - 6} fontSize={18} textAnchor="end" fill="var(--ink-3)">
          第 30 天
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 text-[0.75rem] text-ink-3">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-[2px] bg-rule-strong" />
          每日复习量（最忙一天划荧光笔）
        </span>
        {cur && (
          <span className="flex items-center gap-1.5" data-testid="sim-cur-legend">
            <i className="inline-block h-0 w-4 border-t-[1.5px] border-dashed border-ink" />
            现在的计划
          </span>
        )}
      </div>
    </div>
  );
}
