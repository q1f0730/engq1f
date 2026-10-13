import { finePointer } from "@/lib/pointer";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Accessibility, Database, Scale, BellRing, CalendarDays, Check, ChevronDown, Contrast, MonitorDown, SlidersHorizontal, Ticket, ChevronRight, Download, FileUp, Gauge, Keyboard, Moon, RotateCcw, ShieldCheck, ShieldAlert, Sun, SunMoon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { Logo, PageHeader, Panel, PanelTitle, Segmented, Spinner } from "@/components/app/shell";
import { BottomSheet } from "@/components/app/sheet";
import { ShortcutsSheet } from "@/components/app/shortcuts";
import { Switch } from "@/components/ui/switch";
import { today } from "@/lib/clock";
import { useWords } from "@/lib/data";
import { download, fmtDate } from "@/lib/format";
import { newWordsLeft, summarize } from "@/lib/plan";
import {
  DAILY_OPTIONS,
  REVIEW_CAP_OPTIONS,
  RATE_OPTIONS,
  exportBackup,
  markBackedUp,
  resetAll,
  setSettings,
  useApp,
  type Book,
  type Order,
  type Theme,
} from "@/lib/store";
import { usePersist } from "@/lib/persist";
import { capReach, daysUntil, effectiveExam, examAdvice, sprintPlan, upcomingExams } from "@/lib/exam";
import { MAKEUP_EVERY, MAKEUP_MAX, REST_OPTIONS, TIME_GOALS, WEEKDAY_CN, type GoalMode } from "@/lib/habit";
import { askNotify, badgeSupported, notifyPermission, notifySupported } from "@/lib/nudge";
import { FONT_LABEL, FONT_SIZES, MOTION_LABEL, type FontSize, type Motion } from "@/lib/ux";
import { isStandalone, promptInstall, useInstallPrompt } from "@/lib/install";
import { BASE_MODES, REVIEW_MODES, TIER_LONG, TIER_SHORT, toggleMode } from "@/lib/modes";
import { MODE_LABEL } from "@/lib/exam";
import { FIT_MIN, RETENTION_OPTIONS, balanceAll, fitInitialEase } from "@/lib/algo";
import { diffDays, retentionScale } from "@/lib/srs";
import { getState, replaceCards } from "@/lib/store";
import { ImportFlow } from "@/components/app/import-flow";
import { ACTIVE_PROFILE, readRegistry } from "@/lib/profiles";

const APP_VERSION = __APP_VERSION__;
import { cn } from "@/lib/utils";

import { AdvancedBody, LabLink, ADV_KEY, RemindRow, PrefsPanel, HabitPanel, ModesPanel, AlgoPanel, A11yPanel, Label, Row, ActionBtn } from "@/components/app/settings-panels";
import { readAdvOpen } from "@/components/app/settings-panels";

export const Route = createFileRoute("/me")({ component: MePage });

