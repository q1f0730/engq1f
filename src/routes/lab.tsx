import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft } from "@/components/app/icons";
import { PageHeader } from "@/components/app/shell";
import { AlgoPanel } from "@/components/app/settings-panels";

/** 11.2 · 算法实验室（三级页）：记忆保持目标和几个实验开关 */
export const Route = createFileRoute("/lab")({ component: Lab });

function Lab() {
  return (
    <div data-testid="lab-page">
      <Link to="/advanced" className="-ml-1 mt-4 flex w-fit items-center gap-0.5 text-[0.8125rem] font-semibold text-ink-3 hover:text-ink" data-testid="lab-back">
        <ChevronLeft className="size-4" /> 高级
      </Link>
      <PageHeader title="算法实验室" sub="不懂可以不碰：默认设置就是大多数人最合适的" />
      <AlgoPanel />
    </div>
  );
}
