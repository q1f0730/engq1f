/**
 * v11 · 学习报告图：一张长图（1080 宽）——总进度、掌握分布、连续天数、近 30 天学习量、保持率、难词
 */
import type { WordIndex } from "./data";
import { shortMeaning } from "./data";
import type { AppState } from "./store";
import { addDays, masteryOf } from "./srs";
import { bestStreak, curStreak } from "./habit";
import { hardest, retention } from "./stats";

export interface ReportData {
  day: string;
  profile: string;
  total: number;
  /** 学过（有记录）的词 */
  learned: number;
  dist: { learning: number; mastered: number; killed: number; fresh: number };
  streak: number;
  best: number;
  checkDays: number;
  /** 近 30 天每天作答量（旧 → 新） */
  days: { day: string; n: number; r: number }[];
  studyDays30: number;
  minutes: number;
  answers: number;
  retention: number | null;
  hard: { w: string; cn: string }[];
}

export function reportData(index: WordIndex, st: AppState, day: string, profile = ""): ReportData {
  let learning = 0;
  let mastered = 0;
  let killed = 0;
  let learned = 0;
  for (const [w, c] of Object.entries(st.cards)) {
    if (!index.map.has(w)) continue;
    learned++;
    if (c.k) killed++;
    else if (masteryOf(c) === "mastered") mastered++;
    else learning++;
  }
  const total = index.list.length;
  const days = Array.from({ length: 30 }, (_, k) => {
    const d = addDays(day, k - 29);
    const l = st.log[d];
    return { day: d, n: l?.n ?? 0, r: l?.r ?? 0 };
  });
  let ms = 0;
  let answers = 0;
  for (const l of Object.values(st.log)) {
    ms += l.ms || 0;
    answers += l.a || 0;
  }
  return {
    day,
    profile,
    total,
    learned,
    dist: { learning, mastered, killed, fresh: Math.max(0, total - learned) },
    streak: curStreak(st, day),
    best: bestStreak(st),
    checkDays: st.checkins.length,
    days,
    studyDays30: days.filter((d) => d.n + d.r > 0).length,
    minutes: Math.round(ms / 60000),
    answers,
    retention: retention(st.revlog ?? [], day).rate,
    hard: hardest(st.cards, 5)
      .filter((w) => index.map.has(w))
      .map((w) => ({ w, cn: shortMeaning(index.map.get(w)!, 1) })),
  };
}

