import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ETA_CAP_MS,
  ETA_DEFAULT_MS,
  FONT_ZOOM,
  INSTALL_SNOOZE_DAYS,
  avgAnswerMs,
  cleanFontSize,
  cleanMotion,
  contrastRatio,
  estimateRemaining,
  historyPace,
  installVisible,
  motionReduced,
  quizAnnouncement,
  rateAnnouncement,
  rateOrder,
  relLuminance,
  sideRating,
  speedOrder,
  swipeHint,
  swipeRating,
} from "./ux";
import { cleanSettings, defaultSettings, normalize } from "./store";

describe("v8 · 字号", () => {
  it("三档缩放递增，中档 = 1", () => {
    expect(FONT_ZOOM.sm).toBeLessThan(1);
    expect(FONT_ZOOM.md).toBe(1);
    expect(FONT_ZOOM.lg).toBeGreaterThan(1);
  });
  it("非法值回到中", () => {
    expect(cleanFontSize("lg")).toBe("lg");
    expect(cleanFontSize("xl")).toBe("md");
    expect(cleanFontSize(undefined)).toBe("md");
  });
  it("styles.css 的缩放与 FONT_ZOOM 一致", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(new RegExp(`data-fs="sm"\\]\\s*{\\s*--card-zoom:\\s*${FONT_ZOOM.sm}`));
    expect(css).toMatch(new RegExp(`data-fs="lg"\\]\\s*{\\s*--card-zoom:\\s*${FONT_ZOOM.lg}`));
  });
});

describe("v8 · 左手模式", () => {
  it("默认 认识/模糊/不认识，左手模式翻转", () => {
    expect(rateOrder(false)).toEqual(["know", "vague", "forget"]);
    expect(rateOrder(true)).toEqual(["forget", "vague", "know"]);
  });
  it("返回新数组，不互相影响", () => {
    const a = rateOrder(false);
    a.reverse();
    expect(rateOrder(false)).toEqual(["know", "vague", "forget"]);
  });
});

describe("v8 · 滑动方向交换", () => {
  it("默认右滑认识、左滑不认识", () => {
    expect(sideRating("right", false)).toBe("know");
    expect(sideRating("left", false)).toBe("forget");
    expect(swipeRating(120, 0, { swap: false })).toBe("know");
    expect(swipeRating(-120, 0, { swap: false })).toBe("forget");
  });
  it("交换后相反", () => {
    expect(swipeRating(120, 0, { swap: true })).toBe("forget");
    expect(swipeRating(-120, 0, { swap: true })).toBe("know");
  });
  it("上滑 = 模糊，不受交换影响；速刷不认上滑", () => {
    expect(swipeRating(10, -120, { swap: false })).toBe("vague");
    expect(swipeRating(10, -120, { swap: true })).toBe("vague");
    expect(swipeRating(10, -120, { swap: true, vertical: false })).toBeNull();
  });
  it("没过阈值不算", () => {
    expect(swipeRating(85, 0, { swap: false })).toBeNull();
    expect(swipeRating(85, 0, { swap: false, threshold: 80 })).toBe("know");
    expect(swipeRating(0, 0, { swap: false })).toBeNull();
  });
  it("横向优先于纵向", () => {
    expect(swipeRating(100, -200, { swap: false })).toBe("know");
  });
  it("速刷按钮顺序跟随滑动方向", () => {
    expect(speedOrder(false)).toEqual(["forget", "know"]);
    expect(speedOrder(true)).toEqual(["know", "forget"]);
  });
  it("提示文字", () => {
    expect(swipeHint(false)).toBe("右滑认识 · 左滑不认识");
    expect(swipeHint(true)).toBe("左滑认识 · 右滑不认识");
  });
});

