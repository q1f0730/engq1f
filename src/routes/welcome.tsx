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
import { Tag } from "@/components/app/kit";

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
  const customExam = !exams.some((e) => e.day === exam);
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
          <button type="button" onClick={() => setStep(step - 1)} className="press -ml-2 grid size-11 place-items-center rounded-lg text-ink-2 hover:bg-paper-2 hover:text-ink" aria-label="上一步">
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <span className="w-11" />
        )}
        {/* 12.0 · 步骤：「1 欢迎 · 2 考试 · 3 节奏」，当前这步的名字划荧光笔 */}
        <ol className="flex items-baseline gap-3 text-[0.75rem]" aria-label="步骤">
          {["欢迎", "考试", "节奏"].map((name, k) => (
            <li key={name} className={cn("flex items-baseline gap-1 transition-colors", k === step ? "font-semibold text-ink" : k < step ? "text-ink-2" : "text-ink-3")} aria-current={k === step ? "step" : undefined}>
              <span className="tnum font-serif text-[0.9375rem] font-normal">{k + 1}</span>
              <span className={cn(k === step && "hl")}>{name}</span>
            </li>
          ))}
        </ol>
        <span className="w-11" />
      </div>

      {step === 0 && (
        <div className="card-in flex flex-1 flex-col">
          <div className="flex flex-1 flex-col justify-center">
            <Logo className="size-11" />
            {/* 12.0 · 首屏的「招牌」：一个词典词条，荧光笔划过词头 */}
            <div className="mt-10 border-y border-rule py-5" aria-hidden>
              <div className="flex items-baseline gap-3">
                <span className="word-head hl-swipe text-[3.5rem] leading-none">persist</span>
                <span className="font-ipa text-[0.9375rem] text-ink-3">/pərˈsɪst/</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2.5 text-[0.9375rem] text-ink-2">
                <span className="pos text-[1.0625rem] text-ink-3">v.</span>坚持；持续
              </div>
            </div>
            <h1 className="mt-8 text-[2.25rem] font-semibold leading-[1.12] tracking-[-0.03em]">
              四级单词，
              <br />
              <span className="hl">考前</span>稳稳背完。
            </h1>
            <p className="mt-4 max-w-[24em] text-[0.9375rem] leading-relaxed text-ink-2">
              {sizes.all} 个四级词汇，按你的考试日期排好每天学多少。忘了的词明天再来，记住的词越隔越久。
            </p>
            {/* 卖点：一行小字，用荧光笔小方块隔开，不是 2×2 图标卡片 */}
            <p className="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-ink-2">
              {["不用注册", "离线可用", "秒开无广告", "忘了的词自动回来"].map((f, k) => (
                <span key={f} className="flex items-center gap-2.5">
                  {k > 0 && <span className="size-1.5 rounded-[1px] bg-mark" aria-hidden />}
                  {f}
                </span>
              ))}
            </p>
          </div>
          <Primary onClick={() => setStep(1)} testid="welcome-next">
            开始制定计划 <ArrowRight className="size-5" />
          </Primary>
          {/* 11.3 · 重装 / 换手机：直接从备份恢复，恢复后跳过引导 */}
          <button
            type="button"
            data-testid="welcome-restore"
            onClick={() => file.current?.click()}
            className="press -mt-2 mb-3 flex h-11 items-center justify-center gap-2 text-[0.875rem] font-medium text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink"
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
          <h1 className="mt-4 text-[2rem] font-semibold leading-tight tracking-[-0.025em]">什么时候考四级？</h1>
          <p className="mt-1 text-[0.9375rem] text-ink-3">按考试日期安排每天的量，保证考前学完、留出复习时间。</p>
          {/* 12.0 · 考试日期：像日历上圈出来的几天。每行左边大号日期，右边「还有 N 天」；选中的那行整行抬起、日期划荧光笔 */}
          <div className="mt-6 space-y-1.5" data-testid="onb-exam">
            {exams.map((e, k) => (
              <ExamRow
                key={e.day}
                testid={`onb-exam-${k}`}
                on={exam === e.day}
                onClick={() => setExam(e.day)}
                date={fmtDate(e.day)}
                note={`${e.day.slice(0, 4)} · ${e.official ? "官方" : "预估"}`}
                left={daysUntil(day, e.day)}
              />
            ))}
            <label className={cn(ROW, ROW_STATE(customExam))}>
              <span className="min-w-0 flex-1">
                <span className={cn("block leading-none", customExam ? "tnum font-serif text-[1.625rem]" : "text-[0.9375rem] font-medium")}>
                  <span className={cn(customExam && "hl")}>{customExam ? fmtDate(exam) : "其他日期"}</span>
                </span>
                <span className="mt-1.5 block text-[0.75rem] text-ink-3">自己选</span>
              </span>
              <CalendarDays className="size-4 shrink-0 text-ink-3" />
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
          <p className="tnum mt-3 text-[0.875rem] text-ink-2" data-testid="onb-exam-left">
            离你选的那天还有 <b className="font-serif text-[1.375rem] font-normal text-ink">{examLeft}</b> 天
          </p>
          <h2 className="mb-2 mt-8 text-[0.8125rem] font-medium text-ink-2">选择词书</h2>
          <div className="space-y-1.5">
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
          <h1 className="mt-4 text-[2rem] font-semibold leading-tight tracking-[-0.025em]">{soon ? "考前冲刺" : cap ? "冲刺计划" : "每天学多少新词？"}</h1>
          <p className="mt-1 text-[0.9375rem] text-ink-3" data-testid="onb-plan-line" data-kind={soon ? "soon" : cap ? "cap" : "plan"}>
            {soon ? (
              <>
                {examLeft === 0 ? "今天就考了" : "明天就考了"}，来不及系统背新词。首页切换成<b className="text-ink">考前模式</b>：只复习学过的词，想多看就一组 10 个地过{bookName}。考完再按下一场排计划。
              </>
            ) : cap ? (
              <>
                {examLeft} 天学不完 {size} 个{bookName}。每天 <b className="text-ink">{SPRINT_MAX}</b> 个，考前能先拿下其中 <b className="text-ink">{reachOf(SPRINT_MAX)}</b> 个{reserveDays(examLeft) ? `，最后 ${reserveDays(examLeft)} 天只复习` : ""}。
              </>
            ) : (
              <>
                推荐 <b className="text-ink">{bookPlan.daily}</b> 个：考前 {Math.max(0, bookPlan.spare)} 天学完{curBook === "core" ? "核心词" : "全部词"}，最后留时间复习。
              </>
            )}
          </p>
          {/* 12.0 · 每天几个：和上一步同样的一行一个选项。左边大号数字，右边这个节奏的结果；推荐的那行带一个荧光笔小标签 */}
          {!soon && (
            <div className="mt-6 space-y-1.5" data-testid="daily-pick">
              {options.map((n) => {
                const sp = spareOf(size, n);
                const on = curDaily === n;
                const late = sp < 0 && !cap && !soon;
                return (
                  <button key={n} type="button" onClick={() => setDaily(n)} data-testid={`daily-${n}`} data-rec={n === bookPlan.daily ? 1 : 0} aria-pressed={on} className={cn(ROW, ROW_STATE(on))}>
                    <span className="tnum w-14 shrink-0 font-serif text-[2rem] leading-none">
                      <span className={cn(on && "hl")}>{n}</span>
                    </span>
                    <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug">
                      <span className="block text-ink-3">个 / 天</span>
                      <span className={cn("block", late ? "font-semibold text-forget" : "text-ink-2")}>{cap || (soon && sp < 0) ? `考前学 ${reachOf(n)} 个` : sp < 0 ? "考后才学完" : `考前 ${sp} 天学完`}</span>
                    </span>
                    {n === bookPlan.daily && <Tag tone="mark">推荐</Tag>}
                  </button>
                );
              })}
            </div>
          )}
          {!soon && (
          <div className="mt-6 border-l-2 border-mark py-1 pl-4" data-testid="plan-preview" data-spare={spare}>
            <div className="text-[0.8125rem] text-ink-3">按这个节奏</div>
            {cap || soon ? (
              <>
                <div className="mt-1 text-[1.25rem] font-semibold tracking-[-0.01em]">
                  考前能学 <span className="text-ink">{reachOf(curDaily)}</span> / {size} 个{bookName}
                </div>
                <div className="mt-1 text-[0.8125rem] font-semibold text-ink-3" data-testid="plan-exam">
                  {soon ? "考前模式：首页只安排复习" : `学 ${learnDays} 天，剩下 ${size - reachOf(curDaily)} 个考后再说`}
                </div>
              </>
            ) : (
              <>
                <div className="mt-1 text-[1.25rem] font-semibold tracking-[-0.01em]">
                  {days} 天，<span className="text-ink">{fmtDate(finish, true)}</span> 学完
                </div>
                <div className={cn("mt-1 text-[0.8125rem] font-semibold", spare < 0 ? "text-forget" : "text-know")} data-testid="plan-exam">
                  {spare < 0 ? `比考试晚 ${-spare} 天，来不及` : `考前 ${spare} 天学完`}
                </div>
              </>
            )}
            <div className="mt-1 text-[0.8125rem] text-ink-3">
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
            className="press mb-4 flex h-12 items-center justify-center gap-2 text-[0.875rem] font-medium text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink"
          >
            先测一下词汇量（3 分钟）
          </button>
        </div>
      )}
    </div>
  );
}

