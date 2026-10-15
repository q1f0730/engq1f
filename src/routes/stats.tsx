import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClipboardCheck, Clock3, Download, Flame, GraduationCap, Repeat2, Skull, Sparkles, Target } from "@/components/app/icons";
import { useState } from "react";
import { Bars, Curve, Heatmap, ScoreLine } from "@/components/app/charts";
import { BadgeGrid, Forecast30, HourBars, IntervalBars, MonthCalendar, RetentionLine, RevList } from "@/components/app/review-charts";
import { WordSheet } from "@/components/app/word-bits";
import { BADGES, badgeCtx, forecast30, hardest, hourBand, hourDist, intervalBuckets, monthSum, retention, revlogCsv, shiftMonth } from "@/lib/stats";
import { download } from "@/lib/format";
import { shortMeaning, type Word, type WordIndex } from "@/lib/data";
import type { AppState } from "@/lib/store";
import { daysUntil, effectiveExam, examForecast, fmtClock, quizStats, scoreOf } from "@/lib/exam";
import { fmtDate } from "@/lib/format";
import { PageHeader, Segmented, Spinner } from "@/components/app/shell";
import { Sec, TabLine, actClass } from "@/components/app/kit";
import { cn } from "@/lib/utils";
import { today } from "@/lib/clock";
import { useWords } from "@/lib/data";
import { useFitLine } from "@/lib/fit";
import { fmtMinutes, fmtMinutesShort, fmtPct, fmtPctDelta } from "@/lib/format";
import { bookSize, summarize } from "@/lib/plan";
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
      <TabLine<Tab>
        testid="stats-tabs"
        className="mb-6"
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
  // 11.6 · 和首页考试卡同一个算法（exam.examForecast）：扣掉最后只复习的几天，考前模式只复习
  const sumT = summarize(index, st, day);
  const fcx = examForecast(day, exam.day, sumT.newLeft, st.settings.daily, sumT.examMode, sumT.remainingGoal);
  const projected = Math.min(book, book - sumT.newLeft + fcx.reach);
  const ret7 = retention(st.revlog ?? [], day, 7);
  const retPrev = retention(st.revlog ?? [], addDays(day, -7), 7);
  // 11.2 · retention().rate 已经是百分数；这里一律用 ok/n 小数交给 fmtPct，不再自己乘 100
  const ret7f = ret7.n ? ret7.ok / ret7.n : null;
  const retPrevF = retPrev.n ? retPrev.ok / retPrev.n : null;
  return (
    <div data-testid="stats">
      {header}

      {/* 11.1 · 概览第一屏回答「我离考试还有多远」。12.0 · 一个衬线大数字做主角，四个读数排成两行两列，细线分格 */}
      <section data-testid="outlook" className="pt-2">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[0.9375rem] font-semibold">距四级还有</span>
            <b className="tnum hl font-serif text-[3.25rem] font-normal leading-[0.9] tracking-[-0.03em] text-ink">{daysLeft}</b>
            <span className="text-[0.9375rem] font-semibold">天</span>
          </div>
          <span className="tnum pb-1 text-[0.75rem] text-ink-3">{fmtDate(exam.day, true)}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 border-t border-ink md:grid-cols-4 [&>*:nth-child(odd)]:border-r [&>*:nth-child(odd)]:border-rule md:[&>*]:border-r md:[&>*:last-child]:border-r-0">
          <Tile
            label="考前能学完"
            value={`${projected}/${book}`}
            small={String(projected).length + String(book).length >= 7}
            sub={
              fcx.examMode ? (
                nb("考前模式：", "只复习")
              ) : projected >= book ? (
                nb(`按每天 ${st.settings.daily} 个`, "能学完")
              ) : (
                // 11.7 · 窄屏按「还能学 N 个 / 剩 M 个来不及」两段换行，不会有一两个字单独成行（r7 R7-7）
                <>
                  <span className="whitespace-nowrap">还能学 {fcx.reach} 个</span>，<span className="whitespace-nowrap">剩 {fcx.left} 个来不及</span>
                </>
              )
            }
            tone="mark"
            testid="outlook-learn"
          />
          <Tile label="已掌握" value={String(m.mastered)} sub={`占词书 ${Math.round((Math.min(m.mastered, book) / Math.max(1, book)) * 100)}%`} tone="know" testid="outlook-mastered" />
          <Tile label="近 7 天记得住" value={fmtPct(ret7f)} sub={keepTail(fmtPctDelta(ret7f, retPrevF)) ?? nb("复习满一周后", "显示变化")} tone="vague" testid="outlook-retention" />
          <Tile label="累计用时" value={fmtMinutesShort(all.ms)} sub={accAll === null ? undefined : `首答正确率 ${accAll}%`} tone="ink" testid="outlook-time" />
        </div>
      </section>

      <div className="mt-12 grid gap-12 md:grid-cols-2 md:gap-x-10 xl:grid-flow-dense xl:grid-cols-3 xl:gap-x-12">
        <Sec title="掌握程度" aside={`共 ${total} 词 · 当前词书 ${book}`} testid="mastery">
          {/* 一条三段的尺子：已掌握（墨）· 学习中（荧光笔）· 未学（纸） */}
          <div className="flex h-2.5 gap-px overflow-hidden bg-paper-2">
            <div className="h-full bg-ink transition-all" style={{ width: `${(m.mastered / total) * 100}%` }} />
            <div className="h-full bg-mark transition-all" style={{ width: `${(m.learning / total) * 100}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-3 divide-x divide-rule">
            <Legend color="bg-paper-2 ring-1 ring-inset ring-rule-strong" label="未学" value={m.new} />
            <Legend color="bg-mark" label="学习中" value={m.learning} />
            <Legend color="bg-ink" label="已掌握" value={m.mastered} />
          </div>
          <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-3">复习间隔达到 21 天或被「斩」的词算已掌握。</p>
        </Sec>

        <Sec
          title="复习预测"
          testid="forecast-panel"
          aside={
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
          {fcRange === 7 ? (
            <>
              <Bars
                height={96}
                testid="stats-forecast"
                data={fc.map((f, k) => ({ label: k === 0 ? "今天" : k === 1 ? "明天" : `${Number(f.day.slice(5, 7))}/${Number(f.day.slice(8))}`, value: f.count, strong: k === 0 }))}
              />
              <p className="text-[0.75rem] text-ink-3">逾期计入今天。</p>
            </>
          ) : (
            <Forecast30Block cards={st.cards} day={day} />
          )}
        </Sec>

        <Sec title="打卡日历" className="md:col-span-2" testid="calendar">
          <dl className="mb-5 grid grid-cols-3 divide-x divide-rule border-y border-rule py-3">
            <Big label="连续打卡" value={s} testid="cal-streak" />
            <Big label="累计打卡" value={st.checkins.length} testid="cal-total" />
            <Big label="最长连续" value={bestStreak(st)} testid="cal-best" />
          </dl>
          <div className="mb-3 flex items-center justify-between gap-3">
            <Segmented<"heat" | "month">
              testid="cal-view"
              className="w-40"
              value={calView}
              onChange={setCalView}
              options={[
                { value: "heat", label: "热力图" },
                { value: "month", label: "月历" },
              ]}
            />
            <p className="text-right text-[0.6875rem] leading-snug text-ink-3">点某一天，回看当天学了哪些词</p>
          </div>
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
              <div className="mt-4 grid grid-cols-3 divide-x divide-rule border-t border-rule pt-3" data-testid="month-sum">
                <MiniStat label="本月打卡" value={`${ms.checked} 天`} testid="month-checked" />
                <MiniStat label="学习天数" value={`${ms.days} 天`} />
                <MiniStat label="新学 / 复习" value={`${ms.n} / ${ms.r}`} testid="month-nr" />
              </div>
            </>
          )}
        </Sec>

        <QuizPanel quizzes={st.quizzes ?? []} />
        <DaySheet day={pick} index={index} st={st} onOpenChange={(v) => !v && setPick(null)} onOpenWord={onOpen} />

        <Sec title="30 天学习曲线" className="md:col-span-2 xl:col-span-1" aside={`累计用时 ${fmtMinutes(all.ms)}`}>
          <Curve logs={st.log} firstDays={firstDays} today={day} />
        </Sec>
      </div>
    </div>
  );
}

function MiniStat({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="min-w-0 px-3 first:pl-0" data-testid={testid} data-value={value}>
      <div className="tnum truncate font-serif text-[1.25rem] leading-none">{value}</div>
      <div className="mt-1.5 text-[0.6875rem] text-ink-3">{label}</div>
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
      <p className="mt-2 text-xs leading-relaxed text-ink-3" data-testid="forecast30-sum" data-total={sum} data-mastered={data[data.length - 1].mastered}>
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
    <div className="grid gap-12 pt-2 md:grid-cols-2 md:gap-x-10 xl:grid-flow-dense xl:grid-cols-3 xl:gap-x-12">
      <Sec title="近 30 天保持率" aside="复习首答 · 不含新词与重学" className="md:col-span-2" testid="retention">
        {ret.n === 0 ? (
          <Empty testid="retention-empty">还没有复习记录。从 v6 起每次作答都会记录，复习几天后这里会出现保持率曲线。</Empty>
        ) : (
          <>
            <div className="mb-3 flex items-end gap-4">
              <div className="tnum font-serif text-[3.5rem] leading-[0.9] tracking-[-0.03em]" data-testid="retention-rate" data-value={ret.rate ?? ""}>
                <span className="hl">{ret.rate}%</span>
              </div>
              <div className="pb-1 text-[0.75rem] leading-relaxed text-ink-3">
                30 天 {ret.n} 次复习，记得 {ret.ok} 次
                <br />
                <span className="text-ink-2">
                  {ret.rate !== null && ret.rate >= 85 ? "保持得不错，可以多学点新词" : ret.rate !== null && ret.rate >= 70 ? "正常水平，坚持按时复习" : "忘得偏多，建议先清复习再学新词"}
                </span>
              </div>
            </div>
            <RetentionLine days={ret.days} testid="retention-line" />
            <p className="mt-1 text-[0.75rem] text-ink-3">虚线是 80%。复习时答「认识」或选对算记得。</p>
          </>
        )}
      </Sec>

      <Sec title="学习时段" aside={`共 ${hd.total} 次作答`} testid="hours">
        {hd.total === 0 ? (
          <Empty testid="hours-empty">作答后会按小时统计你的学习时段。</Empty>
        ) : (
          <>
            <p className="mb-3 text-[0.8125rem] text-ink-2" data-testid="hours-peak" data-peak={hd.peak ?? ""}>
              你最常在
              <b className="mx-0.5 font-semibold text-ink">
                {hourBand(hd.peak!)} {hd.peak} 点
              </b>
              学习（{hd.hours[hd.peak!]} 次）
            </p>
            <HourBars hours={hd.hours} peak={hd.peak} testid="hour-bars" />
          </>
        )}
      </Sec>

      <Sec title="复习间隔分布" aside={`另有已斩 ${ib.killed}`} testid="intervals">
        {ib.total - ib.killed === 0 ? (
          <Empty testid="intervals-empty">学过的词会按当前复习间隔分组。</Empty>
        ) : (
          <>
            <IntervalBars buckets={ib.buckets} total={ib.total - ib.killed} testid="interval-bars" />
            <p className="mt-3 text-[0.75rem] text-ink-3">间隔越长记得越牢；21 天以上算已掌握。</p>
          </>
        )}
      </Sec>

      <Sec
        title="难词榜"
        className="md:col-span-2"
        testid="hardest"
        aside={
          hard.length > 0 && (
            <Link to="/study" search={{ mode: "rank" }} data-testid="hardest-study" className={actClass("primary") + " h-9 px-3 text-[0.8125rem]"}>
              专项复习 {hard.length}
            </Link>
          )
        }
      >
        {hard.length === 0 ? (
          <Empty testid="hardest-empty">还没有忘过的词，继续保持。</Empty>
        ) : (
          /* 一张排行榜：名次（衬线）· 词头 · 释义 · 忘了几次；前三名的名次划荧光笔 */
          <ol className="border-t border-rule md:columns-2 md:gap-x-10" data-testid="hardest-list">
            {hard.map((w, k) => {
              const word = index.map.get(w);
              const c = st.cards[w];
              return (
                <li key={w} className="break-inside-avoid border-b border-rule">
                  <button
                    type="button"
                    onClick={() => onOpen(w)}
                    data-testid="hardest-row"
                    data-word={w}
                    data-lapses={c.l}
                    className="press grid min-h-14 w-full grid-cols-[1.75rem_minmax(0,1fr)_auto] items-baseline gap-x-2 py-2.5 text-left hover:bg-paper-2/60"
                  >
                    <span className={cn("tnum font-serif text-[1.25rem] leading-none", k < 3 ? "text-ink" : "text-ink-3")}>
                      <span className={cn(k < 3 && "hl")}>{k + 1}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="word-head block truncate text-[1.375rem] leading-tight">{w}</span>
                      {word && <span className="block truncate text-[0.75rem] text-ink-3">{shortMeaning(word, 1)}</span>}
                    </span>
                    <span className="tnum shrink-0 text-[0.75rem] font-medium text-forget">忘 {c.l} 次</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Sec>

      <Sec
        title={
          <>
            复习日志{" "}
            <span className="ml-1 text-[0.75rem] font-normal text-ink-3" data-testid="revlog-count" data-value={log.length}>
              {log.length} 条
            </span>
          </>
        }
        className="md:col-span-2 xl:col-span-3"
        testid="revlog"
        aside={
          log.length > 0 && (
            <button
              type="button"
              data-testid="revlog-export"
              onClick={() => download(`四级单词-复习日志-${day}.csv`, revlogCsv(log), "text/csv;charset=utf-8")}
              className={actClass("quiet") + " h-9 text-[0.8125rem]"}
            >
              <Download className="size-3.5" /> 导出 CSV
            </button>
          )
        }
      >
        {log.length === 0 ? (
          <Empty testid="revlog-empty">每次作答（含新学、复习、重学、斩）都会记一条，只存在本机，随备份导出。</Empty>
        ) : (
          <>
            <RevList entries={recent} onOpen={onOpen} />
            {log.length > more && (
              <button type="button" data-testid="revlog-more" onClick={() => setMore((m) => m + 50)} className={actClass("secondary") + " mt-3 h-10 w-full text-[0.8125rem]"}>
                再看 {Math.min(50, log.length - more)} 条
              </button>
            )}
          </>
        )}
      </Sec>
    </div>
  );
}

function BadgesTab({ index, st }: { index: WordIndex; st: AppState }) {
  const ctx = badgeCtx(st, index.list.length);
  const n = BADGES.filter((b) => st.badges?.[b.id]).length;
  return (
    <Sec
      testid="badges-panel"
      className="pt-2"
      title={
        <>
          成就徽章{" "}
          <span className="tnum ml-1 font-serif text-[1.25rem] font-normal" data-testid="badges-count" data-value={n}>
            {n}/{BADGES.length}
          </span>
        </>
      }
      aside="本地解锁，不联网"
    >
      <BadgeGrid ctx={ctx} unlocked={st.badges ?? {}} />
    </Sec>
  );
}

function Empty({ children, testid }: { children: React.ReactNode; testid?: string }) {
  return (
    <div className="border-l-2 border-rule-strong py-1 pl-3 text-left text-[0.8125rem] leading-relaxed text-ink-3" data-testid={testid}>
      {children}
    </div>
  );
}

function QuizPanel({ quizzes }: { quizzes: import("@/lib/exam").QuizRecord[] }) {
  const qs = quizStats(quizzes);
  const recent = quizzes.slice(-20);
  const last = quizzes[quizzes.length - 1];
  return (
    <Sec
      title="模拟小测成绩"
      className="md:col-span-2 xl:col-span-1"
      testid="quiz-history"
      aside={
        <Link to="/quiz" className={actClass("secondary") + " h-9 px-3 text-[0.8125rem]"} data-testid="stats-quiz-start">
          做一套
        </Link>
      }
    >
      {qs.count === 0 ? (
        <div className="border-l-2 border-rule-strong py-1 pl-3 text-left text-[0.8125rem] text-ink-3" data-testid="quiz-history-empty">
          还没做过模拟小测。20 题 5 分钟，做完这里会出现成绩曲线。
        </div>
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-4 divide-x divide-rule border-y border-rule py-3">
            <QStat label="最近" value={qs.last} testid="q-last" />
            <QStat label="平均" value={qs.avg} testid="q-avg" />
            <QStat label="最高" value={qs.best} testid="q-best" />
            <QStat label="次数" value={qs.count} unit="次" testid="q-count" />
          </dl>
          <ScoreLine testid="score-line" scores={recent.map((q) => scoreOf(q.ok, q.n))} labels={recent.map((q) => q.at.slice(5).replace("-", "/"))} />
          <p className="mt-2 text-[0.75rem] text-ink-3">
            最近一次 {last.ok}/{last.n} 题 · 用时 {fmtClock(last.ms)}
            {qs.count > 1 ? ` · 比上次 ${qs.trend >= 0 ? "+" : ""}${qs.trend} 分` : ""}。虚线是 60 分。
          </p>
        </>
      )}
    </Sec>
  );
}

function QStat({ label, value, unit, testid }: { label: string; value: number; unit?: string; testid?: string }) {
  return (
    <div className="min-w-0 px-3 first:pl-0" data-testid={testid} data-value={value}>
      <dd className="tnum font-serif text-[1.75rem] leading-none">
        {value}
        {unit && <span className="ml-0.5 font-sans text-[0.75rem] text-ink-3">{unit}</span>}
      </dd>
      <dt className="mt-1.5 text-[0.6875rem] text-ink-3">{label}</dt>
    </div>
  );
}

/** 11.7 · 「比上周低 6 个百分点」：「6 个百分点」不拆开（360 宽下不再剩一个「点」单独一行，r7 R7-7） */
function keepTail(s: string | null): React.ReactNode {
  if (s === null) return null;
  const m = /^(.*\S)\s(\d+ 个百分点)$/.exec(s);
  if (!m) return s;
  return (
    <>
      {m[1]} <span className="whitespace-nowrap">{m[2]}</span>
    </>
  );
}

/** 11.7 · 几段各自不折行：窄屏只在段与段之间换行（没有一两个字单独成行） */
function nb(...parts: string[]): React.ReactNode {
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className="whitespace-nowrap">
          {p}
        </span>
      ))}
    </>
  );
}

function Tile({ label, value, sub, tone, testid, small }: { label: string; value: string; sub?: React.ReactNode; tone: "mark" | "know" | "vague" | "ink"; testid?: string; small?: boolean }) {
  // 11.8 · 主数字只占一行：≥7 位先用小字号，再按磁贴实际宽度缩（360 宽新用户「900/4544」不再断成两行，r8 R8-3）
  const vref = useFitLine<HTMLDivElement>(value, 15);
  const dot = { mark: "bg-mark", know: "bg-know", vague: "bg-vague", ink: "bg-ink" }[tone];
  return (
    // 12.0 · 读数：一格里一个小色块 + 标签、衬线大数字、一行说明。格与格之间是细线
    <div className="min-w-0 border-b border-rule px-3 pb-4 pt-3.5 [&:nth-child(odd)]:pl-0 md:border-b-0 md:pl-3 md:first:pl-0" data-testid={testid} data-tone={tone}>
      {/* 标签不折行（360 宽下「近 7 天记得住」不再把「住」挤到第二行） */}
      <div className="flex items-center gap-1.5 whitespace-nowrap text-[0.8125rem] text-ink-3" data-part="label">
        <span className={cn("size-2 shrink-0 rounded-[2px]", dot)} aria-hidden />
        {label}
      </div>
      <div ref={vref} className={cn("tnum mt-2.5 whitespace-nowrap font-serif leading-none tracking-[-0.02em]", small ? "text-[2rem]" : "text-[2.5rem]")} data-value={value}>
        <span>{value}</span>
      </div>
      {sub && (
        <div className="mt-2 text-[0.75rem] leading-snug text-ink-3" data-part="sub">
          {sub}
        </div>
      )}
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="min-w-0 px-3 first:pl-0">
      <div className="flex items-center gap-1.5 text-[0.75rem] text-ink-3">
        <i className={cn("inline-block size-2 rounded-[2px]", color)} aria-hidden />
        {label}
      </div>
      <div className="tnum mt-1.5 font-serif text-[2rem] leading-none">{value}</div>
    </div>
  );
}

function Big({ label, value, testid }: { label: string; value: number; testid?: string }) {
  return (
    <div className="min-w-0 px-3 first:pl-0" data-testid={testid} data-value={value}>
      <dt className="text-[0.75rem] text-ink-3">{label}</dt>
      <dd className="tnum mt-1.5 font-serif text-[2.25rem] leading-none">
        {value}
        <span className="ml-1 font-sans text-[0.8125rem] text-ink-3">天</span>
      </dd>
    </div>
  );
}
