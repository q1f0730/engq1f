import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ListPlus, Link2Off, Link2 } from "@/components/app/icons";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { PageHeader, Panel, Spinner } from "@/components/app/shell";
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
        <Panel className="flex flex-col items-center gap-3 py-10 text-center">
          <Link2Off className="size-10 text-ink-3" />
          <p className="text-[0.9375rem] font-semibold" data-testid="list-link-error">
            {err}
          </p>
          <p className="text-[0.8125rem] text-ink-3">请让对方重新复制完整的链接（聊天软件可能截断了太长的链接）。</p>
          <Link to="/" className="mt-2 rounded-lg bg-paper-2 px-5 py-2.5 text-sm font-semibold">
            回到今日
          </Link>
        </Panel>
      </div>
    );
  if (!index || !got) return <Spinner label="解析链接…" />;
  const exists = (st.lists ?? []).some((l) => l.name === got.name);
  const learned = words.filter((w) => st.cards[w]).length;
  return (
    <div data-testid="list-link-page" data-state="ok" data-n={words.length}>
      <PageHeader title="收到一个词单" sub="来自分享链接 · 不含对方的学习进度" />
      <Panel>
        <div className="flex items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-mark-soft text-ink">
            <Link2 className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold tracking-[-0.015em]" data-testid="list-link-name">
              {got.name || "未命名词单"}
            </h2>
            <div className="tnum text-[0.8125rem] text-ink-3" data-testid="list-link-meta">
              {words.length} 个四级词{got.words.length > words.length ? `（${got.words.length - words.length} 个不在词库里，已跳过）` : ""} · 你学过其中 {learned} 个
            </div>
          </div>
        </div>
        <ul className="mt-4 max-h-[46dvh] divide-y divide-rule overflow-y-auto rounded-2xl border border-rule" data-testid="list-link-words">
          {words.slice(0, 200).map((w) => (
            <li key={w} className="flex items-baseline gap-3 px-3.5 py-2">
              <span className="shrink-0 text-[0.9375rem] font-semibold">{w}</span>
              <span className="min-w-0 truncate text-[0.8125rem] text-ink-3">{shortMeaning(index.map.get(w)!, 1)}</span>
            </li>
          ))}
          {words.length > 200 && <li className="px-3.5 py-2 text-xs text-ink-3">还有 {words.length - 200} 个…</li>}
        </ul>
        {exists && <p className="mt-3 text-xs text-vague">你已经有一个同名词单，导入后会另存为新词单。</p>}
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
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[0.9375rem] font-semibold text-paper-3 shadow-primary/20 disabled:opacity-50"
        >
          <ListPlus className="size-4" /> 导入为我的词单
        </button>
      </Panel>
    </div>
  );
}
