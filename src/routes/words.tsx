import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, GraduationCap, Headphones, Play, Search, Shuffle, SlidersHorizontal, Star, X } from "@/components/app/icons";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PageHeader, Spinner } from "@/components/app/shell";
import { TabLine, Tag, actClass } from "@/components/app/kit";
import { StateBadge, WordEntry, WordSheet } from "@/components/app/word-bits";
import { useDesk } from "@/lib/media";
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
  // 13.1 · 电脑版：点一行在右侧详情栏里看（不弹层）
  const desk = useDesk();
  const [detail, setDetail] = useState<Word | null>(null);
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

  // 13.1 · 电脑版：↑ / ↓ 在列表里换右侧详情的词（输入框里不管）
  const paneRef = useRef<{ list: Word[]; cur: string | null }>({ list: [], cur: null });
  useEffect(() => {
    if (!desk) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      const { list: L, cur } = paneRef.current;
      if (!L.length) return;
      e.preventDefault();
      const i = Math.max(0, L.findIndex((x) => x.w === cur));
      const n = Math.min(L.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)));
      setDetail(L[n]);
      if (n >= limit - 5) setLimit((l) => l + PAGE);
      requestAnimationFrame(() => document.querySelector(`[data-testid="word-row"][data-w="${CSS.escape(L[n].w)}"]`)?.scrollIntoView({ block: "nearest" }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desk, limit]);

  if (error) return <div className="p-8 text-center text-sm text-ink-3">{error}</div>;
  // 一行单词的按压：点 = 打开详情（多选时勾选）；长按 = 进入多选；按住移动超过 10px 就不算长按
  const pressProps = (w: Word) => ({
    onPointerDown: (e: React.PointerEvent) => {
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
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.abs(e.clientX - press.current.x) + Math.abs(e.clientY - press.current.y) > 10) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onPointerLeave: cancelPress,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => {
      if (press.current.fired) {
        press.current.fired = false;
        return;
      }
      if (selecting) toggle(w.w);
      else if (desk) setDetail(w);
      else setOpen(w);
    },
  });

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
  // 13.1 · 电脑版右侧是详情栏，不放贴边的字母索引（按字母排序 + 搜索代替）
  const showRail = !dq && !selecting && tab !== "lists" && results.length > 40 && !desk;

  const pane = desk && tab !== "lists" ? (detail && results.some((x) => x.w === detail.w) ? detail : results[0] ?? null) : null;
  paneRef.current = { list: results, cur: pane?.w ?? null };

  return (
    <div data-testid="words" className={cn(desk && tab !== "lists" && "xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] xl:gap-x-12")}>
      <div className="min-w-0">
      <PageHeader
        title="词库"
        sub={`共 ${index.list.length} 词 · 核心 ${index.coreCount}`}
        right={
          <Link to="/syn" data-testid="syn-entry" className="press group mb-1 flex h-10 shrink-0 items-center gap-1 text-[0.8125rem] font-medium text-ink-2 hover:text-ink">
            同义词组
            <span aria-hidden className="font-serif text-[1.25rem] leading-none text-ink-3 transition-transform group-hover:translate-x-0.5">
              ›
            </span>
          </Link>
        }
      />

      {/* 吸顶：搜索是一条下划线，来源是一排字（选中的那个下面一道荧光笔），不是药丸 */}
      <div ref={sticky} className="sticky top-0 z-20 -mx-4 bg-paper/95 px-4 pb-2 pt-1 backdrop-blur-sm md:top-16 md:-mx-6 md:px-6 xl:top-0 xl:-mx-10 xl:px-10">
        <SearchLine hidden={tab === "lists"} inputRef={input} q={q} setQ={setQ} filterOn={filtersOpen || selecting} filters={activeFilters} onFilter={() => setFiltersOpen(!filtersOpen)} />
        {/* 来源：一排字，选中的那个划荧光笔，数字是衬线小号 */}
        <nav className="no-scrollbar fade-x mt-1 flex gap-5 overflow-x-auto" role="tablist" aria-label="词的来源">
          {SOURCES.map(([t, label]) => (
            <SourceTab
              key={t}
              t={t}
              label={label}
              n={{ all: null, core: coreCount, star: counts.star, wrong: counts.wrong, hard: counts.hard, mastered: counts.mastered, lists: listCount, list: null }[t]}
              on={tab === t || (t === "lists" && tab === "list")}
              onPick={() => navigate({ to: "/words", search: t === "all" ? {} : { tab: t }, replace: true })}
            />
          ))}
        </nav>
        {/* 筛选打开时：状态是一排文字单选（选中划荧光笔），排序 / 词性在下面的工具行里 */}
        <div className={cn("mt-1 flex items-center gap-3", (tab === "lists" || !(filtersOpen || selecting)) && "hidden")}>
          <span className="shrink-0 text-[0.75rem] text-ink-3">状态</span>
          <TabLine<Filter>
            className="no-scrollbar min-w-0 flex-1 gap-5 overflow-x-auto border-b-0 [&_button]:text-[0.8125rem]"
            value={filter}
            onChange={setFilter}
            testid="state-filter"
            options={[
              { value: "any", label: "全部" },
              { value: "new", label: "未学" },
              { value: "learning", label: "学习中" },
              { value: "mastered", label: "已掌握" },
            ]}
          />
        </div>
      </div>

      {tab === "lists" && <ListsOverview index={index} />}

      {tab === "list" && list && (
        <>
          <Link to="/words" search={{ tab: "lists" }} replace data-testid="list-back" className="press -ml-1.5 mb-2 mt-2 inline-flex h-10 items-center gap-1 rounded-md px-1.5 text-[0.8125rem] font-medium text-ink-3 hover:bg-paper-2 hover:text-ink">
            <span aria-hidden className="font-serif text-[1.375rem] leading-none">
              ‹
            </span>
            全部词单
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
        <div className="mb-2 mt-4 flex gap-2">
          <Link to="/study" search={{ mode: nbMode }} data-testid="nb-review" className={actClass("primary", true) + " h-12 text-[0.9375rem]"}>
            {nbMode === "star" ? "复习生词本" : nbMode === "wrong" ? "复习错词本" : nbMode === "hard" ? "顽固词专项" : "回顾已斩的词"}（{Math.min(20, results.length)} 词）
          </Link>
          {nbMode !== "mastered" && (
            <Link
              to="/tape"
              search={{ src: nbMode }}
              data-testid="nb-tape"
              aria-label="磁带模式听这个词本"
              title="磁带模式听这个词本"
              className="press grid size-12 shrink-0 place-items-center rounded-lg text-ink ring-1 ring-rule-strong ring-inset hover:bg-paper-2"
            >
              <Headphones className="size-5" />
            </Link>
          )}
        </div>
      )}

      {tab === "core" && coreCount > 0 && (
        <section className="mb-2 mt-4 border-t border-ink pt-3.5" data-testid="core-panel">
          <div className="flex items-baseline gap-2">
            <span className="tnum font-serif text-[2.25rem] leading-none tracking-[-0.02em]">{coreCount}</span>
            <span className="text-[0.9375rem] font-semibold">个四级核心词还没掌握</span>
          </div>
          <span className="sr-only">四级核心词还差 {coreCount} 个</span>
          {/* 三段细线：已掌握（墨）· 学习中（荧光笔）· 未学（纸） */}
          <div className="mt-3 flex h-1.5 gap-px overflow-hidden bg-rule" aria-hidden>
            <div className="h-full bg-ink" style={{ width: `${((index.coreCount - coreCount) / index.coreCount) * 100}%` }} />
            <div className="h-full bg-mark" style={{ width: `${(cu.learning.length / index.coreCount) * 100}%` }} />
          </div>
          <div className="tnum mt-2 flex gap-4 text-[0.75rem] text-ink-3" data-testid="core-split">
            <span>未学 {cu.unlearned.length}</span>
            <span>
              <span className="mr-1 inline-block size-2 rounded-[2px] bg-mark align-middle" aria-hidden />
              学习中 {cu.learning.length}
            </span>
            <span>
              <span className="mr-1 inline-block size-2 rounded-[2px] bg-ink align-middle" aria-hidden />
              已掌握 {index.coreCount - coreCount}
            </span>
          </div>
          <Link to="/study" search={{ mode: "core" }} data-testid="core-study" className={actClass("primary") + " mt-4 h-12 w-full text-[0.9375rem]"}>
            {cu.unlearned.length ? "学 10 个未学核心词" : "复习 10 个学习中的核心词"}
          </Link>
        </section>
      )}

      {tab !== "lists" && (
        <>
          <div className="mt-3 flex items-baseline justify-between text-[0.75rem] text-ink-3" data-testid="result-count">
            {dq ? `找到 ${results.length} 个结果` : `${results.length} 个词`}
            {selecting && <span className="ml-1 text-ink">· 点单词勾选，长按也能进入多选</span>}
          </div>

          {results.length === 0 ? (
            <p className="border-t border-rule py-12 text-[0.875rem] text-ink-3" data-testid="no-results">
              <span className="block border-l-2 border-rule-strong pl-3">{dq ? "没有找到匹配的词" : pos !== "any" || coreOnly ? "没有符合筛选条件的词" : EMPTY[tab]}</span>
            </p>
          ) : (
            /* 12.0 · 词典正文：没有卡片框；词头衬线、释义接在后面一行，行间细线；按字母排时每个字母一个大写栏头 */
            <ul className={cn("mt-1.5 border-t border-rule", showRail && "mr-5 md:mr-0")} data-testid="word-list" data-sort={sort}>
              {results.slice(0, limit).map((w, k) => {
                const L = alpha ? letterOf(w.w) : "";
                const head = alpha && (k === 0 || letterOf(results[k - 1].w) !== L);
                const on = selected.has(w.w);
                return [
                  head ? <LetterHead key={`h-${L}`} L={L} /> : null,
                  <li key={w.w} data-idx={k} className="border-b border-rule">
                    <button
                      type="button"
                      data-testid="word-row"
                      data-w={w.w}
                      data-selected={on ? "1" : "0"}
                      data-current={pane?.w === w.w ? 1 : undefined}
                      {...pressProps(w)}
                      className={cn(
                        "flex min-h-16 w-full select-none items-center gap-3 py-2.5 text-left transition-colors [-webkit-touch-callout:none] xl:min-h-13 xl:px-2",
                        on ? "-mx-2 bg-mark-soft px-2" : pane?.w === w.w ? "bg-paper-2" : "hover:bg-paper-2/60",
                      )}
                    >
                      {selecting && <Tick on={on} />}
                      <span className="min-w-0 flex-1 xl:grid xl:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] xl:items-baseline xl:gap-x-5">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="word-head truncate text-[1.5rem] leading-tight">{w.w}</span>
                          {st.star[w.w] && <Star className="size-3.5 shrink-0 self-center fill-current text-ink" aria-label="生词本" />}
                          {w.c && <Tag className="self-center">核心</Tag>}
                        </span>
                        <span className="block truncate text-[0.8125rem] text-ink-2">{shortMeaning(w, 2)}</span>
                      </span>
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
      </div>
      {desk && tab !== "lists" && (
        <aside className="sticky top-0 hidden max-h-dvh overflow-y-auto overscroll-contain pb-10 pt-10 xl:block" data-testid="word-detail" aria-label="单词详情">
          {pane ? (
            <div className="border-t-2 border-ink pt-5">
              <WordEntry key={pane.w} word={pane} />
            </div>
          ) : (
            <p className="border-t border-rule pt-5 text-[0.875rem] text-ink-3">没有选中的词</p>
          )}
        </aside>
      )}
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
    <span className="tnum shrink-0 border-r border-rule pr-3 text-right font-serif text-[0.9375rem] italic leading-none text-ink-2" data-testid="sort-meta">
      {text}
    </span>
  );
}

/** 每个 tab 空着时的那句话 */
const EMPTY: Record<string, string> = {
  star: "生词本还是空的，学习时按 S 收藏",
  wrong: "错词本是空的，继续保持",
  hard: "没有顽固词：遗忘 3 次以上的词会出现在这里",
  mastered: "还没有斩掉的词",
  core: "核心词全部掌握了 🎉",
  list: "词单还是空的：去「全部」长按单词多选，加入这个词单",
  all: "没有词",
  lists: "没有词",
};

/** 按字母排时的栏头：一个衬线大写字母压在墨线上，像词典书眉 */
function LetterHead({ L }: { L: string }) {
  return (
    <li data-letter={L} className="flex items-end justify-between border-b border-ink pb-1 pt-6">
      <span className="font-serif text-[2rem] leading-none">{L}</span>
      <span className="font-serif text-[0.9375rem] italic text-ink-3">{L.toLowerCase()}</span>
    </li>
  );
}

/** 多选时行首的小方框 */
function Tick({ on }: { on: boolean }) {
  return (
    <span className={cn("grid size-5 shrink-0 place-items-center rounded-[3px] transition", on ? "bg-ink text-paper-3" : "border-[1.5px] border-rule-strong")}>
      {on && <Check className="size-3.5" strokeWidth={3} />}
    </span>
  );
}

const SOURCES: [Tab, string][] = [
  ["all", "全部"],
  ["core", "核心未掌握"],
  ["star", "生词本"],
  ["wrong", "错词本"],
  ["hard", "顽固词"],
  ["mastered", "已斩"],
  ["lists", "词单"],
];

function SourceTab({ t, label, n, on, onPick }: { t: Tab; label: string; n: number | null; on: boolean; onPick: () => void }) {
  return (
    <button type="button" role="tab" aria-selected={on} data-testid={`tab-${t}`} onClick={onPick} className={cn("press h-11 shrink-0 whitespace-nowrap text-[0.875rem]", on ? "font-semibold text-ink" : "text-ink-3 hover:text-ink")}>
      <span className={cn(on && "hl")}>{label}</span>
      {n !== null && " "}
      {n !== null && <span className={cn("tnum font-serif text-[1rem] font-normal", on ? "text-ink-2" : "text-ink-3")}>{n}</span>}
    </button>
  );
}

/** 吸顶的搜索：一条墨色下划线，输入用衬线（搜的是英文词头）；右端「筛选」，打开时墨底 */
function SearchLine({ hidden, inputRef, q, setQ, filterOn, filters, onFilter }: { hidden: boolean; inputRef: React.RefObject<HTMLInputElement | null>; q: string; setQ: (v: string) => void; filterOn: boolean; filters: number; onFilter: () => void }) {
  return (
    <div className={cn("flex items-center gap-3 border-b-[1.5px] border-ink focus-within:border-b-2", hidden && "hidden")}>
      <Search className="size-[18px] shrink-0 text-ink-3" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜索英文或中文释义"
        data-testid="search"
        inputMode="search"
        className="h-12 min-w-0 flex-1 bg-transparent font-serif text-[1.25rem] outline-none placeholder:font-sans placeholder:text-[0.9375rem] placeholder:text-ink-3"
      />
      {q && (
        <button type="button" aria-label="清空" onClick={() => setQ("")} className="press grid size-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-paper-2 hover:text-ink">
          <X className="size-4" />
        </button>
      )}
      <button
        type="button"
        data-testid="filter-toggle"
        aria-expanded={filterOn}
        onClick={onFilter}
        className={cn("press -mr-1 flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] font-semibold", filterOn ? "bg-ink text-paper-3" : "text-ink-2 ring-1 ring-inset ring-rule-strong hover:bg-paper-2 hover:text-ink")}
      >
        <SlidersHorizontal className="size-4" /> 筛选
        {filters > 0 && (
          <span className={cn("tnum font-serif text-[1rem] leading-none", filterOn ? "text-mark" : "text-ink")} data-testid="filter-count">
            {filters}
          </span>
        )}
      </button>
    </div>
  );
}
