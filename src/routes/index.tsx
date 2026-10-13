import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlarmClock,
  BookMarked,
  CalendarCheck,
  Check,
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
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Ring, WeekStrip } from "@/components/app/charts";
import { Logo, Panel, PanelTitle, Spinner } from "@/components/app/shell";
import { isStandalone, promptInstall, useInstallPrompt } from "@/lib/install";
import { INSTALL_SNOOZE_DAYS, installVisible } from "@/lib/ux";
import { ShareSheet } from "@/components/app/share-sheet";
import { WordSheet } from "@/components/app/word-bits";
import { speak } from "@/lib/audio";
import { now, today } from "@/lib/clock";
import { getWordsSync, shortMeaning, useWords, type WordIndex } from "@/lib/data";
import { newWordsLeft, notebookWords, summarize, wordOfDay } from "@/lib/plan";
import { addDays, diffDays } from "@/lib/srs";
import {
  checkIn,
  dismissNewCut,
  dismissRecover,
  dismissWeekReport,
  endRecover,
  getState,
  patchYesterday,
  setNewCut,
  setSettings,
  snoozeBackup,
  snoozeInstall,
  startRecover,
  useApp,
  type AppState,
} from "@/lib/store";
import { MAKEUP_EVERY, MAKEUP_MAX, WEEKDAY_CN, canPatch, curStreak, isRestDay, lateWarning, minutesToMidnight, patchedStreak, restOf } from "@/lib/habit";
import { celebrate } from "@/lib/celebrate";
import { coreUnmastered, effectiveExam, quizDoneOn, sprintPlan, upcomingExams, type SprintPlan } from "@/lib/exam";
import { QUIZ_MIN_LEARNED, homeAdvice, lastActive, recoverPerDay, recoveryPlan, type Advice } from "@/lib/coach";
import { NEW_CARD_SEC, REVIEW_CARD_SEC } from "@/lib/ux";
import { backupDue } from "@/lib/persist";
import { useShareInfo } from "@/lib/use-share";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { showWeekReport, weekReport } from "@/lib/stats";

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
  const [justChecked, setJustChecked] = useState(false);
  const checking = useRef(false);
  const info = useShareInfo(index);
  const canPrompt = useInstallPrompt();
  if (error) return <div className="p-8 text-center text-sm text-muted-foreground">{error}</div>;
  if (!index) return <Spinner />;

  const day = today();
  const sum = summarize(index, st, day);
  const s = curStreak(st, day);
  const rest = restOf(st);
  const restToday = isRestDay(day, rest);
  const late = lateWarning(new Date(now()).getHours(), sum.checked, restToday);
  const patchable = canPatch(st, day);
  const timePct = Math.min(1, sum.ms / (sum.goalMin * 60000));
  const minutes = Math.floor(sum.ms / 60000);
  const wod = wordOfDay(index, day);
  const pct = sum.timeMode ? Math.min(1, sum.ms / (sum.goalMin * 60000)) : sum.goal ? Math.min(1, sum.learned / sum.goal) : sum.due === 0 ? 1 : 0;
  const learnLabel = sum.newLeft === 0 ? "词书已学完" : sum.recovering ? "新词暂停中" : sum.learned === 0 ? "开始学习" : sum.remainingGoal > 0 ? "学下一组" : "再学一组";
  const exam = effectiveExam(day, st.settings.examDate);
  const official = upcomingExams(day, 3).find((e) => e.day === exam.day)?.official ?? false;
  const plan = sprintPlan(day, exam.day, sum.newLeft);
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
    last: lastActive(st.log, st.checkins, day),
    recover: st.recover,
    recoverSeen: st.recoverSeen,
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
  const reviewFirst = sum.due > 0 && (sum.learned > 0 || sum.recovering || sum.newLeft === 0 || sum.due >= 10);
  const etaMin = Math.max(1, Math.round((sum.remainingGoal * NEW_CARD_SEC + sum.due * REVIEW_CARD_SEC) / 60));

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

      {/* 11.1 · 断签预警只在真有连续天数可断时出现；欢迎回来 / 恢复期间不出现（和恢复计划打架） */}
      {late && s > 0 && advice?.kind !== "recover-offer" && advice?.kind !== "recovering" && <LateBanner sum={sum} streak={s} onCheckIn={doCheckIn} />}

      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr] md:gap-5">
        <div className="min-w-0 space-y-4 md:space-y-5">
          {/* 主卡片：现在该干嘛 */}
          <section className="hero-gradient relative overflow-hidden rounded-[32px] p-6 text-white shadow-[0_24px_60px_-28px_rgba(200,60,30,0.65)]" data-testid="hero">
            <div className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-white/[0.07]" />
            <div className="relative flex items-center justify-between gap-4">
              <div className="min-w-0">
                {sum.timeMode ? (
                  <>
                    <div className="text-[13px] font-semibold text-white/80">今日学习</div>
                    <div className="mt-1 flex items-baseline gap-1.5" data-testid="hero-time" data-min={minutes}>
                      <span className="tnum font-display text-[52px] font-extrabold leading-none tracking-tight">{minutes}</span>
                      <span className="tnum text-[20px] font-bold text-white/75">/ {sum.goalMin} 分钟</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[13px] font-semibold text-white/80">{sum.recovering ? "恢复期 · 先清积压" : "今日新词"}</div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="tnum font-display text-[52px] font-extrabold leading-none tracking-tight" data-testid="learned">
                        {sum.learned}
                      </span>
                      <span className="tnum text-[20px] font-bold text-white/75">/ {sum.goal}</span>
                    </div>
                  </>
                )}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-white/85">
                  {sum.timeMode && <span data-testid="learned">新词 {sum.learned}</span>}
                  <span data-testid="due-count">待复习 {sum.due}</span>
                  <span>已复习 {sum.reviewed}</span>
                  {sum.deferred > 0 && (
                    <span className="rounded-full bg-white/18 px-2 text-[12px] font-semibold" data-testid="deferred">
                      已达上限 · 顺延 {sum.deferred}
                    </span>
                  )}
                </div>
              </div>
              <Ring value={pct} size={96} stroke={10} className="shrink-0 text-white" track="rgba(255,255,255,0.22)">
                <span className="text-[13px] font-bold">{Math.round(pct * 100)}%</span>
              </Ring>
            </div>
            <div className="relative mt-5 grid grid-cols-[1.4fr_1fr] gap-2.5" data-testid="hero-actions" data-next={reviewFirst ? "review" : "new"}>
              <Link
                to="/study"
                search={{ mode: reviewFirst ? "review" : "new" }}
                disabled={!reviewFirst && sum.newLeft === 0}
                data-testid={reviewFirst ? "start-review" : "start-learn"}
                className={cn(
                  "flex h-13 items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-[16px] font-bold text-[oklch(0.5_0.19_30)] shadow-lg transition active:scale-[0.98]",
                  !reviewFirst && sum.newLeft === 0 && "pointer-events-none opacity-60",
                )}
              >
                {reviewFirst ? <Repeat2 className="size-4" /> : <Play className="size-4 fill-current" />}
                {reviewFirst ? `复习 ${sum.due}` : learnLabel}
              </Link>
              <Link
                to="/study"
                search={{ mode: reviewFirst ? "new" : "review" }}
                disabled={reviewFirst && sum.newLeft === 0}
                data-testid={reviewFirst ? "start-learn" : "start-review"}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-2xl bg-white/16 py-3.5 text-[15px] font-bold text-white ring-1 ring-white/25 backdrop-blur transition active:scale-[0.98]",
                  (reviewFirst ? sum.newLeft === 0 : sum.due === 0) && "opacity-70",
                  reviewFirst && sum.newLeft === 0 && "pointer-events-none",
                )}
              >
                {reviewFirst ? <Play className="size-4 fill-current" /> : <Repeat2 className="size-4" />}
                {reviewFirst ? learnLabel : `复习 ${sum.due}`}
              </Link>
            </div>
            <p className="relative mt-3 text-center text-[12.5px] font-medium text-white/85" data-testid="hero-now">
              {sum.checked
                ? "今天已打卡 ✓ 想多学可以再来一组"
                : sum.ready
                  ? "今天的任务完成了，去下面打卡"
                  : sum.timeMode
                    ? `还差 ${Math.max(0, sum.goalMin - minutes)} 分钟就能打卡`
                    : `还剩${sum.due ? ` 复习 ${sum.due}` : ""}${sum.remainingGoal && sum.newLeft ? ` · 新词 ${Math.min(sum.remainingGoal, sum.newLeft)}` : ""} · 约 ${etaMin} 分钟`}
            </p>
          </section>

          {advice && (
            <AdviceCard
              advice={advice}
              day={day}
              st={st}
              index={index}
              onPatch={doPatch}
              patchedStreak={patchable ? patchedStreak(st, day) : 0}
              logs={st.log}
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
            <WeekStrip checkins={st.checkins} logs={st.log} today={day} rest={rest} patched={st.patched} />
            {restToday && !sum.checked && (
              <div className="mt-3 flex items-center gap-2 rounded-2xl bg-know-soft px-3 py-2.5 text-[13px] font-medium text-know" data-testid="rest-today">
                <Coffee className="size-4 shrink-0" /> 今天是休息日，不打卡也不断连续；学了照样可以打卡
              </div>
            )}
            <div className="mt-4">
              {sum.checked ? (
                <div className={cn("flex items-center gap-3 rounded-2xl bg-brand-soft p-3.5", justChecked && "checkin-burst")} data-testid="checked-in">
                  <div className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground", justChecked && "pop")}>
                    <Check className="size-5" strokeWidth={3} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold">{justChecked ? "打卡成功 🎉" : "今日已打卡"}</div>
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
              ) : sum.timeMode ? (
                <div className="text-[13px]" data-testid="checkin-todo" data-mode="time">
                  <div className="flex items-center gap-3 rounded-2xl bg-secondary px-3 py-3">
                    <AlarmClock className="size-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between font-semibold">
                        <span>学满 {sum.goalMin} 分钟就能打卡</span>
                        <span className="tnum text-muted-foreground">
                          {minutes}/{sum.goalMin}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background/70">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${timePct * 100}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 text-[13px]" data-testid="checkin-todo" data-mode="words">
                  <Todo done={sum.learned >= sum.goal || sum.newLeft === 0} label={sum.recovering ? "新词暂停" : `新词 ${sum.learned}/${sum.goal}`} />
                  <Todo done={sum.due === 0} label={sum.due === 0 ? "复习已清零" : `还需复习 ${sum.due}`} />
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3 text-[12px] text-muted-foreground" data-testid="habit-row">
              <span className="flex items-center gap-1 rounded-full bg-vague-soft px-2.5 py-1 font-bold text-vague" data-testid="makeup-count" data-n={st.makeup ?? 0}>
                <Ticket className="size-3.5" /> 补卡 {st.makeup ?? 0}/{MAKEUP_MAX}
              </span>
              <span className="min-w-0 flex-1 truncate">
                每连续 {MAKEUP_EVERY} 天得 1 张{rest >= 0 ? ` · 周${WEEKDAY_CN[rest]}休息` : ""}
              </span>
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4 md:space-y-5">
          <ExamCard day={day} exam={exam.day} official={official} custom={exam.custom} plan={plan} daily={st.settings.daily} coreLeft={coreLeft} sum={sum} book={st.settings.book} />

          {/* 更多练习：碎片时间、小游戏、今日一词（11.1 · 从首页主体收进来） */}
          <section data-testid="more-practice">
            <h2 className="mb-2 px-1 text-[13px] font-bold text-muted-foreground">更多练习</h2>
            <div className="grid grid-cols-2 gap-2" data-testid="snack">
              <SnackTile to="/tape" testid="tape-entry" icon={<Headphones className="size-[18px]" />} tone="bg-brand-soft text-primary" title="磁带模式" sub="通勤免手听" />
              <SnackTile
                to="/study"
                search={{ mode: "speed" }}
                testid="speed-entry"
                dim={sum.due === 0}
                icon={<Zap className="size-[18px]" />}
                tone="bg-know-soft text-know"
                title="速刷"
                sub={<span data-testid="speed-sub">{sum.due > 0 ? `左右滑清 ${sum.due} 词` : "暂无到期复习"}</span>}
              />
              <SnackTile to="/match" testid="match-entry" icon={<Puzzle className="size-[18px]" />} tone="bg-vague-soft text-vague" title="配对消消乐" sub={st.gameBest?.match ? `最高 ${st.gameBest.match} 分` : "60 秒连连看"} />
              <SnackTile to="/judge" testid="judge-entry" icon={<Scale className="size-[18px]" />} tone="bg-forget-soft text-forget" title="判断对错" sub={st.gameBest?.judge ? `最高 ${st.gameBest.judge} 分` : "滑一下判对错"} />
              {quizOpen && advice?.kind !== "quiz" && (
                <SnackTile to="/quiz" testid="quiz-entry" icon={<ClipboardCheck className="size-[18px]" />} tone="bg-brand-soft text-primary" title="今日小测" sub="20 题 · 限时 5 分钟" />
              )}
              <button
                type="button"
                onClick={() => setSheet(true)}
                data-testid="wod"
                className={cn("flex min-w-0 items-center gap-2.5 rounded-2xl border border-border/70 bg-card p-3 text-left transition hover:border-primary/40", !(quizOpen && advice?.kind !== "quiz") && "col-span-2")}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-[11px] font-bold text-muted-foreground">一词</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[15px] font-extrabold leading-tight">{wod.w}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{shortMeaning(wod, 1)}</span>
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="播放发音"
                  onClick={(e) => {
                    e.stopPropagation();
                    speak(wod.w, st.settings.accent);
                  }}
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-primary"
                >
                  <Volume2 className="size-4" />
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>

      <ShareSheet open={share} onOpenChange={setShare} info={info} />
      <WordSheet word={wod} open={sheet} onOpenChange={setSheet} />
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
        <section className="rounded-3xl border border-primary/30 bg-card p-4" data-testid="welcome-back" data-backlog={advice.backlog} data-days={advice.days}>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-extrabold leading-tight">欢迎回来！</div>
              <div className="mt-1 text-[13px] leading-snug text-muted-foreground" data-testid="welcome-back-sub">
                {advice.gap} 天没见，积压了 {advice.backlog} 个复习。分 {advice.days} 天清完，每天 {advice.perDay} 个以内，这几天新词暂停。
              </div>
            </div>
            <button type="button" aria-label="不用了" data-testid="recover-dismiss" onClick={() => dismissRecover(day)} className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
              <X className="size-4" />
            </button>
          </div>
          <button
            type="button"
            data-testid="recover-apply"
            onClick={() => {
              const s0 = getState();
              const r = recoveryPlan(s0.cards, day, recoverPerDay(s0.settings.reviewCap ?? 0));
              startRecover(r.cards, day, r.until, r.days);
              toast.success(`恢复计划开始：${r.days} 天清完积压`, { description: `今天先复习 ${Math.min(advice.perDay, advice.backlog)} 个` });
            }}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[14px] font-bold text-primary-foreground shadow-md shadow-primary/20 transition active:scale-[0.98]"
          >
            一键恢复：{advice.days} 天清完积压
          </button>
        </section>
      );
    case "recovering":
      return (
        <Notice
          testid="recovering"
          icon={<Sparkles className="size-5" />}
          tone="bg-brand-soft text-primary"
          title={`恢复计划 · 第 ${Math.min(advice.day, advice.days)}/${advice.days} 天`}
          sub={advice.due ? `今天清 ${advice.due} 个积压，新词暂停` : "今天的积压清完了，新词暂停"}
          action={
            <button type="button" data-testid="recover-end" onClick={() => endRecover()} className="shrink-0 rounded-full bg-secondary px-3.5 py-2 text-[13px] font-bold">
              恢复新词
            </button>
          }
        />
      );
    case "makeup":
      return (
        <Notice
          testid="makeup-notice"
          icon={<Ticket className="size-5" />}
          tone="bg-vague-soft text-vague"
          title="昨天漏打卡了"
          sub={`用 1 张补卡补上 → 连续 ${patchedStreak} 天 · 还有 ${st.makeup} 张`}
          action={
            <button type="button" data-testid="makeup-use" onClick={onPatch} className="shrink-0 rounded-full bg-vague px-3.5 py-2 text-[13px] font-bold text-white dark:text-[oklch(0.2_0.03_80)]">
              补卡
            </button>
          }
        />
      );
    case "sprint":
      return <SprintCard plan={advice.plan} st={st} index={index} day={day} />;
    case "adaptive-cut":
      return (
        <Notice
          testid="adaptive-cut"
          icon={<Scale className="size-5" />}
          tone="bg-know-soft text-know"
          title={`今天新词已减到 ${advice.cut} 个`}
          sub={`先清复习 · 明天恢复每天 ${daily} 个`}
          action={
            <button type="button" data-testid="adaptive-restore" onClick={() => setNewCut(day, null)} className="shrink-0 rounded-full bg-secondary px-3.5 py-2 text-[13px] font-bold">
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
              <button type="button" aria-label="不用了" data-testid="adaptive-dismiss" onClick={() => dismissNewCut(day)} className="grid size-8 place-items-center rounded-full text-muted-foreground">
                <X className="size-4" />
              </button>
              <button
                type="button"
                data-testid="adaptive-apply"
                onClick={() => {
                  setNewCut(day, advice.to);
                  toast.success(`今天新词减到 ${advice.to} 个`, { description: "只影响今天，明天恢复" });
                }}
                className="rounded-full bg-vague px-3.5 py-2 text-[13px] font-bold text-white dark:text-[oklch(0.2_0.03_80)]"
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
          sub="记录只在这台手机上，清理浏览器就没了"
          action={
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" data-testid="backup-snooze" onClick={() => snoozeBackup(addDays(day, 3))} className="rounded-full px-2.5 py-2 text-[13px] font-semibold text-muted-foreground">
                稍后
              </button>
              <Link to="/me" className="rounded-full bg-foreground px-3.5 py-2 text-[13px] font-bold text-background">
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
          <Notice icon={<Skull className="size-5" />} tone="bg-forget-soft text-forget" title={`${advice.n} 个顽固词`} sub="忘了 3 次以上，单独拎出来攻克" action={<ChevronRight className="size-5 shrink-0 text-muted-foreground" />} />
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
            <Link to="/study" search={{ mode: "ahead" }} data-testid="start-ahead" className="shrink-0 rounded-full bg-know px-3.5 py-2 text-[13px] font-bold text-white dark:text-[oklch(0.2_0.02_170)]">
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
          tone="bg-brand-soft text-primary"
          title="今日小测"
          sub="任务完成了，用 20 题检验一下 · 限时 5 分钟"
          action={
            <Link to="/quiz" data-testid="quiz-entry" className="shrink-0 rounded-full bg-primary px-3.5 py-2 text-[13px] font-bold text-primary-foreground">
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

/** 考试计划落后时的建议：标题就是算出来的每日量；来不及时直接给「改学核心词」 */
function SprintCard({ plan, st, index, day }: { plan: SprintPlan; st: AppState; index: WordIndex; day: string }) {
  const core = st.settings.book === "core";
  const exam = effectiveExam(day, st.settings.examDate).day;
  // 全部词来不及：算一下改学核心词每天要多少
  const corePlan = plan.tooMany && !core ? sprintPlan(day, exam, newWordsLeft(index, { ...st, settings: { ...st.settings, book: "core" } }, day).length) : null;
  const title = plan.tooMany ? (core ? "核心词也来不及了" : "全部词来不及了") : `冲刺计划：每天 ${plan.daily} 词`;
  const sub = plan.tooMany
    ? `每天要 ${plan.need} 词才学得完${corePlan ? `；核心词每天 ${corePlan.daily} 个，${fmtDate(corePlan.finish)}学完` : "，先每天学满 100 个"}`
    : `现在每天 ${st.settings.daily} 个会来不及 · 改成 ${plan.daily} 个，${fmtDate(plan.finish)}学完${plan.spare ? `，考前留 ${plan.spare} 天复习` : ""}`;
  const apply = () => {
    if (corePlan) {
      setSettings({ book: "core", daily: corePlan.daily });
      toast.success(`改学核心词，每天 ${corePlan.daily} 个`);
    } else {
      setSettings({ daily: plan.daily });
      toast.success(`每日新词改为 ${plan.daily}`);
    }
  };
  const label = corePlan ? `改学核心词（每天 ${corePlan.daily} 个）` : plan.tooMany ? `每天学 ${plan.daily} 个` : `改成每天 ${plan.daily} 个`;
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4" data-testid="sprint" data-too={plan.tooMany ? 1 : 0}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary">
          <Target className="size-5" />
        </span>
        <div className="min-w-0 flex-1 leading-snug">
          <div className="text-[15px] font-bold" data-testid="sprint-daily" data-daily={plan.daily}>
            {title}
          </div>
          <div className="mt-0.5 text-[12px] text-muted-foreground" data-testid="sprint-sub">
            {sub}
          </div>
        </div>
      </div>
      <button
        type="button"
        data-testid="sprint-apply"
        data-core={corePlan ? 1 : 0}
        onClick={apply}
        className="mt-3 flex h-11 w-full items-center justify-center rounded-2xl bg-primary text-[14px] font-bold text-primary-foreground shadow-md shadow-primary/20 transition active:scale-[0.98]"
      >
        {label}
      </button>
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
  daily,
  coreLeft,
  sum,
  book,
}: {
  day: string;
  exam: string;
  official: boolean;
  custom: boolean;
  plan: SprintPlan;
  daily: number;
  coreLeft: number;
  sum: ReturnType<typeof summarize>;
  book: string;
}) {
  const onTrack = plan.newLeft === 0 || (!plan.tooMany && daily >= plan.daily);
  const wd = WEEK[new Date(exam + "T12:00:00").getDay()];
  const spare = sum.newLeft ? Math.max(0, diffDays(sum.finish, exam)) : plan.daysLeft;
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4" data-testid="exam-card" data-days={plan.daysLeft}>
      <div className="flex items-center gap-3.5">
        <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-foreground px-3 py-2 text-background" data-testid="exam-days">
          <span className="tnum font-display text-[26px] font-extrabold leading-none">{plan.daysLeft}</span>
          <span className="mt-0.5 text-[11px] font-bold opacity-75">天</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[15px] font-bold">
            <GraduationCap className="size-4 text-primary" />
            {plan.daysLeft === 0 ? "今天就是四级考试，加油！" : "距四级考试"}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground" data-testid="exam-date">
            {fmtDate(exam, true)} {wd}
            <span className={cn("rounded px-1 text-[10px] font-bold", official ? "bg-know-soft text-know" : "bg-secondary")}>{custom ? "自定" : official ? "官方" : "预估"}</span>
          </div>
        </div>
        {onTrack && plan.newLeft > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-[12px] font-bold text-know" data-testid="sprint-ok">
            <Check className="size-4" strokeWidth={3} /> 来得及
          </span>
        )}
        <Link to="/me" aria-label="调整计划" className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
          <ChevronRight className="size-5" />
        </Link>
      </div>
      <div className="mt-3" data-testid="plan-card">
        <div className="flex items-baseline justify-between text-[12px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <BookMarked className="size-3.5 text-primary" />
            {book === "all" ? "全部词汇" : "核心词汇"} · 已学 <b className="tnum text-[14px] text-foreground">{sum.started}</b> / {sum.bookTotal}
          </span>
          <span>每天 {daily} 词</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary" style={{ width: `${(sum.started / Math.max(1, sum.bookTotal)) * 100}%` }} />
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground" data-testid="finish-date" data-spare={spare}>
          {sum.newLeft === 0
            ? "整本词书已经学完 🎉 考前专心复习"
            : sum.finish > exam
              ? `按现在的节奏 ${fmtDate(sum.finish, true)} 学完，赶不上考试`
              : `按计划 ${fmtDate(sum.finish, true)} 学完 · 考前 ${spare} 天`}
        </p>
      </div>
      {coreLeft > 0 && (
        <Link to="/words" search={{ tab: "core" }} data-testid="core-entry" className="mt-1 flex items-center gap-2 rounded-2xl px-1 pt-1 text-[12px] text-muted-foreground hover:text-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          核心词还有 <b className="tnum text-foreground">{coreLeft}</b> 个没掌握
          <ChevronRight className="ml-auto size-4" />
        </Link>
      )}
    </section>
  );
}

/** 周一的上周周报：与前一周对比 */
function WeekCard({ day, logs }: { day: string; logs: Record<string, import("@/lib/srs").DayLog> }) {
  const w = weekReport(logs, day);
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
  const min = (ms: number) => Math.round(ms / 60000);
  const items: { label: string; value: string; delta: number | null; unit: string; testid: string }[] = [
    { label: "新学", value: String(w.last.n), delta: w.delta.n, unit: "", testid: "wk-new" },
    { label: "复习", value: String(w.last.r), delta: w.delta.r, unit: "", testid: "wk-review" },
    { label: "正确率", value: w.last.acc === null ? "—" : `${w.last.acc}%`, delta: w.delta.acc, unit: "%", testid: "wk-acc" },
    { label: "用时", value: min(w.last.ms) < 60 ? `${min(w.last.ms)}分` : `${Math.floor(min(w.last.ms) / 60)}时${min(w.last.ms) % 60}分`, delta: min(w.last.ms) - min(w.prev.ms), unit: "分", testid: "wk-time" },
  ];
  const hasPrev = w.prev.n + w.prev.r > 0;
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4" data-testid="week-report">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-bold">上周周报</div>
          <div className="mt-0.5 text-[12px] text-muted-foreground" data-testid="wk-range">
            {md(w.last.start)}–{md(w.last.end)} · 学了 {w.last.days}/7 天{hasPrev ? " · 对比前一周" : ""}
          </div>
        </div>
        <button type="button" aria-label="关闭周报" data-testid="week-close" onClick={() => dismissWeekReport(day)} className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {items.map((it) => (
          <div key={it.label} className="min-w-0 rounded-2xl bg-secondary/70 px-1 py-2.5 text-center" data-testid={it.testid} data-value={it.value} data-delta={it.delta ?? ""}>
            <div className="tnum truncate text-[17px] font-extrabold leading-tight">{it.value}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{it.label}</div>
            {hasPrev && it.delta !== null && (
              <div className={cn("tnum mt-1 text-[11px] font-bold", it.delta > 0 ? "text-know" : it.delta < 0 ? "text-forget" : "text-muted-foreground")}>
                {it.delta > 0 ? "↑" : it.delta < 0 ? "↓" : "持平"}
                {it.delta !== 0 ? `${Math.abs(it.delta)}${it.unit}` : ""}
              </div>
            )}
          </div>
        ))}
      </div>
      <Link to="/stats" search={{ tab: "review" }} className="mt-3 flex items-center justify-center gap-0.5 text-[12px] font-semibold text-primary" data-testid="week-more">
        看复盘 <ChevronRight className="size-3.5" />
      </Link>
    </section>
  );
}

/** 断签预警：21 点后还没打卡 */
function LateBanner({ sum, streak, onCheckIn }: { sum: ReturnType<typeof summarize>; streak: number; onCheckIn: () => void }) {
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
  const needNew = !sum.timeMode && sum.learned < sum.goal && sum.newLeft > 0;
  return (
    <section className="late-banner late-pulse mb-4 overflow-hidden rounded-3xl p-4 text-white" data-testid="late-warning" role="alert">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/18">
          <AlarmClock className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-extrabold leading-tight">{streak > 0 ? `连续 ${streak} 天要断了！` : "今天还没打卡"}</div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-white/85" data-testid="late-sub">
            离今天结束还有 <b className="tnum">{h > 0 ? `${h} 小时 ` : ""}{m} 分</b>
            {todo.length ? ` · ${todo.join(" · ")}` : " · 任务已完成，就差打卡"}
          </div>
        </div>
        {sum.ready ? (
          <button type="button" onClick={onCheckIn} data-testid="late-checkin" className="shrink-0 rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-[oklch(0.5_0.2_20)]">
            打卡
          </button>
        ) : (
          <Link
            to="/study"
            search={{ mode: needNew || (sum.timeMode && sum.due === 0) ? "new" : "review" }}
            data-testid="late-go"
            className="shrink-0 rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-[oklch(0.5_0.2_20)]"
          >
            去完成
          </Link>
        )}
      </div>
    </section>
  );
}

/** v8 · 安装引导：浏览器允许安装（beforeinstallprompt）时出现；装过不再出现，关掉 14 天内不出现 */
function InstallCard({ day, installed, snooze }: { day: string; installed?: boolean; snooze?: string }) {
  const canPrompt = useInstallPrompt();
  if (!installVisible({ canPrompt, standalone: isStandalone(), installed, snoozeUntil: snooze, today: day })) return null;
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-card p-4" data-testid="install-card">
      <div className="pointer-events-none absolute -right-12 -top-16 size-32 rounded-full bg-brand-soft" />
      <div className="relative flex items-center gap-3.5">
        <Logo className="size-12 shrink-0 drop-shadow-[0_6px_12px_rgba(200,60,30,0.3)]" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold leading-tight">添加到桌面</div>
          <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">从桌面图标全屏打开，没网也能背</div>
        </div>
        <button
          type="button"
          aria-label="暂不添加"
          data-testid="install-dismiss"
          onClick={() => snoozeInstall(addDays(day, INSTALL_SNOOZE_DAYS))}
          className="grid size-8 shrink-0 place-items-center self-start rounded-full text-muted-foreground hover:bg-secondary"
        >
          <X className="size-4" />
        </button>
      </div>
      <button
        type="button"
        data-testid="install-go"
        onClick={async () => {
          const r = await promptInstall();
          if (r === "accepted") toast.success("已添加到桌面", { description: "以后从桌面图标打开就行" });
          else if (r === "dismissed") snoozeInstall(addDays(day, INSTALL_SNOOZE_DAYS));
        }}
        className="relative mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[14px] font-bold text-primary-foreground shadow-md shadow-primary/20 transition active:scale-[0.98]"
      >
        安装到手机桌面
      </button>
    </section>
  );
}

function SnackTile({ to, search, testid, icon, tone, title, sub, dim }: { to: "/tape" | "/study" | "/match" | "/judge" | "/quiz"; search?: { mode: "speed" }; testid: string; icon: React.ReactNode; tone: string; title: string; sub: React.ReactNode; dim?: boolean }) {
  return (
    <Link
      to={to}
      search={search as never}
      data-testid={testid}
      className={cn("flex min-w-0 items-center gap-2.5 rounded-2xl border border-border/70 bg-card p-3 transition hover:border-primary/40 active:scale-[0.99]", dim && "opacity-70")}
    >
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", tone)}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-bold leading-tight">{title}</span>
        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{sub}</span>
      </span>
    </Link>
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
