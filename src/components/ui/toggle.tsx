import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** 12.0 · 切换按钮：按下状态是墨色底纸色字（和分段控件一致） */
const toggleVariants = cva(
  "press inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg text-[0.875rem] font-medium text-ink-2 hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=on]:bg-ink data-[state=on]:text-paper-3 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-rule-strong bg-transparent",
      },
      size: {
        default: "h-10 min-w-10 px-2.5",
        sm: "h-9 min-w-9 px-2",
        lg: "h-11 min-w-11 px-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>
>(({ className, variant, size, ...props }, ref) => <TogglePrimitive.Root ref={ref} className={cn(toggleVariants({ variant, size, className }))} {...props} />);
Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle, toggleVariants };
