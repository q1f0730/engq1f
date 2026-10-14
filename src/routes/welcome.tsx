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
            <ul className="mt-6 grid grid-cols-2 gap-x-5 border-t border-rule text-[0.8125rem] text-ink-2">
              <Feature icon={<ShieldCheck className="size-4" />} label="不用注册" first />
              <Feature icon={<WifiOff className="size-4" />} label="离线可用" />
              <Feature icon={<Zap className="size-4" />} label="秒开无广告" />
              <Feature icon={<RotateCcw className="size-4" />} label="忘了的词自动回来" />
            </ul>
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
          {/* 考试日期：三行目录条目，选中的一行左边墨线 + 日期划荧光笔 */}
          <div className="mt-6 border-t border-ink" data-testid="onb-exam">
            {exams.map((e, k) => (
              <button
                key={e.day}
                type="button"
                data-testid={`onb-exam-${k}`}
                aria-pressed={exam === e.day}
                onClick={() => setExam(e.day)}
                className={cn("press relative flex min-h-14 w-full items-baseline gap-3 border-b border-rule py-3 pl-4 pr-1 text-left", exam === e.day ? "text-ink" : "text-ink-3 hover:text-ink")}
              >
                {exam === e.day && <span className="absolute inset-y-2.5 left-0 w-[3px] bg-ink" aria-hidden />}
                <span className={cn("tnum font-serif text-[1.625rem] leading-none", exam === e.day && "hl")}>{fmtDate(e.day)}</span>
                <span className="text-[0.75rem]">
                  {e.day.slice(0, 4)} · {e.official ? "官方" : "预估"}
                </span>
                {exam === e.day && <Check className="ml-auto size-4 self-center" strokeWidth={2.4} />}
              </button>
            ))}
            <label
              className={cn(
                "press relative flex min-h-14 w-full cursor-pointer items-baseline gap-3 border-b border-rule py-3 pl-4 pr-1",
                !exams.some((e) => e.day === exam) ? "text-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              {!exams.some((e) => e.day === exam) && <span className="absolute inset-y-2.5 left-0 w-[3px] bg-ink" aria-hidden />}
              <span className={cn("leading-none", !exams.some((e) => e.day === exam) ? "hl tnum font-serif text-[1.625rem]" : "text-[0.9375rem] font-medium")}>
                {!exams.some((e) => e.day === exam) ? fmtDate(exam) : "其他日期"}
              </span>
              <span className="text-[0.75rem]">自己选</span>
              <CalendarDays className="ml-auto size-4 self-center" />
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
            还有 <b className="font-serif text-[1.375rem] font-normal text-ink">{examLeft}</b> 天
          </p>
          <div className="mb-2 mt-8 text-[0.8125rem] font-medium text-ink-2">选择词书</div>
          <div className="border-t border-ink">
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
          {/* 每天几个：三栏，像一张价目表；推荐那一栏顶上一道墨线写「推荐」 */}
          {!soon && (
          <div className="mt-6 grid grid-cols-3 border-y border-rule" data-testid="daily-pick">
            {options.map((n) => {
              const sp = spareOf(size, n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDaily(n)}
                  data-testid={`daily-${n}`}
                  data-rec={n === bookPlan.daily ? 1 : 0}
                  aria-pressed={curDaily === n}
                  className={cn("press relative border-l border-rule px-2 pb-3.5 pt-5 text-left first:border-l-0", curDaily === n ? "bg-paper-3" : "hover:bg-paper-2/60")}
                >
                  {n === bookPlan.daily && <span className="absolute left-2 top-1.5 text-[0.625rem] font-semibold text-ink">推荐</span>}
                  {curDaily === n && <span className="absolute inset-x-0 -top-px h-[2px] bg-ink" aria-hidden />}
                  <div className="tnum font-serif text-[2.5rem] leading-none">
                    <span className={cn(curDaily === n && "hl")}>{n}</span>
                  </div>
                  <div className={cn("mt-2 text-[0.6875rem] leading-snug", sp < 0 && !cap && !soon ? "font-semibold text-forget" : "text-ink-3")}>{cap || (soon && sp < 0) ? `考前学 ${reachOf(n)} 个` : sp < 0 ? "考后才学完" : `考前 ${sp} 天学完`}</div>
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

/** 12.0 · 卖点：两栏四条，细线分隔，前面一个小方块——不是 2×2 图标卡片 */
function Feature({ label }: { icon?: React.ReactNode; label: string; first?: boolean }) {
  return (
    <li className="flex min-h-9 items-center gap-2 border-b border-rule">
      <span className="size-1.5 shrink-0 rounded-[1px] bg-ink-3" aria-hidden />
      {label}
    </li>
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
  return (
    <button type="button" onClick={onClick} data-testid={testid} aria-pressed={active} className={cn("press relative flex min-h-16 w-full items-center gap-4 border-b border-rule py-3.5 pl-4 pr-1 text-left", active ? "bg-paper-3" : "hover:bg-paper-2/60")}>
      {active && <span className="absolute inset-y-2.5 left-0 w-[3px] bg-ink" aria-hidden />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[1.0625rem] font-semibold">
          {title}
          {badge && <span className="rounded-[2px] bg-mark px-1.5 py-0.5 text-[0.625rem] font-semibold text-mark-ink">{badge}</span>}
        </div>
        <div className="mt-1 text-[0.8125rem] leading-snug text-ink-3">{sub}</div>
      </div>
      <span className={cn("grid size-5 shrink-0 place-items-center rounded-[3px]", active ? "bg-ink text-paper-3" : "border-[1.5px] border-rule-strong")}>
        {active && <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}
