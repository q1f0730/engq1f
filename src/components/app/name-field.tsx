import { useEffect, useRef, useState } from "react";
import { LIST_NAME_MAX } from "@/lib/lists";

/** 词单名输入框 + 确认按钮（回车也行） */
export function NameField({ initial = "", placeholder, action, onSubmit, testid }: { initial?: string; placeholder: string; action: string; onSubmit: (name: string) => void; testid: string }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setV(initial), [initial]);
  return (
    <form
      className="flex items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
        setV("");
      }}
    >
      {/* 12.0 · 输入框是一条墨色下划线，确认键在右边 */}
      <input
        ref={ref}
        value={v}
        maxLength={LIST_NAME_MAX}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        data-testid={`${testid}-name`}
        enterKeyHint="done"
        className="h-11 min-w-0 flex-1 border-b-[1.5px] border-ink bg-transparent text-[1rem] outline-none transition-colors placeholder:text-[0.875rem] placeholder:text-ink-3 focus:border-b-2"
      />
      <button type="submit" data-testid={`${testid}-ok`} className="press h-11 shrink-0 rounded-lg bg-ink px-4 text-[0.875rem] font-semibold text-paper-3 hover:bg-ink-2">
        {action}
      </button>
    </form>
  );
}
