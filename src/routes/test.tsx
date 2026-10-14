import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, Gauge, Timer, X } from "@/components/app/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/app/shell";
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
        <Link to="/" aria-label="退出" className="grid size-10 place-items-center rounded-full text-ink-3 hover:bg-paper-2">
          <X className="size-5" />
        </Link>
        <div className="flex-1 text-center text-[0.9375rem] font-semibold">词汇量测试</div>
        <span className="w-10" />
      </div>

      {phase === "intro" && (
        <div className="card-in flex flex-1 flex-col justify-center text-center">
          <div className="mx-auto grid size-20 place-items-center rounded-2xl bg-mark-soft text-ink">
            <Gauge className="size-10" />
          </div>
          <h1 className="mt-6 font-display text-[1.875rem] font-semibold tracking-[-0.015em]">3 分钟测出你的四级词汇量</h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-3">
            从基础词到进阶词，每层抽 {PER_TIER} 个。看到单词能马上想起意思就点「认识」，犹豫就点「不认识」。测完可以把认识的词直接标为熟词，背的时候跳过。
          </p>
          <button
            type="button"
            onClick={() => {
              setStart(now());
              setPhase("run");
            }}
            data-testid="test-start"
            className="mx-auto mt-10 flex h-14 w-full max-w-xs items-center justify-center rounded-2xl bg-ink text-[1.0625rem] font-semibold text-paper-3 shadow-primary/25"
          >
            开始测试
          </button>
        </div>
      )}

      {phase === "run" && cur && (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between text-[0.8125rem] font-semibold text-ink-3">
            <span data-testid="test-progress">
              {pos + 1} / {items.length} · {TIER_NAME[cur.t]}
            </span>
            <span className={cn("tnum flex items-center gap-1", left < 30000 && "text-forget")}>
              <Timer className="size-4" />
              {mm}:{String(ss).padStart(2, "0")}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-2">
            <div className="h-full bg-ink transition-all" style={{ width: `${(pos / items.length) * 100}%` }} />
          </div>
          <div key={pos} className="card-in mt-6 flex flex-1 items-center justify-center rounded-2xl border border-rule bg-paper-3">
            <h2 className="font-display break-all px-6 text-center text-[3rem] font-semibold tracking-[-0.03em]" data-testid="test-word">
              {cur.w.w}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5 py-5">
            <button type="button" onClick={() => mark(true)} data-testid="test-know" className="h-16 rounded-2xl bg-know text-[1.0625rem] font-semibold text-white">
              认识
            </button>
            <button type="button" onClick={() => mark(false)} data-testid="test-unknown" className="h-16 rounded-2xl bg-forget-soft text-[1.0625rem] font-semibold text-forget">
              不认识
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="card-in flex flex-1 flex-col pb-6" data-testid="test-result">
          <div className="mt-4 rounded-2xl hero-gradient p-6 text-white">
            <div className="text-sm font-semibold text-white/80">你的四级词汇量约</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="tnum font-display text-[4rem] font-semibold leading-none" data-testid="test-est">
                {result.est}
              </span>
              <span className="text-lg font-semibold text-white/80">/ {index.list.length}</span>
            </div>
            <div className="mt-2 text-[0.8125rem] text-white/85">共测 {known.length} 词，认识 {result.knownWords.length} 个</div>
          </div>
          <div className="mt-4 space-y-2.5">
            {result.per.map((p, t) => (
              <div key={t} className="rounded-2xl bg-paper-3 p-4 ring-1 ring-rule">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">
                    {TIER_NAME[t]} <span className="font-normal text-ink-3">· {p.size} 词</span>
                  </span>
                  <span className="tnum font-semibold">{p.n ? `${Math.round(p.rate * 100)}%` : "未测"}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-2">
                  <div className="h-full rounded-full bg-know" style={{ width: `${p.rate * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          {result.knownWords.length > 0 && (
            <div className="mt-4 rounded-2xl bg-paper-2 p-4">
              <div className="text-[0.8125rem] text-ink-3">认识的词</div>
              <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                {result.knownWords.map((w) => (
                  <span key={w} title={shortMeaning(index.map.get(w)!, 1)} className="rounded-lg bg-paper-3 px-2 py-1 text-[0.8125rem] font-semibold">
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex-1" />
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
              className="mt-5 flex h-14 items-center justify-center gap-2 rounded-2xl bg-paper-2 text-[0.9375rem] font-semibold disabled:opacity-60"
            >
              <Check className="size-5" />
              {marked ? "已斩掉这些词" : `把 ${result.knownWords.length} 个认识的词斩掉（以后不再出现）`}
            </button>
          )}
          <Link to="/" data-testid="test-home" className="mt-2.5 flex h-14 items-center justify-center rounded-2xl bg-ink text-base font-semibold text-paper-3">
            开始背单词
          </Link>
        </div>
      )}
    </div>
  );
}
