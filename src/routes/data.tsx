import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  ClipboardCopy,
  ClipboardPaste,
  Download,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  HardDrive,
  History,
  ImageDown,
  KeyRound,
  ListPlus,
  Pencil,
  Plus,
  Share2,
  Stethoscope,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { PageHeader, Panel, PanelTitle, Spinner } from "@/components/app/shell";
import { BottomSheet } from "@/components/app/sheet";
import { ImportFlow } from "@/components/app/import-flow";
import { RESCUE_KEY } from "@/components/app/rescue";
import { NameField } from "@/components/app/name-field";
import { today } from "@/lib/clock";
import { useWords, type WordIndex } from "@/lib/data";
import { download, fmtDate } from "@/lib/format";
import { EXAMPLES_KEY, clearExamples, examplesCount } from "@/lib/examples";
import {
  ACTIVE_PROFILE,
  PROFILE_MAX,
  PROFILE_NAME_MAX,
  addProfile,
  newProfileId,
  readRegistry,
  removeProfile,
  renameProfile,
  revKeyOf,
  stateKeyOf,
  writeRegistry,
  type Registry,
} from "@/lib/profiles";
import { KEY, REV_KEY, createList, exportBackup, getState, markBackedUp, parseBackup, replaceState, resetAll, useApp } from "@/lib/store";
import { PASS_MIN, cryptoReady, encryptBackup, fmtBytes, inspectState, listNameFromFile, lowerLookup, lsBytes, parseWordText, type Issue, type WordFileResult } from "@/lib/sync";
import type { SnapMeta } from "@/lib/snapshots";
import { drawReport, reportData } from "@/lib/report";
import { canShareFile, shareImage } from "@/lib/share";
import { dayKey } from "@/lib/srs";
import { isRawDump, unwrapRaw } from "@/lib/salvage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/data")({ component: DataPage });

