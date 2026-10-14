import { useEffect } from "react";
import { Toaster as Sonner, toast as realToast, type ToasterProps } from "sonner";
import { toasterReady } from "@/lib/toast";

// sonner 整个按需加载：这个文件只在第一次 toast 时才被下载（见 lib/toast.ts）
function Ready() {
  useEffect(() => {
    toasterReady(realToast as never);
  }, []);
  return null;
}

/**
 * 12.0 · 提示条：墨色实底、纸色字，动作按钮是荧光笔色（样式在 styles.css 的 sonner 段，
 * 要盖过 sonner 运行时注入的样式，所以不在这里写类名）。
 */
const Inner = (props: ToasterProps) => (
  <>
    <Sonner
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--ink)",
          "--normal-text": "var(--paper-3)",
          "--normal-border": "transparent",
          "--border-radius": "10px",
          "--width": "min(360px, calc(100vw - 32px))",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "group toast font-sans text-[0.875rem] leading-snug",
          title: "font-medium",
          description: "text-[0.8125rem]",
          actionButton: "font-semibold",
          cancelButton: "opacity-80",
        },
      }}
      {...props}
    />
    <Ready />
  </>
);

export default Inner;