function MePage() {
  const { index } = useWords();
  const st = useApp();
  const [help, setHelp] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const persist = usePersist();
  // 旧会话里记住的「高级」就地展开状态（11.2 起「高级」是二级页）
  const [adv] = useState(() => readAdvOpen());
  if (!index) return <Spinner />;
  const s = st.settings;
  const day = today();
  const sum = summarize(index, st, day);
  const exams = upcomingExams(day, 2);
  const exam = effectiveExam(day, s.examDate);
  const examPick = !exam.custom || s.examDate === exams[0].day ? 0 : s.examDate === exams[1].day ? 1 : 2;
  const plan = sprintPlan(day, exam.day, sum.newLeft);
  // 11.3 · 全部词每天要 >50 个：推荐改学核心词（和首页冲刺卡、引导同一条规则），不推荐 95 个 / 天
  const coreNewLeft = s.book === "core" ? sum.newLeft : newWordsLeft(index, { ...st, settings: { ...s, book: "core" } }, day).length;
  const examAdv = examAdvice(day, exam.day, { book: s.book, daily: s.daily, newLeft: sum.newLeft, coreNewLeft });
  const sw = examAdv?.kind === "switch" ? examAdv : null;

  const reg = readRegistry();
  const profile = reg.list.find((p) => p.id === ACTIVE_PROFILE);
  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPending(await f.text());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (file.current) file.current.value = "";
    }
  };

  const dailyOpts = [...new Set([...DAILY_OPTIONS, s.daily])].sort((x, y) => x - y);
  const backupLine = st.lastBackup ? (diffDays(st.lastBackup, day) === 0 ? "今天" : `${diffDays(st.lastBackup, day)} 天前`) : null;

  return (
    <div data-testid="me">
      <PageHeader title="我的" sub="设置与数据" />
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <div className="min-w-0 space-y-4 md:space-y-5">
          {/* 11.1 · 顶层只留最常用的 8 项：考试日期、每日新词、复习上限、提醒、发音、外观、数据与备份、关于 */}
          <Panel data-testid="plan-settings">
            <PanelTitle right={<span className="tnum text-[13px] font-bold text-primary" data-testid="me-exam-days">还有 {daysUntil(day, exam.day)} 天</span>}>考试日期</PanelTitle>
            <div data-testid="exam-settings">
            <div className="grid grid-cols-3 gap-1.5" data-testid="exam-options">
              {exams.map((e, k) => (
                <button
                  key={e.day}
                  type="button"
                  data-testid={`exam-opt-${k}`}
                  onClick={() => setSettings({ examDate: k === 0 ? "" : e.day })}
                  className={cn(
                    "rounded-xl px-1 py-2 text-center transition",
                    examPick === k ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="tnum block text-[14px] font-bold">{fmtDate(e.day)}</span>
                  <span className="block text-[11px] opacity-80">{e.day.slice(0, 4)} · {e.official ? "官方" : "预估"}</span>
                </button>
              ))}
              <label
                className={cn(
                  "relative flex cursor-pointer flex-col items-center justify-center rounded-xl px-1 py-2 text-center transition",
                  examPick === 2 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-1 text-[14px] font-bold">
                  <CalendarDays className="size-3.5" />
                  {examPick === 2 ? fmtDate(exam.day) : "自定义"}
                </span>
                <span className="block text-[11px] opacity-80">{examPick === 2 ? exam.day.slice(0, 4) : "选日期"}</span>
                <input
                  type="date"
                  data-testid="exam-custom"
                  min={day}
                  value={examPick === 2 ? exam.day : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    // 11.2 · 过去的日期不收（不再静默存进去、界面却显示另一场）
                    if (v < day) {
                      toast.error("考试日期不能早于今天", { id: "exam-past" });
                      return;
                    }
                    setSettings({ examDate: v });
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="自定义考试日期"
                />
              </label>
            </div>
            </div>
            {/* 11.3 · 词书决定「赶不赶得上考试」：放在顶层，紧挨着考试日期 */}
            <Label>词书</Label>
            <Segmented<Book>
              value={s.book}
              onChange={(v) => {
                setSettings({ book: v });
                toast.success(v === "core" ? `改学核心词（${index.coreCount} 个）` : `改学全部词（${index.list.length} 个）`);
              }}
              testid="me-book"
              options={[
                { value: "core", label: `核心词 ${index.coreCount}` },
                { value: "all", label: `全部词 ${index.list.length}` },
              ]}
            />
            <Label>每日新词</Label>
            <div className={cn("grid gap-1.5", dailyOpts.length > 6 ? "grid-cols-7" : "grid-cols-6")} data-testid="daily">
              {dailyOpts.map((n) => (
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
            <div className="mt-2 flex items-center gap-3 rounded-2xl bg-secondary/70 p-3" data-testid="me-sprint">
              <div className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">
                {plan.newLeft === 0 ? (
                  "新词已经全部学过，考前专心复习。"
                ) : sum.examMode ? (
                  "考前模式：只复习学过的词，不再排新词。"
                ) : sw ? (
                  <>
                    <b className="text-[14px] text-foreground">按考试算：改学核心词，每天 {sw.to} 个</b>
                    <br />
                    全部词每天要 {sw.need} 个才学得完{sw.to < sw.target ? `；核心词先每天 ${sw.to} 个，适应了再加到 ${sw.target} 个` : `；核心词${fmtDate(sw.finish)}学完`}
                  </>
                ) : plan.tooMany ? (
                  <>
                    <b className="text-[14px] text-foreground">每天 100 个，考前能学 {capReach(day, exam.day, plan.newLeft)} 个</b>
                    <br />
                    剩下的 {plan.newLeft - capReach(day, exam.day, plan.newLeft)} 个考前来不及
                  </>
                ) : (
                  <>
                    <b className="text-[14px] text-foreground">按考试算：每天 {plan.daily} 个</b>
                    <br />
                    {fmtDate(plan.finish)}学完剩下 {plan.newLeft} 个{plan.spare ? `，考前留 ${plan.spare} 天复习` : ""}
                  </>
                )}
              </div>
              {plan.newLeft > 0 && !sum.examMode && sw && (
                <button
                  type="button"
                  data-testid="me-sprint-apply"
                  data-core="1"
                  onClick={() => {
                    setSettings({ book: "core", daily: sw.to });
                    toast.success(`改学核心词，每天 ${sw.to} 个`);
                  }}
                  className="shrink-0 rounded-full bg-primary px-3.5 py-2 text-[13px] font-bold text-primary-foreground"
                >
                  改学核心词
                </button>
              )}
              {plan.newLeft > 0 && !sum.examMode && !sw && (
                <button
                  type="button"
                  data-testid="me-sprint-apply"
                  disabled={s.daily === plan.daily}
                  onClick={() => {
                    setSettings({ daily: plan.daily });
                    toast.success(`每日新词改为 ${plan.daily}`);
                  }}
                  className="shrink-0 rounded-full bg-primary px-3.5 py-2 text-[13px] font-bold text-primary-foreground disabled:bg-know-soft disabled:text-know"
                >
                  {s.daily === plan.daily ? "已应用" : "一键应用"}
                </button>
              )}
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
            <p className="mt-2 text-[12px] text-muted-foreground">
              今天要复习 {sum.due} 个{sum.deferred > 0 ? `，另有 ${sum.deferred} 个顺延` : ""}。上限只是把超出的词往后排，不会丢。
            </p>
          </Panel>

          <Panel>
            <RemindRow />
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
            <Row label="外观" hint={s.theme === "contrast" ? "高对比度：文字与边框 ≥ 7:1" : undefined}>
              <Segmented<Theme>
                className="w-56 shrink-0"
                value={s.theme}
                onChange={(v) => setSettings({ theme: v })}
                testid="theme"
                options={[
                  { value: "light", label: <Sun className="mx-auto size-4" aria-label="浅色" /> },
                  { value: "dark", label: <Moon className="mx-auto size-4" aria-label="深色" /> },
                  { value: "contrast", label: <Contrast className="mx-auto size-4" aria-label="高对比度" /> },
                  { value: "system", label: <SunMoon className="mx-auto size-4" aria-label="跟随系统" /> },
                ]}
              />
            </Row>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4 md:space-y-5">
          <Panel data-testid="data-panel">
            <PanelTitle
              right={
                reg.list.length > 1 && profile ? (
                  <span className="max-w-[45%] truncate rounded-full bg-brand-soft px-2.5 py-1 text-[12px] font-bold text-primary" data-testid="me-profile">
                    {profile.name}
                  </span>
                ) : undefined
              }
            >
              数据与备份
            </PanelTitle>
            {/* 11.1 · 只说当前这一种状态，一句话，不做成像按钮的 chip */}
            <p className="-mt-1 mb-3 flex items-start gap-2 text-[13px] leading-snug text-muted-foreground" data-testid="data-status">
              {persist === "persisted" ? <ShieldCheck className="mt-px size-4 shrink-0 text-know" /> : <ShieldAlert className="mt-px size-4 shrink-0 text-vague" />}
              <span>
                <span data-testid="last-backup" className={cn("font-semibold", backupLine ? "text-foreground" : "text-vague")}>
                  {backupLine ? `上次备份：${backupLine}` : "还没备份过"}
                </span>
                <span data-testid="persist-status" data-state={persist ?? "pending"}>
                  {persist === "persisted" ? " · 存储已锁定，系统不会自动清理。" : persist === null ? " · 正在检查存储…" : " · 记录只存在这台手机上，浏览器空间紧张时可能被清理，建议定期备份。"}
                </span>
              </span>
            </p>
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
            <Link
              to="/data"
              data-testid="go-data"
              className="mt-2 flex items-center gap-3 rounded-2xl bg-brand-soft px-4 py-3 text-left transition hover:brightness-[0.98]"
            >
              <Database className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <b className="block text-[14px]">数据中心</b>
                <span className="block truncate text-[12px] text-muted-foreground">快照回滚 · 合并两台设备 · 加密备份 · 学习档案</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </Panel>

          {/* 11.2 · 「高级」是二级页（不再就地展开成一长串）；算法开关在三级页「算法实验室」 */}
          <Panel className="p-0" data-testid="adv">
            <Link to="/advanced" data-testid="adv-toggle" className="flex w-full items-center gap-3 px-5 py-4 text-left">
              <SlidersHorizontal className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <b className="block text-[15px]">高级</b>
                <span className="block truncate text-[12px] text-muted-foreground">词书与顺序 · 打卡规则 · 题型 · 字号与无障碍</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </Panel>

          {adv && <AdvancedBody full onHelp={() => setHelp(true)} />}

          <Panel data-testid="about">
            <div className="flex items-center gap-3">
              <Logo className="size-11" />
              <div>
                <div className="text-[15px] font-bold">四级单词打卡</div>
                <div className="text-[12px] text-muted-foreground">免费 · 无广告 · 离线可用 · 作者 Q1f730</div>
                <div className="tnum mt-0.5 text-[12px] font-semibold text-muted-foreground" data-testid="app-version">版本 v{APP_VERSION}</div>
              </div>
            </div>
            <details className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              <summary className="cursor-pointer font-semibold">数据来源与开源协议</summary>
              <div className="mt-2 space-y-1.5">
                <p>词表与释义：KyleBing/english-vocabulary（BSD-3-Clause）</p>
                <p>音标：qwerty-learner 词典数据（GPL-3.0）</p>
                <p>发音：有道词典 dictvoice，离线时使用系统语音</p>
                <p>例句：Free Dictionary API（dictionaryapi.dev）</p>
                <p>本应用以 GPL-3.0 开源</p>
              </div>
            </details>
          </Panel>
        </div>
      </div>

      <ShortcutsSheet open={help} onOpenChange={setHelp} />
      <ImportFlow text={pending} onDone={() => setPending(null)} />
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
