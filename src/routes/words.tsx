import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, GraduationCap, Headphones, Play, Search, Shuffle, SlidersHorizontal, Star, X } from "@/components/app/icons";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PageHeader, Segmented, Spinner } from "@/components/app/shell";
import { StateBadge, WordSheet } from "@/components/app/word-bits";
import { ListPanel, ListsOverview } from "@/components/app/lists";
import { AlphaRail, ExportSheet, SelectBar, ToolRow } from "@/components/app/word-tools";
import { shortMeaning, useWords, type Word } from "@/lib/data";
import { notebookWords, orderedWords } from "@/lib/plan";
import { coreUnmastered } from "@/lib/exam";
import { diffDays } from "@/lib/srs";
import { today } from "@/lib/clock";
import { hasPos, jumpTarget, letterIndex, letterOf, sortWords, type PosKey, type SortKey } from "@/lib/lists";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type Tab = "all" | "core" | "star" | "wrong" | "hard" | "mastered" | "lists" | "list";
type Filter = "any" | "new" | "learning" | "mastered";
const TABS: Tab[] = ["all", "core", "star", "wrong", "hard", "mastered", "lists", "list"];

/** 「筛选」展开状态：这个标签页里记住 */
const FILTERS_KEY = "cet4v-filters";
let filtersRemember = (() => {
  try {
    return sessionStorage.getItem(FILTERS_KEY) === "1";
  } catch {
    return false;
  }
})();

export const Route = createFileRoute("/words")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab; list?: string } => ({
    tab: TABS.includes(s.tab as Tab) ? (s.tab as Tab) : undefined,
    list: typeof s.list === "string" ? s.list : undefined,
  }),
  component: WordsPage,
});

const LONG_PRESS = 450;

const PAGE = 60;

