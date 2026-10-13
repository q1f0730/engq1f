import type { Word } from "./data";
import { shortMeaning } from "./data";

export interface ShareInfo {
  day: string;
  streak: number;
  totalDays: number;
  learned: number;
  reviewed: number;
  totalWords: number;
  word: Word;
  /** 最近 7 天是否打卡（旧 → 新，最后一个是今天） */
  week?: boolean[];
}

export type ShareTpl = "classic" | "paper" | "night";
export const SHARE_TPLS: { id: ShareTpl; name: string; swatch: string }[] = [
  { id: "classic", name: "朱砂", swatch: "linear-gradient(135deg,#ee6a3c,#b92f26)" },
  { id: "paper", name: "纸笺", swatch: "linear-gradient(135deg,#fbf6ec,#efe5d2)" },
  { id: "night", name: "夜读", swatch: "linear-gradient(135deg,#232b4a,#11162a)" },
];

const FONT = `"Inter", -apple-system, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxW) {
      lines.push(cur);
      cur = ch;
      if (lines.length === maxLines) break;
    } else cur += ch;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && lines.join("").length < text.length) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + "…";
  }
  return lines;
}

const W = 1080;
const H = 1440;
const PH_FONT = `500 36px "Lucida Sans Unicode", "Segoe UI", "Noto Sans", "DejaVu Sans", sans-serif`;
const WEEK_CN = ["日", "一", "二", "三", "四", "五", "六"];

function dateLine(day: string) {
  const [y, m, d] = day.split("-");
  return `${y} 年 ${Number(m)} 月 ${Number(d)} 日 · 星期${WEEK_CN[new Date(day + "T12:00:00").getDay()]}`;
}

/** 单词按宽度缩字号 */
function fitWord(ctx: CanvasRenderingContext2D, w: string, max: number, start = 112, min = 60) {
  let size = start;
  ctx.font = `800 ${size}px ${FONT}`;
  while (ctx.measureText(w).width > max && size > min) {
    size -= 6;
    ctx.font = `800 ${size}px ${FONT}`;
  }
}

/** 最近 7 天的星期标签（旧 → 新） */
function weekLabels(day: string) {
  const dow = new Date(day + "T12:00:00").getDay();
  return Array.from({ length: 7 }, (_, k) => WEEK_CN[(dow - 6 + k + 7) % 7]);
}

/** 生成打卡分享图（1080×1440 PNG），三种样式 */
export function drawShareCard(info: ShareInfo, tpl: ShareTpl = "classic"): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  if (tpl === "paper") drawPaper(ctx, info);
  else if (tpl === "night") drawNight(ctx, info);
  else drawClassic(ctx, info);
  return c;
}

function drawClassic(ctx: CanvasRenderingContext2D, info: ShareInfo) {

  // 背景：朱砂渐变 + 光晕
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#ee6a3c");
  g.addColorStop(1, "#b92f26");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W, 0, 40, W, 0, 900);
  glow.addColorStop(0, "rgba(255,209,102,0.55)");
  glow.addColorStop(1, "rgba(255,209,102,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // 点阵纹理
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  for (let y = 30; y < H; y += 36) for (let x = 30; x < W; x += 36) ctx.fillRect(x, y, 3, 3);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `600 38px ${FONT}`;
  ctx.fillText(dateLine(info.day), 80, 130);

  ctx.fillStyle = "#fff";
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText("四级单词打卡", 80, 220);

  // 连续天数
  ctx.font = `800 300px ${FONT}`;
  ctx.fillText(String(info.streak), 72, 520);
  const sw = ctx.measureText(String(info.streak)).width;
  ctx.font = `700 54px ${FONT}`;
  ctx.fillText("天", 72 + sw + 20, 515);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `600 40px ${FONT}`;
  ctx.fillText(`连续打卡 · 累计 ${info.totalDays} 天`, 80, 590);

  // 数据格
  const stats = [
    ["今日新学", info.learned],
    ["今日复习", info.reviewed],
    ["累计学过", info.totalWords],
  ] as const;
  const bw = (W - 160 - 40) / 3;
  stats.forEach(([label, v], k) => {
    const x = 80 + k * (bw + 20);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    roundRect(ctx, x, 650, bw, 190, 36);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `800 78px ${FONT}`;
    ctx.fillText(String(v), x + 36, 755);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText(label, x + 36, 808);
  });

  // 每日一词
  ctx.fillStyle = "#fffaf3";
  roundRect(ctx, 80, 900, W - 160, 400, 48);
  ctx.fill();
  ctx.fillStyle = "#c7362a";
  ctx.font = `700 32px ${FONT}`;
  ctx.fillText("今日一词", 140, 975);
  ctx.fillStyle = "#1f2230";
  fitWord(ctx, info.word.w, W - 280);
  ctx.fillText(info.word.w, 136, 1100);
  if (info.word.p) {
    ctx.fillStyle = "#6b6f80";
    ctx.font = PH_FONT;
    ctx.fillText(`/${info.word.p[0]}/`, 140, 1160);
  }
  ctx.fillStyle = "#3a3e4f";
  ctx.font = `500 38px ${FONT}`;
  wrap(ctx, shortMeaning(info.word, 2), W - 280, 2).forEach((line, k) => ctx.fillText(line, 140, 1222 + k * 52));

  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText("离线 · 无广告 · 不用注册", 80, 1380);
  ctx.textAlign = "right";
  ctx.fillText("by Q1f730", W - 80, 1380);
  ctx.textAlign = "left";
}

/** 纸笺：米色纸 + 墨色大字 + 朱红印章 + 7 天打卡格 */
function drawPaper(ctx: CanvasRenderingContext2D, info: ShareInfo) {
  const ink = "#1f2230";
  const red = "#c7362a";
  ctx.fillStyle = "#f8f2e6";
  ctx.fillRect(0, 0, W, H);
  // 信笺横线
  ctx.strokeStyle = "rgba(120,90,50,0.10)";
  ctx.lineWidth = 2;
  for (let y = 260; y < H - 120; y += 72) {
    ctx.beginPath();
    ctx.moveTo(80, y);
    ctx.lineTo(W - 80, y);
    ctx.stroke();
  }
  // 左侧竖线
  ctx.strokeStyle = "rgba(199,54,42,0.35)";
  ctx.beginPath();
  ctx.moveTo(60, 0);
  ctx.lineTo(60, H);
  ctx.stroke();

  ctx.fillStyle = "#8a8170";
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText(dateLine(info.day), 100, 130);
  ctx.fillStyle = ink;
  ctx.font = `800 62px ${FONT}`;
  ctx.fillText("四级单词打卡", 100, 215);

  // 印章
  ctx.save();
  ctx.translate(W - 190, 170);
  ctx.rotate(-0.12);
  ctx.fillStyle = red;
  roundRect(ctx, -82, -82, 164, 164, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 5;
  roundRect(ctx, -68, -68, 136, 136, 14);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `800 54px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("已", 0, -8);
  ctx.fillText("打卡", 0, 52);
  ctx.restore();
  ctx.textAlign = "left";

  // 连续天数
  ctx.fillStyle = ink;
  ctx.font = `800 280px ${FONT}`;
  ctx.fillText(String(info.streak), 92, 545);
  const sw = ctx.measureText(String(info.streak)).width;
  ctx.fillStyle = red;
  ctx.font = `800 58px ${FONT}`;
  ctx.fillText("天", 92 + sw + 18, 540);
  ctx.fillStyle = "#5d5648";
  ctx.font = `600 38px ${FONT}`;
  ctx.fillText(`连续打卡 · 累计 ${info.totalDays} 天`, 100, 612);

  // 最近 7 天
  const week = info.week ?? [];
  const labels = weekLabels(info.day);
  const cw = (W - 200) / 7;
  for (let k = 0; k < 7; k++) {
    const cx = 100 + cw * k + cw / 2;
    const on = !!week[k];
    ctx.beginPath();
    ctx.arc(cx, 720, 44, 0, Math.PI * 2);
    if (on) {
      ctx.fillStyle = red;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(cx - 18, 721);
      ctx.lineTo(cx - 5, 734);
      ctx.lineTo(cx + 20, 706);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(31,34,48,0.25)";
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = k === 6 ? ink : "#8a8170";
    ctx.font = `${k === 6 ? 800 : 600} 30px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(k === 6 ? "今天" : labels[k], cx, 812);
  }
  ctx.textAlign = "left";

  // 数据：三栏 + 竖线
  const stats = [
    ["今日新学", info.learned],
    ["今日复习", info.reviewed],
    ["累计学过", info.totalWords],
  ] as const;
  const colW = (W - 200) / 3;
  stats.forEach(([label, v], k) => {
    const x = 100 + k * colW;
    if (k) {
      ctx.fillStyle = "rgba(31,34,48,0.14)";
      ctx.fillRect(x, 872, 3, 120);
    }
    ctx.fillStyle = ink;
    ctx.font = `800 76px ${FONT}`;
    ctx.fillText(String(v), x + (k ? 36 : 0), 945);
    ctx.fillStyle = "#8a8170";
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(label, x + (k ? 36 : 0), 990);
  });

  // 今日一词
  ctx.fillStyle = "#fffdf8";
  roundRect(ctx, 80, 1040, W - 160, 290, 36);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,90,50,0.18)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = red;
  ctx.fillRect(80, 1080, 10, 210);
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText("今日一词", 130, 1100);
  ctx.fillStyle = ink;
  fitWord(ctx, info.word.w, W - 300, 92, 54);
  ctx.fillText(info.word.w, 128, 1196);
  const wordW = ctx.measureText(info.word.w).width;
  if (info.word.p && wordW < W - 520) {
    ctx.fillStyle = "#8a8170";
    ctx.font = PH_FONT;
    ctx.fillText(`/${info.word.p[0]}/`, 128 + wordW + 24, 1192);
  }
  ctx.fillStyle = "#3a3e4f";
  ctx.font = `500 36px ${FONT}`;
  wrap(ctx, shortMeaning(info.word, 2), W - 300, 2).forEach((line, k) => ctx.fillText(line, 130, 1254 + k * 48));

  ctx.fillStyle = "#8a8170";
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText("离线 · 无广告 · 不用注册", 100, 1395);
  ctx.textAlign = "right";
  ctx.fillText("by Q1f730", W - 80, 1395);
  ctx.textAlign = "left";
}

/** 夜读：深蓝夜空 + 金色月亮 + 居中大字 */
function drawNight(ctx: CanvasRenderingContext2D, info: ShareInfo) {
  const gold = "#f2c46d";
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#252e52");
  g.addColorStop(1, "#0f1324");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 星星（固定伪随机，图每次一样）
  let seed = 7;
  const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let k = 0; k < 70; k++) {
    const x = r() * W;
    const y = r() * 760;
    const s = r() * 3 + 1;
    ctx.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  // 月亮：金色圆被背景色圆挖掉一块
  const glow = ctx.createRadialGradient(W - 200, 210, 20, W - 200, 210, 260);
  glow.addColorStop(0, "rgba(242,196,109,0.35)");
  glow.addColorStop(1, "rgba(242,196,109,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(W - 460, 0, 460, 470);
  // 月牙：先画满月，再用偏移的圆挖掉一块（在小画布上做，不影响背景）
  const moon = document.createElement("canvas");
  moon.width = 220;
  moon.height = 220;
  const mc = moon.getContext("2d");
  if (mc) {
    mc.fillStyle = gold;
    mc.beginPath();
    mc.arc(110, 110, 92, 0, Math.PI * 2);
    mc.fill();
    mc.globalCompositeOperation = "destination-out";
    mc.beginPath();
    mc.arc(150, 80, 84, 0, Math.PI * 2);
    mc.fill();
    ctx.drawImage(moon, W - 310, 100);
  }

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText(dateLine(info.day), 80, 130);
  ctx.fillStyle = "#fff";
  ctx.font = `800 62px ${FONT}`;
  ctx.fillText("四级单词打卡", 80, 215);

  ctx.textAlign = "center";
  ctx.fillStyle = gold;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText("连 续 打 卡", W / 2, 380);
  ctx.fillStyle = "#fff";
  ctx.font = `800 300px ${FONT}`;
  ctx.fillText(String(info.streak), W / 2 - 30, 650);
  const sw = ctx.measureText(String(info.streak)).width;
  ctx.textAlign = "left";
  ctx.fillStyle = gold;
  ctx.font = `800 60px ${FONT}`;
  ctx.fillText("天", W / 2 - 30 + sw / 2 + 16, 645);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText(`累计 ${info.totalDays} 天`, W / 2, 720);

  // 7 天小点
  const week = info.week ?? [];
  const labels = weekLabels(info.day);
  for (let k = 0; k < 7; k++) {
    const cx = W / 2 + (k - 3) * 96;
    ctx.beginPath();
    ctx.arc(cx, 800, 22, 0, Math.PI * 2);
    ctx.fillStyle = week[k] ? gold : "rgba(255,255,255,0.12)";
    ctx.fill();
    ctx.fillStyle = k === 6 ? "#fff" : "rgba(255,255,255,0.55)";
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(k === 6 ? "今" : labels[k], cx, 860);
  }

  // 数据格
  const stats = [
    ["今日新学", info.learned],
    ["今日复习", info.reviewed],
    ["累计学过", info.totalWords],
  ] as const;
  const bw = (W - 160 - 40) / 3;
  stats.forEach(([label, v], k) => {
    const x = 80 + k * (bw + 20);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    roundRect(ctx, x, 910, bw, 170, 32);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `800 70px ${FONT}`;
    ctx.fillText(String(v), x + bw / 2, 1000);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(label, x + bw / 2, 1048);
  });

  // 今日一词
  ctx.fillStyle = "rgba(242,196,109,0.10)";
  roundRect(ctx, 80, 1110, W - 160, 236, 36);
  ctx.fill();
  ctx.strokeStyle = "rgba(242,196,109,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = gold;
  fitWord(ctx, info.word.w, 520, 76, 44);
  ctx.fillText(info.word.w, 130, 1200);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = `500 32px ${FONT}`;
  wrap(ctx, shortMeaning(info.word, 2), W - 280, 2).forEach((line, k) => ctx.fillText(line, 130, 1258 + k * 44));
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = `700 26px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText("今日一词", W - 130, 1160);

  ctx.font = `600 28px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("离线 · 无广告 · 不用注册", 80, 1395);
  ctx.textAlign = "right";
  ctx.fillText("by Q1f730", W - 80, 1395);
  ctx.textAlign = "left";
}

/** 浏览器能不能直接分享图片文件（Web Share API Level 2） */
export function canShareFile(file: File, nav: Navigator | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  try {
    return !!nav && typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * 分享打卡图：支持系统分享就直接调起（微信 / QQ 等出现在系统分享面板里），
 * 不支持或分享失败时下载图片。用户取消分享不算失败、不下载。
 */
export async function shareImage(
  blob: Blob,
  name: string,
  fallback: () => void,
  nav: Navigator | undefined = typeof navigator === "undefined" ? undefined : navigator,
): Promise<"shared" | "cancelled" | "downloaded"> {
  const file = new File([blob], name, { type: blob.type || "image/png" });
  if (nav && canShareFile(file, nav)) {
    try {
      await nav.share({ files: [file], title: "四级单词打卡", text: "我在坚持背四级单词" });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled";
    }
  }
  fallback();
  return "downloaded";
}
