import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CalendarClock, Check, CircleHelp, ClipboardCheck, Dumbbell, Flame, HardDriveDownload, Keyboard, Maximize, Minimize, RotateCcw, Star, Swords, Undo2, Volume2, X } from "@/components/app/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { speak } from "@/lib/audio";
import { now, today } from "@/lib/clock";
import { shortMeaning, type Word, type WordIndex } from "@/lib/data";
import { MODE_HINT, MODE_LABEL, choicesFor, clozeFor, cnPhraseOf, coreGroupWords, type Choice } from "@/lib/exam";
import { exampleCloze } from "@/lib/examples";
import {
  aheadGroup,
  nextNewGroup,
  notebookGroup,
  phraseFor,
  practiceGroup,
  reviewGroup,
  reviewItems,
  speedGroup,
  summarize,
  dayRuleOf,
  type Notebook,
} from "@/lib/plan";
import { listGroup } from "@/lib/lists";
import { useFitLine } from "@/lib/fit";
import { buzz } from "@/lib/haptics";
import {
  addDays,
  answer,
  buryCurrent,
  diffDays,
  createSession,
  current,
  hashStr,
  isFinished,
  isLeech,
  killCurrent,
  previewIntervals,
  sessionAccuracy,
  undo,
  type Card,
  type DayLog,
  type Rating,
  type Session,
  type SessionItem,
} from "@/lib/srs";
import { applyAnswer, checkIn, todayLevel, getState, markGoalMet, onExternalChange, previewKill, setBury, snapDayRule, toggleStar, useApp } from "@/lib/store";
import { PostQuiz, PreviewList } from "./study-extra";
import { postQuizWords, postSummary, retryWords } from "@/lib/learnflow";
import { curStreak } from "@/lib/habit";
import { celebrate } from "@/lib/celebrate";
import { cn } from "@/lib/utils";
import { pickByLevel } from "@/lib/lexicon";
import { Confusables, Examples, Meanings, MorphLine, Phonetic, Phrases, Synonyms, WordSheet } from "./word-bits";
import { ShortcutsSheet } from "./shortcuts";
import { LeaveSheet, exitBack, replaceStudy, useLeaveGuard } from "./leave";
import { comeBackLine } from "@/lib/come-back";
import { useFinePointer } from "@/lib/pointer";
import { ShareSheet } from "./share-sheet";
import { useShareInfo } from "@/lib/use-share";
import { useWakeLock } from "@/lib/wakelock";
import { rankGroup, revEntry, type RevEntry } from "@/lib/stats";
import { NEW_CARD_SEC, REVIEW_CARD_SEC, estimateRemaining, historyPace, quizAnnouncement, rateAnnouncement, rateOrder, sideRating, speedOrder, swipeHint, swipeRating } from "@/lib/ux";
import { fullscreenSupported, useFullscreen } from "@/lib/fullscreen";
import { algoOptions, rateOrder4, type Grade4 } from "@/lib/algo";
import type { AlgoOptions } from "@/lib/srs";

/** v10 · 当前设置下的算法选项（每次作答现算：负荷均衡要看最新的到期分布） */
function algoNow(day: string): AlgoOptions {
  const s = getState();
  return algoOptions(s.settings, { cards: s.cards, revlog: s.revlog, today: day });
}

export type StudyMode = "new" | "review" | "ahead" | "practice" | "speed" | "core" | "list" | "rank" | Notebook;

const MODE_TITLE: Record<StudyMode, string> = {
  new: "学新词",
  review: "复习",
  ahead: "提前复习",
  practice: "错词再练",
  speed: "速刷",
  core: "核心未掌握",
  list: "词单学习",
  star: "生词本复习",
  wrong: "错词本复习",
  mastered: "已斩回顾",
  hard: "顽固词专项",
  rank: "难词榜专项",
};

function buildItems(index: WordIndex, mode: StudyMode, words: string[]): SessionItem[] {
  const st = getState();
  const day = today();
  // 13.0 · 按今天选的难度挑新词（混合 = 按乱序）
  if (mode === "new") {
    const lv = todayLevel(st, day);
    return nextNewGroup(index, st, day, lv === "mix" ? undefined : (left, n) => pickByLevel(index, st.cards, left, lv, n));
  }
  if (mode === "review") return reviewGroup(index, st, day);
  if (mode === "ahead") return aheadGroup(index, st, day);
  if (mode === "practice") return practiceGroup(index, st, words, day);
  if (mode === "speed") return speedGroup(index, st, day);
  if (mode === "core") {
    const g = coreGroupWords(index, st, day);
    return g.kind === "new" ? g.words.map((w) => ({ w, kind: "new" as const, mode: "recall" as const })) : reviewItems(index, st, g.words, day);
  }
  if (mode === "list") return listGroup(index, st, words, day).items;
  if (mode === "rank") return rankGroup(index, st, day);
  return notebookGroup(index, st, mode, day);
}

/** 11.8 · 单词标题：按实际宽度缩字号，竖屏 360 宽 / 大字号也不在字母中间换行（r8 R8-2） */
function FitWord({ w, className, testid, style }: { w: string; className: string; testid: string; style?: React.CSSProperties }) {
  const ref = useFitLine<HTMLHeadingElement>(w, 14);
  return (
    <h2 ref={ref} className={cn("w-full max-w-full self-stretch", className)} data-testid={testid} data-fit="1" style={style}>
      <span>{w}</span>
    </h2>
  );
}

/** 12.0 · 词头字号：Instrument Serif 是窄体，同样宽度能比黑体大一号；放不下再由 FitWord 按宽度缩 */
function wordSize(w: string) {
  if (w.length <= 7) return "text-[4.25rem] md:text-[5rem]";
  if (w.length <= 10) return "text-[3.5rem] md:text-[4.25rem]";
  if (w.length <= 14) return "text-[2.75rem] md:text-[3.5rem]";
  return "text-[2.375rem] md:text-[2.75rem]";
}

/** 11.4 · 跨 0 点的宽限：停了这么久（或者过了这个钟点）再接着做，就记到新的一天 */
const ROLL_IDLE_MS = 30 * 60000;
const ROLL_HOUR = 4;
/** 11.4 · 「用时」里每题最多算多久 */
const CARD_MS_CAP = 60000;

type Last = { item: SessionItem; rating: Rating; pick?: number; via: "rate" | "quiz" | "peek" };

