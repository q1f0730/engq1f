/** v11 · 导入备份：加密备份先输口令；本机已有记录时选「合并」或「覆盖」；动手前先给本机存一份快照 */
import { Eye, EyeOff, GitMerge, Lock, Replace } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { today } from "@/lib/clock";
import { fmtDate } from "@/lib/format";
import { dayKey } from "@/lib/srs";
import { ACTIVE_PROFILE } from "@/lib/profiles";
import { exportBackup, getState, parseBackup, replaceState, type AppState } from "@/lib/store";
import { decryptBackup, hasProgress, mergeStates, sniffBackup, type EncEnvelope } from "@/lib/sync";
import { BottomSheet } from "./sheet";

type Phase = { k: "idle" } | { k: "pass"; enc: EncEnvelope; at?: string } | { k: "choose"; remote: AppState; at?: string };

/** 导入 / 合并前给本机拍一份快照（失败不拦着导入） */
async function safetySnap() {
  const st = getState();
  if (!hasProgress(st)) return;
  try {
    const m = await import("@/lib/snapshots");
    await m.saveSnap(ACTIVE_PROFILE, today(), "import", exportBackup(), Object.keys(st.cards).length);
  } catch {
    /* 没有 IndexedDB */
  }
}

export async function applyReplace(remote: AppState) {
  await safetySnap();
  replaceState({ ...remote, onboarded: true });
  toast.success(`已恢复备份：${Object.keys(remote.cards).length} 个学习记录`);
}

export async function applyMerge(remote: AppState) {
  await safetySnap();
  const { state, stats } = mergeStates(getState(), remote);
  replaceState({ ...state, onboarded: true });
  toast.success(`已合并：新增 ${stats.added} 词，更新 ${stats.updated} 词`, {
    description: `复习日志 +${stats.revAdded} 条 · 打卡 +${stats.daysAdded} 天${stats.lists ? ` · 词单 ${stats.lists} 个` : ""}`,
    duration: 3200,
  });
  return stats;
}

export function ImportFlow({ text, onDone }: { text: string | null; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const gotPlain = async (plain: string, at?: string) => {
    const remote = parseBackup(plain);
    if (hasProgress(getState())) setPhase({ k: "choose", remote, at });
    else {
      await applyReplace(remote);
      finish();
    }
  };

  const finish = () => {
    setPhase({ k: "idle" });
    setPass("");
    setErr("");
    setBusy(false);
    onDone();
  };

  useEffect(() => {
    if (text === null) return;
    (async () => {
      try {
        const p = sniffBackup(text);
        if (p.kind === "enc") setPhase({ k: "pass", enc: p.enc, at: p.exportedAt });
        else await gotPlain(p.text, p.exportedAt);
      } catch (e) {
        toast.error((e as Error).message);
        finish();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const unlock = async () => {
    if (phase.k !== "pass" || !pass) return;
    setBusy(true);
    setErr("");
    try {
      const plain = await decryptBackup(phase.enc, pass);
      setBusy(false);
      await gotPlain(plain, phase.at);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const remote = phase.k === "choose" ? phase.remote : null;
  const local = getState();
  return (
    <>
      <BottomSheet open={phase.k === "pass"} onOpenChange={(v) => !v && finish()} title="这份备份设了口令" testid="import-pass-sheet">
        <p className="text-[13px] text-muted-foreground">输入导出时设的口令解开备份（AES-GCM 加密，只在本机解密）。</p>
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void unlock();
          }}
        >
          <div className="flex items-center gap-2 rounded-2xl bg-secondary px-3">
            <Lock className="size-4 shrink-0 text-muted-foreground" />
            <input
              type={show ? "text" : "password"}
              autoFocus
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              data-testid="import-pass"
              aria-label="备份口令"
              placeholder="备份口令"
              autoComplete="off"
              className="h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none"
            />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "隐藏口令" : "显示口令"} className="grid size-8 place-items-center text-muted-foreground">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {err && (
            <p className="mt-2 text-[13px] font-semibold text-forget" data-testid="import-pass-err" role="alert">
              {err}
            </p>
          )}
          <button type="submit" disabled={!pass || busy} data-testid="import-pass-go" className="mt-4 h-12 w-full rounded-2xl bg-primary font-bold text-primary-foreground disabled:opacity-50">
            {busy ? "解密中…" : "解开备份"}
          </button>
        </form>
      </BottomSheet>

      <BottomSheet open={phase.k === "choose"} onOpenChange={(v) => !v && finish()} title="怎么恢复这份备份？" testid="import-choose">
        {remote && (
          <>
            <div className="grid grid-cols-2 gap-2 text-center" data-testid="import-compare">
              <Side label="备份" words={Object.keys(remote.cards).length} days={remote.checkins.length} sub={phase.k === "choose" && phase.at ? `导出于 ${fmtDate(dayKey(new Date(phase.at)), true)}` : "导出时间未知"} />
              <Side label="这台设备" words={Object.keys(local.cards).length} days={local.checkins.length} sub="当前记录" />
            </div>
            <button
              type="button"
              data-testid="import-merge"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await applyMerge(remote);
                finish();
              }}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-primary p-4 text-left text-primary-foreground shadow-lg shadow-primary/20"
            >
              <GitMerge className="size-6 shrink-0" />
              <span className="min-w-0">
                <b className="block text-[15px]">合并两台设备的记录</b>
                <span className="block text-[12px] opacity-85">每个词取最近复习的那份；日志、打卡、生词本、词单取并集</span>
              </span>
            </button>
            <button
              type="button"
              data-testid="import-replace"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await applyReplace(remote);
                finish();
              }}
              className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-border/70 p-4 text-left"
            >
              <Replace className="size-6 shrink-0 text-destructive" />
              <span className="min-w-0">
                <b className="block text-[15px]">覆盖这台设备</b>
                <span className="block text-[12px] text-muted-foreground">用备份整个替换现在的记录</span>
              </span>
            </button>
            <p className="mt-3 text-[12px] text-muted-foreground">动手前会给这台设备自动存一份快照，可以在「数据中心 → 自动快照」回滚。</p>
          </>
        )}
      </BottomSheet>
    </>
  );
}

function Side({ label, words, days, sub }: { label: string; words: number; days: number; sub: string }) {
  return (
    <div className="rounded-2xl bg-secondary/70 px-3 py-3">
      <div className="text-[12px] font-bold text-muted-foreground">{label}</div>
      <div className="tnum mt-1 text-[22px] font-extrabold leading-none">{words}</div>
      <div className="text-[12px] text-muted-foreground">词 · 打卡 {days} 天</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}
