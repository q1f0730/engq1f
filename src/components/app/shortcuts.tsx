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

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground shadow-[0_1px_0_var(--border)]">
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
      <div className="divide-y divide-border/70">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-muted-foreground">{v}</span>
            <span className="flex gap-1">
              {k.split(" / ").map((x) => (
                <Kbd key={x}>{x}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
        手机上：卡片向右滑 = {swap ? "不认识" : "认识"}，向左滑 = {swap ? "认识" : "不认识"}，向上滑 = 模糊；速刷只有左右滑。磁带模式里空格 = 播放 / 暂停。
      </p>
    </BottomSheet>
  );
}
