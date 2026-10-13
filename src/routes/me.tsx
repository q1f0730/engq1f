import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Download, FileUp, Gauge, Keyboard, Moon, RotateCcw, ShieldCheck, ShieldAlert, Sun, SunMoon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Logo, PageHeader, Panel, PanelTitle, Segmented, Spinner } from "@/components/app/shell";
import { BottomSheet } from "@/components/app/sheet";
import { ShortcutsSheet } from "@/components/app/shortcuts";
import { Switch } from "@/components/ui/switch";
import { today } from "@/lib/clock";
import { useWords } from "@/lib/data";
import { download, fmtDate } from "@/lib/format";
import { summarize } from "@/lib/plan";
import {
  DAILY_OPTIONS,
  REVIEW_CAP_OPTIONS,
  RATE_OPTIONS,
  exportBackup,
  importBackup,
  markBackedUp,
  resetAll,
  setSettings,
  useApp,
  type Book,
  type Order,
  type Theme,
} from "@/lib/store";
import { usePersist } from "@/lib/persist";

const APP_VERSION = __APP_VERSION__;
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/me")({ component: MePage });

function MePage() {
  const { index } = useWords();
  const st = useApp();
  const [help, setHelp] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const persist = usePersist();
  if (!index) return <Spinner />;
  const s = st.settings;
  const day = today();
  const sum = summarize(index, st, day);

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const next = importBackup(await f.text());
      toast.success(`已恢复备份：${Object.keys(next.cards).length} 个学习记录`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (file.current) file.current.value = "";
    }
  };

  return (
    <div data-testid="me">
      <PageHeader title="我的" sub="设置与数据" />
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <div className="min-w-0 space-y-4 md:space-y-5">
          <Panel data-testid="plan-settings">
            <PanelTitle>学习计划</PanelTitle>
            <Label>词书</Label>
            <Segmented<Book>
              value={s.book}
              onChange={(v) => setSettings({ book: v })}
              testid="book"
              options={[
                { value: "all", label: `全部 ${index.list.length}` },
                { value: "core", label: `核心 ${index.coreCount}` },
              ]}
            />
            <Label>学习顺序</Label>
            <Segmented<Order>
              value={s.order}
              onChange={(v) => setSettings({ order: v })}
              testid="order"
              options={[
                { value: "core", label: "核心优先" },
                { value: "alpha", label: "字母顺序" },
                { value: "random", label: "乱序" },
              ]}
            />
            <Label>每日新词</Label>
            <div className="grid grid-cols-6 gap-1.5" data-testid="daily">
              {DAILY_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSettings({ daily: n })}
                  className={cn(
                    "tnum rounded-xl py-2 text-[14px] font-bold transition",
                    s.daily === n ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <Label>每日复习上限</Label>
            <div className="grid grid-cols-4 gap-1.5" data-testid="review-cap">
              {REVIEW_CAP_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  data-testid={`cap-${n}`}
                  onClick={() => setSettings({ reviewCap: n })}
                  className={cn(
                    "tnum rounded-xl py-2 text-[14px] font-bold transition",
                    (s.reviewCap ?? 0) === n ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                >
                  {n === 0 ? "不限" : n}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-muted-foreground">
              还剩 {sum.newLeft} 个新词，{sum.newLeft ? `预计 ${fmtDate(sum.finish, true)} 学完` : "已经全部学过"}；今天要复习 {sum.due} 个
              {sum.deferred > 0 ? `，另有 ${sum.deferred} 个顺延` : ""}。复习上限只是把超出的词往后排，不会丢。
            </p>
          </Panel>

          <Panel>
            <PanelTitle>学习偏好</PanelTitle>
            <Row label="发音">
              <Segmented
                className="w-36"
                value={s.accent}
                onChange={(v) => setSettings({ accent: v })}
                options={[
                  { value: "us", label: "美音" },
                  { value: "uk", label: "英音" },
                ]}
              />
            </Row>
            <Row label="发音语速" hint="含例句、磁带">
              <Segmented<number>
                className="w-52 shrink-0"
                value={s.rate ?? 1}
                onChange={(v) => setSettings({ rate: v })}
                testid="rate"
                options={RATE_OPTIONS.map((v) => ({ value: v, label: `${v}×` }))}
              />
            </Row>
            <Row label="自动发音" hint="出现新卡片时自动朗读">
              <Switch checked={s.autoplay} onCheckedChange={(v) => setSettings({ autoplay: v })} aria-label="自动发音" />
            </Row>
            <Row label="中文优先" hint="卡片正面显示释义，回想英文">
              <Switch checked={s.cnFirst} onCheckedChange={(v) => setSettings({ cnFirst: v })} aria-label="中文优先" data-testid="cn-first" />
            </Row>
            <Row label="震动反馈" hint="答对轻震，答错双震">
              <Switch checked={s.haptics ?? true} onCheckedChange={(v) => setSettings({ haptics: v })} aria-label="震动反馈" data-testid="haptics" />
            </Row>
            <Row label="屏幕常亮" hint="学习和磁带模式时不自动熄屏">
              <Switch checked={s.wakeLock ?? true} onCheckedChange={(v) => setSettings({ wakeLock: v })} aria-label="屏幕常亮" data-testid="wake-lock" />
            </Row>
            <Row label="外观">
              <Segmented<Theme>
                className="w-44"
                value={s.theme}
                onChange={(v) => setSettings({ theme: v })}
                testid="theme"
                options={[
                  { value: "light", label: <Sun className="mx-auto size-4" aria-label="浅色" /> },
                  { value: "dark", label: <Moon className="mx-auto size-4" aria-label="深色" /> },
                  { value: "system", label: <SunMoon className="mx-auto size-4" aria-label="跟随系统" /> },
                ]}
              />
            </Row>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4 md:space-y-5">
          <Link to="/test" data-testid="go-test" className="block">
            <Panel className="flex items-center gap-4 transition hover:border-primary/40">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary">
                <Gauge className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold">词汇量测试</div>
                <div className="text-[13px] text-muted-foreground">
                  {st.test ? `上次估算约 ${st.test.est} 词（${fmtDate(st.test.at)}）` : "3 分钟估算词汇量，跳过已经会的词"}
                </div>
              </div>
              <ChevronRight className="size-5 text-muted-foreground" />
            </Panel>
          </Link>

          <Panel>
            <PanelTitle>数据</PanelTitle>
            <p className="-mt-1 mb-3 text-[13px] text-muted-foreground">不用注册，记录只存在这台设备上。换设备前先导出备份。</p>
            <div className="mb-3 grid grid-cols-2 gap-2 text-[12px]" data-testid="data-status">
              <div className={cn("flex items-center gap-2 rounded-2xl px-3 py-2.5", persist === "persisted" ? "bg-know-soft text-know" : "bg-secondary text-muted-foreground")} data-testid="persist-status" data-state={persist ?? "pending"}>
                {persist === "persisted" ? <ShieldCheck className="size-4 shrink-0" /> : <ShieldAlert className="size-4 shrink-0" />}
                <span className="min-w-0 leading-tight">
                  <b className="block text-[13px]">{persist === "persisted" ? "存储已锁定" : persist === null ? "检查中…" : "可能被清理"}</b>
                  {persist === "persisted" ? "系统不会自动清理" : "建议定期备份"}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2.5 text-muted-foreground" data-testid="last-backup">
                <Download className="size-4 shrink-0" />
                <span className="min-w-0 leading-tight">
                  <b className="block text-[13px] text-foreground">{st.lastBackup ? fmtDate(st.lastBackup) : "从未备份"}</b>
                  上次备份
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ActionBtn
                testid="export"
                icon={<Download className="size-4" />}
                label="导出备份"
                onClick={() => {
                  download(`四级单词打卡-备份-${day}.json`, exportBackup());
                  markBackedUp(day);
                  toast.success("备份已导出");
                }}
              />
              <ActionBtn testid="import" icon={<FileUp className="size-4" />} label="导入备份" onClick={() => file.current?.click()} />
            </div>
            <input ref={file} type="file" accept="application/json,.json" className="hidden" data-testid="import-file" onChange={(e) => onImport(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => setConfirm(true)}
              data-testid="reset"
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-semibold text-destructive hover:bg-destructive/10"
            >
              <RotateCcw className="size-4" /> 清空所有学习记录
            </button>
          </Panel>

          <Panel>
            <button type="button" onClick={() => setHelp(true)} className="flex w-full items-center gap-3 text-left" data-testid="open-shortcuts">
              <Keyboard className="size-5 text-muted-foreground" />
              <span className="flex-1 text-[15px] font-semibold">键盘快捷键</span>
              <ChevronRight className="size-5 text-muted-foreground" />
            </button>
          </Panel>

          <Panel data-testid="about">
            <div className="flex items-center gap-3">
              <Logo className="size-11" />
              <div>
                <div className="text-[15px] font-bold">四级单词打卡</div>
                <div className="text-[12px] text-muted-foreground">免费 · 无广告 · 离线可用 · 作者 Q1f730</div>
                <div className="tnum mt-0.5 text-[12px] font-semibold text-muted-foreground" data-testid="app-version">版本 v{APP_VERSION}</div>
              </div>
            </div>
            <div className="mt-4 space-y-1.5 text-[12px] leading-relaxed text-muted-foreground">
              <p>词表与释义：KyleBing/english-vocabulary（BSD-3-Clause）</p>
              <p>音标：qwerty-learner 词典数据（GPL-3.0）</p>
              <p>发音：有道词典 dictvoice，离线时使用系统语音</p>
            </div>
          </Panel>
        </div>
      </div>

      <ShortcutsSheet open={help} onOpenChange={setHelp} />
      <BottomSheet open={confirm} onOpenChange={setConfirm} title="清空所有学习记录？" testid="reset-confirm">
        <p className="text-[14px] text-muted-foreground">学习进度、打卡、生词本都会被删除，且无法恢复。建议先导出备份。</p>
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
            className="h-12 rounded-2xl bg-destructive font-semibold text-destructive-foreground"
          >
            确认清空
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 mt-4 text-[12px] font-bold tracking-wider text-muted-foreground first:mt-0">{children}</div>;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3 last:border-0 last:pb-0 first:pt-0">
      <div className="min-w-0">
        <div className="text-[15px] font-medium">{label}</div>
        {hint && <div className="text-[12px] text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function ActionBtn({ icon, label, onClick, testid }: { icon: React.ReactNode; label: string; onClick: () => void; testid?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-secondary text-[14px] font-semibold hover:bg-accent">
      {icon}
      {label}
    </button>
  );
}
