import { useEffect } from "react";
import { Toaster as Sonner, toast as realToast, type ToasterProps } from "sonner";
import { toasterReady } from "@/lib/toast";

// 11.3 · sonner 整个按需加载：这个文件只在第一次 toast 时才被下载（见 lib/toast.ts）
function Ready() {
  useEffect(() => {
    toasterReady(realToast as never);
  }, []);
  return null;
}

const Inner = (props: ToasterProps) => (
  <>
    <Sonner
      className="toaster group"
      style={
        {
          // 用应用自己的不透明卡片色，避免与页面底色混在一起
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--card-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
    <Ready />
  </>
);

export default Inner;
