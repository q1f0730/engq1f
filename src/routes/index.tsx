import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlarmClock,
  BookMarked,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Coffee,
  FastForward,
  Flame,
  GraduationCap,
  HardDriveDownload,
  Headphones,
  Play,
  Puzzle,
  Repeat2,
  Scale,
  Share2,
  Skull,
  Sparkles,
  Target,
  Ticket,
  Volume2,
  X,
  Zap,
} from "@/components/app/icons";
import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { Meter, Ring, WeekStrip } from "@/components/app/charts";
import { Logo, Panel, PanelTitle, Spinner } from "@/components/app/shell";
import { isStandalone, promptInstall, useInstallPrompt } from "@/lib/install";
import { INSTALL_SNOOZE_DAYS, installVisible } from "@/lib/ux";
// 11.3 · 分享图 / 单词详情只在点开时才加载（首屏 JS 预算）
const ShareSheet = lazy(() => import("@/components/app/share-sheet").then((m) => ({ default: m.ShareSheet })));
const WordSheet = lazy(() => import("@/components/app/word-bits").then((m) => ({ default: m.WordSheet })));
import { speak } from "@/lib/audio";
import { now, today } from "@/lib/clock";
import { getWordsSync, shortMeaning, useWords, type WordIndex } from "@/lib/data";
import { PAUSE_CAP, dayRuleOf, newWordsLeft, notebookWords, summarize, wordOfDay } from "@/lib/plan";
import { addDays, diffDays, dueWords, finishDate } from "@/lib/srs";
import { useBackClose } from "@/lib/back-stack";
import {
  ackExam,
  checkIn,
  dismissNewCut,
  dismissSprint,
  chooseRecoverMix,
  dismissRecover,
  dismissWeekReport,
  endPause,
  endRecover,
  examActiveIn,
  getState,
  markGoalMet,
  markPaceOk,
  patchYesterday,
  respreadRecover,
  setNewCut,
  setSettings,
  snapDayRule,
  snoozeBackup,
  snoozeInstall,
  startRecover,
  useApp,
  type AppState,
} from "@/lib/store";
import { MAKEUP_EVERY, MAKEUP_MAX, STREAK_WARN_MIN, WEEKDAY_CN, brokenStreak, canPatch, curStreak, eveFree, examDayOn, examTaken, isRestDay, lateWarning, minutesToMidnight, patchedStreak, restOf, skipKind } from "@/lib/habit";
import { celebrate } from "@/lib/celebrate";
import { SPRINT_MAX, capReach, coreUnmastered, examForecast, daysUntil, effectiveExam, examAdvice, nextExamDate, passedExam, quizDoneOn, recommendPlan, sprintPlan, upcomingExams, type ExamAdvice, type SprintPlan } from "@/lib/exam";
import { QUIZ_MIN_LEARNED, RECOVER_RESTART_GAP, homeAdvice, lastActive, recoverGap, recoverPerDay, recoverTick, recoveryPlan, type Advice } from "@/lib/coach";
import { NEW_CARD_SEC, REVIEW_CARD_SEC } from "@/lib/ux";
import { backupDue } from "@/lib/persist";
import { useShareInfo } from "@/lib/use-share";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { showWeekReport, weekReport } from "@/lib/stats";

export const Route = createFileRoute("/")({ component: Today });

