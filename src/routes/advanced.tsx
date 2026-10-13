import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app/shell";
import { ShortcutsSheet } from "@/components/app/shortcuts";
import { AdvancedBody } from "@/components/app/settings-panels";

/** 11.2 · 「高级」二级页：不常用的设置；算法开关在三级页「算法实验室」 */
export const Route = createFileRoute("/advanced")({ component: Advanced });

function Advanced() {
  const [help, setHelp] = useState(false);
  return (
    <div data-testid="advanced-page">
      <Link to="/me" className="-ml-1 mt-4 flex w-fit items-center gap-0.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground" data-testid="advanced-back">
        <ChevronLeft className="size-4" /> 我的
      </Link>
      <PageHeader title="高级" sub="不常用的设置，默认值就是推荐值" />
      <AdvancedBody onHelp={() => setHelp(true)} />
      <ShortcutsSheet open={help} onOpenChange={setHelp} />
    </div>
  );
}
