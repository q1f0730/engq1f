import { finePointer } from "@/lib/pointer";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "@/lib/toast";
import { Segmented, Spinner } from "@/components/app/shell";
import { Entry, EntryButton, Field, Sec, Tag, Ticks, actClass } from "@/components/app/kit";
import { Switch } from "@/components/ui/switch";
import { today } from "@/lib/clock";
import { useWords } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { summarize } from "@/lib/plan";
import { RATE_OPTIONS, setSettings, useApp, type Book, type Order } from "@/lib/store";
import { MAKEUP_EVERY, MAKEUP_MAX, REST_OPTIONS, TIME_GOALS, WEEKDAY_CN, type GoalMode } from "@/lib/habit";
import { askNotify, badgeSupported, notifyPermission, notifySupported } from "@/lib/nudge";
import { FONT_LABEL, FONT_SIZES, MOTION_LABEL, type FontSize, type Motion } from "@/lib/ux";
import { isStandalone, promptInstall, useInstallPrompt } from "@/lib/install";
import { BASE_MODES, REVIEW_MODES, TIER_LONG, TIER_SHORT, toggleMode } from "@/lib/modes";
import { MODE_LABEL } from "@/lib/exam";
import { FIT_MIN, RETENTION_OPTIONS, balanceAll, fitInitialEase } from "@/lib/algo";
import { retentionScale } from "@/lib/srs";
import { getState, replaceCards } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * 12.0 · 设置的排版：一本说明书。
 * 每组是一个带细线的分区（Sec），每一项是一行「名字 + 一句说明 ··· 控件」（Field），
 * 选数字的地方是一把尺子（Ticks），选中的那格划上荧光笔。没有图标、没有卡片底。
 */

/** 11.2 · 「高级」的内容：#/advanced 二级页用它（算法开关收进「算法实验室」）；full = 旧会话里记住的就地展开状态（含算法开关） */
export function AdvancedBody({ full, onHelp }: { full?: boolean; onHelp: () => void }) {
  const { index } = useWords();
  const st = useApp();
  if (!index) return <Spinner />;
  const s = st.settings;
  const sum = summarize(index, st, today());
  return (
    <div className="space-y-10" data-testid="adv-body">
      <Sec title="词书与顺序" testid="book-settings">
        <Field label="词书" block>
          <Segmented<Book>
            value={s.book}
            onChange={(v) => setSettings({ book: v })}
            testid="book"
            options={[
              { value: "all", label: `全部 ${index.list.length}` },
              { value: "core", label: `核心 ${index.coreCount}` },
            ]}
          />
        </Field>
        <Field
          label="新词顺序"
          hint={`还剩 ${sum.newLeft} 个新词，${sum.newLeft ? `预计 ${fmtDate(sum.finish, true)} 学完` : "已经全部学过"}。`}
          block
        >
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
        </Field>
      </Sec>
      {full ? (
        <>
          <HabitPanel />
          <PrefsPanel />
          <ModesPanel />
          <AlgoPanel />
          <A11yPanel />
        </>
      ) : (
        <Sec title="更多设置">
          <div className="border-t border-rule">
            <Fold title="打卡规则" hint="按词数 / 按时长 · 休息日 · 补卡" testid="fold-habit">
              <HabitPanel bare />
            </Fold>
            <Fold title="学习偏好" hint="语速 · 自动发音 · 中文优先 · 震动" testid="fold-prefs">
              <PrefsPanel bare />
            </Fold>
            <Fold title="复习题型" hint="智能 / 只用回想 · 自选题型 · 预习与速测" testid="fold-modes">
              <ModesPanel compact bare />
            </Fold>
            <Fold title="字号与无障碍" hint="字号 · 左手模式 · 滑动方向 · 动画" testid="fold-a11y">
              <A11yPanel bare />
            </Fold>
          </div>
        </Sec>
      )}
      <Sec title="工具">
        <div className="border-t border-rule">
          {!full && <LabLink />}
          <Entry
            to="/test"
            data-testid="go-test"
            title="词汇量测试"
            sub={st.test ? `上次估算约 ${st.test.est} 词（${fmtDate(st.test.at)}）` : "3 分钟估算词汇量，跳过已经会的词"}
          />
          {finePointer() && <EntryButton onClick={onHelp} data-testid="open-shortcuts" title="键盘快捷键" sub="空格翻面 · 1/2/3 评分 · Z 撤销" />}
        </div>
      </Sec>
    </div>
  );
}

