import { finePointer } from "@/lib/pointer";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Accessibility, Database, Scale, BellRing, CalendarDays, Check, ChevronDown, Contrast, MonitorDown, SlidersHorizontal, Ticket, ChevronRight, Download, FileUp, Gauge, Keyboard, Moon, RotateCcw, ShieldCheck, ShieldAlert, Sun, SunMoon } from "lucide-react";
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
  markBackedUp,
  resetAll,
  setSettings,
  useApp,
  type Book,
  type Order,
  type Theme,
} from "@/lib/store";
import { usePersist } from "@/lib/persist";
import { capReach, daysUntil, effectiveExam, sprintPlan, upcomingExams } from "@/lib/exam";
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


/** 11.2 · 「高级」的内容：#/advanced 二级页用它（算法开关收进「算法实验室」）；full = 旧会话里记住的就地展开状态（含算法开关） */
export function AdvancedBody({ full, onHelp }: { full?: boolean; onHelp: () => void }) {
  const { index } = useWords();
  const st = useApp();
  if (!index) return <Spinner />;
  const s = st.settings;
  const sum = summarize(index, st, today());
  return (
    <div className="space-y-4 md:space-y-5" data-testid="adv-body">
      <Panel data-testid="book-settings">
                <PanelTitle>词书与顺序</PanelTitle>
                <Segmented<Book>
                  value={s.book}
                  onChange={(v) => setSettings({ book: v })}
                  testid="book"
                  options={[
                    { value: "all", label: `全部 ${index.list.length}` },
                    { value: "core", label: `核心 ${index.coreCount}` },
                  ]}
                />
                <Segmented<Order>
                  className="mt-2"
                  value={s.order}
                  onChange={(v) => setSettings({ order: v })}
                  testid="order"
                  options={[
                    { value: "core", label: "核心优先" },
                    { value: "alpha", label: "字母顺序" },
                    { value: "random", label: "乱序" },
                  ]}
                />
                <p className="mt-2 text-[12px] text-muted-foreground">
                  还剩 {sum.newLeft} 个新词，{sum.newLeft ? `预计 ${fmtDate(sum.finish, true)} 学完` : "已经全部学过"}。
                </p>
              </Panel>
              {full ? (
                <>
                  <HabitPanel />
                  <PrefsPanel />
                  <ModesPanel />
                  <AlgoPanel />
                  <A11yPanel />
                </>
              ) : (
                <>
                  <Fold title="打卡规则" hint="按词数 / 按时长 · 休息日 · 补卡" testid="fold-habit">
                    <HabitPanel />
                  </Fold>
                  <Fold title="学习偏好" hint="语速 · 自动发音 · 中文优先 · 震动" testid="fold-prefs">
                    <PrefsPanel />
                  </Fold>
                  <Fold title="复习题型" hint="智能 / 只用回想 · 自选题型 · 预习与速测" testid="fold-modes">
                    <ModesPanel compact />
                  </Fold>
                  <Fold title="字号与无障碍" hint="字号 · 左手模式 · 滑动方向 · 动画" testid="fold-a11y">
                    <A11yPanel />
                  </Fold>
                  <LabLink />
                </>
              )}
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
              {finePointer() && (
                <Panel>
                  <button type="button" onClick={onHelp} className="flex w-full items-center gap-3 text-left" data-testid="open-shortcuts">
                    <Keyboard className="size-5 text-muted-foreground" />
                    <span className="flex-1 text-[15px] font-semibold">键盘快捷键</span>
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </button>
                </Panel>
              )}
    </div>
  );
}

export function LabLink() {
  return (
    <Link to="/lab" data-testid="go-lab" className="block">
      <Panel className="flex items-center gap-4 transition hover:border-primary/40">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-secondary text-muted-foreground">
          <SlidersHorizontal className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">算法实验室</div>
          <div className="text-[13px] text-muted-foreground">记忆保持目标和几个实验开关，默认就是推荐值</div>
        </div>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Panel>
    </Link>
  );
}

/** 「高级」展开状态：这个标签页里记住（切页面、刷新回来还是展开的） */
export const ADV_KEY = "cet4v-adv";
export let advOpen = (() => {
  try {
    return sessionStorage.getItem(ADV_KEY) === "1";
  } catch {
    return false;
  }
})();

/** 学习提醒（顶层）：到点发通知 */
export function RemindRow() {
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
  );
}

/** 高级 · 学习偏好 */
export function PrefsPanel() {
  const s = useApp().settings;
  return (
    <Panel data-testid="prefs-settings">
      <PanelTitle>学习偏好</PanelTitle>
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
    </Panel>
  );
}

