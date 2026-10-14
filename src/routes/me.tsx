import { finePointer } from "@/lib/pointer";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Check, Contrast, Download, FileUp, Moon, Sun, SunMoon } from "@/components/app/icons";
import { useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { Logo, PageHeader, Segmented, Spinner } from "@/components/app/shell";
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
  markPaceOk,
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
import { addDays, diffDays, finishDate, retentionScale } from "@/lib/srs";
import { getState, replaceCards } from "@/lib/store";
import { ImportFlow } from "@/components/app/import-flow";
import { ACTIVE_PROFILE, readRegistry } from "@/lib/profiles";

const APP_VERSION = __APP_VERSION__;
import { cn } from "@/lib/utils";

import { AdvancedBody, RemindRow, Label, ActionBtn } from "@/components/app/settings-panels";
import { Entry, Field, Sec, Tag, Ticks, actClass } from "@/components/app/kit";
import { readAdvOpen } from "@/components/app/settings-panels";

export const Route = createFileRoute("/me")({ component: MePage });

function MePage() {
  const navigate = useNavigate();
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
  // 11.5 · 日期在未来（手机时间被调过）也写「今天」，不出现「-N 天前」
  const backupLine = st.lastBackup ? (diffDays(st.lastBackup, day) <= 0 ? "今天" : `${diffDays(st.lastBackup, day)} 天前`) : null;

  return (
    <div data-testid="me">
      <PageHeader title="我的" sub="设置与数据" />
      <div className="grid gap-10 md:grid-cols-2 md:gap-x-10">
        <div className="min-w-0 space-y-10">
          {/* 11.1 · 顶层只留最常用的 8 项：考试日期、每日新词、复习上限、提醒、发音、外观、数据与备份、关于 */}
          <Sec
            title="考试与计划"
            testid="plan-settings"
            aside={
              <span className="tnum text-[0.8125rem] text-ink-2" data-testid="me-exam-days">
                还有 <b className="font-serif text-[1.25rem] font-normal text-ink">{daysUntil(day, exam.day)}</b> 天
              </span>
            }
          >
            {/* 考试日期：三行，像目录里的条目；选中的那一行左边一道墨线 */}
            <div data-testid="exam-settings">
              <div className="border-t border-rule" data-testid="exam-options" role="radiogroup" aria-label="考试日期">
                {exams.map((e, k) => (
                  <button
                    key={e.day}
                    type="button"
                    role="radio"
                    aria-checked={examPick === k}
                    data-testid={`exam-opt-${k}`}
                    onClick={() => setSettings({ examDate: k === 0 ? "" : e.day })}
                    className={cn(
                      "press relative flex min-h-12 w-full items-baseline gap-3 border-b border-rule py-2.5 pl-4 pr-1 text-left",
                      examPick === k ? "text-ink" : "text-ink-3 hover:text-ink",
                    )}
                  >
                    {examPick === k && <span className="absolute inset-y-2 left-0 w-[3px] bg-ink" aria-hidden />}
                    <span className={cn("tnum font-serif text-[1.375rem] leading-none", examPick === k && "hl")}>{fmtDate(e.day)}</span>
                    <span className="text-[0.75rem]">
                      {e.day.slice(0, 4)} · {e.official ? "官方" : "预估"}
                    </span>
                    {examPick === k && <Check className="ml-auto size-4 self-center" strokeWidth={2.4} />}
                  </button>
                ))}
                <label
                  className={cn(
                    "press relative flex min-h-12 w-full cursor-pointer items-baseline gap-3 border-b border-rule py-2.5 pl-4 pr-1",
                    examPick === 2 ? "text-ink" : "text-ink-3 hover:text-ink",
                  )}
                >
                  {examPick === 2 && <span className="absolute inset-y-2 left-0 w-[3px] bg-ink" aria-hidden />}
                  <span className={cn("leading-none", examPick === 2 ? "hl tnum font-serif text-[1.375rem]" : "text-[0.9375rem] font-medium")}>
                    {examPick === 2 ? fmtDate(exam.day) : "自定义"}
                  </span>
                  <span className="text-[0.75rem]">{examPick === 2 ? `${exam.day.slice(0, 4)} · 自定` : "选一个日期"}</span>
                  <CalendarDays className="ml-auto size-4 self-center" />
                  <input
                    type="date"
                    data-testid="exam-custom"
                    min={addDays(day, 1)}
                    value={examPick === 2 ? exam.day : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      // 11.2 · 过去的日期不收（不再静默存进去、界面却显示另一场）
                      if (v < day) {
                        toast.error("考试日期不能早于今天", { id: "exam-past" });
                        return;
                      }
                      // 11.5 · 考试日最早选明天：当天才设成今天，不能让今天变成「不用打卡」的考试日
                      if (v === day) {
                        toast.error("考试日期最早选明天", { id: "exam-past", description: "今天就考的话，祝你顺利；今天的打卡照常算" });
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
            <div className="flex border-y border-rule" data-testid="daily">
              {dailyOpts.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={s.daily === n}
                  onClick={() => {
                    setSettings({ daily: n });
                    // 11.4 · 知情选了考后才学完的量：首页先不劝加量
                    markPaceOk(sum.newLeft > 0 && finishDate(day, sum.newLeft, n) > exam.day ? day : undefined);
                  }}
                  className={cn(
                    "press relative min-w-0 flex-1 border-l border-rule py-2.5 font-serif text-[1.3125rem] leading-none tnum first:border-l-0",
                    s.daily === n ? "text-ink after:absolute after:inset-x-0 after:-top-px after:h-[2px] after:bg-ink" : "text-ink-3 hover:text-ink",
                  )}
                >
                  <span className={cn("px-0.5", s.daily === n && "hl")}>{n}</span>
                </button>
              ))}
            </div>
            {/* 按考试算的建议：一条边注，左边一道荧光笔 */}
            <div className="mt-3 flex flex-col items-start gap-2.5 border-l-2 border-mark py-1 pl-3" data-testid="me-sprint">
              <div className="min-w-0 text-[0.8125rem] leading-relaxed text-ink-2">
                {plan.newLeft === 0 ? (
                  "新词已经全部学过，考前专心复习。"
                ) : sum.examMode ? (
                  "考前模式：只复习学过的词，不再排新词。"
                ) : sw ? (
                  <>
                    <b className="block text-[0.875rem] font-semibold text-ink">按考试算：改学核心词，每天 {sw.to} 个</b>
                    全部词每天要 {sw.need} 个才学得完{sw.to < sw.target ? `；核心词先每天 ${sw.to} 个，适应了再加到 ${sw.target} 个` : `；核心词${fmtDate(sw.finish)}学完`}
                  </>
                ) : plan.tooMany ? (
                  <>
                    <b className="block text-[0.875rem] font-semibold text-ink">每天 100 个，考前能学 {capReach(day, exam.day, plan.newLeft)} 个</b>
                    剩下的 {plan.newLeft - capReach(day, exam.day, plan.newLeft)} 个考前来不及
                  </>
                ) : (
                  <>
                    <b className="block text-[0.875rem] font-semibold text-ink">按考试算：每天 {plan.daily} 个</b>
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
                  className={actClass("primary") + " h-9 shrink-0 px-3 text-[0.8125rem]"}
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
                  className={cn(actClass("primary"), "h-9 shrink-0 px-3 text-[0.8125rem] disabled:bg-transparent disabled:text-know disabled:ring-1 disabled:ring-inset disabled:ring-know")}
                >
                  {s.daily === plan.daily ? "已应用" : "一键应用"}
                </button>
              )}
            </div>
            <Label>每日复习上限</Label>
            <Ticks<number>
              value={s.reviewCap ?? 0}
              onPick={(n) => setSettings({ reviewCap: n })}
              testid="review-cap"
              idOf={(n) => `cap-${n}`}
              options={REVIEW_CAP_OPTIONS.map((n) => ({ value: n, label: n === 0 ? <span className="font-sans text-[0.875rem] font-medium">不限</span> : n }))}
            />
            <p className="mt-2.5 text-[0.75rem] leading-relaxed text-ink-3">
              今天要复习 {sum.due} 个{sum.deferred > 0 ? `，另有 ${sum.deferred} 个顺延` : ""}。上限只是把超出的词往后排，不会丢。
            </p>
          </Sec>

          <Sec title="提醒与外观">
            <div className="border-t border-rule">
              <RemindRow />
              <Field label="发音">
                <Segmented
                  className="w-36 shrink-0"
                  value={s.accent}
                  onChange={(v) => setSettings({ accent: v })}
                  options={[
                    { value: "us", label: "美音" },
                    { value: "uk", label: "英音" },
                  ]}
                />
              </Field>
              <Field label="外观" hint={s.theme === "contrast" ? "高对比度：文字与边框 ≥ 7:1" : THEME_NAME[s.theme]}>
                <Segmented<Theme>
                  className="w-44 shrink-0"
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
              </Field>
            </div>
          </Sec>
        </div>

        <div className="min-w-0 space-y-10">
          <Sec
            title="数据与备份"
            testid="data-panel"
            aside={
              reg.list.length > 1 && profile ? (
                <Tag tone="mark" className="max-w-[10rem] truncate" data-testid="me-profile">
                  {profile.name}
                </Tag>
              ) : undefined
            }
          >
            {/* 11.1 · 只说当前这一种状态，一句话，不做成像按钮的 chip */}
            <p className="mb-4 text-[0.8125rem] leading-relaxed text-ink-3" data-testid="data-status">
              <span className={cn("mr-2 inline-block size-2 rounded-[2px] align-middle", persist === "persisted" ? "bg-know" : "bg-vague")} aria-hidden />
              <span data-testid="last-backup" className={cn("font-semibold", backupLine ? "text-ink" : "text-vague")}>
                {backupLine ? `上次备份：${backupLine}` : "还没备份过"}
              </span>
              <span data-testid="persist-status" data-state={persist ?? "pending"}>
                {persist === "persisted" ? " · 存储已锁定，系统不会自动清理。" : persist === null ? " · 正在检查存储…" : " · 记录只存在这台手机上，浏览器空间紧张时可能被清理，建议定期备份。"}
              </span>
            </p>
            <div className="flex gap-2">
              <ActionBtn
                testid="export"
                icon={<Download />}
                label="导出备份"
                onClick={() => {
                  download(`四级单词打卡-备份-${day}.json`, exportBackup(true));
                  markBackedUp(day);
                  toast.success("备份已导出");
                }}
              />
              <ActionBtn testid="import" icon={<FileUp />} label="导入备份" onClick={() => file.current?.click()} />
            </div>
            <input ref={file} type="file" accept="application/json,.json" className="hidden" data-testid="import-file" onChange={(e) => onImport(e.target.files?.[0])} />
            <div className="mt-4 border-t border-rule">
              <Entry to="/data" data-testid="go-data" title="数据中心" sub="快照回滚 · 合并两台设备 · 加密备份 · 学习档案" />
            </div>
          </Sec>

          {/* 11.2 · 「高级」是二级页（不再就地展开成一长串）；算法开关在三级页「算法实验室」 */}
          <section data-testid="adv" className="-mt-6 border-t border-rule">
            <Entry to="/advanced" data-testid="adv-toggle" title="高级" sub="词书与顺序 · 打卡规则 · 题型 · 字号与无障碍" />
          </section>

          {adv && <AdvancedBody full onHelp={() => setHelp(true)} />}

          {/* 关于：像一本书的版权页 */}
          <section data-testid="about" className="border-t border-ink pt-5">
            <div className="flex items-baseline gap-3">
              <Logo className="size-9 shrink-0 self-center" />
              <div className="min-w-0 flex-1">
                <div className="text-[0.9375rem] font-semibold">四级单词打卡</div>
                <div className="text-[0.75rem] text-ink-3">免费 · 无广告 · 离线可用 · 作者 Q1f730</div>
              </div>
              <span className="tnum shrink-0 font-serif text-[1.125rem] italic text-ink-2" data-testid="app-version">
                版本 v{APP_VERSION}
              </span>
            </div>
            <details className="group mt-4 border-t border-rule pt-3 text-[0.75rem] leading-relaxed text-ink-3">
              <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between font-medium text-ink-2">
                数据来源与开源协议
                <span aria-hidden className="font-serif text-[1.125rem] leading-none transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <dl className="mt-2 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5">
                <dt>词表与释义</dt>
                <dd>KyleBing/english-vocabulary（BSD-3-Clause）</dd>
                <dt>音标</dt>
                <dd>qwerty-learner 词典数据（GPL-3.0）</dd>
                <dt>发音</dt>
                <dd>有道词典 dictvoice，离线时使用系统语音</dd>
                <dt>例句</dt>
                <dd>Free Dictionary API（dictionaryapi.dev）</dd>
                <dt>本应用</dt>
                <dd>以 GPL-3.0 开源</dd>
              </dl>
            </details>
          </section>
        </div>
      </div>

      <ShortcutsSheet open={help} onOpenChange={setHelp} />
      <ImportFlow text={pending} onDone={() => setPending(null)} />
      <BottomSheet open={confirm} onOpenChange={setConfirm} title="清空所有学习记录？" testid="reset-confirm">
        <p className="text-[0.875rem] leading-relaxed text-ink-2">学习进度、打卡、生词本都会被删除，且无法恢复。建议先导出备份。</p>
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
    </div>
  );
}

const THEME_NAME: Record<string, string> = { light: "浅色：纸", dark: "深色：墨", system: "跟随系统" };
