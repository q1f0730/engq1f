import { Link, createFileRoute } from "@tanstack/react-router";
import { BellRing, CalendarDays, Ticket, ChevronRight, Download, FileUp, Gauge, Keyboard, Moon, RotateCcw, ShieldCheck, ShieldAlert, Sun, SunMoon } from "lucide-react";
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
import { daysUntil, effectiveExam, sprintPlan, upcomingExams } from "@/lib/exam";
import { MAKEUP_EVERY, MAKEUP_MAX, REST_OPTIONS, TIME_GOALS, WEEKDAY_CN, type GoalMode } from "@/lib/habit";
import { askNotify, badgeSupported, notifyPermission, notifySupported } from "@/lib/nudge";

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
  const exams = upcomingExams(day, 2);
  const exam = effectiveExam(day, s.examDate);
  const examPick = !exam.custom || s.examDate === exams[0].day ? 0 : s.examDate === exams[1].day ? 1 : 2;
  const plan = sprintPlan(day, exam.day, sum.newLeft);

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

          <Panel data-testid="exam-settings">
            <PanelTitle right={<span className="tnum text-[13px] font-bold text-primary" data-testid="me-exam-days">还有 {daysUntil(day, exam.day)} 天</span>}>四级考试</PanelTitle>
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
                  onChange={(e) => e.target.value && setSettings({ examDate: e.target.value })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="自定义考试日期"
                />
              </label>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-secondary/70 p-3" data-testid="me-sprint">
              <div className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">
                {plan.newLeft === 0 ? (
                  "新词已经全部学过，考前专心复习。"
                ) : (
                  <>
                    <b className="text-[14px] text-foreground">冲刺计划：每天 {plan.daily} 词</b>
                    <br />
                    {plan.tooMany ? `需要每天 ${plan.need} 词，超过最高档，建议换核心词书` : `${fmtDate(plan.finish)}学完 ${plan.newLeft} 个新词${plan.reserve ? `，最后 ${plan.reserve} 天只复习` : ""}`}
                  </>
                )}
              </div>
              {plan.newLeft > 0 && (
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
            <p className="mt-2 text-[12px] text-muted-foreground">未公布的场次按往年规律（6 月 / 12 月第二个周六）预估，以准考证为准。考试过后自动切到下一场。</p>
          </Panel>

          <HabitPanel />

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

/** v7 · 坚持与打卡：打卡标准、休息日、学习提醒、图标角标、补卡 */
function HabitPanel() {
  const st = useApp();
  const s = st.settings;
  const [perm, setPerm] = useState(notifyPermission());
  const remindOn = !!s.remindAt;
  const toggleRemind = async (on: boolean) => {
    if (!on) {
      setSettings({ remindAt: "" });
      return;
    }
    if (!notifySupported()) {
      toast.error("这个浏览器不支持通知");
      return;
    }
    const ok = await askNotify();
    setPerm(notifyPermission());
    if (!ok) {
      toast.error("没有通知权限，请在浏览器设置里允许通知");
      return;
    }
    setSettings({ remindAt: "20:00" });
    toast.success("每天 20:00 提醒你背单词");
  };
  return (
    <Panel data-testid="habit-settings" id="habit">
      <PanelTitle
        right={
          <span className="flex items-center gap-1 rounded-full bg-vague-soft px-2.5 py-1 text-[12px] font-bold text-vague" data-testid="me-makeup" data-n={st.makeup ?? 0}>
            <Ticket className="size-3.5" /> 补卡 {st.makeup ?? 0}/{MAKEUP_MAX}
          </span>
        }
      >
        坚持与打卡
      </PanelTitle>
      <Label>打卡标准</Label>
      <Segmented<GoalMode>
        value={s.goalMode ?? "words"}
        onChange={(v) => setSettings({ goalMode: v })}
        testid="goal-mode"
        options={[
          { value: "words", label: "完成新词和复习" },
          { value: "time", label: "学够时长" },
        ]}
      />
      {s.goalMode === "time" && (
        <div className="mt-2 grid grid-cols-3 gap-1.5" data-testid="goal-min">
          {TIME_GOALS.map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`goal-min-${m}`}
              onClick={() => setSettings({ goalMin: m })}
              className={cn(
                "tnum rounded-xl py-2 text-[14px] font-bold transition",
                s.goalMin === m ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {m} 分钟
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-[12px] text-muted-foreground">
        {s.goalMode === "time" ? `当天作答累计满 ${s.goalMin} 分钟即可打卡（每题最多计 1 分钟）。` : "当天新词达标、到期复习清零即可打卡。"}
      </p>

      <Label>每周休息日</Label>
      <div className="grid grid-cols-8 gap-1" data-testid="rest-day">
        {REST_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            data-testid={`rest-${d}`}
            aria-pressed={(s.restDay ?? -1) === d}
            onClick={() => setSettings({ restDay: d })}
            className={cn(
              "rounded-xl py-2 text-[13px] font-bold transition",
              (s.restDay ?? -1) === d ? (d < 0 ? "bg-foreground text-background" : "bg-know text-white dark:text-[oklch(0.2_0.02_170)]") : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {d < 0 ? "无" : WEEKDAY_CN[d]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">
        休息日不打卡也不断连续；每连续打卡 {MAKEUP_EVERY} 天得 1 张补卡（最多 {MAKEUP_MAX} 张），漏了昨天可以在今日页补上。
      </p>

      <div className="mt-3 border-t border-border/60 pt-1">
        <Row label="学习提醒" hint={perm === "denied" ? "通知被禁止了，需在浏览器设置里打开" : "应用开着或在后台时到点发通知"}>
          <div className="flex shrink-0 items-center gap-2">
            {remindOn && (
              <label className="relative flex items-center gap-1 rounded-xl bg-secondary px-2.5 py-1.5 text-[14px] font-bold tnum">
                <BellRing className="size-3.5 text-primary" />
                {s.remindAt}
                <input
                  type="time"
                  data-testid="remind-time"
                  value={s.remindAt}
                  onChange={(e) => e.target.value && setSettings({ remindAt: e.target.value })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="提醒时间"
                />
              </label>
            )}
            <Switch checked={remindOn} onCheckedChange={(v) => void toggleRemind(v)} aria-label="学习提醒" data-testid="remind-switch" />
          </div>
        </Row>
        <Row label="图标角标" hint={badgeSupported() ? "桌面图标上显示待复习数" : "这个浏览器不支持角标"}>
          <Switch checked={s.appBadge !== false} disabled={!badgeSupported()} onCheckedChange={(v) => setSettings({ appBadge: v })} aria-label="图标角标" data-testid="app-badge" />
        </Row>
      </div>
    </Panel>
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
