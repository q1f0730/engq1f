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

const chip = "flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-[0.8125rem] font-semibold transition";

/** 原生下拉做成的筹码：手机上弹系统选择器 */
function SelectChip<T extends string>({ value, options, labels, onChange, icon, testid, active, idle }: { value: T; options: T[]; labels: Record<T, string>; onChange: (v: T) => void; icon: ReactNode; testid: string; active: boolean; idle: string }) {
  return (
    <label className={cn(chip, "relative", active ? "bg-foreground text-background" : "bg-paper-2 text-ink-3")}>
      {icon}
      <span data-testid={`${testid}-label`}>{active ? labels[value] : idle}</span>
      <ChevronDown className="size-3.5 opacity-70" />
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
    <div className="no-scrollbar -mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0" data-testid="tool-row">
      <SelectChip value={sort} options={SORT_KEYS} labels={SORT_LABEL} onChange={setSort} icon={<ArrowUpDown className="size-3.5" />} testid="sort-select" active={sort !== "default"} idle="排序" />
      <SelectChip value={pos} options={POS_KEYS} labels={POS_LABEL} onChange={setPos} icon={<Layers className="size-3.5" />} testid="pos-select" active={pos !== "any"} idle="词性" />
      {showCore && (
        <button type="button" role="switch" aria-checked={coreOnly} data-testid="core-only" onClick={() => setCoreOnly(!coreOnly)} className={cn(chip, coreOnly ? "bg-ink text-paper-3" : "bg-paper-2 text-ink-3")}>
          <GraduationCap className="size-3.5" /> 仅核心
        </button>
      )}
      <button type="button" aria-label="多选" title="多选（也可以长按单词）" data-testid="select-mode" aria-pressed={selecting} onClick={onSelect} className={cn(chip, "ml-auto w-9 justify-center px-0", selecting ? "bg-ink text-paper-3" : "bg-paper-2 text-ink-3 hover:text-ink")}>
        <CheckSquare className="size-4" />
      </button>
      <button type="button" aria-label="导出 / 打印" title="导出 CSV、Anki 或打印" data-testid="export-open" disabled={!canExport} onClick={onExport} className={cn(chip, "w-9 justify-center px-0 bg-paper-2 text-ink-3 hover:text-ink disabled:opacity-40")}>
        <Download className="size-4" />
      </button>
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
        className="fixed right-0.5 top-[calc(50%+4.5rem)] z-30 flex -translate-y-1/2 touch-none select-none flex-col items-center rounded-lg bg-paper px-0.5 py-1.5 md:right-[max(0.5rem,calc(50%-34rem))]"
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
          <span key={L} data-testid={`alpha-${L}`} className={cn("grid h-[15px] w-5 place-items-center text-[0.6562rem] font-semibold leading-none", have.has(L) ? "text-ink" : "text-ink-3", bubble === L && "rounded-full bg-ink text-paper-3")}>
            {L}
          </span>
        ))}
      </div>
      {bubble && (
        <div className="pointer-events-none fixed left-1/2 top-1/2 z-40 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-foreground/85 font-display text-[2.5rem] font-semibold text-background shadow-2xl" data-testid="alpha-bubble">
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
      <div className="mx-auto max-w-xl rounded-xl ring-1 ring-rule ring-inset bg-paper-3 p-2">
        <div className="flex items-center gap-2 px-2 pb-1.5 pt-0.5">
          <span className="tnum text-sm font-semibold" data-testid="select-count">
            已选 {n} / {total}
          </span>
          <button type="button" data-testid="select-all" onClick={n === total ? onClear : onAll} className="rounded-[3px] bg-paper-2 px-2.5 py-1 text-xs font-semibold text-ink-3 hover:text-ink">
            {n === total ? "全不选" : "全选"}
          </button>
          <button type="button" aria-label="退出多选" data-testid="select-exit" onClick={onExit} className="ml-auto grid size-8 place-items-center rounded-full bg-paper-2 text-ink-3">
            <X className="size-4" />
          </button>
        </div>
        <div className={cn("grid gap-1", actions.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              data-testid={`bulk-${a.key}`}
              disabled={!n}
              onClick={a.on}
              className={cn("press flex flex-col items-center gap-1 rounded-2xl py-2 text-[0.7188rem] font-semibold hover:bg-paper-2 disabled:opacity-35", a.cls)}
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

  const row = "press flex w-full items-center gap-3 rounded-2xl bg-paper-2 px-3.5 py-3 text-left hover:bg-paper-2";
  return (
    <>
      <BottomSheet open={open} onOpenChange={onOpenChange} title={`导出「${title}」· ${words.length} 词`} testid="export-sheet">
        <div className="space-y-2 pt-1">
          <p className="pb-1 text-xs text-ink-3">导出的是当前看到的列表（已按筛选、搜索和排序）。</p>
          <button type="button" className={row} data-testid="export-csv" onClick={() => download(`${name}.csv`, toCSV(words, accent), "text/csv;charset=utf-8")}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-know-soft text-know">
              <FileSpreadsheet className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold">CSV 表格</span>
              <span className="block text-xs text-ink-3">单词, 音标, 释义 · Excel / WPS 直接打开</span>
            </span>
          </button>
          <button type="button" className={row} data-testid="export-anki" onClick={() => download(`${name}-anki.txt`, toAnki(words, accent), "text/tab-separated-values;charset=utf-8")}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mark-soft text-ink">
              <Layers className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold">Anki 卡组（TSV）</span>
              <span className="block text-xs text-ink-3">正面单词，背面音标 + 释义 · Anki「导入文件」</span>
            </span>
          </button>
          <div className="rounded-2xl bg-paper-2 p-3.5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-vague-soft text-vague">
                <Printer className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold">打印词单</span>
                <span className="block text-xs text-ink-3">A4 三栏紧凑排版，可存为 PDF</span>
              </span>
            </div>
            <label className="mt-3 flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={hideMeaning} onChange={(e) => setHideMeaning(e.target.checked)} data-testid="print-hide" className="size-4 accent-[var(--primary)]" />
              隐藏释义，做成自测纸
            </label>
            <button
              type="button"
              data-testid="export-print"
              onClick={() => {
                onOpenChange(false);
                setPrinting(true);
              }}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-semibold text-paper-3"
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
