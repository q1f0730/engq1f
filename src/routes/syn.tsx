import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Search, X } from "@/components/app/icons";
import { useDeferredValue, useMemo, useState } from "react";
import { PageHeader, Spinner } from "@/components/app/shell";
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
      <Link to="/words" className="-ml-1 mt-4 flex w-fit items-center gap-0.5 text-[0.8125rem] font-semibold text-ink-3 hover:text-ink" data-testid="syn-back">
        <ChevronLeft className="size-4" /> 词库
      </Link>
      <PageHeader title="同义词组" sub={<span data-testid="syn-count">{groups.length} 组 · 涉及 {wordCount} 词</span>} />
      <div className="sticky top-0 z-20 -mx-4 bg-paper px-4 pb-3 pt-1 md:top-16 md:-mx-6 md:px-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-3" />
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
            className="h-12 w-full rounded-xl ring-1 ring-rule ring-inset bg-paper-3 pl-11 pr-11 text-[0.9375rem] outline-none transition placeholder:text-ink-3 focus:border-ink focus:ring-4 focus:ring-ink"
          />
          {q && (
            <button
              type="button"
              aria-label="清空"
              onClick={() => {
                setQ("");
                navigate({ to: "/syn", search: {}, replace: true });
              }}
              className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-paper-2 text-ink-3"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-ink-3">同词性、有一个义项完全相同就算一组；点单词看详情。</p>
      </div>

      {hits.length === 0 ? (
        <div className="py-16 text-center text-sm text-ink-3" data-testid="syn-empty">
          没有找到「{dq}」的同义词组
        </div>
      ) : (
        <ul className="space-y-2.5" data-testid="syn-list">
          {hits.slice(0, limit).map((g) => (
            <li key={g.key} className="rounded-xl ring-1 ring-rule ring-inset bg-paper-3 p-4" data-testid="syn-card" data-sense={g.sense}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0 text-base font-semibold">
                  {POS_CN[g.pos] && <span className="mr-1.5 rounded-md bg-paper-2 px-1.5 py-px text-xs font-semibold italic text-ink-3">{POS_CN[g.pos]}</span>}
                  {g.sense}
                </div>
                <span className="tnum shrink-0 text-xs text-ink-3">{g.words.length} 词</span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {g.words.map((w) => {
                  const c = st.cards[w];
                  return (
                    <button
                      key={w}
                      type="button"
                      data-testid="syn-chip"
                      onClick={() => setOpen(index.map.get(w) ?? null)}
                      className={cn(
                        "press font-display rounded-lg px-3 py-1.5 text-sm font-semibold",
                        c?.st === "mastered" ? "bg-know-soft text-know" : c ? "bg-vague-soft text-vague" : "bg-paper-2 text-ink",
                      )}
                    >
                      {w}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
      {hits.length > limit && (
        <button type="button" data-testid="syn-more" onClick={() => setLimit((l) => l + PAGE)} className="mt-3 h-12 w-full rounded-lg bg-paper-2 text-sm font-semibold">
          再显示 {Math.min(PAGE, hits.length - limit)} 组（共 {hits.length}）
        </button>
      )}
      <div className="mt-4 flex items-center justify-center gap-3 text-[0.6875rem] text-ink-3">
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-paper-2 ring-1 ring-rule" />未学</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-vague" />学习中</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-know" />已掌握</span>
      </div>
      <WordSheet word={open} open={!!open} onOpenChange={(v) => !v && setOpen(null)} />
    </div>
  );
}
