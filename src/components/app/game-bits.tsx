import { Link } from "@tanstack/react-router";
import { RotateCcw, Sparkles, Star, Trophy, X } from "@/components/app/icons";
import type { ReactNode } from "react";
import { toast } from "@/lib/toast";
import { shortMeaning, type WordIndex } from "@/lib/data";
import { starWords, useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/** v9 · 小游戏共用：开始页、结果页
 * 12.0 · 开始页不再是「彩色图标方块 + 居中」模板：左对齐的一页说明，题量是最大的字，按钮放在拇指够得到的底部 */
export function GameIntro({
  testid,
  title,
  big,
  desc,
  tags,
  best,
  bestLabel,
  onStart,
  onQuit,
  startLabel,
}: {
  testid: string;
  icon?: ReactNode;
  title: string;
  big: string;
  desc: string;
  tags: string[];
  best: number;
  bestLabel: string;
  onStart: () => void;
  onQuit: () => void;
  startLabel: string;
}) {
  return (
    <div className="flex flex-1 flex-col" data-testid={testid}>
      <TopBar title={title}>
        <button type="button" onClick={onQuit} aria-label="退出" className="press -ml-2 grid size-11 place-items-center rounded-lg text-ink-2 hover:bg-paper-2 hover:text-ink">
          <X className="size-[22px]" />
        </button>
      </TopBar>
      <div className="flex flex-1 flex-col justify-end pb-6">
        <h1 className="rise text-[2.5rem] font-semibold leading-[1.08] tracking-[-0.03em]" style={{ "--i": 0 } as React.CSSProperties}>
          {big}
        </h1>
        <p className="rise mt-4 max-w-[26em] text-[0.9375rem] leading-relaxed text-ink-2" style={{ "--i": 1 } as React.CSSProperties}>
          {desc}
        </p>
        <ul className="rise mt-6 flex flex-wrap gap-x-1 gap-y-1.5 border-t border-rule pt-4 text-[0.8125rem] text-ink-3" style={{ "--i": 2 } as React.CSSProperties}>
          {tags.map((t, k) => (
            <li key={t} className="flex items-center gap-1">
              {k > 0 && <span className="text-rule-strong" aria-hidden>/</span>}
              {t}
            </li>
          ))}
        </ul>
        {best > 0 && (
          <div className="rise mt-4 flex items-center gap-2 text-[0.875rem] text-ink-2" data-testid="game-best" style={{ "--i": 3 } as React.CSSProperties}>
            <Trophy className="size-4" /> {bestLabel} <span className="tnum hl font-semibold text-ink">{best}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onStart}
          data-testid="game-start"
          className="press mt-8 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[1.0625rem] font-semibold text-paper-3 hover:bg-ink-2"
        >
          {startLabel}
        </button>
      </div>
    </div>
  );
}

/** 二级全屏页的顶栏：左边退出，中间页名 */
export function TopBar({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex h-14 shrink-0 items-center">
      {children}
      <div className="min-w-0 flex-1 truncate text-center text-[0.9375rem] font-medium">{title}</div>
      {right ?? <span className="w-9" aria-hidden />}
    </div>
  );
}

export function GameResult({
  title,
  score,
  unit,
  record,
  best,
  stats,
  missed,
  index,
  onAgain,
  note,
}: {
  title: string;
  score: number;
  unit: string;
  record: boolean;
  best: number;
  stats: { label: string; value: string; testid?: string }[];
  missed: string[];
  index: WordIndex;
  onAgain: () => void;
  note?: string;
}) {
  const st = useApp();
  const notStarred = missed.filter((w) => !st.star[w]);
  return (
    <div className="flex-1 overflow-y-auto pb-8" data-testid="game-result">
      <TopBar title={title}>
        <Link to="/" aria-label="关闭" className="press -ml-2 grid size-11 place-items-center rounded-lg text-ink-2 hover:bg-paper-2 hover:text-ink">
          <X className="size-[22px]" />
        </Link>
      </TopBar>
      <div className="flex flex-col items-start pt-6">
        <div className="text-[0.8125rem] text-ink-3">得分</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className={cn("tnum font-serif text-[5.5rem] leading-[0.85]", record && "hl-swipe")} data-testid="game-score">
            {score}
          </span>
          <span className="text-base text-ink-3">{unit}</span>
        </div>
        <div className="mt-3 text-[0.9375rem] font-medium" data-testid="game-record" data-record={record ? 1 : 0}>
          {record ? (
            <span className="flex items-center gap-1.5 text-ink">
              <Sparkles className="size-4" /> 新纪录
            </span>
          ) : (
            <span className="tnum text-ink-3">最高 {best}</span>
          )}
        </div>
        {note && <div className="mt-1 text-[0.8125rem] text-ink-3">{note}</div>}
      </div>
      <div className="mt-7 grid grid-cols-3 divide-x divide-rule border-y border-rule py-4">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0 px-3 first:pl-0" data-testid={s.testid}>
            <div className="tnum truncate font-serif text-[1.75rem] leading-none">{s.value}</div>
            <div className="mt-1.5 text-[0.75rem] text-ink-3">{s.label}</div>
          </div>
        ))}
      </div>
      {missed.length > 0 && (
        <div className="mt-7" data-testid="game-missed">
          <div className="flex items-center justify-between gap-3 pb-2">
            <span className="text-[0.9375rem] font-semibold">出错的词 <span className="tnum font-normal text-ink-3">{missed.length}</span></span>
            <button
              type="button"
              data-testid="game-star-all"
              disabled={!notStarred.length}
              onClick={() => {
                starWords(notStarred);
                toast.success(`已加入生词本 ${notStarred.length} 个`);
              }}
              className="press flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium ring-1 ring-rule-strong ring-inset hover:bg-paper-2 disabled:opacity-50"
            >
              <Star className="size-3.5" /> {notStarred.length ? "全部加入生词本" : "已在生词本"}
            </button>
          </div>
          <div className="divide-y divide-rule border-y border-rule">
            {missed.map((w) => {
              const word = index.map.get(w);
              return (
                <div key={w} className="flex items-center gap-3 py-2.5">
                  <span className="h-4 w-[3px] shrink-0 rounded-[1px] bg-forget" aria-hidden />
                  <span className="word-head w-32 shrink-0 truncate text-[1.25rem] leading-tight">{w}</span>
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink-3">{word ? shortMeaning(word, 1) : ""}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-8 flex gap-2">
        <button type="button" onClick={onAgain} data-testid="game-again" className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-paper-2 font-medium hover:bg-rule">
          <RotateCcw className="size-4" /> 再来一局
        </button>
        <Link to="/" data-testid="game-home" className="press flex h-12 flex-1 items-center justify-center rounded-lg bg-ink font-semibold text-paper-3 hover:bg-ink-2">
          回到今日
        </Link>
      </div>
      <p className="mt-4 text-[0.75rem] text-ink-3">小游戏只练不排期，不影响复习计划</p>
    </div>
  );
}
