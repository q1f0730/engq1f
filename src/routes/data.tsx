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
} from "@/components/app/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { Spinner } from "@/components/app/shell";
import { SubHead, Tag, actClass } from "@/components/app/kit";
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
  if (error) return <div className="p-8 text-center text-sm text-ink-3">{error}</div>;
  if (!index) return <Spinner />;
  const reg = readRegistry();
  const profile = reg.list.find((p) => p.id === ACTIVE_PROFILE);
  return (
    <div data-testid="data-page">
      <SubHead
        back={{ to: "/me", label: "我的", testid: "data-back" }}
        title="数据中心"
        sub="不联网 · 记录只存在这台设备上"
        right={
          profile && (
            <Tag tone="mark" className="mb-1 max-w-[40%] truncate" data-testid="data-profile">
              {profile.name}
            </Tag>
          )
        }
      />
      {/* 目录：九章，点一下滚到那一章 */}
      <nav aria-label="目录" className="mb-10 border-y border-rule py-3">
        <ol className="grid grid-cols-2 gap-x-6 gap-y-1 text-[0.8125rem] md:grid-cols-3">
          {CHAPTERS.map((c, k) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => document.getElementById(c.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="press flex min-h-9 w-full items-baseline gap-2 text-left text-ink-2 hover:text-ink"
              >
                <span className="tnum w-5 shrink-0 font-serif text-[1rem] text-ink-3">{k + 1}</span>
                <span className="truncate">{c.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="grid gap-12 md:grid-cols-2 md:gap-x-10">
        <div className="min-w-0 space-y-12">
          <BackupPanel />
          <SnapPanel />
          <ReportPanel index={index} profileName={reg.list.length > 1 ? (profile?.name ?? "") : ""} />
          <WordFilePanel index={index} />
        </div>
        <div className="min-w-0 space-y-12">
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
    <Chapter n={1} id="ch-backup" title="备份与恢复" testid="backup-panel" intro="恢复时如果这台设备已有记录，可以选「合并」：每个词取最近复习的那份，两台设备的打卡和日志都保留。">
      <label className="mb-1 block text-[0.8125rem] font-medium text-ink-2" htmlFor="enc-pass">
        备份口令（可选）
      </label>
      {/* 口令：一条下划线输入框，不是灰色药丸 */}
      <div className={cn("flex items-center gap-2 border-b-[1.5px] transition-colors focus-within:border-ink", tooShort ? "border-forget" : "border-rule-strong")}>
        <input
          id="enc-pass"
          type={show ? "text" : "password"}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="不填 = 不加密"
          autoComplete="new-password"
          data-testid="enc-pass"
          className="h-11 min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-ink-3"
        />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? "隐藏口令" : "显示口令"} className="press grid size-10 place-items-center rounded-md text-ink-3 hover:text-ink">
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <p className={cn("mt-2 text-[0.75rem] leading-relaxed", tooShort ? "text-forget" : "text-ink-3")} data-testid="enc-hint">
        {pass ? (tooShort ? `口令至少 ${PASS_MIN} 位` : "导出和复制都会用 AES-GCM 加密；口令不保存，忘了就打不开") : "设了口令，备份发到聊天或网盘里别人也看不了"}
      </p>
      <div className="mt-5 grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 gap-y-2 text-[0.75rem] text-ink-3">
        <span>存</span>
        <Btn testid="export-file" icon={<Download className="size-4" />} label={pass ? "导出加密备份" : "导出备份文件"} onClick={exportFile} primary />
        <Btn testid="copy-backup" icon={<ClipboardCopy className="size-4" />} label="复制到剪贴板" onClick={copy} />
        <span>取</span>
        <Btn testid="restore-file" icon={<FileUp className="size-4" />} label="从文件恢复" onClick={() => file.current?.click()} />
        <Btn testid="paste-backup" icon={<ClipboardPaste className="size-4" />} label="从剪贴板恢复" onClick={paste} />
      </div>
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
        <p className="text-[0.8125rem] leading-relaxed text-ink-2">浏览器没让读剪贴板，长按下面的框粘贴备份文本。</p>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          data-testid="paste-text"
          rows={5}
          placeholder='{"app":"cet4-vocab", …}'
          className="mt-3 w-full resize-none rounded-lg border border-rule-strong bg-paper p-3 font-mono text-[0.75rem] outline-none focus:border-ink"
        />
        <button
          type="button"
          disabled={!pasteText.trim()}
          data-testid="paste-go"
          onClick={() => {
            setPasting(false);
            setPending(pasteText);
          }}
          className={actClass("primary", true) + " mt-3 h-12 w-full disabled:opacity-45"}
        >
          恢复
        </button>
      </BottomSheet>
      <ImportFlow text={pending} onDone={() => setPending(null)} />
    </Chapter>
  );
}

function Btn({ icon, label, onClick, testid, primary, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; testid: string; primary?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testid} className={cn(actClass(primary ? "primary" : "secondary"), "h-11 w-full px-2 text-[0.8125rem] disabled:opacity-45")}>
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
    <Chapter n={2} id="ch-snap" title="自动快照" testid="snap-panel" intro="每天第一次打开时自动存一份，保留最近 7 份；导入或合并前也会先存一份。误操作了可以回滚。">
      {failed ? (
        <p className="border-l-2 border-rule-strong pl-3 text-[0.8125rem] text-ink-3">这个浏览器不支持 IndexedDB，无法保存快照。</p>
      ) : list === null ? (
        <div className="h-16 animate-pulse rounded-lg bg-paper-2" />
      ) : list.length === 0 ? (
        <p className="border-l-2 border-rule-strong pl-3 text-[0.8125rem] text-ink-3" data-testid="snap-empty">
          {Object.keys(st.cards).length ? "还没有快照，今天的会在几秒后自动保存。" : "开始学习后，每天会自动保存一份。"}
        </p>
      ) : (
        /* 一张时间表：日期时间 · 种类 · 词数，右边「回滚」 */
        <ol className="border-t border-rule" data-testid="snap-list">
          {list.map((s, k) => (
            <li key={s.id} className="grid min-h-14 grid-cols-[4.75rem_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-rule py-2" data-testid="snap-item" data-kind={s.kind} data-words={s.words}>
              <span className="tnum leading-tight">
                <span className="block text-[0.75rem] text-ink-3">{s.day === dayKey() ? "今天" : fmtDate(s.day)}</span>
                <span className="block font-serif text-[1.25rem] leading-none">{hm(s.at)}</span>
              </span>
              <span className="min-w-0">
                <span className="block text-[0.875rem] font-medium">{SNAP_KIND[s.kind]}</span>
                <span className="tnum block text-[0.75rem] text-ink-3">
                  {s.words} 词 · {fmtBytes(s.size)}
                </span>
              </span>
              <button type="button" data-testid={`snap-restore-${k}`} onClick={() => setPick(s)} className={actClass("quiet") + " h-10 text-[0.8125rem]"}>
                回滚
              </button>
            </li>
          ))}
        </ol>
      )}
      {!failed && (
        <button type="button" data-testid="snap-now" onClick={saveNow} className={actClass("secondary") + " mt-3 h-11 w-full"}>
          <Plus className="size-4" /> 现在存一份
        </button>
      )}
      <BottomSheet open={!!pick} onOpenChange={(v) => !v && setPick(null)} title="回滚到这份快照？" testid="snap-confirm">
        {pick && (
          <>
            <p className="text-[0.875rem] leading-relaxed text-ink-2">
              学习记录会回到{" "}
              <b className="font-semibold text-ink">
                {fmtDate(pick.day)} {hm(pick.at)}
              </b>
              （{pick.words} 词），之后的进度会丢失。不放心可以先「现在存一份」。
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setPick(null)} className={actClass("secondary", true) + " h-12"}>
                取消
              </button>
              <button type="button" data-testid="snap-confirm-yes" onClick={() => rollback(pick)} className="press inline-flex h-12 flex-1 items-center justify-center rounded-lg bg-destructive text-[0.875rem] font-semibold text-destructive-foreground">
                回滚
              </button>
            </div>
          </>
        )}
      </BottomSheet>
    </Chapter>
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
    <Chapter n={3} id="ch-report" title="学习报告图" testid="report-panel" intro="一张长图：总进度、掌握分布、连续天数。">
      <dl className="grid grid-cols-3 divide-x divide-rule border-y border-rule py-3">
        <Mini v={data.learned} k="学过" />
        <Mini v={data.dist.mastered + data.dist.killed} k="掌握" />
        <Mini v={data.streak} k="连续天数" />
      </dl>
      <button type="button" data-testid="report-open" onClick={() => setOpen(true)} className={actClass("secondary") + " mt-3 h-11 w-full"}>
        <ImageDown className="size-4" /> 生成长图：总进度 · 掌握分布 · 连续天数
      </button>
      <BottomSheet open={open} onOpenChange={setOpen} title="学习报告" testid="report-sheet">
        {url ? (
          <img src={url} alt="学习报告长图" data-testid="report-img" className="mx-auto w-full max-w-sm rounded-lg border border-rule" />
        ) : (
          <div className="mx-auto aspect-[1/2] w-full max-w-sm animate-pulse rounded-lg bg-paper-2" />
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={save} disabled={!url} data-testid="report-save" className={cn(actClass(native ? "secondary" : "primary", true), "h-12")}>
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
              className={actClass("primary", true) + " h-12"}
            >
              <Share2 className="size-4" /> 分享
            </button>
          )}
        </div>
      </BottomSheet>
    </Chapter>
  );
}

