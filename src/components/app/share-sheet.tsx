import { Download, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { drawShareCard, type ShareInfo } from "@/lib/share";
import { BottomSheet } from "./sheet";

export function ShareSheet({ open, onOpenChange, info }: { open: boolean; onOpenChange: (v: boolean) => void; info: ShareInfo | null }) {
  const [url, setUrl] = useState<string>("");
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (!open || !info) return;
    const canvas = drawShareCard(info);
    setUrl(canvas.toDataURL("image/png"));
    canvas.toBlob((b) => setBlob(b), "image/png");
  }, [open, info]);

  const file = `四级打卡-${info?.day ?? ""}.png`;
  const canShare =
    typeof navigator !== "undefined" &&
    !!blob &&
    "canShare" in navigator &&
    navigator.canShare?.({ files: [new File([blob], file, { type: "image/png" })] });

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="打卡分享图" testid="share-sheet">
      {url ? (
        <img src={url} alt="打卡分享图" data-testid="share-img" className="mx-auto w-full max-w-[300px] rounded-2xl shadow-lg" />
      ) : (
        <div className="mx-auto aspect-[3/4] w-full max-w-[300px] animate-pulse rounded-2xl bg-secondary" />
      )}
      <div className="mt-5 flex gap-2">
        <a
          href={url}
          download={file}
          data-testid="share-download"
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary font-semibold text-primary-foreground"
        >
          <Download className="size-4" /> 保存图片
        </a>
        {canShare && (
          <button
            type="button"
            onClick={() => blob && navigator.share({ files: [new File([blob], file, { type: "image/png" })], title: "四级单词打卡" }).catch(() => {})}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-secondary font-semibold"
          >
            <Share2 className="size-4" /> 分享
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
