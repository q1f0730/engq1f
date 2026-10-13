import { useEffect, useState } from "react";
import { ChevronLeft, ListPlus, Play, Star, Swords, Undo2, Volume2 } from "lucide-react";
import { confusables } from "@/lib/confusables";
import { sayEnglish, speak } from "@/lib/audio";
import { useExamples } from "@/lib/examples";
import { getWordsSync, posLabel, shortMeaning, type Word, type WordIndex } from "@/lib/data";
import { diffDays, isLeech, type Card } from "@/lib/srs";
import { getState, killWord, resetWord, toggleStar, unkillWord, useApp } from "@/lib/store";
import { today } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./sheet";
import { ListPicker } from "./lists";

export function Phonetic({ word, accent, className }: { word: Word; accent: "us" | "uk"; className?: string }) {
  if (!word.p) return null;
  const p = accent === "uk" ? word.p[1] : word.p[0];
  return <span className={cn("font-ipa", className)}>/{p}/</span>;
}

export function SpeakButton({ word, accent, className, label }: { word: string; accent: "us" | "uk"; className?: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        speak(word, accent);
      }}
      aria-label={label ?? "播放发音"}
      className={cn(
        "grid size-9 place-items-center rounded-full bg-brand-soft text-primary transition-transform active:scale-90",
        className,
      )}
    >
      <Volume2 className="size-[18px]" />
    </button>
  );
}

export function Meanings({ word, size = "md" }: { word: Word; size?: "md" | "lg" }) {
  return (
    <ul className="space-y-2" data-testid="meanings">
      {word.t.map(([pos, m], k) => (
        <li key={k} className={cn("flex gap-2.5 leading-relaxed", size === "lg" ? "text-[17px]" : "text-[15px]")}>
          {pos && (
            <span className="mt-[3px] h-fit shrink-0 rounded-md bg-secondary px-1.5 py-px text-[12px] font-semibold italic text-muted-foreground">
              {posLabel(pos)}
            </span>
          )}
          <span className="min-w-0">{m}</span>
        </li>
      ))}
    </ul>
  );
}

