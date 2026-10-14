import { Copy, Share2 } from "@/components/app/icons";
import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import type { WordList } from "@/lib/lists";
import { encodeList, listLinkUrl, LINK_MAX_WORDS } from "@/lib/sync";
import { BottomSheet } from "./sheet";

/** v11 · 词单链接：词单压缩后编码进链接 hash（#/list-link?d=…），对方打开就能导入，不经服务器 */
export default function ListLinkSheet({ open, onOpenChange, list }: { open: boolean; onOpenChange: (v: boolean) => void; list: WordList }) {
  // 链接里最多放 LINK_MAX_WORDS 个词（11.x 用一个 state 存这个常量，没必要）
  const max = LINK_MAX_WORDS;
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!open) return;
    setUrl("");
    let dead = false;
    void encodeList(list.name, list.words).then((code) => dead || setUrl(listLinkUrl(location.href, code)));
    return () => {
      dead = true;
    };
  }, [open, list.name, list.words]);
  // 没有剪贴板接口（非安全上下文）也走失败提示
  const copy = () =>
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(url))
      .then(
      () => toast.success("链接已复制", { description: "发给同学，用浏览器打开就能导入" }),
      () => toast.error("复制失败，长按上面的链接手动复制"),
    );
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shown = Math.min(list.words.length, max);
  const cut = list.words.length > max;
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="分享词单链接" testid="list-link-sheet">
      {/* 12.0 · 上面一行大字说链接里有什么，下面一张「票根」：虚线撕口 + 等宽链接 + 长度 */}
      <p className="flex items-baseline gap-2">
        <span className="tnum font-serif text-[2rem] leading-none">{shown}</span>
        <span className="text-[0.875rem] text-ink-2">个词 · 「{list.name}」</span>
      </p>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-3">
        全部编码在链接里，不经过服务器；对方打开链接即可导入为自己的词单（不含学习进度）。{cut ? `超过 ${max} 词的部分不会放进链接。` : ""}
      </p>
      <figure className="mt-5 rounded-lg bg-paper-2 px-3.5 pb-2 pt-3">
        <div className="max-h-28 select-all overflow-y-auto break-all font-mono text-[0.75rem] leading-relaxed text-ink-2" data-testid="list-link-url">
          {url || "生成中…"}
        </div>
        <figcaption className="tnum mt-2 flex justify-between border-t border-dashed border-rule-strong pt-1.5 text-[0.6875rem] text-ink-3">
          <span>长按可全选</span>
          <span>{url ? `${url.length} 字符` : ""}</span>
        </figcaption>
      </figure>
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={!url} onClick={copy} data-testid="list-link-copy" className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-ink font-semibold text-paper-3 hover:bg-ink-2 disabled:opacity-50">
          <Copy className="size-4" /> 复制链接
        </button>
        {canShare && (
          <button
            type="button"
            disabled={!url}
            data-testid="list-link-share"
            aria-label="系统分享"
            onClick={() => navigator.share({ title: `四级词单：${list.name}`, text: `「${list.name}」${list.words.length} 个四级词，打开链接导入`, url }).catch(() => {})}
            className="press flex h-12 items-center justify-center gap-2 rounded-lg px-4 font-semibold ring-1 ring-rule-strong ring-inset hover:bg-paper-2 disabled:opacity-50"
          >
            <Share2 className="size-4" /> 分享
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