/** v11 · 数据中心：备份与恢复、自动快照、学习报告图、导入词表、学习档案、数据体检、存储管理 */
function DataPage() {
  const { index, error } = useWords();
  if (error) return <div className="p-8 text-center text-sm text-muted-foreground">{error}</div>;
  if (!index) return <Spinner />;
  const reg = readRegistry();
  const profile = reg.list.find((p) => p.id === ACTIVE_PROFILE);
  return (
    <div data-testid="data-page">
      <Link to="/me" className="-ml-1 mt-4 flex w-fit items-center gap-0.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground" data-testid="data-back">
        <ChevronLeft className="size-4" /> 我的
      </Link>
      <PageHeader
        title="数据中心"
        sub="不联网 · 记录只存在这台手机上"
        right={
          profile && (
            <span className="mb-1 max-w-[40%] truncate rounded-full bg-brand-soft px-3 py-1.5 text-[12px] font-bold text-primary" data-testid="data-profile">
              {profile.name}
            </span>
          )
        }
      />
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <div className="min-w-0 space-y-4 md:space-y-5">
          <BackupPanel />
          <SnapPanel />
          <ReportPanel index={index} profileName={reg.list.length > 1 ? (profile?.name ?? "") : ""} />
          <WordFilePanel index={index} />
        </div>
        <div className="min-w-0 space-y-4 md:space-y-5">
          <ProfilesPanel />
          <HealthPanel index={index} />
          <StoragePanel />
          <RescueDumpPanel />
          <ResetPanel />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 备份与恢复（加密、剪贴板、合并）

function BackupPanel() {
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const day = today();
  const tooShort = pass.length > 0 && pass.length < PASS_MIN;

  const build = async (): Promise<string | null> => {
    if (tooShort) {
      toast.error(`口令至少 ${PASS_MIN} 位`);
      return null;
    }
    const plain = exportBackup(true);
    if (!pass) return plain;
    if (!cryptoReady()) {
      toast.error("这个浏览器不支持加密（需要 HTTPS）");
      return null;
    }
    return encryptBackup(plain, pass);
  };

  const exportFile = async () => {
    const text = await build();
    if (!text) return;
    download(`四级单词打卡-备份${pass ? "-加密" : ""}-${day}.json`, text);
    markBackedUp(day);
    toast.success(pass ? "加密备份已导出" : "备份已导出", pass ? { description: "恢复时需要输入这个口令，忘了就打不开" } : undefined);
  };

  const copy = async () => {
    const text = await build();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      markBackedUp(day);
      toast.success(`备份已复制（${fmtBytes(new Blob([text]).size)}）`, { description: "粘贴到聊天或备忘录里存着，换设备时再粘贴回来" });
    } catch {
      toast.error("复制失败：浏览器没有给剪贴板权限，改用「导出备份文件」");
    }
  };

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t.trim()) {
        setPending(t);
        return;
      }
    } catch {
      /* 没有读取权限：手动粘贴 */
    }
    setPasteText("");
    setPasting(true);
  };

  return (
    <Panel data-testid="backup-panel">
      <PanelTitle>备份与恢复</PanelTitle>
      <label className="mb-1.5 block text-[12px] font-bold tracking-wider text-muted-foreground" htmlFor="enc-pass">
        备份口令（可选）
      </label>
      <div className={cn("flex items-center gap-2 rounded-2xl bg-secondary px-3 ring-primary/30 transition focus-within:ring-2", tooShort && "ring-2 ring-forget/50")}>
        <KeyRound className="size-4 shrink-0 text-muted-foreground" />
        <input
          id="enc-pass"
          type={show ? "text" : "password"}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="不填 = 不加密"
          autoComplete="new-password"
          data-testid="enc-pass"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
        />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "隐藏口令" : "显示口令"} className="grid size-8 place-items-center text-muted-foreground">
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <p className="mt-1.5 text-[12px] text-muted-foreground" data-testid="enc-hint">
        {pass ? (tooShort ? `口令至少 ${PASS_MIN} 位` : "导出和复制都会用 AES-GCM 加密；口令不保存，忘了就打不开") : "设了口令，备份发到聊天或网盘里别人也看不了"}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Btn testid="export-file" icon={<Download className="size-4" />} label={pass ? "导出加密备份" : "导出备份文件"} onClick={exportFile} primary />
        <Btn testid="copy-backup" icon={<ClipboardCopy className="size-4" />} label="复制到剪贴板" onClick={copy} />
        <Btn testid="restore-file" icon={<FileUp className="size-4" />} label="从文件恢复" onClick={() => file.current?.click()} />
        <Btn testid="paste-backup" icon={<ClipboardPaste className="size-4" />} label="从剪贴板恢复" onClick={paste} />
      </div>
      <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">恢复时如果这台设备已有记录，可以选「合并」：每个词取最近复习的那份，两台设备的打卡和日志都保留。</p>
      <input
        ref={file}
        type="file"
        accept="application/json,.json,.txt"
        className="hidden"
        data-testid="data-import-file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setPending(await f.text());
          e.target.value = "";
        }}
      />
      <BottomSheet open={pasting} onOpenChange={setPasting} title="粘贴备份" testid="paste-sheet">
        <p className="text-[13px] text-muted-foreground">浏览器没让读剪贴板，长按下面的框粘贴备份文本。</p>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          data-testid="paste-text"
          rows={5}
          placeholder='{"app":"cet4-vocab", …}'
          className="mt-3 w-full resize-none rounded-2xl border border-border/80 bg-background p-3 font-mono text-[12px] outline-none focus:border-primary/60"
        />
        <button
          type="button"
          disabled={!pasteText.trim()}
          data-testid="paste-go"
          onClick={() => {
            setPasting(false);
            setPending(pasteText);
          }}
          className="mt-3 h-12 w-full rounded-2xl bg-primary font-bold text-primary-foreground disabled:opacity-50"
        >
          恢复
        </button>
      </BottomSheet>
      <ImportFlow text={pending} onDone={() => setPending(null)} />
    </Panel>
  );
}

