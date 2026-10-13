import { createFileRoute } from "@tanstack/react-router";
import { Spinner } from "@/components/app/shell";
import { Study, type StudyMode } from "@/components/app/study";
import { useWords } from "@/lib/data";
import { getState } from "@/lib/store";

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
  if (error) return <div className="p-8 text-center text-sm text-muted-foreground">{error}</div>;
  if (!index) return <Spinner />;
  if (mode === "list") {
    // 词单学习：按 id 取当前词单（被删了就是空词单）
    const l = (getState().lists ?? []).find((x) => x.id === list);
    return <Study key={`list-${list}-${t ?? 0}`} index={index} mode="list" words={l?.words ?? []} listId={l?.id} listName={l?.name} />;
  }
  return <Study key={`${mode}-${t ?? 0}`} index={index} mode={mode} words={words ? words.split(",").filter(Boolean) : []} />;
}
