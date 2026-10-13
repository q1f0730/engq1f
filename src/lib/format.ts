export function fmtDate(day: string, withYear = false) {
  const [y, m, d] = day.split("-").map(Number);
  return `${withYear ? `${y}年` : ""}${m}月${d}日`;
}

export function fmtMinutes(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 1) return ms > 0 ? "<1 分钟" : "0 分钟";
  if (m < 60) return `${m} 分钟`;
  return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
}

export function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 11.2 · 百分比只在这里格式化：输入 0–1 的小数（0.54 → "54%"），超界夹到 0–100 */
export function fmtPct(frac: number | null | undefined): string {
  if (frac === null || frac === undefined || !Number.isFinite(frac)) return "—";
  return `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
}

/** 两个比例的变化，用「百分点」：0.57 → 0.54 = 「比上周低 3 个百分点」 */
export function fmtPctDelta(cur: number | null, prev: number | null, than = "上周"): string | null {
  if (cur === null || prev === null) return null;
  const d = Math.round(cur * 100) - Math.round(prev * 100);
  return d === 0 ? `和${than}持平` : `比${than}${d > 0 ? "高" : "低"} ${Math.abs(d)} 个百分点`;
}

/** 紧凑时长（统计小格用，不截断）：「12 时 5 分」 */
export function fmtMinutesShort(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 60) return m < 1 ? (ms > 0 ? "<1分" : "0分") : `${m}分`;
  return `${Math.floor(m / 60)}时${m % 60 ? `${m % 60}分` : ""}`;
}
