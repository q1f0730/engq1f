/**
 * 11.1 · 救援页：界面崩了 / 存档读不出来时显示。
 * 不依赖主界面（不用路由、不用 store 的 hook），只直接读写 localStorage 和 IndexedDB 里的快照，
 * 所以哪怕状态坏到每个页面都渲染不出来，也能回滚到快照或者把原始数据导出来。
 */
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { KEY, REV_KEY, parseBackup } from "@/lib/store";
import { ACTIVE_PROFILE } from "@/lib/profiles";
import { isChunkError } from "@/lib/chunk-error";
export { isChunkError };
import type { SnapMeta } from "@/lib/snapshots";

export const RESCUE_KEY = "cet4v-rescue-v1";

/** 网络 / 加载失败：重试；联网后自动再试一次 */
export function LoadFailed({ onRetry, message }: { onRetry: () => void; message?: string }) {
  useEffect(() => {
    const on = () => onRetry();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [onRetry]);
  return (
    <div className="grid min-h-[70dvh] place-items-center p-6" data-testid="load-failed">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-xl font-bold">网络不好，页面没加载出来</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">学习记录都在，没有受影响。连上网后点重试，或者稍等一下自动重试。</p>
        <button type="button" data-testid="load-retry" onClick={onRetry} className="mt-5 h-12 w-full rounded-2xl bg-primary font-semibold text-primary-foreground">
          重试
        </button>
        <button type="button" onClick={() => (location.hash = "#/")} className="mt-2 h-11 w-full rounded-2xl text-[14px] font-semibold text-muted-foreground">
          回首页
        </button>
        {message && <p className="mt-3 break-all text-[11px] text-muted-foreground/70" data-testid="load-failed-msg">{message}</p>}
      </div>
    </div>
  );
}

function rawDump(): string {
  let main: string | null = null;
  let rev: string | null = null;
  try {
    main = localStorage.getItem(KEY);
    rev = localStorage.getItem(REV_KEY);
  } catch {
    /* 存储不可用 */
  }
  // 读得懂就导出成能直接再导入的备份格式；读不懂就原样保存
  try {
    const state = JSON.parse(main ?? "null");
    if (state && typeof state === "object") {
      try {
        const rl = JSON.parse(rev ?? "[]");
        if (Array.isArray(rl) && !Array.isArray(state.revlog)) state.revlog = rl;
      } catch {
        /* 日志坏了：不带日志 */
      }
      return JSON.stringify({ app: "cet4-vocab", version: 1, exportedAt: new Date().toISOString(), state });
    }
  } catch {
    /* 不是 JSON */
  }
  return JSON.stringify({ app: "cet4-vocab", raw: { [KEY]: main, [REV_KEY]: rev }, exportedAt: new Date().toISOString() });
}

function exportRaw() {
  const blob = new Blob([rawDump()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `四级单词打卡-原始数据-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** 把快照写回存储（先把现在的原始数据另存一份），然后整页重载 */
async function restoreSnap(id: string) {
  const m = await import("@/lib/snapshots");
  const data = await m.snapData(id);
  if (!data) throw new Error("快照不见了");
  const st = parseBackup(data);
  try {
    localStorage.setItem(RESCUE_KEY, rawDump());
  } catch {
    /* 空间不够也继续：快照本身还在 */
  }
  const { revlog, ...rest } = st;
  localStorage.setItem(KEY, JSON.stringify({ ...rest, onboarded: true }));
  if (revlog.length) localStorage.setItem(REV_KEY, JSON.stringify(revlog));
  else localStorage.removeItem(REV_KEY);
  // 回滚后回到首页（出事时可能停在数据中心之类的子页面）
  try {
    history.replaceState(null, "", `${location.pathname}${location.search}#/`);
  } catch {
    /* 照样重载 */
  }
  location.reload();
}

export function Rescue({ message, boot }: { message: string; boot?: boolean }) {
  const [snaps, setSnaps] = useState<SnapMeta[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [more, setMore] = useState(false);
  useEffect(() => {
    import("@/lib/snapshots")
      .then((m) => m.listSnaps(ACTIVE_PROFILE))
      .then(setSnaps)
      .catch(() => setSnaps([]));
  }, []);
  const go = async (id: string) => {
    setBusy(true);
    setErr("");
    try {
      await restoreSnap(id);
    } catch (e) {
      setErr((e as Error).message || "回滚失败");
      setBusy(false);
    }
  };
  const newest = snaps?.[0];
  const fmt = (s: SnapMeta) => `${s.day.slice(5).replace("-", "/")} ${new Date(s.at).toTimeString().slice(0, 5)} · ${s.words} 词`;
  return (
    <div className="grid min-h-dvh place-items-center p-6" data-testid="rescue">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold">{boot ? "学习记录读不出来" : "出了点问题"}</h1>
        <p className="mt-2 text-[15px] leading-relaxed" data-testid="rescue-body">
          {boot ? "存在这台设备上的记录格式坏了，app 读不懂它。" : "有一部分记录 app 读不懂，页面打不开。"}
          {snaps === null || newest ? "你的记录没有被删掉：可以先导出原始数据留底，再回滚到最近一次自动快照。" : "你的记录没有被删掉：先导出原始数据留底（以后可以在「数据与备份」里导入）。"}
        </p>
        {/* 技术细节小字放在后面，给反馈问题用 */}
        <p className="mt-2 break-all text-[11px] leading-snug text-muted-foreground/80" data-testid="rescue-msg">
          {message}
        </p>
        <div className="mt-5 space-y-2">
          {(snaps === null || newest) && (
            <button
              type="button"
              data-testid="rescue-rollback"
              disabled={busy || !newest}
              onClick={() => newest && go(newest.id)}
              className="w-full rounded-2xl bg-primary px-4 py-3 text-left font-semibold text-primary-foreground disabled:opacity-50"
            >
              回滚到最近快照
              <span className="block text-[12px] font-normal opacity-85">{snaps === null ? "查找快照…" : newest ? fmt(newest) : ""}</span>
            </button>
          )}
          <button type="button" data-testid="rescue-export" onClick={exportRaw} className={snaps !== null && !newest ? "w-full rounded-2xl bg-primary px-4 py-3 font-semibold text-primary-foreground" : "w-full rounded-2xl bg-secondary px-4 py-3 font-semibold"}>
            导出原始数据
          </button>
          {boot && (
            <button
              type="button"
              data-testid="rescue-fresh"
              onClick={() => {
                // 11.2 · 先把原始数据下载到手机里（看得见、拿得回来），再在本机留一份（数据与备份里能导出 / 恢复 / 删除）
                exportRaw();
                try {
                  localStorage.setItem(RESCUE_KEY, rawDump());
                  localStorage.removeItem(KEY);
                } catch {
                  /* 存储不可用 */
                }
                setTimeout(() => location.reload(), 600);
              }}
              className="w-full rounded-2xl bg-secondary px-4 py-3 font-semibold"
            >
              下载原始数据，然后从头开始
            </button>
          )}
          <button type="button" data-testid="rescue-reload" onClick={() => location.reload()} className="w-full rounded-2xl px-4 py-3 text-[14px] font-semibold text-muted-foreground">
            重新加载
          </button>
        </div>
        {snaps && snaps.length > 1 && (
          <div className="mt-3">
            <button type="button" onClick={() => setMore(!more)} className="text-[13px] font-semibold text-primary" data-testid="rescue-more">
              {more ? "收起" : `更早的快照（${snaps.length - 1}）`}
            </button>
            {more && (
              <ul className="mt-2 space-y-1.5">
                {snaps.slice(1).map((s) => (
                  <li key={s.id}>
                    <button type="button" disabled={busy} onClick={() => go(s.id)} className="w-full rounded-xl bg-secondary px-3 py-2 text-left text-[13px]">
                      回滚到 {fmt(s)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {err && (
          <p className="mt-3 text-[13px] font-semibold text-forget" role="alert">
            {err}
          </p>
        )}
      </div>
    </div>
  );
}

/** 整个应用外面再包一层：路由之外的渲染错误也接得住 */
export class AppBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn("app crashed", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      if (isChunkError(this.state.error)) return <LoadFailed message={String((this.state.error as Error)?.message ?? "")} onRetry={() => location.reload()} />;
      return <Rescue message={`错误信息：${String((this.state.error as Error)?.message ?? this.state.error)}`} />;
    }
    return this.props.children;
  }
}
