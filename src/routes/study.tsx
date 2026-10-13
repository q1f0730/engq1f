import { createFileRoute } from "@tanstack/react-router";
import { Spinner } from "@/components/app/shell";
import { Study, type StudyMode } from "@/components/app/study";
import { useWords } from "@/lib/data";

const MODES: StudyMode[] = ["new", "review", "star", "wrong", "mastered"];

export const Route = createFileRoute("/study")({
  validateSearch: (s: Record<string, unknown>): { mode: StudyMode; t?: number } => ({
    mode: MODES.includes(s.mode as StudyMode) ? (s.mode as StudyMode) : "new",
    t: typeof s.t === "number" ? s.t : undefined,
  }),
  component: StudyPage,
});

function StudyPage() {
  const { mode, t } = Route.useSearch();
  const { index, error } = useWords();
  if (error) return <div className="p-8 text-center text-sm text-muted-foreground">{error}</div>;
  if (!index) return <Spinner />;
  return <Study key={`${mode}-${t ?? 0}`} index={index} mode={mode} />;
}
