import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, Gauge, Timer, X } from "@/components/app/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/app/shell";
import { actClass } from "@/components/app/kit";
import { now } from "@/lib/clock";
import { shortMeaning, useWords, type Word, type WordIndex } from "@/lib/data";
import { shuffle } from "@/lib/srs";
import { batchKill, saveTest } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/test")({ component: TestPage });

const PER_TIER = 20;
const LIMIT_MS = 3 * 60 * 1000;
const TIER_NAME = ["基础词", "核心词", "进阶词"];

function tiers(index: WordIndex): Word[][] {
  const t1 = index.list.filter((w) => w.o);
  const t2 = index.list.filter((w) => !w.o && w.c);
  const t3 = index.list.filter((w) => !w.o && !w.c);
  return [t1, t2, t3];
}

function TestPage() {
  const { index } = useWords();
  if (!index) return <Spinner />;
  return <VocabTest index={index} />;
}

function VocabTest({ index }: { index: WordIndex }) {
  const groups = useMemo(() => tiers(index), [index]);
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  // 由易到难：每层抽 20 个，层内乱序
  const items = useMemo(
    () => groups.flatMap((g, t) => shuffle(g, seed + t).slice(0, PER_TIER).map((w) => ({ w, t }))),
    [groups, seed],
  );
  const [phase, setPhase] = useState<"intro" | "run" | "done">("intro");
  const [pos, setPos] = useState(0);
  const [known, setKnown] = useState<boolean[]>([]);
  const [start, setStart] = useState(0);
  const [left, setLeft] = useState(LIMIT_MS);
  const [marked, setMarked] = useState(false);

  const finish = useCallback(() => setPhase("done"), []);

  useEffect(() => {
    if (phase !== "run") return;
    const id = setInterval(() => {
      const l = LIMIT_MS - (now() - start);
      setLeft(Math.max(0, l));
      if (l <= 0) finish();
    }, 250);
    return () => clearInterval(id);
  }, [phase, start, finish]);

  const mark = useCallback(
    (k: boolean) => {
      if (phase !== "run") return;
      setKnown((a) => [...a, k]);
      if (pos + 1 >= items.length) finish();
      else setPos(pos + 1);
    },
    [phase, pos, items.length, finish],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "run") return;
      if (e.key === "1" || e.key === "ArrowLeft") mark(true);
      if (e.key === "2" || e.key === "3" || e.key === "ArrowRight") mark(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, mark]);

  const result = useMemo(() => {
    const per = [0, 1, 2].map((t) => {
      const ans = known.map((k, i) => ({ k, t: items[i].t })).filter((x) => x.t === t);
      const rate = ans.length ? ans.filter((x) => x.k).length / ans.length : 0;
      return { rate, n: ans.length, size: groups[t].length };
    });
    const est = Math.round(per.reduce((a, p) => a + p.rate * p.size, 0));
    const knownWords = known.map((k, i) => (k ? items[i].w.w : null)).filter(Boolean) as string[];
    return { per, est, knownWords };
  }, [known, items, groups]);

  useEffect(() => {
    if (phase === "done") saveTest(result.est);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const cur = items[pos];
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-safe pt-safe" data-testid="vocab-test" data-phase={phase}>
      <div className="flex h-14 items-center gap-3">
        <Link to="/" aria-label="退出" className="press -ml-2 grid size-11 place-items-center rounded-lg text-ink-2 hover:bg-paper-2 hover:text-ink">
          <X className="size-[22px]" />
        </Link>
        <div className="flex-1 text-center text-[0.9375rem] font-medium">词汇量测试</div>
        <span className="w-10" />
      </div>

      {phase === "intro" && (
        <div className="card-in flex flex-1 flex-col pb-6">
          {/* 12.0 · 开始页：一把从「基础」到「进阶」的尺子，说明这次测试怎么抽词 */}
          <div className="mt-6" aria-hidden>
            <div className="flex items-end gap-1">
              {TIER_NAME.map((name, t) => (
                <div key={t} className="flex flex-1 flex-col items-start gap-1.5">
                  <span className="font-serif text-[1.5rem] leading-none text-ink-2">{["able", "absorb", "acquisition"][t]}</span>
                  <span className="h-2 w-full" style={{ background: `color-mix(in oklab, var(--ink) ${25 + t * 30}%, transparent)` }} />
                  <span className="text-[0.6875rem] text-ink-3">{name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1" />
          <h1 className="mt-10 text-[2rem] font-semibold leading-[1.12] tracking-[-0.03em]">
            3 分钟测出你的
            <br />
            <span className="hl">四级词汇量</span>
          </h1>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-2">
            从基础词到进阶词，每层抽 {PER_TIER} 个。看到单词能马上想起意思就点「认识」，犹豫就点「不认识」。测完可以把认识的词直接标为熟词，背的时候跳过。
          </p>
          <button
            type="button"
            onClick={() => {
              setStart(now());
              setPhase("run");
            }}
            data-testid="test-start"
            className={actClass("primary") + " mt-8 h-14 w-full rounded-xl text-[1.0625rem]"}
          >
            开始测试
          </button>
        </div>
      )}

      {phase === "run" && cur && (
        <div className="flex flex-1 flex-col">
          {/* 12.0 · 作答页：一行「第几个 · 哪一层」+ 计时，下面三段尺子标出现在在哪一层 */}
          <div className="flex items-baseline justify-between">
            <span data-testid="test-progress" className="tnum text-[0.8125rem] text-ink-3">
              {pos + 1} / {items.length} · {TIER_NAME[cur.t]}
            </span>
            <span className={cn("tnum flex items-center gap-1.5 font-serif text-[1.375rem] leading-none", left < 30000 ? "text-forget" : "text-ink")}>
              <Timer className="size-4 opacity-70" />
              {mm}:{String(ss).padStart(2, "0")}
            </span>
          </div>
          <TierRuler pos={pos} />
          <div key={pos} className="card-in flex flex-1 flex-col justify-center">
            <p className="text-[0.8125rem] text-ink-3">认识这个词吗？</p>
            <h2 className="word-head mt-3 break-all text-[4rem] leading-[1]" data-testid="test-word">
              {cur.w.w}
            </h2>
          </div>
          <div className="flex gap-2.5 border-t border-rule py-5">
            <AnswerKey tone="forget" testid="test-unknown" onClick={() => mark(false)} hint="2">
              不认识
            </AnswerKey>
            <AnswerKey tone="know" testid="test-know" onClick={() => mark(true)} hint="1">
              认识
            </AnswerKey>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="card-in flex flex-1 flex-col pb-6" data-testid="test-result">
          <section className="mt-4">
            <p className="text-[0.8125rem] text-ink-2">你的四级词汇量约</p>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="tnum hl-swipe font-serif text-[4.5rem] leading-[0.9] tracking-[-0.03em]" data-testid="test-est">
                {result.est}
              </span>
              <span className="tnum font-serif text-[1.375rem] text-ink-3">/ {index.list.length}</span>
            </p>
            <p className="mt-2 text-[0.8125rem] text-ink-3">
              共测 {known.length} 词，认识 {result.knownWords.length} 个
            </p>
          </section>
          {/* 分层结果：和开始页同一把三段尺子，每段写上认识的比例 */}
          <dl className="mt-7 grid grid-cols-3 gap-1">
            {result.per.map((p, t) => (
              <div key={t} className="min-w-0">
                <dd className="tnum font-serif text-[1.625rem] leading-none">{p.n ? `${Math.round(p.rate * 100)}%` : "未测"}</dd>
                <div className="mt-2 h-2 bg-paper-2">
                  <div className="h-full bg-ink" style={{ width: `${p.rate * 100}%` }} />
                </div>
                <dt className="mt-1.5 text-[0.75rem] text-ink-3">
                  {TIER_NAME[t]} · {p.size} 词
                </dt>
              </div>
            ))}
          </dl>
          {result.knownWords.length > 0 && (
            <details className="mt-6 border-t border-rule pt-3" open>
              <summary className="cursor-pointer text-[0.8125rem] text-ink-3">认识的词 {result.knownWords.length}</summary>
              <p className="mt-1.5 max-h-32 overflow-y-auto font-serif text-[1.0625rem] leading-relaxed text-ink-2">
                {result.knownWords.map((w, k) => (
                  <span key={w} title={shortMeaning(index.map.get(w)!, 1)}>
                    {k > 0 && <span className="text-rule-strong"> · </span>}
                    {w}
                  </span>
                ))}
              </p>
            </details>
          )}
          <div className="flex-1" />
          <div className="mt-6 flex flex-col gap-2.5">
            {result.knownWords.length > 0 && (
              <button
                type="button"
                disabled={marked}
                onClick={() => {
                  batchKill(result.knownWords);
                  setMarked(true);
                  toast.success(`已把 ${result.knownWords.length} 个词标为熟词`);
                }}
                data-testid="test-mark"
                className={actClass("secondary") + " h-auto min-h-14 w-full whitespace-normal py-2 text-[0.875rem] disabled:opacity-60"}
              >
                <Check className="size-5 shrink-0" />
                {marked ? "已斩掉这些词" : `把 ${result.knownWords.length} 个认识的词斩掉（以后不再出现）`}
              </button>
            )}
            <Link to="/" data-testid="test-home" className={actClass("primary") + " h-14 w-full text-base"}>
              开始背单词
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** 三段尺子：已经走过的层是墨色，当前层里按进度填，后面的是纸色 */
function TierRuler({ pos }: { pos: number }) {
  return (
    <div className="mt-2.5 grid grid-cols-3 gap-1" aria-hidden>
      {[0, 1, 2].map((t) => {
        const f = Math.min(1, Math.max(0, (pos - t * PER_TIER) / PER_TIER));
        return (
          <div key={t} className="h-[3px] bg-rule">
            <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${f * 100}%` }} />
          </div>
        );
      })}
    </div>
  );
}

function AnswerKey({ tone, testid, onClick, hint, children }: { tone: "know" | "forget"; testid: string; onClick: () => void; hint: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={cn(
        "press relative flex h-16 flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl bg-paper-3 text-[1.0625rem] font-semibold ring-1 ring-rule ring-inset before:absolute before:inset-x-0 before:top-0 before:h-[3px] hover:bg-paper-2",
        tone === "know" ? "text-know before:bg-know" : "text-forget before:bg-forget",
      )}
    >
      {children}
      <span className="kbd-hint hidden font-mono text-[0.6875rem] font-normal text-ink-3 [@media(hover:hover)]:inline">{hint}</span>
    </button>
  );
}