export function Study({ index, mode, words = [], listId, listName }: { index: WordIndex; mode: StudyMode; words?: string[]; listId?: string; listName?: string }) {
  const st = useApp();
  const navigate = useNavigate();
  const router = useRouter();
  const accent = st.settings.accent;
  const leftHand = !!st.settings.leftHand;
  const swap = !!st.settings.swapSwipe;
  const frontIpa = st.settings.frontIpa !== false;
  const fourKey = !!st.settings.fourKey;
  const practice = mode === "practice";
  const speedMode = mode === "speed";
  const [items, setItems] = useState(() => buildItems(index, mode, words));
  // v9 · 新词预习：开始前先列表过一遍
  const [previewing, setPreviewing] = useState(() => mode === "new" && !!getState().settings.preview && items.length > 0);
  const previewWords = useMemo(() => items.map((i) => i.w), [items]);
  // v9 · 学后速测：idle = 还没做；run = 正在做；done = 做完（结果计入小结）
  const [post, setPost] = useState<"idle" | "run" | "done">("idle");
  const [postRes, setPostRes] = useState<Record<string, boolean> | null>(null);
  // 错词再练：作答只记在这里，不写入学习记录
  const scratch = useRef<{ cards: Record<string, Card | undefined>; log: DayLog | undefined }>({ cards: {}, log: undefined });
  const getCard = useCallback((w: string) => (practice ? scratch.current.cards[w] : getState().cards[w]), [practice]);
  const getLog = useCallback((d: string) => (practice ? scratch.current.log : getState().log[d]), [practice]);
  // 每一步是否写了复习日志（撤销时据此去掉对应的那条）
  const revSteps = useRef<boolean[]>([]);
  const put = useCallback(
    (w: string, card: Card | undefined, d: string, log: DayLog | undefined, rev?: RevEntry | "pop") => {
      if (practice) {
        scratch.current.cards[w] = card;
        scratch.current.log = log;
      } else applyAnswer(w, card, d, log, rev);
    },
    [practice],
  );
  /** 撤销一步时同步撤销日志 */
  const putUndo = useCallback(
    (w: string, card: Card | undefined, d: string, log: DayLog | undefined) => {
      const logged = revSteps.current.pop();
      put(w, card, d, log, logged ? "pop" : undefined);
    },
    [put],
  );
  const [session, setSession] = useState<Session>(() => createSession(items));
  const [phase, setPhase] = useState<"front" | "back">("front");
  const [peek, setPeek] = useState(false);
  const [last, setLast] = useState<Last | null>(null);
  const [help, setHelp] = useState(false);
  const [shake, setShake] = useState(0);
  const [turn, setTurn] = useState(0);
  // 速刷：当前词的释义是否已展开（不翻面）
  const [reveal, setReveal] = useState(false);
  const bump = () => setTurn((t) => t + 1);
  const shownAt = useRef(now());
  const startedAt = useRef(now());
  // 本组每题用时（剩余时间估算）
  const answerMs = useRef<number[]>([]);
  // 读屏播报：同一句话连说两次时加零宽字符，保证 aria-live 再次播报
  const [live, setLive] = useState("");
  const say = useCallback((t: string) => setLive((p) => (p.replace(/\u200b$/, "") === t ? t + (p.endsWith("\u200b") ? "" : "\u200b") : t)), []);
  const [focus, toggleFocus] = useFullscreen();
  const canFocus = fullscreenSupported();
  // 11.1 · 键盘相关的入口和提示只给有鼠标 / 触控板的设备
  const fine = useFinePointer();
  // 11.1 · 学到一半刷新：告诉用户刚才那几个已经存下来了
  const [resumed] = useState(() => takeResume(mode));
  const pace = useMemo(() => historyPace(getState().log), []);

  const head = current(session);
  const shownItem: SessionItem | undefined = phase === "back" && last && !peek ? last.item : head;
  const word: Word | undefined = shownItem ? index.map.get(shownItem.w) : undefined;
  const isQuiz = !!shownItem && shownItem.mode !== "recall" && !shownItem.repeat;
  const cnFirst = st.settings.cnFirst;
  const finished = isFinished(session) && phase === "front";

  const seed = (hashStr(today()) ^ turn) >>> 0;
  const options = useMemo(
    () => (word && isQuiz && shownItem ? choicesFor(index, word, shownItem.mode, seed) : []),
    // 选项只随当前题变化
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [word?.w, isQuiz, turn],
  );

  // 进入新卡片：计时 + 自动发音
  const cardKey = `${shownItem?.w ?? "none"}-${turn}`;
  useEffect(() => {
    if (phase !== "front" || !shownItem || previewing) return;
    shownAt.current = now();
    setReveal(false);
    const m = shownItem.repeat ? "recall" : shownItem.mode;
    if (m === "audio" || m === "listen" || (st.settings.autoplay && (m === "en2cn" || m === "poly" || m === "pos" || (m === "recall" && !cnFirst)))) speak(shownItem.w, accent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey, phase, previewing]);

  // 11.3 · 一组学到一半跨过 0 点：接着做的还记在开始的那一天（打卡、今日新学都按这一天算）。
  // 11.4 · 但只给一个宽限：中途停了超过 30 分钟、或者已经过了凌晨 4 点，之后的作答记到它真正发生的那一天
  const [day, setDay] = useState(() => today());
  const dayRef = useRef(day);
  const lastAct = useRef(now());
  const rollDay = useCallback(() => {
    const t = today();
    const at = now();
    // 11.5 · 只往后滚：会话中途换时区、本地日期往回跳时，这一组还记在开始的那一天（不会记到更早、已经打过卡的日子）
    if (t > dayRef.current && (at - lastAct.current > ROLL_IDLE_MS || new Date(at).getHours() >= ROLL_HOUR)) {
      dayRef.current = t;
      setDay(t);
    }
    lastAct.current = at;
    return dayRef.current;
  }, []);
  // 11.4 · 「用时」按作答累计：每题最多算 60 秒（放下手机、睡一觉不算进去）
  const activeMs = useRef(0);
  /** 11.4 · 这一天第一次作答：按当天的设置记下任务快照；作答后任务达标就记下「任务完成」 */
  const beforeAnswer = useCallback(
    (d: string) => {
      if (practice) return;
      const s0 = getState();
      if (!s0.dayRule?.[d]) snapDayRule(d, dayRuleOf(summarize(index, s0, d)));
    },
    [practice, index],
  );
  const afterAnswer = useCallback(
    (d: string) => {
      if (practice) return;
      const s1 = summarize(index, getState(), d);
      if (s1.ready && !s1.checked) markGoalMet(d);
    },
    [practice, index],
  );

  const doAnswer = useCallback(
    (rating: Rating, via: Last["via"], pick?: number, easy = false) => {
      const it = current(session);
      if (!it) return;
      const day = rollDay();
      beforeAnswer(day);
      const first = !(it.w in session.firsts);
      const spent = now() - shownAt.current;
      const algo = practice ? undefined : { ...algoNow(day), easy: easy || undefined };
      const res = answer(session, getCard(it.w), rating, day, getLog(day), spent, algo);
      answerMs.current.push(spent);
      activeMs.current += Math.min(Math.max(0, spent), CARD_MS_CAP);
      put(it.w, res.card, day, res.log, revEntry(it.w, now(), easy ? "easy" : rating, { isNew: it.kind === "new", repeat: !first, card: res.card }));
      afterAnswer(day);
      revSteps.current.push(true);
      setSession(res.session);
      buzz(rating);
      return { it, res, via, pick };
    },
    [session, getCard, getLog, put, practice, rollDay, beforeAnswer, afterAnswer],
  );

  const rate = useCallback(
    (grade: Grade4) => {
      if (!head || isQuiz) return;
      if (phase === "back" && !peek) return;
      const easy = grade === "easy";
      const rating: Rating = easy ? "know" : grade;
      const hintNext = previewIntervals(getState().cards[head.w], day, { repeat: head.w in session.firsts, early: head.early, algo: { key: head.w, ...algoNow(day) } }, easy);
      const r = doAnswer(rating, peek || speedMode ? "peek" : "rate", undefined, easy);
      if (!r) return;
      say(rateAnnouncement(r.it.w, rating, practice ? undefined : easy ? hintNext.easy : hintNext[rating]).replace("记为认识", easy ? "记为简单" : "记为认识"));
      if (peek || speedMode) {
        // 看过答案后的评分：直接下一张
        setPeek(false);
        setLast({ item: r.it, rating, via: "peek" });
        setPhase("front");
        bump();
      } else {
        setLast({ item: r.it, rating, via: "rate" });
        setPhase("back");
        if (cnFirst) speak(r.it.w, accent);
      }
    },
    [head, isQuiz, phase, peek, doAnswer, cnFirst, accent, speedMode, say, practice, day, session],
  );

  // 11.3 · 同一道题只接受第一次选择：两根手指同时按、手掌误触，同一帧里的多次点击都只算一次（同步锁，不等 React 重新渲染）
  const pickLock = useRef<string | null>(null);
  useEffect(() => {
    if (phase === "front") pickLock.current = null;
  }, [cardKey, phase]);
  const pick = useCallback(
    (k: number) => {
      if (!head || !isQuiz || phase !== "front" || !word) return;
      if (pickLock.current === cardKey) return;
      const opt = options[k];
      if (!opt) return;
      pickLock.current = cardKey;
      const ok = opt.correct;
      const r = doAnswer(ok ? "know" : "forget", "quiz", k);
      if (!r) return;
      if (!ok) setShake((x) => x + 1);
      say(quizAnnouncement(ok, word.w, options.find((o) => o.correct)?.text ?? word.w));
      setLast({ item: r.it, rating: ok ? "know" : "forget", pick: k, via: "quiz" });
      setPhase("back");
      if (shownItem?.mode === "cn2en" || shownItem?.mode === "audio" || shownItem?.mode === "listen" || shownItem?.mode === "cloze" || shownItem?.mode === "example" || shownItem?.mode === "cnphrase") speak(word.w, accent);
    },
    [head, isQuiz, phase, word, options, doAnswer, shownItem, accent, say, cardKey],
  );

  const giveUp = useCallback(() => {
    if (!isQuiz || phase !== "front" || !word) return;
    if (pickLock.current === cardKey) return;
    pickLock.current = cardKey;
    const r = doAnswer("forget", "quiz", -1);
    if (!r) return;
    say(quizAnnouncement(false, word.w, options.find((o) => o.correct)?.text ?? word.w, true));
    setLast({ item: r.it, rating: "forget", pick: -1, via: "quiz" });
    setPhase("back");
    speak(word.w, accent);
  }, [isQuiz, phase, word, doAnswer, accent, options, say, cardKey]);

  const next = useCallback(() => {
    if (speedMode) {
      // 速刷没有背面：空格只展开释义
      setReveal(true);
      return;
    }
    if (phase === "back" && !peek) {
      setPhase("front");
      bump();
      return;
    }
    if (phase === "front" && !isQuiz && head) {
      // 翻面偷看
      setPeek(true);
      setPhase("back");
      if (cnFirst) speak(head.w, accent);
    }
  }, [phase, peek, isQuiz, head, cnFirst, accent, speedMode]);

  const doUndo = useCallback(() => {
    if (peek) {
      setPeek(false);
      setPhase("front");
      return;
    }
    bump();
    const u = undo(session);
    if (!u) {
      toast("没有可以撤销的操作");
      return;
    }
    putUndo(u.w, u.card, day, u.log);
    if (!practice && getState().bury[u.w]) setBury(u.w, undefined);
    setSession(u.session);
    setLast(null);
    setPhase("front");
    toast(`已撤销：${u.w}`);
  }, [session, peek, day, putUndo, practice]);

  /** 记错了：撤销刚才的「认识/模糊」，改记为不认识 */
  const mistake = useCallback(() => {
    if (phase !== "back" || !last || last.rating === "forget" || peek) return;
    const u = undo(session);
    if (!u) return;
    putUndo(u.w, u.card, day, u.log);
    const first = !(u.w in u.session.firsts);
    const it = current(u.session);
    const res = answer(u.session, getCard(u.w), "forget", day, getLog(day), 0, practice ? undefined : algoNow(day));
    put(u.w, res.card, day, res.log, revEntry(u.w, now(), "forget", { isNew: it?.kind === "new", repeat: !first, card: res.card }));
    revSteps.current.push(true);
    setSession(res.session);
    setLast({ ...last, rating: "forget" });
    buzz("forget");
    say(rateAnnouncement(u.w, "forget"));
    toast("已改为「不认识」，稍后再来一遍");
  }, [phase, last, peek, session, day, put, putUndo, getCard, getLog, say, practice]);

  /** 背面时先撤销刚才的评分，回到这个词的正面状态 */
  const rewind = useCallback((): Session | null => {
    if (phase === "back" && last && !peek) {
      const u = undo(session);
      if (!u) return null;
      putUndo(u.w, u.card, day, u.log);
      return u.session;
    }
    return session;
  }, [phase, last, peek, session, day, putUndo]);

  const doBury = useCallback(() => {
    if (practice) return;
    const s0 = rewind();
    const it = s0 && current(s0);
    if (!s0 || !it) return;
    const day = rollDay();
    const prev = getState().cards[it.w];
    const res = buryCurrent(s0, prev, day, getState().log[day]);
    if (res.card) applyAnswer(it.w, res.card, day, getState().log[day]);
    else setBury(it.w, addDays(day, 1));
    revSteps.current.push(false);
    setSession(res.session);
    setPeek(false);
    setLast(null);
    setPhase("front");
    bump();
    toast(`明天再说：${it.w}`, { description: "不计对错，明天再出现" });
  }, [practice, rewind, rollDay]);

  const doKill = useCallback(() => {
    if (practice) return;
    const s0 = rewind();
    if (!s0) return;
    const it = current(s0);
    if (!it) return;
    const day = rollDay();
    beforeAnswer(day);
    const s = getState();
    const first = !(it.w in s0.firsts);
    const res = killCurrent(s0, s.cards[it.w], day, s.log[day]);
    applyAnswer(it.w, res.card, day, res.log, revEntry(it.w, now(), "kill", { isNew: it.kind === "new", repeat: !first, card: res.card }));
    revSteps.current.push(true);
    setSession(res.session);
    setPeek(false);
    setLast(null);
    setPhase("front");
    bump();
    afterAnswer(day);
    toast(`已斩：${it.w}`, { description: "本来就会，以后不再出现" });
  }, [practice, rewind, rollDay, beforeAnswer, afterAnswer]);

  const star = useCallback(() => {
    if (!shownItem) return;
    const had = !!getState().star[shownItem.w];
    toggleStar(shownItem.w);
    toast(had ? "已移出生词本" : "已加入生词本");
  }, [shownItem]);

  const replay = useCallback(() => shownItem && speak(shownItem.w, accent), [shownItem, accent]);

  // 键盘
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (previewing) return;
      if (help && e.key !== "?") return;
      const k = e.key.toLowerCase();
      if (k === "?" || (k === "/" && e.shiftKey)) {
        setHelp((h) => !h);
        return;
      }
      if (finished) return;
      if (k === "escape") return exitBack(router);
      if (k === " " || k === "enter") {
        e.preventDefault();
        return next();
      }
      if (k === "z") return doUndo();
      if (k === "s") return star();
      if (k === "d") return doKill();
      if (k === "b") return doBury();
      if (k === "r") return replay();
      if (k === "f" && canFocus) return toggleFocus();
      if (isQuiz && phase === "front" && ["1", "2", "3", "4"].includes(k)) return pick(Number(k) - 1);
      if (speedMode && phase === "front") {
        if (k === "arrowright") return rate(sideRating("right", swap));
        if (k === "arrowleft") return rate(sideRating("left", swap));
      }
      if (!isQuiz && (phase === "front" || peek)) {
        if (k === "1") return rate("know");
        if (k === "2") return rate("vague");
        if (k === "3") return rate("forget");
        if (k === "4" && fourKey && !speedMode) return rate("easy");
      }
      if (phase === "back" && !peek && (k === "1" || k === "2" || k === "3")) {
        // 背面按数字 = 下一个（方便连按）
        return next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [help, finished, next, doUndo, star, doKill, doBury, replay, isQuiz, phase, peek, pick, rate, navigate, speedMode, swap, canFocus, toggleFocus, previewing, fourKey]);

  useWakeLock(!finished && items.length > 0);

  // 11.1 · 学到一半：记下答过几个（刷新后提示已保存）；按返回 / × 先确认
  const answered = Object.keys(session.firsts).length;
  useEffect(() => {
    if (practice) return;
    saveResume(mode, isFinished(session) ? 0 : answered);
  }, [answered, session, mode, practice]);
  useEffect(() => () => saveResume(mode, 0), [mode]);
  // 11.2 · 别的窗口清空 / 覆盖导入 / 回滚了记录：这一组直接结束，不再往新档案里写
  const [replaced, setReplaced] = useState(false);
  useEffect(() => onExternalChange((why) => why === "replace" && setReplaced(true)), []);
  const blocker = useLeaveGuard(!replaced && !isFinished(session) && session.done.length > 0 && !previewing);

  if (replaced)
    return (
      <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center" data-testid="study-replaced">
        <div className="text-xl font-semibold">记录在另一个窗口被替换了</div>
        <p className="mt-2 text-sm text-ink-3">这一组已经结束，刚才这一题没有写进新的记录。</p>
        <button type="button" onClick={() => void router.navigate({ to: "/", replace: true })} className="press mt-6 h-12 w-full rounded-lg bg-ink font-semibold text-paper-3 hover:bg-ink-2">
          回首页
        </button>
      </div>
    );

  if (!items.length) return <Empty mode={mode} />;
  if (previewing)
    return (
      <PreviewList
        index={index}
        words={previewWords}
        accent={accent}
        onQuit={() => exitBack(router)}
        onStart={(killed) => {
          if (killed.length) {
            previewKill(killed, day, (w, card) => revEntry(w, now(), "kill", { isNew: true, card }));
            toast(`已斩 ${killed.length} 个`, { description: "本来就会，以后不再出现" });
          }
          const rest = items.filter((it) => !killed.includes(it.w));
          if (rest.length) {
            setItems(rest);
            setSession(createSession(rest));
            setPreviewing(false);
            startedAt.current = now();
            return;
          }
          // 整组都认识：换下一组继续预习
          const more = buildItems(index, mode, words);
          setItems(more);
          if (more.length) setSession(createSession(more));
        }}
      />
    );
  const postWords = finished && mode === "new" ? postQuizWords(session.firsts, getState().cards, (w) => index.map.has(w)) : [];
  if (finished && postWords.length && (post === "run" || (post === "idle" && st.settings.postQuiz)))
    return (
      <PostQuiz
        index={index}
        words={postWords}
        accent={accent}
        seed={hashStr(day + postWords.join())}
        onSkip={() => setPost("done")}
        onDone={(r) => {
          setPostRes(r);
          setPost("done");
        }}
      />
    );
  if (finished)
    return (
      <Summary
        session={session}
        index={index}
        mode={mode}
        ms={activeMs.current}
        listId={listId}
        postRes={postRes}
        day={day}
        onPostQuiz={postWords.length && post === "idle" ? () => setPost("run") : undefined}
      />
    );
  if (!shownItem || !word) return null;

  const starred = !!st.star[word.w];
  const total = session.total;
  const doneN = session.done.length;
  const flipped = phase === "back" && !isQuiz;
  const relearn = !!shownItem.repeat;
  const leech = !practice && isLeech(st.cards[word.w]);
  const eta = estimateRemaining(session.queue.length, answerMs.current, pace, (mode === "new" ? NEW_CARD_SEC : REVIEW_CARD_SEC) * 1000);
  const preview =
    !practice && head && !isQuiz && (phase === "front" || peek)
      ? previewIntervals(getState().cards[head.w], day, { repeat: head.w in session.firsts, early: head.early, algo: { key: head.w, ...algoNow(day) } }, fourKey)
      : null;

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col bg-paper px-4 pb-safe md:py-6" data-testid="study" data-mode={mode}>
      {/* 顶栏：只留退出和进度（11.1 · 撤销 / 明天再说 / 收藏放到卡片下面，带文字） */}
      <div className="flex shrink-0 items-center gap-1.5 pt-3 pt-safe md:gap-2">
        <button type="button" onClick={() => exitBack(router)} aria-label="退出" data-testid="study-quit" className="press -ml-2 grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-paper-2 hover:text-ink">
          <X className="size-[22px]" />
        </button>
        {/* 12.0 · 进度：一格一个词，答过的涂上荧光笔（超过 30 个就退回一条连续的） */}
        <div className="flex flex-1 items-center" aria-hidden>
          {total <= 30 ? (
            <div className="flex h-2 w-full gap-[3px]">
              {Array.from({ length: total }, (_, k) => (
                <span key={k} className={cn("h-full flex-1 rounded-[2px] transition-colors duration-300", k < doneN ? "bg-ink" : k === doneN ? "bg-mark" : "bg-rule")} />
              ))}
            </div>
          ) : (
            <div className="relative h-2 w-full overflow-hidden rounded-[2px] bg-rule">
              <div className="absolute inset-0 origin-left bg-ink transition-transform duration-500 ease-[var(--ease-spring)]" style={{ transform: `scaleX(${doneN / total})` }} />
            </div>
          )}
        </div>
        <span className="tnum min-w-12 text-right font-serif text-[1.125rem] leading-none text-ink" data-testid="progress">
          {doneN}/{total}
        </span>
        {canFocus && fine && (
          <IconBtn label={focus ? "退出专注 (F)" : "专注模式 (F)"} onClick={toggleFocus} testid="focus" active={focus} pressed={focus}>
            {focus ? <Minimize className="size-[18px]" /> : <Maximize className="size-[18px]" />}
          </IconBtn>
        )}
        {fine && (
          <IconBtn label="快捷键 (?)" onClick={() => setHelp(true)} testid="kbd-help">
            <Keyboard className="size-[18px]" />
          </IconBtn>
        )}
      </div>

      <div className="mt-1.5 flex h-6 shrink-0 items-center gap-2 overflow-hidden text-[0.75rem] text-ink-3">
        <span className="max-w-[10em] truncate" data-testid="study-title">{mode === "list" && listName ? `词单 · ${listName}` : MODE_TITLE[mode]}</span>
        {relearn && <span className="rounded-[3px] bg-forget-soft px-1.5 font-medium text-forget" data-testid="relearn-tag">再来一遍</span>}
        {isQuiz && <span className="rounded-[3px] px-1.5 text-ink-2 ring-1 ring-rule-strong ring-inset">{MODE_LABEL[shownItem.mode]}</span>}
        {word.c && <span className="rounded-[3px] bg-mark px-1.5 font-medium text-mark-ink">核心</span>}
        {leech && (
          <span className="rounded-[3px] bg-forget px-1.5 font-medium text-paper-3" data-testid="leech-tag">
            顽固
          </span>
        )}
        {practice && <span className="rounded-[3px] px-1.5 ring-1 ring-rule-strong ring-inset">不影响复习计划</span>}
        {resumed > 0 && doneN === 0 && (
          <span className="rounded-[3px] bg-know-soft px-1.5 text-know" data-testid="resume-note">
            刚才学的 {resumed} 个已保存 ✓
          </span>
        )}
        {eta && (
          <span className="tnum ml-auto shrink-0" data-testid="eta" data-min={eta.min}>
            {eta.label}
          </span>
        )}
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live">
        {live}
      </div>

      {isQuiz ? (
        <>
        <QuizView
          key={cardKey}
          seed={seed}
          word={word}
          mode={shownItem.mode}
          accent={accent}
          options={options}
          answered={phase === "back" ? last : null}
          onPick={pick}
          onGiveUp={giveUp}
          onNext={next}
          onUndo={doUndo}
          shake={shake}
          leftHand={leftHand}
        />
        {phase === "front" && <div className="-mt-2 pb-2"><CardTools onUndo={doUndo} canUndo={!!session.history.length} onBury={practice ? undefined : doBury} onStar={star} starred={starred} /></div>}
        </>
      ) : speedMode ? (
        <>
          <SpeedCard
            key={cardKey}
            word={word}
            accent={accent}
            reveal={reveal}
            onReveal={() => setReveal(true)}
            onSwipe={rate}
            onKill={doKill}
            swap={swap}
            frontIpa={frontIpa}
          />
          <CardTools onUndo={doUndo} canUndo={!!session.history.length || peek} onBury={practice ? undefined : doBury} onStar={star} starred={starred} />
          <div className="shrink-0 pb-4 pt-2">
            <div className="grid grid-cols-2 gap-2.5" data-testid="speed-buttons" data-order={speedOrder(swap).join(",")}>
              {speedOrder(swap).map((r, k) => (
                <SpeedBtn key={r} tone={r} side={k === 0 ? "left" : "right"} label={r === "know" ? "认识" : "不认识"} hint={preview?.[r]} onClick={() => rate(r)} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <FlipCard
            key={cardKey}
            index={index}
            canKill={!practice}
            word={word}
            accent={accent}
            flipped={flipped}
            cnFirst={cnFirst}
            canSwipe={phase === "front"}
            onSwipe={rate}
            onTap={next}
            onKill={doKill}
            last={phase === "back" && !peek ? last : null}
            swap={swap}
            frontIpa={frontIpa}
          />
          <CardTools onUndo={doUndo} canUndo={!!session.history.length || peek} onBury={practice ? undefined : doBury} onStar={star} starred={starred} />
          <div className="shrink-0 pb-4 pt-2">
            {phase === "front" || peek ? (
              <div className={cn("grid gap-2.5", fourKey ? "grid-cols-4 gap-2" : "grid-cols-3")} data-testid="rate-buttons" data-order={rateOrder4(leftHand, fourKey).join(",")}>
                {rateOrder4(leftHand, fourKey).map((r) => (
                  <RateBtn key={r} tone={r} k={RATE_KEY[r]} label={RATE_CN[r]} hint={preview?.[r]} onClick={() => rate(r)} compact={fourKey} />
                ))}
              </div>
            ) : (
              <div className={cn("flex gap-2.5", leftHand && "flex-row-reverse")} data-testid="back-actions">
                {last && last.rating !== "forget" ? (
                  <button
                    type="button"
                    onClick={mistake}
                    data-testid="mistake"
                    className="press h-14 w-[36%] rounded-xl text-[0.9375rem] font-medium text-ink-2 ring-1 ring-rule-strong ring-inset hover:bg-paper-2"
                  >
                    记错了
                  </button>
                ) : (
                  <div className="flex h-14 w-[36%] items-center justify-center rounded-xl bg-forget-soft text-[0.8125rem] font-medium text-forget">
                    稍后再来
                  </div>
                )}
                <button
                  type="button"
                  onClick={next}
                  data-testid="next"
                  className="press flex h-14 flex-1 items-center justify-center gap-2.5 rounded-xl bg-ink text-base font-semibold text-paper-3 hover:bg-ink-2"
                >
                  下一个 {fine && <span className="rounded-[4px] bg-paper-3/15 px-1.5 py-px text-[0.6875rem] font-medium" data-testid="kbd-hint">空格</span>}
                </button>
              </div>
            )}
          </div>
        </>
      )}
      <ShortcutsSheet open={help} onOpenChange={setHelp} />
      <LeaveSheet blocker={blocker} title="退出本组？" desc={`这组已经答了 ${doneN}/${total} 个，答过的都已保存。退出后剩下的词下次再学。`} stay="继续学习" leave="退出" />
    </div>
  );
}


/** 11.1 · 卡片下面的小工具条：撤销 / 明天再说 / 收藏，带文字（原来挤在顶栏、只有图标） */
function CardTools({ onUndo, canUndo, onBury, onStar, starred }: { onUndo: () => void; canUndo: boolean; onBury?: () => void; onStar: () => void; starred: boolean }) {
  const cls = "press flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[0.8125rem] font-medium text-ink-3 hover:bg-paper-2 hover:text-ink disabled:pointer-events-none disabled:opacity-35";
  return (
    <div className="flex shrink-0 items-center justify-center pt-1.5 text-ink-3" data-testid="card-tools">
      <button type="button" onClick={onUndo} disabled={!canUndo} data-testid="undo" aria-label="撤销" className={cls}>
        <Undo2 className="size-4" /> 撤销
      </button>
      {onBury && (
        <>
          <span className="h-4 w-px bg-rule" aria-hidden />
          <button type="button" onClick={onBury} data-testid="bury" aria-label="明天再说" className={cls}>
            <CalendarClock className="size-4" /> 明天再说
          </button>
        </>
      )}
      <span className="h-4 w-px bg-rule" aria-hidden />
      <button type="button" onClick={onStar} data-testid="star" aria-label={starred ? "移出生词本" : "加入生词本"} aria-pressed={starred} className={cn(cls, starred && "text-ink")}>
        <Star className={cn("size-4", starred && "fill-mark text-ink")} />
        <span className={cn(starred && "hl")}>{starred ? "已收藏" : "收藏"}</span>
      </button>
    </div>
  );
}

const RESUME_KEY = "cet4v-resume";
/** 刷新前这一组已经答过几个词（同一模式、同一天）；读完就清掉 */
function takeResume(mode: string): number {
  try {
    const r = JSON.parse(sessionStorage.getItem(RESUME_KEY) || "null") as { mode?: string; day?: string; n?: number } | null;
    sessionStorage.removeItem(RESUME_KEY);
    return r && r.mode === mode && r.day === today() && typeof r.n === "number" ? r.n : 0;
  } catch {
    return 0;
  }
}
function saveResume(mode: string, n: number) {
  try {
    if (n > 0) sessionStorage.setItem(RESUME_KEY, JSON.stringify({ mode, day: today(), n }));
    else sessionStorage.removeItem(RESUME_KEY);
  } catch {
    /* 无痕模式 */
  }
}

const RATE_CN: Record<Grade4, string> = { easy: "简单", know: "认识", vague: "模糊", forget: "不认识" };
const RATE_KEY: Record<Grade4, string> = { know: "1", vague: "2", forget: "3", easy: "4" };

/** 速刷按钮：位置跟随滑动方向（左边按钮 = 左滑），下面带下次复习时间 */
function SpeedBtn({ tone, side, label, hint, onClick }: { tone: "know" | "forget"; side: "left" | "right"; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`speed-${tone}`}
      className={cn(
        "press relative flex h-16 items-center justify-center gap-2 overflow-hidden rounded-xl bg-paper-3 text-base font-semibold ring-1 ring-rule ring-inset hover:bg-paper-2",
        side === "left" ? "before:absolute before:inset-y-0 before:left-0 before:w-[3px]" : "after:absolute after:inset-y-0 after:right-0 after:w-[3px]",
        tone === "know" ? "text-know before:bg-know after:bg-know" : "text-forget before:bg-forget after:bg-forget",
      )}
    >
      {side === "left" && <ArrowLeft className="size-4" />}
      <span className="flex flex-col items-center leading-tight">
        {label}
        {hint && <span className="tnum mt-1 text-[0.6875rem] font-medium text-ink-3">{hint}</span>}
      </span>
      {side === "right" && <ArrowRight className="size-4" />}
    </button>
  );
}

/** 速刷卡：一屏一词，不翻面；点一下原地展开释义；右滑认识、左滑不认识 */
function SpeedCard({
  word,
  accent,
  reveal,
  onReveal,
  onSwipe,
  onKill,
  swap,
  frontIpa,
}: {
  word: Word;
  accent: "us" | "uk";
  reveal: boolean;
  onReveal: () => void;
  onSwipe: (r: Rating) => void;
  onKill: () => void;
  swap: boolean;
  frontIpa: boolean;
}) {
  const [dx, setDxState] = useState<number | null>(null);
  const dxRef = useRef<number | null>(null);
  const setDx = (v: number | null) => {
    dxRef.current = v;
    setDxState(v);
  };
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiped = useRef(false);
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    origin.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!origin.current || origin.current.id !== e.pointerId) return;
    const x = e.clientX - origin.current.x;
    if (dxRef.current === null && Math.abs(x) < 8) return;
    setDx(x);
  };
  const onUp = () => {
    const d = dxRef.current;
    origin.current = null;
    setDx(null);
    if (d === null) return;
    swiped.current = Math.abs(d) > 8;
    const r = swipeRating(d, 0, { swap, threshold: 80, vertical: false });
    if (r) onSwipe(r);
  };
  const hint = dx === null ? null : swipeRating(dx, 0, { swap, threshold: 50, vertical: false });
  return (
    <div className="relative min-h-0 flex-1 speed-in" data-testid="speed-card">
      <div
        className="index-card relative h-full touch-pan-y select-none overflow-hidden rounded-2xl bg-paper-3 ring-1 ring-rule ring-inset"
        style={dx !== null ? { transform: `translateX(${dx}px) rotate(${dx / 24}deg)` } : { transition: "transform 320ms var(--ease-spring)" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={() => {
          if (swiped.current) {
            swiped.current = false;
            return;
          }
          onReveal();
        }}
      >
        {/* 12.0 · 速刷：一屏一词，词头在上半；释义在下半原地展开（展开前是一条虚线框写着「点一下看释义」） */}
        <div className="relative flex h-full flex-col px-7 pb-16 pt-8 text-left">
          <div className="fs-card flex w-full max-w-full flex-1 flex-col items-start justify-center">
            <FitWord w={word.w} className={cn("word-head break-all leading-[1]", wordSize(word.w))} testid="card-word" style={{ "--wl": word.w.length } as React.CSSProperties} />
            <div className="mt-3 flex items-center gap-3 text-base text-ink-2">
              {(frontIpa || reveal) && <Phonetic word={word} accent={accent} />}
              <button
                type="button"
                aria-label="播放发音"
                onClick={(e) => {
                  e.stopPropagation();
                  speak(word.w, accent);
                }}
                className="press grid size-10 place-items-center rounded-lg text-ink ring-1 ring-rule-strong ring-inset hover:bg-mark"
              >
                <Volume2 className="size-[18px]" />
              </button>
            </div>
          </div>
          <div className="fs-card w-full max-w-md shrink-0" data-testid="speed-meaning" data-revealed={reveal ? 1 : 0}>
            {reveal ? (
              <div className="rise border-t-2 border-ink pt-3 text-left">
                <Meanings word={word} />
              </div>
            ) : (
              <div className="flex h-14 items-center justify-between border-y border-rule-strong text-[0.8125rem] text-ink-3">
                <span>点一下看释义</span>
                <span>{swipeHint(swap)}</span>
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onKill();
          }}
          data-testid="kill"
          className="press absolute inset-x-0 bottom-0 flex h-12 items-center justify-center gap-1.5 whitespace-nowrap border-t border-rule text-[0.8125rem] font-medium text-ink-3 hover:bg-paper-2 hover:text-know"
        >
          <Swords className="size-3.5" /> 斩 · 我本来就会
        </button>
        {hint && (
          <div
            className={cn("pointer-events-none absolute inset-0 grid place-items-center rounded-2xl text-[1.75rem] font-semibold ring-2 ring-inset", hint === "know" ? "bg-know-soft/85 text-know ring-know" : "bg-forget-soft/85 text-forget ring-forget")}
            data-testid="swipe-hint"
            data-rating={hint}
          >
            {hint === "know" ? "认识" : "不认识"}
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  testid,
  active,
  disabled,
  className,
  pressed,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  testid?: string;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
      data-testid={testid}
      disabled={disabled}
      className={cn(
        "press grid size-10 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-paper-2 hover:text-ink disabled:opacity-35",
        active && "bg-mark text-mark-ink hover:bg-mark",
        className,
      )}
    >
      {children}
    </button>
  );
}

function RateBtn({ tone, label, k, hint, onClick, compact }: { tone: Grade4; label: string; k: string; hint?: string; onClick: () => void; compact?: boolean }) {
  // 13.0 · A 真词典：「认识」是细长的墨色主按钮，其余是细线框的次按钮；不再用语义色条
  const ink = tone === "know";
  const cls = ink ? "btn-ink text-paper-3 ring-0" : "bg-paper-3 text-ink ring-1 ring-rule-strong ring-inset hover:bg-paper-2";
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`rate-${tone}`}
      className={cn(
        "press relative flex h-14 flex-col items-center justify-center overflow-hidden rounded-xl font-semibold",
        compact ? "text-[0.9375rem]" : "text-base",
        cls,
      )}
    >
      <span className="leading-tight">{label}</span>
      {hint && (
        <span className={cn("tnum mt-1 text-[0.6875rem] font-medium leading-none", ink ? "text-paper-3/75" : "text-ink-3")} data-testid={`ivl-${tone}`}>
          {hint}
        </span>
      )}
      <span className="kbd absolute right-1.5 top-2 hidden fine:inline-grid">{k}</span>
    </button>
  );
}

function FlipCard({
  index,
  canKill,
  word,
  accent,
  flipped,
  cnFirst,
  canSwipe,
  onSwipe,
  onTap,
  onKill,
  last,
  swap,
  frontIpa,
}: {
  swap: boolean;
  frontIpa: boolean;
  word: Word;
  accent: "us" | "uk";
  flipped: boolean;
  cnFirst: boolean;
  canSwipe: boolean;
  onSwipe: (r: Rating) => void;
  onTap: () => void;
  onKill: () => void;
  last: Last | null;
  index: WordIndex;
  canKill: boolean;
}) {
  const [drag, setDragState] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const setDrag = (d: { x: number; y: number } | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  const hint = drag ? swipeRating(drag.x, drag.y, { swap, threshold: 60 }) : null;
  // 11.6 · 背面右栏（横屏才单独滚动）放不下时：底部渐隐 +「上滑看更多」
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);
  // 13.0 · 背面点同义词：在详情弹层里打开那个词（不离开这一组）
  const [peek, setPeek] = useState<Word | null>(null);
  const checkMore = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const oy = getComputedStyle(el).overflowY;
    setMore((oy === "auto" || oy === "scroll") && el.scrollHeight - el.clientHeight - el.scrollTop > 8);
  }, []);
  useEffect(() => {
    if (!flipped) {
      setMore(false);
      return;
    }
    checkMore();
    const el = bodyRef.current;
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(() => checkMore()) : null;
    if (ro && el) {
      ro.observe(el);
      for (const c of Array.from(el.children)) ro.observe(c);
    }
    window.addEventListener("resize", checkMore);
    const t = setTimeout(checkMore, 700);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", checkMore);
      clearTimeout(t);
    };
  }, [flipped, word.w, checkMore]);

  const onDown = (e: React.PointerEvent) => {
    if (!canSwipe || e.pointerType === "mouse") return;
    origin.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!origin.current || origin.current.id !== e.pointerId) return;
    const x = e.clientX - origin.current.x;
    const y = e.clientY - origin.current.y;
    if (!dragRef.current && Math.hypot(x, y) < 8) return;
    setDrag({ x, y });
  };
  const swiped = useRef(false);
  const onUp = () => {
    const d = dragRef.current;
    origin.current = null;
    setDrag(null);
    if (!d) return;
    swiped.current = Math.hypot(d.x, d.y) > 8;
    const r = swipeRating(d.x, d.y, { swap, threshold: 90 });
    if (r) onSwipe(r);
  };

  // 12.0 · 正面是一张索引卡：词头（衬线、左对齐）占上半，下面一条短墨线，再下面是读音；提示语贴在卡片底部
  const front = (
    <div className="flex h-full flex-col justify-center px-7 pb-8 text-left" data-testid="card-front">
      {cnFirst ? (
        <div className="fs-card w-full max-w-md text-left">
          <div className="mb-4 text-[0.75rem] text-ink-3">中 → 英</div>
          <Meanings word={word} size="lg" />
          <p className="mt-8 border-t border-rule pt-3 text-[0.8125rem] text-ink-3">想一想对应的英文单词</p>
        </div>
      ) : (
        <div className="front-stack fs-card flex w-full max-w-full flex-col items-start">
          <FitWord w={word.w} className={cn("word-head break-all leading-[1] text-ink", wordSize(word.w))} testid="card-word" style={{ "--wl": word.w.length } as React.CSSProperties} />
          <span className="front-rule mt-5 h-[2px] w-10 bg-ink" aria-hidden />
          <div className="mt-4 flex items-center gap-3 text-[1.0625rem] text-ink-2" data-testid="front-ipa" data-shown={frontIpa ? 1 : 0}>
            {frontIpa && <Phonetic word={word} accent={accent} />}
            <button
              type="button"
              aria-label="播放发音"
              onClick={(e) => {
                e.stopPropagation();
                speak(word.w, accent);
              }}
              className="press grid size-11 place-items-center rounded-lg text-ink ring-1 ring-rule-strong ring-inset hover:bg-mark"
            >
              <Volume2 className="size-5" />
            </button>
          </div>
          <p className="mt-10 text-[0.8125rem] text-ink-3" data-testid="front-hint">
            {frontIpa ? "认识这个词吗？点卡片可以先看释义" : "先认词形 · 音标在背面"}
          </p>
        </div>
      )}
    </div>
  );

  // 背面右上角：刚才的评分，一个语气色小方块 + 字（不是彩色胶囊）
  const ratingTag = last ? (
    <span
      className={cn(
        "pop inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap pt-2 text-[0.8125rem] font-semibold",
        last.rating === "know" ? "text-know" : last.rating === "vague" ? "text-vague" : "text-forget",
      )}
      data-testid="rated-tag"
    >
      <span className={cn("size-2 rounded-[2px]", last.rating === "know" ? "bg-know" : last.rating === "vague" ? "bg-vague" : "bg-forget")} aria-hidden />
      {last.rating === "know" ? "认识" : last.rating === "vague" ? "模糊" : "不认识"}
    </span>
  ) : null;

  // 12.0 · 背面是词典的一个条目：词头 + 读音，下面一道粗墨线，再下面释义、短语、形近词、例句
  const back = (
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-6 pt-5 text-left" data-testid="card-back">
      {/* 12.0 · 内容少时在卡片里上下居中（my-auto），多到要滚动时自然顶格 */}
      <div className="fs-card back-grid my-auto">
        <div className="back-head flex items-start justify-between gap-3" data-testid="back-head">
          {/* 11.8 · 单词这一栏占满剩下的宽度（不按内容收缩）：按实际宽度缩字号时量到的是真正可用的宽度 */}
          <div className="min-w-0 flex-1">
            <FitWord w={word.w} className="word-head break-words text-[2.75rem] leading-[1.02]" testid="back-word" style={{ "--wl": word.w.length } as React.CSSProperties} />
            <div className="mt-1.5 flex items-center gap-2 text-[0.9375rem] text-ink-2">
              <Phonetic word={word} accent={accent} />
              <button
                type="button"
                aria-label="播放发音"
                onClick={(e) => {
                  e.stopPropagation();
                  speak(word.w, accent);
                }}
                className="press grid size-9 place-items-center rounded-lg text-ink ring-1 ring-rule-strong ring-inset hover:bg-mark"
              >
                <Volume2 className="size-4" />
              </button>
            </div>
          </div>
          {ratingTag}
        </div>
        <div className="back-rule my-4 h-[2px] bg-ink" />
        {/* 11.6 · 横屏（高度 < 500）：单词在左、释义在右，释义第一行不用滚动就看得见；右栏放不下时底部渐隐 + 「上滑看更多」 */}
        <div className="back-body" data-testid="back-body" ref={bodyRef} onScroll={checkMore} data-more={more ? 1 : 0}>
          <Meanings word={word} size="lg" />
          <MorphLine index={index} word={word} className="mt-3" />
          <div className="mt-6 empty:hidden">
            <Examples word={word} enabled={flipped} />
          </div>
          <div className="mt-6 empty:hidden">
            <Phrases word={word} />
          </div>
          <div className="mt-6 empty:hidden">
            <Synonyms index={index} word={word} enabled={flipped} onOpen={setPeek} />
          </div>
          <div className="mt-6 empty:hidden">
            <Confusables index={index} word={word} accent={accent} />
          </div>
        </div>
        {more && (
          <div className="back-more" data-testid="back-more" aria-hidden>
            上滑看更多 ↓
          </div>
        )}
      </div>
    </div>
  );

  const style = drag
    ? { transform: `translate(${drag.x}px, ${Math.min(0, drag.y) * 0.6}px) rotate(${drag.x / 18}deg)`, transition: "none" }
    : { transition: "transform 420ms var(--ease-spring)" };
  const HINT_CN = { know: "认识", vague: "模糊", forget: "不认识" } as const;

  return (
    <div className="paper-stack relative min-h-0 flex-1 card-in">
      <div
        className="flip-scene h-full touch-pan-y select-none"
        style={style}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={() => {
          if (swiped.current) {
            swiped.current = false;
            return;
          }
          if (!flipped) onTap();
        }}
      >
        <div className={cn("flip-inner h-full", flipped && "is-flipped")}>
          <div className="flip-face index-card relative h-full overflow-hidden rounded-2xl bg-paper-3 ring-1 ring-rule ring-inset" aria-hidden={flipped}>
            <div className="relative h-full">{front}</div>
            {canKill && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onKill();
                }}
                data-testid="kill"
                className="card-kill press absolute inset-x-0 bottom-0 flex h-12 items-center justify-center gap-1.5 whitespace-nowrap border-t border-rule text-[0.8125rem] font-medium text-ink-3 hover:bg-paper-2 hover:text-know"
              >
                <Swords className="size-3.5" /> 斩 · 我本来就会
              </button>
            )}
            {hint && (
              <div
                className={cn(
                  "absolute inset-0 grid place-items-center rounded-2xl text-[1.75rem] font-semibold ring-2 ring-inset",
                  hint === "know" ? "bg-know-soft/85 text-know ring-know" : hint === "vague" ? "bg-vague-soft/85 text-vague ring-vague" : "bg-forget-soft/85 text-forget ring-forget",
                )}
              >
                <span data-testid="swipe-hint" data-rating={hint}>
                  {HINT_CN[hint]}
                </span>
              </div>
            )}
          </div>
          <div className="flip-face flip-back index-card h-full overflow-hidden rounded-2xl bg-paper-3 ring-1 ring-rule ring-inset" aria-hidden={!flipped}>
            {back}
          </div>
        </div>
      </div>
      <WordSheet word={peek} open={!!peek} onOpenChange={(v) => !v && setPeek(null)} />
    </div>
  );
}