function WordsPage() {
  const { index, error } = useWords();
  const st = useApp();
  const navigate = useNavigate();
  const { tab: rawTab = "all", list: listId } = Route.useSearch();
  const list = rawTab === "list" ? (st.lists ?? []).find((l) => l.id === listId) : undefined;
  // 词单被删了（或链接里的 id 不对）→ 回到词单总览
  const tab: Tab = rawTab === "list" && !list ? "lists" : rawTab;
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.trim().toLowerCase());
  const [filter, setFilter] = useState<Filter>("any");
  const [sort, setSort] = useState<SortKey>("default");
  const [pos, setPos] = useState<PosKey>("any");
  const [coreOnly, setCoreOnly] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [jumpIdx, setJumpIdx] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Word | null>(null);
  // 11.1 · 默认只有搜索框 + 一行来源；状态、排序、词性、多选、导出收进「筛选」
  const [filtersOpen, setFiltersOpenState] = useState(filtersRemember);
  const setFiltersOpen = (v: boolean) => {
    filtersRemember = v;
    try {
      sessionStorage.setItem(FILTERS_KEY, v ? "1" : "0");
    } catch {
      /* 无痕模式 */
    }
    setFiltersOpenState(v);
  };
  const sentinel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const sticky = useRef<HTMLDivElement>(null);
  const press = useRef<{ t?: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean }>({ x: 0, y: 0, fired: false });

  const results = useMemo(() => {
    if (!index || tab === "lists") return [];
    let base: Word[];
    if (tab === "list") base = (list?.words ?? []).map((w) => index.map.get(w)).filter(Boolean) as Word[];
    else if (tab === "all") base = orderedWords(index, st.settings, st.seed).map((w) => index.map.get(w)!);
    else if (tab === "core") {
      const cu = coreUnmastered(index, st);
      base = [...cu.unlearned, ...cu.learning].map((w) => index.map.get(w)!);
    }
    else base = notebookWords(st, tab).map((w) => index.map.get(w)).filter(Boolean) as Word[];
    if (pos !== "any") base = base.filter((w) => hasPos(w, pos));
    if (coreOnly && tab !== "core") base = base.filter((w) => w.c);
    if (filter !== "any") {
      base = base.filter((w) => {
        const c = st.cards[w.w];
        if (filter === "new") return !c;
        if (filter === "mastered") return c?.st === "mastered";
        return !!c && c.st !== "mastered";
      });
    }
    if (!dq) return sortWords(base, st.cards, sort);
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
      return sortWords(scored.sort((a, b) => a[1] - b[1]).map((x) => x[0]), st.cards, sort);
    }
    const starts: Word[] = [];
    const contains: Word[] = [];
    for (const w of base) {
      const lw = w.w.toLowerCase();
      if (lw === dq) starts.unshift(w);
      else if (lw.startsWith(dq)) starts.push(w);
      else if (lw.includes(dq)) contains.push(w);
    }
    return sortWords([...starts, ...contains], st.cards, sort);
  }, [index, st, tab, list, filter, dq, sort, pos, coreOnly]);

  useEffect(() => setLimit(PAGE), [tab, listId, filter, dq, sort, pos, coreOnly]);
  // 换标签页 / 换词单时退出多选
  useEffect(() => {
    setSelecting(false);
    setSelected(new Set());
  }, [tab, listId]);

  const alpha = sort === "alpha" && !dq;
  const letters = useMemo(() => (alpha ? letterIndex(results) : new Map<string, number>()), [alpha, results]);

  // 字母索引跳转：必要时先切到「按字母」，等列表重排、渲染够行数后再滚动
  useEffect(() => {
    if (!pending || !alpha) return;
    const idx = jumpTarget(letters, pending, results.length);
    setPending(null);
    if (!results.length) return;
    setLimit((l) => Math.max(l, idx + PAGE));
    setJumpIdx(idx);
  }, [pending, alpha, letters, results.length]);

  useLayoutEffect(() => {
    if (jumpIdx === null) return;
    const el = document.querySelector<HTMLElement>(`[data-testid="word-list"] [data-idx="${jumpIdx}"]`);
    if (!el) return;
    setJumpIdx(null);
    const sh = sticky.current;
    const off = sh ? sh.offsetHeight + (parseFloat(getComputedStyle(sh).top) || 0) : 0;
    const prev = el.previousElementSibling as HTMLElement | null;
    const head = prev?.hasAttribute("data-letter") ? prev.offsetHeight : 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off - head - 4, behavior: "instant" as ScrollBehavior });
  }, [jumpIdx, limit, results]);

  const jump = useCallback(
    (L: string) => {
      if (sort !== "alpha") setSort("alpha");
      if (q) setQ("");
      setPending(L);
    },
    [sort, q],
  );

  const toggle = (w: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(w)) n.delete(w);
      else n.add(w);
      return n;
    });
  const startSelect = (w?: string) => {
    setSelecting(true);
    setSelected(new Set(w ? [w] : []));
  };
  const cancelPress = () => clearTimeout(press.current.t);

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

  if (error) return <div className="p-8 text-center text-sm text-ink-3">{error}</div>;
  if (!index) return <Spinner />;

  const counts = {
    star: notebookWords(st, "star").length,
    wrong: notebookWords(st, "wrong").length,
    mastered: notebookWords(st, "mastered").length,
    hard: notebookWords(st, "hard").length,
  };
  const cu = coreUnmastered(index, st);
  const coreCount = cu.unlearned.length + cu.learning.length;
  const nbMode = tab === "all" || tab === "core" || tab === "lists" || tab === "list" ? null : tab;
  const listCount = (st.lists ?? []).length;
  const day = today();
  const TAB_TITLE: Record<Tab, string> = { all: "全部", core: "核心未掌握", star: "生词本", wrong: "错词本", hard: "顽固词", mastered: "已斩", lists: "词单", list: list?.name ?? "词单" };
  const activeFilters = (filter !== "any" ? 1 : 0) + (sort !== "default" ? 1 : 0) + (pos !== "any" ? 1 : 0) + (coreOnly ? 1 : 0);
  const showRail = !dq && !selecting && tab !== "lists" && results.length > 40;

  return (
    <div data-testid="words">
      <PageHeader
        title="词库"
        sub={`共 ${index.list.length} 词 · 核心 ${index.coreCount}`}
        right={
          <Link to="/syn" data-testid="syn-entry" className="mb-1 flex shrink-0 items-center gap-1 rounded-lg bg-paper-2 px-3.5 py-2 text-[0.8125rem] font-semibold text-ink-3 transition hover:text-ink">
            <Shuffle className="size-3.5" /> 同义词组
          </Link>
        }
      />

      <div ref={sticky} className="sticky top-0 z-20 -mx-4 bg-paper px-4 pb-3 pt-1 md:top-16 md:-mx-6 md:px-6">
        <div className={cn("flex items-center gap-2", tab === "lists" && "hidden")}>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-3" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索英文或中文释义"
            data-testid="search"
            inputMode="search"
            className="h-12 w-full rounded-xl ring-1 ring-rule ring-inset bg-paper-3 pl-11 pr-11 text-[0.9375rem] outline-none transition placeholder:text-ink-3 focus:border-ink focus:ring-4 focus:ring-ink"
          />
          {q && (
            <button type="button" aria-label="清空" onClick={() => setQ("")} className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-paper-2 text-ink-3">
              <X className="size-4" />
            </button>
          )}
        </div>
          <button
            type="button"
            data-testid="filter-toggle"
            aria-expanded={filtersOpen || selecting}
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={cn(
              "relative flex h-12 shrink-0 items-center gap-1.5 rounded-2xl px-3.5 text-sm font-semibold transition",
              filtersOpen || selecting ? "bg-foreground text-background" : "bg-paper-2 text-ink-3 hover:text-ink",
            )}
          >
            <SlidersHorizontal className="size-4" /> 筛选
            {activeFilters > 0 && (
              <span className="tnum absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-ink text-[0.6875rem] font-semibold text-paper-3" data-testid="filter-count">
                {activeFilters}
              </span>
            )}
          </button>
        </div>
        <div className="no-scrollbar fade-x mt-3 flex gap-2 overflow-x-auto">
          {(
            [
              ["all", "全部"],
              ["core", `核心未掌握 ${coreCount}`],
              ["star", `生词本 ${counts.star}`],
              ["wrong", `错词本 ${counts.wrong}`],
              ["hard", `顽固词 ${counts.hard}`],
              ["mastered", `已斩 ${counts.mastered}`],
              ["lists", `词单 ${listCount}`],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              data-testid={`tab-${t}`}
              onClick={() => navigate({ to: "/words", search: t === "all" ? {} : { tab: t }, replace: true })}
              className={cn(
                "shrink-0 rounded-lg px-4 py-2 text-[0.8125rem] font-semibold transition",
                tab === t || (t === "lists" && tab === "list") ? "bg-foreground text-background" : "bg-paper-2 text-ink-3 hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Segmented<Filter>
          className={cn("mt-2.5", (tab === "lists" || !(filtersOpen || selecting)) && "hidden")}
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

      {tab === "lists" && <ListsOverview index={index} />}

      {tab === "list" && list && (
        <>
          <Link to="/words" search={{ tab: "lists" }} replace data-testid="list-back" className="-ml-1 mb-2 flex w-fit items-center gap-0.5 text-[0.8125rem] font-semibold text-ink-3 hover:text-ink">
            <ChevronLeft className="size-4" /> 全部词单
          </Link>
          <ListPanel index={index} list={list} />
        </>
      )}

      {tab !== "lists" && (filtersOpen || selecting) && (
        <ToolRow
          sort={sort}
          setSort={setSort}
          pos={pos}
          setPos={setPos}
          coreOnly={coreOnly}
          setCoreOnly={setCoreOnly}
          showCore={tab !== "core"}
          onSelect={() => (selecting ? setSelecting(false) : startSelect())}
          onExport={() => setExporting(true)}
          canExport={results.length > 0}
          selecting={selecting}
        />
      )}

      {nbMode && results.length > 0 && (
        <div className="mb-3 flex gap-2">
          <Link
            to="/study"
            search={{ mode: nbMode }}
            data-testid="nb-review"
            className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-ink text-[0.9375rem] font-semibold text-paper-3 hover:bg-ink-2"
          >
            <Play className="size-4 fill-current" />
            {nbMode === "star" ? "复习生词本" : nbMode === "wrong" ? "复习错词本" : nbMode === "hard" ? "顽固词专项" : "回顾已斩的词"}（{Math.min(20, results.length)} 词）
          </Link>
          {nbMode !== "mastered" && (
            <Link
              to="/tape"
              search={{ src: nbMode }}
              data-testid="nb-tape"
              aria-label="磁带模式听这个词本"
              title="磁带模式听这个词本"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-mark-soft text-ink"
            >
              <Headphones className="size-5" />
            </Link>
          )}
        </div>
      )}

      {tab === "core" && coreCount > 0 && (
        <div className="mb-3 rounded-xl ring-1 ring-rule ring-inset bg-paper-3 p-4" data-testid="core-panel">
          <div className="flex items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center text-ink-2">
              <GraduationCap className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[0.9375rem] font-semibold">四级核心词还差 {coreCount} 个</div>
              <div className="text-xs text-ink-3" data-testid="core-split">
                未学 {cu.unlearned.length} · 学习中 {cu.learning.length} · 已掌握 {index.coreCount - coreCount}
              </div>
            </div>
          </div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-[2px] bg-rule">
            <div className="h-full bg-know" style={{ width: `${((index.coreCount - coreCount) / index.coreCount) * 100}%` }} />
            <div className="h-full bg-vague" style={{ width: `${(cu.learning.length / index.coreCount) * 100}%` }} />
          </div>
          <Link
            to="/study"
            search={{ mode: "core" }}
            data-testid="core-study"
            className="press mt-3 flex h-12 items-center justify-center gap-2 rounded-lg bg-ink text-[0.9375rem] font-semibold text-paper-3 hover:bg-ink-2"
          >
            <Play className="size-4 fill-current" />
            {cu.unlearned.length ? "学 10 个未学核心词" : "复习 10 个学习中的核心词"}
          </Link>
        </div>
      )}

      {tab !== "lists" && (
        <>
          <div className="text-xs text-ink-3" data-testid="result-count">
            {dq ? `找到 ${results.length} 个结果` : `${results.length} 个词`}
            {selecting && <span className="ml-1 text-ink">· 点单词勾选，长按也能进入多选</span>}
          </div>

          {results.length === 0 ? (
            <div className="py-16 text-center text-sm text-ink-3" data-testid="no-results">
              {dq
                ? "没有找到匹配的词"
                : pos !== "any" || coreOnly
                  ? "没有符合筛选条件的词"
                  : tab === "star"
                    ? "生词本还是空的，学习时按 S 收藏"
                    : tab === "wrong"
                      ? "错词本是空的，继续保持"
                      : tab === "hard"
                        ? "没有顽固词：遗忘 3 次以上的词会出现在这里"
                        : tab === "mastered"
                          ? "还没有斩掉的词"
                          : tab === "core"
                            ? "核心词全部掌握了 🎉"
                            : tab === "list"
                              ? "词单还是空的：去「全部」长按单词多选，加入这个词单"
                              : "没有词"}
            </div>
          ) : (
            <ul className={cn("mt-2 divide-y divide-rule overflow-hidden rounded-xl ring-1 ring-rule ring-inset bg-paper-3", showRail && "mr-5 md:mr-0")} data-testid="word-list" data-sort={sort}>
              {results.slice(0, limit).map((w, k) => {
                const L = alpha ? letterOf(w.w) : "";
                const head = alpha && (k === 0 || letterOf(results[k - 1].w) !== L);
                const on = selected.has(w.w);
                return [
                  head ? (
                    <li key={`h-${L}`} data-letter={L} className="bg-paper px-4 pb-1 pt-4 font-serif text-[1.25rem] leading-none text-ink-3">
                      {L}
                    </li>
                  ) : null,
                  <li key={w.w} data-idx={k}>
                    <button
                      type="button"
                      data-testid="word-row"
                      data-w={w.w}
                      data-selected={on ? "1" : "0"}
                      onPointerDown={(e) => {
                        press.current.fired = false;
                        press.current.x = e.clientX;
                        press.current.y = e.clientY;
                        cancelPress();
                        press.current.t = setTimeout(() => {
                          press.current.fired = true;
                          if (selecting) toggle(w.w);
                          else startSelect(w.w);
                          navigator.vibrate?.(15);
                        }, LONG_PRESS);
                      }}
                      onPointerMove={(e) => {
                        if (Math.abs(e.clientX - press.current.x) + Math.abs(e.clientY - press.current.y) > 10) cancelPress();
                      }}
                      onPointerUp={cancelPress}
                      onPointerCancel={cancelPress}
                      onPointerLeave={cancelPress}
                      onContextMenu={(e) => e.preventDefault()}
                      onClick={() => {
                        if (press.current.fired) {
                          press.current.fired = false;
                          return;
                        }
                        if (selecting) toggle(w.w);
                        else setOpen(w);
                      }}
                      className={cn("flex w-full select-none items-center gap-3 px-4 py-3 text-left transition [-webkit-touch-callout:none]", on ? "bg-mark-soft" : "hover:bg-paper-2")}
                    >
                      {selecting && (
                        <span className={cn("grid size-[22px] shrink-0 place-items-center rounded-full border-2 transition", on ? "border-ink bg-ink text-paper-3" : "border-rule")}>
                          {on && <Check className="size-3.5" strokeWidth={3} />}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="word-head truncate text-[1.375rem] leading-tight">{w.w}</span>
                          {w.c && <span className="shrink-0 rounded bg-mark-soft px-1 text-[0.625rem] font-semibold text-ink">核心</span>}
                          {st.star[w.w] && <Star className="size-3.5 shrink-0 fill-vague text-vague" />}
                        </div>
                        <div className="mt-0.5 truncate text-[0.8125rem] text-ink-3">{shortMeaning(w, 2)}</div>
                      </div>
                      <SortMeta sort={sort} card={st.cards[w.w]} day={day} />
                      <StateBadge card={st.cards[w.w]} />
                    </button>
                  </li>,
                ];
              })}
            </ul>
          )}
        </>
      )}
      <div ref={sentinel} className={cn("h-8", selecting && "h-40")} />
      {showRail && <AlphaRail have={new Set(alpha ? letters.keys() : results.map((w) => letterOf(w.w)))} onJump={jump} />}
      {selecting && (
        <SelectBar
          selected={[...selected]}
          total={results.length}
          onAll={() => setSelected(new Set(results.map((w) => w.w)))}
          onClear={() => setSelected(new Set())}
          onExit={() => {
            setSelecting(false);
            setSelected(new Set());
          }}
          listId={tab === "list" ? list?.id : undefined}
        />
      )}
      <ExportSheet open={exporting} onOpenChange={setExporting} words={results} title={TAB_TITLE[tab]} />
      <WordSheet word={open} open={!!open} onOpenChange={(v) => !v && setOpen(null)} />
    </div>
  );
}

/** 按遗忘次数 / 下次复习 / 难度排序时，每行显示排序依据 */
function SortMeta({ sort, card, day }: { sort: SortKey; card: import("@/lib/srs").Card | undefined; day: string }) {
  if (!card || (sort !== "lapses" && sort !== "due" && sort !== "ease")) return null;
  let text = "";
  if (sort === "lapses") text = `忘 ${card.l} 次`;
  else if (sort === "ease") text = `难度 ${card.e.toFixed(2)}`;
  else if (card.k) text = "不再复习";
  else {
    const n = diffDays(day, card.d);
    text = n <= 0 ? "今天" : n === 1 ? "明天" : `${n} 天后`;
  }
  return (
    <span className="tnum shrink-0 text-[0.6875rem] font-semibold text-ink-3" data-testid="sort-meta">
      {text}
    </span>
  );
}
