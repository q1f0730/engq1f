import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * 12.0 · 按钮：墨色实底（主）/ 下沉纸色（次）/ 细线框 / 纯文字。
 * 8px 圆角，按下弹簧回弹（.press），焦点是墨色描边。
 */
const buttonVariants = cva(
  "press inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[0.9375rem] font-medium tracking-[-0.005em] select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-[1.125em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper-3 hover:bg-ink-2",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
        outline: "border border-rule-strong bg-transparent text-ink hover:bg-paper-2",
        secondary: "bg-paper-2 text-ink hover:bg-rule",
        ghost: "text-ink-2 hover:bg-paper-2 hover:text-ink",
        link: "h-auto px-0 text-ink underline decoration-rule-strong decoration-1 underline-offset-[5px] hover:decoration-ink",
        mark: "bg-mark text-mark-ink hover:brightness-95",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3.5 text-[0.8125rem]",
        lg: "h-12 px-6 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