const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
/** 11.4 · 用户知情选了考后才学完的量：这么多天里不弹冲刺卡；点「知道了」后这么多天不再出现 */
const PACE_QUIET_DAYS = 7;
const SPRINT_SNOOZE_DAYS = 14;

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
  const [justChecked, setJustChecked] = useState(false);
  // 11.3 · 考前 / 休息时额外学新词：先确认
  const [extraAsk, setExtraAsk] = useState(false);
  const checking = useRef(false);
  const info = useShareInfo(index);
  const canPrompt = useInstallPrompt();
  // 11.2 · 恢复期每天第一次打开：今天到期的超过额度（漏了一天 / 没清完）就从今天起重新摊开，守住「每天 N 个以内」
  useLayoutEffect(() => {
    const s0 = getState();
    const d = today();
    // 11.3 · 恢复期中途断了好几天：先问（欢迎回来卡），不悄悄顺延
    if (s0.recoverSeen !== d && recoverGap(s0.recover, lastActive(s0.log, s0.checkins, d), d) >= RECOVER_RESTART_GAP) return;
    const t = recoverTick(s0.cards, s0.recover, d, s0.settings.reviewCap ?? 0, s0.log[d]?.r ?? 0);
    if (t) respreadRecover(t.cards, t.until, t.n, t.shifted, d);
  }, [st.recover, st.cards, st.recoverSeen]);
  // 11.3 · 今天的任务完成了就记下来：没点打卡、过了 0 点，这一天照样算打卡
  useEffect(() => {
    const idx = getWordsSync();
    if (!idx) return;
    const d = today();
    const st0 = getState();
    const s0 = summarize(idx, st0, d);
    // 11.4 · 今天的任务快照（第一次打开时按今天的设置记下）：以后回头判断今天，只按这份
    if (!st0.dayRule?.[d]) snapDayRule(d, dayRuleOf(s0));
    if (s0.ready && !s0.checked) markGoalMet(d);
  }, [st.log, st.checkins, index]);
  if (error) return <div className="p-8 text-center text-sm text-ink-3">{error}</div>;
  if (!index) return <TodaySkeleton />;

  const day = today();
  const sum = summarize(index, st, day);
  const s = curStreak(st, day);
  const rest = restOf(st);
  const restToday = isRestDay(day, rest);
  const late = lateWarning(new Date(now()).getHours(), sum.checked, restToday || sum.paused);
  const patchable = canPatch(st, day);
  const timePct = Math.min(1, sum.ms / (sum.goalMin * 60000));
  const minutes = Math.floor(sum.ms / 60000);
  const wod = wordOfDay(index, day);
  const pct = sum.timeMode ? Math.min(1, sum.ms / (sum.goalMin * 60000)) : sum.goal ? Math.min(1, sum.learned / sum.goal) : sum.due === 0 ? 1 : 0;
  // 11.3 · 考前模式 / 休息期间不排新词：额外学一组要说清楚、要确认
  const extraNew = sum.examMode || sum.paused;
  const learnLabel = sum.newLeft === 0 ? "词书已学完" : extraNew ? "额外学新词" : sum.learned === 0 ? "开始学习" : sum.remainingGoal > 0 ? "学下一组" : "再学一组";
  const nightOwl = new Date(now()).getHours() < 5;
  const exam = effectiveExam(day, st.settings.examDate);
  const official = upcomingExams(day, 3).find((e) => e.day === exam.day)?.official ?? false;
  const plan = sprintPlan(day, exam.day, sum.newLeft);
  const coreNewLeft = st.settings.book === "core" ? sum.newLeft : newWordsLeft(index, { ...st, settings: { ...st.settings, book: "core" } }, day).length;
  const examAdv = st.examPause ? null : examAdvice(day, exam.day, { book: st.settings.book, daily: st.settings.daily, newLeft: sum.newLeft, coreNewLeft });
  // 11.2 · 考完了：用户选了才换计划
  // 11.5 · 自定的日期只有真的是考试日（按当时的快照，提前设好的）才问「考完了吗」；当天才改成今天的不算
  const over0 = passedExam(day, st.settings.examDate, st.examDone, examActiveIn(st), (x) => examTaken(st, x));
  const over = over0 && over0.custom && !examDayOn(st, over0.day) ? null : over0;
  const examOver = over ? { ...over, next: nextExamDate(day) } : null;
  const paceQuiet = (!!st.paceOk && diffDays(st.paceOk, day) < PACE_QUIET_DAYS) || (!!st.sprintSnooze && st.sprintSnooze > day);
  const core = coreUnmastered(index, st);
  const coreLeft = core.unlearned.length + core.learning.length;
  const quizDone = quizDoneOn(st, day);
  const dateLine = `${fmtDate(day)} ${WEEK[new Date(day + "T12:00:00").getDay()]}`;
  const taskDone = sum.ready || sum.checked;
  const quizOpen = !quizDone && sum.started >= QUIZ_MIN_LEARNED && taskDone;
  const advice = homeAdvice({
    day,
    dueAll: sum.dueList.length,
    due: sum.due,
    learned: sum.learned,
    daily: st.settings.daily,
    newLeft: sum.newLeft,
    started: sum.started,
    reviewCap: st.settings.reviewCap ?? 0,
    taskDone,
    checked: sum.checked,
    plan,
    exam: examAdv,
    examDay: exam.day,
    examMode: sum.examMode,
    examPause: st.examPause,
    paused: sum.paused,
    examOver,
    // 11.4 · 用户知情选了考后才学完的量（7 天内）、或者点过「知道了」（14 天内）：不再劝
    sprintSeen: st.sprintSeen === day || paceQuiet,
    sprintOff: st.sprintOff === exam.day,
    last: lastActive(st.log, st.checkins, day),
    recover: st.recover,
    recoverSeen: st.recoverSeen,
    recoverGap: recoverGap(st.recover, lastActive(st.log, st.checkins, day), day),
    cut: st.newCut?.d === day ? st.newCut.n : null,
    cutSeen: st.newCutSeen === day,
    patchable,
    backupDays: backupDue(st, day),
    install: installVisible({ canPrompt, standalone: isStandalone(), installed: st.installed, snoozeUntil: st.installSnooze, today: day }),
    hard: notebookWords(st, "hard").length,
    aheadCount: sum.aheadCount,
    quizDone,
    week: showWeekReport(st.log, day, st.weekSeen),
  });
  // 现在该干嘛：有到期复习先复习（旧词不巩固会越积越多），否则学新词
  const reviewFirst = sum.due > 0 && (sum.learned > 0 || sum.recovering || sum.examMode || sum.paused || sum.newLeft === 0 || sum.due >= 10);
  const etaMin = Math.max(1, Math.round((Math.min(sum.remainingGoal, sum.newLeft) * NEW_CARD_SEC + sum.due * REVIEW_CARD_SEC) / 60));
  // 11.2 · 「还剩」一行：只拼有的部分（复习为 0 时不会多出一个点）
  const leftParts = [sum.due ? `复习 ${sum.due}` : "", sum.remainingGoal && sum.newLeft ? `新词 ${Math.min(sum.remainingGoal, sum.newLeft)}` : ""].filter(Boolean);
  // 恢复期 / 考前模式：主卡的大数字是「今天复习 x / 今天的量」
  const reviewDay = sum.recovering || sum.examMode || sum.paused;
  // 11.3 · 考前模式里一个复习都没有：不显示 100% 的圆环
  const examIdle = sum.examMode && !sum.recovering && sum.reviewed + sum.due === 0;
  // 11.6 / 11.7 · 考前一天什么都不用做：不打卡也不断签。和结算同一个函数（habit.eveFree，读今天的快照），按词数 / 按时长一个说法
  const idleEve = !sum.examDay && !sum.paused && !sum.ready && !sum.checked && eveFree(st, day, st.dayRule?.[day] ?? dayRuleOf(sum));
  // 11.7 · 今天按快照是考试日（结算 skipDay 用的同一个 examDayOn）：不打卡也不断签
  const todayExam = examDayOn(st, day);
  // 考试日改到了以后（今天按原来的快照还是考试日）：打卡卡片照样说今天不打卡也不断签
  const movedExam = todayExam && sum.examMode && !sum.examDay && !sum.paused && !sum.ready && !sum.checked;
  // 11.7 · 考试当天 / 考前一天不免打卡（自定的考试日离上一场不到 30 天，R7-6）：主卡不说「不用背了 / 不断签」
  const examFree = todayExam || idleEve;
  const noPass = sum.examMode && !examFree && !sum.ready && !sum.checked;
  const canCheck = sum.ready && !sum.checked;
  // 11.2 · 没有复习时不放一个「复习 0」的空按钮
  // 11.4 · 考试当天不放「额外学新词」
  const noSecond = (!canCheck && !reviewFirst && sum.due === 0) || (sum.examDay && (canCheck ? sum.due === 0 : reviewFirst));
  const urgent = advice && (advice.kind === "recover-offer" || advice.kind === "recovering" || advice.kind === "exam-over" || advice.kind === "makeup");
  // 11.4 · 考完了、还没选：首屏只有「考完了」这一件事（不排新词目标，也不报复习量）
  const overFirst = advice?.kind === "exam-over" ? advice : null;
  // 「今日一词」单独占一行（前面的小卡是偶数个）时用宽版
  const wodWide = (3 + (sum.due > 0 && !overFirst ? 1 : 0) + (quizOpen && advice?.kind !== "quiz" ? 1 : 0)) % 2 === 0;
  // 11.4 · 连续 3 天以上才说「要断了」
  const lateOn = late && s >= STREAK_WARN_MIN && !sum.ready && !sum.checked && !idleEve && !todayExam && advice?.kind !== "recover-offer" && advice?.kind !== "recovering";
  // 11.3 · 连续 0 天不显示补卡说明；昨天刚断（又没补卡可用）时说一句，不悄悄清零
  const showHabit = s > 0;
  // 11.4 · 休息中 / 考完了还没选时不说「断了」；连续 1–2 天不算「连续」
  const lost0 = s === 0 && !patchable && !sum.paused && !overFirst ? brokenStreak(st, day) : 0;
  const lost = lost0 >= STREAK_WARN_MIN ? lost0 : 0;

  const guardNew = (isNew: boolean) => (e: React.MouseEvent) => {
    if (isNew && extraNew && sum.newLeft > 0) {
      e.preventDefault();
      setExtraAsk(true);
    }
  };
  const doCheckIn = () => {
    // 11.1 · 连点只算一次：第一次点下去就锁住，toast 用固定 id 去重
    if (checking.current || getState().checkins.includes(day)) return;
    checking.current = true;
    const r = checkIn(day);
    toast.success(`打卡成功！连续 ${r.streak} 天`, { id: "checkin", ...(r.earned ? { description: `连续 ${r.streak} 天，奖励 1 张补卡（共 ${r.makeup} 张）` } : {}) });
    setJustChecked(true);
    // 分享图只在点「分享图」时才弹；里程碑照常全屏庆祝
    celebrate(r.milestone);
    setTimeout(() => (checking.current = false), 800);
  };
  const doPatch = () => {
    const r = patchYesterday(day);
    if (!r) return;
    toast.success(`已补上昨天，连续 ${r.streak} 天`, { description: `剩 ${r.makeup} 张补卡` });
    celebrate(r.milestone);
  };

  return (
    <div data-testid="today">
      <header className="flex items-end justify-between gap-3 pb-6 pt-7 md:pt-10">
        <div className="min-w-0">
          <div className="text-[0.8125rem] text-ink-3" data-testid="today-date">
            {dateLine}
          </div>
          <h1 className="mt-0.5 text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.02em]">{greeting()}</h1>
        </div>
        <div
          className={cn("flex items-baseline gap-1 pb-1 text-ink", s > 0 ? "" : "hidden")}
          data-testid="streak"
          data-streak={s}
          aria-label={`连续 ${s} 天`}
        >
          <Flame className={cn("size-[15px] translate-y-[2px] text-ink-2", s > 0 && "fill-mark")} />
          <span className="tnum font-serif text-[1.875rem] leading-none">{s}</span>
          <span className="text-[0.8125rem] text-ink-3">天</span>
        </div>
      </header>

      <div className="grid gap-8">
        <div className="min-w-0 space-y-8">
          {/* 主卡片：现在该干嘛（11.2 · 第一屏只有这一张；断签提醒并进主卡，不再是单独的红色横幅） */}
          {overFirst ? (
            <ExamOverCard advice={overFirst} index={index} st={st} day={day} streak={s} />
          ) : (
          <section className="hero-gradient relative overflow-hidden rounded-2xl px-5 pb-5 pt-4" data-testid="hero" data-mode={sum.recovering ? "recover" : sum.paused ? "pause" : sum.examMode ? "exam" : "normal"}>
            {lateOn && <LateStrip sum={sum} streak={s} />}
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                {sum.timeMode ? (
                  <>
                    <div className="text-[0.8125rem] text-ink-3">今日学习</div>
                    <div className="mt-1 flex items-baseline gap-1.5" data-testid="hero-time" data-min={minutes}>
                      <span className="tnum font-serif text-[4.5rem] leading-[0.82]">{minutes}</span>
                      <span className="tnum font-serif text-[1.625rem] leading-none text-ink-3">/ {sum.goalMin} 分钟</span>
                    </div>
                  </>
                ) : reviewDay ? (
                  <>
                    <div className="text-[0.8125rem] text-ink-3" data-testid="hero-label">
                      {sum.recovering ? "恢复期 · 今天复习" : sum.paused ? "休息中 · 只做维持复习" : sum.examDay ? "今天考试 · 考前热身" : "考前模式 · 只复习"}
                    </div>
                    {sum.reviewed + sum.due === 0 && !sum.recovering ? (
                      <div className="mt-2 text-[1.875rem] font-semibold leading-tight tracking-[-0.02em]" data-testid="hero-review" data-done={0} data-total={0}>
                        {sum.paused ? "休息中" : plan.daysLeft === 0 ? "今天考试，加油" : "明天考试"}
                      </div>
                    ) : (
                      <div className="mt-1 flex items-baseline gap-1.5" data-testid="hero-review" data-done={sum.reviewed} data-total={sum.reviewed + sum.due}>
                        <span className="tnum font-serif text-[4.5rem] leading-[0.82]">{sum.reviewed}</span>
                        <span className="tnum font-serif text-[1.625rem] leading-none text-ink-3">/ {sum.reviewed + sum.due}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-[0.8125rem] text-ink-3">今日新词</div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="tnum font-serif text-[4.5rem] leading-[0.82]" data-testid="learned">
                        {sum.learned}
                      </span>
                      <span className="tnum font-serif text-[1.625rem] leading-none text-ink-3">/ {sum.goal}</span>
                    </div>
                  </>
                )}
              </div>
              {examIdle || (sum.paused && sum.reviewed + sum.due === 0) ? (
                <span className="mb-1 grid size-8 shrink-0 place-items-center text-ink-2" data-testid="hero-ring-idle">
                  {sum.paused ? <Coffee className="size-6" /> : <GraduationCap className="size-6" />}
                </span>
              ) : (
                <span className="tnum mb-1 shrink-0 text-[0.875rem] font-medium text-ink-2" data-testid="hero-pct">
                  {Math.round((reviewDay && !sum.timeMode ? (sum.reviewed + sum.due ? sum.reviewed / (sum.reviewed + sum.due) : 1) : pct) * 100)}%
                </span>
              )}
            </div>
            {!(examIdle || (sum.paused && sum.reviewed + sum.due === 0)) && (
              <Meter value={reviewDay && !sum.timeMode ? (sum.reviewed + sum.due ? sum.reviewed / (sum.reviewed + sum.due) : 1) : pct} className="mt-4" />
            )}
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.8125rem] text-ink-2">
              {(sum.timeMode || reviewDay) && (
                <span data-testid={reviewDay && !sum.timeMode ? "learned" : undefined}>
                  {sum.timeMode ? `新词 ${sum.learned}` : reviewDay ? (sum.recovering ? (sum.goal ? `新词 ${sum.learned}/${sum.goal}` : "新词暂停") : sum.learned ? `额外新词 ${sum.learned}` : "不排新词") : ""}
                </span>
              )}
              <span data-testid="due-count">待复习 {sum.due}</span>
              {!reviewDay && <span>已复习 {sum.reviewed}</span>}
              {sum.deferred > 0 && (
                <span className="rounded-[3px] bg-paper-2 px-1.5 text-[0.75rem] font-medium text-ink-2" data-testid="deferred">
                  {sum.recovering ? `顺延 ${sum.deferred}` : sum.examMode || sum.paused ? `其余 ${sum.deferred} 个不急` : `已达上限 · 顺延 ${sum.deferred}`}
                </span>
              )}
            </div>
            <div className={cn("mt-5 grid gap-2", (sum.recovering && !sum.goal) || noSecond ? "grid-cols-1" : "grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]")} data-testid="hero-actions" data-next={canCheck ? "checkin" : reviewFirst ? "review" : "new"}>
              {canCheck ? (
                <button
                  type="button"
                  onClick={doCheckIn}
                  data-testid="checkin"
                  className="press flex h-12 items-center justify-center gap-2 rounded-lg bg-mark text-base font-semibold text-mark-ink"
                >
                  <CalendarCheck className="size-[18px]" /> 完成了，打卡
                </button>
              ) : sum.examDay && examFree && !reviewFirst ? (
                <div className="flex h-12 items-center justify-center gap-2 rounded-lg bg-paper-2 text-[0.9375rem] font-medium text-ink-2" data-testid="exam-day-rest">
                  <GraduationCap className="size-4" /> 今天不用再背了
                </div>
              ) : sum.recovering && sum.due === 0 && !(sum.goal > 0 && sum.remainingGoal > 0) ? (
                <div className="flex h-12 items-center justify-center gap-2 rounded-lg bg-know-soft text-[0.9375rem] font-medium text-know" data-testid="recover-today-done">
                  <Check className="size-4" strokeWidth={2.4} /> 今天的积压清完了
                </div>
              ) : (
                <Link
                  to="/study"
                  search={{ mode: reviewFirst ? "review" : "new" }}
                  onClick={guardNew(!reviewFirst)}
                  disabled={!reviewFirst && sum.newLeft === 0}
                  data-testid={reviewFirst ? "start-review" : "start-learn"}
                  className={cn(
                    "press flex h-12 items-center justify-center gap-2 rounded-lg bg-ink text-base font-semibold text-paper-3",
                    !reviewFirst && sum.newLeft === 0 && "pointer-events-none opacity-45",
                  )}
                >
                  {reviewFirst ? <Repeat2 className="size-[18px]" /> : <Play className="size-4 fill-current" />}
                  {reviewFirst ? `复习 ${sum.due}` : learnLabel}
                </Link>
              )}
              {/* 恢复期只有一个主按钮：新词入口在下面的恢复卡里（「提前恢复新词」，要确认） */}
              {!(sum.recovering && !sum.goal) &&
                !noSecond &&
                (canCheck ? (
                  <Link
                    to="/study"
                    search={{ mode: sum.due > 0 ? "review" : "new" }}
                    onClick={guardNew(sum.due === 0)}
                    data-testid={sum.due > 0 ? "start-review" : "start-learn"}
                    className={cn(
                      "press flex h-12 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-paper-2 px-2 text-[0.9375rem] font-medium text-ink hover:bg-rule",
                      sum.due === 0 && sum.newLeft === 0 && "pointer-events-none opacity-45",
                    )}
                  >
                    {sum.due > 0 ? `复习 ${sum.due}` : sum.newLeft === 0 ? "词书已学完" : extraNew ? "额外学新词" : "再学一组"}
                  </Link>
                ) : (
                  <Link
                    to="/study"
                    search={{ mode: reviewFirst ? "new" : "review" }}
                    onClick={guardNew(reviewFirst)}
                    disabled={reviewFirst && sum.newLeft === 0}
                    data-testid={reviewFirst ? "start-learn" : "start-review"}
                    className={cn(
                      "press flex h-12 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-paper-2 px-2 text-[0.9375rem] font-medium text-ink hover:bg-rule",
                      (reviewFirst ? sum.newLeft === 0 : sum.due === 0) && "text-ink-3",
                      reviewFirst && sum.newLeft === 0 && "pointer-events-none",
                    )}
                  >
                    {reviewFirst ? <Play className="size-3.5 fill-current" /> : <Repeat2 className="size-4" />}
                    {reviewFirst ? learnLabel : `复习 ${sum.due}`}
                  </Link>
                ))}
            </div>
            {extraAsk && (
              <div className="rise mt-3 rounded-xl bg-paper-2 p-3.5 text-[0.8125rem]" data-testid="extra-new-confirm">
                <p className="leading-relaxed text-ink-2">{sum.examMode ? "考前不排新词，现在背的新词考场上多半还记不牢。" : "休息期间不排新词。"}确定额外学 10 个新词吗？</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" data-testid="extra-new-cancel" onClick={() => setExtraAsk(false)} className="press h-10 rounded-lg font-medium text-ink-2 ring-1 ring-rule-strong ring-inset">
                    算了
                  </button>
                  <Link to="/study" search={{ mode: "new" }} data-testid="extra-new-go" className="press flex h-10 items-center justify-center rounded-lg bg-ink font-semibold text-paper-3">
                    学 10 个新词
                  </Link>
                </div>
              </div>
            )}
            <p className="mt-3 text-[0.8125rem] leading-snug text-ink-3" data-testid="hero-now">
              {sum.checked
                ? extraNew ? "今天已打卡 ✓" : "今天已打卡 ✓ 想多学可以再来一组"
                : sum.ready
                  ? "今天的任务完成了 ✓"
                  : idleEve || movedExam
                    ? "考前不用赶新词 · 今天不打卡也不断签"
                    : sum.timeMode
                    ? `还差 ${Math.max(0, sum.goalMin - minutes)} 分钟就能打卡`
                    : noPass && examIdle
                      ? "离上次考试不到 30 天 · 学一组就能打卡"
                    : examIdle
                      ? sum.examDay
                        ? "带好准考证和耳机，好好发挥"
                        : "考前不用赶新词 · 今天不打卡也不断签"
                      : sum.examMode && sum.due
                        ? sum.examDay
                          ? `考前热身：最容易忘的 ${sum.due} 个 · 约 ${etaMin} 分钟，别的不用背了`
                          : `考前最后一天：先复习最容易忘的 ${sum.due} 个 · 约 ${etaMin} 分钟`
                        : leftParts.length
                          ? `还剩 ${leftParts.join(" · ")} · 约 ${etaMin} 分钟`
                          : "今天没有要做的了"}
            </p>
            {nightOwl && !sum.ready && !sum.checked && leftParts.length > 0 && etaMin > 10 && (
              <p className="mt-1 text-[0.75rem] text-ink-3" data-testid="hero-night">
                太晚了，先做 10 分钟，剩下的明天再说
              </p>
            )}
          </section>
          )}

          {advice && urgent && !overFirst && <AdviceCard advice={advice} day={day} st={st} index={index} onPatch={doPatch} patchedStreak={patchable ? patchedStreak(st, day) : 0} logs={st.log} />}

          {/* 打卡（11.2 · 打卡按钮只在主卡上，这里只显示进度和日历） */}
          <Panel data-testid="checkin-panel">
            <PanelTitle
              right={
                <Link to="/stats" className="press -my-2 flex items-center gap-0.5 rounded-md py-2 text-[0.8125rem] text-ink-3 hover:text-ink">
                  打卡日历 <ChevronRight className="size-3.5" />
                </Link>
              }
            >
              每日打卡
            </PanelTitle>
            <WeekStrip checkins={st.checkins} logs={st.log} today={day} rest={rest} patched={st.patched} pause={st.pause} skip={(d) => skipKind(st, d)} />
            {restToday && !sum.checked && (
              <div className="mt-4 flex items-center gap-2 text-[0.8125rem] text-know" data-testid="rest-today">
                <Coffee className="size-4 shrink-0" /> 今天是休息日，不打卡也不断连续；学了照样可以打卡
              </div>
            )}
            <div className={cn("mt-4", overFirst && !sum.checked && "hidden")}>
              {sum.checked ? (
                <div className={cn("flex items-center gap-3 rounded-xl bg-paper-3 p-3.5 ring-1 ring-rule ring-inset", justChecked && "checkin-burst")} data-testid="checked-in">
                  <div className={cn("grid size-10 shrink-0 place-items-center rounded-lg bg-mark text-mark-ink", justChecked && "pop")}>
                    <Check className="size-5" strokeWidth={2.4} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.9375rem] font-semibold"><span className={cn(justChecked && "hl-swipe")}>{justChecked ? "打卡成功" : "今日已打卡"}</span></div>
                    <div className="tnum text-[0.8125rem] text-ink-3">连续 {s} 天 · 累计 {st.checkins.length} 天</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShare(true)}
                    data-testid="open-share"
                    className="press flex h-10 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium text-ink ring-1 ring-rule-strong ring-inset hover:bg-paper-2"
                  >
                    <Share2 className="size-4" /> 分享图
                  </button>
                </div>
              ) : idleEve || movedExam ? (
                <div className="flex items-center gap-2.5 rounded-xl bg-know-soft px-3.5 py-3 text-[0.8125rem] font-medium leading-snug text-know" data-testid="checkin-idle-eve" data-kind={idleEve ? "eve" : "exam"}>
                  <GraduationCap className="size-5 shrink-0" /> {idleEve ? "考前一天，今天没有要做的" : "今天是原定的考试日"}：不打卡也不断签，连续 {s} 天保留
                </div>
              ) : sum.ready ? (
                <div className="flex items-center gap-2.5 rounded-xl bg-know-soft px-3.5 py-3 text-[0.8125rem] font-medium text-know" data-testid="checkin-ready">
                  <CalendarCheck className="size-5 shrink-0" /> 今天的任务完成了，在上面打卡
                </div>
              ) : sum.timeMode ? (
                <div className="text-[0.8125rem]" data-testid="checkin-todo" data-mode="time">
                  <div className="flex items-center gap-3 py-1">
                    <AlarmClock className="size-5 shrink-0 text-ink-2" />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between font-medium">
                        <span>学满 {sum.goalMin} 分钟就能打卡</span>
                        <span className="tnum text-ink-3">
                          {minutes}/{sum.goalMin}
                        </span>
                      </div>
                      <Meter value={timePct} className="mt-2 h-1.5" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3" data-testid="checkin-todo" data-mode="words">
                  {/* 11.2 · 什么都没做的项目不打勾 */}
                  {sum.goal === 0 ? (
                    <Todo done={false} muted label={sum.recovering ? "恢复期不学新词" : sum.paused ? "休息中不排新词" : sum.examMode ? "考前不排新词" : "今天不学新词"} />
                  ) : (
                    <Todo done={sum.learned >= sum.goal || (sum.newLeft === 0 && sum.started > 0)} label={sum.newLeft === 0 ? "词书已学完" : `新词 ${sum.learned}/${sum.goal}`} />
                  )}
                  {sum.due === 0 && sum.reviewed === 0 ? <Todo done={false} muted label="今天没有复习" /> : <Todo done={sum.due === 0} label={sum.due === 0 ? "复习已清零" : `还需复习 ${sum.due}`} />}
                </div>
              )}
            </div>
            {lost > 0 && !sum.checked && (
              <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-3" data-testid="streak-lost" data-n={lost}>
                昨天没完成任务，连续 {lost} 天断了。今天学完重新开始{(st.makeup ?? 0) === 0 ? "；每连续 7 天得 1 张补卡，下次漏了能补" : ""}。
              </p>
            )}
            {showHabit && (
              <div className="mt-4 flex items-center gap-3 text-[0.8125rem] text-ink-3" data-testid="habit-row">
                <span className="tnum flex shrink-0 items-center gap-1.5 font-medium text-ink-2" data-testid="makeup-count" data-n={st.makeup ?? 0}>
                  <Ticket className="size-4" /> 补卡 {st.makeup ?? 0}/{MAKEUP_MAX}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  每连续 {MAKEUP_EVERY} 天得 1 张{rest >= 0 ? ` · 周${WEEKDAY_CN[rest]}休息` : ""}
                </span>
              </div>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-8">
          {!examOver && (
            <ExamCard
              day={day}
              exam={exam.day}
              official={official}
              custom={exam.custom}
              plan={plan}
              adv={examAdv}
              daily={st.settings.daily}
              coreLeft={coreLeft}
              sum={sum}
              book={st.settings.book}
              paused={!!st.examPause}
              index={index}
              st={st}
              quiet={paceQuiet ? "pace" : advice?.kind === "sprint" ? "sprint" : null}
            />
          )}

          {/* 11.2 · 不急的建议（备份、冲刺、顽固词…）排在第一屏以下，同一时间最多一张 */}
          {advice && !urgent && <AdviceCard advice={advice} day={day} st={st} index={index} onPatch={doPatch} patchedStreak={patchable ? patchedStreak(st, day) : 0} logs={st.log} />}


          {/* 更多练习：碎片时间、小游戏、今日一词（11.1 · 从首页主体收进来） */}
          <section data-testid="more-practice" className="border-t border-rule pt-5">
            {/* 今日一词：一个词典词条，衬线词头 */}
            <button
              type="button"
              onClick={() => setSheet(true)}
              data-testid="wod"
              data-wide={wodWide ? 1 : 0}
              className="press group mb-6 flex w-full min-w-0 items-end gap-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[0.8125rem] text-ink-3">今日一词</span>
                <span className="word-head mt-1 block truncate text-[2.375rem] leading-[1.05]" data-testid="wod-word">{wod.w}</span>
                <span className="mt-1 block truncate text-[0.875rem] text-ink-2">{shortMeaning(wod, 1)}</span>
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label="播放发音"
                onClick={(e) => {
                  e.stopPropagation();
                  speak(wod.w, st.settings.accent);
                }}
                className="press mb-1 grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 ring-1 ring-rule-strong ring-inset hover:bg-paper-2 hover:text-ink"
              >
                <Volume2 className="size-[18px]" />
              </span>
            </button>
            <h2 className="section-rule mb-1 text-[1.0625rem] font-semibold tracking-[-0.01em]">更多练习</h2>
            <div className="flex flex-col" data-testid="snack">
              <SnackTile to="/tape" testid="tape-entry" icon={<Headphones />} title="磁带模式" sub="通勤免手听" />
              {/* 没有到期复习时不放一个点了没用的速刷入口 */}
              {sum.due > 0 && !overFirst && (
                <SnackTile to="/study" search={{ mode: "speed" }} testid="speed-entry" icon={<Zap />} title="速刷" sub={<span data-testid="speed-sub">{`左右滑清 ${sum.due} 词`}</span>} />
              )}
              <SnackTile to="/match" testid="match-entry" icon={<Puzzle />} title="配对消消乐" sub={st.gameBest?.match ? `最高 ${st.gameBest.match} 分` : "60 秒连连看"} />
              <SnackTile to="/judge" testid="judge-entry" icon={<Scale />} title="判断对错" sub={st.gameBest?.judge ? `最高 ${st.gameBest.judge} 分` : "滑一下判对错"} />
              {quizOpen && advice?.kind !== "quiz" && <SnackTile to="/quiz" testid="quiz-entry" icon={<ClipboardCheck />} title="今日小测" sub="20 题 · 限时 5 分钟" />}
            </div>
          </section>
        </div>
      </div>

      <Suspense fallback={null}>
        {share && <ShareSheet open={share} onOpenChange={setShare} info={info} />}
        {sheet && <WordSheet word={wod} open={sheet} onOpenChange={setSheet} />}
      </Suspense>
    </div>
  );
}

