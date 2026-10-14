import * as D from "@radix-ui/react-dialog";
import { X } from "@/components/app/icons";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useBackClose } from "@/lib/back-stack";

/**
 * 12.0 · 浮层：手机从底部弹出（弹簧），桌面居中。
 * 纸色 + 双层边框（float-shell），上沿 20px 圆角；标题左对齐、正文字号，关闭键是一个安静的方块。
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
  testid,
  hideTitle,
  noHistory,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
  testid?: string;
  hideTitle?: boolean;
  /** 不接管返回键（拦截离开页面的确认框用：那时 history 正在回滚） */
  noHistory?: boolean;
}) {
  // 打开时压一条 history：Android 返回手势只关这个弹层，不退出应用
  useBackClose(open, () => onOpenChange(false), !noHistory);
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[oklch(0.18_0.01_95/0.5)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <D.Content
          aria-describedby={undefined}
          data-testid={testid}
          className={cn(
            "float-shell fixed z-50 flex max-h-[88dvh] w-full flex-col overflow-hidden text-ink outline-none",
            "inset-x-0 bottom-0 rounded-t-4xl pb-safe data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-16 data-[state=open]:duration-500 data-[state=open]:ease-[var(--ease-spring)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-10 data-[state=closed]:duration-200",
            "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[84dvh] md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-4xl md:pb-0 md:data-[state=open]:zoom-in-[0.97] md:data-[state=open]:slide-in-from-bottom-0",
            className,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-rule-strong md:hidden" aria-hidden />
          <div className={cn("flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3.5", hideTitle && "sr-only")}>
            <D.Title className="min-w-0 pt-1.5 text-[1.125rem] font-semibold leading-snug tracking-[-0.01em]">{title}</D.Title>
            <D.Close className="press -mr-2 grid size-10 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-paper-2 hover:text-ink" aria-label="关闭">
              <X className="size-[18px]" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
