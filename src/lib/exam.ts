/**
 * v4 · 四级备考冲刺（纯函数）
 *  - 考试日期与倒计时、冲刺计划
 *  - 三种新题型：一词多义（选不属于的释义）/ 词性判断 / 短语挖空
 *  - 模拟小测：20 题混合题型、评分、历史
 *  - 核心未掌握清单
 */
import { confusables, isInflection } from "./confusables";
import { optionMeaning, posOf, shortMeaning, type Word, type WordIndex } from "./data";
import { cleanPhraseCn, hasGoodPhrase, listenOptions, newWordsLeft, phraseFor, phraseOptions, quizOptions, registerV4Modes } from "./plan";
import { DAILY_OPTIONS, type AppState } from "./store";
import { addDays, diffDays, hashStr, rng, shuffle, type QuizMode } from "./srs";
import { exampleCloze, hasExampleCloze } from "./examples";

// ---------------------------------------------------------------- 考试日期

/** 已公布的笔试日期（12/2026 来自中国教育考试网 cet.neea.edu.cn 2026-09-02 公告） */
export const OFFICIAL_EXAMS = ["2024-06-15", "2024-12-14", "2025-06-14", "2025-12-13", "2026-06-13", "2026-12-12"];

/** 某年某月的第二个星期六（未公布的场次按近年规律预估） */
export function secondSaturday(year: number, month: number): string {
  const d = new Date(year, month - 1, 1, 12);
  const first = 1 + ((6 - d.getDay() + 7) % 7);
  const day = first + 7;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 某一场（年 + 6/12 月）的日期：已公布用官方日期，否则预估 */
export function examOf(year: number, month: 6 | 12): { day: string; official: boolean } {
  const pre = `${year}-${String(month).padStart(2, "0")}`;
  const hit = OFFICIAL_EXAMS.find((d) => d.startsWith(pre));
  return hit ? { day: hit, official: true } : { day: secondSaturday(year, month), official: false };
}

/** 从今天起接下来的 n 场考试（考试当天也算「接下来」） */
export function upcomingExams(today: string, n = 2): { day: string; official: boolean }[] {
  const out: { day: string; official: boolean }[] = [];
  let y = Number(today.slice(0, 4));
  let m: 6 | 12 = 6;
  while (out.length < n) {
    const e = examOf(y, m);
    if (e.day >= today) out.push(e);
    if (m === 6) m = 12;
    else {
      m = 6;
      y += 1;
    }
  }
  return out;
}

export function nextExamDate(today: string): string {
  return upcomingExams(today, 1)[0].day;
}

/** 实际使用的考试日：用户设置的日期还没过就用它，否则自动换成下一场 */
export function effectiveExam(today: string, setting?: string): { day: string; custom: boolean } {
  if (setting && /^\d{4}-\d{2}-\d{2}$/.test(setting) && setting >= today) return { day: setting, custom: true };
  return { day: nextExamDate(today), custom: false };
}

/** 距离考试还有几天（考试当天 = 0） */
export function daysUntil(today: string, exam: string): number {
  return Math.max(0, diffDays(today, exam));
}

// ---------------------------------------------------------------- 冲刺计划

export interface SprintPlan {
  daysLeft: number;
  /** 留给最后复习的天数（不学新词） */
  reserve: number;
  /** 建议每日新词（取设置里的档位） */
  daily: number;
  /** 精确需要的每日新词 */
  need: number;
  /** 最高档也来不及 */
  tooMany: boolean;
  /** 按建议学完新词的日期 */
  finish: string;
  newLeft: number;
}

/** 最后留几天只复习：>30 天留 14 天；10~30 天留三分之一；更少不留 */
export function reserveDays(daysLeft: number): number {
  if (daysLeft > 30) return 14;
  if (daysLeft > 10) return Math.floor(daysLeft / 3);
  return 0;
}

export function sprintPlan(today: string, exam: string, newLeft: number): SprintPlan {
  const daysLeft = daysUntil(today, exam);
  const reserve = reserveDays(daysLeft);
  const learnDays = Math.max(1, daysLeft - reserve);
  const need = newLeft > 0 ? Math.ceil(newLeft / learnDays) : 0;
  const opt = DAILY_OPTIONS.find((n) => n >= need);
  const daily = need === 0 ? DAILY_OPTIONS[0] : (opt ?? DAILY_OPTIONS[DAILY_OPTIONS.length - 1]);
  const finish = newLeft > 0 ? addDays(today, Math.ceil(newLeft / daily) - 1) : today;
  return { daysLeft, reserve, daily, need, tooMany: need > DAILY_OPTIONS[DAILY_OPTIONS.length - 1], finish, newLeft };
}

// ---------------------------------------------------------------- 一词多义

/** 一个词的所有义项（按词性行拆开、去重、去掉括号里的说明） */
export function senses(word: Word, onlyPos?: string): string[] {
  const out: string[] = [];
  for (const [pos, m] of word.t) {
    if (onlyPos && !posFamilies({ w: word.w, t: [[pos, m]] }).has(onlyPos)) continue;
    for (const raw of m.split(/[；;，,]/)) {
      const s = raw.replace(/[（(][^）)]*[）)]/g, "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, "").trim();
      if (s && s.length <= 10 && !/[A-Za-z]/.test(s) && !out.includes(s)) out.push(s);
    }
  }
  return out;
}

/** 至少 3 个义项才出一词多义题 */
export const POLY_MIN = 3;
export const isPoly = (word: Word | undefined) => !!word && senses(word).length >= POLY_MIN;

const shareChar = (a: string, b: string) => [...a].some((ch) => /[\u4e00-\u9fa5]/.test(ch) && b.includes(ch));

export interface Choice {
  text: string;
  /** 选项下方的补充（答完显示） */
  sub?: string;
  correct: boolean;
  /** 英文选项用展示字体 */
  en?: boolean;
}

/** 一词多义：本词的 3 个义项 + 1 个别的词的义项，选出「不属于」的那个 */
export function polyChoices(index: WordIndex, word: Word, seed: number): Choice[] {
  const own = senses(word);
  const shown = shuffle(own, (hashStr(word.w + "po") ^ seed) >>> 0).slice(0, 3);
  const pool = index.byPos.get(posOf(word)) ?? index.list;
  const r = rng((hashStr(word.w + "pf") ^ seed) >>> 0);
  // 词尾一致（都以「的」结尾的形容词义项，干扰项也要以「的」结尾），免得一眼看出
  const tail = (x: string) => (/[的地]$/.test(x) ? x.slice(-1) : "");
  const tails = new Set(shown.map(tail));
  const shownTail = tails.size === 1 ? [...tails][0] : null;
  const avgLen = shown.reduce((a, x) => a + x.length, 0) / Math.max(1, shown.length);
  let foreign: { s: string; from: Word } | null = null;
  for (let pass = 0; pass < 2 && !foreign; pass++) {
    for (let k = 0; k < 300 && !foreign; k++) {
      const src = pass === 0 ? pool : index.list;
      const c = src[Math.floor(r() * src.length)];
      if (!c || c.w === word.w) continue;
      const cand = senses(c, pass === 0 ? posOf(word) : undefined).filter(
        (s) =>
          !own.some((o) => o === s || o.includes(s) || s.includes(o) || (pass === 0 && shareChar(o, s))) &&
          (pass === 1 || (s.length >= 2 && Math.abs(s.length - avgLen) <= 2 && (shownTail === null || tail(s) === shownTail))),
      );
      if (cand.length) foreign = { s: cand[Math.floor(r() * cand.length)], from: c };
    }
  }
  const odd = foreign ?? { s: "（无）", from: word };
  const list: Choice[] = [
    ...shown.map((s) => ({ text: s, correct: false })),
    { text: odd.s, correct: true, sub: `这是 ${odd.from.w} 的意思` },
  ];
  return shuffle(list, (hashStr(word.w + "pc") ^ seed) >>> 0);
}

// ---------------------------------------------------------------- 词性判断

export const POS_CHOICES = ["n", "v", "adj", "adv"] as const;
export type MainPos = (typeof POS_CHOICES)[number];
export const POS_NAME: Record<MainPos, string> = { n: "名词", v: "动词", adj: "形容词", adv: "副词" };

/** 一个词出现过的全部词性（vt/vi → v，n&v 拆开；其他词性记为 x） */
export function posFamilies(word: Word): Set<string> {
  const out = new Set<string>();
  for (const [pos] of word.t) {
    for (const raw of pos.toLowerCase().split(/[&/,\s]+/)) {
      const p = raw.replace(/\./g, "");
      if (!p) continue;
      if (p === "v" || p === "vt" || p === "vi") out.add("v");
      else if (p === "n") out.add("n");
      else if (p === "adj" || p === "a") out.add("adj");
      else if (p === "adv" || p === "ad") out.add("adv");
      else out.add("x");
    }
  }
  return out;
}

/** 只有一个词性、且是 n/v/adj/adv 之一的词才出词性题（避免一词多性的争议） */
export function mainPos(word: Word | undefined): MainPos | null {
  if (!word) return null;
  const f = posFamilies(word);
  if (f.size !== 1) return null;
  const p = [...f][0];
  return (POS_CHOICES as readonly string[]).includes(p) ? (p as MainPos) : null;
}

export function posChoices(word: Word): Choice[] {
  const p = mainPos(word);
  return POS_CHOICES.map((c) => ({ text: `${c}. ${POS_NAME[c]}`, correct: c === p }));
}

// ---------------------------------------------------------------- 短语挖空

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wholeWord = (w: string) => new RegExp(`(^|[^A-Za-z])${esc(w)}(?=$|[^A-Za-z])`, "i");

/** 短语中文：去掉 [医] 之类的领域标记 */
const cleanCn = (cn: string) => cleanPhraseCn(cn.replace(/\[[^\]]*\]/g, ""));

