import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Search, X } from "@/components/app/icons";
import { useDeferredValue, useMemo, useState } from "react";
import { Spinner } from "@/components/app/shell";
import { SubHead, actClass } from "@/components/app/kit";
import { WordSheet } from "@/components/app/word-bits";
import { useWords, type Word } from "@/lib/data";
import { POS_CN, searchGroups, synonymGroups } from "@/lib/groups";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/syn")({
  validateSearch: (s: Record<string, unknown>): { q?: string } => ({ q: typeof s.q === "string" && s.q ? s.q : undefined }),
  component: SynPage,
});

const PAGE = 40;

/** v9 · 同义词组：同词性、义项相同的四级词聚在一起 */
function SynPage() {
  const { index, error } = useWords();
  const st = useApp();
  const navigate = useNavigate();
  const { q: q0 = "" } = Route.useSearch();
  const [q, setQ] = useState(q0);
  const dq = useDeferredValue(q);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Word | null>(null);
  // 从详情里的「全部同义词组」跳过来：同步搜索词并关掉详情
  const [seenQ, setSeenQ] = useState(q0);
  if (q0 !== seenQ) {
    setSeenQ(q0);
    if (q0 !== q) {
      setQ(q0);
      setOpen(null);
    }
  }
  const groups = useMemo(() => (index ? synonymGroups(index) : []), [index]);
  const hits = useMemo(() => searchGroups(groups, dq), [groups, dq]);
  if (error) return <div className="p-8 text-center text-sm text-ink-3">{error}</div>;
  if (!index) return <Spinner />;
  const wordCount = new Set(groups.flatMap((g) => g.words)).size;

  return (
    <div data-testid="syn">
      <SubHead back={{ to: "/words", label: "词库", testid: "syn-back" }} title="同义词组" sub={<span data-testid="syn-count">{groups.length} 组 · 涉及 {wordCount} 词</span>} />
      <div className="sticky top-0 z-20 -mx-4 bg-paper/95 px-4 pb-2 pt-1 backdrop-blur-sm md:top-16 md:-mx-6 md:px-6">
        <div className="flex items-center gap-3 border-b-[1.5px] border-ink">
          <Search className="size-[18px] shrink-0 text-ink-3" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
              navigate({ to: "/syn", search: e.target.value ? { q: e.target.value } : {}, replace: true });
            }}
            placeholder="搜中文意思，如「放弃」，或英文单词"
            data-testid="syn-search"
            inputMode="search"
            className="h-12 min-w-0 flex-1 bg-transparent text-[1rem] outline-none placeholder:text-[0.9375rem] placeholder:text-ink-3"
          />
          {q && (
            <button
              type="button"
              aria-label="清空"
              onClick={() => {
                setQ("");
                navigate({ to: "/syn", search: {}, replace: true });
              }}
              className="press grid size-9 shrink-0 place-items-center rounded-md text-ink-3 hover:text-ink"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-[0.75rem] text-ink-3">同词性、有一个义项完全相同就算一组；点单词看详情。</p>
      </div>

      {hits.length === 0 ? (
        <div className="border-y border-rule py-16 text-center text-[0.875rem] text-ink-3" data-testid="syn-empty">
          没有找到「{dq}」的同义词组
        </div>
      ) : (
        /* 12.0 · 排成一本同义词词典：义项是条目名（斜体词性 + 中文），下面的词用逗号串成一段衬线文字 */
        <ul className="mt-2" data-testid="syn-list">
          {hits.slice(0, limit).map((g, gi) => (
            <li key={g.key} className="border-b border-rule py-4" data-testid="syn-card" data-sense={g.sense}>
              <div className="flex items-baseline gap-2">
                <span className="tnum w-7 shrink-0 font-serif text-[0.9375rem] text-ink-3">{gi + 1}</span>
                <div className="min-w-0 flex-1 text-[1rem] font-semibold">
                  {POS_CN[g.pos] && <i className="pos mr-1.5 text-[1.0625rem] text-ink-3">{POS_CN[g.pos]}</i>}
                  {g.sense}
                </div>
                <span className="tnum shrink-0 text-[0.75rem] text-ink-3">{g.words.length} 词</span>
              </div>
              <p className="mt-1.5 pl-9 leading-[1.9]">
                {g.words.map((w, k) => {
                  const c = st.cards[w];
                  return (
                    <span key={w} className="whitespace-nowrap">
                      <button
                        type="button"
                        data-testid="syn-chip"
                        onClick={() => setOpen(index.map.get(w) ?? null)}
                        className={cn(
                          "press rounded-[2px] font-serif text-[1.25rem] leading-none underline-offset-4 hover:underline",
                          c?.st === "mastered" ? "text-know" : c ? "text-vague underline decoration-vague/40 decoration-dotted" : "text-ink",
                        )}
                      >
                        {w}
                      </button>
                      {k < g.words.length - 1 && <span className="font-serif text-[1.125rem] text-ink-3">,</span>}{" "}
                    </span>
                  );
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
      {hits.length > limit && (
        <button type="button" data-testid="syn-more" onClick={() => setLimit((l) => l + PAGE)} className={actClass("secondary") + " mt-4 h-12 w-full"}>
          再显示 {Math.min(PAGE, hits.length - limit)} 组（共 {hits.length}）
        </button>
      )}
      <div className="mt-5 flex items-center justify-center gap-4 text-[0.6875rem] text-ink-3">
        <span className="font-serif text-[0.9375rem] text-ink">word</span>未学
        <span className="font-serif text-[0.9375rem] text-vague underline decoration-dotted">word</span>学习中
        <span className="font-serif text-[0.9375rem] text-know">word</span>已掌握
      </div>
      <WordSheet word={open} open={!!open} onOpenChange={(v) => !v && setOpen(null)} />
    </div>
  );
}
