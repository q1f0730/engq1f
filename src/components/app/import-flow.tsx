/** v11 · 导入备份：加密备份先输口令；本机已有记录时选「合并」或「覆盖」；动手前先给本机存一份快照 */
import { Eye, EyeOff, GitMerge, Lock, Replace, TriangleAlert } from "@/components/app/icons";
import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { today } from "@/lib/clock";
import { fmtDate } from "@/lib/format";
import { dayKey } from "@/lib/srs";
import { ACTIVE_PROFILE } from "@/lib/profiles";
import { exportBackup, getState, parseBackup, replaceState, type AppState } from "@/lib/store";
import { getWordsSync } from "@/lib/data";
import { emptyReport, type CleanReport } from "@/lib/validate";
import { decryptBackup, hasProgress, mergeStates, sniffBackup, type EncEnvelope } from "@/lib/sync";
import { BottomSheet } from "./sheet";
import { cn } from "@/lib/utils";

type Phase = { k: "idle" } | { k: "pass"; enc: EncEnvelope; at?: string } | { k: "choose"; remote: AppState; at?: string; rep: CleanReport };

/** 11.1 · 逐条校验备份：词库里没有的词、坏掉的记录丢掉，能修的修好；返回丢掉 / 修正的条数 */
export function parseChecked(plain: string, at?: string): { remote: AppState; rep: CleanReport } {
  const idx = getWordsSync();
  const rep = emptyReport();
  const remote = parseBackup(plain, idx ? (w) => idx.map.has(w) : undefined, rep);
  // 11.4 / 11.5 · 用户导出的备份文件：「上次备份」= max(文件里的 lastBackup、backupDay、导出时间的本地日期)，不晚于今天。
  // 11.3 导出的文件里 lastBackup 是「上一次」备份，所以不能只在它为空时才看导出时间。救援原始数据不算备份。
  try {
    const o = JSON.parse(plain) as { exportedAt?: unknown; raw?: unknown };
    if (o.raw === undefined) {
      const iso = typeof o.exportedAt === "string" ? o.exportedAt : at;
      const t = typeof iso === "string" ? Date.parse(iso) : NaN;
      if (Number.isFinite(t)) {
        const d = dayKey(new Date(t));
        if (!remote.lastBackup || remote.lastBackup < d) remote.lastBackup = d;
      }
    }
  } catch {
    /* 解析过了，不会到这里 */
  }
  // 导出时间比手机日期还晚（手机时间被调过 / 另一台手机的时间快）：按今天算，不显示「-N 天前」
  if (remote.lastBackup && remote.lastBackup > today()) remote.lastBackup = today();
  return { remote, rep };
}

export function repText(rep: CleanReport): string {
  const parts: string[] = [];
  if (rep.salvaged !== undefined) parts.push(`原始数据坏了，从里面救回 ${rep.salvaged} 个词`);
  if (rep.dropped.length) parts.push(`丢掉 ${rep.dropped.length} 条损坏 / 词库里没有的单词记录`);
  if (rep.repaired.length) parts.push(`修正 ${rep.repaired.length} 条`);
  if (rep.other) parts.push(`另有 ${rep.other} 条日志 / 打卡等坏数据已清理`);
  return parts.join("，");
}

