import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SubHead } from "@/components/app/kit";
import { ShortcutsSheet } from "@/components/app/shortcuts";
import { AdvancedBody } from "@/components/app/settings-panels";

/**
 * 11.2 · 「高级」二级页：不常用的设置；算法开关在三级页「算法实验室」。
 * 12.0 · 页头换成二级页头（‹ 我的），内容是一列可展开的目录条目。
 */
export const Route = createFileRoute("/advanced")({ component: Advanced });

function Advanced() {
  const [help, setHelp] = useState(false);
  return (
    <div data-testid="advanced-page">
      <SubHead back={{ to: "/me", label: "我的", testid: "advanced-back" }} title="高级" sub="不常用的设置，默认值就是推荐值" />
      <AdvancedBody onHelp={() => setHelp(true)} />
      <ShortcutsSheet open={help} onOpenChange={setHelp} />
    </div>
  );
}
