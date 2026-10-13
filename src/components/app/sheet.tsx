import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 手机：底部弹出；桌面：居中卡片 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
  testid,
  hideTitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
  testid?: string;
  hideTitle?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <D.Content
          aria-describedby={undefined}
          data-testid={testid}
          className={cn(
            "fixed z-50 flex max-h-[88dvh] w-full flex-col overflow-hidden border border-border/70 bg-card text-card-foreground shadow-2xl outline-none",
            "inset-x-0 bottom-0 rounded-t-[28px] pb-safe data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-10 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-10",
            "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[84dvh] md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px] md:pb-0 md:data-[state=open]:zoom-in-95 md:data-[state=open]:slide-in-from-bottom-0",
            className,
          )}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted md:hidden" />
          <div className={cn("flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-3", hideTitle && "sr-only")}>
            <D.Title className="text-[17px] font-bold tracking-tight">{title}</D.Title>
            <D.Close className="grid size-8 place-items-center rounded-full bg-secondary text-muted-foreground hover:text-foreground" aria-label="关闭">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
