import { LeaveSheet, useLeaveGuard } from "@/components/app/leave";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Puzzle, Timer, X } from "@/components/app/icons";
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
  if (error) return <div className="p-8 text-center text-sm text-ink-3">{error}</div>;
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
  // 11.1 · 游戏中按返回 / × 先确认，不直接丢掉这一局
  const blocker = useLeaveGuard(phase === "run");

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col px-4 pb-safe pt-safe" data-testid="match" data-phase={phase}>
      <LeaveSheet blocker={blocker} title="退出这一局？" desc="计时和分数不会保存。" stay="继续玩" leave="退出" />
      {phase === "intro" && (
        <GameIntro
          testid="match-intro"
          title="配对消消乐"
          big={`${MATCH_PAIRS} 对一轮 · 60 秒`}
          desc="左边英文、右边中文，点一个再点它的意思，配对成功就消掉。一轮清空马上换下一轮，看 60 秒能消多少。"
          tags={[`配对 +${MATCH_POINT}`, "连对加分", `配错 −${MATCH_PENALTY}`, "学过的词优先"]}
          best={best}
          bestLabel="最高"
          onStart={start}
          onQuit={quit}
          startLabel="开始计时"
          specimen={<MatchSpecimen />}
        />
      )}
      {phase === "run" && (
        <>
          {/* 12.0 · 记分牌：左边大号得分（连对时旁边划一笔荧光笔写加分），右边倒计时；下面一条时间线从右往左收短 */}
          <header className="shrink-0 pt-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={quit} aria-label="退出" className="press -ml-2 grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-paper-2 hover:text-ink">
                <X className="size-[22px]" />
              </button>
              <span className="tnum font-serif text-[2.25rem] leading-none tracking-[-0.03em]" data-testid="match-score" data-score={score.score}>
                {score.score}
              </span>
              <span className="min-w-0 flex-1 truncate pl-1">
                {score.combo >= 2 ? (
                  <span key={score.combo} className="pop hl font-serif text-[1.125rem] italic text-ink" data-testid="match-combo">
                    ×{score.combo} · +{MATCH_POINT + comboBonus(score.combo)}
                  </span>
                ) : (
                  <span className="text-[0.75rem] text-ink-3">分</span>
                )}
              </span>
              <span
                className={cn("tnum flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-0.5 font-serif text-[1.5rem] leading-none", left < 10000 ? "border-forget text-forget" : "border-ink text-ink")}
                data-testid="match-timer"
              >
                <Timer className="size-4" />
                {fmtClock(left)}
              </span>
            </div>
            <div className="mt-2.5 h-[3px] bg-rule" aria-hidden>
              <div className={cn("h-full origin-left transition-transform duration-200", left < 10000 ? "bg-forget" : "bg-ink")} style={{ transform: `scaleX(${left / MATCH_MS})` }} />
            </div>
            <p className="mt-2 flex justify-between text-[0.75rem] text-ink-3">
              <span data-testid="match-round">
                第 {round + 1} 轮 · 已消 {score.pairs} 对
              </span>
              <span>点英文，再点它的中文</span>
            </p>
          </header>
          {/* 棋盘：两栏，像词典左页英文、右页中文；中间一条竖细线 */}
          <div key={round} className="card-in mt-3 grid min-h-0 flex-1 grid-cols-2 content-center gap-x-3 pb-5" data-testid="match-board">
            <div className="flex flex-col gap-2 border-r border-rule pr-3">
              {data.left.map((w) => (
                <Tile key={w} testid="match-l" w={w} state={tileState(w, "l", selL, flash, gone)} onClick={() => pickL(w)} en>
                  {w}
                </Tile>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {data.right.map(([w, m]) => (
                <Tile key={w} testid="match-r" w={w} state={tileState(w, "r", selR, flash, gone)} onClick={() => pickR(w)}>
                  {m}
                </Tile>
              ))}
            </div>
          </div>
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
        "relative flex h-[64px] items-center rounded-lg px-3 text-left transition-[transform,opacity,background-color] duration-200",
        en ? "font-serif text-[1.4375rem] leading-tight" : "text-[0.9375rem] font-medium leading-tight",
        state === "idle" && "press bg-paper-3 ring-1 ring-rule ring-inset hover:ring-ink",
        state === "sel" && "bg-mark text-mark-ink ring-[1.5px] ring-ink ring-inset",
        state === "ok" && "scale-95 bg-know-soft text-know line-through decoration-1",
        state === "bad" && "shake bg-forget-soft text-forget ring-[1.5px] ring-forget ring-inset",
        state === "gone" && "pointer-events-none scale-90 opacity-0",
      )}
    >
      <span className="line-clamp-2 break-all">{children}</span>
    </button>
  );
}

/** 开始页的样张：两栏三对，一对已经划了荧光笔（选中），一对配好了（划掉） */
function MatchSpecimen() {
  const L = ["absorb", "rapid", "vital"];
  const R = ["快速的", "吸收", "至关重要的"];
  return (
    <div className="grid grid-cols-2 gap-x-4 rounded-xl bg-paper-3 p-4 ring-1 ring-rule ring-inset">
      <div className="flex flex-col gap-1.5 border-r border-rule pr-4">
        {L.map((w, k) => (
          <span key={w} className={cn("flex h-10 items-center rounded-md px-2.5 font-serif text-[1.25rem]", k === 0 ? "bg-mark text-mark-ink" : k === 1 ? "text-know line-through decoration-1" : "ring-1 ring-rule ring-inset")}>
            {w}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {R.map((m, k) => (
          <span key={m} className={cn("flex h-10 items-center rounded-md px-2.5 text-[0.875rem] font-medium", k === 0 ? "text-know line-through decoration-1" : "ring-1 ring-rule ring-inset")}>
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}
