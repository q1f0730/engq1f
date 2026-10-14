import { Suspense, lazy, useEffect, useState } from "react";
import { ChevronLeft, ListPlus, Play, Star, Swords, Undo2, Volume2 } from "@/components/app/icons";
import { confusables } from "@/lib/confusables";
import { sayEnglish, speak } from "@/lib/audio";
import { useExamples } from "@/lib/examples";
import { getWordsSync, posLabel, shortMeaning, type Word, type WordIndex } from "@/lib/data";
import { diffDays, isLeech, type Card } from "@/lib/srs";
import { getState, killWord, resetWord, toggleStar, unkillWord, useApp } from "@/lib/store";
import { today } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { BottomSheet } from "./sheet";
import { ListPicker } from "./lists";
import { WordTrack } from "./track";
import { wordTrack, type RevEntry } from "@/lib/stats";

/** v9 · 同义词组 + 同根形词：按需加载 */
const WordExtra = lazy(() => import("./word-extra"));

/** 11.1 · 单词标题按字数缩字号：360 宽下最长的四级词（15 个字母）也一行放下，不在词中间断开 */
export function titleSize(w: string): string {
  if (w.length <= 9) return "text-[3rem]";
  if (w.length <= 11) return "text-[2.625rem]";
  if (w.length <= 13) return "text-[2.25rem]";
  return "text-[2rem]";
}

/** 11.1 · 截断的美音音标（administration → /əd/）：比英音短很多就用英音 */
const ipaLen = (s: string) => s.replace(/[()ːˈˌ'.]/g, "").length;
export function ipaOf(word: Word, accent: "us" | "uk"): string {
  if (!word.p) return "";
  const [us, uk] = word.p;
  if (accent === "uk") return uk || us || "";
  if (us && uk && ipaLen(us) <= 0.6 * ipaLen(uk) && ipaLen(uk) - ipaLen(us) >= 3) return uk;
  return us || uk || "";
}

export function Phonetic({ word, accent, className }: { word: Word; accent: "us" | "uk"; className?: string }) {
  const p = ipaOf(word, accent);
  // 没有音标就整行不显示，不留空的 //
  if (!p) return null;
  return (
    <span className={cn("font-ipa", className)} data-testid="ipa">
      /{p}/
    </span>
  );
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
        "press grid size-10 place-items-center rounded-lg text-ink ring-1 ring-rule-strong ring-inset hover:bg-mark",
        className,
      )}
    >
      <Volume2 className="size-[18px]" />
    </button>
  );
}

