import { cn } from "@/lib/utils";

/** 12.0 · 骨架：下沉纸色块，呼吸很慢 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-lg bg-paper-2 [animation-duration:1.8s]", className)} {...props} />;
}

export { Skeleton };
