import { Copy, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { WordList } from "@/lib/lists";
import { encodeList, listLinkUrl, LINK_MAX_WORDS } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./sheet";

/** v11 · 词单链接：词单压缩后编码进链接 hash（#/list-link?d=…），对方打开就能导入，不经服务器 */
export default function ListLinkSheet({ open, onOpenChange, list }: { open: boolean; onOpenChange: (v: boolean) => void; list: WordList }) {
  const [url, setUrl] = useState("");
  const [max, setMax] = useState(0);
  useEffect(() => {
    if (!open) return;
    setUrl("");
    let dead = false;
    encodeList(list.name, list.words).then((code) => {
      if (!dead) {
        setUrl(listLinkUrl(location.href, code));
        setMax(LINK_MAX_WORDS);
      }
    });
    return () => {
      dead = true;
    };
  }, [open, list.name, list.words]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("链接已复制", { description: "发给同学，用浏览器打开就能导入" });
    } catch {
      toast.error("复制失败，长按上面的链接手动复制");
    }
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="分享词单链接" testid="list-link-sheet">
      <p className="text-[13px] text-muted-foreground">
        「{list.name}」的 {Math.min(list.words.length, max || list.words.length)} 个词都编码在链接里，不经过服务器；对方打开链接即可导入为自己的词单（不含学习进度）。
        {max > 0 && list.words.length > max ? `超过 ${max} 词的部分不会放进链接。` : ""}
      </p>
      <div className="mt-3 max-h-28 overflow-y-auto break-all rounded-2xl bg-secondary px-3.5 py-3 font-mono text-[12px] leading-relaxed select-all" data-testid="list-link-url">
        {url || "生成中…"}
      </div>
      <div className="tnum mt-1 text-right text-[11px] text-muted-foreground">{url ? `${url.length} 字符` : ""}</div>
      <div className={cn("mt-3 grid gap-2", canShare ? "grid-cols-2" : "grid-cols-1")}>
        <button type="button" disabled={!url} onClick={copy} data-testid="list-link-copy" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-primary-foreground disabled:opacity-50">
          <Copy className="size-4" /> 复制链接
        </button>
        {canShare && (
          <button
            type="button"
            disabled={!url}
            data-testid="list-link-share"
            onClick={() => navigator.share({ title: `四级词单：${list.name}`, text: `「${list.name}」${list.words.length} 个四级词，打开链接导入`, url }).catch(() => {})}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-secondary font-bold disabled:opacity-50"
          >
            <Share2 className="size-4" /> 系统分享
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
