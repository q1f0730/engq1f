import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CalendarDays, Check, FileUp, Gauge, RotateCcw, ShieldCheck, WifiOff, Zap } from "@/components/app/icons";
import { Suspense, lazy, useRef, useState } from "react";
import { rewindToFirst, useBackClose } from "@/lib/back-stack";
import { Logo } from "@/components/app/shell";
import { today } from "@/lib/clock";
import { useWords } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { diffDays, finishDate } from "@/lib/srs";
import { DAILY_OPTIONS, completeOnboarding, getState, type Book } from "@/lib/store";
import { SPRINT_MAX, capReach, daysUntil, effectiveExam, recommendPlan, reserveDays, sprintPlan, upcomingExams } from "@/lib/exam";
import { NEW_CARD_SEC, REVIEW_CARD_SEC } from "@/lib/ux";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/welcome")({ component: Welcome });

// 11.3 · 从备份恢复：点了才加载导入流程
const ImportFlow = lazy(() => import("@/components/app/import-flow").then((m) => ({ default: m.ImportFlow })));

function Welcome() {
  const { index } = useWords();
  const navigate = useNavigate();
  const init = getState().settings;
  const day = today();
  const exams = upcomingExams(day, 2);
  const [step, setStep] = useState(0);
  // 11.1 · 第一步先问考试：默认下一场（2026-12-12），可以换
  const [exam, setExam] = useState(() => effectiveExam(day, init.examDate).day);
  const [book, setBook] = useState<Book | null>(null);
  const [daily, setDaily] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  // 11.2 · 每一步压一条 history：返回键回到上一步，不直接离开 app
  useBackClose(step >= 1, () => setStep(0));
  useBackClose(step >= 2, () => setStep(1));

  // 11.3 · 不等词库：词库大小构建时就知道，欢迎页和引导先显示，词库在后台下载
  const sizes = index ? { all: index.list.length, core: index.coreCount } : { all: __WORDS_ALL__, core: __WORDS_CORE__ };
  const rec = recommendPlan(day, exam, sizes);
  const curBook: Book = book ?? rec.book;
  const size = curBook === "all" ? sizes.all : sizes.core;
  const bookPlan = sprintPlan(day, exam, size);
  const curDaily = daily ?? bookPlan.daily;
  const days = Math.ceil(size / curDaily);
  const finish = finishDate(today(), size, curDaily);
  const spare = diffDays(finish, exam);
  const examLeft = daysUntil(day, exam);
  const options = [...new Set([bookPlan.daily, ...DAILY_OPTIONS])].sort((a, b) => a - b);
  const reviews = Math.round(curDaily * 2.5);
  const minutes = Math.max(5, Math.round((curDaily * NEW_CARD_SEC + reviews * REVIEW_CARD_SEC) / 60));
  const spareOf = (sz: number, n: number) => diffDays(finishDate(day, sz, n), exam);
  // 11.2 · 考试太近：说实话。cap = 每天 100 个也学不完这本书 → 给能做到的目标；soon = 考试就在今天 / 明天
  const soon = examLeft <= 1;
  const cap = !soon && bookPlan.tooMany;
  const learnDays = Math.max(1, examLeft - reserveDays(examLeft));
  const reachOf = (n: number) => capReach(day, exam, size, n);
  const bookName = curBook === "core" ? "核心词" : "词";

  const finishSetup = (to: "/" | "/test") => {
    // 引导里已经把计划说清楚了：当天不再弹冲刺卡；学不完的信息卡这一场也不再弹
    completeOnboarding({ book: curBook, daily: curDaily, examDate: exam === exams[0].day ? "" : exam }, { sprintSeen: day, ...(cap || soon ? { sprintOff: exam } : {}), ...(!cap && !soon && spare < 0 ? { paceOk: day } : {}) });
    // 11.7 · 回首页时退回第一条 app 记录（首页下面不留引导步骤 / 词单链接页，按一次返回就退出）
    if (to === "/" && rewindToFirst()) return;
    navigate({ to, replace: true });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-safe pt-safe" data-testid="welcome" data-step={step}>
      <div className="flex h-14 items-center justify-between">
        {step > 0 ? (
          <button type="button" onClick={() => setStep(step - 1)} className="grid size-10 place-items-center rounded-full hover:bg-secondary" aria-label="上一步">
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((k) => (
            <span key={k} className={cn("h-1.5 rounded-full transition-all", k === step ? "w-6 bg-primary" : "w-1.5 bg-border")} />
          ))}
        </div>
        <span className="w-10" />
      </div>

      {step === 0 && (
        <div className="card-in flex flex-1 flex-col">
          <div className="flex flex-1 flex-col justify-center">
            <Logo className="size-20 drop-shadow-xl" />
            <h1 className="mt-8 font-display text-[40px] font-extrabold leading-[1.1] tracking-tight">
              四级单词，
              <br />
              <span className="text-primary">考前</span>稳稳背完。
            </h1>
            <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
              {sizes.all} 个四级词汇，按你的考试日期排好每天学多少。忘了的词明天再来，记住的词越隔越久。
            </p>
            <div className="mt-8 grid grid-cols-2 gap-2.5">
              <Feature icon={<ShieldCheck className="size-4" />} label="不用注册" />
              <Feature icon={<WifiOff className="size-4" />} label="离线可用" />
              <Feature icon={<Zap className="size-4" />} label="秒开无广告" />
              <Feature icon={<RotateCcw className="size-4" />} label="忘了的词自动回来" />
            </div>
          </div>
          <Primary onClick={() => setStep(1)} testid="welcome-next">
            开始制定计划 <ArrowRight className="size-5" />
          </Primary>
          {/* 11.3 · 重装 / 换手机：直接从备份恢复，恢复后跳过引导 */}
          <button
            type="button"
            data-testid="welcome-restore"
            onClick={() => file.current?.click()}
            className="-mt-2 mb-3 flex h-11 items-center justify-center gap-2 text-[14px] font-semibold text-muted-foreground"
          >
            <FileUp className="size-4" /> 我有备份，恢复记录
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json,text/plain"
            className="hidden"
            data-testid="welcome-restore-file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) setPending(await f.text());
            }}
          />
          {pending !== null && (
            <Suspense fallback={null}>
              <ImportFlow
                text={pending}
                onDone={() => {
                  setPending(null);
                  if (getState().onboarded && !rewindToFirst()) navigate({ to: "/", replace: true });
                }}
              />
            </Suspense>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="card-in flex flex-1 flex-col">
          <h1 className="mt-4 font-display text-[30px] font-extrabold tracking-tight">什么时候考四级？</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">按考试日期安排每天的量，保证考前学完、留出复习时间。</p>
          <div className="mt-5 grid grid-cols-3 gap-2" data-testid="onb-exam">
            {exams.map((e, k) => (
              <button
                key={e.day}
                type="button"
                data-testid={`onb-exam-${k}`}
                aria-pressed={exam === e.day}
                onClick={() => setExam(e.day)}
                className={cn("rounded-2xl border px-1 py-2.5 text-center transition", exam === e.day ? "border-primary bg-brand-soft text-primary" : "border-border bg-card text-muted-foreground")}
              >
                <span className="tnum block text-[15px] font-bold">{fmtDate(e.day)}</span>
                <span className="block text-[11px] opacity-80">
                  {e.day.slice(0, 4)} · {e.official ? "官方" : "预估"}
                </span>
              </button>
            ))}
            <label
              className={cn(
                "relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border px-1 py-2.5 text-center transition",
                !exams.some((e) => e.day === exam) ? "border-primary bg-brand-soft text-primary" : "border-border bg-card text-muted-foreground",
              )}
            >
              <span className="flex items-center gap-1 text-[14px] font-bold">
                <CalendarDays className="size-3.5" />
                {!exams.some((e) => e.day === exam) ? fmtDate(exam) : "其他日期"}
              </span>
              <span className="block text-[11px] opacity-80">自己选</span>
              <input
                type="date"
                data-testid="onb-exam-custom"
                min={day}
                value={exam}
                onChange={(e) => e.target.value && e.target.value >= day && setExam(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="自定义考试日期"
              />
            </label>
          </div>
          <p className="mt-2 text-[13px] font-semibold text-primary" data-testid="onb-exam-left">
            还有 {examLeft} 天
          </p>
          <div className="mb-2 mt-5 text-[12px] font-bold tracking-wider text-muted-foreground">选择词书</div>
          <div className="space-y-2.5">
            {(["core", "all"] as Book[]).map((b) => {
              const sz = b === "all" ? sizes.all : sizes.core;
              const p = sprintPlan(day, exam, sz);
              return (
                <Choice
                  key={b}
                  active={curBook === b}
                  onClick={() => {
                    setBook(b);
                    setDaily(null);
                  }}
                  title={b === "all" ? "四级全部词汇" : "四级核心词汇"}
                  sub={`${sz} 词 · ${p.daysLeft <= 1 ? "考前来不及系统背，先过一遍最要紧的" : p.tooMany ? `每天 ${SPRINT_MAX} 个，考前能学 ${capReach(day, exam, sz)} / ${sz} 个` : `每天 ${p.daily} 个，考前 ${p.spare} 天学完`}`}
                  badge={rec.book === b ? "推荐" : undefined}
                  testid={`book-${b}`}
                />
              );
            })}
          </div>
          <div className="flex-1" />
          <Primary onClick={() => setStep(2)} testid="welcome-next">
            下一步 <ArrowRight className="size-5" />
          </Primary>
        </div>
      )}

      {step === 2 && (
        <div className="card-in flex flex-1 flex-col">
          <h1 className="mt-4 font-display text-[30px] font-extrabold tracking-tight">{soon ? "考前冲刺" : cap ? "冲刺计划" : "每天学多少新词？"}</h1>
          <p className="mt-1 text-[15px] text-muted-foreground" data-testid="onb-plan-line" data-kind={soon ? "soon" : cap ? "cap" : "plan"}>
            {soon ? (
              <>
                {examLeft === 0 ? "今天就考了" : "明天就考了"}，来不及系统背新词。首页切换成<b className="text-foreground">考前模式</b>：只复习学过的词，想多看就一组 10 个地过{bookName}。考完再按下一场排计划。
              </>
            ) : cap ? (
              <>
                {examLeft} 天学不完 {size} 个{bookName}。每天 <b className="text-foreground">{SPRINT_MAX}</b> 个，考前能先拿下其中 <b className="text-foreground">{reachOf(SPRINT_MAX)}</b> 个{reserveDays(examLeft) ? `，最后 ${reserveDays(examLeft)} 天只复习` : ""}。
              </>
            ) : (
              <>
                推荐 <b className="text-foreground">{bookPlan.daily}</b> 个：考前 {Math.max(0, bookPlan.spare)} 天学完{curBook === "core" ? "核心词" : "全部词"}，最后留时间复习。
              </>
            )}
          </p>
          {!soon && (
          <div className="mt-5 grid grid-cols-3 gap-2.5" data-testid="daily-pick">
            {options.map((n) => {
              const sp = spareOf(size, n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDaily(n)}
                  data-testid={`daily-${n}`}
                  data-rec={n === bookPlan.daily ? 1 : 0}
                  className={cn("relative rounded-3xl border py-4 transition", curDaily === n ? "border-primary bg-brand-soft" : "border-border bg-card")}
                >
                  <div className={cn("tnum font-display text-[28px] font-extrabold leading-none", curDaily === n ? "text-primary" : "")}>{n}</div>
                  <div className={cn("mt-1.5 text-[11px]", sp < 0 && !cap && !soon ? "font-semibold text-forget" : "text-muted-foreground")}>{cap || (soon && sp < 0) ? `考前学 ${reachOf(n)} 个` : sp < 0 ? "考后才学完" : `考前 ${sp} 天学完`}</div>
                  {n === bookPlan.daily && <span className="absolute -top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">推荐</span>}
                </button>
              );
            })}
          </div>
          )}
          {!soon && (
          <div className="mt-5 rounded-3xl bg-secondary/80 p-5" data-testid="plan-preview" data-spare={spare}>
            <div className="text-[13px] text-muted-foreground">按这个节奏</div>
            {cap || soon ? (
              <>
                <div className="mt-1 text-[20px] font-extrabold">
                  考前能学 <span className="text-primary">{reachOf(curDaily)}</span> / {size} 个{bookName}
                </div>
                <div className="mt-1 text-[13px] font-semibold text-muted-foreground" data-testid="plan-exam">
                  {soon ? "考前模式：首页只安排复习" : `学 ${learnDays} 天，剩下 ${size - reachOf(curDaily)} 个考后再说`}
                </div>
              </>
            ) : (
              <>
                <div className="mt-1 text-[20px] font-extrabold">
                  {days} 天，<span className="text-primary">{fmtDate(finish, true)}</span> 学完
                </div>
                <div className={cn("mt-1 text-[13px] font-semibold", spare < 0 ? "text-forget" : "text-know")} data-testid="plan-exam">
                  {spare < 0 ? `比考试晚 ${-spare} 天，来不及` : `考前 ${spare} 天学完`}
                </div>
              </>
            )}
            <div className="mt-1 text-[13px] text-muted-foreground">
              每天约 {curDaily} 个新词 + {reviews} 个左右复习，约 {minutes} 分钟
            </div>
          </div>
          )}
          <div className="flex-1" />
          <Primary onClick={() => finishSetup("/")} testid="welcome-done">
            <Check className="size-5" /> 开始背单词
          </Primary>
          <button
            type="button"
            onClick={() => finishSetup("/test")}
            data-testid="welcome-test"
            className="mb-4 flex h-12 items-center justify-center gap-2 text-[14px] font-semibold text-muted-foreground"
          >
            <Gauge className="size-4" /> 先测一下词汇量（3 分钟）
          </button>
        </div>
      )}
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-card px-3.5 py-3 text-[14px] font-semibold shadow-sm ring-1 ring-border/70">
      <span className="text-primary">{icon}</span>
      {label}
    </div>
  );
}

function Primary({ children, onClick, testid }: { children: React.ReactNode; onClick: () => void; testid?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className="my-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[17px] font-bold text-primary-foreground shadow-xl shadow-primary/25 transition active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function Choice({ active, onClick, title, sub, testid, badge }: { active: boolean; onClick: () => void; title: string; sub: string; testid?: string; badge?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={cn(
        "flex w-full items-center gap-4 rounded-3xl border p-4 text-left transition",
        active ? "border-primary bg-brand-soft" : "border-border bg-card",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[17px] font-bold">
          {title}
          {badge && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">{badge}</span>}
        </div>
        <div className="mt-0.5 text-[13px] text-muted-foreground">{sub}</div>
      </div>
      <span className={cn("grid size-6 place-items-center rounded-full border-2", active ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
        {active && <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}