export function LabLink() {
  return <Entry to="/lab" data-testid="go-lab" title="算法实验室" sub="记忆保持目标和几个实验开关，默认就是推荐值" />;
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
      <div className="flex shrink-0 items-center gap-3">
        {remindOn && (
          <label className="press relative flex h-9 items-center border-b border-ink px-1 font-serif text-[1.25rem] leading-none tnum">
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

/** 一组设置：完整页面里是带标题的分区；折叠在「高级」里时（bare）只要内容 */
function Group({ title, aside, testid, id, bare, children }: { title: string; aside?: React.ReactNode; testid: string; id?: string; bare?: boolean; children: React.ReactNode }) {
  if (bare)
    return (
      <div data-testid={testid} id={id} className="pb-2">
        {aside && <div className="flex justify-end pt-1">{aside}</div>}
        {children}
      </div>
    );
  return (
    <Sec title={title} aside={aside} testid={testid} id={id}>
      <div className="border-t border-rule">{children}</div>
    </Sec>
  );
}

/** 高级 · 学习偏好 */
export function PrefsPanel({ bare }: { bare?: boolean }) {
  const s = useApp().settings;
  return (
    <Group title="学习偏好" testid="prefs-settings" bare={bare}>
      <Field label="发音语速" hint="含例句、磁带" block>
        <Segmented<number> value={s.rate ?? 1} onChange={(v) => setSettings({ rate: v })} testid="rate" options={RATE_OPTIONS.map((v) => ({ value: v, label: `${v}×` }))} />
      </Field>
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
    </Group>
  );
}

/** v7 · 坚持与打卡：打卡标准、休息日、学习提醒、图标角标、补卡 */
export function HabitPanel({ bare }: { bare?: boolean }) {
  const st = useApp();
  const s = st.settings;
  return (
    <Group
      title="坚持与打卡"
      testid="habit-settings"
      id="habit"
      bare={bare}
      aside={
        <Tag tone="vague" data-testid="me-makeup" data-n={st.makeup ?? 0} className="tnum">
          补卡 {st.makeup ?? 0}/{MAKEUP_MAX}
        </Tag>
      }
    >
      <Field
        label="打卡标准"
        hint={s.goalMode === "time" ? `当天作答累计满 ${s.goalMin} 分钟即可打卡（每题最多计 1 分钟）。` : "当天新词达标、到期复习清零即可打卡。"}
        block
      >
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
          <Ticks<number>
            className="mt-3"
            value={s.goalMin ?? 0}
            onPick={(m) => setSettings({ goalMin: m })}
            testid="goal-min"
            idOf={(m) => `goal-min-${m}`}
            options={TIME_GOALS.map((m) => ({
              value: m,
              label: (
                <>
                  {m}
                  <span className="ml-0.5 font-sans text-[0.75rem]">分钟</span>
                </>
              ),
            }))}
          />
        )}
      </Field>
      <Field label="每周休息日" hint={`休息日不打卡也不断连续；每连续打卡 ${MAKEUP_EVERY} 天得 1 张补卡（最多 ${MAKEUP_MAX} 张），漏了昨天可以在今日页补上。`} block>
        <Ticks<number>
          value={s.restDay ?? -1}
          onPick={(d) => setSettings({ restDay: d })}
          testid="rest-day"
          idOf={(d) => `rest-${d}`}
          serif={false}
          options={REST_OPTIONS.map((d) => ({ value: d, label: d < 0 ? "无" : WEEKDAY_CN[d] }))}
        />
      </Field>
      <Row label="图标角标" hint={badgeSupported() ? "桌面图标上显示待复习数" : "这个浏览器不支持角标"}>
        <Switch checked={s.appBadge !== false} disabled={!badgeSupported()} onCheckedChange={(v) => setSettings({ appBadge: v })} aria-label="图标角标" data-testid="app-badge" />
      </Row>
    </Group>
  );
}

/** 题型清单：一列「题型 ··· 开 / 关」，基础题型标一个「基础」 */
function ModeList({ off }: { off: string[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-5" data-testid="mode-chips">
      {REVIEW_MODES.map((m) => {
        const on = !off.includes(m);
        return (
          <li key={m} className="min-w-0 border-b border-rule">
            <button
              type="button"
              aria-pressed={on}
              data-testid={`mode-${m}`}
              onClick={() => {
                const next = toggleMode(off as never, m);
                if (!next) {
                  toast.error("至少保留一种基础题型", { description: "回想 / 英选中 / 中选英 / 听音选义" });
                  return;
                }
                setSettings({ offModes: next });
              }}
              className="press flex min-h-11 w-full min-w-0 items-center gap-2 text-left text-[0.875rem]"
            >
              <span
                aria-hidden
                className={cn("grid size-[18px] shrink-0 place-items-center rounded-[3px] text-[0.6875rem] font-bold", on ? "bg-ink text-paper-3" : "border-[1.5px] border-rule-strong")}
              >
                {on ? "✓" : ""}
              </span>
              <span className={cn("min-w-0 flex-1 truncate", on ? "text-ink" : "text-ink-3 line-through decoration-1")}>{MODE_LABEL[m]}</span>
              {BASE_MODES.includes(m) && <span className="shrink-0 text-[0.6875rem] text-ink-3">基础</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const MODE_NOTE = `关掉的题型不再出现。至少保留一种基础题型（回想 / 英选中 / 中选英 / 听音选义）；其余题型只给能出题的词出，例句选词要先在线看过这个词的例句。难度递进：间隔 ≤${TIER_SHORT} 天英选中，${TIER_SHORT + 1}–${TIER_LONG - 1} 天中选英，≥${TIER_LONG} 天听音。`;

/** v9 · 复习题型与学习流程：自选题型、难度递进、新词预习、学后速测 */
export function ModesPanel({ compact, bare }: { compact?: boolean; bare?: boolean }) {
  const st = useApp();
  const s = st.settings;
  const off = s.offModes ?? [];
  const recallOnly = REVIEW_MODES.every((m) => m === "recall" || off.includes(m));
  return (
    <Group
      title="复习题型"
      testid="modes-settings"
      bare={bare}
      aside={
        <span className="tnum text-[0.75rem] font-medium text-ink-3" data-testid="modes-on">
          已开 {REVIEW_MODES.length - off.length}/{REVIEW_MODES.length}
        </span>
      }
    >
      <Field label="出题方式" block>
        <Segmented<number>
          value={recallOnly ? 1 : 0}
          onChange={(v) => setSettings({ offModes: v === 1 ? REVIEW_MODES.filter((m) => m !== "recall") : [] })}
          testid="modes-simple"
          options={[
            { value: 0, label: "智能（多种题型）" },
            { value: 1, label: "只用回想" },
          ]}
        />
      </Field>
      {compact ? (
        <details className="group border-b border-rule py-3" data-testid="mode-custom">
          <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between text-[0.9375rem] font-medium">
            自选题型（{REVIEW_MODES.length - off.length}/{REVIEW_MODES.length}）
            <span aria-hidden className="font-serif text-[1.25rem] leading-none text-ink-3 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="mt-2">
            <ModeList off={off} />
            <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-3">{MODE_NOTE}</p>
          </div>
        </details>
      ) : (
        <Field label="自选题型" hint={MODE_NOTE} block>
          <ModeList off={off} />
        </Field>
      )}
      <Row label="难度递进" hint="间隔越长题越难：英选中 → 中选英 → 听音">
        <Switch checked={!!s.progressive} onCheckedChange={(v) => setSettings({ progressive: v })} aria-label="难度递进" data-testid="progressive" />
      </Row>
      <Row label="新词预习" hint="开始一组新词前先看列表，认识的直接斩">
        <Switch checked={!!s.preview} onCheckedChange={(v) => setSettings({ preview: v })} aria-label="新词预习" data-testid="preview-switch" />
      </Row>
      <Row label="学后速测" hint="每组新词学完自动四选一检测一轮">
        <Switch checked={!!s.postQuiz} onCheckedChange={(v) => setSettings({ postQuiz: v })} aria-label="学后速测" data-testid="post-quiz-switch" />
      </Row>
    </Group>
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
    <Group
      title="记忆算法"
      testid="algo-settings"
      aside={
        <Link to="/algo" data-testid="algo-link" className="press inline-flex h-9 items-center gap-1 underline decoration-rule-strong underline-offset-4 hover:text-ink">
          说明 · 模拟器
        </Link>
      }
    >
      <Field label="记忆保持目标" block>
        <Segmented<number> value={ret} onChange={(v) => setSettings({ retention: v })} testid="retention" options={RETENTION_OPTIONS.map((v) => ({ value: v, label: `${v}%` }))} />
        <p className="mt-2.5 text-[0.75rem] leading-relaxed text-ink-3" data-testid="retention-hint">
          {ret === 90
            ? "默认 90%：大约十个词里忘一个"
            : ret > 90
              ? `${ret}%：大约二十个词里忘一个；复习更勤（间隔是默认的 ${Math.round(scale * 100)}%），每天要复习的更多`
              : `${ret}%：大约七个词里忘一个；复习更少（间隔是默认的 ${Math.round(scale * 100)}%），代价是忘得多一些`}
        </p>
      </Field>
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
      {s.balance && (
        <div className="border-b border-rule pb-4">
          <button type="button" data-testid="balance-now" onClick={() => doBalance()} className={actClass("secondary", true) + " w-full"}>
            立即均衡未来 30 天
          </button>
        </div>
      )}
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
            ? `新词第一次就答对 ${Math.round((fit.acc ?? 0) * 100)}%：新词的间隔按你的记性调整（系数 ${fit.ease.toFixed(2)}）`
            : `再答 ${FIT_MIN - fit.n} 个新词后，按你的记性调整新词的间隔`
        }
      >
        <Switch checked={!!s.fitEase} onCheckedChange={(v) => setSettings({ fitEase: v })} aria-label="初始难度拟合" data-testid="fit-switch" />
      </Row>
    </Group>
  );
}

/** v8 · 体验与无障碍：字号、左手模式、滑动方向、减少动画、正面音标、安装到桌面 */
export function A11yPanel({ bare }: { bare?: boolean }) {
  const st = useApp();
  const s = st.settings;
  const canInstall = useInstallPrompt();
  const sysReduce = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const fs = s.fontSize ?? "md";
  return (
    <Group title="体验与无障碍" testid="a11y-settings" bare={bare}>
      <Field label="卡片字号" block>
        <Segmented<FontSize> value={fs} onChange={(v) => setSettings({ fontSize: v })} testid="font-size" options={FONT_SIZES.map((v) => ({ value: v, label: FONT_LABEL[v] }))} />
        {/* 预览：就是一张小词条 */}
        <div className="mt-3 overflow-hidden border-l-2 border-mark pl-3" data-testid="font-preview">
          <div className="fs-card min-w-0">
            <span className="word-head text-[1.75rem] leading-none">abandon</span>
            <span className="ml-2 text-[0.9375rem] text-ink-2">
              <i className="pos text-ink-3">v.</i> 放弃；遗弃
            </span>
          </div>
        </div>
      </Field>
      <Row label="左手模式" hint="评分按钮左右翻转，「认识」靠左手">
        <Switch checked={!!s.leftHand} onCheckedChange={(v) => setSettings({ leftHand: v })} aria-label="左手模式" data-testid="left-hand" />
      </Row>
      <Field label="滑动方向" hint="速刷与卡片的左右滑" block>
        <Segmented<number>
          value={s.swapSwipe ? 1 : 0}
          onChange={(v) => setSettings({ swapSwipe: v === 1 })}
          testid="swipe-dir"
          options={[
            { value: 0, label: "右滑认识" },
            { value: 1, label: "左滑认识" },
          ]}
        />
      </Field>
      <Row label="正面音标" hint="关掉后先认词形，音标在背面">
        <Switch checked={s.frontIpa !== false} onCheckedChange={(v) => setSettings({ frontIpa: v })} aria-label="正面音标" data-testid="front-ipa-switch" />
      </Row>
      <Field label="减少动画" block>
        <Segmented<Motion> value={s.motion ?? "system"} onChange={(v) => setSettings({ motion: v })} testid="motion" options={(["system", "reduce", "full"] as Motion[]).map((v) => ({ value: v, label: MOTION_LABEL[v] }))} />
        <p className="mt-2.5 text-[0.75rem] text-ink-3" data-testid="motion-hint">
          {(s.motion ?? "system") === "system" ? `系统${sysReduce ? "已开启" : "未开启"}「减少动态效果」` : s.motion === "reduce" ? "关闭翻转、弹出、彩带等动画" : "保留所有动画"}
          {finePointer() ? "；电脑上学习页可按 F 进入专注模式（全屏）。" : "。"}
        </p>
      </Field>
      {canInstall && !st.installed && !isStandalone() && (
        <div className="py-4">
          <button
            type="button"
            data-testid="me-install"
            onClick={async () => {
              const r = await promptInstall();
              if (r === "accepted") toast.success("已添加到桌面");
            }}
            className={actClass("secondary", true) + " h-11 w-full"}
          >
            添加到桌面
          </button>
        </div>
      )}
    </Group>
  );
}

/** 控件上方的小标题（「我的」页用） */
export function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2.5 mt-6 text-[0.8125rem] font-medium text-ink-2 first:mt-0">{children}</div>;
}

/** 一行设置：名字 + 说明在左，开关在右 */
export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <Field label={label} hint={hint}>
      {children}
    </Field>
  );
}

/** 成对的动作（导出 / 导入）：细线框按钮，图标在字前 */
export function ActionBtn({ icon, label, onClick, testid }: { icon: React.ReactNode; label: string; onClick: () => void; testid?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} className={actClass("secondary", true) + " h-11 [&_svg]:size-4"}>
      {icon}
      {label}
    </button>
  );
}

export const readAdvOpen = () => advOpen;

/** 11.2 · 高级页里的一组设置：默认收起，只露一行标题（像目录里的一条，展开后内容缩进在下面） */
export function Fold({ title, hint, testid, children }: { title: string; hint: string; testid: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid={testid} className="border-b border-rule">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="press flex min-h-14 w-full items-center gap-3 py-3 text-left" data-testid={`${testid}-toggle`}>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[0.9375rem] font-medium leading-tight", open && "font-semibold")}>{title}</span>
          <span className="mt-1 block truncate text-[0.8125rem] text-ink-3">{hint}</span>
        </span>
        <span aria-hidden className={cn("shrink-0 font-serif text-[1.375rem] leading-none text-ink-3 transition-transform duration-300 ease-[var(--ease-spring)]", open && "rotate-90")}>
          ›
        </span>
      </button>
      {open && <div className="rise border-t border-dashed border-rule pb-2 pl-3">{children}</div>}
    </div>
  );
}
