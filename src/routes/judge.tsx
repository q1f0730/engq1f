import { LeaveSheet, useLeaveGuard } from "@/components/app/leave";
import { finePointer } from "@/lib/pointer";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Scale, Volume2, X } from "@/components/app/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameIntro, GameResult } from "@/components/app/game-bits";
import { Spinner } from "@/components/app/shell";
import { Phonetic } from "@/components/app/word-bits";
import { speak } from "@/lib/audio";
import { now, today } from "@/lib/clock";
import { optionMeaning, useWords, type WordIndex } from "@/lib/data";
import { fmtClock } from "@/lib/exam";
import { JUDGE_SIZE, buildJudge, gamePool, judgeScore, swipeJudge, type JudgeItem } from "@/lib/games";
import { buzz } from "@/lib/haptics";
import { getState, saveGameBest, useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/judge")({ component: JudgePage });

function JudgePage() {
  const { index, error } = useWords();
  if (error) return <div className="p-8 text-center text-sm text-muted-foreground">{error}</div>;
  if (!index) return <Spinner />;
  return <JudgeGame index={index} />;
}

type Answer = { said: boolean; ok: boolean };

function JudgeGame({ index }: { index: WordIndex }) {
  const st = useApp();
  const navigate = useNavigate();
  const swap = !!st.settings.swapSwipe;
  const accent = st.settings.accent;
  const [phase, setPhase] = useState<"intro" | "run" | "done">("intro");
  const [items, setItems] = useState<JudgeItem[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  // 当前题已作答、等待下一题
  const [shown, setShown] = useState<Answer | null>(null);
  const [startAt, setStartAt] = useState(0);
  const [ms, setMs] = useState(0);
  const [record, setRecord] = useState(false);
  const [bestBefore, setBestBefore] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const best = st.gameBest?.judge ?? 0;
  const pos = answers.length;
  const cur = phase === "run" ? items[shown ? pos - 1 : pos] : undefined;
  const word = cur ? index.map.get(cur.w) : undefined;

  const start = () => {
    window.clearTimeout(timer.current);
    const seed = (now() % 1e9) >>> 0;
    setItems(buildJudge(index, gamePool(index, getState(), today()), seed));
    setAnswers([]);
    setShown(null);
    setStartAt(now());
    setRecord(false);
    setBestBefore(getState().gameBest?.judge ?? 0);
    setPhase("run");
  };

  const advance = useCallback(() => {
    window.clearTimeout(timer.current);
    setShown(null);
    if (answers.length >= items.length) {
      const ok = answers.filter((a) => a.ok).length;
      setMs(now() - startAt);
      setRecord(saveGameBest("judge", judgeScore(ok, items.length)));
      setPhase("done");
    }
  }, [answers, items.length, startAt]);

  const judge = useCallback(
    (said: boolean) => {
      if (phase !== "run" || shown || !items[pos]) return;
      const ok = said === items[pos].truth;
      const a = { said, ok };
      buzz(ok ? "know" : "forget");
      setAnswers((x) => [...x, a]);
      setShown(a);
      if (ok) timer.current = window.setTimeout(() => setShown((s) => (s === a ? null : s)), 650);
    },
    [phase, shown, items, pos],
  );

  // 答对自动下一题；最后一题答对也要结算
  useEffect(() => {
    if (phase === "run" && !shown && answers.length >= items.length && items.length) advance();
  }, [phase, shown, answers.length, items.length, advance]);

  useEffect(() => {
    if (phase === "run" && cur && !shown && st.settings.autoplay) speak(cur.w, accent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pos]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (phase === "intro" && e.key === "Enter") return start();
      if (phase !== "run") return;
      if (shown) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          advance();
        }
        return;
      }
      if (e.key === "ArrowRight") judge(!swap);
      if (e.key === "ArrowLeft") judge(swap);
      if (e.key.toLowerCase() === "r" && cur) speak(cur.w, accent);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, shown, judge, advance, swap, cur, accent]);

  const quit = () => navigate({ to: "/" });
  // 11.1 · 游戏中按返回 / × 先确认
  const blocker = useLeaveGuard(phase === "run");
  const okN = answers.filter((a) => a.ok).length;
  // 两个按钮：左边 = 左滑的含义
  const sides: [boolean, boolean] = swap ? [true, false] : [false, true];

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col px-4 pb-safe pt-safe" data-testid="judge" data-phase={phase}>
      <LeaveSheet blocker={blocker} title="退出这一局？" desc={`已经答了 ${answers.length} 题，退出后这一局不计分。`} stay="继续玩" leave="退出" />
      {phase === "intro" && (
        <GameIntro
          testid="judge-intro"
          icon={<Scale className="size-10" />}
          title="判断对错"
          big={`${JUDGE_SIZE} 题 · 一眼判断`}
          desc={`单词配一个释义，判断是不是它的意思。${swap ? "左滑" : "右滑"}或点「对」，${swap ? "右滑" : "左滑"}或点「不对」；错配的释义来自同词性的别的词。`}
          tags={finePointer() ? ["一半对一半错", "←/→ 也能答", "学过的词优先", "满分 100"] : ["一半对一半错", "左右滑也能答", "学过的词优先", "满分 100"]}
          best={best}
          bestLabel="最高"
          onStart={start}
          onQuit={quit}
          startLabel="开始"
        />
      )}
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
            <span className="tnum min-w-12 text-center text-[13px] font-semibold text-muted-foreground" data-testid="judge-progress">
              {Math.min(pos + (shown ? 0 : 1), items.length)}/{items.length}
            </span>
            <span className="tnum flex items-center gap-1 rounded-full bg-know-soft px-2.5 py-1 text-[13px] font-bold text-know" data-testid="judge-ok">
              <Check className="size-3.5" strokeWidth={3} /> {okN}
            </span>
          </div>
          <JudgeCard key={`${cur.w}-${shown ? pos - 1 : pos}`} item={cur} word={word} accent={accent} shown={shown} swap={swap} onJudge={judge} index={index} />
          <div className="shrink-0 pb-4 pt-4">
            {shown && !shown.ok ? (
              <button
                type="button"
                onClick={advance}
                data-testid="judge-next"
                className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[16px] font-bold text-primary-foreground shadow-lg shadow-primary/25 transition active:scale-[0.98]"
              >
                记住了 · 继续 <span className="hidden rounded-md bg-white/20 px-1.5 text-[11px] font-semibold fine:inline">空格</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2.5" data-testid="judge-buttons" data-order={sides.map((b) => (b ? "yes" : "no")).join(",")}>
                {sides.map((yes, k) => (
                  <button
                    key={String(yes)}
                    type="button"
                    disabled={!!shown}
                    onClick={() => judge(yes)}
                    data-testid={yes ? "judge-yes" : "judge-no"}
                    className={cn(
                      "flex h-16 items-center justify-center gap-2 rounded-2xl text-[17px] font-bold shadow-sm transition active:scale-[0.97] disabled:opacity-60",
                      yes ? "bg-know text-white shadow-know/25 dark:text-[oklch(0.2_0.02_170)]" : "bg-forget-soft text-forget",
                    )}
                  >
                    {k === 0 && <ArrowLeft className="size-4" />}
                    {yes ? <Check className="size-5" strokeWidth={3} /> : <X className="size-5" strokeWidth={3} />}
                    {yes ? "对" : "不对"}
                    {k === 1 && <ArrowRight className="size-4" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {phase === "done" && (
        <GameResult
          title="判断对错"
          score={judgeScore(okN, items.length)}
          unit="分"
          record={record}
          best={Math.max(bestBefore, judgeScore(okN, items.length))}
          stats={[
            { label: "答对", value: `${okN}/${items.length}`, testid: "judge-correct" },
            { label: "用时", value: fmtClock(ms), testid: "judge-time" },
            { label: "最长连对", value: String(longestRun(answers)), testid: "judge-run" },
          ]}
          missed={items.filter((_, k) => answers[k] && !answers[k].ok).map((it) => it.w)}
          index={index}
          onAgain={start}
        />
      )}
    </div>
  );
}

function longestRun(a: Answer[]): number {
  let best = 0;
  let cur = 0;
  for (const x of a) {
    cur = x.ok ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

function JudgeCard({
  item,
  word,
  accent,
  shown,
  swap,
  onJudge,
  index,
}: {
  item: JudgeItem;
  word: NonNullable<ReturnType<WordIndex["map"]["get"]>>;
  accent: "us" | "uk";
  shown: Answer | null;
  swap: boolean;
  onJudge: (yes: boolean) => void;
  index: WordIndex;
}) {
  const [dx, setDxState] = useState<number | null>(null);
  const dxRef = useRef<number | null>(null);
  const origin = useRef<{ x: number; id: number } | null>(null);
  const setDx = (v: number | null) => {
    dxRef.current = v;
    setDxState(v);
  };
  const onDown = (e: React.PointerEvent) => {
    if (shown || e.pointerType === "mouse") return;
    origin.current = { x: e.clientX, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!origin.current || origin.current.id !== e.pointerId) return;
    const x = e.clientX - origin.current.x;
    if (dxRef.current === null && Math.abs(x) < 8) return;
    setDx(x);
  };
  const onUp = () => {
    const d = dxRef.current;
    origin.current = null;
    setDx(null);
    if (d === null) return;
    const r = swipeJudge(d, swap);
    if (r !== null) onJudge(r);
  };
  const hint = dx === null ? null : swipeJudge(dx, swap, 50);
  const from = item.from ? index.map.get(item.from) : undefined;
  return (
    <div className="relative mt-3 min-h-0 flex-1 card-in" data-testid="judge-card" data-truth={item.truth ? 1 : 0} data-w={item.w}>
      <div
        className="relative flex h-full touch-pan-y select-none flex-col overflow-hidden rounded-[32px] border border-border/70 bg-card shadow-[0_18px_50px_-24px_rgba(60,30,20,0.35)]"
        style={dx !== null ? { transform: `translateX(${dx}px) rotate(${dx / 24}deg)` } : { transition: "transform 160ms ease-out" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="paper-grain absolute inset-0 opacity-60" />
        <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
          <h2 className="fs-card font-display break-all text-[46px] font-extrabold leading-[1.05] tracking-[-0.035em]" data-testid="judge-word">
            {word.w}
          </h2>
          <div className="mt-2 flex items-center gap-2 text-[15px] text-muted-foreground">
            <Phonetic word={word} accent={accent} />
            <button
              type="button"
              aria-label="播放发音"
              onClick={(e) => {
                e.stopPropagation();
                speak(word.w, accent);
              }}
              className="grid size-9 place-items-center rounded-full bg-brand-soft text-primary active:scale-90"
            >
              <Volume2 className="size-[18px]" />
            </button>
          </div>
          <div className="my-6 flex w-full max-w-xs items-center gap-3 text-[12px] font-bold tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> 是这个意思吗？ <span className="h-px flex-1 bg-border" />
          </div>
          <div
            className={cn(
              "fs-card w-full max-w-sm rounded-2xl px-4 py-4 text-[18px] font-semibold leading-snug transition-colors",
              !shown && "bg-secondary/80",
              shown && item.truth && "bg-know-soft text-know",
              shown && !item.truth && "bg-forget-soft text-forget line-through decoration-2",
            )}
            data-testid="judge-meaning"
          >
            {item.shown}
          </div>
          {shown && (
            <div className="pop mt-4 w-full max-w-sm text-[14px]" data-testid="judge-feedback" data-ok={shown.ok ? 1 : 0}>
              <div className={cn("font-extrabold", shown.ok ? "text-know" : "text-forget")}>{shown.ok ? "✓ 判断正确" : "✗ 判断错了"}</div>
              {!item.truth && (
                <div className="mt-2 rounded-2xl bg-secondary/70 px-4 py-2.5 text-left text-[14px] leading-relaxed">
                  <b className="font-display">{word.w}</b> 是：{optionMeaning(word)}
                  {from && <div className="text-[12px] text-muted-foreground">上面那个是 {from.w} 的意思</div>}
                </div>
              )}
            </div>
          )}
        </div>
        {!shown && <p className="relative pb-4 text-center text-[12px] text-muted-foreground">{swap ? "左滑 = 对 · 右滑 = 不对" : "右滑 = 对 · 左滑 = 不对"}</p>}
        {hint !== null && (
          <div className={cn("pointer-events-none absolute inset-0 grid place-items-center rounded-[32px] text-[30px] font-extrabold", hint ? "bg-know/15 text-know" : "bg-forget/15 text-forget")} data-testid="judge-hint" data-yes={hint ? 1 : 0}>
            {hint ? "对" : "不对"}
          </div>
        )}
      </div>
    </div>
  );
}
