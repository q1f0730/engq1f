import * as React from "react";

import { cn } from "@/lib/utils";

/** 12.0 · 输入框：下沉纸色底、没有外框，聚焦时一条墨色底线 + 抬起一级 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-lg border-0 bg-paper-2 px-3.5 text-base text-ink shadow-[inset_0_-1px_0_var(--rule-strong)] transition-[background-color,box-shadow] duration-200 placeholder:text-ink-3 focus-visible:bg-paper-3 focus-visible:shadow-[inset_0_-2px_0_var(--ink)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
