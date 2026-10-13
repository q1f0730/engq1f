import { Link, createFileRoute } from "@tanstack/react-router";
import { BookMarked, CalendarCheck, Check, ChevronRight, Flame, Play, Repeat2, Share2, Star, Swords, TriangleAlert, Volume2 } from "lucide-react";
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
import { forecast, streak } from "@/lib/srs";
import { checkIn, useApp } from "@/lib/store";
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
  };
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
