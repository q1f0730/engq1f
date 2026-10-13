import { useEffect, useRef, useState } from "react";
import { LIST_NAME_MAX } from "@/lib/lists";

/** 词单名输入框 + 确认按钮（回车也行） */
export function NameField({ initial = "", placeholder, action, onSubmit, testid }: { initial?: string; placeholder: string; action: string; onSubmit: (name: string) => void; testid: string }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setV(initial), [initial]);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
        setV("");
      }}
    >
      <input
        ref={ref}
        value={v}
        maxLength={LIST_NAME_MAX}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        data-testid={`${testid}-name`}
        enterKeyHint="done"
        className="h-11 min-w-0 flex-1 rounded-2xl border border-border/80 bg-background px-4 text-[15px] outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-4 focus:ring-primary/10"
      />
      <button type="submit" data-testid={`${testid}-ok`} className="h-11 shrink-0 rounded-2xl bg-primary px-4 text-[14px] font-bold text-primary-foreground">
        {action}
      </button>
    </form>
  );
}