/** 能挖空的短语：本词作为完整单词出现、短语里还有别的词、中文干净 */
export function clozePhrases(word: Word): [string, string][] {
  if (!word.ph?.length || /[\s.]/.test(word.w)) return [];
  const re = wholeWord(word.w);
  return word.ph
    .filter(([p, cn]) => {
      const c = cleanCn(cn);
      return re.test(p) && p.trim().split(/\s+/).length >= 2 && p.length <= 32 && !!c && c.length <= 16 && !/[A-Za-z]/.test(c);
    })
    .map(([p, cn]) => [p, cleanCn(cn)]);
}

export const isCloze = (word: Word | undefined) => !!word && clozePhrases(word).length > 0;

/** 挖空后的短语（本词换成 ____）与中文提示 */
export function clozeFor(word: Word, seed: number): { blanked: string; phrase: string; cn: string } | null {
  const list = clozePhrases(word);
  if (!list.length) return null;
  const [phrase, cn] = list[((hashStr(word.w + "cz") ^ seed) >>> 0) % list.length];
  const blanked = phrase.replace(wholeWord(word.w), (m, pre: string) => `${pre}____`);
  return { blanked, phrase, cn };
}

/** 挖空四选一：同词性、长度相近、不是本词变形、不出现在短语里 */
export function clozeChoices(index: WordIndex, word: Word, seed: number): Choice[] {
  const cz = clozeFor(word, seed);
  const lw = word.w.toLowerCase();
  const pool = (index.byPos.get(posOf(word)) ?? index.list).filter((c) => {
    const cw = c.w.toLowerCase();
    return cw !== lw && /^[a-z]+$/.test(c.w) && Math.abs(cw.length - lw.length) <= 3 && !isInflection(cw, lw) && !(cz && wholeWord(cw).test(cz.phrase));
  });
  const src = pool.length >= 3 ? pool : index.list.filter((c) => c.w !== word.w && !/[\s.]/.test(c.w));
  const r = rng((hashStr(word.w + "cd") ^ seed) >>> 0);
  const picked: Word[] = [];
  const seen = new Set([lw]);
  for (let k = 0; picked.length < 3 && k < 400; k++) {
    const c = src[Math.floor(r() * src.length)];
    if (!c || seen.has(c.w.toLowerCase())) continue;
    seen.add(c.w.toLowerCase());
    picked.push(c);
  }
  const list: Choice[] = [word, ...picked].map((o) => ({ text: o.w, sub: shortMeaning(o, 1), correct: o.w === word.w, en: true }));
  return shuffle(list, (hashStr(word.w + "cs") ^ seed) >>> 0);
}