/** 覆盖会让本机记录大幅减少（备份是空的，或不到本机的一半） */
export const riskyReplace = (remote: AppState, local: AppState) => {
  const r = Object.keys(remote.cards).length;
  const l = Object.keys(local.cards).length;
  return l > 0 && (r === 0 || r < l / 2);
};

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

  const [sure, setSure] = useState(false);
  const gotPlain = async (plain: string, at?: string) => {
    const { remote, rep } = parseChecked(plain, at);
    const bad = repText(rep);
    if (hasProgress(getState())) setPhase({ k: "choose", remote, at, rep });
    else {
      await applyReplace(remote);
      if (bad) toast.warning(rep.salvaged !== undefined ? `救回 ${rep.salvaged} 个词` : "备份里有坏数据，已跳过", { description: bad, duration: 4000 });
      finish();
    }
  };

  const finish = () => {
    setSure(false);
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
  const risky = !!remote && riskyReplace(remote, local);
  const bad = phase.k === "choose" ? repText(phase.rep) : "";
  return (
    <>
      <BottomSheet open={phase.k === "pass"} onOpenChange={(v) => !v && finish()} title="这份备份设了口令" testid="import-pass-sheet">
        <p className="text-[0.8125rem] text-ink-3">输入导出时设的口令解开备份（AES-GCM 加密，只在本机解密）。</p>
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void unlock();
          }}
        >
          <div className="flex items-center gap-2 rounded-2xl bg-paper-2 px-3">
            <Lock className="size-4 shrink-0 text-ink-3" />
            <input
              type={show ? "text" : "password"}
              autoFocus
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              data-testid="import-pass"
              aria-label="备份口令"
              placeholder="备份口令"
              autoComplete="off"
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none"
            />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "隐藏口令" : "显示口令"} className="grid size-8 place-items-center text-ink-3">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {err && (
            <p className="mt-2 text-[0.8125rem] font-semibold text-forget" data-testid="import-pass-err" role="alert">
              {err}
            </p>
          )}
          <button type="submit" disabled={!pass || busy} data-testid="import-pass-go" className="press mt-4 h-12 w-full rounded-lg bg-ink font-semibold text-paper-3 disabled:opacity-50 hover:bg-ink-2">
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
            {bad && (
              <p className="mt-3 flex gap-2 rounded-2xl bg-vague-soft px-3 py-2.5 text-xs font-medium text-vague" data-testid="import-dropped" data-n={phase.k === "choose" ? phase.rep.dropped.length : 0} data-salvaged={phase.k === "choose" ? (phase.rep.salvaged ?? "") : ""}>
                <TriangleAlert className="mt-px size-4 shrink-0" />
                {phase.k === "choose" && phase.rep.salvaged !== undefined ? `${bad}，坏掉的部分丢掉了。` : `备份里有坏数据：${bad}。`}
              </p>
            )}
            <button
              type="button"
              data-testid="import-merge"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await applyMerge(remote);
                finish();
              }}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-ink p-4 text-left text-paper-3"
            >
              <GitMerge className="size-6 shrink-0" />
              <span className="min-w-0">
                <b className="block text-[0.9375rem]">合并两台设备的记录</b>
                <span className="block text-xs opacity-85">每个词取最近复习的那份；日志、打卡、生词本、词单取并集</span>
              </span>
            </button>
            <button
              type="button"
              data-testid="import-replace"
              data-risky={risky ? 1 : 0}
              disabled={busy}
              onClick={async () => {
                // 11.1 · 覆盖后记录会少一大半（或清零）：要再确认一次
                if (risky && !sure) {
                  setSure(true);
                  return;
                }
                setBusy(true);
                await applyReplace(remote);
                finish();
              }}
              className={cn(
                "mt-2 flex w-full items-center gap-3 rounded-2xl border p-4 text-left",
                risky ? "border-destructive bg-destructive/10" : "border-rule",
                risky && sure && "bg-destructive text-destructive-foreground",
              )}
            >
              <Replace className={cn("size-6 shrink-0", risky && sure ? "" : "text-destructive")} />
              <span className="min-w-0">
                <b className="block text-[0.9375rem]" data-testid="import-replace-label">
                  {risky && sure ? `确认覆盖：${Object.keys(local.cards).length} 词 → ${Object.keys(remote.cards).length} 词` : "覆盖这台设备"}
                </b>
                <span className={cn("block text-xs", risky && sure ? "opacity-90" : risky ? "font-semibold text-destructive" : "text-ink-3")}>
                  {risky
                    ? Object.keys(remote.cards).length === 0
                      ? "备份里一个学习记录都没有，覆盖 = 清空这台设备"
                      : `备份只有本机的 ${Math.round((Object.keys(remote.cards).length / Math.max(1, Object.keys(local.cards).length)) * 100)}%，覆盖会丢掉大部分记录`
                    : "用备份整个替换现在的记录"}
                </span>
              </span>
            </button>
            <p className="mt-3 text-xs text-ink-3">动手前会给这台设备自动存一份快照，可以在「数据中心 → 自动快照」回滚。</p>
          </>
        )}
      </BottomSheet>
    </>
  );
}

function Side({ label, words, days, sub }: { label: string; words: number; days: number; sub: string }) {
  return (
    <div className="rounded-2xl bg-paper-2 px-3 py-3">
      <div className="text-xs font-semibold text-ink-3">{label}</div>
      <div className="tnum mt-1 text-[1.375rem] font-semibold leading-none">{words}</div>
      <div className="text-xs text-ink-3">词 · 打卡 {days} 天</div>
      <div className="mt-1 text-[0.6875rem] text-ink-3">{sub}</div>
    </div>
  );
}
