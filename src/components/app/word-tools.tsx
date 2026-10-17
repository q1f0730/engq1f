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
      {/* 右端两个文字工具：多选、导出（选中时墨底） */}
      <span className="ml-auto flex shrink-0 items-center gap-1 pl-2">
        <button
          type="button"
          aria-label="多选"
          title="多选（也可以长按单词）"
          data-testid="select-mode"
          aria-pressed={selecting}
          onClick={onSelect}
          className={cn("press flex h-9 items-center gap-1.5 rounded-md px-2 text-[0.8125rem] font-medium", selecting ? "bg-ink text-paper-3" : "text-ink-2 hover:bg-paper-2 hover:text-ink")}
        >
          <CheckSquare className="size-4" />
          <span className="hidden min-[400px]:inline">多选</span>
        </button>
        <button
          type="button"
          aria-label="导出 / 打印"
          title={!canExport ? "当前列表中没有单词可导出" : "导出 CSV、Anki 或打印"}
          data-testid="export-open"
          disabled={!canExport}
          onClick={onExport}
          className="press flex h-9 items-center gap-1.5 rounded-md px-2 text-[0.8125rem] font-medium text-ink-2 hover:bg-paper-2 hover:text-ink disabled:opacity-40"
        >
          <Download className="size-4" />
          <span className="hidden min-[400px]:inline">导出</span>
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
  const actions: { key: string; label: string; icon: ReactNode; on: () => void }[] = [
    { key: "star", label: "生词本", icon: <Star className="size-4" />, on: () => run("已加入生词本", () => starWords(selected)) },
    { key: "kill", label: "斩", icon: <Swords className="size-4" />, on: () => run("已斩", () => batchKill(selected)) },
    { key: "reset", label: "重置", icon: <RotateCcw className="size-4" />, on: () => run("已重置", () => batchReset(selected)) },
    { key: "list", label: "加入词单", icon: <ListPlus className="size-4" />, on: () => setPicker(true) },
  ];
  if (listId) actions.push({ key: "unlist", label: "移出词单", icon: <ListMinus className="size-4" />, on: () => run("已移出词单", () => removeFromList(listId, selected)) });
  // 12.0 · 多选栏：一张浮起的墨色纸条。上面一行「已选 N / 总数」+ 全选 + 关闭，
  // 下面一排文字动作（小图标在字前），危险的「移出词单」用砖红字；不再是一格一个图标的宫格
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-3 pb-2 md:bottom-4" data-testid="select-bar">
      <section className="mx-auto max-w-xl rounded-2xl bg-ink px-3 pb-2.5 pt-2 text-paper-3 shadow-[0_18px_40px_-20px_rgba(20,20,10,0.6)]">
        <header className="flex items-center gap-3">
          <span className="tnum text-[0.875rem] font-medium" data-testid="select-count">
            已选 <span className="font-serif text-[1.375rem] font-normal">{n}</span> / {total}
          </span>
          <button
            type="button"
            data-testid="select-all"
            onClick={n === total ? onClear : onAll}
            className="press h-9 px-1 text-[0.8125rem] font-medium text-paper-3/80 underline decoration-paper-3/40 underline-offset-4 hover:text-paper-3"
          >
            {n === total ? "全不选" : "全选"}
          </button>
          <button type="button" aria-label="退出多选" data-testid="select-exit" onClick={onExit} className="press ml-auto grid size-10 place-items-center rounded-md text-paper-3/70 hover:bg-paper-3/10 hover:text-paper-3">
            <X className="size-4" />
          </button>
        </header>
        <div className="no-scrollbar -mx-1 mt-1 flex gap-1 overflow-x-auto">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              data-testid={`bulk-${a.key}`}
              disabled={!n}
              title={!n ? "请先勾选单词" : undefined}
              onClick={a.on}
              className={cn(
                "press flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-semibold disabled:opacity-35",
                a.key === "unlist" ? "text-forget-soft hover:bg-paper-3/10" : a.key === "star" ? "bg-mark text-mark-ink hover:brightness-95" : "hover:bg-paper-3/10",
              )}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      </section>
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

  const csv = () => download(`${name}.csv`, toCSV(words, accent), "text/csv;charset=utf-8");
  const anki = () => download(`${name}-anki.txt`, toAnki(words, accent), "text/tab-separated-values;charset=utf-8");
  const print = () => {
    onOpenChange(false);
    setPrinting(true);
  };
  return (
    <>
      <BottomSheet open={open} onOpenChange={onOpenChange} title={`导出「${title}」· ${words.length} 词`} testid="export-sheet">
        <p className="text-[0.8125rem] text-ink-3">导出的是当前看到的列表（已按筛选、搜索和排序）。</p>
        {/* 12.0 · 两种文件格式并排成两张「文件卡」：大号斜体扩展名 + 用途；打印单独一节，带一个开关和主按钮 */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <FileCard ext=".csv" name="CSV 表格" use="Excel / WPS 直接打开" testid="export-csv" onClick={csv} />
          <FileCard ext=".tsv" name="Anki 卡组" use="Anki「导入文件」" testid="export-anki" onClick={anki} />
        </div>
        <section className="mt-6 border-t border-ink pt-3">
          <h3 className="flex items-baseline gap-2.5">
            <span className="font-serif text-[1.375rem] italic leading-none">A4</span>
            <span className="text-[0.9375rem] font-semibold">打印词单</span>
            <span className="text-[0.75rem] text-ink-3">三栏紧凑，可存为 PDF</span>
          </h3>
          <label className="mt-3 flex min-h-11 items-center justify-between gap-3 text-[0.875rem]">
            隐藏释义，做成自测纸
            <input type="checkbox" checked={hideMeaning} onChange={(e) => setHideMeaning(e.target.checked)} data-testid="print-hide" className="size-4 accent-[var(--ink)]" />
          </label>
          <button type="button" data-testid="export-print" onClick={print} className={actClass("primary") + " mt-2 h-12 w-full"}>
            <Printer className="size-4" /> 打印 {words.length} 词
          </button>
        </section>
      </BottomSheet>
      {printing && <PrintView words={words} title={title} hideMeaning={hideMeaning} accent={accent} />}
    </>
  );
}

