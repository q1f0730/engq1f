import { Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronRight, Link2, ListPlus, Pencil, Play, Plus, Star, Trash2 } from "@/components/app/icons";
import { lazy, Suspense, useState } from "react";
import { toast } from "@/lib/toast";
import { today } from "@/lib/clock";
import type { WordIndex } from "@/lib/data";
import { LIST_MAX, LIST_NAME_MAX, listGroup, listProgress, listStepLabel, type WordList } from "@/lib/lists";
import { addToList, createList, deleteList, getState, removeFromList, renameList, restoreSnapshot, snapshot, useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./sheet";
import { NameField } from "./name-field";
import { Tag, actClass } from "./kit";

const ListLinkSheet = lazy(() => import("./list-link-sheet"));

/**
 * 加入词单：
 *  - 单个词（详情页）：每个词单一个开关，点一下加入/移出
 *  - 多个词（批量）：点词单 = 全部加入，然后关闭
 */
export function ListPicker({ open, onOpenChange, words, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; words: string[]; onDone?: () => void }) {
  const st = useApp();
  const lists = st.lists ?? [];
  const single = words.length === 1;
  const finish = (id: string, name: string) => {
    addToList(id, words);
    toast.success(`已加入「${name}」`, { description: `${words.length} 个词` });
    onOpenChange(false);
    onDone?.();
  };
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={single ? `把 ${words[0]} 加入词单` : `${words.length} 个词加入词单`} testid="list-picker">
      <div className="pt-1">
        {lists.length < LIST_MAX && (
          <NameField
            placeholder="新建词单，比如：阅读真题生词"
            action="新建"
            testid="picker-new"
            onSubmit={(name) => {
              const id = createList(name, words);
              if (!id) return;
              const l = getState().lists.find((x) => x.id === id)!;
              toast.success(`已新建「${l.name}」`, { description: `${words.length} 个词` });
              if (!single) {
                onOpenChange(false);
                onDone?.();
              }
            }}
          />
        )}
        {lists.length === 0 ? (
          <p className="py-6 text-center text-[0.8125rem] text-ink-3">还没有词单，起个名字新建一个</p>
        ) : (
          <ul className="mt-4 border-t border-rule">
            {lists.map((l) => {
              const inIt = single && l.words.includes(words[0]);
              return (
                <li key={l.id} className="border-b border-rule">
                  <button
                    type="button"
                    data-testid="picker-list"
                    data-in={inIt ? "1" : "0"}
                    onClick={() => {
                      if (!single) return finish(l.id, l.name);
                      if (inIt) removeFromList(l.id, words);
                      else addToList(l.id, words);
                    }}
                    className="press flex min-h-14 w-full items-center gap-3 py-2.5 text-left hover:bg-paper-2/60"
                  >
                    {single && (
                      <span className={cn("grid size-5 shrink-0 place-items-center rounded-[3px]", inIt ? "bg-ink text-paper-3" : "border-[1.5px] border-rule-strong")}>
                        {inIt && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-[0.9375rem]", inIt ? "font-semibold" : "font-medium")}>{l.name}</span>
                    </span>
                    <span className="tnum shrink-0 font-serif text-[1.125rem] text-ink-3">{l.words.length}</span>
                    {!single && <Plus className="size-5 shrink-0 text-ink" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}

/** 词单总览：每个词单一张卡片 + 新建 */
export function ListsOverview({ index }: { index: WordIndex }) {
  const st = useApp();
  const lists = st.lists ?? [];
  const day = today();
  const starN = Object.keys(st.star).length;
  const [creating, setCreating] = useState(false);
  const [withStar, setWithStar] = useState(false);
  const navigate = useNavigate();
  return (
    <div data-testid="lists-overview" className="pt-2">
      {lists.length === 0 ? (
        <div className="border-y border-rule px-6 py-12 text-center" data-testid="lists-empty">
          <div className="font-serif text-[2.5rem] italic leading-none text-rule-strong" aria-hidden>
            ¶
          </div>
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-3">
            还没有自建词单。
            <br />
            在词库<b className="font-semibold text-ink">长按单词</b>多选，或在单词详情里点「加入词单」。
          </p>
        </div>
      ) : (
        /* 词单 = 书的目录：名字、到期数、三段进度细线 */
        <ul className="border-t border-ink">
          {lists.map((l, k) => {
            const p = listProgress(index, st, l, day);
            return (
              <li key={l.id} className="border-b border-rule">
                <Link
                  to="/words"
                  search={{ tab: "list", list: l.id }}
                  replace
                  data-testid="list-card"
                  className="press group grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-baseline gap-x-2 py-3.5 hover:bg-paper-2/60"
                >
                  <span className="tnum font-serif text-[1.125rem] leading-none text-ink-3">{String(k + 1).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 truncate text-[1rem] font-semibold" data-testid="list-card-name">
                        {l.name}
                      </span>
                      {p.due > 0 && <Tag tone="forget">到期 {p.due}</Tag>}
                    </span>
                    <span className="mt-0.5 block text-[0.75rem] text-ink-3" data-testid="list-card-meta">
                      {p.total} 词 · 未学 {p.unlearned} · 学习中 {p.learning} · 已掌握 {p.mastered}
                    </span>
                    <ProgressBar p={p} className="mt-2" />
                  </span>
                  <span aria-hidden className="self-center font-serif text-[1.375rem] leading-none text-ink-3 transition-transform group-hover:translate-x-0.5">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        data-testid="list-new"
        disabled={lists.length >= LIST_MAX}
        onClick={() => {
          setWithStar(false);
          setCreating(true);
        }}
        className="press mt-4 flex min-h-14 w-full items-center gap-3 rounded-lg border border-rule-strong px-4 py-3 text-left hover:border-ink disabled:opacity-45"
      >
        <Plus className="size-5 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-semibold">新建词单</span>
          <span className="block text-[0.75rem] text-ink-3">{lists.length >= LIST_MAX ? `最多 ${LIST_MAX} 个词单` : "按章节、真题、话题自己归类"}</span>
        </span>
      </button>

      <BottomSheet open={creating} onOpenChange={setCreating} title="新建词单" testid="list-create">
        <div className="pt-1">
          <NameField
            placeholder="词单名，比如：Unit 3 / 听力高频"
            action="创建"
            testid="create"
            onSubmit={(name) => {
              const id = createList(name, withStar ? Object.keys(getState().star) : []);
              setCreating(false);
              if (id) navigate({ to: "/words", search: { tab: "list", list: id }, replace: true });
            }}
          />
          {starN > 0 && (
            <label className="mt-4 flex min-h-11 items-center gap-3 border-t border-rule pt-3 text-[0.875rem]">
              <input type="checkbox" checked={withStar} onChange={(e) => setWithStar(e.target.checked)} data-testid="create-with-star" className="size-4 accent-[var(--ink)]" />
              <span className="flex-1">同时导入生词本的 {starN} 个词</span>
            </label>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}

function ProgressBar({ p, className }: { p: { total: number; learning: number; mastered: number }; className?: string }) {
  const t = Math.max(1, p.total);
  return (
    <div className={cn("flex h-[3px] gap-px overflow-hidden bg-rule", className)}>
      <div className="h-full bg-ink" style={{ width: `${(p.mastered / t) * 100}%` }} />
      <div className="h-full bg-mark" style={{ width: `${(p.learning / t) * 100}%` }} />
    </div>
  );
}

/** 单个词单页顶部：名称、进度、学习入口、导入生词本、重命名、删除 */
export function ListPanel({ index, list }: { index: WordIndex; list: WordList }) {
  const st = useApp();
  const navigate = useNavigate();
  const day = today();
  const p = listProgress(index, st, list, day);
  const g = listGroup(index, st, list.words, day);
  const [renaming, setRenaming] = useState(false);
  const [sharing, setSharing] = useState(false);
  const starWords = Object.keys(st.star).filter((w) => !list.words.includes(w) && index.map.has(w));
  const tool = "press inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-[0.8125rem] font-medium text-ink-2 hover:bg-paper-2 hover:text-ink";
  const remove = () => {
    const snap = snapshot();
    deleteList(list.id);
    navigate({ to: "/words", search: { tab: "lists" }, replace: true });
    toast(`已删除「${list.name}」`, { description: "单词和学习记录都还在", action: { label: "撤销", onClick: () => restoreSnapshot(snap) } });
  };
  return (
    <section className="mb-3 border-b border-rule pb-4" data-testid="list-panel">
      {/* 12.0 · 词单页的书名页：大标题 + 一行统计；三个操作是标题下面一排安静的文字工具，不是三个图标方块 */}
      <h2 className="truncate text-[1.5rem] font-semibold leading-tight tracking-[-0.02em]" data-testid="list-name">
        {list.name}
      </h2>
      <p className="tnum mt-1 text-[0.75rem] text-ink-3" data-testid="list-meta">
        {p.total} 词 · 未学 {p.unlearned} · 学习中 {p.learning} · 已掌握 {p.mastered}
      </p>
      <div className="-ml-2 mt-2 flex flex-wrap items-center" role="toolbar" aria-label="词单操作">
        {list.words.length > 0 && (
          <button type="button" aria-label="分享词单链接" data-testid="list-share" onClick={() => setSharing(true)} className={tool}>
            <Link2 className="size-4" /> 分享
          </button>
        )}
        <button type="button" aria-label="重命名词单" data-testid="list-rename" onClick={() => setRenaming(true)} className={tool}>
          <Pencil className="size-4" /> 重命名
        </button>
        <button type="button" aria-label="删除词单" data-testid="list-delete" onClick={remove} className={cn(tool, "hover:text-forget")}>
          <Trash2 className="size-4" /> 删除
        </button>
      </div>
      {p.total > 0 && <ProgressBar p={p} className="mt-3" />}
      <div className="mt-4 flex flex-wrap gap-2">
        {g.step !== "done" ? (
          <Link to="/study" search={{ mode: "list", list: list.id }} data-testid="list-study" data-step={g.step} className={actClass("primary", true) + " h-12 text-[0.9375rem]"}>
            <span className="truncate">{listStepLabel(g)}</span>
          </Link>
        ) : (
          <div className="flex h-12 flex-1 items-center justify-center border-y border-rule text-[0.875rem] font-medium text-ink-3" data-testid="list-study-done">
            {p.total ? "这个词单全部斩完了" : "词单还是空的"}
          </div>
        )}
        {starWords.length > 0 && (
          <button
            type="button"
            data-testid="list-import-star"
            onClick={() => {
              addToList(list.id, starWords);
              toast.success(`已导入生词本 ${starWords.length} 词`);
            }}
            className={actClass("secondary") + " h-12 text-[0.8125rem]"}
          >
            <Star className="size-4" /> 导入生词本 {starWords.length}
          </button>
        )}
      </div>
      {sharing && (
        <Suspense fallback={null}>
          <ListLinkSheet open={sharing} onOpenChange={setSharing} list={list} />
        </Suspense>
      )}
      <BottomSheet open={renaming} onOpenChange={setRenaming} title="重命名词单" testid="list-rename-sheet">
        <div className="pt-1">
          <NameField
            initial={list.name}
            placeholder="词单名"
            action="保存"
            testid="rename"
            onSubmit={(name) => {
              renameList(list.id, name);
              setRenaming(false);
            }}
          />
        </div>
      </BottomSheet>
    </section>
  );
}