describe("v8 · 减少动画", () => {
  it("跟随系统", () => {
    expect(motionReduced("system", true)).toBe(true);
    expect(motionReduced("system", false)).toBe(false);
  });
  it("手动设置优先于系统", () => {
    expect(motionReduced("reduce", false)).toBe(true);
    expect(motionReduced("full", true)).toBe(false);
  });
  it("非法值回到跟随系统", () => {
    expect(cleanMotion("reduce")).toBe("reduce");
    expect(cleanMotion("off")).toBe("system");
  });
  it("styles.css 用 data-motion 关动画，不再只靠媒体查询", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain('html[data-motion="reduce"] *');
    expect(css).not.toContain("@media (prefers-reduced-motion");
  });
});

describe("v8 · 剩余时间估算", () => {
  const none = { ms: 0, a: 0 };
  it("没有数据用默认每题 8 秒", () => {
    expect(avgAnswerMs([], none)).toBe(ETA_DEFAULT_MS);
    expect(estimateRemaining(15, [], none)).toEqual({ ms: 120_000, min: 2, label: "剩约 2 分钟" });
  });
  it("本组 ≥3 题用本组平均", () => {
    expect(avgAnswerMs([4000, 6000, 8000], { ms: 100 * 20000, a: 100 })).toBe(6000);
  });
  it("本组不足 3 题与历史平均混合", () => {
    // 历史 12 秒/题，本组 1 题 3 秒 → (3 + 12 * 2) / 3 = 9 秒
    expect(avgAnswerMs([3000], { ms: 20 * 12000, a: 20 })).toBe(9000);
  });
  it("历史不足 10 题不用", () => {
    expect(avgAnswerMs([], { ms: 5 * 30000, a: 5 })).toBe(ETA_DEFAULT_MS);
  });
  it("单题最多按 60 秒算", () => {
    expect(avgAnswerMs([600_000, 600_000, 600_000], none)).toBe(ETA_CAP_MS);
  });
  it("不到 1 分钟、四舍五入、0 题", () => {
    expect(estimateRemaining(3, [5000, 5000, 5000], none)?.label).toBe("不到 1 分钟");
    expect(estimateRemaining(3, [5000, 5000, 5000], none)?.min).toBe(0);
    expect(estimateRemaining(10, [10000, 10000, 10000], none)?.label).toBe("剩约 2 分钟"); // 100 秒 → 2
    expect(estimateRemaining(13, [10000, 10000, 10000], none)?.min).toBe(2); // 130 秒 → 2
    expect(estimateRemaining(0, [], none)).toBeNull();
  });
  it("历史用时汇总跳过空日志", () => {
    expect(historyPace({ a: { ms: 1000, a: 2 }, b: { ms: 0, a: 0 }, c: { ms: 3000, a: 4 } })).toEqual({ ms: 4000, a: 6 });
  });
});

describe("v8 · 安装引导", () => {
  const T = "2026-10-13";
  it("可安装时显示", () => {
    expect(installVisible({ canPrompt: true, standalone: false, today: T })).toBe(true);
  });
  it("没有安装事件 / 已在桌面打开 / 装过 → 不显示", () => {
    expect(installVisible({ canPrompt: false, standalone: false, today: T })).toBe(false);
    expect(installVisible({ canPrompt: true, standalone: true, today: T })).toBe(false);
    expect(installVisible({ canPrompt: true, standalone: false, installed: true, today: T })).toBe(false);
  });
  it("关掉后 14 天内不显示，到期再出现", () => {
    expect(INSTALL_SNOOZE_DAYS).toBe(14);
    expect(installVisible({ canPrompt: true, standalone: false, snoozeUntil: "2026-10-27", today: T })).toBe(false);
    expect(installVisible({ canPrompt: true, standalone: false, snoozeUntil: "2026-10-13", today: T })).toBe(true);
  });
});

describe("v8 · 读屏播报", () => {
  it("评分", () => {
    expect(rateAnnouncement("abandon", "know", "3天")).toBe("abandon，记为认识，3天后复习");
    expect(rateAnnouncement("abandon", "vague")).toBe("abandon，记为模糊");
    expect(rateAnnouncement("abandon", "forget", "1天")).toBe("abandon，记为不认识，稍后再来一遍");
  });
  it("答题对错", () => {
    expect(quizAnnouncement(true, "abandon", "v. 放弃")).toBe("回答正确，abandon");
    expect(quizAnnouncement(false, "abandon", "v. 放弃")).toBe("回答错误，正确答案：v. 放弃");
    expect(quizAnnouncement(false, "abandon", "v. 放弃", true)).toBe("正确答案：v. 放弃");
  });
});

