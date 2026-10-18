import { useEffect, useId, useRef, useState } from "react";
import { LIST_NAME_MAX } from "@/lib/lists";

/**
 * 12.0 · 词单名：像在索引卡的标题栏上写字。
 * 一条墨色下划线是输入框，右下角一个小计数（还能写几个字），确认键贴在线的右端；回车也行。
 */
export function NameField({
  initial = "",
  placeholder,
  action,
  onSubmit,
  testid,
  autoFocus = true,
}: {
  initial?: string;
  placeholder: string;
  action: string;
  onSubmit: (name: string) => void;
  testid: string;
  autoFocus?: boolean;
}) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();
  const countId = `${id}-count`;

  useEffect(() => setV(initial), [initial]);

  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => ref.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  const isValid = v.trim().length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = v.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
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
          aria-describedby={countId}
          data-testid={`${testid}-name`}
          enterKeyHint="done"
          className="h-12 min-w-0 flex-1 bg-transparent text-[1rem] outline-none placeholder:text-[0.875rem] placeholder:text-ink-3"
        />
        <button
          type="submit"
          disabled={!isValid}
          data-testid={`${testid}-ok`}
          className="press my-1.5 shrink-0 rounded-lg bg-ink px-3.5 text-[0.875rem] font-semibold text-paper-3 hover:bg-ink-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {action}
        </button>
      </div>
      <p id={countId} className="tnum mt-1 text-right text-[0.6875rem] text-ink-3">
        <span className="sr-only">已输入 {v.length} 字，上限 </span>
        {v.length} / {LIST_NAME_MAX}
      </p>
    </form>
  );
}