export function Phrases({ word, max = 6 }: { word: Word; max?: number }) {
  if (!word.ph?.length) return null;
  return (
    <div>
      <div className="mb-2 text-[12px] font-bold tracking-wider text-muted-foreground">常用短语</div>
      <ul className="space-y-1.5">
        {word.ph.slice(0, max).map(([a, b]) => (
          <li key={a} className="flex flex-wrap items-baseline gap-x-2 text-[14px] leading-snug">
            <span className="font-semibold text-foreground">{a}</span>
            <span className="text-muted-foreground">{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function highlight(sentence: string, word: string) {
  const stem = word.length > 4 ? word.slice(0, word.length - 2) : word;
  const re = new RegExp(`\\b(${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[a-z]*)`, "i");
  const m = sentence.match(re);
  if (!m || m.index === undefined) return sentence;
  return (
    <>
      {sentence.slice(0, m.index)}
      <b className="font-semibold text-primary">{m[0]}</b>
      {sentence.slice(m.index + m[0].length)}
    </>
  );
}

/** 英文例句：在线懒加载，没有就整块不显示 */
export function Examples({ word, enabled = true }: { word: Word; enabled?: boolean }) {
  const list = useExamples(word.w, enabled);
  if (!list.length) return null;
  return (
    <div data-testid="examples">
      <div className="mb-2 text-[12px] font-bold tracking-wider text-muted-foreground">例句</div>
      <ul className="space-y-2">
        {list.map((s) => (
          <li key={s} className="flex items-start gap-2">
            <span className="min-w-0 flex-1 border-l-2 border-primary/30 pl-3 text-[14px] leading-relaxed text-foreground/85" data-testid="example">
              {highlight(s, word.w)}
            </span>
            <button
              type="button"
              aria-label="朗读例句"
              title="朗读例句"
              data-testid="example-play"
              onClick={(e) => {
                e.stopPropagation();
                void sayEnglish(s, getState().settings.accent);
              }}
              className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-primary transition active:scale-90"
            >
              <Play className="ml-px size-3 fill-current" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 形近词：拼写相近的四级词，点一下发音（或在详情里跳转） */
export function Confusables({
  index,
  word,
  accent,
  onOpen,
}: {
  index: WordIndex | null;
  word: Word;
  accent: "us" | "uk";
  onOpen?: (w: Word) => void;
}) {
  if (!index) return null;
  const list = confusables(index, word);
  if (!list.length) return null;
  return (
    <div data-testid="confusables">
      <div className="mb-2 text-[12px] font-bold tracking-wider text-muted-foreground">形近词 · 别认混</div>
      <ul className="space-y-1.5">
        {list.map((c) => (
          <li key={c.w}>
            <button
              type="button"
              data-testid="confusable"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpen) onOpen(c);
                else speak(c.w, accent);
              }}
              className="flex w-full items-baseline gap-2.5 rounded-xl bg-secondary/70 px-3 py-2 text-left transition hover:bg-secondary active:scale-[0.99]"
            >
              <span className="font-display shrink-0 text-[15px] font-bold">
                <DiffWord a={word.w} b={c.w} />
              </span>
              <span className="min-w-0 truncate text-[13px] text-muted-foreground">{shortMeaning(c, 1)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 标出 b 中和 a 不同的字母 */
function DiffWord({ a, b }: { a: string; b: string }) {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const mid = b.slice(pre, b.length - suf);
  return (
    <>
      {b.slice(0, pre)}
      {mid && <span className="text-primary underline decoration-2 underline-offset-2">{mid}</span>}
      {b.slice(b.length - suf)}
    </>
  );
}

export function StateBadge({ card }: { card: Card | undefined }) {
  if (isLeech(card))
    return (
      <span className="rounded-full bg-forget px-2 py-0.5 text-[11px] font-semibold text-white" data-testid="leech-badge">
        顽固
      </span>
    );
  const s = !card ? "new" : card.k ? "killed" : card.st;
  const map = {
    new: ["未学", "bg-secondary text-muted-foreground"],
    learning: ["学习中", "bg-forget-soft text-forget"],
    review: ["复习中", "bg-vague-soft text-vague"],
    mastered: ["已掌握", "bg-know-soft text-know"],
    killed: ["已斩", "bg-know-soft text-know"],
  } as const;
  const [label, cls] = map[s];
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)}>{label}</span>;
}

function fmtDay(d: string) {
  const t = today();
  const n = diffDays(t, d);
  if (n <= 0) return "今天";
  if (n === 1) return "明天";
  if (n < 30) return `${n} 天后`;
  return d.replace(/-/g, "/");
}

export function WordSheet({ word: base, open, onOpenChange }: { word: Word | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const st = useApp();
  // 从形近词跳转过来的词（可以返回）
  const [trail, setTrail] = useState<Word[]>([]);
  const [picker, setPicker] = useState(false);
  useEffect(() => setTrail([]), [base?.w, open]);
  const word = trail.length ? trail[trail.length - 1] : base;
  if (!word) return null;
  const card = st.cards[word.w];
  const starred = !!st.star[word.w];
  const accent = st.settings.accent;
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="单词详情" testid="word-sheet" hideTitle>
      <div className="pt-1">
        {trail.length > 0 && (
          <button
            type="button"
            data-testid="sheet-back"
            onClick={() => setTrail((t) => t.slice(0, -1))}
            className="-ml-1 mb-1 flex items-center gap-0.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> 返回 {trail.length > 1 ? trail[trail.length - 2].w : base?.w}
          </button>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display break-words text-[38px] font-extrabold leading-tight tracking-tight" data-testid="sheet-word">
              {word.w}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[14px] text-muted-foreground">
              {word.p && (
                <>
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => speak(word.w, "us")}>
                    美 <span className="font-ipa">/{word.p[0]}/</span> <Volume2 className="size-3.5" />
                  </button>
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => speak(word.w, "uk")}>
                    英 <span className="font-ipa">/{word.p[1]}/</span> <Volume2 className="size-3.5" />
                  </button>
                </>
              )}
              {!word.p && <SpeakButton word={word.w} accent={accent} className="size-8" />}
            </div>
          </div>
          <StateBadge card={card} />
        </div>
        <div className="mt-5">
          <Meanings word={word} />
        </div>
        <div className="mt-5">
          <Phrases word={word} />
        </div>
        <div className="mt-5 empty:hidden">
          <Confusables index={getWordsSync()} word={word} accent={accent} onOpen={(c) => setTrail((t) => [...t, c])} />
        </div>
        <div className="mt-5 empty:hidden">
          <Examples word={word} enabled={open} />
        </div>

        <div className="mt-6 rounded-2xl bg-secondary/70 p-4">
          <div className="mb-2 text-[12px] font-bold tracking-wider text-muted-foreground">学习记录</div>
          {card ? (
            <dl className="grid grid-cols-3 gap-y-3 text-center">
              <Stat label="首次学习" value={card.f.slice(5).replace("-", "/")} />
              <Stat label="复习次数" value={String(card.r)} />
              <Stat label="遗忘次数" value={String(card.l)} />
              <Stat label="当前间隔" value={card.k ? "—" : `${card.i} 天`} />
              <Stat label="难度系数" value={card.e.toFixed(2)} />
              <Stat label="下次复习" value={card.k ? "不再复习" : fmtDay(card.d)} />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">还没学过这个词。</p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            onClick={() => toggleStar(word.w)}
            data-testid="sheet-star"
            className={cn(
              "flex h-11 items-center justify-center gap-1.5 rounded-2xl text-[13px] font-semibold",
              starred ? "bg-vague-soft text-vague" : "bg-secondary",
            )}
          >
            <Star className={cn("size-4", starred && "fill-current")} />
            {starred ? "已收藏" : "生词本"}
          </button>
          {card?.k ? (
            <button onClick={() => unkillWord(word.w)} className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-secondary text-[13px] font-semibold">
              <Undo2 className="size-4" /> 取消斩
            </button>
          ) : (
            <button
              onClick={() => killWord(word.w)}
              data-testid="sheet-kill"
              className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-know-soft text-[13px] font-semibold text-know"
            >
              <Swords className="size-4" /> 斩
            </button>
          )}
          <button
            onClick={() => resetWord(word.w)}
            disabled={!card}
            className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-secondary text-[13px] font-semibold disabled:opacity-40"
          >
            重新学
          </button>
        </div>
        <button
          type="button"
          data-testid="sheet-list"
          onClick={() => setPicker(true)}
          className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-secondary text-[13px] font-semibold"
        >
          <ListPlus className="size-4" />
          加入词单
          {(() => {
            const n = (st.lists ?? []).filter((l) => l.words.includes(word.w)).length;
            return n ? <span className="text-muted-foreground" data-testid="sheet-list-n">· 已在 {n} 个</span> : null;
          })()}
        </button>
        <ListPicker open={picker} onOpenChange={setPicker} words={[word.w]} />
      </div>
    </BottomSheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="tnum mt-0.5 text-[15px] font-bold">{value}</dd>
    </div>
  );
}
