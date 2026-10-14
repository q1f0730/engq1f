import { createFileRoute } from "@tanstack/react-router";
import { SubHead } from "@/components/app/kit";
import { AlgoPanel } from "@/components/app/settings-panels";

/**
 * 11.2 · 算法实验室（三级页）：记忆保持目标和几个实验开关。
 * 12.0 · 三级页头 + 一段「先读这个」的边注，开关在下面一列排开。
 */
export const Route = createFileRoute("/lab")({ component: Lab });

function Lab() {
  return (
    <div data-testid="lab-page">
      <SubHead back={{ to: "/advanced", label: "高级", testid: "lab-back" }} title="算法实验室" sub="不懂可以不碰：默认设置就是大多数人最合适的" />
      <p className="mb-8 border-l-2 border-mark pl-3 text-[0.8125rem] leading-relaxed text-ink-2">
        这里的开关只改「下次什么时候再见到这个词」，不会删掉任何记录；关掉就回到默认。
      </p>
      <AlgoPanel />
    </div>
  );
}
