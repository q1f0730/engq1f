import { LeaveSheet, useLeaveGuard } from "@/components/app/leave";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, ClipboardCheck, RotateCcw, Star, Timer, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/app/shell";
import { ChoiceList, QuizPrompt } from "@/components/app/study";
import { Meanings } from "@/components/app/word-bits";
import { speak } from "@/lib/audio";
import { now, today } from "@/lib/clock";
import { useWords, type WordIndex } from "@/lib/data";
import {
  MOCK_LIMIT_MS,
  MOCK_SIZE,
  MODE_LABEL,
  buildMock,
  choicesFor,
  clampMs,
  fmtClock,
  quizStats,
  scoreOf,
  type Choice,
  type MockQuestion,
} from "@/lib/exam";
import { buzz } from "@/lib/haptics";
import { getState, saveQuiz, starWords, toggleStar, useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/quiz")({
  validateSearch: (s: Record<string, unknown>): { t?: number } => ({ t: typeof s.t === "number" ? s.t : undefined }),
  component: QuizPage,
});

function QuizPage() {
  const { index, error } = useWords();
  const { t } = Route.useSearch();
  if (error) return <div className="p-8 text-center text-sm text-muted-foreground">{error}</div>;
  if (!index) return <Spinner />;
  return <MockQuiz key={t ?? 0} index={index} autoStart={!!t} />;
}

interface Item extends MockQuestion {
  choices: Choice[];
  seed: number;
}

/** 每题作答：选项序号，-1 = 跳过 / 超时未答 */
type Answers = number[];

