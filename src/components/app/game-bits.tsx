import { Link } from "@tanstack/react-router";
import { RotateCcw, Sparkles, Star, Trophy, X } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { shortMeaning, type WordIndex } from "@/lib/data";
import { starWords, useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/** v9 · 小游戏共用：开始页、结果页 */
export function GameIntro({
  testid,
  icon,
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
  icon: ReactNode;
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
      <div className="flex h-14 shrink-0 items-center">
        <button type="button" onClick={onQuit} aria-label="退出" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
          <X className="size-5" />
        </button>
        <div className="flex-1 text-center text-[15px] font-bold">{title}</div>
        <span className="w-10" />
      </div>
      <div className="card-in flex flex-1 flex-col justify-center pb-6 text-center">
        <div className="mx-auto grid size-20 place-items-center rounded-[28px] bg-brand-soft text-primary">{icon}</div>
        <h1 className="mt-6 font-display text-[30px] font-extrabold tracking-tight">{big}</h1>
        <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground">{desc}</p>
        <div className="mx-auto mt-5 flex max-w-sm flex-wrap justify-center gap-1.5">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-secondary px-2.5 py-1 text-[12px] font-semibold text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
        {best > 0 && (
          <div className="mx-auto mt-6 flex items-center gap-2 rounded-full bg-vague-soft px-4 py-2 text-[14px] font-bold text-vague" data-testid="game-best">
            <Trophy className="size-4" /> {bestLabel} {best}
          </div>
        )}
        <button
          type="button"
          onClick={onStart}
          data-testid="game-start"
          className="mx-auto mt-8 flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-primary text-[17px] font-bold text-primary-foreground shadow-xl shadow-primary/25 transition active:scale-[0.98]"
        >
          {startLabel}
        </button>
      </div>
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
      <div className="flex h-14 shrink-0 items-center">
        <Link to="/" aria-label="关闭" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
          <X className="size-5" />
        </Link>
        <div className="flex-1 text-center text-[15px] font-bold">{title}</div>
        <span className="w-10" />
      </div>
      <div className="pop flex flex-col items-center pt-2 text-center">
        <div className={cn("grid size-20 place-items-center rounded-[28px] shadow-xl", record ? "bg-vague text-white shadow-vague/30" : "bg-primary text-primary-foreground shadow-primary/30")}>
          <Trophy className="size-10" />
        </div>
        <div className="mt-4 flex items-baseline gap-1">
          <span className="tnum font-display text-[56px] font-extrabold leading-none tracking-tight" data-testid="game-score">
            {score}
          </span>
          <span className="text-[16px] font-bold text-muted-foreground">{unit}</span>
        </div>
        <div className="mt-2 text-[14px] font-semibold" data-testid="game-record" data-record={record ? 1 : 0}>
          {record ? (
            <span className="flex items-center gap-1 text-vague">
              <Sparkles className="size-4" /> 新纪录！
            </span>
          ) : (
            <span className="text-muted-foreground">最高 {best}</span>
          )}
        </div>
        {note && <div className="mt-1 text-[12px] text-muted-foreground">{note}</div>}
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2.5 text-center">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-secondary/80 px-2 py-3" data-testid={s.testid}>
            <div className="tnum text-[20px] font-extrabold">{s.value}</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
      {missed.length > 0 && (
        <div className="mt-5 rounded-3xl border border-border/70 bg-card p-2" data-testid="game-missed">
          <div className="flex items-center justify-between px-3 pb-1 pt-2">
            <span className="text-[13px] font-bold">出错的词 {missed.length}</span>
            <button
              type="button"
              data-testid="game-star-all"
              disabled={!notStarred.length}
              onClick={() => {
                starWords(notStarred);
                toast.success(`已加入生词本 ${notStarred.length} 个`);
              }}
              className="flex items-center gap-1 rounded-full bg-vague-soft px-3 py-1.5 text-[12px] font-bold text-vague disabled:opacity-50"
            >
              <Star className="size-3.5" /> {notStarred.length ? "全部加入生词本" : "已在生词本"}
            </button>
          </div>
          {missed.map((w) => {
            const word = index.map.get(w);
            return (
              <div key={w} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                <span className="size-2.5 shrink-0 rounded-full bg-forget" />
                <span className="font-display w-28 shrink-0 truncate text-[16px] font-bold">{w}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{word ? shortMeaning(word, 1) : ""}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-6 flex gap-2.5">
        <button type="button" onClick={onAgain} data-testid="game-again" className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-secondary py-3.5 font-semibold">
          <RotateCcw className="size-4" /> 再来一局
        </button>
        <Link to="/" data-testid="game-home" className="flex flex-1 items-center justify-center rounded-2xl bg-primary py-3.5 font-semibold text-primary-foreground">
          回到今日
        </Link>
      </div>
      <p className="mt-4 text-center text-[12px] text-muted-foreground">小游戏只练不排期，不影响复习计划</p>
    </div>
  );
}
