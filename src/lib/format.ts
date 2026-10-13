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