/** 11.3 · 词库还在下载：先给首页的骨架（不是空白 + 转圈） */
function TodaySkeleton() {
  return (
    <div data-testid="today-skeleton" aria-busy="true" aria-label="正在加载词库">
      <div className="pb-4 pt-6 md:pt-8">
        <div className="h-3.5 w-24 animate-pulse rounded bg-paper-2" />
        <div className="mt-2 h-8 w-32 animate-pulse rounded-lg bg-paper-2" />
      </div>
      <div className="hero-gradient h-[236px] animate-pulse rounded-2xl opacity-60" />
      <div className="mt-4 h-[150px] animate-pulse rounded-2xl bg-paper-2" />
      <p className="mt-3 text-center text-xs text-ink-3">正在准备词库…</p>
    </div>
  );
}

/** 唯一的建议卡：内容由 homeAdvice 决定 */
function AdviceCard({
  advice,
  day,
  st,
  index,
  onPatch,
  patchedStreak,
  logs,
}: {
  advice: Advice;
  day: string;
  st: AppState;
  index: WordIndex;
  onPatch: () => void;
  patchedStreak: number;
  logs: AppState["log"];
}) {
  const daily = st.settings.daily;
  switch (advice.kind) {
    case "recover-offer":
      return (
        <section className="rounded-2xl border border-ink bg-paper-3 p-4" data-testid="welcome-back" data-backlog={advice.backlog} data-days={advice.days}>
          <div className="flex items-start gap-3">
            <span className="grid size-8 shrink-0 place-items-center text-ink-2">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold leading-tight">欢迎回来！</div>
              <div className="mt-1 text-[0.8125rem] leading-snug text-ink-3" data-testid="welcome-back-sub">
                {advice.gap} 天没见，积压了 {advice.backlog} 个复习。分 {advice.days} 天清完，每天 {advice.perDay} 个以内，这几天新词暂停。
              </div>
            </div>
            <button type="button" aria-label="不用了" data-testid="recover-dismiss" onClick={() => dismissRecover(day)} className="press -mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 hover:text-ink hover:bg-paper-2">
              <X className="size-4" />
            </button>
          </div>
          <button
            type="button"
            data-testid="recover-apply"
            onClick={() => {
              const s0 = getState();
              const per = recoverPerDay(s0.settings.reviewCap ?? 0);
              const r = recoveryPlan(s0.cards, day, per);
              startRecover(r.cards, day, r.until, r.days, per);
              toast.success(`恢复计划开始：${r.days} 天清完积压`, { description: `今天先复习 ${Math.min(advice.perDay, advice.backlog)} 个` });
            }}
            className="press mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink text-sm font-semibold text-paper-3 hover:bg-ink-2"
          >
            一键恢复：{advice.days} 天清完积压
          </button>
        </section>
      );
    case "recovering":
      return <RecoveringCard advice={advice} day={day} st={st} index={index} />;
    case "exam-over":
      return <ExamOverCard advice={advice} index={index} st={st} day={day} streak={curStreak(st, day)} />;
    case "makeup":
      return (
        <Notice
          testid="makeup-notice"
          icon={<Ticket className="size-5" />}
          tone="bg-vague-soft text-vague"
          title="昨天漏打卡了"
          sub={`用 1 张补卡补上 → 连续 ${patchedStreak} 天 · 还有 ${st.makeup} 张`}
          action={
            <button type="button" data-testid="makeup-use" onClick={onPatch} className="shrink-0 rounded-lg bg-vague px-3.5 py-2 text-[0.8125rem] font-semibold text-paper-3">
              补卡
            </button>
          }
        />
      );
    case "sprint":
      return <SprintCard adv={advice.advice} exam={advice.exam} st={st} day={day} curFinish={summarize(index, st, day).finish} />;
    case "adaptive-cut":
      return (
        <Notice
          testid="adaptive-cut"
          icon={<Scale className="size-5" />}
          tone="bg-know-soft text-know"
          title={`今天新词已减到 ${advice.cut} 个`}
          sub={`先清复习 · 明天恢复每天 ${daily} 个`}
          action={
            <button type="button" data-testid="adaptive-restore" onClick={() => setNewCut(day, null)} className="shrink-0 rounded-lg bg-paper-2 px-3.5 py-2 text-[0.8125rem] font-semibold">
              恢复 {daily}
            </button>
          }
        />
      );
    case "adaptive":
      return (
        <Notice
          testid="adaptive-new"
          icon={<Scale className="size-5" />}
          tone="bg-vague-soft text-vague"
          title={`今天要复习 ${summarizeDue(st, day)} 个`}
          sub={`复习压力大，建议今天新词 ${daily} → ${advice.to}，先把旧词巩固住`}
          action={
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" aria-label="不用了" data-testid="adaptive-dismiss" onClick={() => dismissNewCut(day)} className="grid size-8 place-items-center rounded-full text-ink-3">
                <X className="size-4" />
              </button>
              <button
                type="button"
                data-testid="adaptive-apply"
                onClick={() => {
                  setNewCut(day, advice.to);
                  toast.success(`今天新词减到 ${advice.to} 个`, { description: "只影响今天，明天恢复" });
                }}
                className="rounded-lg bg-vague px-3.5 py-2 text-[0.8125rem] font-semibold text-paper-3"
              >
                减到 {advice.to}
              </button>
            </div>
          }
        />
      );
    case "backup":
      return (
        <Notice
          testid="backup-nag"
          icon={<HardDriveDownload className="size-5" />}
          tone="bg-vague-soft text-vague"
          title={st.lastBackup ? `${advice.days} 天没备份了` : "还没备份过学习记录"}
          sub="记录只存在这台手机上：删掉图标、卸载或清理浏览器，记录就全没了"
          action={
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" data-testid="backup-snooze" onClick={() => snoozeBackup(addDays(day, 3))} className="rounded-lg px-2.5 py-2 text-[0.8125rem] font-semibold text-ink-3">
                稍后
              </button>
              <Link to="/me" className="rounded-lg bg-foreground px-3.5 py-2 text-[0.8125rem] font-semibold text-background">
                去备份
              </Link>
            </div>
          }
        />
      );
    case "install":
      return <InstallCard day={day} installed={st.installed} snooze={st.installSnooze} />;
    case "hard":
      return (
        <Link to="/words" search={{ tab: "hard" }} className="block" data-testid="hard-entry">
          <Notice icon={<Skull className="size-5" />} tone="bg-forget-soft text-forget" title={`${advice.n} 个顽固词`} sub="忘了 3 次以上，单独拎出来攻克" action={<ChevronRight className="size-5 shrink-0 text-ink-3" />} />
        </Link>
      );
    case "ahead":
      return (
        <Notice
          testid="ahead"
          icon={<FastForward className="size-5" />}
          tone="bg-know-soft text-know"
          title="今日复习已清零"
          sub={`还有余力？提前复习明天到期的 ${advice.n} 词`}
          action={
            <Link to="/study" search={{ mode: "ahead" }} data-testid="start-ahead" className="shrink-0 rounded-lg bg-know px-3.5 py-2 text-[0.8125rem] font-semibold text-paper-3">
              提前复习
            </Link>
          }
        />
      );
    case "quiz":
      return (
        <Notice
          testid="quiz-reminder"
          icon={<ClipboardCheck className="size-5" />}
          tone="bg-mark-soft text-ink"
          title="今日小测"
          sub="任务完成了，用 20 题检验一下 · 限时 5 分钟"
          action={
            <Link to="/quiz" data-testid="quiz-entry" className="shrink-0 rounded-lg bg-ink px-3.5 py-2 text-[0.8125rem] font-semibold text-paper-3">
              开始
            </Link>
          }
        />
      );
    case "week":
      return <WeekCard day={day} logs={logs} />;
  }
}