function QuizView({
  seed,
  word,
  mode,
  accent,
  options,
  answered,
  onPick,
  onGiveUp,
  onNext,
  onUndo,
  shake,
  leftHand,
}: {
  leftHand?: boolean;
  word: Word;
  mode: SessionItem["mode"];
  accent: "us" | "uk";
  options: Choice[];
  answered: Last | null;
  onPick: (k: number) => void;
  onGiveUp: () => void;
  onNext: () => void;
  onUndo: () => void;
  shake: number;
  seed: number;
}) {
  const done = !!answered;
  return (
    <div className="flex min-h-0 flex-1 flex-col card-in" data-testid="quiz" data-quiz-mode={mode} data-w={word.w}>
      <QuizPrompt word={word} mode={mode} accent={accent} seed={seed} done={done} />
      <ChoiceList
        choices={options}
        done={done}
        pick={answered?.pick}
        wrong={done && answered?.rating === "forget" && answered.pick !== -1}
        shakeKey={shake}
        onPick={onPick}
        subTestId={mode === "listen" ? "listen-meaning" : undefined}
      />
      <div className="shrink-0 pb-4 pt-3">
        {done ? (
          <div className={cn("flex gap-2.5", leftHand && "flex-row-reverse")} data-testid="quiz-actions">
            <button type="button" onClick={onUndo} className="press h-14 w-[30%] rounded-xl text-[0.9375rem] font-medium text-ink-2 ring-1 ring-rule-strong ring-inset hover:bg-paper-2">
              撤销
            </button>
            <button
              type="button"
              onClick={onNext}
              data-testid="next"
              className={cn("press flex h-14 flex-1 items-center justify-center gap-2 rounded-xl text-base font-semibold", answered?.rating === "know" ? "bg-mark text-mark-ink" : "bg-ink text-paper-3 hover:bg-ink-2")}
            >
              {answered?.rating === "know" ? "答对了 · 下一个" : "记住它 · 下一个"}
            </button>
          </div>
        ) : (
          <button type="button" onClick={onGiveUp} data-testid="give-up" className="press flex h-11 w-full items-center justify-center gap-1.5 rounded-lg text-[0.875rem] font-medium text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink">
            <CircleHelp className="size-4" />
            不认识，看答案
          </button>
        )}
      </div>
    </div>
  );
}

