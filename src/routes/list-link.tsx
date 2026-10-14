import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ListPlus, Link2Off, Link2 } from "@/components/app/icons";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { PageHeader, Spinner } from "@/components/app/shell";
import { actClass } from "@/components/app/kit";
import { cn } from "@/lib/utils";
import { useWords, shortMeaning } from "@/lib/data";
import { createList, useApp } from "@/lib/store";
import { decodeList, lowerLookup } from "@/lib/sync";

export const Route = createFileRoute("/list-link")({
  validateSearch: (s: Record<string, unknown>): { d?: string } => ({ d: typeof s.d === "string" ? s.d : undefined }),
  component: ListLinkPage,
});

/** v11 · 打开别人分享的词单链接：预览后导入为自己的词单 */
function ListLinkPage() {
  const { index } = useWords();
  const { d } = Route.useSearch();
  const st = useApp();
  const navigate = useNavigate();
  const [got, setGot] = useState<{ name: string; words: string[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!d) return setErr("链接无效或不完整");
    decodeList(d).then(setGot, (e: Error) => setErr(e.message));
  }, [d]);
  const words = useMemo(() => {
    if (!index || !got) return [];
    const resolve = lowerLookup(index.map.keys());
    return [...new Set(got.words.map((w) => resolve(w.toLowerCase())).filter((w): w is string => !!w))];
  }, [index, got]);
  if (err)
    return (
      <div data-testid="list-link-page" data-state="error">
        <PageHeader title="词单链接" />
        {/* 12.0 · 坏链接：不是「断链图标 + 一句话」的模板，而是一张作废的借书条 */}
        <section className="border-y-2 border-ink py-6">
          <div className="font-serif text-[3rem] italic leading-none text-rule-strong" aria-hidden>
            ⁄⁄
          </div>
          <p className="mt-4 text-[1.0625rem] font-semibold" data-testid="list-link-error">
            {err}
          </p>
          <p className="mt-1.5 max-w-[26em] text-[0.8125rem] leading-relaxed text-ink-2">请让对方重新复制完整的链接（聊天软件可能截断了太长的链接）。</p>
          <ol className="mt-5 space-y-1.5 border-t border-rule pt-3 text-[0.8125rem] text-ink-3">
            <li>1　对方在词单页点「分享链接」，再点「复制」</li>
            <li>2　整段发过来，别只发前半段</li>
          </ol>
        </section>
        <Link to="/" className={actClass("secondary") + " mt-6 h-11"}>
          回到今日
        </Link>
      </div>
    );
  if (!index || !got) return <Spinner label="解析链接…" />;
  const exists = (st.lists ?? []).some((l) => l.name === got.name);
  const learned = words.filter((w) => st.cards[w]).length;
  return (
    <div data-testid="list-link-page" data-state="ok" data-n={words.length}>
      <PageHeader title="收到一个词单" sub="来自分享链接 · 不含对方的学习进度" />
      <section className="border-t-2 border-ink pt-4">
        <h2 className="truncate text-[1.5rem] font-semibold leading-tight tracking-[-0.02em]" data-testid="list-link-name">
          {got.name || "未命名词单"}
        </h2>
        <div className="tnum mt-1 text-[0.8125rem] text-ink-3" data-testid="list-link-meta">
          {words.length} 个四级词{got.words.length > words.length ? `（${got.words.length - words.length} 个不在词库里，已跳过）` : ""} · 你学过其中 {learned} 个
        </div>
        {/* 词表：两栏，像书后的生词表；学过的词划荧光笔 */}
        <ol className="mt-4 max-h-[46dvh] overflow-y-auto border-y border-rule" data-testid="list-link-words">
          {words.slice(0, 200).map((w, k) => (
            <li key={w} className="grid grid-cols-[2rem_minmax(0,auto)_minmax(0,1fr)] items-baseline gap-x-3 border-b border-rule py-2 last:border-b-0">
              <span className="tnum font-serif text-[0.875rem] text-ink-3">{k + 1}</span>
              <span className={cn("word-head shrink-0 text-[1.1875rem] leading-tight", st.cards[w] && "hl")}>{w}</span>
              <span className="min-w-0 truncate text-[0.8125rem] text-ink-2">{shortMeaning(index.map.get(w)!, 1)}</span>
            </li>
          ))}
          {words.length > 200 && <li className="py-2 text-[0.75rem] text-ink-3">还有 {words.length - 200} 个…</li>}
        </ol>
        {exists && <p className="mt-3 border-l-2 border-vague pl-3 text-[0.75rem] text-ink-2">你已经有一个同名词单，导入后会另存为新词单。</p>}
        <button
          type="button"
          data-testid="list-link-import"
          disabled={!words.length}
          onClick={() => {
            const id = createList(exists ? `${got.name}（导入）` : got.name, words);
            if (!id) return toast.error("词单已经满 50 个了");
            toast.success(`已导入词单「${got.name || "未命名词单"}」`, { description: `${words.length} 个词` });
            if (!st.onboarded) navigate({ to: "/welcome", replace: true });
            else navigate({ to: "/words", search: { tab: "list", list: id }, replace: true });
          }}
          className={actClass("primary") + " mt-5 h-12 w-full text-[0.9375rem] disabled:opacity-45"}
        >
          <ListPlus className="size-4" /> 导入为我的词单
        </button>
      </section>
    </div>
  );
}