export function Meanings({ word, size = "md" }: { word: Word; size?: "md" | "lg" }) {
  return (
    <ul className="space-y-2.5" data-testid="meanings">
      {word.t.map(([pos, m], k) => (
        <li key={k} className={cn("flex items-baseline gap-2.5 leading-relaxed text-ink", size === "lg" ? "text-[1.0625rem]" : "text-[0.9375rem]")}>
          {/* 12.0 · 词性：词典的斜体衬线，不是灰色小药丸 */}
          {pos && (
            <span className={cn("pos min-w-[1.9em] shrink-0 text-ink-3", size === "lg" ? "text-[1.1875rem]" : "text-[1.0625rem]")}>
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
      <div className="section-rule mb-2.5 text-[0.8125rem] text-ink-3">常用短语</div>
      <ul className="space-y-2">
        {word.ph.slice(0, max).map(([a, b]) => (
          <li key={a} className="flex flex-wrap items-baseline gap-x-2.5 text-sm leading-snug">
            <span className="font-medium text-ink">{a}</span>
            <span className="text-ink-3">{b}</span>
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
      <b className="hl font-normal text-ink">{m[0]}</b>
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
      <div className="section-rule mb-2.5 text-[0.8125rem] text-ink-3">例句</div>
      <ul className="space-y-3">
        {list.map((s) => (
          <li key={s} className="flex items-start gap-2.5">
            <span className="min-w-0 flex-1 font-serif text-[1.0625rem] leading-[1.5] text-ink" data-testid="example">
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
              className="press -mt-1 grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-mark hover:text-mark-ink"
            >
              <Play className="ml-px size-3.5 fill-current" />
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
      <div className="section-rule mb-1.5 text-[0.8125rem] text-ink-3">形近词 · 别认混</div>
      <ul className="divide-y divide-rule">
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
              className="press flex min-h-11 w-full items-baseline gap-3 py-2 text-left hover:bg-paper-2/60"
            >
              <span className="shrink-0 font-serif text-[1.25rem] leading-tight">
                <DiffWord a={word.w} b={c.w} />
              </span>
              <span className="min-w-0 truncate text-[0.8125rem] text-ink-3">{shortMeaning(c, 1)}</span>
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
      {mid && <span className="hl text-ink">{mid}</span>}
      {b.slice(b.length - suf)}
    </>
  );
}

export function StateBadge({ card }: { card: Card | undefined }) {
  if (isLeech(card))
    return (
      <span className="rounded-[3px] bg-forget px-1.5 py-px text-[0.6875rem] font-semibold text-paper-3" data-testid="leech-badge">
        顽固
      </span>
    );
  const s = !card ? "new" : card.k ? "killed" : card.st;
  const map = {
    new: ["未学", "text-ink-3 ring-1 ring-rule-strong ring-inset"],
    learning: ["学习中", "bg-forget-soft text-forget"],
    review: ["复习中", "bg-vague-soft text-vague"],
    mastered: ["已掌握", "bg-know-soft text-know"],
    killed: ["已斩", "bg-know-soft text-know"],
  } as const;
  const [label, cls] = map[s];
  return <span className={cn("rounded-[3px] px-1.5 py-px text-[0.6875rem] font-medium", cls)}>{label}</span>;
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
            className="press -ml-1 mb-2 flex h-9 items-center gap-0.5 rounded-md pr-2 text-[0.8125rem] font-medium text-ink-3 hover:text-ink"
          >
            <ChevronLeft className="size-4" /> 返回 {trail.length > 1 ? trail[trail.length - 2].w : base?.w}
          </button>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={cn("word-head whitespace-nowrap leading-[1.02]", titleSize(word.w))} data-testid="sheet-word">
              {word.w}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
              {word.p && ipaOf(word, "us") === ipaOf(word, "uk") && (
                // 11.2 · 美音、英音音标一样（或美音退回英音）：音标只写一次，两种发音照样能点
                <span className="flex items-center gap-2" data-testid="sheet-ipa-one">
                  <span className="font-ipa">/{ipaOf(word, "us")}/</span>
                  <button className="press flex h-9 items-center gap-1 rounded-md px-1.5 hover:bg-paper-2 hover:text-ink" onClick={() => speak(word.w, "us")} aria-label="美音">
                    美 <Volume2 className="size-3.5" />
                  </button>
                  <button className="press flex h-9 items-center gap-1 rounded-md px-1.5 hover:bg-paper-2 hover:text-ink" onClick={() => speak(word.w, "uk")} aria-label="英音">
                    英 <Volume2 className="size-3.5" />
                  </button>
                </span>
              )}
              {word.p && ipaOf(word, "us") !== ipaOf(word, "uk") && (
                <>
                  <button className="press flex h-9 items-center gap-1.5 rounded-md hover:text-ink" onClick={() => speak(word.w, "us")}>
                    美 <span className="font-ipa">/{ipaOf(word, "us")}/</span> <Volume2 className="size-3.5" />
                  </button>
                  <button className="press flex h-9 items-center gap-1.5 rounded-md hover:text-ink" onClick={() => speak(word.w, "uk")}>
                    英 <span className="font-ipa">/{ipaOf(word, "uk")}/</span> <Volume2 className="size-3.5" />
                  </button>
                </>
              )}
              {!word.p && <SpeakButton word={word.w} accent={accent} className="size-8" />}
            </div>
          </div>
          <span className="shrink-0 whitespace-nowrap pt-2">
            <StateBadge card={card} />
          </span>
        </div>
        <div className="fs-card mt-5 border-t border-rule pt-4">
          <Meanings word={word} />
        </div>
        <div className="mt-5">
          <Phrases word={word} />
        </div>
        <div className="mt-5 empty:hidden">
          <Confusables index={getWordsSync()} word={word} accent={accent} onOpen={(c) => setTrail((t) => [...t, c])} />
        </div>
        <div className="mt-5 empty:hidden">
          <Suspense fallback={null}>
            <WordExtra word={word} onOpen={(c) => setTrail((t) => [...t, c])} />
          </Suspense>
        </div>
        <div className="mt-5 empty:hidden">
          <Examples word={word} enabled={open} />
        </div>

        <div className="mt-7">
          <div className="section-rule mb-3 text-[0.8125rem] text-ink-3">学习记录</div>
          {card ? (
            <dl className="grid grid-cols-3 gap-y-4">
              <Stat label="首次学习" value={card.f.slice(5).replace("-", "/")} />
              <Stat label="复习次数" value={String(card.r)} />
              <Stat label="遗忘次数" value={String(card.l)} />
              <Stat label="当前间隔" value={card.k ? "—" : `${card.i} 天`} />
              <Stat label="难度系数" value={card.e.toFixed(2)} />
              <Stat label="下次复习" value={card.k ? "不再复习" : fmtDay(card.d)} />
            </dl>
          ) : (
            <p className="text-sm text-ink-3">还没学过这个词。</p>
          )}
        </div>

        <TrackBlock w={word.w} log={st.revlog ?? []} learned={!!card} />

        <div className="mt-6 grid grid-cols-3 gap-2">
          <button
            onClick={() => {
              toggleStar(word.w);
              // 11.1 · 弹层里也给个回执（toast 此时在顶部，不挡弹层按钮）
              toast.success(starred ? "已移出生词本" : "已加入生词本", { id: "sheet-star" });
            }}
            data-testid="sheet-star"
            className={cn(
              "press flex h-11 items-center justify-center gap-1.5 rounded-lg text-[0.8125rem] font-medium",
              starred ? "bg-mark text-mark-ink" : "bg-paper-2 hover:bg-rule",
            )}
          >
            <Star className={cn("size-4", starred && "fill-current")} />
            {starred ? "已收藏" : "生词本"}
          </button>
          {card?.k ? (
            <button onClick={() => unkillWord(word.w)} className="press flex h-11 items-center justify-center gap-1.5 rounded-lg bg-paper-2 text-[0.8125rem] font-medium hover:bg-rule">
              <Undo2 className="size-4" /> 取消斩
            </button>
          ) : (
            <button
              onClick={() => killWord(word.w)}
              data-testid="sheet-kill"
              className="press flex h-11 items-center justify-center gap-1.5 rounded-lg bg-know-soft text-[0.8125rem] font-medium text-know"
            >
              <Swords className="size-4" /> 斩
            </button>
          )}
          <button
            onClick={() => resetWord(word.w)}
            disabled={!card}
            className="press flex h-11 items-center justify-center gap-1.5 rounded-lg bg-paper-2 text-[0.8125rem] font-medium hover:bg-rule disabled:opacity-40"
          >
            重新学
          </button>
        </div>
        <button
          type="button"
          data-testid="sheet-list"
          onClick={() => setPicker(true)}
          className="press mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-lg text-[0.8125rem] font-medium ring-1 ring-rule-strong ring-inset hover:bg-paper-2"
        >
          <ListPlus className="size-4" />
          加入词单
          {(() => {
            const n = (st.lists ?? []).filter((l) => l.words.includes(word.w)).length;
            return n ? <span className="text-ink-3" data-testid="sheet-list-n">· 已在 {n} 个</span> : null;
          })()}
        </button>
        <ListPicker open={picker} onOpenChange={setPicker} words={[word.w]} />
      </div>
    </BottomSheet>
  );
}

/** 记忆轨迹：这个词每次作答的时间轴 */
function TrackBlock({ w, log, learned }: { w: string; log: RevEntry[]; learned: boolean }) {
  const [all, setAll] = useState(false);
  const entries = wordTrack(log, w);
  if (!learned && !entries.length) return null;
  const ok = entries.filter((e) => e[2] >= 2).length;
  return (
    <div className="mt-7" data-testid="word-track">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-[0.8125rem] text-ink-3">记忆轨迹</span>
        {entries.length > 0 && (
          <span className="tnum text-xs text-ink-3" data-testid="track-sum">
            {entries.length} 次作答 · 记得 {ok} 次
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-[0.8125rem] text-ink-3" data-testid="track-empty">这个词还没有作答记录（v6 起开始记录）。</p>
      ) : (
        <>
          <WordTrack entries={entries} max={all ? entries.length : 6} testid="track-list" />
          {entries.length > 6 && (
            <button type="button" data-testid="track-all" onClick={() => setAll((v) => !v)} className="press mt-2 h-9 text-[0.8125rem] font-medium text-ink underline decoration-rule-strong underline-offset-4">
              {all ? "收起" : `查看全部 ${entries.length} 次`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.75rem] text-ink-3">{label}</dt>
      <dd className="tnum mt-1 text-[1rem] font-medium">{value}</dd>
    </div>
  );
}