/** 题干：复习与模拟小测共用 */
export function QuizPrompt({ word, mode, accent, seed, done, compact }: { word: Word; mode: SessionItem["mode"]; accent: "us" | "uk"; seed: number; done: boolean; compact?: boolean }) {
  const revealWord = mode === "en2cn" || mode === "poly" || mode === "pos" || done;
  const phrase = mode === "phrase" ? phraseFor(word, seed) : undefined;
  const cloze = mode === "cloze" ? clozeFor(word, seed) : null;
  const ex = mode === "example" ? exampleCloze(word.w, seed) : null;
  const cnph = mode === "cnphrase" ? cnPhraseOf(word, seed) : undefined;
  return (
    <div
      className={cn("relative flex flex-1 flex-col justify-center overflow-y-auto rounded-2xl bg-paper-3 px-6 py-6 text-left ring-1 ring-rule ring-inset", compact ? "min-h-[120px]" : "min-h-[150px]")}
      data-testid="quiz-prompt"
    >
      {/* 12.0 · 题干左对齐（和学习卡一样是索引卡）；听音题是一个荧光笔方块按钮 */}
      <div className="fs-card flex w-full flex-col items-start">
        {mode === "cn2en" && !done && (
          <div className="w-full max-w-md">
            <Meanings word={word} size="lg" />
          </div>
        )}
        {(mode === "audio" || mode === "listen") && !done && (
          <button type="button" onClick={() => speak(word.w, accent)} className="press grid size-24 place-items-center rounded-2xl bg-mark text-mark-ink ring-[1.5px] ring-ink ring-inset" aria-label="再听一遍" data-testid="quiz-audio">
            <Volume2 className="size-10" />
          </button>
        )}
        {mode === "phrase" && phrase && (
          <div className={cn("w-full max-w-md", done && "order-last mt-4 border-t border-rule pt-3")} data-testid="quiz-phrase">
            <div className={cn("word-head leading-snug", done ? "text-[1.25rem]" : "text-[2.25rem]")}>
              <PhraseText phrase={phrase[0]} word={word.w} />
            </div>
            {done ? <div className="mt-0.5 text-[0.875rem] text-ink-3">{phrase[1]}</div> : null}
          </div>
        )}
        {cloze && (
          <div className={cn("w-full max-w-md", done && "order-last mt-4 border-t border-rule pt-3")} data-testid="quiz-cloze">
            <div className={cn("word-head leading-snug", done ? "text-[1.25rem]" : "text-[2.25rem]")}>{done ? <PhraseText phrase={cloze.phrase} word={word.w} /> : <ClozeText text={cloze.blanked} />}</div>
            <div className={cn("text-ink-3", done ? "mt-0.5 text-[0.875rem]" : "mt-2 text-[0.9375rem]")} data-testid="cloze-cn">
              {cloze.cn}
            </div>
          </div>
        )}
        {ex && (
          <div className={cn("w-full max-w-md", done && "order-last mt-4 border-t border-rule pt-3")} data-testid="quiz-example">
            {!done && <div className="mb-2 text-[0.75rem] text-ink-3">例句</div>}
            <div className={cn("leading-relaxed", done ? "text-[0.875rem] text-ink" : "font-serif text-[1.5rem] leading-snug")}>
              {done ? (
                <>
                  {ex.blanked.split("____")[0]}
                  <b className="hl font-semibold text-ink">{ex.form}</b>
                  {ex.blanked.split("____").slice(1).join("____")}
                </>
              ) : (
                <ClozeText text={ex.blanked} />
              )}
            </div>
            {done && ex.zh && (
              <div className="mt-1 text-[0.8125rem] text-ink-3" data-testid="quiz-example-zh">
                {ex.zh}
              </div>
            )}
            {!done && ex.form.toLowerCase() !== word.w.toLowerCase() && (
              <div className="mt-2 text-[0.75rem] text-ink-3" data-testid="example-form-hint">
                空格处是这个词的变形
              </div>
            )}
          </div>
        )}
        {cnph && (
          <div className={cn("w-full max-w-md", done && "order-last mt-4 border-t border-rule pt-3")} data-testid="quiz-cnphrase">
            {done ? (
              <>
                <div className="word-head text-[1.25rem] leading-snug">
                  <PhraseText phrase={cnph[0]} word={word.w} />
                </div>
                <div className="mt-0.5 text-[0.875rem] text-ink-3">{cnph[1]}</div>
              </>
            ) : (
              <div className="text-[1.75rem] font-semibold leading-snug" data-testid="cnphrase-cn">
                {cnph[1]}
              </div>
            )}
          </div>
        )}
        {revealWord && (
          <>
            <FitWord w={word.w} className={cn("word-head break-all leading-[1]", done ? "text-[2.75rem]" : wordSize(word.w))} testid="quiz-word" />
            <div className="mt-2.5 flex items-center gap-2.5 text-base text-ink-2">
              <Phonetic word={word} accent={accent} />
              <button type="button" aria-label="播放发音" onClick={() => speak(word.w, accent)} className="press grid size-10 place-items-center rounded-lg text-ink ring-1 ring-rule-strong ring-inset hover:bg-mark">
                <Volume2 className="size-[18px]" />
              </button>
            </div>
          </>
        )}
        {done && (
          <div className="mt-4 w-full max-w-md border-t-2 border-ink pt-3">
            <Meanings word={word} />
          </div>
        )}
        {done && !compact && word.ph?.length && mode !== "cloze" && mode !== "cnphrase" ? (
          <div className="mt-4 w-full max-w-md">
            <Phrases word={word} max={3} />
          </div>
        ) : null}
        {!done && (
          <p className="mt-5 text-[0.8125rem] text-ink-3" data-testid="quiz-hint">
            {MODE_HINT[mode] ?? "选出正确的意思"}
          </p>
        )}
      </div>
    </div>
  );
}