const summarizeDue = (st: AppState, day: string) => {
  const idx = getWordsSync();
  return idx ? summarize(idx, st, day).due : 0;
};

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

/** 11.2 · 恢复期进度：漏了一天会自动顺延；新词入口是「提前恢复新词」，要确认，确认后结束恢复计划 */
function RecoveringCard({ advice, day, st, index }: { advice: Extract<Advice, { kind: "recovering" }>; day: string; st: AppState; index: WordIndex }) {
  const [confirm, setConfirm] = useState(false);
  // 11.3 · 恢复期和考试撞了（新词要停到考前不到 14 天）：问一次，边复习边学新词还是先清积压
  const examDay = effectiveExam(day, st.settings.examDate).day;
  const mixTo = Math.max(5, Math.min(st.settings.daily, 20));
  const clash = !st.recover?.asked && !st.examPause && diffDays(advice.until, examDay) < 14 && newWordsLeft(index, st, day).length > 0;
  const mix = st.recover?.mix ?? 0;
  const last = lastActive(st.log, st.checkins, day);
  const missed = last && last >= (st.recover?.from ?? day) ? diffDays(last, day) - 1 : 0;
  const shiftedToday = advice.shifted > 0 && st.recover?.spread === day;
  const sub = shiftedToday
    ? `${missed > 0 ? `漏了 ${missed} 天` : "昨天没清完"}，已顺延到 ${md(advice.until)} · 今天清 ${advice.due} 个`
    : advice.due
      ? `今天清 ${advice.due} 个积压，${mix ? `新词每天 ${mix} 个` : "新词暂停"}`
      : `今天的积压清完了，${mix ? `新词每天 ${mix} 个` : "新词暂停"}`;
  return (
    <section className="rounded-xl ring-1 ring-rule ring-inset bg-paper-3 p-3.5 pr-4" data-testid="recovering" data-shifted={shiftedToday ? advice.shifted : 0} data-until={advice.until}>
      <div className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center text-ink-2">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[0.9375rem] font-semibold leading-tight">
            恢复计划 · 第 {Math.min(advice.day, advice.days)}/{advice.days} 天
          </div>
          <div className="mt-0.5 text-xs leading-snug text-ink-3" data-testid="recovering-sub">
            {sub}
          </div>
        </div>
        {!confirm && !clash && !mix && (
          <button type="button" data-testid="recover-end" onClick={() => setConfirm(true)} className="shrink-0 rounded-lg bg-paper-2 px-3 py-2 text-[0.7812rem] font-semibold">
            提前恢复新词
          </button>
        )}
      </div>
      {clash && (
        <div className="mt-3 rounded-2xl bg-vague-soft p-3 text-[0.7812rem]" data-testid="recover-clash">
          <p className="font-semibold text-vague">
            新词要停到 {md(advice.until)}，那时离考试只剩 {Math.max(0, diffDays(advice.until, examDay))} 天。怎么安排？
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="recover-mix"
              onClick={() => {
                chooseRecoverMix(mixTo);
                toast.success(`边复习边学新词：每天 ${mixTo} 个`);
              }}
              className="h-10 rounded-xl bg-vague px-1 text-[0.7812rem] font-semibold text-paper-3"
            >
              边复习边每天 {mixTo} 个新词
            </button>
            <button
              type="button"
              data-testid="recover-clear"
              onClick={() => {
                chooseRecoverMix(0);
                toast("先清积压，清完新词自动恢复");
              }}
              className="h-10 rounded-xl bg-paper-3 text-[0.7812rem] font-semibold"
            >
              先清积压
            </button>
          </div>
        </div>
      )}
      {confirm && (
        <div className="mt-3 rounded-2xl bg-paper-2 p-3 text-[0.7812rem]" data-testid="recover-end-sheet">
          <p className="text-ink-3">结束恢复计划？没清完的积压会按正常复习安排，可能一天比较多。</p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button type="button" data-testid="recover-end-cancel" onClick={() => setConfirm(false)} className="h-10 rounded-xl bg-paper-3 font-semibold">
              继续恢复
            </button>
            <button
              type="button"
              data-testid="recover-end-confirm"
              onClick={() => {
                endRecover();
                toast.success("恢复计划结束，新词恢复");
              }}
              className="h-10 rounded-xl bg-ink font-semibold text-paper-3"
            >
              结束，学新词
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * 11.2 · 考完了：问一句再换计划。
 * 11.3 · 「备考下一场」先按新日期重新推荐一次（和引导同一个引擎），卡片上给出「X 词，每天 N 个 · 应用」；
 *        「先休息」真的休息：不排新词、复习只留维持量、不算断签。
 */
/** 11.3 / 11.4 · 按新的考试日期重新推荐（考完「备考下一场」和「休息够了」共用，和引导同一个引擎） */
function nextPlanOf(index: WordIndex, st: AppState, day: string, next: string) {
  const allLeft = newWordsLeft(index, { ...st, settings: { ...st.settings, book: "all" } }, day).length;
  const coreLeft = newWordsLeft(index, { ...st, settings: { ...st.settings, book: "core" } }, day).length;
  const rec = recommendPlan(day, next, { all: allLeft, core: coreLeft });
  const left = rec.book === "all" ? allLeft : coreLeft;
  const recDaily = left === 0 ? st.settings.daily : rec.plan.tooMany ? SPRINT_MAX : rec.plan.daily;
  const bookName = rec.book === "all" ? "全部词" : "核心词";
  const recLine =
    left === 0
      ? `${bookName}都学过了，考前专心复习`
      : rec.plan.tooMany
        ? `${bookName}每天 ${SPRINT_MAX} 个，考前能学 ${capReach(day, next, left)} / ${left} 个`
        : `${bookName}，每天 ${recDaily} 个，考前 ${rec.plan.spare} 天学完`;
  // 11.5 · 「保持现在的」：按现在的词书和每日新词什么时候学完；在考试之后就先说清楚
  const curLeft = st.settings.book === "all" ? allLeft : coreLeft;
  const keepFinish = curLeft > 0 ? finishDate(day, curLeft, st.settings.daily) : null;
  const keepLate = !!keepFinish && keepFinish > next;
  return { rec, left, recDaily, bookName, recLine, keepFinish, keepLate };
}

/** 11.5 · 计划这一步：保持现在的节奏要考后才学完时，先写明一句 */
function KeepNote({ daily, finish, late, testid }: { daily: number; finish: string | null; late: boolean; testid: string }) {
  if (!late || !finish) return null;
  return (
    <span className="mt-1 block text-xs" data-testid={testid}>
      保持每天 {daily} 个：<span className="whitespace-nowrap">{fmtDate(finish, true)}</span> 学完，在考试之后
    </span>
  );
}

/** 11.5 · 计划这一步的「返回」：回到上一步（系统返回键同样只回上一步，不退出 app） */
function StepBack({ onBack, testid }: { onBack: () => void; testid: string }) {
  return (
    <button type="button" data-testid={testid} onClick={onBack} aria-label="返回上一步" className="press -ml-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 hover:text-ink hover:bg-paper-2">
      <ChevronLeft className="size-5" />
    </button>
  );
}

function ExamOverCard({ advice, index, st, day, streak }: { advice: Extract<Advice, { kind: "exam-over" }>; index: WordIndex; st: AppState; day: string; streak: number }) {
  const [step, setStep] = useState<"ask" | "plan">("ask");
  const { rec, left, recDaily, bookName, recLine, keepFinish, keepLate } = nextPlanOf(index, st, day, advice.next);
  // 11.5 · 系统返回：先回到「考完了」这一步，不退出 app
  useBackClose(step === "plan", () => setStep("ask"));
  return (
    <section className="rounded-2xl border border-ink bg-paper-3 p-5" data-testid="exam-over" data-exam={advice.exam} data-step={step}>
      <div className="flex items-start gap-3">
        {step === "plan" ? (
          <StepBack onBack={() => setStep("ask")} testid="exam-plan-back" />
        ) : (
          <span className="grid size-8 shrink-0 place-items-center text-ink-2">
            <GraduationCap className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold leading-tight">{step === "ask" ? "四级考完了，辛苦了" : `备考 ${fmtDate(advice.next, true)}`}</div>
          <div className="mt-1 text-[0.8125rem] leading-snug text-ink-3" data-testid="exam-over-sub">
            {step === "ask" ? (
              <>
                {streak >= STREAK_WARN_MIN && (
                  <b className="mb-1 block text-sm text-ink" data-testid="exam-over-streak" data-n={streak}>
                    连续 {streak} 天备考，一天没落下
                  </b>
                )}
                {advice.custom ? `你设的考试日 ${fmtDate(advice.exam)} 已经过了。` : `${fmtDate(advice.exam)} 那场已经考完。`}考试那天不算断签。接下来怎么安排？
              </>
            ) : (
              <>
                还有 {daysUntil(day, advice.next)} 天。按新日期重新算了一下：<b className="text-ink" data-testid="exam-next-plan" data-book={rec.book} data-daily={recDaily}>{recLine}</b>
                <KeepNote daily={st.settings.daily} finish={keepFinish} late={keepLate} testid="exam-keep-note" />
              </>
            )}
          </div>
        </div>
      </div>
      {step === "ask" ? (
        <div className="mt-3 grid grid-cols-[1.4fr_1fr] gap-2">
          <button type="button" data-testid="exam-next" onClick={() => setStep("plan")} className="press h-11 rounded-lg bg-ink text-sm font-semibold text-paper-3 hover:bg-ink-2">
            备考下一场（{Number(advice.next.slice(5, 7))} 月）
          </button>
          <button
            type="button"
            data-testid="exam-rest"
            onClick={() => {
              ackExam(advice.exam, "rest", day);
              toast("先休息一下", { description: `不排新词，每天最多 ${PAUSE_CAP} 个维持复习，休息期间不算断签` });
            }}
            className="h-11 rounded-lg bg-paper-2 text-sm font-semibold"
          >
            先休息
          </button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-[1.4fr_1fr] gap-2">
          <button
            type="button"
            data-testid="exam-next-apply"
            onClick={() => {
              ackExam(advice.exam, "next", day, left === 0 ? undefined : { book: rec.book, daily: recDaily });
              toast.success(`改为备考 ${fmtDate(advice.next, true)}`, { description: left === 0 ? undefined : `${bookName}，每天 ${recDaily} 个` });
            }}
            className="press h-11 rounded-lg bg-ink text-sm font-semibold text-paper-3 hover:bg-ink-2"
          >
            应用这个计划
          </button>
          <button
            type="button"
            data-testid="exam-next-keep"
            onClick={() => {
              // 11.5 · 知情选了考后才学完的节奏：记 paceOk，7 天内不说「赶不上」
              ackExam(advice.exam, "next", day, undefined, keepLate);
              toast.success(`改为备考 ${fmtDate(advice.next, true)}`, { description: `保持每天 ${st.settings.daily} 个，可以在「我的」调整` });
            }}
            className="h-11 rounded-lg bg-paper-2 text-[0.8125rem] font-semibold"
          >
            保持现在的
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * 考试计划落后时的建议（11.2）：和新手引导同一个引擎（examAdvice）。
 * 每个按钮点下去状态一定会变；已经是上限时只给一张能关掉的信息卡。
 */
function SprintCard({ adv, exam, st, day, curFinish }: { adv: ExamAdvice; exam: string; st: AppState; day: string; curFinish: string }) {
  const daily = st.settings.daily;
  const bookName = st.settings.book === "core" ? "核心词" : "词";
  let title: string;
  let sub: string;
  let label: string | null = null;
  let target = 0;
  let apply: () => void = () => {};
  if (adv.kind === "switch") {
    target = adv.to;
    title = "改学核心词更来得及";
    sub = `全部词每天要 ${adv.need} 个才学得完。${adv.to < adv.target ? `核心词先每天 ${adv.to} 个，适应了再加到 ${adv.target} 个` : `核心词每天 ${adv.to} 个，${fmtDate(adv.finish)}学完`}`;
    label = `改学核心词（每天 ${adv.to} 个）`;
    apply = () => {
      setSettings({ book: "core", daily: adv.to });
      dismissSprint(day);
      toast.success(`改学核心词，每天 ${adv.to} 个`);
    };
  } else if (adv.kind === "raise") {
    target = adv.to;
    // 11.3 · 现在的量能在考前学完、只是复习时间少：不说「来不及」（和考试卡、引导同一个判定）
    const curSpare = diffDays(curFinish, exam);
    if (curSpare >= 0) {
      title = `每天 ${daily} 个能在考前 ${curSpare} 天学完`;
      sub =
        adv.to < adv.target
          ? `想多留时间复习：先加到 ${adv.to} 个，适应了再加到 ${adv.target} 个（考前留 ${adv.spare} 天）`
          : `改成 ${adv.to} 个，${fmtDate(adv.finish)}学完，能多留 ${Math.max(1, adv.spare - curSpare)} 天复习`;
    } else {
      title = `冲刺计划：每天 ${adv.target} 词`;
      sub =
        adv.to < adv.target
          ? `现在每天 ${daily} 个考前学不完 · 先加到 ${adv.to} 个，适应了再加到 ${adv.target} 个`
          : `现在每天 ${daily} 个考前学不完 · 改成 ${adv.to} 个，${fmtDate(adv.finish)}学完${adv.spare ? `，考前留 ${adv.spare} 天复习` : ""}`;
    }
    label = `改成每天 ${adv.to} 个`;
    apply = () => {
      setSettings({ daily: adv.to });
      dismissSprint(day);
      toast.success(`每日新词改为 ${adv.to}`);
    };
  } else if (adv.canRaise !== null) {
    const to = adv.canRaise;
    target = to;
    title = `${adv.daysLeft} 天学不完剩下的 ${adv.left} 个${bookName}`;
    sub = `每天 100 个，考前能先拿下其中 ${adv.reach} 个。现在每天 ${daily} 个，先加到 ${to} 个？`;
    label = `改成每天 ${to} 个`;
    apply = () => {
      setSettings({ daily: to });
      dismissSprint(day);
      toast.success(`每日新词改为 ${to}`);
    };
  } else {
    target = daily;
    title = `每天 ${daily} 个，考前能学完 ${adv.reach} 个${bookName}`;
    sub = `剩下的 ${adv.left - adv.reach} 个考前来不及，先把能学的记牢。`;
  }
  return (
    <section className="rounded-xl ring-1 ring-rule ring-inset bg-paper-3 p-4" data-testid="sprint" data-kind={adv.kind === "cap" && adv.canRaise === null ? "cap-info" : adv.kind} data-too={adv.kind === "cap" ? 1 : 0}>
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center text-ink-2">
          <Target className="size-5" />
        </span>
        <div className="min-w-0 flex-1 leading-snug">
          <div className="text-[0.9375rem] font-semibold" data-testid="sprint-daily" data-daily={target}>
            {title}
          </div>
          <div className="mt-0.5 text-xs text-ink-3" data-testid="sprint-sub">
            {sub}
          </div>
        </div>
        <button
          type="button"
          aria-label="知道了"
          data-testid="sprint-dismiss"
          onClick={() => dismissSprint(day, adv.kind === "cap" && adv.canRaise === null ? exam : undefined, addDays(day, SPRINT_SNOOZE_DAYS))}
          className="press -mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 hover:text-ink hover:bg-paper-2"
        >
          <X className="size-4" />
        </button>
      </div>
      {label && (
        <button
          type="button"
          data-testid="sprint-apply"
          data-core={adv.kind === "switch" ? 1 : 0}
          onClick={apply}
          className="press mt-3 flex h-11 w-full items-center justify-center rounded-lg bg-ink text-sm font-semibold text-paper-3 hover:bg-ink-2"
        >
          {label}
        </button>
      )}
    </section>
  );
}

/** 考试倒计时 + 词书进度（11.1 · 和原来的词书卡合并）；落后时的建议在上面的建议卡里 */
function ExamCard({
  day,
  exam,
  official,
  custom,
  plan,
  adv,
  daily,
  coreLeft,
  sum,
  book,
  paused,
  index,
  st,
  quiet,
}: {
  day: string;
  exam: string;
  official: boolean;
  custom: boolean;
  plan: SprintPlan;
  adv: ExamAdvice | null;
  daily: number;
  coreLeft: number;
  sum: ReturnType<typeof summarize>;
  book: string;
  paused: boolean;
  index: WordIndex;
  st: AppState;
  /** 11.4 · 学完日期晚于考试时：pace = 用户知情选的节奏（不说「赶不上」）；sprint = 下面的冲刺卡已经在说这件事 */
  quiet: "pace" | "sprint" | null;
}) {
  if (paused) return <PauseCard day={day} exam={exam} index={index} st={st} resting={sum.paused} />;
  const onTrack = plan.newLeft === 0 || (!plan.tooMany && daily >= plan.daily);
  // 11.2 · 学不完时：诚实的冲刺目标（不报「赶不上考试」的学完日期）
  const capped = !sum.examMode && plan.newLeft > 0 && plan.tooMany;
  // 11.6 · 和统计页同一个函数（examForecast），同一个状态下两个数一样
  const reach = capped ? examForecast(day, exam, plan.newLeft, daily, sum.examMode, sum.remainingGoal).reach : 0;
  void adv;
  const wd = WEEK[new Date(exam + "T12:00:00").getDay()];
  const spare = sum.newLeft ? Math.max(0, diffDays(sum.finish, exam)) : plan.daysLeft;
  return (
    <section className="rounded-xl ring-1 ring-rule ring-inset bg-paper-3 p-4" data-testid="exam-card" data-days={plan.daysLeft}>
      <div className="flex items-center gap-3.5">
        <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-foreground px-3 py-2 text-background" data-testid="exam-days">
          <span className="tnum font-display text-[1.625rem] font-semibold leading-none">{plan.daysLeft}</span>
          <span className="mt-0.5 text-[0.6875rem] font-semibold opacity-75">天</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[0.9375rem] font-semibold">
            <GraduationCap className="size-4 text-ink" />
            {plan.daysLeft === 0 ? "今天就是四级考试，加油！" : plan.daysLeft === 1 ? "明天就考四级了" : "距四级考试"}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3" data-testid="exam-date">
            {/* 11.5 · 窄屏只在日期和「周X」之间换行，「周六」两个字不拆开 */}
            <span className="whitespace-nowrap" data-testid="exam-date-day">{fmtDate(exam, true)}</span>
            <span className="whitespace-nowrap" data-testid="exam-date-wd">{wd}</span>
            <span className={cn("rounded px-1 text-[0.625rem] font-semibold", official ? "bg-know-soft text-know" : "bg-paper-2")}>{custom ? "自定" : official ? "官方" : "预估"}</span>
            {/* 11.5 · 「来得及」放进日期这一行（窄屏 / 大字号时整体换行，不再把标题和日期挤断） */}
            {onTrack && plan.newLeft > 0 && (
              <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs font-semibold text-know" data-testid="sprint-ok">
                <Check className="size-3.5" strokeWidth={3} /> 来得及
              </span>
            )}
          </div>
        </div>
        <Link to="/me" aria-label="调整计划" className="press grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 hover:text-ink hover:bg-paper-2">
          <ChevronRight className="size-5" />
        </Link>
      </div>
      <div className="mt-3" data-testid="plan-card">
        <div className="flex items-baseline justify-between text-xs text-ink-3">
          <span className="flex items-center gap-1">
            <BookMarked className="size-3.5 text-ink" />
            {book === "all" ? "全部词汇" : "核心词汇"} · 已学 <b className="tnum text-sm text-ink">{sum.started}</b> / {sum.bookTotal}
          </span>
          <span>每天 {daily} 词</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-[2px] bg-rule">
          <div className="h-full rounded-[2px] bg-ink" style={{ width: `${(sum.started / Math.max(1, sum.bookTotal)) * 100}%` }} />
        </div>
        <p className="mt-2 text-xs text-ink-3" data-testid="finish-date" data-spare={spare} data-mode={sum.examMode ? "exam" : capped ? "cap" : sum.finish > exam && quiet ? quiet : "plan"}>
          {sum.examMode
            ? "考前模式：只复习学过的词，不再排新词"
            : sum.newLeft === 0
            ? "整本词书已经学完 🎉 考前专心复习"
            : capped
              ? `冲刺：考前还能学 ${reach} 个，剩 ${plan.newLeft - reach} 个来不及`
              : sum.finish > exam
              ? quiet
                ? `${quiet === "pace" ? "按你选的节奏，" : ""}每天 ${daily} 个，${fmtDate(sum.finish, true)} 学完`
                : `按现在的节奏 ${fmtDate(sum.finish, true)} 学完，赶不上考试`
              : `按计划 ${fmtDate(sum.finish, true)} 学完 · 考前 ${spare} 天`}
        </p>
      </div>
      {coreLeft > 0 && (
        <Link to="/words" search={{ tab: "core" }} data-testid="core-entry" className="mt-1 flex items-center gap-2 rounded-2xl px-1 pt-1 text-xs text-ink-3 hover:text-ink">
          <span className="size-1.5 rounded-full bg-ink" />
          核心词还有 <b className="tnum text-ink">{coreLeft}</b> 个没掌握
          <ChevronRight className="ml-auto size-4" />
        </Link>
      )}
    </section>
  );
}

/**
 * 11.3 · 休息中的考试卡。
 * 11.4 · 「休息够了，开始备考下一场」和考完的「备考下一场」走同一个流程：先按新日期给出推荐（应用 / 保持现在的），再结束休息。
 */
function PauseCard({ day, exam, index, st, resting }: { day: string; exam: string; index: WordIndex; st: AppState; resting: boolean }) {
  const [step, setStep] = useState<"ask" | "plan">("ask");
  const { left, recDaily, rec, bookName, recLine, keepFinish, keepLate } = nextPlanOf(index, st, day, exam);
  // 11.5 · 系统返回：先回到休息这一步
  useBackClose(step === "plan", () => setStep("ask"));
  return (
    <section className="rounded-xl ring-1 ring-rule ring-inset bg-paper-3 p-4" data-testid="exam-card" data-paused="1" data-step={step}>
      <div className="flex items-start gap-3">
        {step === "plan" ? <StepBack onBack={() => setStep("ask")} testid="pause-plan-back" /> : <Coffee className="mt-0.5 size-5 shrink-0 text-ink-3" />}
        <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-ink-3" data-testid="pause-sub">
          {step === "plan" ? (
            <>
              备考 {fmtDate(exam, true)}，还有 {daysUntil(day, exam)} 天。按新日期重新算了一下：<b className="text-ink" data-testid="pause-next-plan" data-book={rec.book} data-daily={recDaily}>{recLine}</b>
              <KeepNote daily={st.settings.daily} finish={keepFinish} late={keepLate} testid="pause-keep-note" />
            </>
          ) : resting ? (
            `休息中：不排新词，每天最多 ${PAUSE_CAP} 个维持复习，不算断签`
          ) : (
            "考试计划已暂停 · 想备考时选一场考试"
          )}
        </span>
      </div>
      {step === "ask" ? (
        <button type="button" data-testid="pause-end" onClick={() => setStep("plan")} className="mt-3 flex h-11 w-full items-center justify-center rounded-lg bg-paper-2 text-sm font-semibold">
          休息够了，开始备考下一场
        </button>
      ) : (
        <div className="mt-3 grid grid-cols-[1.4fr_1fr] gap-2">
          <button
            type="button"
            data-testid="pause-plan-apply"
            onClick={() => resumeFromPause(day, left === 0 ? undefined : { book: rec.book, daily: recDaily }, bookName)}
            className="press h-11 rounded-lg bg-ink text-sm font-semibold text-paper-3 hover:bg-ink-2"
          >
            应用这个计划
          </button>
          <button type="button" data-testid="pause-plan-keep" onClick={() => resumeFromPause(day, undefined, undefined, keepLate)} className="h-11 rounded-lg bg-paper-2 text-[0.8125rem] font-semibold">
            保持现在的
          </button>
        </div>
      )}
    </section>
  );
}

/** 11.3 · 结束休息：攒下的复习从今天起摊开（每天额度以内），不弹「积压 N 个」；11.4 · plan = 应用新推荐的词书和每日新词 */
function resumeFromPause(day: string, plan?: { book: AppState["settings"]["book"]; daily: number }, bookName?: string, paceOk?: boolean) {
  if (plan) setSettings({ book: plan.book, daily: plan.daily });
  // 11.5 · 知情保持考后才学完的节奏：7 天内不说「赶不上」
  if (paceOk) markPaceOk(day);
  const s0 = getState();
  const per = recoverPerDay(s0.settings.reviewCap ?? 0);
  const backlog = dueWords(s0.cards, day).length;
  if (backlog > per) {
    const r = recoveryPlan(s0.cards, day, per);
    endPause(day, { cards: r.cards, until: r.until, n: r.days, perDay: per });
    toast.success("欢迎回来，开始备考下一场", { description: `${plan ? `${bookName}，每天 ${plan.daily} 个。` : ""}休息期间攒了 ${backlog} 个复习，分 ${r.days} 天清完，每天 ${per} 个以内` });
  } else {
    endPause(day);
    toast.success("欢迎回来，开始备考下一场", plan ? { description: `${bookName}，每天 ${plan.daily} 个` } : undefined);
  }
}

/** 周一的上周周报：与前一周对比 */
function WeekCard({ day, logs }: { day: string; logs: Record<string, import("@/lib/srs").DayLog> }) {
  const w = weekReport(logs, day);
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
  const min = (ms: number) => Math.round(ms / 60000);
  const items: { label: string; value: string; delta: number | null; unit: string; testid: string }[] = [
    { label: "新学", value: String(w.last.n), delta: w.delta.n, unit: "", testid: "wk-new" },
    { label: "复习", value: String(w.last.r), delta: w.delta.r, unit: "", testid: "wk-review" },
    { label: "正确率", value: w.last.acc === null ? "—" : `${w.last.acc}%`, delta: w.delta.acc, unit: "个点", testid: "wk-acc" },
    { label: "用时", value: min(w.last.ms) < 60 ? `${min(w.last.ms)}分` : `${Math.floor(min(w.last.ms) / 60)}时${min(w.last.ms) % 60}分`, delta: min(w.last.ms) - min(w.prev.ms), unit: "分", testid: "wk-time" },
  ];
  const hasPrev = w.prev.n + w.prev.r > 0;
  return (
    <section className="rounded-xl ring-1 ring-rule ring-inset bg-paper-3 p-4" data-testid="week-report">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.9375rem] font-semibold">上周周报</div>
          <div className="mt-0.5 text-xs text-ink-3" data-testid="wk-range">
            {md(w.last.start)}–{md(w.last.end)} · 学了 {w.last.days}/7 天{hasPrev ? " · 对比前一周" : ""}
          </div>
        </div>
        <button type="button" aria-label="关闭周报" data-testid="week-close" onClick={() => dismissWeekReport(day)} className="press -mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 hover:text-ink hover:bg-paper-2">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {items.map((it) => (
          <div key={it.label} className="min-w-0 rounded-2xl bg-paper-2 px-1 py-2.5 text-center" data-testid={it.testid} data-value={it.value} data-delta={it.delta ?? ""}>
            <div className="tnum truncate text-[1.0625rem] font-semibold leading-tight">{it.value}</div>
            <div className="mt-0.5 text-[0.6875rem] text-ink-3">{it.label}</div>
            {hasPrev && it.delta !== null && (
              <div className={cn("tnum mt-1 text-[0.6875rem] font-semibold", it.delta > 0 ? "text-know" : it.delta < 0 ? "text-forget" : "text-ink-3")}>
                {it.delta > 0 ? "↑" : it.delta < 0 ? "↓" : "持平"}
                {it.delta !== 0 ? `${Math.abs(it.delta)}${it.unit}` : ""}
              </div>
            )}
          </div>
        ))}
      </div>
      <Link to="/stats" search={{ tab: "review" }} className="mt-3 flex items-center justify-center gap-0.5 text-xs font-semibold text-ink" data-testid="week-more">
        看复盘 <ChevronRight className="size-3.5" />
      </Link>
    </section>
  );
}

/** 断签提醒：21 点后、今天的任务还没完成、真有连续天数可断。11.2 · 并进主卡顶部，动作就是主卡的按钮 */
function LateStrip({ sum, streak }: { sum: ReturnType<typeof summarize>; streak: number }) {
  const [left, setLeft] = useState(() => minutesToMidnight(new Date(now())));
  useEffect(() => {
    const id = window.setInterval(() => setLeft(minutesToMidnight(new Date(now()))), 30000);
    return () => window.clearInterval(id);
  }, []);
  const h = Math.floor(left / 60);
  const m = left % 60;
  const todo: string[] = [];
  if (sum.timeMode) {
    const need = Math.max(0, sum.goalMin - Math.floor(sum.ms / 60000));
    if (need > 0) todo.push(`还差 ${need} 分钟`);
  } else {
    if (sum.learned < sum.goal && sum.newLeft > 0) todo.push(`新词还差 ${sum.goal - sum.learned}`);
    if (sum.due > 0) todo.push(`复习还差 ${sum.due}`);
  }
  return (
    <div className="late-pulse late-banner -mx-5 -mt-4 mb-4 flex items-center gap-3 px-5 py-3" data-testid="late-warning" role="alert">
      <AlarmClock className="size-5 shrink-0" />
      <div className="min-w-0 flex-1 leading-snug">
        <div className="text-[0.9375rem] font-semibold">连续 {streak} 天要断了</div>
        <div className="text-[0.75rem] opacity-90" data-testid="late-sub">
          离今天结束还有 <b className="tnum font-semibold">{h > 0 ? `${h} 小时 ` : ""}{m} 分</b>
          {todo.length ? ` · ${todo.join(" · ")}` : ""}
        </div>
      </div>
    </div>
  );
}

/** v8 · 安装引导：浏览器允许安装（beforeinstallprompt）时出现；装过不再出现，关掉 14 天内不出现 */
function InstallCard({ day, installed, snooze }: { day: string; installed?: boolean; snooze?: string }) {
  const canPrompt = useInstallPrompt();
  if (!installVisible({ canPrompt, standalone: isStandalone(), installed, snoozeUntil: snooze, today: day })) return null;
  return (
    <section className="border-t border-rule pt-5" data-testid="install-card">
      <div className="flex items-start gap-3.5">
        <Logo className="size-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[0.9375rem] font-semibold leading-tight">添加到桌面</div>
          <div className="mt-1 text-[0.8125rem] leading-relaxed text-ink-3" data-testid="install-warn">从桌面图标全屏打开，没网也能背。记录只存在这台手机上，删掉图标会连记录一起删，记得定期导出备份</div>
        </div>
        <button
          type="button"
          aria-label="暂不添加"
          data-testid="install-dismiss"
          onClick={() => snoozeInstall(addDays(day, INSTALL_SNOOZE_DAYS))}
          className="press -mr-2 -mt-2 grid size-10 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-paper-2 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
      <button
        type="button"
        data-testid="install-go"
        onClick={async () => {
          const r = await promptInstall();
          if (r === "accepted") toast.success("已添加到桌面", { description: "删掉图标会连记录一起删，记得在「我的 → 数据与备份」定期导出", duration: 4000 });
          else if (r === "dismissed") snoozeInstall(addDays(day, INSTALL_SNOOZE_DAYS));
        }}
        className="press mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink text-[0.9375rem] font-semibold text-paper-3"
      >
        安装到手机桌面
      </button>
    </section>
  );
}

/** 12.0 · 练习入口：一行字，像目录里的一条——不再是彩色图标方块 */
function SnackTile({ to, search, testid, icon, title, sub, dim }: { to: "/tape" | "/study" | "/match" | "/judge" | "/quiz"; search?: { mode: "speed" }; testid: string; icon: React.ReactNode; tone?: string; title: string; sub: React.ReactNode; dim?: boolean }) {
  return (
    <Link
      to={to}
      search={search as never}
      data-testid={testid}
      className={cn("press group flex min-h-14 min-w-0 items-center gap-3 border-b border-rule py-3 last:border-b-0 hover:bg-paper-2/60", dim && "opacity-60")}
    >
      <span className="grid size-8 shrink-0 place-items-center text-ink-2 [&_svg]:size-[20px]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-medium leading-tight">{title}</span>
        <span className="mt-0.5 block truncate text-[0.8125rem] text-ink-3">{sub}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-ink-3 transition-transform duration-300 ease-[var(--ease-spring)] group-hover:translate-x-0.5" />
    </Link>
  );
}

/** 12.0 · 提醒：左边一条 3px 的竖线标出语气，不用彩色图标底 */
function Notice({ icon, tone, title, sub, action, testid }: { icon: React.ReactNode; tone: string; title: string; sub: string; action: React.ReactNode; testid?: string }) {
  const bar = /forget/.test(tone) ? "bg-forget" : /know/.test(tone) ? "bg-know" : /vague/.test(tone) ? "bg-vague" : "bg-mark";
  return (
    <div className="relative flex items-center gap-3 rounded-xl bg-paper-3 py-3.5 pl-4 pr-3.5 ring-1 ring-rule ring-inset" data-testid={testid}>
      <span className={cn("absolute inset-y-3 left-0 w-[3px] rounded-r-[2px]", bar)} aria-hidden />
      <span className="grid size-8 shrink-0 place-items-center text-ink-2 [&_svg]:size-5">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[0.9375rem] font-semibold leading-tight">{title}</div>
        <div className="mt-1 text-[0.8125rem] leading-snug text-ink-3">{sub}</div>
      </div>
      {action}
    </div>
  );
}

/** 12.0 · 今日待办：方框打勾，完成的划上荧光笔 */
function Todo({ done, label, muted }: { done: boolean; label: string; muted?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 py-1.5 text-[0.875rem]", done ? "text-ink" : muted ? "text-ink-3" : "text-ink-2")} data-done={done ? 1 : 0}>
      <span
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-[4px]",
          done ? "bg-ink text-paper-3" : muted ? "border border-dashed border-rule-strong" : "border-[1.5px] border-ink-3",
        )}
      >
        {done && <Check className="size-3" strokeWidth={2.6} />}
      </span>
      <span className={cn(done && "hl")}>{label}</span>
    </div>
  );
}