function MockQuiz({ index, autoStart }: { index: WordIndex; autoStart: boolean }) {
  const st = useApp();
  const navigate = useNavigate();
  const accent = st.settings.accent;
  const [phase, setPhase] = useState<"intro" | "run" | "done">(autoStart ? "run" : "intro");
  const [items, setItems] = useState<Item[]>(() => (autoStart ? makeItems(index) : []));
  const [answers, setAnswers] = useState<Answers>([]);
  const [startAt, setStartAt] = useState(() => now());
  const [left, setLeft] = useState(MOCK_LIMIT_MS);
  const [usedMs, setUsedMs] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const saved = useRef(false);
  // 开始这一套之前的成绩（「比上次」用）
  const [prevStats, setPrevStats] = useState(() => quizStats(getState().quizzes ?? []));

  const pos = answers.length;
  const cur = phase === "run" ? items[pos] : undefined;
  const word = cur ? index.map.get(cur.w) : undefined;

  const start = () => {
    setPrevStats(quizStats(getState().quizzes ?? []));
    setItems(makeItems(index));
    setAnswers([]);
    setStartAt(now());
    setLeft(MOCK_LIMIT_MS);
    setTimedOut(false);
    saved.current = false;
    setPhase("run");
  };

  const finish = useCallback(
    (final: Answers, out: boolean) => {
      const filled = items.map((_, k) => (k < final.length ? final[k] : -1));
      const ms = clampMs(now() - startAt);
      setAnswers(filled);
      setUsedMs(ms);
      setTimedOut(out);
      setPhase("done");
      if (!saved.current) {
        saved.current = true;
        const ok = filled.filter((a, k) => a >= 0 && items[k].choices[a]?.correct).length;
        saveQuiz({ at: today(), ts: now(), n: items.length, ok, ms });
      }
    },
    [items, startAt],
  );

  // 计时：按绝对时间算，切到后台也不会多给时间
  useEffect(() => {
    if (phase !== "run") return;
    const tick = () => {
      const l = MOCK_LIMIT_MS - (now() - startAt);
      setLeft(Math.max(0, l));
      if (l <= 0) finish(answers, true);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [phase, startAt, answers, finish]);

  // 听力题自动播放
  useEffect(() => {
    if (cur && (cur.mode === "audio" || cur.mode === "listen")) speak(cur.w, accent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pos]);

  const pick = useCallback(
    (k: number) => {
      if (phase !== "run" || !cur) return;
      if (k >= 0 && !cur.choices[k]) return;
      buzz(k >= 0 && cur.choices[k].correct ? "know" : "forget");
      const next = [...answers, k];
      if (next.length >= items.length) finish(next, false);
      else setAnswers(next);
    },
    [phase, cur, answers, items.length, finish],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (phase === "run" && ["1", "2", "3", "4"].includes(e.key)) pick(Number(e.key) - 1);
      if (phase === "run" && e.key.toLowerCase() === "r" && cur) speak(cur.w, accent);
      if (phase === "intro" && e.key === "Enter") start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pick, cur, accent]);

  const quit = () => navigate({ to: "/" });
  // 11.1 · 小测答到一半按返回 / ×：交卷（按已答的算分）、放弃（不记成绩）、或继续
  const blocker = useLeaveGuard(phase === "run" && answers.length > 0);

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col px-4 pb-safe pt-safe" data-testid="mock" data-phase={phase}>
      <LeaveSheet
        blocker={blocker}
        title="交卷还是放弃？"
        desc={`已经答了 ${answers.length}/${items.length} 题。交卷按已答的算分（没答的算错）；放弃不记成绩。`}
        stay="继续答题"
        leave="放弃"
        extra={{ label: "交卷看成绩", testid: "leave-submit", onClick: () => finish(answers, false) }}
      />
      {phase === "intro" && <Intro onStart={start} onQuit={quit} stats={prevStats} />}
      {phase === "run" && cur && word && (
        <>
          <div className="flex shrink-0 items-center gap-2 pt-3">
            <button type="button" onClick={quit} aria-label="退出" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
              <X className="size-5" />
            </button>
            <div className="flex-1">
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${(pos / items.length) * 100}%` }} />
              </div>
            </div>
            <span className="tnum min-w-12 text-center text-[13px] font-semibold text-muted-foreground" data-testid="mock-progress">
              {pos + 1}/{items.length}
            </span>
            <span
              className={cn(
                "tnum flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-bold",
                left < 60000 ? "bg-forget-soft text-forget" : "bg-secondary text-foreground",
              )}
              data-testid="mock-timer"
            >
              <Timer className="size-3.5" />
              {fmtClock(left)}
            </span>
          </div>
          <div className="mt-1 flex h-6 shrink-0 items-center justify-center gap-2 text-[12px] font-medium text-muted-foreground">
            <span>模拟小测</span>
            <span className="rounded-full bg-secondary px-2 py-px" data-testid="mock-mode" data-mode={cur.mode}>
              {MODE_LABEL[cur.mode]}
            </span>
          </div>
          <div key={pos} className="card-in flex min-h-0 flex-1 flex-col" data-testid="quiz" data-quiz-mode={cur.mode} data-w={cur.w}>
            <QuizPrompt word={word} mode={cur.mode} accent={accent} seed={cur.seed} done={false} compact />
            <ChoiceList choices={cur.choices} done={false} onPick={pick} />
          </div>
          <div className="shrink-0 pb-4 pt-3">
            <button type="button" onClick={() => pick(-1)} data-testid="mock-skip" className="h-11 w-full rounded-2xl text-[14px] font-semibold text-muted-foreground hover:bg-secondary">
              不会，跳过
            </button>
          </div>
        </>
      )}
      {phase === "done" && (
        <Result
          index={index}
          items={items}
          answers={answers}
          ms={usedMs}
          timedOut={timedOut}
          prev={prevStats.count ? prevStats.last : null}
          onAgain={start}
        />
      )}
    </div>
  );
}

function makeItems(index: WordIndex): Item[] {
  const st = getState();
  const seed = (now() % 1e9) >>> 0;
  return buildMock(index, st, today(), seed).map((q, k) => {
    const s = (seed + k * 7919) >>> 0;
    return { ...q, seed: s, choices: choicesFor(index, index.map.get(q.w)!, q.mode, s) };
  });
}

function Intro({ onStart, onQuit, stats }: { onStart: () => void; onQuit: () => void; stats: ReturnType<typeof quizStats> }) {
  const types = ["英选中", "中选英", "听音选义", "听音辨词", "短语选义", "一词多义", "词性判断", "短语挖空"];
  return (
    <div className="flex flex-1 flex-col" data-testid="mock-intro">
      <div className="flex h-14 shrink-0 items-center">
        <button type="button" onClick={onQuit} aria-label="退出" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
          <X className="size-5" />
        </button>
        <div className="flex-1 text-center text-[15px] font-bold">模拟小测</div>
        <span className="w-10" />
      </div>
      <div className="card-in flex flex-1 flex-col justify-center pb-6 text-center">
        <div className="mx-auto grid size-20 place-items-center rounded-[28px] bg-brand-soft text-primary">
          <ClipboardCheck className="size-10" />
        </div>
        <h1 className="mt-6 font-display text-[30px] font-extrabold tracking-tight">{MOCK_SIZE} 题 · 5 分钟</h1>
        <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
          混合 8 种题型，学过的词优先出题。中途不显示对错，交卷后逐题回顾，错题一键进生词本。小测不影响复习计划。
        </p>
        <div className="mx-auto mt-5 flex max-w-sm flex-wrap justify-center gap-1.5" data-testid="mock-types">
          {types.map((t) => (
            <span key={t} className="rounded-full bg-secondary px-2.5 py-1 text-[12px] font-semibold text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
        {stats.count > 0 && (
          <div className="mx-auto mt-6 grid w-full max-w-sm grid-cols-3 gap-2" data-testid="mock-prev">
            <Mini label="上次" value={`${stats.last}`} />
            <Mini label="最高" value={`${stats.best}`} />
            <Mini label="已做" value={`${stats.count} 次`} />
          </div>
        )}
        <button
          type="button"
          onClick={onStart}
          data-testid="mock-start"
          className="mx-auto mt-8 flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-primary text-[17px] font-bold text-primary-foreground shadow-xl shadow-primary/25 transition active:scale-[0.98]"
        >
          <Timer className="size-5" /> 开始计时
        </button>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary/80 px-2 py-2.5">
      <div className="tnum text-[18px] font-extrabold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Result({
  index,
  items,
  answers,
  ms,
  timedOut,
  prev,
  onAgain,
}: {
  index: WordIndex;
  items: Item[];
  answers: Answers;
  ms: number;
  timedOut: boolean;
  prev: number | null;
  onAgain: () => void;
}) {
  const st = useApp();
  const okAt = (k: number) => answers[k] >= 0 && !!items[k].choices[answers[k]]?.correct;
  const ok = items.filter((_, k) => okAt(k)).length;
  const score = scoreOf(ok, items.length);
  const wrongWords = [...new Set(items.filter((_, k) => !okAt(k)).map((q) => q.w))];
  const unstarred = wrongWords.filter((w) => !st.star[w]);
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "wrong">(wrongWords.length ? "wrong" : "all");
  const verdict = score >= 90 ? "稳了，保持手感" : score >= 75 ? "不错，错题再过一遍" : score >= 60 ? "及格线附近，多练错题" : "先把错题吃透";
  const shown = items.map((q, k) => ({ q, k })).filter(({ k }) => filter === "all" || !okAt(k));

  return (
    <div className="-mx-4 flex-1 overflow-y-auto px-4 pb-8" data-testid="mock-result">
      <div className="flex h-14 items-center">
        <Link to="/" aria-label="关闭" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
          <X className="size-5" />
        </Link>
        <div className="flex-1 text-center text-[15px] font-bold">小测成绩</div>
        <span className="w-10" />
      </div>
      <section className="hero-gradient card-in relative overflow-hidden rounded-[32px] p-6 text-white shadow-[0_24px_60px_-28px_rgba(200,60,30,0.65)]">
        <div className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full bg-white/[0.08]" />
        <div className="relative flex items-end justify-between gap-4">
          <div>
            <div className="text-[13px] font-semibold text-white/80">得分</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="tnum font-display text-[64px] font-extrabold leading-none" data-testid="mock-score">
                {score}
              </span>
              <span className="text-[18px] font-bold text-white/75">分</span>
            </div>
            <div className="mt-2 text-[14px] font-semibold text-white/90">{verdict}</div>
          </div>
          <Trophy className="size-14 shrink-0 text-white/30" />
        </div>
        <div className="relative mt-5 grid grid-cols-3 gap-2 text-center">
          <HeroStat label="答对" value={`${ok}/${items.length}`} testid="mock-ok" />
          <HeroStat label={timedOut ? "超时交卷" : "用时"} value={fmtClock(ms)} testid="mock-time" />
          <HeroStat label="比上次" value={prev === null ? "首次" : `${score - prev >= 0 ? "+" : ""}${score - prev}`} testid="mock-delta" />
        </div>
      </section>

      <div className="mt-4 flex gap-2.5">
        <button
          type="button"
          onClick={onAgain}
          data-testid="mock-again"
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-secondary text-[15px] font-bold"
        >
          <RotateCcw className="size-4" /> 再来一套
        </button>
        {wrongWords.length > 0 && (
          <button
            type="button"
            disabled={!unstarred.length}
            onClick={() => {
              starWords(unstarred);
              toast.success(`${unstarred.length} 个错题词已加入生词本`);
            }}
            data-testid="mock-star-all"
            className="flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground shadow-lg shadow-primary/20 disabled:bg-vague-soft disabled:text-vague disabled:shadow-none"
          >
            <Star className={cn("size-4", !unstarred.length && "fill-current")} />
            {unstarred.length ? `错题加入生词本 ${unstarred.length}` : "错题已在生词本"}
          </button>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-[15px] font-bold">逐题回顾</h2>
        <div className="flex gap-1 rounded-full bg-secondary p-1 text-[12px] font-semibold" role="radiogroup" data-testid="mock-filter">
          {(
            [
              ["wrong", `错题 ${items.length - ok}`],
              ["all", `全部 ${items.length}`],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={filter === v}
              onClick={() => setFilter(v)}
              className={cn("rounded-full px-3 py-1", filter === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {ok === items.length && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-3xl bg-know-soft p-4 text-[14px] font-semibold text-know" data-testid="mock-perfect">
          <Check className="size-5" strokeWidth={3} /> 全部答对，没有错题
        </div>
      )}
      {shown.length === 0 ? null : (
        <ul className="mt-3 space-y-2" data-testid="mock-review">
          {shown.map(({ q, k }) => {
            const good = okAt(k);
            const a = answers[k];
            const right = q.choices.find((c) => c.correct);
            const word = index.map.get(q.w)!;
            const expanded = open === k;
            const starred = !!st.star[q.w];
            return (
              <li key={k} className="overflow-hidden rounded-3xl border border-border/70 bg-card" data-testid="mock-review-item" data-ok={good ? 1 : 0}>
                <button type="button" onClick={() => setOpen(expanded ? null : k)} className="flex w-full items-start gap-3 px-4 py-3 text-left" data-testid="mock-review-toggle">
                  <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg text-white", good ? "bg-know" : "bg-forget")}>
                    {good ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="font-display truncate text-[17px] font-bold">{q.w}</span>
                      <span className="shrink-0 rounded-full bg-secondary px-2 py-px text-[11px] font-semibold text-muted-foreground">{MODE_LABEL[q.mode]}</span>
                    </span>
                    {!good && (
                      <span className="mt-1 block text-[13px] leading-snug">
                        <span className="text-forget line-through decoration-forget/50" data-testid="mock-your">
                          {a >= 0 ? q.choices[a]?.text : "未作答"}
                        </span>
                        <span className="mx-1.5 text-muted-foreground">→</span>
                        {q.mode === "poly" && <span className="text-muted-foreground">不属于的是 </span>}
                        <span className="font-semibold text-know" data-testid="mock-right">
                          {right?.text}
                        </span>
                      </span>
                    )}
                    {good && <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{right?.text}</span>}
                  </span>
                  <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition", expanded && "rotate-180")} />
                </button>
                {expanded && (
                  <div className="border-t border-border/60 px-4 pb-4 pt-3" data-testid="mock-review-detail">
                    {right?.sub && q.mode === "poly" && <p className="mb-2 text-[13px] text-muted-foreground">「{right.text}」{right.sub.replace("这是", "是")}</p>}
                    <Meanings word={word} />
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => speak(q.w, st.settings.accent)}
                        className="h-9 rounded-full bg-brand-soft px-3.5 text-[13px] font-semibold text-primary"
                      >
                        听发音
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          toggleStar(q.w);
                          toast(starred ? "已移出生词本" : "已加入生词本");
                        }}
                        data-testid="mock-star-one"
                        className={cn("flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold", starred ? "bg-vague-soft text-vague" : "bg-secondary text-muted-foreground")}
                      >
                        <Star className={cn("size-3.5", starred && "fill-current")} />
                        {starred ? "在生词本" : "加入生词本"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link to="/" data-testid="mock-home" className="mt-6 flex h-13 items-center justify-center rounded-2xl bg-primary py-3.5 text-[16px] font-bold text-primary-foreground">
        回到今日
      </Link>
    </div>
  );
}

function HeroStat({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="rounded-2xl bg-white/14 px-2 py-2.5 ring-1 ring-white/15">
      <div className="tnum text-[18px] font-extrabold" data-testid={testid}>
        {value}
      </div>
      <div className="text-[11px] font-semibold text-white/75">{label}</div>
    </div>
  );
}
