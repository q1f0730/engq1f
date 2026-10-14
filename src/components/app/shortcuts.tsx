import { BottomSheet } from "./sheet";
import { useApp } from "@/lib/store";

const ROWS: [string, string][] = [
  ["1 / 2 / 3", "认识 / 模糊 / 不认识"],
  ["空格", "翻面 / 下一个"],
  ["1 – 4", "选择题选项"],
  ["R", "重新播放发音"],
  ["Z", "撤销上一步"],
  ["S", "加入 / 移出生词本"],
  ["D", "斩（已掌握，不再出现）"],
  ["B", "明天再说（不计对错）"],
  ["F", "专注模式（全屏）"],
  ["← / →", "速刷：不认识 / 认识；磁带：上一个 / 下一个"],
  ["Esc", "退出学习"],
  ["?", "打开这个帮助"],
];

/** 12.0 · 键帽：纸色、细线框、底边加粗一像素，像真的键 */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-[4px] bg-paper-3 px-1.5 font-mono text-[0.6875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--rule-strong),inset_0_-2px_0_var(--rule-strong)]">
      {children}
    </kbd>
  );
}

export function ShortcutsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const st = useApp().settings;
  const swap = !!st.swapSwipe;
  const rows: [string, string][] = st.fourKey ? [ROWS[0], ["4", "简单（四键模式）"], ...ROWS.slice(1)] : ROWS;
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="键盘快捷键" testid="shortcuts">
      {/* 一张两栏的对照表：左边键位，右边作用 */}
      <table className="w-full border-t border-ink text-[0.875rem]">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-rule">
              <td className="w-[38%] py-2.5 pr-3 align-middle">
                <span className="flex flex-wrap gap-1">
                  {k.split(" / ").map((x) => (
                    <Kbd key={x}>{x}</Kbd>
                  ))}
                </span>
              </td>
              <td className="py-2.5 text-ink-2">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 border-l-2 border-mark pl-3 text-[0.8125rem] leading-relaxed text-ink-2">
        手机上：卡片向右滑 = {swap ? "不认识" : "认识"}，向左滑 = {swap ? "认识" : "不认识"}，向上滑 = 模糊；速刷只有左右滑。磁带模式里空格 = 播放 / 暂停。
      </p>
    </BottomSheet>
  );
}
