import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "@/lib/toast";
import { today } from "@/lib/clock";
import { Spinner } from "@/components/app/shell";
import { Study, type StudyMode } from "@/components/app/study";
import { useWords } from "@/lib/data";
import { endRecover, getState, useApp } from "@/lib/store";

const MODES: StudyMode[] = ["new", "review", "ahead", "practice", "star", "wrong", "mastered", "hard", "speed", "core", "list", "rank"];

export const Route = createFileRoute("/study")({
  validateSearch: (s: Record<string, unknown>): { mode: StudyMode; t?: number; words?: string; list?: string } => ({
    mode: MODES.includes(s.mode as StudyMode) ? (s.mode as StudyMode) : "new",
    t: typeof s.t === "number" ? s.t : undefined,
    words: typeof s.words === "string" ? s.words : undefined,
    list: typeof s.list === "string" ? s.list : undefined,
  }),
  component: StudyPage,
});

function StudyPage() {
  const { mode, t, words, list } = Route.useSearch();
  const { index, error } = useWords();
  if (error) return <div className="p-8 text-center text-sm text-ink-3">{error}</div>;
  if (!index) return <Spinner />;
  if (mode === "new") return <NewGate key={t ?? 0} index={index} t={t} />;
  if (mode === "list") {
    // 词单学习：按 id 取当前词单（被删了就是空词单）
    const l = (getState().lists ?? []).find((x) => x.id === list);
    return <Study key={`list-${list}-${t ?? 0}`} index={index} mode="list" words={l?.words ?? []} listId={l?.id} listName={l?.name} />;
  }
  return <Study key={`${mode}-${t ?? 0}`} index={index} mode={mode} words={words ? words.split(",").filter(Boolean) : []} />;
}

/** 11.2 · 恢复期新词暂停：从任何入口进「学新词」都先停在这里，不会偷偷开一组新词 */
function NewGate({ index, t }: { index: NonNullable<ReturnType<typeof useWords>["index"]>; t?: number }) {
  const st = useApp();
  const day = today();
  const [confirm, setConfirm] = useState(false);
  // 11.3 · 选了「边复习边学新词」的恢复期可以学新词
  const recovering = !!st.recover && day >= st.recover.from && day <= st.recover.until && !st.recover.mix;
  if (!recovering) return <Study key={`new-${t ?? 0}`} index={index} mode="new" />;
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center px-6" data-testid="new-paused">
      <div className="text-[0.75rem] tracking-[0.2em] text-ink-3">恢复期</div>
      <div className="mt-2 border-b-2 border-ink pb-3 text-[1.5rem] font-semibold tracking-[-0.02em]">
        <span className="hl">新词暂停</span>
      </div>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">这几天先把积压清掉，清完了新词自动恢复。</p>
      <Link to="/study" search={{ mode: "review" }} replace data-testid="new-paused-review" className="press mt-6 flex h-12 w-full items-center justify-center rounded-lg bg-ink font-semibold text-paper-3 hover:bg-ink-2">
        去复习
      </Link>
      {confirm ? (
        <div className="mt-4 border-l-2 border-vague py-1 pl-3 text-[0.8125rem]">
          <p className="text-ink-2">结束恢复计划？没清完的积压会按正常复习安排。</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirm(false)} className="press h-10 rounded-lg font-semibold ring-1 ring-rule-strong ring-inset hover:bg-paper-2">
              继续恢复
            </button>
            <button
              type="button"
              data-testid="new-paused-confirm"
              onClick={() => {
                endRecover();
                toast.success("恢复计划结束，新词恢复");
              }}
              className="press h-10 rounded-lg bg-ink font-semibold text-paper-3 hover:bg-ink-2"
            >
              结束，学新词
            </button>
          </div>
        </div>
      ) : (
        <button type="button" data-testid="new-paused-end" onClick={() => setConfirm(true)} className="press mt-2 h-11 text-[0.875rem] font-medium text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink">
          提前恢复新词
        </button>
      )}
      <Link to="/" replace className="mt-1 text-center text-[0.8125rem] text-ink-3 underline-offset-2 hover:underline">
        回首页
      </Link>
    </div>
  );
}
