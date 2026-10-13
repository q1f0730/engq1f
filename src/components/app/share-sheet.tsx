import { Check, Download, Share2 } from "lucide-react";
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
      <div className="mb-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="分享图样式" data-testid="share-tpls">
        {SHARE_TPLS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={tpl === t.id}
            data-testid={`share-tpl-${t.id}`}
            onClick={() => setSettings({ shareTpl: t.id })}
            className={cn(
              "flex items-center gap-2 rounded-2xl border p-1.5 pr-2.5 text-left text-[13px] font-semibold transition",
              tpl === t.id ? "border-primary bg-brand-soft text-primary" : "border-border/70 text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="relative grid size-8 shrink-0 place-items-center rounded-xl ring-1 ring-black/10" style={{ background: t.swatch }}>
              {tpl === t.id && <Check className={cn("size-4", t.id === "paper" ? "text-[#c7362a]" : "text-white")} strokeWidth={3} />}
            </span>
            <span className="truncate">{t.name}</span>
          </button>
        ))}
      </div>
      {url ? (
        <img src={url} alt="打卡分享图" data-testid="share-img" data-tpl={tpl} className="mx-auto w-full max-w-[280px] rounded-2xl shadow-lg" />
      ) : (
        <div className="mx-auto aspect-[3/4] w-full max-w-[280px] animate-pulse rounded-2xl bg-secondary" />
      )}
      <div className="mt-5 flex gap-2" data-testid="share-actions" data-native={native ? 1 : 0}>
        {native && (
          <button
            type="button"
            onClick={share}
            data-testid="share-native"
            className="flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-primary font-semibold text-primary-foreground"
          >
            <Share2 className="size-4" /> 分享到微信 / QQ
          </button>
        )}
        <a
          href={url}
          download={file}
          data-testid="share-download"
          className={cn(
            "flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl font-semibold",
            native ? "bg-secondary" : "bg-primary text-primary-foreground",
          )}
        >
          <Download className="size-4" /> 保存图片
        </a>
      </div>
      {!native && <p className="mt-2 text-center text-[12px] text-muted-foreground" data-testid="share-hint">这个浏览器不支持直接分享，保存后从相册发给好友</p>}
    </BottomSheet>
  );
}
