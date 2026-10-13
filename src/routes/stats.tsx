import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClipboardCheck, Clock3, Download, Flame, GraduationCap, Repeat2, Skull, Sparkles, Target } from "lucide-react";
import { useState } from "react";
import { Bars, Curve, Heatmap, ScoreLine } from "@/components/app/charts";
import { BadgeGrid, Forecast30, HourBars, IntervalBars, MonthCalendar, RetentionLine, RevList } from "@/components/app/review-charts";
import { WordSheet } from "@/components/app/word-bits";
import { BADGES, badgeCtx, forecast30, hardest, hourBand, hourDist, intervalBuckets, monthSum, retention, revlogCsv, shiftMonth } from "@/lib/stats";
import { download } from "@/lib/format";
import { shortMeaning, type Word, type WordIndex } from "@/lib/data";
import type { AppState } from "@/lib/store";
import { daysUntil, effectiveExam, fmtClock, quizStats, scoreOf } from "@/lib/exam";
import { fmtDate } from "@/lib/format";
import { PageHeader, Panel, PanelTitle, Segmented, Spinner } from "@/components/app/shell";
import { today } from "@/lib/clock";
import { useWords } from "@/lib/data";
import { fmtMinutes } from "@/lib/format";
import { bookSize } from "@/lib/plan";
import { addDays, emptyLog, forecast, masteryCounts } from "@/lib/srs";
import { bestStreak, curStreak, restOf } from "@/lib/habit";
import { DaySheet } from "@/components/app/day-sheet";
import { useApp } from "@/lib/store";

type Tab = "overview" | "review" | "badges";
const TABS: Tab[] = ["overview", "review", "badges"];

export const Route = createFileRoute("/stats")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({ tab: TABS.includes(s.tab as Tab) ? (s.tab as Tab) : undefined }),
  component: StatsPage,
});