describe("v8 · 高对比度主题", () => {
  it("对比度公式：黑白 21:1，同色 1:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777", "#777777")).toBeCloseTo(1, 5);
    expect(relLuminance("#ffffff")).toBeCloseTo(1, 5);
  });
  const css = readFileSync("src/styles.css", "utf8");
  const block = css.match(/html\.contrast\s*{([^}]*)}/)?.[1] ?? "";
  const vars = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
  it("配色全部是 #rrggbb", () => {
    expect(Object.keys(vars).length).toBeGreaterThanOrEqual(30);
    expect(block.match(/--[\w-]+:/g)?.length).toBe(Object.keys(vars).length);
  });
  const pairs: [string, string][] = [
    ["foreground", "background"],
    ["foreground", "card"],
    ["muted-foreground", "background"],
    ["muted-foreground", "secondary"],
    ["muted-foreground", "muted"],
    ["secondary-foreground", "secondary"],
    ["primary-foreground", "primary"],
    ["primary", "background"],
    ["primary", "brand-soft"],
    ["destructive-foreground", "destructive"],
    ["destructive", "background"],
    ["know", "know-soft"],
    ["know", "card"],
    ["vague", "vague-soft"],
    ["forget", "forget-soft"],
    ["forget", "card"],
    ["border", "background"],
    ["border", "card"],
    ["input", "background"],
    ["accent-foreground", "accent"],
    ["popover-foreground", "popover"],
  ];
  for (const [fg, bg] of pairs) {
    it(`${fg} 对 ${bg} ≥ 7:1`, () => {
      expect(vars[fg], fg).toBeTruthy();
      expect(vars[bg], bg).toBeTruthy();
      expect(contrastRatio(vars[fg], vars[bg])).toBeGreaterThanOrEqual(7);
    });
  }
  it("评分按钮白字在实色背景上 ≥ 7:1", () => {
    expect(contrastRatio("#ffffff", vars.know)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio("#ffffff", vars.forget)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio("#ffffff", vars.vague)).toBeGreaterThanOrEqual(7);
  });
});

describe("v8 · 设置", () => {
  it("默认值", () => {
    const d = defaultSettings();
    expect([d.fontSize, d.leftHand, d.swapSwipe, d.motion, d.frontIpa]).toEqual(["md", false, false, "system", true]);
  });
  it("越界值回到默认，合法值保留", () => {
    const bad = cleanSettings({ ...defaultSettings(), fontSize: "huge", leftHand: "yes", swapSwipe: 1, motion: "fast", frontIpa: "no", theme: "neon" } as never);
    expect([bad.fontSize, bad.leftHand, bad.swapSwipe, bad.motion, bad.frontIpa, bad.theme]).toEqual(["md", false, false, "system", true, "system"]);
    const ok = cleanSettings({ ...defaultSettings(), fontSize: "lg", leftHand: true, swapSwipe: true, motion: "reduce", frontIpa: false, theme: "contrast" });
    expect([ok.fontSize, ok.leftHand, ok.swapSwipe, ok.motion, ok.frontIpa, ok.theme]).toEqual(["lg", true, true, "reduce", false, "contrast"]);
  });
  it("旧备份没有 v8 字段也能读", () => {
    const st = normalize({ cards: {}, settings: { theme: "dark" } });
    expect(st.settings.fontSize).toBe("md");
    expect(st.settings.theme).toBe("dark");
    expect(st.installed).toBeUndefined();
  });
  it("安装状态读写校验", () => {
    expect(normalize({ installed: true, installSnooze: "2026-10-27" })).toMatchObject({ installed: true, installSnooze: "2026-10-27" });
    expect(normalize({ installed: "yes", installSnooze: 3 })).toMatchObject({ installed: undefined, installSnooze: undefined });
  });
});
