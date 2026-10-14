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
      <div className="space-y-3 pt-1">
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
          <p className="py-4 text-center text-[0.8125rem] text-ink-3">还没有词单，起个名字新建一个</p>
        ) : (
          <ul className="space-y-1.5">
            {lists.map((l) => {
              const inIt = single && l.words.includes(words[0]);
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    data-testid="picker-list"
                    data-in={inIt ? "1" : "0"}
                    onClick={() => {
                      if (!single) return finish(l.id, l.name);
                      if (inIt) removeFromList(l.id, words);
                      else addToList(l.id, words);
                    }}
                    className={cn(
                      "press flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left",
                      inIt ? "bg-mark-soft" : "bg-paper-2 hover:bg-paper-2",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-semibold">{l.name}</span>
                      <span className="block text-xs text-ink-3">{l.words.length} 词</span>
                    </span>
                    {single ? (
                      <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2", inIt ? "border-ink bg-ink text-paper-3" : "border-rule")}>
                        {inIt && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                    ) : (
                      <Plus className="size-5 shrink-0 text-ink" />
                    )}
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
    <div data-testid="lists-overview">
      <button
        type="button"
        data-testid="list-new"
        disabled={lists.length >= LIST_MAX}
        onClick={() => {
          setWithStar(false);
          setCreating(true);
        }}
        className="press flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-ink bg-mark-soft px-4 py-3.5 text-left disabled:opacity-50"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-ink text-paper-3">
          <ListPlus className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-semibold">新建词单</span>
          <span className="block text-xs text-ink-3">{lists.length >= LIST_MAX ? `最多 ${LIST_MAX} 个词单` : "按章节、真题、话题自己归类"}</span>
        </span>
      </button>

      {lists.length === 0 ? (
        <div className="px-6 py-12 text-center text-[0.8125rem] leading-relaxed text-ink-3" data-testid="lists-empty">
          还没有自建词单。
          <br />
          在词库<b className="text-ink">长按单词</b>多选，或在单词详情里点「加入词单」。
        </div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {lists.map((l) => {
            const p = listProgress(index, st, l, day);
            return (
              <li key={l.id}>
                <Link
                  to="/words"
                  search={{ tab: "list", list: l.id }}
                  replace
                  data-testid="list-card"
                  className="block rounded-xl ring-1 ring-rule ring-inset bg-paper-3 px-4 py-3.5 transition hover:bg-paper-2 active:scale-[0.995]"
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-base font-semibold" data-testid="list-card-name">
                      {l.name}
                    </span>
                    {p.due > 0 && <span className="shrink-0 rounded-[3px] bg-forget-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-forget">到期 {p.due}</span>}
                    <ChevronRight className="size-4 shrink-0 text-ink-3" />
                  </div>
                  <div className="mt-0.5 text-xs text-ink-3" data-testid="list-card-meta">
                    {p.total} 词 · 未学 {p.unlearned} · 学习中 {p.learning} · 已掌握 {p.mastered}
                  </div>
                  <ProgressBar p={p} className="mt-2.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <BottomSheet open={creating} onOpenChange={setCreating} title="新建词单" testid="list-create">
        <div className="space-y-3 pt-1">
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
            <label className="flex items-center gap-3 rounded-2xl bg-paper-2 px-3.5 py-3 text-sm">
              <input type="checkbox" checked={withStar} onChange={(e) => setWithStar(e.target.checked)} data-testid="create-with-star" className="size-4 accent-[var(--primary)]" />
              <Star className="size-4 fill-vague text-vague" />
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
    <div className={cn("flex h-1.5 overflow-hidden rounded-[2px] bg-rule", className)}>
      <div className="h-full bg-know" style={{ width: `${(p.mastered / t) * 100}%` }} />
      <div className="h-full bg-vague" style={{ width: `${(p.learning / t) * 100}%` }} />
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
  return (
    <div className="mb-3 rounded-xl ring-1 ring-rule ring-inset bg-paper-3 p-4" data-testid="list-panel">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold tracking-[-0.015em]" data-testid="list-name">
            {list.name}
          </h2>
          <div className="text-xs text-ink-3" data-testid="list-meta">
            {p.total} 词 · 未学 {p.unlearned} · 学习中 {p.learning} · 已掌握 {p.mastered}
          </div>
        </div>
        {list.words.length > 0 && (
          <button type="button" aria-label="分享词单链接" title="分享链接" data-testid="list-share" onClick={() => setSharing(true)} className="grid size-9 shrink-0 place-items-center rounded-full bg-paper-2 text-ink-3 hover:text-ink">
            <Link2 className="size-4" />
          </button>
        )}
        <button type="button" aria-label="重命名词单" title="重命名" data-testid="list-rename" onClick={() => setRenaming(true)} className="grid size-9 shrink-0 place-items-center rounded-full bg-paper-2 text-ink-3 hover:text-ink">
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          aria-label="删除词单"
          title="删除词单"
          data-testid="list-delete"
          onClick={() => {
            const snap = snapshot();
            deleteList(list.id);
            navigate({ to: "/words", search: { tab: "lists" }, replace: true });
            toast(`已删除「${list.name}」`, { description: "单词和学习记录都还在", action: { label: "撤销", onClick: () => restoreSnapshot(snap) } });
          }}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-paper-2 text-ink-3 hover:text-forget"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      {p.total > 0 && <ProgressBar p={p} className="mt-3 h-2" />}
      <div className="mt-3 flex gap-2">
        {g.step !== "done" ? (
          <Link
            to="/study"
            search={{ mode: "list", list: list.id }}
            data-testid="list-study"
            data-step={g.step}
            className="press flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-ink text-[0.9375rem] font-semibold text-paper-3 hover:bg-ink-2"
          >
            <Play className="size-4 shrink-0 fill-current" />
            <span className="truncate">{listStepLabel(g)}</span>
          </Link>
        ) : (
          <div className="flex h-12 flex-1 items-center justify-center rounded-lg bg-paper-2 text-sm font-semibold text-ink-3" data-testid="list-study-done">
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
            className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-vague-soft px-3.5 text-[0.8125rem] font-semibold text-vague"
          >
            <Star className="size-4 fill-current" /> 导入生词本 {starWords.length}
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
    </div>
  );
}
