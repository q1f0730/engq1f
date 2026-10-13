import { Link, createFileRoute } from "@tanstack/react-router";
import {
  BookMarked,
  CalendarCheck,
  Check,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  Target,
  FastForward,
  Flame,
  HardDriveDownload,
  Headphones,
  Play,
  Repeat2,
  Share2,
  Skull,
  Star,
  Swords,
  TriangleAlert,
  Volume2,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Bars, Ring, WeekStrip } from "@/components/app/charts";
import { Panel, PanelTitle, Spinner } from "@/components/app/shell";
import { ShareSheet } from "@/components/app/share-sheet";
import { Phonetic, WordSheet } from "@/components/app/word-bits";
import { speak } from "@/lib/audio";
import { now, today } from "@/lib/clock";
import { shortMeaning, useWords } from "@/lib/data";
import { notebookWords, summarize, wordOfDay } from "@/lib/plan";
import { addDays, forecast, streak } from "@/lib/srs";
import { checkIn, setSettings, snoozeBackup, useApp } from "@/lib/store";
import { coreUnmastered, effectiveExam, quizDoneOn, sprintPlan, upcomingExams } from "@/lib/exam";
import { backupDue } from "@/lib/persist";
import { useShareInfo } from "@/lib/use-share";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/")({ component: Today });

