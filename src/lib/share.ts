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
}

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

/** 生成打卡分享图（1080×1440 PNG） */
export function drawShareCard(info: ShareInfo): HTMLCanvasElement {
  const W = 1080;
  const H = 1440;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

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

  const [y, m, d] = info.day.split("-");
  const week = ["日", "一", "二", "三", "四", "五", "六"][new Date(info.day + "T12:00:00").getDay()];
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `600 38px ${FONT}`;
  ctx.fillText(`${y} 年 ${Number(m)} 月 ${Number(d)} 日 · 星期${week}`, 80, 130);

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
  let size = 112;
  ctx.font = `800 ${size}px ${FONT}`;
  while (ctx.measureText(info.word.w).width > W - 280 && size > 60) {
    size -= 6;
    ctx.font = `800 ${size}px ${FONT}`;
  }
  ctx.fillText(info.word.w, 136, 1100);
  if (info.word.p) {
    ctx.fillStyle = "#6b6f80";
    ctx.font = `500 36px "Lucida Sans Unicode", "Segoe UI", "Noto Sans", "DejaVu Sans", sans-serif`;
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
  return c;
}
