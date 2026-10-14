import type { ReactNode } from "react";
import { BottomSheet } from "./sheet";
import { useApp } from "@/lib/store";

/**
 * 12.0 · 快捷键：按「在哪儿用」分三组，像词典附录里的检字表。
 * 每组一个小标题 + 细线，组内左边键帽、右边作用。
 */
type Row = { keys: string[]; does: string };
type Group = { name: string; rows: Row[] };

const k = (s: string) => s.split(" / ");

function groups(fourKey: boolean): Group[] {
  const rate: Row[] = [{ keys: k("1 / 2 / 3"), does: "认识 / 模糊 / 不认识" }];
  if (fourKey) rate.push({ keys: ["4"], does: "简单（四键模式）" });
  return [
    {
      name: "评分",
      rows: [...rate, { keys: ["空格"], does: "翻面 / 下一个" }, { keys: k("1 – 4"), does: "选择题选项" }],
    },
    {
      name: "这张卡",
      rows: [
        { keys: ["R"], does: "重新播放发音" },
        { keys: ["Z"], does: "撤销上一步" },
        { keys: ["S"], does: "加入 / 移出生词本" },
        { keys: ["D"], does: "斩（已掌握，不再出现）" },
        { keys: ["B"], does: "明天再说（不计对错）" },
      ],
    },
    {
      name: "整个画面",
      rows: [
        { keys: ["F"], does: "专注模式（全屏）" },
        { keys: k("← / →"), does: "速刷：不认识 / 认识；磁带：上一个 / 下一个" },
        { keys: ["Esc"], does: "退出学习" },
        { keys: ["?"], does: "打开这个帮助" },
      ],
    },
  ];
}

/** 12.0 · 键帽：纸色、细线框、底边加粗一像素，像真的键 */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-[4px] bg-paper-3 px-1.5 font-mono text-[0.6875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--rule-strong),inset_0_-2px_0_var(--rule-strong)]">
      {children}
    </kbd>
  );
}

function KeyGroup({ g }: { g: Group }) {
  return (
    <section className="min-w-0">
      <h3 className="flex items-center gap-3 text-[0.8125rem] font-medium text-ink-3">
        {g.name}
        <span aria-hidden className="h-px flex-1 bg-rule" />
      </h3>
      <dl className="mt-1">
        {g.rows.map((r) => (
          <div key={r.keys.join()} className="grid min-h-11 grid-cols-[7.5rem_1fr] items-center gap-3 py-1.5">
            <dt className="flex flex-wrap gap-1">
              {r.keys.map((x) => (
                <Kbd key={x}>{x}</Kbd>
              ))}
            </dt>
            <dd className="text-[0.875rem] leading-snug text-ink-2">{r.does}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ShortcutsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const st = useApp().settings;
  const swap = !!st.swapSwipe;
  const right = swap ? "不认识" : "认识";
  const left = swap ? "认识" : "不认识";
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="键盘快捷键" testid="shortcuts">
      <div className="space-y-5">
        {groups(!!st.fourKey).map((g) => (
          <KeyGroup key={g.name} g={g} />
        ))}
      </div>
      <aside className="mt-5 rounded-lg bg-paper-2 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-ink-2">
        <b className="font-semibold text-ink">手机上</b>：卡片向右滑 = {right}，向左滑 = {left}，向上滑 = 模糊；速刷只有左右滑。磁带模式里空格 = 播放 / 暂停。
      </aside>
    </BottomSheet>
  );
}
