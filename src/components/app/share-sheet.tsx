import { Check, Download, Share2 } from "@/components/app/icons";
import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { SHARE_TPLS, canShareFile, drawShareCard, shareImage, type ShareInfo, type ShareTpl } from "@/lib/share";
import { setSettings, useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./sheet";

export function ShareSheet({ open, onOpenChange, info }: { open: boolean; onOpenChange: (v: boolean) => void; info: ShareInfo | null }) {
  const tpl: ShareTpl = useApp().settings.shareTpl ?? "classic";
  const [url, setUrl] = useState<string>("");
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (!open || !info) return;
    const canvas = drawShareCard(info, tpl);
    setUrl(canvas.toDataURL("image/png"));
    setBlob(null);
    canvas.toBlob((b) => setBlob(b), "image/png");
  }, [open, info, tpl]);

  const file = `四级打卡-${info?.day ?? ""}.png`;
  const native = !!blob && canShareFile(new File([blob], file, { type: "image/png" }));

  const save = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const share = async () => {
    if (!blob) return;
    const r = await shareImage(blob, file, save);
    if (r === "downloaded") toast("已保存图片，可以从相册发给好友");
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="打卡分享图" testid="share-sheet">
      {/* 12.0 · 样式选择：一排字 + 色样小方块，选中的划荧光笔（不是三个彩色卡片） */}
      <div className="mb-5 flex gap-5 border-b border-rule" role="radiogroup" aria-label="分享图样式" data-testid="share-tpls">
        {SHARE_TPLS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={tpl === t.id}
            data-testid={`share-tpl-${t.id}`}
            onClick={() => setSettings({ shareTpl: t.id })}
            className={cn("press -mb-px flex h-11 items-center gap-2 border-b-2 text-[0.875rem]", tpl === t.id ? "border-ink font-semibold text-ink" : "border-transparent text-ink-3 hover:text-ink")}
          >
            <span className="grid size-4 shrink-0 place-items-center rounded-[3px] ring-1 ring-black/15" style={{ background: t.swatch }}>
              {tpl === t.id && <Check className={cn("size-3", t.id === "paper" ? "text-ink" : "text-paper-3")} strokeWidth={3} />}
            </span>
            <span className={cn(tpl === t.id && "hl")}>{t.name}</span>
          </button>
        ))}
      </div>
      {url ? (
        <img src={url} alt="打卡分享图" data-testid="share-img" data-tpl={tpl} className="mx-auto w-full max-w-[280px] rounded-lg shadow-[0_1px_0_var(--rule),0_12px_32px_-16px_rgba(0,0,0,0.35)]" />
      ) : (
        <div className="mx-auto aspect-[3/4] w-full max-w-[280px] animate-pulse rounded-lg bg-paper-2" />
      )}
      <div className="mt-6 flex gap-2" data-testid="share-actions" data-native={native ? 1 : 0}>
        {native && (
          <button type="button" onClick={share} data-testid="share-native" className="press flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-lg bg-ink font-semibold text-paper-3 hover:bg-ink-2">
            <Share2 className="size-4" /> 分享到微信 / QQ
          </button>
        )}
        <a
          href={url}
          download={file}
          data-testid="share-download"
          className={cn("press flex h-12 flex-1 items-center justify-center gap-2 rounded-lg font-semibold", native ? "ring-1 ring-rule-strong ring-inset hover:bg-paper-2" : "bg-ink text-paper-3 hover:bg-ink-2")}
        >
          <Download className="size-4" /> 保存图片
        </a>
      </div>
      {!native && (
        <p className="mt-2 text-center text-[0.75rem] text-ink-3" data-testid="share-hint">
          这个浏览器不支持直接分享，保存后从相册发给好友
        </p>
      )}
    </BottomSheet>
  );
}