function StatsPage() {
  const { index } = useWords();
  const st = useApp();
  const { tab = "overview" } = Route.useSearch();
  const navigate = useNavigate();
  const [sheetWord, setSheetWord] = useState<Word | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  if (!index) return <Spinner />;
  const openWord = (w: string) => {
    const word = index.map.get(w);
    if (!word) return;
    setSheetWord(word);
    setSheetOpen(true);
  };
  const unlockedN = BADGES.filter((b) => st.badges?.[b.id]).length;
  const header = (
    <>
      <PageHeader title="统计" sub="学习数据都保存在这台设备上" />
      <Segmented<Tab>
        testid="stats-tabs"
        className="mb-4"
        value={tab}
        onChange={(t) => navigate({ to: "/stats", search: t === "overview" ? {} : { tab: t }, replace: true })}
        options={[
          { value: "overview", label: "概览" },
          { value: "review", label: "复盘" },
          { value: "badges", label: <span data-testid="tab-badges-label">成就 {unlockedN}/{BADGES.length}</span> },
        ]}
      />
    </>
  );
  if (tab === "review")
    return (
      <div data-testid="stats">
        {header}
        <ReviewTab index={index} st={st} onOpen={openWord} />
        <WordSheet word={sheetWord} open={sheetOpen} onOpenChange={setSheetOpen} />
      </div>
    );
  if (tab === "badges")
    return (
      <div data-testid="stats">
        {header}
        <BadgesTab index={index} st={st} />
      </div>
    );
  return (
    <>
      <Overview index={index} st={st} header={header} onOpen={openWord} />
      <WordSheet word={sheetWord} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}

function Overview({ index, st, header, onOpen }: { index: WordIndex; st: AppState; header: React.ReactNode; onOpen: (w: string) => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const [calView, setCalView] = useState<"heat" | "month">("heat");
  const [fcRange, setFcRange] = useState<7 | 30>(7);
  const [ym, setYm] = useState(() => today().slice(0, 7));
  const day = today();
  const log = st.log[day] ?? emptyLog();
  const all = Object.values(st.log).reduce((a, l) => ({ ok: a.ok + l.ok, a: a.a + l.a, ms: a.ms + l.ms }), { ok: 0, a: 0, ms: 0 });
  const acc = log.a ? Math.round((log.ok / log.a) * 100) : null;
  const accAll = all.a ? Math.round((all.ok / all.a) * 100) : null;
  const total = index.list.length;
  const m = masteryCounts(st.cards, total);
  const fc = forecast(st.cards, day, 7);
  const s = curStreak(st, day);
  const firstDays = Object.values(st.cards).map((c) => c.f);
  const book = bookSize(index, st.settings.book);

  const curYm = day.slice(0, 7);
  const ms = monthSum(st.log, st.checkins, ym);
  const exam = effectiveExam(day, st.settings.examDate);
  const daysLeft = daysUntil(day, exam.day);
  const started = Math.min(book, Object.keys(st.cards).filter((w) => st.settings.book === "all" || index.map.get(w)?.c).length);
  const projected = Math.min(book, started + st.settings.daily * daysLeft);
  const ret7 = retention(st.revlog ?? [], day, 7);
  const retPrev = retention(st.revlog ?? [], addDays(day, -7), 7);
  const retDelta = ret7.rate !== null && retPrev.rate !== null ? Math.round((ret7.rate - retPrev.rate) * 100) : 0;
  return (
    <div data-testid="stats">
      {header}

      {/* 11.1 · 概览第一屏回答「我离考试还有多远」，不再重复首页的今日数字 */}
      <Panel data-testid="outlook">
        <PanelTitle right={<span className="tnum text-[12px] text-muted-foreground">{fmtDate(exam.day, true)}</span>}>
          <span className="flex items-center gap-1.5">
            <GraduationCap className="size-4 text-primary" /> 距四级还有 <b className="tnum text-primary">{daysLeft}</b> 天
          </span>
        </PanelTitle>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Tile icon={<Target className="size-4" />} label="考前能学完" value={`${projected}/${book}`} sub={projected >= book ? `按每天 ${st.settings.daily} 个能学完` : `还差 ${book - projected} 个，去「我的」调每日新词`} tone="text-primary bg-brand-soft" testid="outlook-learn" />
          <Tile icon={<Sparkles className="size-4" />} label="已掌握" value={String(m.mastered)} sub={`占词书 ${Math.round((Math.min(m.mastered, book) / Math.max(1, book)) * 100)}%`} tone="text-know bg-know-soft" testid="outlook-mastered" />
          <Tile
            icon={<Repeat2 className="size-4" />}
            label="近 7 天记得住"
            value={ret7.rate === null ? "—" : `${Math.round(ret7.rate * 100)}%`}
            sub={ret7.rate === null || retPrev.rate === null ? "复习满一周后显示变化" : retDelta === 0 ? "和上周持平" : `比上周${retDelta > 0 ? "高" : "低"} ${Math.abs(retDelta)}%`}
            tone="text-vague bg-vague-soft"
            testid="outlook-retention"
          />
          <Tile icon={<Clock3 className="size-4" />} label="累计用时" value={fmtMinutes(all.ms)} sub={accAll === null ? undefined : `首答正确率 ${accAll}%`} tone="text-chart-4 bg-secondary" testid="outlook-time" />
        </div>
      </Panel>

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

        <Panel data-testid="forecast-panel">
          <PanelTitle
            right={
              <Segmented<7 | 30>
                testid="fc-range"
                className="w-[128px] p-0.5"
                value={fcRange}
                onChange={setFcRange}
                options={[
                  { value: 7, label: "7 天" },
                  { value: 30, label: "30 天" },
                ]}
              />
            }
          >
            复习预测
          </PanelTitle>
          {fcRange === 7 ? (
            <>
              <Bars
                height={96}
                testid="stats-forecast"
                data={fc.map((f, k) => ({ label: k === 0 ? "今天" : k === 1 ? "明天" : `${Number(f.day.slice(5, 7))}/${Number(f.day.slice(8))}`, value: f.count, strong: k === 0 }))}
              />
              <p className="text-[12px] text-muted-foreground">逾期计入今天。</p>
            </>
          ) : (
            <Forecast30Block cards={st.cards} day={day} />
          )}
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
            <Big label="最长连续" value={bestStreak(st)} testid="cal-best" />
          </div>
          <Segmented<"heat" | "month">
            testid="cal-view"
            className="mb-3"
            value={calView}
            onChange={setCalView}
            options={[
              { value: "heat", label: "热力图" },
              { value: "month", label: "月历" },
            ]}
          />
          <p className="-mt-1 mb-2 text-[11px] text-muted-foreground">点某一天，回看当天学了哪些词</p>
          {calView === "heat" ? (
            <Heatmap logs={st.log} checkins={st.checkins} today={day} onPick={setPick} />
          ) : (
            <>
              <MonthCalendar
                ym={ym}
                logs={st.log}
                checkins={st.checkins}
                today={day}
                onShift={(n) => setYm((v) => shiftMonth(v, n))}
                canNext={ym < curYm}
                onPick={setPick}
                rest={restOf(st)}
                patched={st.patched}
              />
              <div className="mt-3 grid grid-cols-3 gap-2 text-center" data-testid="month-sum">
                <MiniStat label="本月打卡" value={`${ms.checked} 天`} testid="month-checked" />
                <MiniStat label="学习天数" value={`${ms.days} 天`} />
                <MiniStat label="新学 / 复习" value={`${ms.n} / ${ms.r}`} testid="month-nr" />
              </div>
            </>
          )}
        </Panel>

        <QuizPanel quizzes={st.quizzes ?? []} />
        <DaySheet day={pick} index={index} st={st} onOpenChange={(v) => !v && setPick(null)} onOpenWord={onOpen} />

        <Panel className="md:col-span-2">
          <PanelTitle right={<span className="text-[12px] text-muted-foreground">累计用时 {fmtMinutes(all.ms)}</span>}>30 天学习曲线</PanelTitle>
          <Curve logs={st.log} firstDays={firstDays} today={day} />
        </Panel>
      </div>
    </div>
  );
}

function MiniStat({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="rounded-2xl bg-secondary/70 py-2" data-testid={testid} data-value={value}>
      <div className="tnum text-[15px] font-extrabold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Forecast30Block({ cards, day }: { cards: AppState["cards"]; day: string }) {
  const data = forecast30(cards, day, 30);
  const sum = data.reduce((a, d) => a + d.reviews, 0);
  const peak = data.reduce((a, d) => (d.reviews > a.reviews ? d : a), data[0]);
  const gain = data[data.length - 1].mastered - Object.values(cards).filter((c) => c.st === "mastered").length;
  return (
    <div data-testid="forecast30-block">
      <Forecast30 data={data} testid="forecast30" />
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground" data-testid="forecast30-sum" data-total={sum} data-mastered={data[data.length - 1].mastered}>
        30 天共约 {sum} 次复习{peak.reviews > 0 ? `，最忙 ${Number(peak.day.slice(5, 7))}/${Number(peak.day.slice(8))}（${peak.reviews} 词）` : ""}；按时复习到 {Number(data[29].day.slice(5, 7))}/{Number(data[29].day.slice(8))} 预计掌握 {data[data.length - 1].mastered} 词
        {gain > 0 ? `（+${gain}）` : ""}。不含之后学的新词。
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- 复盘

function ReviewTab({ index, st, onOpen }: { index: WordIndex; st: AppState; onOpen: (w: string) => void }) {
  const day = today();
  const log = st.revlog ?? [];
  const ret = retention(log, day, 30);
  const hd = hourDist(log);
  const ib = intervalBuckets(st.cards);
  const hard = hardest(st.cards, 20);
  const [more, setMore] = useState(30);
  const recent = log.slice(-more).reverse();
  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-5">
      <Panel className="md:col-span-2" data-testid="retention">
        <PanelTitle right={<span className="text-[12px] text-muted-foreground">复习首答 · 不含新词与重学</span>}>近 30 天保持率</PanelTitle>
        {ret.n === 0 ? (
          <Empty testid="retention-empty">还没有复习记录。从 v6 起每次作答都会记录，复习几天后这里会出现保持率曲线。</Empty>
        ) : (
          <>
            <div className="mb-2 flex items-end gap-3">
              <div className="tnum font-display text-[40px] font-extrabold leading-none text-know" data-testid="retention-rate" data-value={ret.rate ?? ""}>
                {ret.rate}%
              </div>
              <div className="pb-1 text-[12px] text-muted-foreground">
                30 天 {ret.n} 次复习，记得 {ret.ok} 次
                <br />
                {ret.rate !== null && ret.rate >= 85 ? "保持得不错，可以多学点新词" : ret.rate !== null && ret.rate >= 70 ? "正常水平，坚持按时复习" : "忘得偏多，建议先清复习再学新词"}
              </div>
            </div>
            <RetentionLine days={ret.days} testid="retention-line" />
            <p className="mt-1 text-[12px] text-muted-foreground">虚线是 80%。复习时答「认识」或选对算记得。</p>
          </>
        )}
      </Panel>

      <Panel data-testid="hours">
        <PanelTitle right={<span className="text-[12px] text-muted-foreground">共 {hd.total} 次作答</span>}>学习时段</PanelTitle>
        {hd.total === 0 ? (
          <Empty testid="hours-empty">作答后会按小时统计你的学习时段。</Empty>
        ) : (
          <>
            <p className="mb-3 text-[13px]" data-testid="hours-peak" data-peak={hd.peak ?? ""}>
              你最常在<b className="text-primary">{hourBand(hd.peak!)} {hd.peak} 点</b>学习（{hd.hours[hd.peak!]} 次）
            </p>
            <HourBars hours={hd.hours} peak={hd.peak} testid="hour-bars" />
          </>
        )}
      </Panel>

      <Panel data-testid="intervals">
        <PanelTitle right={<span className="text-[12px] text-muted-foreground">另有已斩 {ib.killed}</span>}>复习间隔分布</PanelTitle>
        {ib.total - ib.killed === 0 ? (
          <Empty testid="intervals-empty">学过的词会按当前复习间隔分组。</Empty>
        ) : (
          <>
            <IntervalBars buckets={ib.buckets} total={ib.total - ib.killed} testid="interval-bars" />
            <p className="mt-3 text-[12px] text-muted-foreground">间隔越长记得越牢；21 天以上算已掌握。</p>
          </>
        )}
      </Panel>

      <Panel className="md:col-span-2" data-testid="hardest">
        <PanelTitle
          right={
            hard.length > 0 && (
              <Link
                to="/study"
                search={{ mode: "rank" }}
                data-testid="hardest-study"
                className="flex items-center gap-1 rounded-full bg-forget px-3 py-1.5 text-[12px] font-bold text-white dark:text-[oklch(0.2_0.02_5)]"
              >
                <Skull className="size-3.5" /> 专项复习 {hard.length}
              </Link>
            )
          }
        >
          难词榜
        </PanelTitle>
        {hard.length === 0 ? (
          <Empty testid="hardest-empty">还没有忘过的词，继续保持。</Empty>
        ) : (
          <ol className="-mx-1" data-testid="hardest-list">
            {hard.map((w, k) => {
              const word = index.map.get(w);
              const c = st.cards[w];
              return (
                <li key={w}>
                  <button type="button" onClick={() => onOpen(w)} data-testid="hardest-row" data-word={w} data-lapses={c.l} className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left hover:bg-secondary/70">
                    <span className={`tnum grid size-6 shrink-0 place-items-center rounded-lg text-[12px] font-extrabold ${k < 3 ? "bg-forget text-white dark:text-[oklch(0.2_0.02_5)]" : "bg-secondary text-muted-foreground"}`}>{k + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold">{w}</span>
                      {word && <span className="block truncate text-[12px] text-muted-foreground">{shortMeaning(word, 1)}</span>}
                    </span>
                    <span className="tnum shrink-0 rounded-full bg-forget-soft px-2 py-0.5 text-[12px] font-bold text-forget">忘 {c.l} 次</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      <Panel className="md:col-span-2" data-testid="revlog">
        <PanelTitle
          right={
            log.length > 0 && (
              <button
                type="button"
                data-testid="revlog-export"
                onClick={() => download(`四级单词-复习日志-${day}.csv`, revlogCsv(log), "text/csv;charset=utf-8")}
                className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-[12px] font-bold"
              >
                <Download className="size-3.5" /> 导出 CSV
              </button>
            )
          }
        >
          复习日志 <span className="ml-1 text-[12px] font-medium text-muted-foreground" data-testid="revlog-count" data-value={log.length}>{log.length} 条</span>
        </PanelTitle>
        {log.length === 0 ? (
          <Empty testid="revlog-empty">每次作答（含新学、复习、重学、斩）都会记一条，只存在本机，随备份导出。</Empty>
        ) : (
          <>
            <RevList entries={recent} onOpen={onOpen} />
            {log.length > more && (
              <button type="button" data-testid="revlog-more" onClick={() => setMore((m) => m + 50)} className="mt-2 h-10 w-full rounded-2xl bg-secondary text-[13px] font-semibold">
                再看 {Math.min(50, log.length - more)} 条
              </button>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

function BadgesTab({ index, st }: { index: WordIndex; st: AppState }) {
  const ctx = badgeCtx(st, index.list.length);
  const n = BADGES.filter((b) => st.badges?.[b.id]).length;
  return (
    <Panel data-testid="badges-panel">
      <PanelTitle right={<span className="text-[12px] text-muted-foreground">本地解锁，不联网</span>}>
        成就徽章 <span className="tnum ml-1 text-primary" data-testid="badges-count" data-value={n}>{n}/{BADGES.length}</span>
      </PanelTitle>
      <BadgeGrid ctx={ctx} unlocked={st.badges ?? {}} />
    </Panel>
  );
}

function Empty({ children, testid }: { children: React.ReactNode; testid?: string }) {
  return (
    <div className="rounded-2xl bg-secondary/60 px-4 py-6 text-center text-[13px] leading-relaxed text-muted-foreground" data-testid={testid}>
      {children}
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