function Btn({ icon, label, onClick, testid, primary, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; testid: string; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      className={cn(
        "flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl px-2 text-[14px] font-semibold transition disabled:opacity-50",
        primary ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-secondary hover:bg-accent",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------- 自动快照

const SNAP_KIND: Record<SnapMeta["kind"], string> = { auto: "每日自动", manual: "手动", import: "导入前" };

function hm(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function SnapPanel() {
  const [list, setList] = useState<SnapMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState<SnapMeta | null>(null);
  const st = useApp();
  const load = () =>
    import("@/lib/snapshots")
      .then((m) => m.listSnaps(ACTIVE_PROFILE))
      .then(setList)
      .catch(() => setFailed(true));
  useEffect(() => {
    void load();
    // 首次打开应用时自动快照在 2.5 秒后才存：晚一点再刷新一次
    const t = setTimeout(load, 3200);
    return () => clearTimeout(t);
  }, []);
  const saveNow = async () => {
    const m = await import("@/lib/snapshots");
    await m.saveSnap(ACTIVE_PROFILE, today(), "manual", exportBackup(), Object.keys(getState().cards).length);
    toast.success("已存一份快照");
    await load();
  };
  const rollback = async (s: SnapMeta) => {
    const m = await import("@/lib/snapshots");
    const data = await m.snapData(s.id);
    if (!data) return toast.error("快照不见了");
    try {
      const next = parseBackup(data);
      replaceState({ ...next, onboarded: true });
      toast.success(`已回滚到 ${fmtDate(s.day)} ${hm(s.at)}`, { description: `${Object.keys(next.cards).length} 个学习记录` });
    } catch (e) {
      toast.error((e as Error).message);
    }
    setPick(null);
  };
  return (
    <Panel data-testid="snap-panel">
      <PanelTitle right={<History className="size-4 text-muted-foreground" />}>自动快照</PanelTitle>
      <p className="-mt-1 mb-3 text-[13px] text-muted-foreground">每天第一次打开时自动存一份，保留最近 7 份；导入或合并前也会先存一份。误操作了可以回滚。</p>
      {failed ? (
        <p className="rounded-2xl bg-secondary px-4 py-3 text-[13px] text-muted-foreground">这个浏览器不支持 IndexedDB，无法保存快照。</p>
      ) : list === null ? (
        <div className="h-16 animate-pulse rounded-2xl bg-secondary" />
      ) : list.length === 0 ? (
        <p className="rounded-2xl bg-secondary px-4 py-3 text-[13px] text-muted-foreground" data-testid="snap-empty">
          {Object.keys(st.cards).length ? "还没有快照，今天的会在几秒后自动保存。" : "开始学习后，每天会自动保存一份。"}
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-2xl border border-border/70" data-testid="snap-list">
          {list.map((s, k) => (
            <li key={s.id} className="flex items-center gap-3 px-3.5 py-2.5" data-testid="snap-item" data-kind={s.kind} data-words={s.words}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[14px] font-semibold">
                  <span className="tnum">
                    {s.day === dayKey() ? "今天" : fmtDate(s.day)} {hm(s.at)}
                  </span>
                  <span className={cn("rounded-full px-1.5 py-px text-[11px] font-bold", s.kind === "auto" ? "bg-know-soft text-know" : s.kind === "import" ? "bg-vague-soft text-vague" : "bg-secondary text-muted-foreground")}>
                    {SNAP_KIND[s.kind]}
                  </span>
                </div>
                <div className="tnum text-[12px] text-muted-foreground">
                  {s.words} 词 · {fmtBytes(s.size)}
                </div>
              </div>
              <button type="button" data-testid={`snap-restore-${k}`} onClick={() => setPick(s)} className="h-9 shrink-0 rounded-full bg-secondary px-3.5 text-[13px] font-bold hover:bg-accent">
                回滚
              </button>
            </li>
          ))}
        </ul>
      )}
      {!failed && (
        <button type="button" data-testid="snap-now" onClick={saveNow} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Plus className="size-4" /> 现在存一份
        </button>
      )}
      <BottomSheet open={!!pick} onOpenChange={(v) => !v && setPick(null)} title="回滚到这份快照？" testid="snap-confirm">
        {pick && (
          <>
            <p className="text-[14px] text-muted-foreground">
              学习记录会回到 <b className="text-foreground">{fmtDate(pick.day)} {hm(pick.at)}</b>（{pick.words} 词），之后的进度会丢失。不放心可以先「现在存一份」。
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPick(null)} className="h-12 rounded-2xl bg-secondary font-semibold">
                取消
              </button>
              <button type="button" data-testid="snap-confirm-yes" onClick={() => rollback(pick)} className="h-12 rounded-2xl bg-destructive font-semibold text-destructive-foreground">
                回滚
              </button>
            </div>
          </>
        )}
      </BottomSheet>
    </Panel>
  );
}

// ---------------------------------------------------------------- 学习报告图

function ReportPanel({ index, profileName }: { index: WordIndex; profileName: string }) {
  const st = useApp();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const day = today();
  const data = useMemo(() => reportData(index, st, day, profileName), [index, st, day, profileName]);
  useEffect(() => {
    if (!open) return;
    const c = drawReport(data);
    setUrl(c.toDataURL("image/png"));
    setBlob(null);
    c.toBlob((b) => setBlob(b), "image/png");
  }, [open, data]);
  const name = `四级学习报告-${day}.png`;
  const save = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const native = !!blob && canShareFile(new File([blob], name, { type: "image/png" }));
  return (
    <Panel data-testid="report-panel">
      <PanelTitle>学习报告图</PanelTitle>
      <div className="flex items-center gap-3">
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 text-center">
          <Mini v={data.learned} k="学过" />
          <Mini v={data.dist.mastered + data.dist.killed} k="掌握" />
          <Mini v={data.streak} k="连续天数" />
        </div>
      </div>
      <button
        type="button"
        data-testid="report-open"
        onClick={() => setOpen(true)}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary text-[14px] font-semibold hover:bg-accent"
      >
        <ImageDown className="size-4" /> 生成长图：总进度 · 掌握分布 · 连续天数
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title="学习报告" testid="report-sheet">
        {url ? (
          <img src={url} alt="学习报告长图" data-testid="report-img" className="mx-auto w-full max-w-sm rounded-2xl border border-border/70 shadow-lg" />
        ) : (
          <div className="mx-auto aspect-[1/2] w-full max-w-sm animate-pulse rounded-2xl bg-secondary" />
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={save} disabled={!url} data-testid="report-save" className={cn("flex h-12 items-center justify-center gap-2 rounded-2xl font-bold", native ? "bg-secondary" : "col-span-2 bg-primary text-primary-foreground")}>
            <Download className="size-4" /> 保存图片
          </button>
          {native && (
            <button
              type="button"
              data-testid="report-share"
              onClick={async () => {
                const r = await shareImage(blob!, name, save);
                if (r === "downloaded") toast("已保存图片");
              }}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-primary-foreground"
            >
              <Share2 className="size-4" /> 分享
            </button>
          )}
        </div>
      </BottomSheet>
    </Panel>
  );
}

function Mini({ v, k }: { v: number | string; k: string }) {
  return (
    <div className="rounded-2xl bg-secondary/70 px-2 py-2.5">
      <div className="tnum text-[20px] font-extrabold leading-none">{v}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{k}</div>
    </div>
  );
}

// ---------------------------------------------------------------- 导入词表

function WordFilePanel({ index }: { index: WordIndex }) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [res, setRes] = useState<WordFileResult | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const resolve = useMemo(() => lowerLookup(index.map.keys()), [index]);
  const run = (t: string, fname?: string) => {
    const r = parseWordText(t, resolve);
    setRes(r);
    if (fname) setName(listNameFromFile(fname));
    if (!r.found.length) toast.error("没有找到词库里收录的单词");
  };
  return (
    <Panel data-testid="wordfile-panel">
      <PanelTitle right={<FileText className="size-4 text-muted-foreground" />}>导入词表</PanelTitle>
      <p className="-mt-1 mb-3 text-[13px] text-muted-foreground">从 CSV / TXT 生成词单：每行一个词，或「单词,释义」的表格（只看第一列）。只保留四级词库里有的词。</p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setRes(null);
        }}
        rows={3}
        placeholder={"abandon\nability, n. 能力\nabsorb\tv. 吸收"}
        data-testid="wordfile-text"
        className="w-full resize-none rounded-2xl border border-border/80 bg-background p-3 text-[14px] outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Btn testid="wordfile-pick" icon={<FileUp className="size-4" />} label="选择文件" onClick={() => file.current?.click()} />
        <Btn testid="wordfile-parse" icon={<Check className="size-4" />} label="识别单词" onClick={() => run(text)} disabled={!text.trim()} />
      </div>
      <input
        ref={file}
        type="file"
        accept=".csv,.txt,text/plain,text/csv"
        className="hidden"
        data-testid="wordfile-input"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const t = await f.text();
          setText(t.length > 20000 ? t.slice(0, 20000) + "\n…" : t);
          run(t, f.name);
          e.target.value = "";
        }}
      />
      {res && res.found.length > 0 && (
        <div className="mt-3 rounded-2xl bg-secondary/60 p-3" data-testid="wordfile-result" data-found={res.found.length} data-missing={res.missing.length}>
          <div className="text-[14px] font-bold">
            收录 <span className="tnum text-know">{res.found.length}</span> 个
            {res.missing.length > 0 && (
              <span className="font-medium text-muted-foreground">
                {" "}
                · 词库里没有 <span className="tnum">{res.missing.length}</span> 个
              </span>
            )}
          </div>
          <div className="mt-2 flex max-h-24 flex-wrap gap-1 overflow-hidden" data-testid="wordfile-found">
            {res.found.slice(0, 30).map((w) => (
              <span key={w} className="rounded-lg bg-card px-2 py-0.5 text-[12px] font-semibold">
                {w}
              </span>
            ))}
            {res.found.length > 30 && <span className="px-1 text-[12px] text-muted-foreground">…</span>}
          </div>
          {res.missing.length > 0 && (
            <div className="mt-1.5 truncate text-[12px] text-muted-foreground" data-testid="wordfile-missing">
              跳过：{res.missing.slice(0, 8).join("、")}
              {res.missing.length > 8 ? " 等" : ""}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="词单名"
              data-testid="wordfile-name"
              className="h-11 min-w-0 flex-1 rounded-2xl border border-border/80 bg-background px-3.5 text-[15px] outline-none focus:border-primary/60"
            />
            <button
              type="button"
              data-testid="wordfile-create"
              onClick={() => {
                const id = createList(name || "导入词单", res.found);
                if (!id) return toast.error("词单已经满 50 个了");
                toast.success(`已生成词单：${res.found.length} 词`);
                navigate({ to: "/words", search: { tab: "list", list: id } });
              }}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-primary px-4 text-[14px] font-bold text-primary-foreground"
            >
              <ListPlus className="size-4" /> 生成词单
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- 学习档案

interface ProfileSum {
  words: number;
  days: number;
}

function profileSum(id: string): ProfileSum {
  try {
    const raw = localStorage.getItem(stateKeyOf(id));
    if (!raw) return { words: 0, days: 0 };
    const p = JSON.parse(raw) as { cards?: object; checkins?: unknown[] };
    return { words: Object.keys(p.cards ?? {}).length, days: Array.isArray(p.checkins) ? p.checkins.length : 0 };
  } catch {
    return { words: 0, days: 0 };
  }
}

function switchProfile(reg: Registry, id: string, hash = "#/") {
  writeRegistry({ ...reg, active: id });
  location.hash = hash;
  location.reload();
}

function ProfilesPanel() {
  const [reg, setReg] = useState<Registry>(() => readRegistry());
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const sums = useMemo(() => Object.fromEntries(reg.list.map((p) => [p.id, profileSum(p.id)])), [reg]);
  const save = (r: Registry) => {
    writeRegistry(r);
    setReg(r);
  };
  const del = reg.list.find((p) => p.id === deleting);
  return (
    <Panel data-testid="profiles-panel">
      <PanelTitle right={<span className="tnum text-[12px] font-semibold text-muted-foreground">{reg.list.length}/{PROFILE_MAX}</span>}>学习档案</PanelTitle>
      <p className="-mt-1 mb-3 text-[13px] text-muted-foreground">一台手机给几个人用，或者四级、六级分开背：每个档案的进度、打卡、设置互不影响。</p>
      <ul className="space-y-2" data-testid="profile-list">
        {reg.list.map((p) => {
          const on = p.id === reg.active;
          return (
            <li
              key={p.id}
              data-testid="profile-row"
              data-id={p.id}
              data-active={on ? "1" : "0"}
              className={cn("flex items-center gap-3 rounded-2xl border px-3.5 py-3", on ? "border-primary/50 bg-brand-soft" : "border-border/70")}
            >
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-extrabold", on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                {[...p.name][0]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-bold" data-testid="profile-name">
                    {p.name}
                  </span>
                  {on && <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[11px] font-bold text-primary-foreground">使用中</span>}
                </div>
                <div className="tnum text-[12px] text-muted-foreground">
                  {sums[p.id].words} 词 · 打卡 {sums[p.id].days} 天
                </div>
              </div>
              <button type="button" aria-label={`重命名 ${p.name}`} data-testid="profile-rename" onClick={() => setRenaming(p.id)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
                <Pencil className="size-3.5" />
              </button>
              {!on && p.id !== "main" && (
                <button type="button" aria-label={`删除 ${p.name}`} data-testid="profile-delete" onClick={() => setDeleting(p.id)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-forget">
                  <Trash2 className="size-3.5" />
                </button>
              )}
              {!on && (
                <button type="button" data-testid="profile-switch" onClick={() => switchProfile(reg, p.id)} className="h-9 shrink-0 rounded-full bg-primary px-3.5 text-[13px] font-bold text-primary-foreground">
                  切换
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        data-testid="profile-new"
        disabled={reg.list.length >= PROFILE_MAX}
        onClick={() => setCreating(true)}
        className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-[14px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <Users className="size-4" /> {reg.list.length >= PROFILE_MAX ? `最多 ${PROFILE_MAX} 个档案` : "新建档案"}
      </button>
      <BottomSheet open={creating} onOpenChange={setCreating} title="新建学习档案" testid="profile-create">
        <p className="mb-3 text-[13px] text-muted-foreground">新档案从头开始（重新选词书和每日新词），当前档案的记录原样保留。</p>
        <NameField
          placeholder={`档案名，最多 ${PROFILE_NAME_MAX} 字`}
          action="创建并切换"
          testid="pnew"
          onSubmit={(name) => {
            const id = newProfileId();
            const next = addProfile(reg, name, id, today());
            if (!next) return;
            setCreating(false);
            switchProfile(next, id, "#/welcome");
          }}
        />
      </BottomSheet>
      <BottomSheet open={!!renaming} onOpenChange={(v) => !v && setRenaming(null)} title="重命名档案" testid="profile-rename-sheet">
        <NameField
          initial={reg.list.find((p) => p.id === renaming)?.name ?? ""}
          placeholder="档案名"
          action="保存"
          testid="profile-rn"
          onSubmit={(name) => {
            if (renaming) save(renameProfile(reg, renaming, name));
            setRenaming(null);
          }}
        />
      </BottomSheet>
      <BottomSheet open={!!del} onOpenChange={(v) => !v && setDeleting(null)} title={`删除「${del?.name ?? ""}」？`} testid="profile-delete-sheet">
        <p className="text-[14px] text-muted-foreground">这个档案的学习记录、打卡和快照都会删掉，无法恢复。</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setDeleting(null)} className="h-12 rounded-2xl bg-secondary font-semibold">
            取消
          </button>
          <button
            type="button"
            data-testid="profile-delete-yes"
            onClick={async () => {
              if (!del) return;
              localStorage.removeItem(stateKeyOf(del.id));
              localStorage.removeItem(revKeyOf(del.id));
              save(removeProfile(reg, del.id));
              setDeleting(null);
              toast(`已删除档案「${del.name}」`);
              try {
                (await import("@/lib/snapshots")).deleteProfileSnaps(del.id);
              } catch {
                /* ignore */
              }
            }}
            className="h-12 rounded-2xl bg-destructive font-semibold text-destructive-foreground"
          >
            删除
          </button>
        </div>
      </BottomSheet>
    </Panel>
  );
}

// ---------------------------------------------------------------- 数据体检

function HealthPanel({ index }: { index: WordIndex }) {
  const [res, setRes] = useState<{ issues: Issue[]; total: number } | null>(null);
  const run = () => {
    const r = inspectState(getState(), (w) => index.map.has(w), today());
    setRes({ issues: r.issues, total: r.total });
  };
  const fix = () => {
    const r = inspectState(getState(), (w) => index.map.has(w), today());
    if (r.total) replaceState(r.fixed);
    toast.success(`已修复 ${r.total} 处`);
    run();
  };
  return (
    <Panel data-testid="health-panel">
      <PanelTitle right={<Stethoscope className="size-4 text-muted-foreground" />}>数据体检</PanelTitle>
      <p className="-mt-1 mb-3 text-[13px] text-muted-foreground">检查学习记录、生词本、词单、复习日志和打卡里有没有损坏或词库里不存在的词。</p>
      {res &&
        (res.total === 0 ? (
          <div className="mb-3 flex items-center gap-2 rounded-2xl bg-know-soft px-4 py-3 text-[14px] font-bold text-know" data-testid="health-ok">
            <Check className="size-5" strokeWidth={3} /> 数据健康，没有发现问题
          </div>
        ) : (
          <ul className="mb-3 space-y-2" data-testid="health-issues" data-total={res.total}>
            {res.issues.map((i) => (
              <li key={i.kind} className="rounded-2xl bg-forget-soft/70 px-3.5 py-2.5" data-testid="health-issue" data-kind={i.kind} data-n={i.n}>
                <div className="flex items-center gap-2 text-[14px] font-bold">
                  <span className="min-w-0 flex-1">{i.label}</span>
                  <span className="tnum shrink-0 text-forget">{i.n}</span>
                </div>
                <div className="truncate text-[12px] text-muted-foreground">
                  {i.fix}：{i.sample.join("、")}
                  {i.n > i.sample.length ? " 等" : ""}
                </div>
              </li>
            ))}
          </ul>
        ))}
      {res && res.total > 0 ? (
        <button type="button" data-testid="health-fix" onClick={fix} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground shadow-md shadow-primary/20">
          一键修复 {res.total} 处
        </button>
      ) : (
        <button type="button" data-testid="health-run" onClick={run} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary text-[14px] font-semibold hover:bg-accent">
          <Stethoscope className="size-4" /> {res ? "再查一次" : "开始体检"}
        </button>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- 存储管理

interface StoreRow {
  k: string;
  label: string;
  bytes: number;
  sub?: string;
  tone: string;
  clear?: () => Promise<void> | void;
}

const AUDIO_CACHE = "cet4v-audio";

async function cacheUsage(name: string): Promise<{ n: number; bytes: number }> {
  const c = await caches.open(name);
  const keys = await c.keys();
  let bytes = 0;
  for (const k of keys) {
    const r = await c.match(k);
    if (!r || r.type === "opaque") continue;
    try {
      bytes += (await r.blob()).size;
    } catch {
      /* ignore */
    }
  }
  return { n: keys.length, bytes };
}

function StoragePanel() {
  const [rows, setRows] = useState<StoreRow[] | null>(null);
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let dead = false;
    (async () => {
      const ls = (k: string) => lsBytes(k, localStorage.getItem(k));
      const reg = readRegistry();
      const others = reg.list.filter((p) => p.id !== ACTIVE_PROFILE).reduce((s, p) => s + ls(stateKeyOf(p.id)) + ls(revKeyOf(p.id)), 0);
      const exN = examplesCount();
      const out: StoreRow[] = [
        { k: "state", label: "学习记录", bytes: ls(KEY), tone: "bg-primary" },
        { k: "revlog", label: "复习日志", bytes: ls(REV_KEY), tone: "bg-know" },
        ...(reg.list.length > 1 ? [{ k: "profiles", label: "其他档案", bytes: others, sub: `${reg.list.length - 1} 个`, tone: "bg-[#7c5cd6]" }] : []),
        {
          k: "examples",
          label: "例句缓存",
          bytes: ls(EXAMPLES_KEY),
          sub: `${exN} 词`,
          tone: "bg-vague",
          clear: () => {
            const n = clearExamples();
            toast.success(`已清理 ${n} 个词的例句`, { description: "联网时会重新获取" });
          },
        },
      ];
      try {
        const m = await import("@/lib/snapshots");
        const u = await m.snapUsage();
        out.push({ k: "snaps", label: "自动快照", bytes: u.bytes, sub: `${u.n} 份`, tone: "bg-[#3b82c4]" });
      } catch {
        /* 没有 IndexedDB */
      }
      if (typeof caches !== "undefined") {
        try {
          const names = await caches.keys();
          const audio = names.includes(AUDIO_CACHE) ? await cacheUsage(AUDIO_CACHE) : { n: 0, bytes: 0 };
          out.push({
            k: "audio",
            label: "发音缓存",
            bytes: audio.bytes,
            sub: `${audio.n} 个词`,
            tone: "bg-forget",
            clear: async () => {
              await caches.delete(AUDIO_CACHE);
              toast.success(`已清理 ${audio.n} 个发音`, { description: "联网时听过的词会重新缓存" });
            },
          });
          let app = { n: 0, bytes: 0 };
          for (const n of names.filter((n) => n.startsWith("cet4v-") && n !== AUDIO_CACHE)) {
            const u = await cacheUsage(n);
            app = { n: app.n + u.n, bytes: app.bytes + u.bytes };
          }
          out.push({ k: "app", label: "离线应用文件", bytes: app.bytes, sub: `${app.n} 个文件 · 含词库`, tone: "bg-muted-foreground" });
        } catch {
          /* ignore */
        }
      }
      let e: { usage: number; quota: number } | null = null;
      try {
        const r = await navigator.storage?.estimate?.();
        if (r?.quota) e = { usage: r.usage ?? 0, quota: r.quota };
      } catch {
        /* ignore */
      }
      if (!dead) {
        setRows(out);
        setEst(e);
      }
    })();
    return () => {
      dead = true;
    };
  }, [tick]);
  const total = rows?.reduce((s, r) => s + r.bytes, 0) ?? 0;
  return (
    <Panel data-testid="storage-panel">
      <PanelTitle right={<HardDrive className="size-4 text-muted-foreground" />}>存储管理</PanelTitle>
      {!rows ? (
        <div className="h-32 animate-pulse rounded-2xl bg-secondary" />
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="tnum text-[24px] font-extrabold" data-testid="storage-total">
              {fmtBytes(total)}
            </span>
            {est && (
              <span className="tnum text-[12px] text-muted-foreground" data-testid="storage-quota">
                浏览器分配 {fmtBytes(est.quota)}，已用 {Math.max(0.1, Math.round((est.usage / est.quota) * 1000) / 10)}%
              </span>
            )}
          </div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
            {rows.map((r) => (
              <div key={r.k} className={cn("h-full", r.tone)} style={{ width: `${total ? (r.bytes / total) * 100 : 0}%` }} />
            ))}
          </div>
          <ul className="mt-3 divide-y divide-border/60">
            {rows.map((r) => (
              <li key={r.k} className="flex items-center gap-3 py-2.5" data-testid={`storage-row-${r.k}`} data-bytes={r.bytes}>
                <span className={cn("size-2.5 shrink-0 rounded-full", r.tone)} />
                <span className="min-w-0 flex-1">
                  <span className="text-[14px] font-medium">{r.label}</span>
                  {r.sub && <span className="ml-1.5 text-[12px] text-muted-foreground">{r.sub}</span>}
                </span>
                <span className="tnum shrink-0 text-[13px] font-semibold text-muted-foreground">{fmtBytes(r.bytes)}</span>
                {r.clear && (
                  <button
                    type="button"
                    data-testid={`storage-clear-${r.k}`}
                    onClick={async () => {
                      await r.clear!();
                      setTick((t) => t + 1);
                    }}
                    className="h-8 shrink-0 rounded-full bg-secondary px-3 text-[12px] font-bold hover:bg-accent"
                  >
                    清理
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[12px] text-muted-foreground">学习记录和日志不能在这里删；例句和发音缓存清掉后，联网时会重新获取。</p>
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- 11.2 · 救援时另存的原始数据 / 清空

/** 救援页「从头开始」或回滚前另存的原始数据：在这里导出、恢复、删除（没有就不显示） */
function RescueDumpPanel() {
  const [raw, setRaw] = useState<string | null>(() => {
    try {
      return localStorage.getItem(RESCUE_KEY);
    } catch {
      return null;
    }
  });
  const [pending, setPending] = useState<string | null>(null);
  if (!raw) return null;
  let at = "";
  let restorable = false;
  let salvaged: number | undefined;
  try {
    const j = JSON.parse(raw) as { exportedAt?: string; state?: unknown };
    // 11.3 · 本地日期（不再用 toISOString 的 UTC 日期）
    at = j.exportedAt && !Number.isNaN(Date.parse(j.exportedAt)) ? dayKey(new Date(j.exportedAt)) : "";
    if (j.state) restorable = true;
    else if (isRawDump(j)) {
      // 11.3 · 原始数据格式：原文能读就能恢复；坏了就看能救回几个词
      const u = unwrapRaw(j.raw);
      restorable = !!u;
      salvaged = u?.salvaged;
    }
  } catch {
    /* 原样保存的坏数据 */
  }
  return (
    <Panel data-testid="rescue-dump">
      <PanelTitle>救援时另存的原始数据</PanelTitle>
      <p className="-mt-1 mb-3 text-[13px] text-muted-foreground">
        {at ? `${at} 救援时留下的一份。` : "救援时留下的一份。"}
        {restorable
          ? salvaged !== undefined
            ? `格式坏了，能读出 ${salvaged} 个词：可以导出成文件，或者把能读的部分恢复回来（会先让你选合并还是覆盖）。`
            : "可以导出成文件，或者恢复回来（会先让你选合并还是覆盖）。"
          : "坏得太厉害，一个词都读不出来，只能导出成文件留底（求助时可以发给开发者）。"}
      </p>
      <div className={cn("grid gap-2", restorable ? "grid-cols-3" : "grid-cols-2")}>
        <button type="button" data-testid="rescue-dump-export" onClick={() => download(`四级单词打卡-救援原始数据-${at || today()}.json`, raw)} className="h-11 rounded-2xl bg-secondary text-[13px] font-semibold">
          导出
        </button>
        {/* 11.3 · 能恢复才显示「恢复」，不再放一个永远灰着的按钮 */}
        {restorable && (
          <button type="button" data-testid="rescue-dump-restore" onClick={() => setPending(raw)} className="h-11 rounded-2xl bg-secondary text-[13px] font-semibold">
            恢复
          </button>
        )}
        <button
          type="button"
          data-testid="rescue-dump-delete"
          onClick={() => {
            try {
              localStorage.removeItem(RESCUE_KEY);
            } catch {
              /* 存储不可用 */
            }
            setRaw(null);
            toast("已删除救援时另存的数据");
          }}
          className="h-11 rounded-2xl bg-secondary text-[13px] font-semibold text-destructive"
        >
          删除
        </button>
      </div>
      <ImportFlow text={pending} onDone={() => setPending(null)} />
    </Panel>
  );
}

/** 11.2 · 「清空所有学习记录」从「高级」挪到数据中心最底部 */
function ResetPanel() {
  const [confirm, setConfirm] = useState(false);
  return (
    <Panel data-testid="reset-panel">
      <button type="button" onClick={() => setConfirm(true)} data-testid="reset" className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-semibold text-destructive hover:bg-destructive/10">
        清空所有学习记录
      </button>
      <BottomSheet open={confirm} onOpenChange={setConfirm} title="清空所有学习记录？" testid="reset-confirm">
        <p className="text-[14px] text-muted-foreground">这台设备上这个档案的学习记录、打卡、词单都会删掉，无法恢复。建议先导出备份。</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setConfirm(false)} className="h-12 rounded-2xl bg-secondary font-semibold">
            取消
          </button>
          <button
            type="button"
            data-testid="reset-yes"
            onClick={() => {
              resetAll();
              setConfirm(false);
              toast("已清空");
              location.hash = "#/welcome";
            }}
            className="h-12 rounded-2xl bg-destructive font-semibold text-white"
          >
            确认清空
          </button>
        </div>
      </BottomSheet>
    </Panel>
  );
}
