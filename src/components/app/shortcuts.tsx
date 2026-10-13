import { BottomSheet } from "./sheet";

const ROWS: [string, string][] = [
  ["1 / 2 / 3", "认识 / 模糊 / 不认识"],
  ["空格", "翻面 / 下一个"],
  ["1 – 4", "选择题选项"],
  ["R", "重新播放发音"],
  ["Z", "撤销上一步"],
  ["S", "加入 / 移出生词本"],
  ["D", "斩（已掌握，不再出现）"],
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
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="键盘快捷键" testid="shortcuts">
      <div className="divide-y divide-border/70">
        {ROWS.map(([k, v]) => (
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
        手机上：卡片向右滑 = 认识，向左滑 = 不认识，向上滑 = 模糊。
      </p>
    </BottomSheet>
  );
}