const ROW = "press relative flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors";
const ROW_STATE = (on: boolean) => (on ? "bg-paper-3 text-ink ring-1 ring-inset ring-ink" : "text-ink-2 ring-1 ring-inset ring-rule hover:bg-paper-2/60 hover:text-ink");

function ExamRow({ testid, on, onClick, date, note, left }: { testid: string; on: boolean; onClick: () => void; date: string; note: string; left: number }) {
  return (
    <button type="button" data-testid={testid} aria-pressed={on} onClick={onClick} className={cn(ROW, ROW_STATE(on))}>
      <span className="min-w-0 flex-1">
        <span className="tnum block font-serif text-[1.625rem] leading-none">
          <span className={cn(on && "hl")}>{date}</span>
        </span>
        <span className="mt-1.5 block text-[0.75rem] text-ink-3">{note}</span>
      </span>
      <span className="tnum shrink-0 text-right text-[0.75rem] text-ink-3">
        还有 <b className="font-serif text-[1.125rem] font-normal text-ink">{left}</b> 天
      </span>
      {on && <Check className="size-4 shrink-0" strokeWidth={2.4} />}
    </button>
  );
}

function Primary({ children, onClick, testid }: { children: React.ReactNode; onClick: () => void; testid?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className="press my-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[1.0625rem] font-semibold text-paper-3 hover:bg-ink-2 [&_svg]:transition-transform [&_svg]:duration-300 [&_svg]:ease-[var(--ease-spring)] hover:[&_svg]:translate-x-0.5"
    >
      {children}
    </button>
  );
}

function Choice({ active, onClick, title, sub, testid, badge }: { active: boolean; onClick: () => void; title: string; sub: string; testid?: string; badge?: string }) {
  // 12.0 · 词书也是同一种行：选中整行抬起 + 墨色细框，右边一个对勾
  return (
    <button type="button" onClick={onClick} data-testid={testid} aria-pressed={active} className={cn(ROW, ROW_STATE(active))}>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[1.0625rem] font-semibold text-ink">
          {title}
          {badge && <Tag tone="mark">{badge}</Tag>}
        </span>
        <span className="mt-1 block text-[0.8125rem] leading-snug text-ink-3">{sub}</span>
      </span>
      {active && <Check className="size-4 shrink-0" strokeWidth={2.4} />}
    </button>
  );
}
