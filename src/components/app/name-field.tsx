import { useEffect, useId, useRef, useState } from "react";
import { LIST_NAME_MAX } from "@/lib/lists";

/**
 * 12.0 · 词单名：像在索引卡的标题栏上写字。
 * 一条墨色下划线是输入框，右下角一个小计数（还能写几个字），确认键贴在线的右端；回车也行。
 */
export function NameField({ initial = "", placeholder, action, onSubmit, testid }: { initial?: string; placeholder: string; action: string; onSubmit: (name: string) => void; testid: string }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => setV(initial), [initial]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(v);
    setV("");
  };
  return (
    <form onSubmit={submit} className="min-w-0">
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <div className="flex items-stretch border-b-[1.5px] border-ink focus-within:border-b-2">
        <input
          id={id}
          ref={ref}
          value={v}
          maxLength={LIST_NAME_MAX}
          onChange={(e) => setV(e.target.value)}
          placeholder={placeholder}
          data-testid={`${testid}-name`}
          enterKeyHint="done"
          className="h-12 min-w-0 flex-1 bg-transparent text-[1rem] outline-none placeholder:text-[0.875rem] placeholder:text-ink-3"
        />
        <button type="submit" data-testid={`${testid}-ok`} className="press my-1.5 shrink-0 rounded-lg bg-ink px-3.5 text-[0.875rem] font-semibold text-paper-3 hover:bg-ink-2">
          {action}
        </button>
      </div>
      <p aria-hidden className="tnum mt-1 text-right text-[0.6875rem] text-ink-3">
        {v.length} / {LIST_NAME_MAX}
      </p>
    </form>
  );
}
