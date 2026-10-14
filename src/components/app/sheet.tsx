import * as D from "@radix-ui/react-dialog";
import { X } from "@/components/app/icons";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useBackClose } from "@/lib/back-stack";

/** 遮罩：暖墨色半透明，淡入 */
const SCRIM =
  "fixed inset-0 z-50 bg-[oklch(0.18_0.01_95/0.5)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out-0";
/** 纸面本身：双层边框、最高 88% 屏高、内部自己滚动 */
const PANEL = "float-shell fixed z-50 flex max-h-[88dvh] w-full flex-col overflow-hidden text-ink outline-none";
/** 手机：贴底，上沿 20px 圆角，弹簧滑入 */
const PHONE =
  "inset-x-0 bottom-0 rounded-t-4xl pb-safe data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-16 data-[state=open]:duration-500 data-[state=open]:ease-[var(--ease-spring)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-10 data-[state=closed]:duration-200";
/** 平板 / 桌面：居中的一张卡，轻微放大进场 */
const DESK =
  "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[84dvh] md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-4xl md:pb-0 md:data-[state=open]:zoom-in-[0.97] md:data-[state=open]:slide-in-from-bottom-0";

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
        <D.Overlay className={SCRIM} />
        <D.Content aria-describedby={undefined} data-testid={testid} className={cn(PANEL, PHONE, DESK, className)}>
          <Grabber />
          <SheetHead title={title} hidden={hideTitle} />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-1">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** 手机上顶部那一小截把手：提示「可以往下拖」，桌面居中弹窗不需要 */
function Grabber() {
  return (
    <div className="flex shrink-0 justify-center pt-2 md:hidden" aria-hidden>
      <span className="h-1 w-9 rounded-full bg-rule-strong" />
    </div>
  );
}

/** 浮层标题行：左对齐的标题压在一条细线上，右边一个安静的关闭方块 */
function SheetHead({ title, hidden }: { title: ReactNode; hidden?: boolean }) {
  return (
    <header className={cn("mx-5 mb-3 flex shrink-0 items-center gap-3 border-b border-rule pb-2.5 pt-3", hidden && "sr-only")}>
      <D.Title className="min-w-0 flex-1 text-[1.125rem] font-semibold leading-snug tracking-[-0.01em]">{title}</D.Title>
      <D.Close className="press -mr-2.5 grid size-11 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-paper-2 hover:text-ink" aria-label="关闭">
        <X className="size-[18px]" />
      </D.Close>
    </header>
  );
}