const FONT = `"Inter", -apple-system, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`;
export const REPORT_W = 1080;
export const REPORT_H = 2540;
const C = {
  bg: "#faf7f2",
  ink: "#1f2230",
  sub: "#6b6f80",
  card: "#ffffff",
  line: "#ece5da",
  brand: "#d9452c",
  know: "#1f9d7a",
  vague: "#e0a128",
  fresh: "#e7e1d6",
  kill: "#1f2230",
};

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function card(ctx: CanvasRenderingContext2D, y: number, h: number, title: string) {
  ctx.fillStyle = C.card;
  rr(ctx, 60, y, REPORT_W - 120, h, 44);
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = C.sub;
  ctx.font = `700 32px ${FONT}`;
  ctx.fillText(title, 110, y + 70);
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/** 画报告长图 */
export function drawReport(d: ReportData): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = REPORT_W;
  c.height = REPORT_H;
  const ctx = c.getContext("2d")!;
  const W = REPORT_W;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, REPORT_H);

  // 顶部：朱砂渐变头图
  const g = ctx.createLinearGradient(0, 0, W, 520);
  g.addColorStop(0, "#ee6a3c");
  g.addColorStop(1, "#b92f26");
  ctx.fillStyle = g;
  rr(ctx, 0, -60, W, 580, 60);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  for (let y = 30; y < 500; y += 36) for (let x = 30; x < W; x += 36) ctx.fillRect(x, y, 3, 3);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `600 36px ${FONT}`;
  const [y0, m0, d0] = d.day.split("-");
  ctx.fillText(`${y0} 年 ${Number(m0)} 月 ${Number(d0)} 日${d.profile ? ` · ${d.profile}` : ""}`, 80, 120);
  ctx.fillStyle = "#fff";
  ctx.font = `800 76px ${FONT}`;
  ctx.fillText("我的四级学习报告", 80, 220);

  // 总进度
  const p = pct(d.learned, d.total);
  ctx.font = `800 170px ${FONT}`;
  ctx.fillText(String(d.learned), 74, 400);
  const lw = ctx.measureText(String(d.learned)).width;
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText(`/ ${d.total} 词`, 74 + lw + 18, 396);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  rr(ctx, 80, 440, W - 160, 26, 13);
  ctx.fill();
  ctx.fillStyle = "#ffd166";
  rr(ctx, 80, 440, Math.max(26, ((W - 160) * p) / 100), 26, 13);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `600 32px ${FONT}`;
  ctx.fillText(`已学 ${p}% · 已掌握 ${d.dist.mastered + d.dist.killed} 词`, 80, 510);

  // 掌握分布
  let y = 580;
  card(ctx, y, 330, "掌握分布");
  const segs = [
    { k: "已掌握", v: d.dist.mastered, c: C.know },
    { k: "已斩", v: d.dist.killed, c: C.kill },
    { k: "学习中", v: d.dist.learning, c: C.vague },
    { k: "未学", v: d.dist.fresh, c: C.fresh },
  ];
  const bx = 110;
  const bw = W - 220;
  let x = bx;
  ctx.save();
  rr(ctx, bx, y + 110, bw, 56, 28);
  ctx.clip();
  for (const s of segs) {
    const w = d.total ? (bw * s.v) / d.total : 0;
    ctx.fillStyle = s.c;
    ctx.fillRect(x, y + 110, w, 56);
    x += w;
  }
  ctx.restore();
  segs.forEach((s, k) => {
    const cx = bx + (k % 2) * (bw / 2);
    const cy = y + 230 + Math.floor(k / 2) * 64;
    ctx.fillStyle = s.c;
    rr(ctx, cx, cy - 26, 30, 30, 8);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.font = `700 36px ${FONT}`;
    ctx.fillText(`${s.k} ${s.v}`, cx + 46, cy);
    const tw = ctx.measureText(`${s.k} ${s.v}`).width;
    ctx.fillStyle = C.sub;
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(`${pct(s.v, d.total)}%`, cx + 60 + tw, cy);
  });

  // 坚持
  y += 370;
  card(ctx, y, 300, "坚持");
  const cells = [
    { v: d.streak, u: "天", k: "当前连续" },
    { v: d.best, u: "天", k: "最长连续" },
    { v: d.checkDays, u: "天", k: "累计打卡" },
  ];
  const cw = (W - 220) / 3;
  cells.forEach((s, k) => {
    const cx = 110 + k * cw;
    ctx.fillStyle = k === 0 ? C.brand : C.ink;
    ctx.font = `800 96px ${FONT}`;
    ctx.fillText(String(s.v), cx, y + 200);
    const vw = ctx.measureText(String(s.v)).width;
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText(s.u, cx + vw + 8, y + 198);
    ctx.fillStyle = C.sub;
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(s.k, cx, y + 250);
  });

  // 近 30 天
  y += 340;
  card(ctx, y, 470, "近 30 天学习量");
  ctx.fillStyle = C.sub;
  ctx.font = `600 28px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`学了 ${d.studyDays30} 天`, W - 110, y + 70);
  ctx.textAlign = "left";
  const max = Math.max(1, ...d.days.map((v) => v.n + v.r));
  const gx = 110;
  const gw = W - 220;
  const gh = 280;
  const gy = y + 110;
  const step = gw / 30;
  d.days.forEach((v, k) => {
    const hn = (gh * v.n) / max;
    const hr = (gh * v.r) / max;
    const bx2 = gx + k * step + step * 0.15;
    const bwid = step * 0.7;
    if (v.n + v.r === 0) {
      ctx.fillStyle = C.fresh;
      rr(ctx, bx2, gy + gh - 8, bwid, 8, 4);
      ctx.fill();
      return;
    }
    ctx.fillStyle = C.know;
    ctx.fillRect(bx2, gy + gh - hr, bwid, hr);
    ctx.fillStyle = C.brand;
    ctx.fillRect(bx2, gy + gh - hr - hn, bwid, hn);
  });
  ctx.fillStyle = C.sub;
  ctx.font = `500 26px ${FONT}`;
  const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8))}`;
  ctx.fillText(md(d.days[0].day), gx, gy + gh + 44);
  ctx.textAlign = "right";
  ctx.fillText("今天", gx + gw, gy + gh + 44);
  ctx.textAlign = "left";
  [
    { k: "新学", c: C.brand },
    { k: "复习", c: C.know },
  ].forEach((s, k) => {
    const lx = W / 2 - 120 + k * 140;
    ctx.fillStyle = s.c;
    rr(ctx, lx, gy + gh + 22, 24, 24, 6);
    ctx.fill();
    ctx.fillStyle = C.sub;
    ctx.fillText(s.k, lx + 34, gy + gh + 44);
  });

  // 记忆质量
  y += 510;
  card(ctx, y, 250, "记忆质量");
  const q = [
    { v: d.retention === null ? "—" : `${d.retention}%`, k: "30 天保持率" },
    { v: String(d.answers), k: "累计作答" },
    { v: d.minutes >= 60 ? `${Math.floor(d.minutes / 60)}h${d.minutes % 60 ? `${d.minutes % 60}m` : ""}` : `${d.minutes}m`, k: "累计用时" },
  ];
  q.forEach((s, k) => {
    const cx = 110 + k * cw;
    ctx.fillStyle = C.ink;
    ctx.font = `800 72px ${FONT}`;
    ctx.fillText(s.v, cx, y + 175);
    ctx.fillStyle = C.sub;
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(s.k, cx, y + 220);
  });

  // 难词
  y += 290;
  card(ctx, y, 330, "最难啃的词");
  if (!d.hard.length) {
    ctx.fillStyle = C.sub;
    ctx.font = `500 34px ${FONT}`;
    ctx.fillText("还没有忘过的词，继续保持", 110, y + 180);
  } else {
    d.hard.slice(0, 5).forEach((h, k) => {
      const cy = y + 135 + k * 42;
      ctx.fillStyle = k < 3 ? C.brand : C.ink;
      ctx.font = `700 32px ${FONT}`;
      ctx.fillText(h.w, 110, cy);
      ctx.fillStyle = C.sub;
      ctx.font = `500 26px ${FONT}`;
      let cn = h.cn;
      while (cn && ctx.measureText(cn).width > W - 520) cn = cn.slice(0, -1);
      ctx.fillText(cn === h.cn ? cn : cn + "…", 420, cy);
    });
  }

  ctx.fillStyle = C.sub;
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText("四级单词打卡 · 离线 · 无广告 · 不用注册", 80, REPORT_H - 60);
  ctx.textAlign = "right";
  ctx.fillText("by Q1f730", W - 80, REPORT_H - 60);
  ctx.textAlign = "left";
  return c;
}
