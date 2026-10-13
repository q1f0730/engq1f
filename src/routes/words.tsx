import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Headphones, Play, Search, Star, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader, Segmented, Spinner } from "@/components/app/shell";
import { StateBadge, WordSheet } from "@/components/app/word-bits";
import { shortMeaning, useWords, type Word } from "@/lib/data";
import { notebookWords, orderedWords } from "@/lib/plan";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type Tab = "all" | "star" | "wrong" | "hard" | "mastered";
type Filter = "any" | "new" | "learning" | "mastered";
const TABS: Tab[] = ["all", "star", "wrong", "hard", "mastered"];

export const Route = createFileRoute("/words")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({
    tab: TABS.includes(s.tab as Tab) ? (s.tab as Tab) : undefined,
  }),
  component: WordsPage,
});

const PAGE = 60;

function WordsPage() {
  const { index, error } = useWords();
  const st = useApp();
  const navigate = useNavigate();
  const { tab = "all" } = Route.useSearch();
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.trim().toLowerCase());
  const [filter, setFilter] = useState<Filter>("any");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Word | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!index) return [];
    let base: Word[];
    if (tab === "all") base = orderedWords(index, st.settings, st.seed).map((w) => index.map.get(w)!);
    else base = notebookWords(st, tab).map((w) => index.map.get(w)).filter(Boolean) as Word[];
    if (filter !== "any") {
      base = base.filter((w) => {
        const c = st.cards[w.w];
        if (filter === "new") return !c;
        if (filter === "mastered") return c?.st === "mastered";
        return !!c && c.st !== "mastered";
      });
    }
    if (!dq) return base;
    const isZh = /[\u4e00-\u9fa5]/.test(dq);
    if (isZh) {
      // 排序：第一条释义命中优先，其次命中位置靠前、释义短的
      const scored: [Word, number][] = [];
      for (const w of base) {
        let best = Infinity;
        w.t.forEach(([, m], k) => {
          const i = m.indexOf(dq);
          if (i >= 0) best = Math.min(best, k * 100 + i * 4 + m.length / 10);
        });
        if (best < Infinity) scored.push([w, best]);
      }
      return scored.sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    }
    const starts: Word[] = [];
    const contains: Word[] = [];
    for (const w of base) {
      const lw = w.w.toLowerCase();
      if (lw === dq) starts.unshift(w);
      else if (lw.startsWith(dq)) starts.push(w);
      else if (lw.includes(dq)) contains.push(w);
    }
    return [...starts, ...contains];
  }, [index, st, tab, filter, dq]);

  useEffect(() => setLimit(PAGE), [tab, filter, dq]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es[0].isIntersecting && setLimit((l) => l + PAGE), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [results.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (error) return <div className="p-8 text-center text-sm text-muted-foreground">{error}</div>;
  if (!index) return <Spinner />;

  const counts = {
    star: notebookWords(st, "star").length,
    wrong: notebookWords(st, "wrong").length,
    mastered: notebookWords(st, "mastered").length,
    hard: notebookWords(st, "hard").length,
  };
  const nbMode = tab === "all" ? null : tab;

  return (
    <div data-testid="words">
      <PageHeader title="词库" sub={`共 ${index.list.length} 词 · 核心 ${index.coreCount}`} />

      <div className="sticky top-0 z-20 -mx-4 bg-background/90 px-4 pb-3 pt-1 backdrop-blur-xl md:top-16 md:-mx-6 md:px-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索英文或中文释义"
            data-testid="search"
            inputMode="search"
            className="h-12 w-full rounded-2xl border border-border/80 bg-card pl-11 pr-11 text-[15px] outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
          />
          {q && (
            <button type="button" aria-label="清空" onClick={() => setQ("")} className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-secondary text-muted-foreground">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          {(
            [
              ["all", "全部"],
              ["star", `生词本 ${counts.star}`],
              ["wrong", `错词本 ${counts.wrong}`],
              ["hard", `顽固词 ${counts.hard}`],
              ["mastered", `熟词 ${counts.mastered}`],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              data-testid={`tab-${t}`}
              onClick={() => navigate({ to: "/words", search: t === "all" ? {} : { tab: t }, replace: true })}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition",
                tab === t ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Segmented<Filter>
          className="mt-2.5"
          value={filter}
          onChange={setFilter}
          testid="state-filter"
          options={[
            { value: "any", label: "全部状态" },
            { value: "new", label: "未学" },
            { value: "learning", label: "学习中" },
            { value: "mastered", label: "已掌握" },
          ]}
        />
      </div>

      {nbMode && results.length > 0 && (
        <div className="mb-3 flex gap-2">
          <Link
            to="/study"
            search={{ mode: nbMode }}
            data-testid="nb-review"
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground shadow-lg shadow-primary/20"
          >
            <Play className="size-4 fill-current" />
            {nbMode === "star" ? "复习生词本" : nbMode === "wrong" ? "复习错词本" : nbMode === "hard" ? "顽固词专项" : "回顾熟词"}（{Math.min(20, results.length)} 词）
          </Link>
          {nbMode !== "mastered" && (
            <Link
              to="/tape"
              search={{ src: nbMode }}
              data-testid="nb-tape"
              aria-label="磁带模式听这个词本"
              title="磁带模式听这个词本"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary"
            >
              <Headphones className="size-5" />
            </Link>
          )}
        </div>
      )}

      <div className="text-[12px] text-muted-foreground" data-testid="result-count">
        {dq ? `找到 ${results.length} 个结果` : `${results.length} 个词`}
      </div>

      {results.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground" data-testid="no-results">
          {dq ? "没有找到匹配的词" : tab === "star" ? "生词本还是空的，学习时按 S 收藏" : tab === "wrong" ? "错词本是空的，继续保持" : tab === "hard" ? "没有顽固词：遗忘 3 次以上的词会出现在这里" : tab === "mastered" ? "还没有斩掉的词" : "没有词"}
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-border/60 overflow-hidden rounded-3xl border border-border/70 bg-card" data-testid="word-list">
          {results.slice(0, limit).map((w) => (
            <li key={w.w}>
              <button type="button" onClick={() => setOpen(w)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-secondary/60" data-testid="word-row">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display truncate text-[17px] font-bold tracking-tight">{w.w}</span>
                    {w.c && <span className="shrink-0 rounded bg-brand-soft px-1 text-[10px] font-bold text-primary">核心</span>}
                    {st.star[w.w] && <Star className="size-3.5 shrink-0 fill-vague text-vague" />}
                  </div>
                  <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{shortMeaning(w, 2)}</div>
                </div>
                <StateBadge card={st.cards[w.w]} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div ref={sentinel} className="h-8" />
      <WordSheet word={open} open={!!open} onOpenChange={(v) => !v && setOpen(null)} />
    </div>
  );
}
