import { ArrowUpDown, CheckSquare, ChevronDown, Download, FileSpreadsheet, GraduationCap, Layers, ListMinus, ListPlus, Printer, RotateCcw, Star, Swords, X } from "@/components/app/icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "@/lib/toast";
import { today } from "@/lib/clock";
import { download } from "@/lib/format";
import { shortMeaning, type Word } from "@/lib/data";
import { LETTERS, POS_KEYS, POS_LABEL, SORT_KEYS, SORT_LABEL, fileSafe, toAnki, toCSV, type PosKey, type SortKey } from "@/lib/lists";
import { batchKill, batchReset, getState, removeFromList, restoreSnapshot, snapshot, starWords } from "@/lib/store";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./sheet";
import { ListPicker } from "./lists";
import { actClass } from "./kit";

/** 12.0 · 工具行里的一项：纯文字，选中的值划荧光笔；不再是灰色药丸 */
const chip = "press flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap text-[0.8125rem] font-medium";

/** 原生下拉做成的筹码：手机上弹系统选择器 */
function SelectChip<T extends string>({ value, options, labels, onChange, icon, testid, active, idle }: { value: T; options: T[]; labels: Record<T, string>; onChange: (v: T) => void; icon: ReactNode; testid: string; active: boolean; idle: string }) {
  return (
    <label className={cn(chip, "relative cursor-pointer", active ? "text-ink" : "text-ink-3 hover:text-ink")}>
      <span className="text-[0.75rem] font-normal text-ink-3">{icon}</span>
      <span data-testid={`${testid}-label`} className={cn(active && "hl font-semibold")}>
        {active ? labels[value] : idle}
      </span>
      <ChevronDown className="size-3.5 opacity-60" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        data-testid={testid}
        aria-label={testid === "sort-select" ? "排序" : "词性筛选"}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {labels[o]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 排序 / 词性 / 仅核心 / 多选 / 导出 */
export function ToolRow({
  sort,
  setSort,
  pos,
  setPos,
  coreOnly,
  setCoreOnly,
  showCore,
  onSelect,
  onExport,
  canExport,
  selecting,
}: {
  sort: SortKey;
  setSort: (v: SortKey) => void;
  pos: PosKey;
  setPos: (v: PosKey) => void;
  coreOnly: boolean;
  setCoreOnly: (v: boolean) => void;
  showCore: boolean;
  onSelect: () => void;
  onExport: () => void;
  canExport: boolean;
  selecting: boolean;
}) {
  return (
    /* 一行「排序：默认 ▾ · 词性：全部 ▾ · 仅核心」，右边两个图标键（多选、导出），像词典凡例 */
    <div className="no-scrollbar -mx-4 mt-2 flex items-center gap-4 overflow-x-auto border-b border-rule px-4 md:mx-0 md:px-0" data-testid="tool-row">
      <SelectChip value={sort} options={SORT_KEYS} labels={SORT_LABEL} onChange={setSort} icon="排序" testid="sort-select" active={sort !== "default"} idle="默认" />
      <SelectChip value={pos} options={POS_KEYS} labels={POS_LABEL} onChange={setPos} icon="词性" testid="pos-select" active={pos !== "any"} idle="全部" />
      {showCore && (
        <button type="button" role="switch" aria-checked={coreOnly} data-testid="core-only" onClick={() => setCoreOnly(!coreOnly)} className={cn(chip, coreOnly ? "text-ink" : "text-ink-3 hover:text-ink")}>
          <span
            aria-hidden
            className={cn("grid size-4 place-items-center rounded-[3px] text-[0.625rem] font-bold", coreOnly ? "bg-ink text-paper-3" : "border-[1.5px] border-rule-strong")}
          >
            {coreOnly ? "✓" : ""}
          </span>
          仅核心
        </button>
      )}
      <span className="ml-auto flex shrink-0 items-center">
        <button
          type="button"
          aria-label="多选"
          title="多选（也可以长按单词）"
          data-testid="select-mode"
          aria-pressed={selecting}
          onClick={onSelect}
          className={cn("press grid size-10 place-items-center rounded-md", selecting ? "bg-ink text-paper-3" : "text-ink-2 hover:bg-paper-2 hover:text-ink")}
        >
          <CheckSquare className="size-[18px]" />
        </button>
        <button
          type="button"
          aria-label="导出 / 打印"
          title="导出 CSV、Anki 或打印"
          data-testid="export-open"
          disabled={!canExport}
          onClick={onExport}
          className="press grid size-10 place-items-center rounded-md text-ink-2 hover:bg-paper-2 hover:text-ink disabled:opacity-40"
        >
          <Download className="size-[18px]" />
        </button>
      </span>
    </div>
  );
}

/**
 * 右侧 A–Z 索引条：点或按住滑动跳到对应字母；
 * 不是按字母排序时，第一次点会先切换到「按字母」。
 */
export function AlphaRail({ have, onJump }: { have: Set<string>; onJump: (letter: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pick = (y: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const k = Math.min(LETTERS.length - 1, Math.max(0, Math.floor(((y - r.top) / r.height) * LETTERS.length)));
    const L = LETTERS[k];
    setBubble(L);
    if (last.current !== L) {
      last.current = L;
      onJump(L);
    }
  };
  const end = () => {
    last.current = null;
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setBubble(null), 450);
  };
  useEffect(() => () => clearTimeout(hide.current), []);
  return (
    <>
      <div
        ref={ref}
        role="navigation"
        aria-label="字母索引"
        data-testid="alpha-rail"
        className="fixed right-0.5 top-[calc(50%+4.5rem)] z-30 flex -translate-y-1/2 touch-none select-none flex-col items-center border-l border-rule bg-paper/90 py-1 pl-0.5 md:right-[max(0.5rem,calc(50%-34rem))]"
        onPointerDown={(e) => {
          (e.target as Element).releasePointerCapture?.(e.pointerId);
          e.currentTarget.setPointerCapture?.(e.pointerId);
          pick(e.clientY);
        }}
        onPointerMove={(e) => e.buttons && pick(e.clientY)}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {LETTERS.map((L) => (
          <span
            key={L}
            data-testid={`alpha-${L}`}
            className={cn(
              "grid h-[15px] w-5 place-items-center font-serif text-[0.75rem] leading-none",
              have.has(L) ? "text-ink" : "text-rule-strong",
              bubble === L && "rounded-[2px] bg-mark text-mark-ink",
            )}
          >
            {L}
          </span>
        ))}
      </div>
      {bubble && (
        /* 跳字母时屏幕中间一个大写字母：衬线、纸色底、细线框——像词典书口上的拇指索引 */
        <div
          className="float-shell pointer-events-none fixed left-1/2 top-1/2 z-40 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl font-serif text-[3.5rem] leading-none text-ink"
          data-testid="alpha-bubble"
        >
          {bubble}
        </div>
      )}
    </>
  );
}

/** 多选底栏：全选 / 生词本 / 斩 / 重置 / 加入词单 / 移出词单；每个批量操作都能撤销 */
export function SelectBar({ selected, total, onAll, onClear, onExit, listId }: { selected: string[]; total: number; onAll: () => void; onClear: () => void; onExit: () => void; listId?: string }) {
  const [picker, setPicker] = useState(false);
  const n = selected.length;
  const run = (label: string, fn: () => void) => {
    const snap = snapshot();
    fn();
    toast.success(`${label} ${n} 词`, { action: { label: "撤销", onClick: () => restoreSnapshot(snap) } });
    onExit();
  };
  const actions: { key: string; label: string; icon: ReactNode; cls?: string; on: () => void }[] = [
    { key: "star", label: "生词本", icon: <Star className="size-[18px]" />, on: () => run("已加入生词本", () => starWords(selected)) },
    { key: "kill", label: "斩", icon: <Swords className="size-[18px]" />, cls: "text-know", on: () => run("已斩", () => batchKill(selected)) },
    { key: "reset", label: "重置", icon: <RotateCcw className="size-[18px]" />, on: () => run("已重置", () => batchReset(selected)) },
    { key: "list", label: "加入词单", icon: <ListPlus className="size-[18px]" />, on: () => setPicker(true) },
  ];
  if (listId) actions.push({ key: "unlist", label: "移出词单", icon: <ListMinus className="size-[18px]" />, cls: "text-forget", on: () => run("已移出词单", () => removeFromList(listId, selected)) });
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-3 pb-2 md:bottom-4" data-testid="select-bar">
      <div className="float-shell mx-auto max-w-xl rounded-2xl px-2 pb-2 pt-1">
        <div className="flex items-center gap-3 border-b border-rule px-2 py-1.5">
          <span className="tnum text-[0.875rem] font-semibold" data-testid="select-count">
            已选 <span className="font-serif text-[1.25rem] font-normal">{n}</span> / {total}
          </span>
          <button type="button" data-testid="select-all" onClick={n === total ? onClear : onAll} className={actClass("quiet") + " h-9 text-[0.8125rem]"}>
            {n === total ? "全不选" : "全选"}
          </button>
          <button type="button" aria-label="退出多选" data-testid="select-exit" onClick={onExit} className="press ml-auto grid size-10 place-items-center rounded-md text-ink-3 hover:bg-paper-2 hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <div className={cn("mt-1 grid", actions.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              data-testid={`bulk-${a.key}`}
              disabled={!n}
              onClick={a.on}
              className={cn("press flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[0.75rem] font-medium hover:bg-paper-2 disabled:opacity-35", a.cls)}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <ListPicker open={picker} onOpenChange={setPicker} words={selected} onDone={onExit} />
    </div>
  );
}

/** 导出当前列表：CSV / Anki / 打印 */
export function ExportSheet({ open, onOpenChange, words, title }: { open: boolean; onOpenChange: (v: boolean) => void; words: Word[]; title: string }) {
  const [hideMeaning, setHideMeaning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const name = `四级词单-${fileSafe(title)}-${today()}`;
  const accent = getState().settings.accent;

  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    // 等打印视图渲染出来再调起系统打印
    const t = setTimeout(() => window.print(), 60);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  const row = "press flex min-h-16 w-full items-center gap-3 border-b border-rule py-3 text-left hover:bg-paper-2/60";
  return (
    <>
      <BottomSheet open={open} onOpenChange={onOpenChange} title={`导出「${title}」· ${words.length} 词`} testid="export-sheet">
        <p className="pb-3 text-[0.8125rem] text-ink-3">导出的是当前看到的列表（已按筛选、搜索和排序）。</p>
        {/* 三种格式排成一张小目录：格式名 · 用途 · 右边一个「下载 / 打印」 */}
        <div className="border-t border-ink">
          <button type="button" className={row} data-testid="export-csv" onClick={() => download(`${name}.csv`, toCSV(words, accent), "text/csv;charset=utf-8")}>
            <span className="w-14 shrink-0 font-serif text-[1.375rem] italic leading-none">.csv</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold">CSV 表格</span>
              <span className="block text-[0.75rem] text-ink-3">单词, 音标, 释义 · Excel / WPS 直接打开</span>
            </span>
            <Download className="size-4 shrink-0 text-ink-3" />
          </button>
          <button type="button" className={row} data-testid="export-anki" onClick={() => download(`${name}-anki.txt`, toAnki(words, accent), "text/tab-separated-values;charset=utf-8")}>
            <span className="w-14 shrink-0 font-serif text-[1.375rem] italic leading-none">.tsv</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold">Anki 卡组（TSV）</span>
              <span className="block text-[0.75rem] text-ink-3">正面单词，背面音标 + 释义 · Anki「导入文件」</span>
            </span>
            <Download className="size-4 shrink-0 text-ink-3" />
          </button>
          <div className="py-4">
            <div className="flex items-baseline gap-3">
              <span className="w-14 shrink-0 font-serif text-[1.375rem] italic leading-none">A4</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold">打印词单</span>
                <span className="block text-[0.75rem] text-ink-3">A4 三栏紧凑排版，可存为 PDF</span>
              </span>
            </div>
            <label className="ml-[4.25rem] mt-3 flex min-h-9 items-center gap-2.5 text-[0.875rem]">
              <input type="checkbox" checked={hideMeaning} onChange={(e) => setHideMeaning(e.target.checked)} data-testid="print-hide" className="size-4 accent-[var(--ink)]" />
              隐藏释义，做成自测纸
            </label>
            <button
              type="button"
              data-testid="export-print"
              onClick={() => {
                onOpenChange(false);
                setPrinting(true);
              }}
              className={actClass("primary") + " mt-3 h-11 w-full"}
            >
              <Printer className="size-4" /> 打印 {words.length} 词
            </button>
          </div>
        </div>
      </BottomSheet>
      {printing && <PrintView words={words} title={title} hideMeaning={hideMeaning} accent={accent} />}
    </>
  );
}

/** 只在打印时出现的版面（屏幕上隐藏，见 styles.css @media print） */
function PrintView({ words, title, hideMeaning, accent }: { words: Word[]; title: string; hideMeaning: boolean; accent: "us" | "uk" }) {
  return createPortal(
    <div id="print-root" data-testid="print-root" data-hide={hideMeaning ? "1" : "0"}>
      <header className="print-head">
        <b>四级词单 · {title}</b>
        <span>
          {words.length} 词 · {today()}
          {hideMeaning ? " · 自测纸" : ""}
        </span>
      </header>
      <ol className="print-cols">
        {words.map((w, k) => (
          <li key={w.w} className="print-item" data-testid="print-item">
            <span className="print-no">{k + 1}</span>
            <div className="print-body">
              <span className="print-word">{w.w}</span>
              {w.p && <span className="print-ipa">/{accent === "uk" ? w.p[1] : w.p[0]}/</span>}
              {hideMeaning ? <span className="print-blank" /> : <span className="print-mean">{shortMeaning(w, 2)}</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>,
    document.body,
  );
}