// ---------------------------------------------------------------- 统一的题目

export const V4_MODES: QuizMode[] = ["poly", "pos", "cloze"];

/** 复习里能换上的 v4 题型 */
export function v4ModesFor(index: WordIndex, w: string): QuizMode[] {
  const word = index.map.get(w);
  return word ? V4_MODES.filter((m) => eligible(index, word, m)) : [];
}
registerV4Modes(v4ModesFor);

/** 这个词能不能出某种题 */
export function eligible(index: WordIndex, word: Word, mode: QuizMode): boolean {
  switch (mode) {
    case "poly":
      return isPoly(word);
    case "pos":
      return mainPos(word) !== null;
    case "cloze":
      return isCloze(word);
    case "phrase":
      return hasGoodPhrase(word);
    case "listen":
      return confusables(index, word).length > 0;
    case "cnphrase":
      return hasGoodPhrase(word);
    case "example":
      return hasExampleCloze(word.w);
    default:
      return true;
  }
}

// ---------------------------------------------------------------- v9 · 例句选词 / 中选短语

/** 例句选词四选一：干扰项同词性、纯小写、长度相近、不是本词变形、不在句子里出现 */
export function exampleChoices(index: WordIndex, word: Word, seed: number, sentence = exampleCloze(word.w, seed)?.sentence ?? ""): Choice[] {
  const lw = word.w.toLowerCase();
  const inSentence = (cw: string) => wholeWord(cw).test(sentence);
  const ok = (c: Word) => {
    const cw = c.w.toLowerCase();
    return cw !== lw && /^[a-z]+$/.test(c.w) && Math.abs(cw.length - lw.length) <= 3 && !isInflection(cw, lw) && !inSentence(cw);
  };
  const pool = (index.byPos.get(posOf(word)) ?? index.list).filter(ok);
  const src = pool.length >= 3 ? pool : index.list.filter(ok);
  const r = rng((hashStr(word.w + "ex") ^ seed) >>> 0);
  const picked: Word[] = [];
  const seen = new Set([lw]);
  for (let k = 0; picked.length < 3 && k < 400; k++) {
    const c = src[Math.floor(r() * src.length)];
    if (!c || seen.has(c.w.toLowerCase())) continue;
    seen.add(c.w.toLowerCase());
    picked.push(c);
  }
  const list: Choice[] = [word, ...picked].map((o) => ({ text: o.w, sub: shortMeaning(o, 1), correct: o.w === word.w, en: true }));
  return shuffle(list, (hashStr(word.w + "es") ^ seed) >>> 0);
}

