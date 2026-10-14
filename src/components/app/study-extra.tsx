import { CircleHelp, Eye, Swords, Undo2, Volume2, X } from "@/components/app/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { speak } from "@/lib/audio";
import { shortMeaning, type WordIndex } from "@/lib/data";
import { choicesFor } from "@/lib/exam";
import { buzz } from "@/lib/haptics";
import { hashStr, shuffle } from "@/lib/srs";
import { cn } from "@/lib/utils";
import { ChoiceList, QuizPrompt } from "./study";
import { Phonetic } from "./word-bits";

/** v9 · 新词预习：开始一组新词前先过一遍，认识的直接斩掉 */
export function PreviewList({
  index,
  words,
  accent,
  onStart,
  onQuit,
}: {
  index: WordIndex;
  words: string[];
  accent: "us" | "uk";
  onStart: (killed: string[]) => void;
  onQuit: () => void;
}) {
  const [killed, setKilled] = useState<Set<string>>(() => new Set());
  // 换了一组（全部斩掉后）清空选择
  useEffect(() => setKilled(new Set()), [words]);
  const toggle = (w: string) =>
    setKilled((s) => {
      const n = new Set(s);
      if (n.has(w)) n.delete(w);
      else n.add(w);
      return n;
    });
  const left = words.length - killed.size;
  const start = useCallback(() => onStart(words.filter((w) => killed.has(w))), [onStart, words, killed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start]);
  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col px-4 pb-safe pt-safe" data-testid="preview">
      <div className="flex shrink-0 items-center gap-2 pt-3">
        <button type="button" onClick={onQuit} aria-label="退出" className="grid size-10 place-items-center rounded-full text-ink-3 hover:bg-paper-2">
          <X className="size-5" />
        </button>
        <div className="flex-1 text-center text-[0.9375rem] font-semibold">预习这组新词</div>
        <span className="tnum w-10 text-center text-[0.8125rem] font-semibold text-ink-3">{words.length}</span>
      </div>
      <div className="mt-2 flex shrink-0 items-center gap-2.5 rounded-2xl bg-mark-soft px-3.5 py-2.5 text-[0.8125rem] text-ink">
        <Eye className="size-4 shrink-0" />
        <span className="leading-snug">先过一眼：已经认识的点「斩」，不用再学；剩下的进入学习。</span>
      </div>
      <ul className="card-in mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pb-2" data-testid="preview-list">
        {words.map((w) => {
          const word = index.map.get(w);
          if (!word) return null;
          const k = killed.has(w);
          return (
            <li
              key={w}
              data-testid="preview-row"
              data-w={w}
              data-killed={k ? 1 : 0}
              className={cn("flex items-center gap-2 rounded-2xl border px-3 py-2.5 transition", k ? "border-transparent bg-know-soft/60" : "border-rule bg-paper-3")}
            >
              <button type="button" aria-label={`朗读 ${w}`} onClick={() => speak(w, accent)} className="grid size-8 shrink-0 place-items-center rounded-full bg-mark-soft text-ink active:scale-90">
                <Volume2 className="size-4" />
              </button>
              <div className={cn("min-w-0 flex-1", k && "opacity-55")}>
                <div className="flex items-baseline gap-2">
                  <span className={cn("font-display truncate text-[1.0625rem] font-semibold", k && "line-through decoration-2")}>{w}</span>
                  <Phonetic word={word} accent={accent} className="truncate text-xs text-ink-3" />
                </div>
                <div className="fs-card truncate text-[0.8125rem] text-ink-3">{shortMeaning(word, 2)}</div>
              </div>
              <button
                type="button"
                data-testid="preview-kill"
                aria-pressed={k}
                onClick={() => toggle(w)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-semibold transition active:scale-95",
                  k ? "bg-know text-white dark:text-[oklch(0.2_0.02_170)]" : "bg-paper-2 text-ink-3 hover:text-know",
                )}
              >
                {k ? <Undo2 className="size-3.5" /> : <Swords className="size-3.5" />}
                {k ? "已斩" : "斩"}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="shrink-0 pb-4 pt-3">
        <button
          type="button"
          onClick={start}
          data-testid="preview-start"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-base font-semibold text-paper-3 shadow-primary/25 transition active:scale-[0.98]"
        >
          {left > 0 ? `开始学习 ${left} 词` : "全部认识，换一组"}
          {killed.size > 0 && <span className="rounded-md bg-white/20 px-1.5 text-xs font-semibold" data-testid="preview-killed-n">斩 {killed.size}</span>}
        </button>
      </div>
    </div>
  );
}

/** v9 · 学后速测：一组新词学完，马上英选中四选一过一遍（不改复习计划） */
export function PostQuiz({
  index,
  words,
  accent,
  seed,
  onDone,
  onSkip,
}: {
  index: WordIndex;
  words: string[];
  accent: "us" | "uk";
  seed: number;
  onDone: (res: Record<string, boolean>) => void;
  onSkip: () => void;
}) {
  const order = useMemo(() => shuffle(words, (seed ^ hashStr("post")) >>> 0), [words, seed]);
  const [pos, setPos] = useState(0);
  const [res, setRes] = useState<Record<string, boolean>>({});
  const [pick, setPick] = useState<number | null>(null);
  const w = order[pos];
  const word = w ? index.map.get(w) : undefined;
  const choices = useMemo(() => (word ? choicesFor(index, word, "en2cn", (seed + pos * 7919) >>> 0) : []), [index, word, seed, pos]);
  const done = pick !== null;

  useEffect(() => {
    if (word && !done) speak(word.w, accent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  const choose = useCallback(
    (k: number) => {
      if (done || !word || (k >= 0 && !choices[k])) return;
      const ok = k >= 0 && choices[k].correct;
      buzz(ok ? "know" : "forget");
      setPick(k);
      setRes((r) => ({ ...r, [word.w]: ok }));
    },
    [done, word, choices],
  );
  const next = useCallback(() => {
    if (!done) return;
    if (pos + 1 >= order.length) onDone(res);
    else {
      setPos((p) => p + 1);
      setPick(null);
    }
  }, [done, pos, order.length, onDone, res]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!done && ["1", "2", "3", "4"].includes(e.key)) choose(Number(e.key) - 1);
      else if (done && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, choose, next]);

  if (!word) return null;
  const ok = done && pick !== null && pick >= 0 && choices[pick]?.correct;
  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col px-4 pb-safe pt-safe" data-testid="post-quiz">
      <div className="flex shrink-0 items-center gap-2 pt-3">
        <button type="button" onClick={onSkip} aria-label="跳过速测" data-testid="post-skip" className="grid size-10 place-items-center rounded-full text-ink-3 hover:bg-paper-2">
          <X className="size-5" />
        </button>
        <div className="flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-paper-2">
            <div className="h-full rounded-full bg-know transition-all duration-300" style={{ width: `${((pos + (done ? 1 : 0)) / order.length) * 100}%` }} />
          </div>
        </div>
        <span className="tnum min-w-11 text-center text-[0.8125rem] font-semibold text-ink-3" data-testid="post-progress">
          {pos + 1}/{order.length}
        </span>
      </div>
      <div className="mt-1 flex h-6 shrink-0 items-center justify-center gap-2 text-xs font-medium text-ink-3">
        <span className="rounded-lg bg-know-soft px-2 py-px text-know">学后速测</span>
        <span>刚学的词马上检验 · 不影响复习计划</span>
      </div>
      <div key={pos} className="card-in flex min-h-0 flex-1 flex-col" data-testid="post-item" data-w={word.w}>
        <QuizPrompt word={word} mode="en2cn" accent={accent} seed={seed} done={done} compact />
        <ChoiceList choices={choices} done={done} pick={pick ?? undefined} wrong={done && !ok && pick !== -1} onPick={choose} />
      </div>
      <div className="shrink-0 pb-4 pt-3">
        {done ? (
          <button
            type="button"
            onClick={next}
            data-testid="post-next"
            className={cn(
              "flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold transition active:scale-[0.98]",
              ok ? "bg-know text-white shadow-know/25" : "bg-ink text-paper-3 shadow-primary/25",
            )}
          >
            {pos + 1 >= order.length ? "看小结" : ok ? "答对了 · 下一个" : "记住它 · 下一个"}
          </button>
        ) : (
          <button type="button" onClick={() => choose(-1)} data-testid="post-giveup" className="h-11 w-full rounded-2xl text-sm font-semibold text-ink-3 hover:bg-paper-2">
            <CircleHelp className="mr-1.5 inline size-4" />
            忘了，看答案
          </button>
        )}
      </div>
    </div>
  );
}