/** 四个选项：答完标出对错（复习与模拟小测共用） */
export function ChoiceList({
  choices,
  done,
  pick,
  wrong,
  shakeKey,
  onPick,
  subTestId = "choice-sub",
}: {
  subTestId?: string;
  choices: Choice[];
  done: boolean;
  pick?: number;
  wrong?: boolean;
  shakeKey?: number;
  onPick: (k: number) => void;
}) {
  // 11.3 · 数字角标是键盘快捷键提示：和评分按钮一样，只在有鼠标 / 触控板的设备上显示（答完的 ✓ / ✗ 照常显示）
  const fine = useFinePointer();
  return (
    /* 12.0 · 选项是一张答题卡：每行左边一个题号格，答完对的那行涂荧光笔、选错的那行打 × */
    <div key={shakeKey} className={cn("mt-3 grid min-w-0 shrink-0 gap-2", wrong && "shake")} data-testid="quiz-options" data-keys={fine ? 1 : 0}>
      {choices.map((o, k) => {
        const isCorrect = o.correct;
        const picked = pick === k;
        return (
          <button
            key={`${k}-${o.text}`}
            type="button"
            disabled={done}
            onClick={() => onPick(k)}
            data-testid={`opt-${k + 1}`}
            data-correct={isCorrect ? 1 : 0}
            className={cn(
              "press flex min-h-[52px] w-full min-w-0 items-center gap-3 rounded-xl px-4 py-2.5 text-left text-[0.9375rem] ring-inset",
              !done && "bg-paper-3 ring-1 ring-rule hover:ring-ink",
              done && isCorrect && "bg-mark-soft text-ink ring-[1.5px] ring-ink",
              done && picked && !isCorrect && "bg-forget-soft ring-[1.5px] ring-forget",
              done && !isCorrect && !picked && "bg-transparent opacity-45 ring-1 ring-rule",
            )}
          >
            {(fine || (done && (isCorrect || picked))) && (
              <span
                data-testid="choice-badge"
                className={cn(
                  "tnum grid size-6 shrink-0 place-items-center rounded-[3px] font-serif text-[0.9375rem] text-ink-3 ring-1 ring-rule-strong ring-inset",
                  done && isCorrect && "bg-ink text-paper-3 ring-0",
                  done && picked && !isCorrect && "bg-forget text-paper-3 ring-0",
                )}
              >
                {done && isCorrect ? <Check className="size-3.5" /> : done && picked ? <X className="size-3.5" /> : k + 1}
              </span>
            )}
            <span className={cn("fs-card min-w-0 flex-1 leading-snug", o.en ? "word-head text-[1.375rem] leading-tight" : "line-clamp-2")}>
              {o.text}
              {done && o.sub && (
                <span className="mt-0.5 block truncate font-sans text-[0.75rem] font-normal text-ink-3" data-testid={subTestId}>
                  {o.sub}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ClozeText({ text }: { text: string }) {
  const parts = text.split("____");
  return (
    <>
      {parts.map((p, k) => (
        <span key={k}>
          {p}
          {k < parts.length - 1 && <span className="mx-1 inline-block h-[0.5em] w-20 rounded-[2px] bg-mark align-baseline" data-testid="cloze-blank" />}
        </span>
      ))}
    </>
  );
}

function PhraseText({ phrase, word }: { phrase: string; word: string }) {
  const i = phrase.toLowerCase().indexOf(word.toLowerCase());
  if (i < 0) return <>{phrase}</>;
  return (
    <>
      {phrase.slice(0, i)}
      <span className="hl text-ink">{phrase.slice(i, i + word.length)}</span>
      {phrase.slice(i + word.length)}
    </>
  );
}

function Empty({ mode }: { mode: StudyMode }) {
  const text: Record<StudyMode, [string, string]> = {
    new: ["新词都学完了", "整本词书已经过了一遍，去复习巩固吧。"],
    review: ["暂时没有要复习的词", "到期的词会在这里出现，先去学点新词吧。"],
    ahead: ["明天没有要复习的词", "今天的任务已经全部完成，休息一下吧。"],
    practice: ["没有需要再练的词", "这一组全部一次答对，太强了。"],
    speed: ["没有要速刷的词", "到期复习的词会出现在这里，先去学点新词吧。"],
    core: ["核心词全部掌握了", "2607 个核心词都已掌握，四级稳了。"],
    list: ["这个词单没有可学的词", "词单是空的或者全部斩完了，去词库加点词吧。"],
    hard: ["没有顽固词", "遗忘 3 次以上的词会出现在这里。"],
    rank: ["难词榜是空的", "复习时忘过的词会按遗忘次数上榜。"],
    star: ["生词本是空的", "学习时按 S 或点星标收藏生词。"],
    wrong: ["错词本是空的", "选择题答错或点「不认识」的词会自动进来。"],
    mastered: ["还没有斩掉的词", "学习时遇到本来就会的词，点「斩」跳过。"],
  };
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-7 text-left" data-testid="study-empty">
      <div className="font-serif text-[3.5rem] italic leading-none text-rule-strong" aria-hidden>
        —
      </div>
      <h1 className="mt-4 text-[1.625rem] font-semibold tracking-[-0.02em]">
        <span className="hl-swipe">{text[mode][0]}</span>
      </h1>
      <p className="mt-3 max-w-[22em] text-[0.9375rem] leading-relaxed text-ink-2">{text[mode][1]}</p>
      <Link to="/" className="press mt-8 flex h-12 w-fit items-center rounded-lg bg-ink px-8 font-semibold text-paper-3 hover:bg-ink-2">
        回到今日
      </Link>
    </div>
  );
}

function Summary({
  session,
  index,
  mode,
  ms,
  listId,
  postRes,
  onPostQuiz,
  day,
}: {
  session: Session;
  index: WordIndex;
  mode: StudyMode;
  ms: number;
  day: string;
  listId?: string;
  postRes?: Record<string, boolean> | null;
  onPostQuiz?: () => void;
}) {
  const st = useApp();
  const navigate = useNavigate();
  const router = useRouter();
  const sum = summarize(index, st, day);
  // 11.3 · 任务完成就记下来：不点打卡、过了 0 点再回首页，这一天照样算打卡
  useEffect(() => {
    if (sum.ready && !sum.checked) markGoalMet(day);
  }, [sum.ready, sum.checked, day]);
  const acc = Math.round(sessionAccuracy(session) * 100);
  const words = Object.entries(session.firsts);
  const [share, setShare] = useState(false);
  const info = useShareInfo(index);
  const s = curStreak(st, day);
  const toGo = sum.timeMode ? 0 : Math.max(0, sum.goal - sum.learned) * (sum.newLeft > 0 ? 1 : 0) + sum.due;
  // 第一次学完一组：专门的「第一组 ✓」
  const firstEver = mode === "new" && st.checkins.length === 0 && Object.keys(st.cards).length <= words.length;

  const restart = (m: StudyMode) => replaceStudy(router, { mode: m, t: Date.now() });
  // 学后速测答错的也算进「错词再练」
  const { n: postN, ok: postOk, wrong: postWrong, pct: postPct } = postSummary(postRes);
  const missed = retryWords(session.firsts, postRes);

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-10 pt-safe" data-testid="summary">
      <div className="flex items-center pt-3">
        <button type="button" onClick={() => exitBack(router)} aria-label="关闭" data-testid="summary-close" className="press -ml-2 grid size-11 place-items-center rounded-lg text-ink-2 hover:bg-paper-2 hover:text-ink">
          <X className="size-[22px]" />
        </button>
        <span className="ml-auto text-[0.75rem] text-ink-3">{MODE_TITLE[mode]}</span>
      </div>
      {/* 12.0 · 小结是这一组的「批改单」：大标题 + 一行用时正确率，下面三格读数，再下面每个词一行 */}
      <header className="mt-6 border-b-2 border-ink pb-4">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.025em]" data-testid="summary-title">
          <span className="hl-swipe">{firstEver ? "第一组 ✓" : "本组完成"}</span>
        </h1>
        {firstEver && (
          <p className="mt-2 text-[0.9375rem] font-medium text-ink" data-testid="first-group">
            好的开始！{comeBackLine(words.filter(([w]) => !st.cards[w]?.k).map(([w]) => st.cards[w]?.d).filter((d): d is string => !!d), day, words.length)}
          </p>
        )}
        <p className="tnum mt-2 text-[0.875rem] text-ink-2">
          {MODE_TITLE[mode]} {words.length} 词 · 首次正确率 {acc}% · 用时 {Math.max(1, Math.round(ms / 60000))} 分钟
        </p>
      </header>

      {/* 11.3 · 第一组学完就说清楚：数据只存在本机 */}
      {firstEver && (
        <div className="mt-5 flex gap-3 border-l-2 border-vague py-1 pl-3.5 text-left" data-testid="local-only-warning">
          <HardDriveDownload className="mt-0.5 size-5 shrink-0 text-vague" />
          <div className="min-w-0 text-[0.8125rem] leading-relaxed">
            <b className="block text-[0.875rem] font-semibold text-ink">数据只存在本机，卸载 / 清除会丢失</b>
            <span className="text-ink-2">不用注册、不上传。删掉桌面图标、卸载或清理浏览器，学习记录会一起删掉。学几天后记得在「我的 → 数据与备份」导出一份。</span>
          </div>
        </div>
      )}

      <dl className="mt-5 grid grid-cols-3 divide-x divide-rule border-b border-rule pb-4 text-left">
        {sum.timeMode ? (
          <MiniStat label="今日用时" value={`${Math.floor(sum.ms / 60000)}/${sum.goalMin}分`} />
        ) : sum.goal === 0 && (sum.examMode || sum.paused || sum.recovering) ? (
          // 11.4 · 考前 / 休息 / 恢复期不排新词：第一格是今天复习了多少（不出现 0/0）
          <MiniStat label="今日复习" value={`${sum.reviewed}/${sum.reviewed + sum.due}`} testid="summary-reviewed" />
        ) : (
          <MiniStat label="今日新学" value={`${sum.learned}/${sum.goal}`} />
        )}
        <MiniStat label="待复习" value={String(sum.due)} />
        {s > 0 ? (
          <MiniStat label="连续打卡" value={`${s} 天`} testid="summary-streak" />
        ) : (
          // 11.1 · 庆祝的时候不显示一个泄气的 0：换成离打卡还差多少
          <MiniStat label="今日打卡" value={sum.checked ? "已打卡" : sum.ready ? "可以打卡" : `还差 ${toGo} 个`} testid="summary-streak" />
        )}
      </dl>

      {sum.ready && !sum.checked && (
        <button
          type="button"
          data-testid="summary-checkin"
          onClick={() => {
            const r = checkIn(day);
            toast.success(`打卡成功！连续 ${r.streak} 天`, { id: "checkin", ...(r.earned ? { description: `奖励 1 张补卡（共 ${r.makeup} 张）` } : {}) });
            // 11.1 · 不自动弹分享图：想分享再点
            celebrate(r.milestone);
          }}
          className="press mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-mark text-base font-semibold text-mark-ink ring-[1.5px] ring-ink ring-inset"
        >
          <Flame className="size-5" /> 今日任务完成，打卡
        </button>
      )}

      {sum.checked && (
        <button
          type="button"
          data-testid="summary-share"
          onClick={() => setShare(true)}
          className="press mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[0.9375rem] font-medium ring-1 ring-rule-strong ring-inset hover:bg-paper-2"
        >
          <Flame className="size-4 fill-mark text-ink" /> 今日已打卡 · 生成分享图
        </button>
      )}

      {/* 下一步：学后速测 / 错词再练，排成两条「待办」 */}
      {(postRes && postN > 0) || (!postRes && onPostQuiz) || missed.length > 0 ? (
        <div className="mt-6 border-t border-rule">
          {postRes && postN > 0 && (
            <div className="flex min-h-16 items-center gap-3 border-b border-rule py-3" data-testid="post-result" data-ok={postOk} data-n={postN}>
              <span className="tnum w-12 shrink-0 font-serif text-[1.5rem] leading-none text-know">{postPct}%</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold text-ink">
                  学后速测 {postOk}/{postN} · {postPct}%
                </span>
                <span className="block truncate text-[0.75rem] text-ink-3">{postWrong.length ? `没记住：${postWrong.join("、")}` : "刚学的词全部答对，记得很牢"}</span>
              </span>
            </div>
          )}
          {!postRes && onPostQuiz && (
            <button type="button" data-testid="post-quiz-start" onClick={onPostQuiz} className="press group flex min-h-16 w-full items-center gap-3 border-b border-rule py-3 text-left hover:bg-paper-2/60">
              <ClipboardCheck className="size-5 shrink-0 text-ink-2" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold">学后速测 {words.filter(([w]) => !st.cards[w]?.k).length} 题</span>
                <span className="block truncate text-[0.75rem] text-ink-3">刚学的词马上四选一检验，结果计入小结</span>
              </span>
              <ArrowRight className="size-5 shrink-0 text-ink-3 transition-transform duration-300 ease-[var(--ease-spring)] group-hover:translate-x-0.5" />
            </button>
          )}
          {missed.length > 0 && (
            <button
              type="button"
              data-testid="retry-wrong"
              onClick={() => replaceStudy(router, { mode: "practice", words: missed.join(","), t: Date.now() })}
              className="press group flex min-h-16 w-full items-center gap-3 border-b border-rule py-3 text-left hover:bg-paper-2/60"
            >
              <Dumbbell className="size-5 shrink-0 text-forget" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold text-forget">
                  {mode === "practice" ? "还有错的，再练一遍" : "错词再练"} {missed.length}
                </span>
                <span className="block truncate text-[0.75rem] text-ink-3">换成选择题再过一遍，不影响复习计划</span>
              </span>
              <ArrowRight className="size-5 shrink-0 text-ink-3 transition-transform duration-300 ease-[var(--ease-spring)] group-hover:translate-x-0.5" />
            </button>
          )}
        </div>
      ) : null}

      {/* 这一组的词：一行一个，左边一个语气色小方块（认识 / 模糊 / 不认识），速测结果写在右边 */}
      <h2 className="mt-8 border-b border-ink pb-2 text-[0.8125rem] font-medium text-ink-2">这一组的词</h2>
      <ol>
        {words.map(([w, r], k) => {
          const word = index.map.get(w);
          return (
            <li key={w} className="grid min-h-12 grid-cols-[1.5rem_minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-rule py-2">
              <span className="tnum font-serif text-[0.875rem] text-ink-3">{k + 1}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn("size-2 shrink-0 rounded-[2px]", r === "know" ? "bg-know" : r === "vague" ? "bg-vague" : "bg-forget")} aria-label={r === "know" ? "认识" : r === "vague" ? "模糊" : "不认识"} />
                <span className="word-head truncate text-[1.25rem] leading-tight">{w}</span>
              </span>
              <span className="min-w-0 truncate text-[0.8125rem] text-ink-2">{word ? shortMeaning(word, 1) : ""}</span>
              {postRes && w in postRes ? (
                <span className={cn("shrink-0 text-[0.6875rem] font-semibold", postRes[w] ? "text-know" : "text-forget")} data-testid="post-mark" data-ok={postRes[w] ? 1 : 0}>
                  速测{postRes[w] ? "✓" : "✗"}
                </span>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-8 flex gap-2">
        {mode === "new" && sum.newLeft > 0 ? (
          <button type="button" onClick={() => restart("new")} data-testid="again" className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-lg font-medium ring-1 ring-rule-strong ring-inset hover:bg-paper-2">
            <RotateCcw className="size-4" />
            {sum.remainingGoal > 0 ? "下一组" : "再学一组"}
          </button>
        ) : null}
        {mode === "list" && listId ? (
          <button
            type="button"
            onClick={() => replaceStudy(router, { mode: "list", list: listId, t: Date.now() })}
            data-testid="list-again"
            className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-lg font-medium ring-1 ring-rule-strong ring-inset hover:bg-paper-2"
          >
            <RotateCcw className="size-4" /> 继续词单
          </button>
        ) : sum.due > 0 ? (
          <button
            type="button"
            onClick={() => restart(mode === "speed" ? "speed" : "review")}
            data-testid="go-review"
            className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-lg font-medium ring-1 ring-rule-strong ring-inset hover:bg-paper-2"
          >
            {mode === "speed" ? "继续速刷" : "去复习"} {sum.due}
          </button>
        ) : null}
        <Link to="/" data-testid="back-home" className="press flex h-12 flex-1 items-center justify-center rounded-lg bg-ink font-semibold text-paper-3 hover:bg-ink-2">
          回到今日
        </Link>
      </div>
      <ShareSheet open={share} onOpenChange={setShare} info={info} />
    </div>
  );
}

function MiniStat({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="min-w-0 px-3 first:pl-0" data-testid={testid}>
      <dt className="text-[0.75rem] text-ink-3">{label}</dt>
      <dd className="tnum mt-1.5 truncate font-serif text-[1.625rem] leading-none">{value}</dd>
    </div>
  );
}

