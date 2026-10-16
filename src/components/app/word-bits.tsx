import { Suspense, lazy, useEffect, useState } from "react";
import { ChevronLeft, ListPlus, Play, Star, Swords, Undo2, Volume2 } from "@/components/app/icons";
import { confusables } from "@/lib/confusables";
import { sayEnglish, speak } from "@/lib/audio";
import { useExampleList, type Example } from "@/lib/examples";
import { useSynonyms } from "@/lib/syn";
import { decompose, knows, morphLabel } from "@/lib/lexicon";
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
  const lg = size === "lg";
  // 12.0 · 词典的义项排法：左边一栏斜体词性（同一词性只写一次），右边释义；义项之间没有分隔线，只有行距
  return (
    <dl className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2.5 leading-relaxed text-ink", lg ? "text-[1.0625rem]" : "text-[0.9375rem]")} data-testid="meanings">
      {word.t.map(([pos, m], k) => (
        <div key={k} className="contents">
          <dt className={cn("pos min-w-[1.9em] text-ink-3", lg ? "text-[1.1875rem]" : "text-[1.0625rem]")}>{pos ? posLabel(pos) : ""}</dt>
          <dd className="min-w-0">{m}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 小节标题：一行小字 + 一条延伸到右边的细线（短语、例句、形近词共用） */
function Rubric({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-3 text-[0.8125rem] text-ink-3">
      <span className="shrink-0">{children}</span>
      <span aria-hidden className="h-px flex-1 bg-rule" />
    </div>
  );
}

export function Phrases({ word, max = 6 }: { word: Word; max?: number }) {
  if (!word.ph?.length) return null;
  // 12.0 · 短语两栏：英文在左（墨色），中文在右（弱墨），宽屏时两组并排
  return (
    <section>
      <Rubric>常用短语</Rubric>
      <dl className="grid gap-x-6 gap-y-1.5 text-[0.875rem] leading-snug sm:grid-cols-2">
        {word.ph.slice(0, max).map(([a, b]) => (
          <div key={a} className="min-w-0">
            <dt className="inline font-medium text-ink">{a}</dt>
            <dd className="ml-2 inline text-ink-3">{b}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function highlight(sentence: string, word: string) {
  const stem = word.length > 4 ? word.slice(0, word.length - 2) : word;
  const re = new RegExp(`\\b(${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[a-z]*)`, "i");
  const m = sentence.match(re);
  if (!m || m.index === undefined) return sentence;
  return mark(sentence, m.index, m[0].length);
}

/** 荧光笔只划例句里的目标词（13.0：位置由数据给出，变形 / 不规则形式也划得准） */
function mark(sentence: string, at: number, len: number) {
  if (at < 0 || !len) return sentence;
  return (
    <>
      {sentence.slice(0, at)}
      <b className="hl font-normal text-ink">{sentence.slice(at, at + len)}</b>
      {sentence.slice(at + len)}
    </>
  );
}

function SourceTag({ ex }: { ex: Example }) {
  if (ex.kind === "authored")
    return (
      <span className="text-[0.6875rem] text-ink-3" data-testid="example-src" data-kind="authored" title="这句是本应用自编的">
        自编
      </span>
    );
  if (ex.kind === "tatoeba")
    return (
      <a
        href={`https://tatoeba.org/sentences/show/${ex.id}`}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-[0.6875rem] text-ink-3 underline decoration-rule underline-offset-2 hover:text-ink"
        data-testid="example-src"
        data-kind="tatoeba"
        title="Tatoeba · CC-BY 2.0 FR"
      >
        Tatoeba #{ex.id}
      </a>
    );
  return null;
}

/** 例句：13.0 起随应用分发、每句带中文；某个词一句都没有才在线取 */
export function Examples({ word, enabled = true }: { word: Word; enabled?: boolean }) {
  const { list } = useExampleList(word.w, enabled);
  if (!list.length) return null;
  const say = (e: React.MouseEvent, s: string) => {
    e.stopPropagation();
    void sayEnglish(s, getState().settings.accent);
  };
  return (
    <section data-testid="examples">
      <Rubric>例句</Rubric>
      <ol className="space-y-3.5">
        {list.map((ex) => (
          <li key={ex.en} className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-2">
            <button
              type="button"
              aria-label="朗读例句"
              title="朗读例句"
              data-testid="example-play"
              onClick={(e) => say(e, ex.en)}
              className="press -mt-1 grid size-9 place-items-center rounded-full text-ink-2 ring-1 ring-inset ring-rule hover:bg-mark hover:text-mark-ink hover:ring-transparent"
            >
              <Play className="ml-px size-3.5 fill-current" />
            </button>
            <div className="min-w-0">
              <p className="font-serif text-[1.0625rem] leading-[1.5] text-ink" data-testid="example">
                {ex.at >= 0 ? mark(ex.en, ex.at, ex.len) : highlight(ex.en, word.w)}
              </p>
              {ex.zh && (
                <p className="mt-0.5 text-[0.875rem] leading-relaxed text-ink-2" data-testid="example-zh">
                  {ex.zh} <SourceTag ex={ex} />
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** 13.0 · 同义词：一行词，点一下跳到那个词（卡片背面打开详情，详情里往下翻一层） */
export function Synonyms({ index, word, enabled = true, onOpen }: { index: WordIndex | null; word: Word; enabled?: boolean; onOpen: (w: Word) => void }) {
  const list = useSynonyms(index, word, enabled);
  if (!list.length) return null;
  return (
    <section data-testid="syn-line">
      <Rubric>同义词</Rubric>
      <ul className="-mt-1 flex flex-wrap gap-x-1 gap-y-0.5">
        {list.map((c) => (
          <li key={c.w}>
            <button
              type="button"
              data-testid="syn-link"
              data-word={c.w}
              onClick={(e) => {
                e.stopPropagation();
                onOpen(c);
              }}
              className="press flex min-h-10 items-baseline gap-1.5 rounded-[4px] px-1.5 py-1 text-left hover:bg-paper-2"
            >
              <span className="font-serif text-[1.125rem] leading-tight text-ink underline decoration-rule-strong decoration-1 underline-offset-4">{c.w}</span>
              <span className="max-w-[9em] truncate text-[0.75rem] text-ink-3">{shortMeaning(c, 1).replace(/^[a-z.&/]+\s/i, "")}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 13.0 · 构词：「由 class + room 组成」；认识的部分划荧光笔 */
export function MorphLine({ index, word, className }: { index: WordIndex | null; word: Word; className?: string }) {
  const cards = useApp().cards;
  if (!index) return null;
  const m = decompose(word.w, index);
  if (!m) return null;
  const look = (w: string) => index.map.get(w);
  return (
    <p className={cn("text-[0.8125rem] text-ink-2", className)} data-testid="morph" data-parts={m.parts.join("+")} aria-label={morphLabel(m)}>
      由{" "}
      {m.parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="px-1 text-ink-3">+</span>}
          <span className={cn("font-serif text-[1rem] text-ink", m.roots.includes(p) && knows(p, cards, look) && "hl")} data-known={m.roots.includes(p) && knows(p, cards, look) ? "1" : undefined}>
            {p}
          </span>
        </span>
      ))}{" "}
      组成
    </p>
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
    <section data-testid="confusables">
      <Rubric>形近词 · 别认混</Rubric>
      <ul className="-mt-1 divide-y divide-rule">
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
    </section>
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

export function WordSheet({ word, open, onOpenChange }: { word: Word | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!word) return null;
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="单词详情" testid="word-sheet" hideTitle>
      <WordEntry word={word} open={open} />
    </BottomSheet>
  );
}

/** 13.1 · 单词详情的正文（弹层和电脑版词库右侧的详情栏共用） */
export function WordEntry({ word: base, open = true }: { word: Word | null; open?: boolean }) {
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
                <button type="button" aria-label="播放美音发音" className="press flex h-9 items-center gap-1.5 rounded-md px-1 hover:bg-paper-2 hover:text-ink" onClick={() => speak(word.w, "us")}>
                  <span className="text-[0.75rem] text-ink-3">美</span> <span className="font-ipa">/{ipaOf(word, "us")}/</span> <Volume2 className="size-3.5" />
                </button>
                <button type="button" aria-label="播放英音发音" className="press flex h-9 items-center gap-1.5 rounded-md px-1 hover:bg-paper-2 hover:text-ink" onClick={() => speak(word.w, "uk")}>
                  <span className="text-[0.75rem] text-ink-3">英</span> <span className="font-ipa">/{ipaOf(word, "uk")}/</span> <Volume2 className="size-3.5" />
                </button>
              </>
            )}
            {!word.p && <SpeakButton word={word.w} accent={accent} className="size-9" />}
          </div>
        </header>
        <div className="fs-card mt-4">
          <Meanings word={word} />
          <MorphLine index={getWordsSync()} word={word} className="mt-3" />
        </div>
        <div className="mt-6">
          <Phrases word={word} />
        </div>
        <div className="mt-6 empty:hidden">
          <Synonyms index={getWordsSync()} word={word} enabled={open} onOpen={(c) => setTrail((t) => [...t, c])} />
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
            type="button"
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
            <button type="button" onClick={() => unkillWord(word.w)} className="press flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[0.75rem] font-medium ring-1 ring-rule-strong ring-inset hover:bg-paper-2">
              <Undo2 className="size-4" /> 取消斩
            </button>
          ) : (
            <button type="button" onClick={() => killWord(word.w)} data-testid="sheet-kill" className="press flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[0.75rem] font-medium text-know ring-1 ring-rule-strong ring-inset hover:bg-know-soft">
              <Swords className="size-4" /> 斩
            </button>
          )}
          <button
            type="button"
            onClick={() => resetWord(word.w)}
            disabled={!card}
            data-testid="sheet-reset"
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
