import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { X } from "@/components/app/icons";
import { cn } from "@/lib/utils";

/**
 * 12.0 · 版式零件（「荧光笔」）
 *
 * 页面是一张纸：分区靠细线和留白，不靠卡片。这里是各页共用的几种「排版单位」：
 * - Note：边注。像词典里的「用法说明」——上面一条墨线，左上一个小色块标出语气，标题 + 一段话 + 一排动作。
 * - Entry：目录里的一条。整行可点，行间细线，右边一个文字 `›`。
 * - Figure：一个数字。衬线大号 + 单位 + 一行说明，统计和首页共用。
 * - Act：边注 / 分区里的动作按钮（主 = 墨底，次 = 细线框，文字 = 下划线）。
 * - Field：设置里的一项：左边名字和说明，右边控件；或者控件换行放在下面。
 */

type Tone = "mark" | "know" | "vague" | "forget" | "ink";

const TONE_DOT: Record<Tone, string> = {
  mark: "bg-mark",
  know: "bg-know",
  vague: "bg-vague",
  forget: "bg-forget",
  ink: "bg-ink",
};

type DataAttrs = { [k: `data-${string}`]: string | number | undefined };

export function Note({
  tone = "mark",
  kicker,
  title,
  children,
  actions,
  onClose,
  closeLabel = "不用了",
  closeTestid,
  lead,
  testid,
  className,
  strong,
  ...data
}: {
  tone?: Tone;
  /** 左上角的小字：「提醒」「建议」「计划」 */
  kicker?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  closeTestid?: string;
  /** 替换左上角色块的东西（例如计划里的「返回上一步」） */
  lead?: ReactNode;
  testid?: string;
  className?: string;
  /** 重要的边注：上沿是墨色粗线 */
  strong?: boolean;
} & DataAttrs) {
  return (
    <section data-testid={testid} {...data} className={cn("relative min-w-0 pt-3.5", strong ? "border-t-2 border-ink" : "border-t border-ink", className)}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {lead ?? (
            <div className="mb-1.5 flex items-center gap-2 text-[0.75rem] font-medium text-ink-3">
              <span className={cn("size-2 shrink-0 rounded-[2px]", TONE_DOT[tone])} aria-hidden />
              {kicker ?? "提醒"}
            </div>
          )}
          <h3 className="text-[1rem] font-semibold leading-snug tracking-[-0.01em]">{title}</h3>
          {children && <div className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-2">{children}</div>}
        </div>
        {onClose && (
          <button
            type="button"
            aria-label={closeLabel}
            data-testid={closeTestid}
            onClick={onClose}
            className="press -mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-paper-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {actions && <div className="mt-3.5 flex flex-wrap items-center gap-2">{actions}</div>}
    </section>
  );
}

const ACT = {
  primary: "bg-ink text-paper-3 hover:bg-ink-2",
  secondary: "text-ink ring-1 ring-rule-strong ring-inset hover:bg-paper-2",
  mark: "bg-mark text-mark-ink hover:brightness-95",
  quiet: "px-1 text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink hover:decoration-ink",
} as const;

export const actClass = (kind: keyof typeof ACT = "primary", grow?: boolean) =>
  cn("press inline-flex h-10 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-[0.875rem] font-semibold", ACT[kind], grow && "flex-1");

export function Act({ kind = "primary", grow, className, ...rest }: ComponentProps<"button"> & { kind?: keyof typeof ACT; grow?: boolean }) {
  return <button type="button" className={cn(actClass(kind, grow), className)} {...rest} />;
}

/** 目录里的一条：标题 + 一行说明 + 右边的值或 `›` */
export function Entry({
  title,
  sub,
  right,
  className,
  arrow = true,
  ...rest
}: { title: ReactNode; sub?: ReactNode; right?: ReactNode; arrow?: boolean } & Omit<ComponentProps<typeof Link>, "title" | "children">) {
  return (
    <Link {...rest} className={cn("press group flex min-h-14 min-w-0 items-center gap-3 border-b border-rule py-3 hover:bg-paper-2/60", className as string)}>
      <EntryBody title={title} sub={sub} right={right} arrow={arrow} />
    </Link>
  );
}

export function EntryButton({ title, sub, right, className, arrow = true, ...rest }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; arrow?: boolean } & Omit<ComponentProps<"button">, "title">) {
  return (
    <button type="button" {...rest} className={cn("press group flex min-h-14 w-full min-w-0 items-center gap-3 border-b border-rule py-3 text-left hover:bg-paper-2/60", className)}>
      <EntryBody title={title} sub={sub} right={right} arrow={arrow} />
    </button>
  );
}

function EntryBody({ title, sub, right, arrow }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; arrow?: boolean }) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-medium leading-tight">{title}</span>
        {sub && <span className="mt-1 block truncate text-[0.8125rem] text-ink-3">{sub}</span>}
      </span>
      {right && <span className="shrink-0 text-[0.8125rem] text-ink-3">{right}</span>}
      {arrow && (
        <span aria-hidden className="shrink-0 font-serif text-[1.375rem] leading-none text-ink-3 transition-transform duration-300 ease-[var(--ease-spring)] group-hover:translate-x-0.5">
          ›
        </span>
      )}
    </>
  );
}

