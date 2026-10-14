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
      {/* 12.0 · 先看图：分享图平放在一块下沉的纸上，像摆在桌上的一张照片 */}
      <div className="grid place-items-center rounded-xl bg-paper-2 px-6 py-5">
        {url ? (
          <img src={url} alt="打卡分享图" data-testid="share-img" data-tpl={tpl} className="w-full max-w-[260px] rounded-md shadow-[0_1px_0_var(--rule),0_14px_30px_-18px_rgba(0,0,0,0.4)]" />
        ) : (
          <div className="aspect-[3/4] w-full max-w-[260px] animate-pulse rounded-md bg-paper-3" />
        )}
      </div>
      {/* 样式：图下面一排色样，选中的那个字下划荧光笔 */}
      <div className="mt-3 flex justify-center gap-1" role="radiogroup" aria-label="分享图样式" data-testid="share-tpls">
        {SHARE_TPLS.map((t) => (
          <TplChip key={t.id} id={t.id} name={t.name} swatch={t.swatch} on={tpl === t.id} />
        ))}
      </div>
      <div className="mt-5 flex gap-2 border-t border-rule pt-4" data-testid="share-actions" data-native={native ? 1 : 0}>
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
        <p className="mt-2 text-[0.75rem] text-ink-3" data-testid="share-hint">
          这个浏览器不支持直接分享，保存后从相册发给好友
        </p>
      )}
    </BottomSheet>
  );
}

function TplChip({ id, name, swatch, on }: { id: ShareTpl; name: string; swatch: string; on: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      data-testid={`share-tpl-${id}`}
      onClick={() => setSettings({ shareTpl: id })}
      className={cn("press flex h-11 items-center gap-2 rounded-lg px-3 text-[0.875rem]", on ? "font-semibold text-ink" : "text-ink-3 hover:bg-paper-2 hover:text-ink")}
    >
      <span className="grid size-4 shrink-0 place-items-center rounded-[3px] ring-1 ring-black/15" style={{ background: swatch }}>
        {on && <Check className={cn("size-3", id === "paper" ? "text-ink" : "text-paper-3")} strokeWidth={3} />}
      </span>
      <span className={cn(on && "hl")}>{name}</span>
    </button>
  );
}