function FileCard({ ext, name, use, testid, onClick }: { ext: string; name: string; use: string; testid: string; onClick: () => void }) {
  return (
    <button type="button" data-testid={testid} onClick={onClick} className="press group flex min-h-28 flex-col justify-between rounded-xl bg-paper-3 p-3.5 text-left ring-1 ring-inset ring-rule hover:ring-ink">
      <span className="flex items-start justify-between">
        <span className="font-serif text-[1.75rem] italic leading-none">{ext}</span>
        <Download className="size-4 text-ink-3 transition-colors group-hover:text-ink" />
      </span>
      <span>
        <span className="block text-[0.875rem] font-semibold">{name}</span>
        <span className="mt-0.5 block text-[0.6875rem] leading-snug text-ink-3">{use}</span>
      </span>
    </button>
  );
}

/**
 * 只在打印时出现的版面（屏幕上隐藏，见 styles.css @media print）。
 * 12.0 · 像一张词典附页：抬头左边词单名、右边词数和日期，三栏正文，页脚一行小字说明怎么用。
 */
function PrintView({ words, title, hideMeaning, accent }: { words: Word[]; title: string; hideMeaning: boolean; accent: "us" | "uk" }) {
  const ipa = (w: Word) => (w.p ? (accent === "uk" ? w.p[1] : w.p[0]) : "");
  const meta = `${words.length} 词 · ${today()}${hideMeaning ? " · 自测纸" : ""}`;
  return createPortal(
    <article id="print-root" data-testid="print-root" data-hide={hideMeaning ? "1" : "0"}>
      <header className="print-head">
        <b>四级词单 · {title}</b>
        <span>{meta}</span>
      </header>
      <ol className="print-cols">
        {words.map((w, k) => {
          const p = ipa(w);
          return (
            <li key={w.w} className="print-item" data-testid="print-item">
              <small className="print-no">{k + 1}</small>
              <p className="print-body">
                <b className="print-word">{w.w}</b>
                {p && <i className="print-ipa">/{p}/</i>}
                {hideMeaning ? <span className="print-blank" /> : <span className="print-mean">{shortMeaning(w, 2)}</span>}
              </p>
            </li>
          );
        })}
      </ol>
      <footer className="print-foot">{hideMeaning ? "盖住左边的词，看着空格默写意思；写完对照原词单。" : "四级单词打卡 · 离线可用的背单词 PWA"}</footer>
    </article>,
    document.body,
  );
}