/** 一个数字：衬线大号，单位小一号，下面一行说明 */
export function Figure({
  value,
  unit,
  label,
  hint,
  size = "md",
  className,
  testid,
  valueTestid,
  ...data
}: {
  value: ReactNode;
  unit?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  testid?: string;
  valueTestid?: string;
} & DataAttrs) {
  return (
    <div className={cn("min-w-0", className)} data-testid={testid} {...data}>
      <div className="text-[0.8125rem] text-ink-3">{label}</div>
      <div className="mt-1 flex min-w-0 items-baseline gap-1">
        <span
          data-testid={valueTestid}
          className={cn("tnum whitespace-nowrap font-serif leading-none tracking-[-0.02em]", size === "lg" ? "text-[3rem]" : size === "sm" ? "text-[1.625rem]" : "text-[2.125rem]")}
        >
          {value}
        </span>
        {unit && <span className="whitespace-nowrap text-[0.8125rem] text-ink-3">{unit}</span>}
      </div>
      {hint && <div className="mt-1.5 text-[0.75rem] leading-snug text-ink-3">{hint}</div>}
    </div>
  );
}

/** 设置里的一项：名字和说明在左，控件在右（inline）或下面（block） */
export function Field({
  label,
  hint,
  children,
  block,
  className,
  testid,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  block?: boolean;
  className?: string;
  testid?: string;
  htmlFor?: string;
}) {
  const Label = htmlFor ? "label" : "div";
  return (
    <div className={cn("min-w-0 border-b border-rule py-4 last:border-b-0", className)} data-testid={testid}>
      <div className={cn(block ? "" : "flex items-center justify-between gap-4")}>
        <Label htmlFor={htmlFor} className="block min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium leading-tight">{label}</span>
          {hint && <span className="mt-1 block text-[0.8125rem] leading-snug text-ink-3">{hint}</span>}
        </Label>
        {!block && children}
      </div>
      {block && children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** 分区：正文字号的标题 + 一条细线延伸到右边，右侧可放一个小链接 */
export function Sec({ title, aside, children, className, testid, id }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; testid?: string; id?: string }) {
  return (
    <section className={cn("min-w-0", className)} data-testid={testid} id={id}>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="section-rule min-w-0 flex-1 text-[1.0625rem] font-semibold tracking-[-0.01em]">{title}</h2>
        {aside && <div className="shrink-0 text-[0.8125rem] text-ink-3">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** 方的小标签：2px 圆角。语义色只给评分相关 */
export function Tag({ tone, className, children, ...rest }: ComponentProps<"span"> & { tone?: "know" | "vague" | "forget" | "mark" }) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-[2px] px-1.5 text-[0.6875rem] font-medium leading-none",
        tone === "know" ? "bg-know-soft text-know" : tone === "vague" ? "bg-vague-soft text-vague" : tone === "forget" ? "bg-forget-soft text-forget" : tone === "mark" ? "bg-mark text-mark-ink" : "text-ink-2 ring-1 ring-rule-strong ring-inset",
        className,
      )}
    >
      {children}
    </span>
  );
}