const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function greeting() {
  const h = new Date(now()).getHours();
  if (h < 5) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 13) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function Today() {
  const { index, error } = useWords();
  const st = useApp();
  const [share, setShare] = useState(false);
  const [sheet, setSheet] = useState(false);
  const info = useShareInfo(index);
  if (error) return <div className="p-8 text-center text-sm text-muted-foreground">{error}</div>;
  if (!index) return <Spinner />;

  const day = today();
  const sum = summarize(index, st, day);
  const s = streak(st.checkins, day);
  const fc = forecast(st.cards, day, 7);
  const wod = wordOfDay(index, day);
  const pct = sum.goal ? Math.min(1, sum.learned / sum.goal) : 0;
  const learnLabel = sum.newLeft === 0 ? "词书已学完" : sum.learned === 0 ? "开始学习" : sum.remainingGoal > 0 ? "学下一组" : "再学一组";
  const nb = {
    star: notebookWords(st, "star").length,
    wrong: notebookWords(st, "wrong").length,
    mastered: notebookWords(st, "mastered").length,
    hard: notebookWords(st, "hard").length,
  };
  const backupDays = backupDue(st, day);
  const exam = effectiveExam(day, st.settings.examDate);
  const official = upcomingExams(day, 3).find((e) => e.day === exam.day)?.official ?? false;
  const plan = sprintPlan(day, exam.day, sum.newLeft);
  const core = coreUnmastered(index, st);
  const coreLeft = core.unlearned.length + core.learning.length;
  const quizDone = quizDoneOn(st, day);
  const dateLine = `${fmtDate(day)} ${WEEK[new Date(day + "T12:00:00").getDay()]}`;

  const doCheckIn = () => {
    checkIn(day);
    toast.success(`打卡成功！连续 ${streak([...st.checkins, day], day)} 天`);
    setShare(true);
  };

  return (
    <div data-testid="today">
      <div className="flex items-end justify-between gap-3 pb-4 pt-6 md:pt-8">
        <div>
          <div className="text-[13px] font-medium text-muted-foreground" data-testid="today-date">
            {dateLine}
          </div>
          <h1 className="font-display text-[28px] font-extrabold leading-tight tracking-tight md:text-[32px]">{greeting()}</h1>
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-bold",
            s > 0 ? "bg-brand-soft text-primary" : "bg-secondary text-muted-foreground",
          )}
          data-testid="streak"
          data-streak={s}
        >
          <Flame className={cn("size-4", s > 0 && "fill-current")} />
          <span className="tnum">{s}</span>天
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr] md:gap-5">
        <div className="min-w-0 space-y-4 md:space-y-5">
          {/* 主卡片 */}
          <section className="hero-gradient relative overflow-hidden rounded-[32px] p-6 text-white shadow-[0_24px_60px_-28px_rgba(200,60,30,0.65)]" data-testid="hero">
            <div className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-white/[0.07]" />
            <div className="relative flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-white/80">今日新词</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="tnum font-display text-[52px] font-extrabold leading-none tracking-tight" data-testid="learned">
                    {sum.learned}
                  </span>
                  <span className="tnum text-[20px] font-bold text-white/75">/ {sum.goal}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-white/85">
                  <span data-testid="due-count">待复习 {sum.due}</span>
                  <span>已复习 {sum.reviewed}</span>
                  {sum.deferred > 0 && (
                    <span className="rounded-full bg-white/18 px-2 text-[12px] font-semibold" data-testid="deferred">
                      已达上限 · 顺延 {sum.deferred}
                    </span>
                  )}
                </div>
              </div>
              <Ring value={pct} size={104} stroke={11} className="shrink-0 text-white" track="rgba(255,255,255,0.22)">
                <span className="text-[13px] font-bold">{Math.round(pct * 100)}%</span>
              </Ring>
            </div>
            <div className="relative mt-6 grid grid-cols-[1.4fr_1fr] gap-2.5">
              <Link
                to="/study"
                search={{ mode: "new" }}
                disabled={sum.newLeft === 0}
                data-testid="start-learn"
                className={cn(
                  "flex h-13 items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-[16px] font-bold text-[oklch(0.5_0.19_30)] shadow-lg transition active:scale-[0.98]",
                  sum.newLeft === 0 && "pointer-events-none opacity-60",
                )}
              >
                <Play className="size-4 fill-current" />
                {learnLabel}
              </Link>
              <Link
                to="/study"
                search={{ mode: "review" }}
                data-testid="start-review"
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-2xl bg-white/16 py-3.5 text-[15px] font-bold text-white ring-1 ring-white/25 backdrop-blur transition active:scale-[0.98]",
                  sum.due === 0 && "opacity-70",
                )}
              >
                <Repeat2 className="size-4" />
                复习 {sum.due}
              </Link>
            </div>
          </section>

          <ExamCard
            day={day}
            exam={exam.day}
            official={official}
            custom={exam.custom}
            plan={plan}
            daily={st.settings.daily}
            coreLeft={coreLeft}
          />

          {!quizDone && (
            <Notice
              testid="quiz-reminder"
              icon={<ClipboardCheck className="size-5" />}
              tone="bg-brand-soft text-primary"
              title="今日小测"
              sub="20 题混合题型 · 限时 5 分钟"
              action={
                <Link to="/quiz" data-testid="quiz-entry" className="shrink-0 rounded-full bg-primary px-3.5 py-2 text-[13px] font-bold text-primary-foreground">
                  开始
                </Link>
              }
            />
          )}

          {sum.dueList.length === 0 && sum.aheadCount > 0 && (
            <Notice
              testid="ahead"
              icon={<FastForward className="size-5" />}
              tone="bg-know-soft text-know"
              title="今日复习已清零"
              sub={`还有余力？提前复习明天到期的 ${sum.aheadCount} 词`}
              action={
                <Link to="/study" search={{ mode: "ahead" }} data-testid="start-ahead" className="shrink-0 rounded-full bg-know px-3.5 py-2 text-[13px] font-bold text-white dark:text-[oklch(0.2_0.02_170)]">
                  提前复习
                </Link>
              }
            />
          )}
          {nb.hard > 0 && (
            <Link to="/words" search={{ tab: "hard" }} className="block" data-testid="hard-entry">
              <Notice
                icon={<Skull className="size-5" />}
                tone="bg-forget-soft text-forget"
                title={`${nb.hard} 个顽固词`}
                sub="忘了 3 次以上，单独拎出来攻克"
                action={<ChevronRight className="size-5 shrink-0 text-muted-foreground" />}
              />
            </Link>
          )}
          {backupDays !== null && (
            <Notice
              testid="backup-nag"
              icon={<HardDriveDownload className="size-5" />}
              tone="bg-vague-soft text-vague"
              title={st.lastBackup ? `${backupDays} 天没备份了` : "还没备份过学习记录"}
              sub="记录只在本机，清理浏览器就没了"
              action={
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    data-testid="backup-snooze"
                    onClick={() => snoozeBackup(addDays(day, 3))}
                    className="rounded-full px-2.5 py-2 text-[13px] font-semibold text-muted-foreground"
                  >
                    稍后
                  </button>
                  <Link to="/me" className="rounded-full bg-foreground px-3.5 py-2 text-[13px] font-bold text-background">
                    去备份
                  </Link>
                </div>
              }
            />
          )}

          {/* 打卡 */}
          <Panel data-testid="checkin-panel">
            <PanelTitle
              right={
                <Link to="/stats" className="flex items-center text-[13px] text-muted-foreground hover:text-foreground">
                  打卡日历 <ChevronRight className="size-4" />
                </Link>
              }
            >
              每日打卡
            </PanelTitle>
            <WeekStrip checkins={st.checkins} logs={st.log} today={day} />
            <div className="mt-4">
              {sum.checked ? (
                <div className="flex items-center gap-3 rounded-2xl bg-brand-soft p-3.5" data-testid="checked-in">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-5" strokeWidth={3} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold">今日已打卡</div>
                    <div className="text-[13px] text-muted-foreground">连续 {s} 天 · 累计 {st.checkins.length} 天</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShare(true)}
                    data-testid="open-share"
                    className="flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 text-[13px] font-semibold shadow-sm"
                  >
                    <Share2 className="size-4" /> 分享图
                  </button>
                </div>
              ) : sum.ready ? (
                <button
                  type="button"
                  onClick={doCheckIn}
                  data-testid="checkin"
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[16px] font-bold text-primary-foreground shadow-lg shadow-primary/25 transition active:scale-[0.98]"
                >
                  <CalendarCheck className="size-5" /> 今日任务完成，立即打卡
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 text-[13px]" data-testid="checkin-todo">
                  <Todo done={sum.learned >= sum.goal || sum.newLeft === 0} label={`新词 ${sum.learned}/${sum.goal}`} />
                  <Todo done={sum.due === 0} label={sum.due === 0 ? "复习已清零" : `还需复习 ${sum.due}`} />
                </div>
              )}
            </div>
          </Panel>

          <div className="grid grid-cols-3 gap-2.5">
            <NbLink tab="star" icon={<Star className="size-4" />} label="生词本" n={nb.star} tone="text-vague bg-vague-soft" />
            <NbLink tab="wrong" icon={<TriangleAlert className="size-4" />} label="错词本" n={nb.wrong} tone="text-forget bg-forget-soft" />
            <NbLink tab="mastered" icon={<Swords className="size-4" />} label="熟词" n={nb.mastered} tone="text-know bg-know-soft" />
          </div>

          {/* 碎片时间 */}
          <div className="grid grid-cols-2 gap-2.5" data-testid="snack">
            <Link
              to="/tape"
              data-testid="tape-entry"
              className="flex items-center gap-3 rounded-3xl border border-border/70 bg-card p-3.5 transition hover:border-primary/40 active:scale-[0.99]"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary">
                <Headphones className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold leading-tight">磁带模式</span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">通勤免手听</span>
              </span>
            </Link>
            <Link
              to="/study"
              search={{ mode: "speed" }}
              data-testid="speed-entry"
              className={cn(
                "flex items-center gap-3 rounded-3xl border border-border/70 bg-card p-3.5 transition hover:border-primary/40 active:scale-[0.99]",
                sum.due === 0 && "opacity-70",
              )}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-know-soft text-know">
                <Zap className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold leading-tight">速刷</span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground" data-testid="speed-sub">
                  {sum.due > 0 ? `左右滑清 ${sum.due} 词` : "暂无到期复习"}
                </span>
              </span>
            </Link>
          </div>
        </div>

        <div className="min-w-0 space-y-4 md:space-y-5">
          {/* 每日一词 */}
          <Panel className="cursor-pointer transition hover:border-primary/40" onClick={() => setSheet(true)} data-testid="wod">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[12px] font-bold text-primary">今日一词</span>
              <button
                type="button"
                aria-label="播放发音"
                onClick={(e) => {
                  e.stopPropagation();
                  speak(wod.w, st.settings.accent);
                }}
                className="grid size-9 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-primary"
              >
                <Volume2 className="size-[18px]" />
              </button>
            </div>
            <div className="mt-3 font-display text-[34px] font-extrabold leading-tight tracking-tight">{wod.w}</div>
            <Phonetic word={wod} accent={st.settings.accent} className="text-[14px] text-muted-foreground" />
            <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-foreground/85">{shortMeaning(wod, 2)}</p>
            {wod.ph?.[0] && (
              <p className="mt-2 truncate text-[13px] text-muted-foreground">
                <span className="font-semibold text-foreground/80">{wod.ph[0][0]}</span> {wod.ph[0][1]}
              </p>
            )}
          </Panel>

          <Panel>
            <PanelTitle right={<span className="text-[12px] text-muted-foreground">含今天到期</span>}>未来 7 天复习</PanelTitle>
            <Bars
              height={84}
              testid="forecast"
              data={fc.map((f, k) => ({ label: k === 0 ? "今天" : k === 1 ? "明天" : `${Number(f.day.slice(8))}日`, value: f.count, strong: k === 0 }))}
            />
          </Panel>

          <Panel data-testid="plan-card">
            <PanelTitle
              right={
                <Link to="/me" className="flex items-center text-[13px] text-muted-foreground hover:text-foreground">
                  调整 <ChevronRight className="size-4" />
                </Link>
              }
            >
              <span className="flex items-center gap-2">
                <BookMarked className="size-4 text-primary" />
                {st.settings.book === "all" ? "四级全部词汇" : "四级核心词汇"}
              </span>
            </PanelTitle>
            <div className="flex items-baseline justify-between text-[13px] text-muted-foreground">
              <span>
                已学 <b className="tnum text-[15px] text-foreground">{sum.started}</b> / {sum.bookTotal}
              </span>
              <span>每天 {sum.goal} 词</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(sum.started / Math.max(1, sum.bookTotal)) * 100}%` }} />
            </div>
            <p className="mt-3 text-[13px] text-muted-foreground" data-testid="finish-date">
              {sum.newLeft === 0 ? "整本词书已经学完 🎉" : `按计划 ${fmtDate(sum.finish, true)} 学完`}
            </p>
          </Panel>
        </div>
      </div>

      <ShareSheet open={share} onOpenChange={setShare} info={info} />
      <WordSheet word={wod} open={sheet} onOpenChange={setSheet} />
    </div>
  );
}

/** 备考冲刺：考试倒计时 + 冲刺计划 + 核心未掌握入口 */
function ExamCard({
  day,
  exam,
  official,
  custom,
  plan,
  daily,
  coreLeft,
}: {
  day: string;
  exam: string;
  official: boolean;
  custom: boolean;
  plan: ReturnType<typeof sprintPlan>;
  daily: number;
  coreLeft: number;
}) {
  const applied = plan.newLeft === 0 || daily >= plan.daily;
  const wd = WEEK[new Date(exam + "T12:00:00").getDay()];
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4" data-testid="exam-card" data-days={plan.daysLeft}>
      <div className="flex items-center gap-3.5">
        <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-foreground px-3 py-2 text-background" data-testid="exam-days">
          <span className="tnum font-display text-[28px] font-extrabold leading-none">{plan.daysLeft}</span>
          <span className="mt-0.5 text-[11px] font-bold opacity-75">天</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[15px] font-bold">
            <GraduationCap className="size-4 text-primary" />
            {plan.daysLeft === 0 ? "今天就是四级考试，加油！" : "距四级考试"}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground" data-testid="exam-date">
            {fmtDate(exam, true)} {wd}
            <span className={cn("rounded px-1 text-[10px] font-bold", official ? "bg-know-soft text-know" : "bg-secondary")}>
              {custom ? "自定" : official ? "官方" : "预估"}
            </span>
          </div>
        </div>
        <Link to="/me" aria-label="设置考试日期" className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
          <ChevronRight className="size-5" />
        </Link>
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-secondary/70 p-3" data-testid="sprint">
        <Target className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 leading-snug">
          {plan.newLeft === 0 ? (
            <div className="text-[14px] font-bold">新词已学完，专心复习</div>
          ) : (
            <>
              <div className="text-[14px] font-bold" data-testid="sprint-daily" data-daily={plan.daily}>
                冲刺计划：每天 {plan.daily} 词
              </div>
              <div className="text-[12px] text-muted-foreground" data-testid="sprint-sub">
                {plan.tooMany
                  ? `每天要 ${plan.need} 词才学得完，建议改学核心词`
                  : `剩 ${plan.newLeft} 词 · ${fmtDate(plan.finish)}学完${plan.reserve ? ` · 留 ${plan.reserve} 天复习` : ""}`}
              </div>
            </>
          )}
        </div>
        {plan.newLeft > 0 &&
          (applied ? (
            <span className="flex shrink-0 items-center gap-1 text-[12px] font-bold text-know" data-testid="sprint-ok">
              <Check className="size-4" strokeWidth={3} /> 已达标
            </span>
          ) : (
            <button
              type="button"
              data-testid="sprint-apply"
              onClick={() => {
                setSettings({ daily: plan.daily });
                toast.success(`每日新词改为 ${plan.daily}`);
              }}
              className="shrink-0 rounded-full bg-primary px-3.5 py-2 text-[13px] font-bold text-primary-foreground"
            >
              应用
            </button>
          ))}
      </div>

      {coreLeft > 0 && (
        <Link to="/words" search={{ tab: "core" }} data-testid="core-entry" className="mt-2 flex items-center gap-2 rounded-2xl px-1 pt-1 text-[13px] text-muted-foreground hover:text-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          核心词还有 <b className="tnum text-foreground">{coreLeft}</b> 个没掌握
          <ChevronRight className="ml-auto size-4" />
        </Link>
      )}
    </section>
  );
}

function Notice({ icon, tone, title, sub, action, testid }: { icon: React.ReactNode; tone: string; title: string; sub: string; action: React.ReactNode; testid?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-border/70 bg-card p-3.5 pr-4" data-testid={testid}>
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl", tone)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold leading-tight">{title}</div>
        <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{sub}</div>
      </div>
      {action}
    </div>
  );
}

function Todo({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-2xl px-3 py-3 font-medium", done ? "bg-know-soft text-know" : "bg-secondary text-muted-foreground")}>
      <span className={cn("grid size-5 place-items-center rounded-full", done ? "bg-know text-white" : "border-2 border-muted-foreground/30")}>
        {done && <Check className="size-3" strokeWidth={3} />}
      </span>
      {label}
    </div>
  );
}

function NbLink({ tab, icon, label, n, tone }: { tab: "star" | "wrong" | "mastered"; icon: React.ReactNode; label: string; n: number; tone: string }) {
  return (
    <Link
      to="/words"
      search={{ tab }}
      data-testid={`nb-${tab}`}
      className="flex flex-col gap-2 rounded-3xl border border-border/70 bg-card p-3.5 transition hover:border-primary/40"
    >
      <span className={cn("grid size-8 place-items-center rounded-xl", tone)}>{icon}</span>
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="tnum -mt-1 text-[20px] font-extrabold">{n}</span>
    </Link>
  );
}
