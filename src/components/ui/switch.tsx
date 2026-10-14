import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

/**
 * 12.0 · 开关：一颗原生 button[role=switch]，不再套 Radix。
 * 轨道是方一点的 6px 圆角；关着是细线框里一块纸色滑块，开着轨道变墨色、滑块变成一小截荧光笔。
 * 对外接口和原来一样（checked / onCheckedChange / data-state / aria-checked），调用方不用改。
 */
type Props = Omit<ComponentPropsWithoutRef<"button">, "onChange" | "value"> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (v: boolean) => void;
};

const Switch = forwardRef<HTMLButtonElement, Props>(({ checked = false, onCheckedChange, className, disabled, onClick, defaultChecked: _d, ...rest }, ref) => {
  const state = checked ? "checked" : "unchecked";
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={state}
      disabled={disabled}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) onCheckedChange?.(!checked);
      }}
      className={cn(
        "group/sw relative inline-flex h-6 w-10 shrink-0 items-center rounded-md p-[3px] transition-colors duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-ink" : "bg-paper-2 ring-1 ring-inset ring-rule-strong",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden
        data-state={state}
        className={cn(
          "pointer-events-none block h-[18px] w-[15px] rounded-[4px] transition-transform duration-300 ease-[var(--ease-spring)]",
          checked ? "translate-x-[19px] bg-mark" : "translate-x-0 bg-paper-3 shadow-[0_0_0_1px_var(--rule-strong)]",
        )}
      />
    </button>
  );
});
Switch.displayName = "Switch";

export { Switch };