/** 中选短语的题干：[英文短语, 中文]（中文去掉 [化] 之类的领域标记） */
export function cnPhraseOf(word: Word, seed: number): [string, string] | undefined {
  const p = phraseFor(word, seed);
  return p ? [p[0], p[1].replace(/\[[^\]]*\]/g, "").trim() || p[1]] : undefined;
}

/** 中选短语：给短语中文，四个英文短语里选（干扰短语来自同词性的别的词，中文不重复） */
export function cnPhraseChoices(index: WordIndex, word: Word, seed: number): Choice[] {
  return phraseOptions(index, word, seed).map((o) => {
    const p = cnPhraseOf(o, seed);
    return { text: p?.[0] ?? o.w, sub: p?.[1], correct: o.w === word.w, en: true };
  });
}

/** 任意题型的四个选项（Study 与模拟小测共用） */
export function choicesFor(index: WordIndex, word: Word, mode: QuizMode, seed: number): Choice[] {
  switch (mode) {
    case "poly":
      return polyChoices(index, word, seed);
    case "pos":
      return posChoices(word);
    case "cloze":
      return clozeChoices(index, word, seed);
    case "phrase":
      return phraseOptions(index, word, seed).map((o) => ({ text: phraseFor(o, seed)?.[1] ?? optionMeaning(o), correct: o.w === word.w }));
    case "listen":
      return listenOptions(index, word, seed).map((o) => ({ text: o.w, sub: shortMeaning(o, 1), correct: o.w === word.w, en: true }));
    case "cn2en":
      return quizOptions(index, word, seed).map((o) => ({ text: o.w, correct: o.w === word.w, en: true }));
    case "example":
      return exampleChoices(index, word, seed);
    case "cnphrase":
      return cnPhraseChoices(index, word, seed);
    default:
      return quizOptions(index, word, seed).map((o) => ({ text: optionMeaning(o), correct: o.w === word.w }));
  }
}

export const MODE_LABEL: Record<QuizMode, string> = {
  en2cn: "英选中",
  cn2en: "中选英",
  audio: "听音选义",
  recall: "回想",
  phrase: "短语选义",
  listen: "听音辨词",
  poly: "一词多义",
  pos: "词性判断",
  cloze: "短语挖空",
  example: "例句选词",
  cnphrase: "中选短语",
};

export const MODE_HINT: Partial<Record<QuizMode, string>> = {
  en2cn: "选出正确的意思",
  cn2en: "选出对应的英文",
  audio: "听发音，选出意思",
  listen: "听发音，选出你听到的单词",
  phrase: "选出这个短语的意思",
  poly: "下面哪个意思「不属于」这个词？",
  pos: "这个词的词性是？",
  cloze: "选出填入空格的单词",
  example: "选出填入例句空格的单词",
  cnphrase: "选出对应的英文短语",
};

// ---------------------------------------------------------------- 模拟小测

export const MOCK_SIZE = 20;
export const MOCK_LIMIT_MS = 5 * 60 * 1000;
/** 20 题的题型配比 */
export const MOCK_PLAN: QuizMode[] = [
  ...Array<QuizMode>(3).fill("en2cn"),
  ...Array<QuizMode>(3).fill("cn2en"),
  ...Array<QuizMode>(2).fill("audio"),
  ...Array<QuizMode>(2).fill("listen"),
  ...Array<QuizMode>(2).fill("phrase"),
  ...Array<QuizMode>(3).fill("poly"),
  ...Array<QuizMode>(2).fill("pos"),
  ...Array<QuizMode>(3).fill("cloze"),
];