function Mini({ v, k }: { v: number | string; k: string }) {
  return (
    <div className="min-w-0 px-3 first:pl-0">
      <dd className="tnum font-serif text-[1.75rem] leading-none">{v}</dd>
      <dt className="mt-1.5 text-[0.6875rem] text-ink-3">{k}</dt>
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
    <Chapter n={4} id="ch-wordfile" title="导入词表" testid="wordfile-panel" intro="从 CSV / TXT 生成词单：每行一个词，或「单词,释义」的表格（只看第一列）。只保留四级词库里有的词。">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setRes(null);
        }}
        rows={3}
        placeholder={"abandon\nability, n. 能力\nabsorb\tv. 吸收"}
        data-testid="wordfile-text"
        className="w-full resize-none rounded-lg border border-rule-strong bg-paper-3 p-3 font-serif text-[1rem] leading-snug outline-none placeholder:font-sans placeholder:text-[0.8125rem] placeholder:text-ink-3 focus:border-ink"
      />
      <div className="mt-2 flex gap-2">
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
        <div className="rise mt-5 border-t border-ink pt-3" data-testid="wordfile-result" data-found={res.found.length} data-missing={res.missing.length}>
          <div className="flex items-baseline gap-2 text-[0.875rem]">
            <span className="tnum font-serif text-[1.75rem] leading-none">{res.found.length}</span>
            <span className="font-medium">个收录</span>
            {res.missing.length > 0 && (
              <span className="text-ink-3">
                · 词库里没有 <span className="tnum">{res.missing.length}</span> 个
              </span>
            )}
          </div>
          {/* 识别出的词：一段衬线文字，像词典的索引页 */}
          <p className="mt-2 line-clamp-3 font-serif text-[1.0625rem] leading-snug text-ink-2" data-testid="wordfile-found">
            {res.found.slice(0, 30).map((w, k) => (
              <span key={w}>
                {k > 0 && <span className="text-rule-strong"> · </span>}
                {w}
              </span>
            ))}
            {res.found.length > 30 && <span className="text-ink-3"> …</span>}
          </p>
          {res.missing.length > 0 && (
            <div className="mt-1.5 truncate text-[0.75rem] text-ink-3" data-testid="wordfile-missing">
              跳过：{res.missing.slice(0, 8).join("、")}
              {res.missing.length > 8 ? " 等" : ""}
            </div>
          )}
          <div className="mt-4 flex items-end gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="词单名"
              data-testid="wordfile-name"
              className="h-11 min-w-0 flex-1 border-b-[1.5px] border-rule-strong bg-transparent text-[0.9375rem] outline-none focus:border-ink"
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
              className={actClass("primary") + " h-11 shrink-0"}
            >
              <ListPlus className="size-4" /> 生成词单
            </button>
          </div>
        </div>
      )}
    </Chapter>
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
    <Chapter
      n={5}
      id="ch-profiles"
      title="学习档案"
      testid="profiles-panel"
      aside={
        <span className="tnum">
          {reg.list.length}/{PROFILE_MAX}
        </span>
      }
      intro="一台设备给几个人用，或者四级、六级分开背：每个档案的进度、打卡、设置互不影响。"
    >
      <ul className="border-t border-rule" data-testid="profile-list">
        {reg.list.map((p) => {
          const on = p.id === reg.active;
          return (
            <li key={p.id} data-testid="profile-row" data-id={p.id} data-active={on ? "1" : "0"} className="relative flex min-h-16 items-center gap-3 border-b border-rule py-2.5 pl-4">
              {on && <span className="absolute inset-y-2.5 left-0 w-[3px] bg-ink" aria-hidden />}
              {/* 档案的首字：一个衬线大写字母（像书脊上的字），不是圆形头像 */}
              <span className={cn("w-7 shrink-0 text-center font-serif text-[1.75rem] leading-none", on ? "text-ink" : "text-ink-3")} aria-hidden>
                {[...p.name][0]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn("truncate text-[0.9375rem]", on ? "font-semibold" : "font-medium")} data-testid="profile-name">
                    {p.name}
                  </span>
                  {on && <Tag tone="mark">使用中</Tag>}
                </div>
                <div className="tnum mt-0.5 text-[0.75rem] text-ink-3">
                  {sums[p.id].words} 词 · 打卡 {sums[p.id].days} 天
                </div>
              </div>
              <button type="button" aria-label={`重命名 ${p.name}`} data-testid="profile-rename" onClick={() => setRenaming(p.id)} className="press grid size-11 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-paper-2 hover:text-ink">
                <Pencil className="size-4" />
              </button>
              {!on && p.id !== "main" && (
                <button type="button" aria-label={`删除 ${p.name}`} data-testid="profile-delete" onClick={() => setDeleting(p.id)} className="press grid size-11 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-paper-2 hover:text-forget">
                  <Trash2 className="size-4" />
                </button>
              )}
              {!on && (
                <button type="button" data-testid="profile-switch" onClick={() => switchProfile(reg, p.id)} className={actClass("primary") + " h-9 shrink-0 px-3.5 text-[0.8125rem]"}>
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
        className="press mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-rule-strong text-[0.875rem] font-medium text-ink-2 hover:border-ink hover:text-ink disabled:opacity-45"
      >
        <Plus className="size-4" /> {reg.list.length >= PROFILE_MAX ? `最多 ${PROFILE_MAX} 个档案` : "新建档案"}
      </button>
      <BottomSheet open={creating} onOpenChange={setCreating} title="新建学习档案" testid="profile-create">
        <p className="mb-4 text-[0.8125rem] leading-relaxed text-ink-2">新档案从头开始（重新选词书和每日新词），当前档案的记录原样保留。</p>
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
        <p className="text-[0.875rem] leading-relaxed text-ink-2">这个档案的学习记录、打卡和快照都会删掉，无法恢复。</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={() => setDeleting(null)} className={actClass("secondary", true) + " h-12"}>
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
            className="press inline-flex h-12 flex-1 items-center justify-center rounded-lg bg-destructive text-[0.875rem] font-semibold text-destructive-foreground"
          >
            删除
          </button>
        </div>
      </BottomSheet>
    </Chapter>
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
    <Chapter n={6} id="ch-health" title="数据体检" testid="health-panel" intro="检查学习记录、生词本、词单、复习日志和打卡里有没有损坏或词库里不存在的词。">
      {res &&
        (res.total === 0 ? (
          <p className="mb-4 flex items-center gap-2 border-l-2 border-know pl-3 text-[0.875rem] font-medium text-know" data-testid="health-ok">
            <Check className="size-4" strokeWidth={3} /> 数据健康，没有发现问题
          </p>
        ) : (
          /* 体检单：一项一行，右边是数量（衬线），下面一行是怎么修 */
          <ul className="mb-4 border-t border-ink" data-testid="health-issues" data-total={res.total}>
            {res.issues.map((i) => (
              <li key={i.kind} className="border-b border-rule py-2.5" data-testid="health-issue" data-kind={i.kind} data-n={i.n}>
                <div className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 text-[0.875rem] font-medium">{i.label}</span>
                  <span className="tnum shrink-0 font-serif text-[1.375rem] leading-none text-forget">{i.n}</span>
                </div>
                <div className="mt-0.5 truncate text-[0.75rem] text-ink-3">
                  {i.fix}：{i.sample.join("、")}
                  {i.n > i.sample.length ? " 等" : ""}
                </div>
              </li>
            ))}
          </ul>
        ))}
      {res && res.total > 0 ? (
        <button type="button" data-testid="health-fix" onClick={fix} className={actClass("primary") + " h-12 w-full"}>
          一键修复 {res.total} 处
        </button>
      ) : (
        <button type="button" data-testid="health-run" onClick={run} className={actClass("secondary") + " h-11 w-full"}>
          {res ? "再查一次" : "开始体检"}
        </button>
      )}
    </Chapter>
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
        { k: "state", label: "学习记录", bytes: ls(KEY), tone: "bg-ink" },
        { k: "revlog", label: "复习日志", bytes: ls(REV_KEY), tone: "bg-ink-2" },
        ...(reg.list.length > 1 ? [{ k: "profiles", label: "其他档案", bytes: others, sub: `${reg.list.length - 1} 个`, tone: "bg-ink-3" }] : []),
        {
          k: "examples",
          label: "例句缓存",
          bytes: ls(EXAMPLES_KEY),
          sub: `${exN} 词`,
          tone: "bg-mark",
          clear: () => {
            const n = clearExamples();
            toast.success(`已清理 ${n} 个词的例句`, { description: "联网时会重新获取" });
          },
        },
      ];
      try {
        const m = await import("@/lib/snapshots");
        const u = await m.snapUsage();
        out.push({ k: "snaps", label: "自动快照", bytes: u.bytes, sub: `${u.n} 份`, tone: "bg-rule-strong" });
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
            tone: "bg-[color-mix(in_oklab,var(--mark)_55%,var(--ink-3))]",
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
          out.push({ k: "app", label: "离线应用文件", bytes: app.bytes, sub: `${app.n} 个文件 · 含词库`, tone: "bg-rule" });
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
    <Chapter n={7} id="ch-storage" title="存储管理" testid="storage-panel" intro="学习记录和日志不能在这里删；例句和发音缓存清掉后，联网时会重新获取。">
      {!rows ? (
        <div className="h-32 animate-pulse rounded-lg bg-paper-2" />
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="tnum font-serif text-[2.5rem] leading-none tracking-[-0.02em]" data-testid="storage-total">
              {fmtBytes(total)}
            </span>
            {est && (
              <span className="tnum text-right text-[0.75rem] leading-snug text-ink-3" data-testid="storage-quota">
                浏览器分配 {fmtBytes(est.quota)}，已用 {Math.max(0.1, Math.round((est.usage / est.quota) * 1000) / 10)}%
              </span>
            )}
          </div>
          {/* 一条分段的细线：深浅不同的墨色，不用彩虹色 */}
          <div className="mt-3 flex h-1.5 gap-px overflow-hidden bg-paper-2" aria-hidden>
            {rows.map((r) => (
              <div key={r.k} className={cn("h-full", r.tone)} style={{ width: `${total ? (r.bytes / total) * 100 : 0}%` }} />
            ))}
          </div>
          <table className="mt-3 w-full border-t border-rule text-left">
            <tbody>
              {rows.map((r) => (
                <tr key={r.k} className="border-b border-rule" data-testid={`storage-row-${r.k}`} data-bytes={r.bytes}>
                  <td className="w-4 py-2.5 align-middle">
                    <span className={cn("block size-2 rounded-[2px]", r.tone)} />
                  </td>
                  <td className="py-2.5">
                    <span className="block text-[0.875rem] font-medium leading-tight">{r.label}</span>
                    {r.sub && <span className="block text-[0.75rem] text-ink-3">{r.sub}</span>}
                  </td>
                  <td className="tnum whitespace-nowrap py-2.5 pl-2 text-right font-serif text-[1.0625rem]">{fmtBytes(r.bytes)}</td>
                  <td className="w-14 py-2.5 text-right">
                    {r.clear && (
                      <button
                        type="button"
                        data-testid={`storage-clear-${r.k}`}
                        onClick={async () => {
                          await r.clear!();
                          setTick((t) => t + 1);
                        }}
                        className={actClass("quiet") + " h-9 text-[0.75rem]"}
                      >
                        清理
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Chapter>
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
    <Chapter n={8} id="ch-rescue" title="救援时另存的原始数据" testid="rescue-dump">
      <p className="mb-4 border-l-2 border-vague pl-3 text-[0.8125rem] leading-relaxed text-ink-2">
        {at ? `${at} 救援时留下的一份。` : "救援时留下的一份。"}
        {restorable
          ? salvaged !== undefined
            ? `格式坏了，能读出 ${salvaged} 个词：可以导出成文件，或者把能读的部分恢复回来（会先让你选合并还是覆盖）。`
            : "可以导出成文件，或者恢复回来（会先让你选合并还是覆盖）。"
          : "坏得太厉害，一个词都读不出来，只能导出成文件留底（求助时可以发给开发者）。"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-testid="rescue-dump-export" onClick={() => download(`四级单词打卡-救援原始数据-${at || today()}.json`, raw)} className={actClass("secondary", true) + " h-11"}>
          导出
        </button>
        {/* 11.3 · 能恢复才显示「恢复」，不再放一个永远灰着的按钮 */}
        {restorable && (
          <button type="button" data-testid="rescue-dump-restore" onClick={() => setPending(raw)} className={actClass("secondary", true) + " h-11"}>
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
          className="press h-11 rounded-lg px-4 text-[0.875rem] font-semibold text-destructive hover:bg-destructive/10"
        >
          删除
        </button>
      </div>
      <ImportFlow text={pending} onDone={() => setPending(null)} />
    </Chapter>
  );
}

/** 11.2 · 「清空所有学习记录」从「高级」挪到数据中心最底部 */
function ResetPanel() {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  return (
    <section data-testid="reset-panel" className="border-t-2 border-destructive pt-4">
      <h2 className="text-[0.9375rem] font-semibold text-destructive">危险操作</h2>
      <p className="mt-1 text-[0.8125rem] text-ink-3">清空后无法恢复，先在第 1 章导出一份备份。</p>
      <button
        type="button"
        onClick={() => setConfirm(true)}
        data-testid="reset"
        className="press mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[0.875rem] font-semibold text-destructive ring-1 ring-destructive/40 ring-inset hover:bg-destructive/10"
      >
        清空所有学习记录
      </button>
      <BottomSheet open={confirm} onOpenChange={setConfirm} title="清空所有学习记录？" testid="reset-confirm">
        <p className="text-[0.875rem] leading-relaxed text-ink-2">这台设备上这个档案的学习记录、打卡、词单都会删掉，无法恢复。建议先导出备份。</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={() => setConfirm(false)} className={actClass("secondary", true) + " h-12"}>
            取消
          </button>
          <button
            type="button"
            data-testid="reset-yes"
            onClick={() => {
              resetAll();
              setConfirm(false);
              toast("已清空");
              // 11.8 · 用路由压引导页（带序号）：重新引导完成后能退回第一条 app 记录，首页按返回不再白按一次（r8 R8-5）
              navigate({ to: "/welcome" });
            }}
            className="press inline-flex h-12 flex-1 items-center justify-center rounded-lg bg-destructive text-[0.875rem] font-semibold text-destructive-foreground"
          >
            确认清空
          </button>
        </div>
      </BottomSheet>
    </section>
  );
}

// ---------------------------------------------------------------- 12.0 · 章节

const CHAPTERS = [
  { id: "ch-backup", title: "备份与恢复" },
  { id: "ch-snap", title: "自动快照" },
  { id: "ch-report", title: "学习报告图" },
  { id: "ch-wordfile", title: "导入词表" },
  { id: "ch-profiles", title: "学习档案" },
  { id: "ch-health", title: "数据体检" },
  { id: "ch-storage", title: "存储管理" },
];

/** 数据中心的一章：墨线 + 衬线章号 + 标题，下面一句说明 */
function Chapter({ n, id, title, aside, intro, testid, children }: { n: number; id: string; title: string; aside?: React.ReactNode; intro?: string; testid: string; children: React.ReactNode }) {
  return (
    <section id={id} data-testid={testid} className="min-w-0 scroll-mt-6 border-t border-ink pt-4">
      <div className="flex items-baseline gap-3">
        <span className="tnum w-6 shrink-0 font-serif text-[1.625rem] leading-none text-ink-3" aria-hidden>
          {n}
        </span>
        <h2 className="min-w-0 flex-1 text-[1.125rem] font-semibold tracking-[-0.01em]">{title}</h2>
        {aside && <span className="shrink-0 text-[0.75rem] text-ink-3">{aside}</span>}
      </div>
      {intro && <p className="mb-4 ml-9 mt-1.5 text-[0.8125rem] leading-relaxed text-ink-3">{intro}</p>}
      <div className={intro ? "" : "mt-4"}>{children}</div>
    </section>
  );
}
