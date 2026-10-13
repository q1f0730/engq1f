import { Link, createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, Clock3, Flame, Repeat2, Sparkles, Target } from "lucide-react";
import { Bars, Curve, Heatmap, ScoreLine } from "@/components/app/charts";
import { fmtClock, quizStats, scoreOf } from "@/lib/exam";
import { PageHeader, Panel, PanelTitle, Spinner } from "@/components/app/shell";
import { today } from "@/lib/clock";
import { useWords } from "@/lib/data";
import { fmtMinutes } from "@/lib/format";
import { bookSize } from "@/lib/plan";
import { emptyLog, forecast, longestStreak, masteryCounts, streak } from "@/lib/srs";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/stats")({ component: StatsPage });

function StatsPage() {
  const { index } = useWords();
  const st = useApp();
  if (!index) return <Spinner />;
  const day = today();
  const log = st.log[day] ?? emptyLog();
  const all = Object.values(st.log).reduce((a, l) => ({ ok: a.ok + l.ok, a: a.a + l.a, ms: a.ms + l.ms }), { ok: 0, a: 0, ms: 0 });
  const acc = log.a ? Math.round((log.ok / log.a) * 100) : null;
  const accAll = all.a ? Math.round((all.ok / all.a) * 100) : null;
  const total = index.list.length;
  const m = masteryCounts(st.cards, total);
  const fc = forecast(st.cards, day, 7);
  const s = streak(st.checkins, day);
  const firstDays = Object.values(st.cards).map((c) => c.f);
  const book = bookSize(index, st.settings.book);

  return (
    <div data-testid="stats">
      <PageHeader title="统计" sub="学习数据都保存在这台设备上" />

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
        <Tile icon={<Sparkles className="size-4" />} label="今日新学" value={String(log.n)} tone="text-primary bg-brand-soft" testid="tile-new" />
        <Tile icon={<Repeat2 className="size-4" />} label="今日复习" value={String(log.r)} tone="text-know bg-know-soft" testid="tile-review" />
        <Tile icon={<Clock3 className="size-4" />} label="今日用时" value={fmtMinutes(log.ms)} tone="text-chart-4 bg-secondary" />
        <Tile
          icon={<Target className="size-4" />}
          label="今日正确率"
          value={acc === null ? "—" : `${acc}%`}
          sub={accAll === null ? undefined : `累计 ${accAll}%`}
          tone="text-vague bg-vague-soft"
          testid="tile-acc"
        />
      </div>

      <div className="mt-4 grid gap-4 md:mt-5 md:grid-cols-2 md:gap-5">
        <Panel data-testid="mastery">
          <PanelTitle right={<span className="text-[12px] text-muted-foreground">共 {total} 词 · 当前词书 {book}</span>}>掌握程度</PanelTitle>
          <div className="flex h-4 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-know transition-all" style={{ width: `${(m.mastered / total) * 100}%` }} />
            <div className="h-full bg-vague transition-all" style={{ width: `${(m.learning / total) * 100}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Legend color="bg-muted-foreground/30" label="未学" value={m.new} />
            <Legend color="bg-vague" label="学习中" value={m.learning} />
            <Legend color="bg-know" label="已掌握" value={m.mastered} />
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">复习间隔达到 21 天或被「斩」的词算已掌握。</p>
        </Panel>

        <Panel>
          <PanelTitle right={<span className="text-[12px] text-muted-foreground">逾期计入今天</span>}>未来 7 天复习预测</PanelTitle>
          <Bars
            height={96}
            testid="stats-forecast"
            data={fc.map((f, k) => ({ label: k === 0 ? "今天" : k === 1 ? "明天" : `${Number(f.day.slice(5, 7))}/${Number(f.day.slice(8))}`, value: f.count, strong: k === 0 }))}
          />
        </Panel>

        <Panel className="md:col-span-2" data-testid="calendar">
          <PanelTitle>
            <span className="flex items-center gap-2">
              <Flame className="size-4 text-primary" /> 打卡日历
            </span>
          </PanelTitle>
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <Big label="连续打卡" value={s} testid="cal-streak" />
            <Big label="累计打卡" value={st.checkins.length} testid="cal-total" />
            <Big label="最长连续" value={longestStreak(st.checkins)} />
          </div>
          <Heatmap logs={st.log} checkins={st.checkins} today={day} />
        </Panel>

        <QuizPanel quizzes={st.quizzes ?? []} />

        <Panel className="md:col-span-2">
          <PanelTitle right={<span className="text-[12px] text-muted-foreground">累计用时 {fmtMinutes(all.ms)}</span>}>30 天学习曲线</PanelTitle>
          <Curve logs={st.log} firstDays={firstDays} today={day} />
        </Panel>
      </div>
    </div>
  );
}

function QuizPanel({ quizzes }: { quizzes: import("@/lib/exam").QuizRecord[] }) {
  const qs = quizStats(quizzes);
  const recent = quizzes.slice(-20);
  const last = quizzes[quizzes.length - 1];
  return (
    <Panel className="md:col-span-2" data-testid="quiz-history">
      <PanelTitle
        right={
          <Link to="/quiz" className="flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-[12px] font-bold text-primary" data-testid="stats-quiz-start">
            <ClipboardCheck className="size-3.5" /> 做一套
          </Link>
        }
      >
        模拟小测成绩
      </PanelTitle>
      {qs.count === 0 ? (
        <div className="rounded-2xl bg-secondary/60 px-4 py-6 text-center text-[13px] text-muted-foreground" data-testid="quiz-history-empty">
          还没做过模拟小测。20 题 5 分钟，做完这里会出现成绩曲线。
        </div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-4 gap-2 text-center">
            <QStat label="最近" value={qs.last} testid="q-last" />
            <QStat label="平均" value={qs.avg} testid="q-avg" />
            <QStat label="最高" value={qs.best} testid="q-best" />
            <QStat label="次数" value={qs.count} unit="次" testid="q-count" />
          </div>
          <ScoreLine testid="score-line" scores={recent.map((q) => scoreOf(q.ok, q.n))} labels={recent.map((q) => q.at.slice(5).replace("-", "/"))} />
          <p className="mt-2 text-[12px] text-muted-foreground">
            最近一次 {last.ok}/{last.n} 题 · 用时 {fmtClock(last.ms)}
            {qs.count > 1 ? ` · 比上次 ${qs.trend >= 0 ? "+" : ""}${qs.trend} 分` : ""}。虚线是 60 分。
          </p>
        </>
      )}
    </Panel>
  );
}

function QStat({ label, value, unit, testid }: { label: string; value: number; unit?: string; testid?: string }) {
  return (
    <div className="rounded-2xl bg-secondary/70 py-2.5" data-testid={testid} data-value={value}>
      <div className="tnum text-[20px] font-extrabold">
        {value}
        {unit && <span className="ml-0.5 text-[12px] font-semibold text-muted-foreground">{unit}</span>}
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Tile({ icon, label, value, sub, tone, testid }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone: string; testid?: string }) {
  return (
    <div className="rounded-3xl border border-border/70 bg-card p-4" data-testid={testid}>
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <span className={`grid size-7 place-items-center rounded-lg ${tone}`}>{icon}</span>
        {label}
      </div>
      <div className="tnum mt-2.5 truncate text-[26px] font-extrabold tracking-tight">{value}</div>
      {sub && <div className="text-[12px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div>
      <div className="tnum text-[22px] font-extrabold">{value}</div>
      <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
        <i className={`inline-block size-2.5 rounded-full ${color}`} />
        {label}
      </div>
    </div>
  );
}

function Big({ label, value, testid }: { label: string; value: number; testid?: string }) {
  return (
    <div className="rounded-2xl bg-secondary/70 py-3" data-testid={testid} data-value={value}>
      <div className="tnum text-[24px] font-extrabold">
        {value}
        <span className="ml-0.5 text-[13px] font-semibold text-muted-foreground">天</span>
      </div>
      <div className="text-[12px] text-muted-foreground">{label}</div>
    </div>
  );
}