/** v7 · 坚持与打卡：打卡标准、休息日、学习提醒、图标角标、补卡 */
export function HabitPanel() {
  const st = useApp();
  const s = st.settings;
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
        <Row label="图标角标" hint={badgeSupported() ? "桌面图标上显示待复习数" : "这个浏览器不支持角标"}>
          <Switch checked={s.appBadge !== false} disabled={!badgeSupported()} onCheckedChange={(v) => setSettings({ appBadge: v })} aria-label="图标角标" data-testid="app-badge" />
        </Row>
      </div>
    </Panel>
  );
}

/** v9 · 复习题型与学习流程：自选题型、难度递进、新词预习、学后速测 */
export function ModesPanel({ compact }: { compact?: boolean }) {
  const st = useApp();
  const s = st.settings;
  const off = s.offModes ?? [];
  const recallOnly = REVIEW_MODES.every((m) => m === "recall" || off.includes(m));
  return (
    <Panel data-testid="modes-settings">
      <PanelTitle right={<span className="tnum text-[12px] font-semibold text-muted-foreground" data-testid="modes-on">已开 {REVIEW_MODES.length - off.length}/{REVIEW_MODES.length}</span>}>复习题型</PanelTitle>
      <Segmented<number>
        value={recallOnly ? 1 : 0}
        onChange={(v) => setSettings({ offModes: v === 1 ? REVIEW_MODES.filter((m) => m !== "recall") : [] })}
        testid="modes-simple"
        options={[
          { value: 0, label: "智能（多种题型）" },
          { value: 1, label: "只用回想" },
        ]}
      />
      {compact ? (
        <details className="mt-3" data-testid="mode-custom">
          <summary className="cursor-pointer text-[13px] font-semibold text-muted-foreground">自选题型（{REVIEW_MODES.length - off.length}/{REVIEW_MODES.length}）</summary>
          <div className="mt-2">
      <div className="grid grid-cols-3 gap-1.5" data-testid="mode-chips">
        {REVIEW_MODES.map((m) => {
          const on = !off.includes(m);
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              data-testid={`mode-${m}`}
              onClick={() => {
                const next = toggleMode(off, m);
                if (!next) {
                  toast.error("至少保留一种基础题型", { description: "回想 / 英选中 / 中选英 / 听音选义" });
                  return;
                }
                setSettings({ offModes: next });
              }}
              className={cn(
                "flex h-10 items-center justify-center gap-1 rounded-xl px-1 text-[13px] font-bold transition",
                on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground line-through decoration-1 hover:text-foreground",
                BASE_MODES.includes(m) && on && "ring-2 ring-primary/25 ring-offset-1 ring-offset-card",
              )}
            >
              {on && <Check className="size-3.5 shrink-0" strokeWidth={3} />}
              <span className="truncate">{MODE_LABEL[m]}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        关掉的题型不再出现。至少保留一种基础题型（回想 / 英选中 / 中选英 / 听音选义）；其余题型只给能出题的词出，例句选词要先在线看过这个词的例句。难度递进：间隔 ≤{TIER_SHORT} 天英选中，{TIER_SHORT + 1}–{TIER_LONG - 1} 天中选英，≥{TIER_LONG} 天听音。
      </p>
          </div>
        </details>
      ) : (
        <>
      <div className="mb-2 mt-4 text-[12px] font-bold tracking-wider text-muted-foreground">自选题型</div>
      <div className="grid grid-cols-3 gap-1.5" data-testid="mode-chips">
        {REVIEW_MODES.map((m) => {
          const on = !off.includes(m);
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              data-testid={`mode-${m}`}
              onClick={() => {
                const next = toggleMode(off, m);
                if (!next) {
                  toast.error("至少保留一种基础题型", { description: "回想 / 英选中 / 中选英 / 听音选义" });
                  return;
                }
                setSettings({ offModes: next });
              }}
              className={cn(
                "flex h-10 items-center justify-center gap-1 rounded-xl px-1 text-[13px] font-bold transition",
                on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground line-through decoration-1 hover:text-foreground",
                BASE_MODES.includes(m) && on && "ring-2 ring-primary/25 ring-offset-1 ring-offset-card",
              )}
            >
              {on && <Check className="size-3.5 shrink-0" strokeWidth={3} />}
              <span className="truncate">{MODE_LABEL[m]}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        关掉的题型不再出现。至少保留一种基础题型（回想 / 英选中 / 中选英 / 听音选义）；其余题型只给能出题的词出，例句选词要先在线看过这个词的例句。难度递进：间隔 ≤{TIER_SHORT} 天英选中，{TIER_SHORT + 1}–{TIER_LONG - 1} 天中选英，≥{TIER_LONG} 天听音。
      </p>
        </>
      )}
      <div className="mt-3 border-t border-border/60 pt-1">
        <Row label="难度递进" hint="间隔越长题越难：英选中 → 中选英 → 听音">
          <Switch checked={!!s.progressive} onCheckedChange={(v) => setSettings({ progressive: v })} aria-label="难度递进" data-testid="progressive" />
        </Row>
        <Row label="新词预习" hint="开始一组新词前先看列表，认识的直接斩">
          <Switch checked={!!s.preview} onCheckedChange={(v) => setSettings({ preview: v })} aria-label="新词预习" data-testid="preview-switch" />
        </Row>
        <Row label="学后速测" hint="每组新词学完自动四选一检测一轮">
          <Switch checked={!!s.postQuiz} onCheckedChange={(v) => setSettings({ postQuiz: v })} aria-label="学后速测" data-testid="post-quiz-switch" />
        </Row>
      </div>
    </Panel>
  );
}

/** v10 · 记忆算法：保持目标、间隔扰动、负荷均衡、逾期加成、重学步骤、四键模式、初始难度拟合 */
export function AlgoPanel() {
  const st = useApp();
  const s = st.settings;
  const ret = s.retention ?? 90;
  const fit = fitInitialEase(st.revlog);
  const scale = retentionScale(ret);
  const doBalance = (quiet = false) => {
    const day = today();
    const r = balanceAll(getState().cards, day);
    if (r.moved.length) {
      replaceCards(r.cards);
      toast.success(`负荷均衡：挪动了 ${r.moved.length} 个词`, { description: "从复习扎堆的那天挪到前后一天" });
    } else if (!quiet) toast("未来 30 天没有扎堆的日子，不用挪");
  };
  return (
    <Panel data-testid="algo-settings">
      <PanelTitle
        right={
          <Link to="/algo" data-testid="algo-link" className="flex items-center text-[13px] text-muted-foreground hover:text-foreground">
            说明 · 模拟器 <ChevronRight className="size-4" />
          </Link>
        }
      >
        记忆算法
      </PanelTitle>
      <Label>记忆保持目标</Label>
      <Segmented<number>
        value={ret}
        onChange={(v) => setSettings({ retention: v })}
        testid="retention"
        options={RETENTION_OPTIONS.map((v) => ({ value: v, label: `${v}%` }))}
      />
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground" data-testid="retention-hint">
        {ret === 90 ? "默认：复习间隔不缩放" : ret > 90 ? `间隔 ×${scale.toFixed(2)}：复习更勤，记得更牢，每天复习更多` : `间隔 ×${scale.toFixed(2)}：复习更少，代价是忘得多一些`}
      </p>
      <div className="mt-3 border-t border-border/60 pt-1">
        <Row label="间隔随机扰动" hint="间隔 ±5%，同一天学的词不会同一天扎堆">
          <Switch checked={!!s.fuzz} onCheckedChange={(v) => setSettings({ fuzz: v })} aria-label="间隔随机扰动" data-testid="fuzz-switch" />
        </Row>
        <Row label="负荷均衡" hint="某天到期量超过均值 1.5 倍时，前后挪 1 天">
          <Switch
            checked={!!s.balance}
            onCheckedChange={(v) => {
              setSettings({ balance: v });
              if (v) doBalance(true);
            }}
            aria-label="负荷均衡"
            data-testid="balance-switch"
          />
        </Row>
        <Row label="逾期加成" hint="逾期很久还记得，按实际隔了多久算新间隔">
          <Switch checked={!!s.overdue} onCheckedChange={(v) => setSettings({ overdue: v })} aria-label="逾期加成" data-testid="overdue-switch" />
        </Row>
        <Row label="重学步骤" hint="忘掉的词先走 1 天 → 3 天，再恢复正常增长">
          <Switch checked={!!s.steps} onCheckedChange={(v) => setSettings({ steps: v })} aria-label="重学步骤" data-testid="steps-switch" />
        </Row>
        <Row label="四键模式" hint="多一个「简单」：这个词下次隔得更久">
          <Switch checked={!!s.fourKey} onCheckedChange={(v) => setSettings({ fourKey: v })} aria-label="四键模式" data-testid="fourkey-switch" />
        </Row>
        <Row
          label="初始难度拟合"
          hint={
            fit.ok
              ? `新词首答正确率 ${Math.round((fit.acc ?? 0) * 100)}% → 新词初始系数 ${fit.ease.toFixed(2)}`
              : `再学 ${FIT_MIN - fit.n} 个新词后生效（需 ${FIT_MIN} 次首答）`
          }
        >
          <Switch checked={!!s.fitEase} onCheckedChange={(v) => setSettings({ fitEase: v })} aria-label="初始难度拟合" data-testid="fit-switch" />
        </Row>
      </div>
      {s.balance && (
        <button
          type="button"
          data-testid="balance-now"
          onClick={() => doBalance()}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-secondary text-[14px] font-semibold hover:bg-accent"
        >
          <Scale className="size-4" /> 立即均衡未来 30 天
        </button>
      )}
    </Panel>
  );
}

/** v8 · 体验与无障碍：字号、左手模式、滑动方向、减少动画、正面音标、安装到桌面 */
export function A11yPanel() {
  const st = useApp();
  const s = st.settings;
  const canInstall = useInstallPrompt();
  const sysReduce = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const fs = s.fontSize ?? "md";
  return (
    <Panel data-testid="a11y-settings">
      <PanelTitle right={<Accessibility className="size-4 text-muted-foreground" />}>体验与无障碍</PanelTitle>
      <Label>卡片字号</Label>
      <Segmented<FontSize> value={fs} onChange={(v) => setSettings({ fontSize: v })} testid="font-size" options={FONT_SIZES.map((v) => ({ value: v, label: FONT_LABEL[v] }))} />
      <div className="mt-2 flex items-center gap-3 overflow-hidden rounded-2xl bg-secondary/70 px-4 py-3" data-testid="font-preview">
        <div className="fs-card min-w-0">
          <span className="font-display text-[22px] font-extrabold tracking-tight">abandon</span>
          <span className="ml-2 text-[15px] text-muted-foreground">v. 放弃；遗弃</span>
        </div>
      </div>
      <div className="mt-3 border-t border-border/60 pt-1">
        <Row label="左手模式" hint="评分按钮左右翻转，「认识」靠左手">
          <Switch checked={!!s.leftHand} onCheckedChange={(v) => setSettings({ leftHand: v })} aria-label="左手模式" data-testid="left-hand" />
        </Row>
        <Row label="滑动方向" hint="速刷与卡片的左右滑">
          <Segmented<number>
            className="w-48 shrink-0"
            value={s.swapSwipe ? 1 : 0}
            onChange={(v) => setSettings({ swapSwipe: v === 1 })}
            testid="swipe-dir"
            options={[
              { value: 0, label: "右滑认识" },
              { value: 1, label: "左滑认识" },
            ]}
          />
        </Row>
        <Row label="正面音标" hint="关掉后先认词形，音标在背面">
          <Switch checked={s.frontIpa !== false} onCheckedChange={(v) => setSettings({ frontIpa: v })} aria-label="正面音标" data-testid="front-ipa-switch" />
        </Row>
      </div>
      <Label>减少动画</Label>
      <Segmented<Motion> value={s.motion ?? "system"} onChange={(v) => setSettings({ motion: v })} testid="motion" options={(["system", "reduce", "full"] as Motion[]).map((v) => ({ value: v, label: MOTION_LABEL[v] }))} />
      <p className="mt-2 text-[12px] text-muted-foreground" data-testid="motion-hint">
        {(s.motion ?? "system") === "system" ? `系统${sysReduce ? "已开启" : "未开启"}「减少动态效果」` : s.motion === "reduce" ? "关闭翻转、弹出、彩带等动画" : "保留所有动画"}
        {finePointer() ? "；电脑上学习页可按 F 进入专注模式（全屏）。" : "。"}
      </p>
      {canInstall && !st.installed && !isStandalone() && (
        <button
          type="button"
          data-testid="me-install"
          onClick={async () => {
            const r = await promptInstall();
            if (r === "accepted") toast.success("已添加到桌面");
          }}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary text-[14px] font-semibold hover:bg-accent"
        >
          <MonitorDown className="size-4" /> 添加到桌面
        </button>
      )}
    </Panel>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 mt-4 text-[12px] font-bold tracking-wider text-muted-foreground first:mt-0">{children}</div>;
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

export function ActionBtn({ icon, label, onClick, testid }: { icon: React.ReactNode; label: string; onClick: () => void; testid?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-secondary text-[14px] font-semibold hover:bg-accent">
      {icon}
      {label}
    </button>
  );
}

export const readAdvOpen = () => advOpen;

/** 11.2 · 高级页里的一组设置：默认收起，只露一行标题 */
export function Fold({ title, hint, testid, children }: { title: string; hint: string; testid: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid={testid}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 rounded-3xl border border-border/70 bg-card px-5 py-4 text-left" data-testid={`${testid}-toggle`}>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px]">{title}</b>
          <span className="block truncate text-[12px] text-muted-foreground">{hint}</span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}