export interface MockQuestion {
  w: string;
  mode: QuizMode;
}

/**
 * 出卷：先从学过的词（错过的优先）里取，最多 12 个，其余从当前词书随机补。
 * 每个题型位先找能出这种题的词，找不到就退回「英选中」。
 */
export function buildMock(index: WordIndex, st: AppState, day: string, seed: number, size = MOCK_SIZE): MockQuestion[] {
  const learned = Object.keys(st.cards).filter((w) => !st.cards[w].k && index.map.has(w));
  const wrongFirst = shuffle(learned, seed).sort((a, b) => Math.min(st.cards[b].l, 2) - Math.min(st.cards[a].l, 2));
  const fromLearned = wrongFirst.slice(0, Math.min(12, Math.round(size * 0.6)));
  const taken = new Set(fromLearned);
  const book = shuffle(
    index.list.filter((w) => (st.settings.book === "all" || w.c) && /^[a-z]+$/.test(w.w) && !taken.has(w.w) && !st.cards[w.w]?.k).map((w) => w.w),
    (seed ^ hashStr(day)) >>> 0,
  );
  const pool = [...fromLearned, ...book];
  const used = new Set<string>();
  const plan = shuffle(MOCK_PLAN, seed).slice(0, size);
  while (plan.length < size) plan.push("en2cn");
  const out: MockQuestion[] = [];
  for (const mode of plan) {
    let pick: string | undefined;
    for (const w of pool) {
      if (used.has(w)) continue;
      if (eligible(index, index.map.get(w)!, mode)) {
        pick = w;
        break;
      }
    }
    if (pick) out.push({ w: pick, mode });
    else {
      const w = pool.find((x) => !used.has(x));
      if (!w) break;
      pick = w;
      out.push({ w, mode: "en2cn" });
    }
    used.add(pick);
  }
  return out;
}

export interface QuizRecord {
  /** 日期 */
  at: string;
  /** 时间戳 */
  ts: number;
  /** 题数 */
  n: number;
  /** 答对 */
  ok: number;
  /** 用时 ms */
  ms: number;
}

export const QUIZ_HISTORY_MAX = 60;

export function scoreOf(ok: number, n: number): number {
  return n ? Math.round((ok / n) * 100) : 0;
}

/** 用时：最多算到限时 */
export function clampMs(ms: number, limit = MOCK_LIMIT_MS): number {
  return Math.max(0, Math.min(limit, Math.round(ms)));
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function quizStats(list: QuizRecord[]) {
  if (!list.length) return { count: 0, best: 0, avg: 0, last: 0, trend: 0 };
  const scores = list.map((q) => scoreOf(q.ok, q.n));
  const last = scores[scores.length - 1];
  const prev = scores.length > 1 ? scores[scores.length - 2] : last;
  return {
    count: list.length,
    best: Math.max(...scores),
    avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    last,
    trend: last - prev,
  };
}

export const quizDoneOn = (st: Pick<AppState, "quizzes">, day: string) => !!st.quizzes?.some((q) => q.at === day);

// ---------------------------------------------------------------- 核心未掌握

/** 核心词里还没掌握的：未学 + 学习中（按词书顺序，斩过的不算） */
export function coreUnmastered(index: WordIndex, st: AppState): { unlearned: string[]; learning: string[] } {
  const unlearned: string[] = [];
  const learning: string[] = [];
  for (const w of index.list) {
    if (!w.c) continue;
    const c = st.cards[w.w];
    if (!c) unlearned.push(w.w);
    else if (c.st !== "mastered") learning.push(w.w);
  }
  return { unlearned, learning };
}

/** 核心未掌握的下一组：先学未学的核心词（按学习顺序、跳过搁置），都学过了就复习学习中的 */
export function coreGroupWords(index: WordIndex, st: AppState, day: string, n = 10): { words: string[]; kind: "new" | "review" } {
  const coreSet = new Set(coreUnmastered(index, st).unlearned);
  const fresh = newWordsLeft(index, { ...st, settings: { ...st.settings, book: "core" } }, day).filter((w) => coreSet.has(w));
  if (fresh.length) return { words: fresh.slice(0, n), kind: "new" };
  const learning = coreUnmastered(index, st).learning.sort((a, b) => (st.cards[a].d < st.cards[b].d ? -1 : st.cards[a].d > st.cards[b].d ? 1 : 0));
  return { words: learning.slice(0, n), kind: "review" };
}
