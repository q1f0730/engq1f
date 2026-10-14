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
      {/* 12.0 · 预习 = 一张生词表。抬头是大号词数 + 一句说明，表里每行一个词条，右边「斩」；斩掉的词被墨线划掉 */}
      <header className="flex shrink-0 items-start gap-2 pt-3">
        <button type="button" onClick={onQuit} aria-label="退出" className="press -ml-2 grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-paper-2 hover:text-ink">
          <X className="size-[22px]" />
        </button>
        <div className="min-w-0 flex-1 pt-1.5">
          <h1 className="flex items-baseline gap-2">
            <span className="tnum font-serif text-[1.75rem] leading-none">{words.length}</span>
            <span className="text-[0.9375rem] font-medium">个新词 · 先预习</span>
          </h1>
          <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-3">已经认识的点「斩」，不用再学；剩下的进入学习。</p>
        </div>
      </header>
      <ol className="card-in mt-4 min-h-0 flex-1 overflow-y-auto border-t border-ink pb-2" data-testid="preview-list">
        {words.map((w, i) => {
          const word = index.map.get(w);
          if (!word) return null;
          const k = killed.has(w);
          return (
            <li key={w} data-testid="preview-row" data-w={w} data-killed={k ? 1 : 0} className={cn("grid min-h-16 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-2 border-b border-rule py-2 transition-colors", k && "bg-paper-2/60")}>
              <span className="tnum self-start pt-1.5 font-serif text-[0.875rem] text-ink-3">{i + 1}</span>
              <div className={cn("min-w-0", k && "opacity-50")}>
                <div className="flex items-center gap-1.5">
                  <span className={cn("word-head truncate text-[1.5rem] leading-tight", k && "line-through decoration-1")}>{w}</span>
                  <button type="button" aria-label={`朗读 ${w}`} onClick={() => speak(w, accent)} className="press grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-mark hover:text-ink">
                    <Volume2 className="size-3.5" />
                  </button>
                </div>
                <div className="fs-card flex min-w-0 items-baseline gap-2 text-[0.8125rem] text-ink-2">
                  <Phonetic word={word} accent={accent} className="shrink-0 text-[0.75rem] text-ink-3" />
                  <span className="truncate">{shortMeaning(word, 2)}</span>
                </div>
              </div>
              <button
                type="button"
                data-testid="preview-kill"
                aria-pressed={k}
                onClick={() => toggle(w)}
                className={cn("press flex h-10 min-w-16 items-center justify-center gap-1 rounded-lg px-3 text-[0.8125rem] font-medium", k ? "bg-ink text-paper-3" : "text-ink-2 ring-1 ring-rule-strong ring-inset hover:bg-know-soft hover:text-know")}
              >
                {k ? <Undo2 className="size-3.5" /> : <Swords className="size-3.5" />}
                {k ? "已斩" : "斩"}
              </button>
            </li>
          );
        })}
      </ol>
      <footer className="shrink-0 pb-4 pt-3">
        <button type="button" onClick={start} data-testid="preview-start" className="press flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-ink text-base font-semibold text-paper-3 hover:bg-ink-2">
          {left > 0 ? `开始学习 ${left} 词` : "全部认识，换一组"}
          {killed.size > 0 && (
            <span className="rounded-[2px] bg-mark px-1.5 text-[0.75rem] font-semibold text-mark-ink" data-testid="preview-killed-n">
              斩 {killed.size}
            </span>
          )}
        </button>
      </footer>
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
      {/* 12.0 · 抬头：左边关闭 + 「学后速测」和一行说明，右边大号进度；下面一排格子，一格一题（答对墨色，答错砖红） */}
      <header className="shrink-0 pt-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onSkip} aria-label="跳过速测" data-testid="post-skip" className="press -ml-2 grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-paper-2 hover:text-ink">
            <X className="size-[22px]" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-medium leading-tight">学后速测</p>
            <p className="truncate text-[0.75rem] text-ink-3">刚学的词马上检验 · 不影响复习计划</p>
          </div>
          <span className="tnum shrink-0 font-serif text-[1.375rem] leading-none" data-testid="post-progress">
            {pos + 1}/{order.length}
          </span>
        </div>
        <ol className="mt-3 flex h-1.5 gap-[3px]" aria-hidden>
          {order.map((ow, k) => (
            <li key={ow} className={cn("h-full flex-1 transition-colors duration-300", k < pos || (k === pos && done) ? (res[ow] ? "bg-ink" : "bg-forget") : k === pos ? "bg-mark" : "bg-rule")} />
          ))}
        </ol>
      </header>
      <div key={pos} className="card-in flex min-h-0 flex-1 flex-col" data-testid="post-item" data-w={word.w}>
        <QuizPrompt word={word} mode="en2cn" accent={accent} seed={seed} done={done} compact />
        <ChoiceList choices={choices} done={done} pick={pick ?? undefined} wrong={done && !ok && pick !== -1} onPick={choose} />
      </div>
      <footer className="shrink-0 border-t border-rule pb-4 pt-3">
        {!done && (
          <button type="button" onClick={() => choose(-1)} data-testid="post-giveup" className="press flex h-12 w-full items-center justify-center gap-1.5 rounded-xl text-[0.875rem] font-medium text-ink-2 ring-1 ring-inset ring-rule-strong hover:bg-paper-2 hover:text-ink">
            <CircleHelp className="size-4" />
            忘了，看答案
          </button>
        )}
        {done && (
          <button
            type="button"
            onClick={next}
            data-testid="post-next"
            className={cn("press flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold", ok ? "bg-mark text-mark-ink" : "bg-ink text-paper-3 hover:bg-ink-2")}
          >
            {pos + 1 >= order.length ? "看小结" : ok ? "答对了 · 下一个" : "记住它 · 下一个"}
          </button>
        )}
      </footer>
    </div>
  );
}
