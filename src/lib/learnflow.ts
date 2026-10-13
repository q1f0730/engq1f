/**
 * v9 · 新词学习流程（纯函数）：新词预习斩词、学后速测的出题与小结
 */
import { kill, logAnswer, type Card, type DayLog, type Rating } from "./srs";
import { appendRev, type RevEntry } from "./stats";

/** 预习里斩掉的词：没学过的标记永久掌握，按「新词首答认识」计入当天日志与复习日志 */
export function applyPreviewKill(
  st: { cards: Record<string, Card>; log: Record<string, DayLog>; revlog: RevEntry[] },
  words: string[],
  day: string,
  rev: (w: string, card: Card) => RevEntry,
): { cards: Record<string, Card>; log: Record<string, DayLog>; revlog: RevEntry[] } {
  const cards = { ...st.cards };
  let log = st.log[day];
  let revlog = st.revlog;
  let n = 0;
  for (const w of new Set(words)) {
    if (cards[w]) continue;
    cards[w] = kill(undefined, day);
    log = logAnswer(log, "new", "know");
    revlog = appendRev(revlog, rev(w, cards[w]));
    n++;
  }
  if (!n) return st;
  return { cards, log: { ...st.log, [day]: log! }, revlog };
}

/** 学后速测出哪些词：本组答过的词里，去掉斩掉的（以及词库里没有的） */
export function postQuizWords(firsts: Record<string, Rating>, cards: Record<string, Card | undefined>, has: (w: string) => boolean = () => true): string[] {
  return Object.keys(firsts).filter((w) => !cards[w]?.k && has(w));
}

/** 速测小结：答对数、总数、答错的词、正确率 */
export function postSummary(res: Record<string, boolean> | null | undefined) {
  const words = res ? Object.keys(res) : [];
  const wrong = words.filter((w) => !res![w]);
  const n = words.length;
  return { n, ok: n - wrong.length, wrong, pct: n ? Math.round(((n - wrong.length) / n) * 100) : 0 };
}

/** 「错词再练」的词：本组首答不是「认识」的 + 速测答错的（去重，保持顺序） */
export function retryWords(firsts: Record<string, Rating>, res?: Record<string, boolean> | null): string[] {
  const out = Object.keys(firsts).filter((w) => firsts[w] !== "know");
  for (const w of postSummary(res).wrong) if (!out.includes(w)) out.push(w);
  return out;
}
