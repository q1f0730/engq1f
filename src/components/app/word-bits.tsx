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
  // 12.0 · 状态不是彩色胶囊：一个小方块（语气色）+ 一个词；只有「顽固」是实心的砖红字块
  if (isLeech(card))
    return (
      <span className="inline-flex h-5 items-center rounded-[2px] bg-forget-soft px-1.5 text-[0.6875rem] font-semibold text-forget" data-testid="leech-badge">
        顽固
      </span>
    );
  const s = !card ? "new" : card.k ? "killed" : card.st;
  const map = {
    new: ["未学", "border border-rule-strong"],
    learning: ["学习中", "bg-forget"],
    review: ["复习中", "bg-vague"],
    mastered: ["已掌握", "bg-know"],
    killed: ["已斩", "bg-ink"],
  } as const;
  const [label, dot] = map[s];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.6875rem] text-ink-2">
      <span className={cn("size-1.5 rounded-[1px]", dot)} aria-hidden />
      {label}
    </span>
  );
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
  const inLists = (st.lists ?? []).filter((l) => l.words.includes(word.w)).length;
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="单词详情" testid="word-sheet" hideTitle>
      <div className="pt-1">
        {trail.length > 0 && (
          <button
            type="button"
            data-testid="sheet-back"
            onClick={() => setTrail((t) => t.slice(0, -1))}
            className="press -ml-1.5 mb-2 flex h-9 items-center gap-1 rounded-md px-1.5 text-[0.8125rem] font-medium text-ink-3 hover:bg-paper-2 hover:text-ink"
          >
            <ChevronLeft className="size-4" /> 返回 {trail.length > 1 ? trail[trail.length - 2].w : base?.w}
          </button>
        )}
        {/* 12.0 · 一个完整的词典词条：词头 · 读音 · 释义 · 短语 · 形近词 · 例句，最后是「我和这个词」 */}
        <header className="border-b-2 border-ink pb-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className={cn("word-head min-w-0 whitespace-nowrap leading-[1.02]", titleSize(word.w))} data-testid="sheet-word">
              {word.w}
            </h2>
            <span className="shrink-0 pt-2">
              <StateBadge card={card} />
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.875rem] text-ink-2">
            {word.p && ipaOf(word, "us") === ipaOf(word, "uk") && (
              // 11.2 · 美音、英音音标一样（或美音退回英音）：音标只写一次，两种发音照样能点
              <span className="flex items-center gap-1.5" data-testid="sheet-ipa-one">
                <span className="font-ipa">/{ipaOf(word, "us")}/</span>
                <button className="press flex h-9 items-center gap-1 rounded-md px-1.5 ring-1 ring-rule ring-inset hover:bg-mark hover:text-ink" onClick={() => speak(word.w, "us")} aria-label="美音">
                  美 <Volume2 className="size-3.5" />
                </button>
                <button className="press flex h-9 items-center gap-1 rounded-md px-1.5 ring-1 ring-rule ring-inset hover:bg-mark hover:text-ink" onClick={() => speak(word.w, "uk")} aria-label="英音">
                  英 <Volume2 className="size-3.5" />
                </button>
              </span>
            )}
            {word.p && ipaOf(word, "us") !== ipaOf(word, "uk") && (
              <>
                <button className="press flex h-9 items-center gap-1.5 rounded-md px-1 hover:bg-paper-2 hover:text-ink" onClick={() => speak(word.w, "us")}>
                  <span className="text-[0.75rem] text-ink-3">美</span> <span className="font-ipa">/{ipaOf(word, "us")}/</span> <Volume2 className="size-3.5" />
                </button>
                <button className="press flex h-9 items-center gap-1.5 rounded-md px-1 hover:bg-paper-2 hover:text-ink" onClick={() => speak(word.w, "uk")}>
                  <span className="text-[0.75rem] text-ink-3">英</span> <span className="font-ipa">/{ipaOf(word, "uk")}/</span> <Volume2 className="size-3.5" />
                </button>
              </>
            )}
            {!word.p && <SpeakButton word={word.w} accent={accent} className="size-9" />}
          </div>
        </header>
        <div className="fs-card mt-4">
          <Meanings word={word} />
        </div>
        <div className="mt-6">
          <Phrases word={word} />
        </div>
        <div className="mt-6 empty:hidden">
          <Confusables index={getWordsSync()} word={word} accent={accent} onOpen={(c) => setTrail((t) => [...t, c])} />
        </div>
        <div className="mt-6 empty:hidden">
          <Suspense fallback={null}>
            <WordExtra word={word} onOpen={(c) => setTrail((t) => [...t, c])} />
          </Suspense>
        </div>
        <div className="mt-6 empty:hidden">
          <Examples word={word} enabled={open} />
        </div>

        <section className="mt-8 border-t border-ink pt-3">
          <h3 className="mb-3 text-[0.8125rem] font-medium text-ink-2">学习记录</h3>
          {card ? (
            <dl className="grid grid-cols-3 border-t border-rule">
              <Stat label="首次学习" value={card.f.slice(5).replace("-", "/")} />
              <Stat label="复习次数" value={String(card.r)} />
              <Stat label="遗忘次数" value={String(card.l)} />
              <Stat label="当前间隔" value={card.k ? "—" : `${card.i} 天`} />
              <Stat label="难度系数" value={card.e.toFixed(2)} />
              <Stat label="下次复习" value={card.k ? "不再复习" : fmtDay(card.d)} />
            </dl>
          ) : (
            <p className="text-[0.875rem] text-ink-3">还没学过这个词。</p>
          )}
        </section>

        <TrackBlock w={word.w} log={st.revlog ?? []} learned={!!card} />

        {/* 动作：一排四个，细线框；收藏后是荧光笔底 */}
        <div className="mt-7 grid grid-cols-4 gap-1.5">
          <button
            onClick={() => {
              toggleStar(word.w);
              // 11.1 · 弹层里也给个回执（toast 此时在顶部，不挡弹层按钮）
              toast.success(starred ? "已移出生词本" : "已加入生词本", { id: "sheet-star" });
            }}
            data-testid="sheet-star"
            aria-pressed={starred}
            className={cn("press flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[0.75rem] font-medium", starred ? "bg-mark text-mark-ink" : "ring-1 ring-rule-strong ring-inset hover:bg-paper-2")}
          >
            <Star className={cn("size-4", starred && "fill-current")} />
            {starred ? "已收藏" : "生词本"}
          </button>
          {card?.k ? (
            <button onClick={() => unkillWord(word.w)} className="press flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[0.75rem] font-medium ring-1 ring-rule-strong ring-inset hover:bg-paper-2">
              <Undo2 className="size-4" /> 取消斩
            </button>
          ) : (
            <button onClick={() => killWord(word.w)} data-testid="sheet-kill" className="press flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[0.75rem] font-medium text-know ring-1 ring-rule-strong ring-inset hover:bg-know-soft">
              <Swords className="size-4" /> 斩
            </button>
          )}
          <button
            onClick={() => resetWord(word.w)}
            disabled={!card}
            className="press flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[0.75rem] font-medium ring-1 ring-rule-strong ring-inset hover:bg-paper-2 disabled:opacity-40"
          >
            <span className="font-serif text-[1rem] leading-4" aria-hidden>
              ↺
            </span>
            重新学
          </button>
          <button
            type="button"
            data-testid="sheet-list"
            onClick={() => setPicker(true)}
            className="press flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[0.75rem] font-medium ring-1 ring-rule-strong ring-inset hover:bg-paper-2"
          >
            {inLists ? (
              <span className="tnum text-[0.6875rem] leading-4 text-ink-3" data-testid="sheet-list-n">
                已在 {inLists} 个
              </span>
            ) : (
              <ListPlus className="size-4" />
            )}
            加入词单
          </button>
        </div>
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
    <section className="mt-8 border-t border-ink pt-3" data-testid="word-track">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[0.8125rem] font-medium text-ink-2">记忆轨迹</h3>
        {entries.length > 0 && (
          <span className="tnum text-[0.75rem] text-ink-3" data-testid="track-sum">
            {entries.length} 次作答 · 记得 {ok} 次
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-[0.8125rem] text-ink-3" data-testid="track-empty">
          这个词还没有作答记录（v6 起开始记录）。
        </p>
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
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-rule py-2.5 pr-2">
      <dt className="text-[0.6875rem] text-ink-3">{label}</dt>
      <dd className="tnum mt-1 font-serif text-[1.25rem] leading-none">{value}</dd>
    </div>
  );
}
