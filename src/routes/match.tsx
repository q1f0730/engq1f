import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Puzzle, Timer, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameIntro, GameResult } from "@/components/app/game-bits";
import { Spinner } from "@/components/app/shell";
import { speak } from "@/lib/audio";
import { now, today } from "@/lib/clock";
import { useWords, type WordIndex } from "@/lib/data";
import { fmtClock } from "@/lib/exam";
import { MATCH_MS, MATCH_PAIRS, MATCH_PENALTY, MATCH_POINT, comboBonus, emptyMatch, gamePool, matchRound, matchStep, timeLeft, type MatchRound, type MatchScore } from "@/lib/games";
import { buzz } from "@/lib/haptics";
import { getState, saveGameBest, useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/match")({ component: MatchPage });

function MatchPage() {
  const { index, error } = useWords();
  if (error) return <div className="p-8 text-center text-sm text-muted-foreground">{error}</div>;
  if (!index) return <Spinner />;
  return <MatchGame index={index} />;
}

type Flash = { l: string; r: string; ok: boolean } | null;

function MatchGame({ index }: { index: WordIndex }) {
  const st = useApp();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"intro" | "run" | "done">("intro");
  const [pool, setPool] = useState<string[]>([]);
  const [seed, setSeed] = useState(1);
  const [round, setRound] = useState(0);
  const [data, setData] = useState<MatchRound>({ left: [], right: [] });
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const [selL, setSelL] = useState<string | null>(null);
  const [selR, setSelR] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [score, setScore] = useState<MatchScore>(emptyMatch);
  const [startAt, setStartAt] = useState(0);
  const [left, setLeft] = useState(MATCH_MS);
  const [missed, setMissed] = useState<string[]>([]);
  const [record, setRecord] = useState(false);
  const [bestBefore, setBestBefore] = useState(0);
  const lock = useRef(false);
  const best = st.gameBest?.match ?? 0;

  const start = () => {
    const s = (now() % 1e9) >>> 0;
    const p = gamePool(index, getState(), today());
    setPool(p);
    setSeed(s);
    setRound(0);
    setData(matchRound(index, p, 0, s));
    setGone(new Set());
    setSelL(null);
    setSelR(null);
    setFlash(null);
    setScore(emptyMatch());
    setMissed([]);
    setRecord(false);
    setBestBefore(getState().gameBest?.match ?? 0);
    setStartAt(now());
    setLeft(MATCH_MS);
    lock.current = false;
    setPhase("run");
  };

  const finish = useCallback((sc: MatchScore) => {
    setPhase("done");
    setRecord(saveGameBest("match", sc.score));
  }, []);

  // 计时：绝对时间，到点结束
  useEffect(() => {
    if (phase !== "run") return;
    const tick = () => {
      const l = timeLeft(startAt, now());
      setLeft(l);
      if (l <= 0) finish(score);
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [phase, startAt, score, finish]);

  const tryPair = (l: string, r: string) => {
    lock.current = true;
    const ok = l === r;
    const next = matchStep(score, ok);
    setScore(next);
    setFlash({ l, r, ok });
    buzz(ok ? "know" : "forget");
    if (ok && getState().settings.autoplay) speak(l, getState().settings.accent);
    if (!ok) setMissed((m) => (m.includes(l) ? m : [...m, l]));
    window.setTimeout(
      () => {
        setFlash(null);
        setSelL(null);
        setSelR(null);
        lock.current = false;
        if (!ok) return;
        // 锁定期间轮次不会变，闭包里的 gone / data 就是当前的
        const n = new Set(gone);
        n.add(l);
        if (n.size >= data.left.length) {
          // 本轮清空 → 下一轮
          const nr = round + 1;
          setRound(nr);
          setData(matchRound(index, pool, nr, seed));
          setGone(new Set());
        } else setGone(n);
      },
      ok ? 260 : 420,
    );
  };

  const pickL = (w: string) => {
    if (lock.current || gone.has(w)) return;
    if (selR) tryPair(w, selR);
    else setSelL((x) => (x === w ? null : w));
  };
  const pickR = (w: string) => {
    if (lock.current || gone.has(w)) return;
    if (selL) tryPair(selL, w);
    else setSelR((x) => (x === w ? null : w));
  };

  const quit = () => navigate({ to: "/" });

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col px-4 pb-safe pt-safe" data-testid="match" data-phase={phase}>
      {phase === "intro" && (
        <GameIntro
          testid="match-intro"
          icon={<Puzzle className="size-10" />}
          title="配对消消乐"
          big={`${MATCH_PAIRS} 对一轮 · 60 秒`}
          desc="左边英文、右边中文，点一个再点它的意思，配对成功就消掉。一轮清空马上换下一轮，看 60 秒能消多少。"
          tags={[`配对 +${MATCH_POINT}`, "连对加分", `配错 −${MATCH_PENALTY}`, "学过的词优先"]}
          best={best}
          bestLabel="最高"
          onStart={start}
          onQuit={quit}
          startLabel="开始计时"
        />
      )}
      {phase === "run" && (
        <>
          <div className="flex shrink-0 items-center gap-2 pt-3">
            <button type="button" onClick={quit} aria-label="退出" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
              <X className="size-5" />
            </button>
            <div className="flex-1">
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div className={cn("h-full rounded-full transition-[width] duration-200", left < 10000 ? "bg-forget" : "bg-primary")} style={{ width: `${(left / MATCH_MS) * 100}%` }} />
              </div>
            </div>
            <span className={cn("tnum flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-bold", left < 10000 ? "bg-forget-soft text-forget" : "bg-secondary")} data-testid="match-timer">
              <Timer className="size-3.5" />
              {fmtClock(left)}
            </span>
          </div>
          <div className="mt-3 flex shrink-0 items-end justify-between px-1">
            <div>
              <div className="text-[12px] font-semibold text-muted-foreground">得分</div>
              <div className="tnum font-display text-[34px] font-extrabold leading-none tracking-tight" data-testid="match-score" data-score={score.score}>
                {score.score}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 text-[12px] font-semibold text-muted-foreground">
              {score.combo >= 2 && (
                <span key={score.combo} className="pop rounded-full bg-vague-soft px-2.5 py-0.5 font-bold text-vague" data-testid="match-combo">
                  连对 ×{score.combo} · +{MATCH_POINT + comboBonus(score.combo)}
                </span>
              )}
              <span className="tnum" data-testid="match-round">
                第 {round + 1} 轮 · 已消 {score.pairs} 对
              </span>
            </div>
          </div>
          <div key={round} className="card-in mt-4 grid min-h-0 flex-1 grid-cols-2 content-center gap-2.5 pb-6" data-testid="match-board">
            <div className="flex flex-col gap-2.5">
              {data.left.map((w) => (
                <Tile key={w} testid="match-l" w={w} state={tileState(w, "l", selL, flash, gone)} onClick={() => pickL(w)} en>
                  {w}
                </Tile>
              ))}
            </div>
            <div className="flex flex-col gap-2.5">
              {data.right.map(([w, m]) => (
                <Tile key={w} testid="match-r" w={w} state={tileState(w, "r", selR, flash, gone)} onClick={() => pickR(w)}>
                  {m}
                </Tile>
              ))}
            </div>
          </div>
          <p className="shrink-0 pb-4 text-center text-[12px] text-muted-foreground">点英文，再点它的中文意思</p>
        </>
      )}
      {phase === "done" && (
        <GameResult
          title="配对消消乐"
          score={score.score}
          unit="分"
          record={record}
          best={Math.max(bestBefore, score.score)}
          stats={[
            { label: "消掉", value: `${score.pairs} 对`, testid: "match-pairs" },
            { label: "配错", value: `${score.misses} 次`, testid: "match-misses" },
            { label: "最高连对", value: `${score.best}`, testid: "match-best-combo" },
          ]}
          missed={missed}
          index={index}
          onAgain={start}
          note="时间到！"
        />
      )}
    </div>
  );
}

type TileState = "idle" | "sel" | "ok" | "bad" | "gone";

function tileState(w: string, side: "l" | "r", sel: string | null, flash: Flash, gone: Set<string>): TileState {
  if (gone.has(w)) return "gone";
  if (flash && flash[side] === w) return flash.ok ? "ok" : "bad";
  if (sel === w) return "sel";
  return "idle";
}

function Tile({ w, state, onClick, children, en, testid }: { w: string; state: TileState; onClick: () => void; children: React.ReactNode; en?: boolean; testid: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "gone"}
      data-testid={testid}
      data-w={w}
      data-state={state}
      aria-pressed={state === "sel"}
      className={cn(
        "flex h-[68px] items-center justify-center rounded-2xl border-2 px-2 text-center transition-all duration-200",
        en ? "font-display text-[17px] font-bold" : "text-[15px] font-semibold leading-tight",
        state === "idle" && "border-border/80 bg-card shadow-sm hover:border-primary/40 active:scale-[0.97]",
        state === "sel" && "-translate-y-0.5 border-primary bg-brand-soft text-primary shadow-md shadow-primary/15",
        state === "ok" && "scale-95 border-know bg-know-soft text-know",
        state === "bad" && "shake border-forget bg-forget-soft text-forget",
        state === "gone" && "pointer-events-none scale-90 border-transparent bg-transparent opacity-0",
      )}
    >
      <span className="line-clamp-2 break-all">{children}</span>
    </button>
  );
}
