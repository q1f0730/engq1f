import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CalendarClock, Check, CircleHelp, ClipboardCheck, Dumbbell, Flame, HardDriveDownload, Keyboard, Maximize, Minimize, RotateCcw, Star, Swords, Undo2, Volume2, X } from "lucide-react";
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
import { applyAnswer, checkIn, getState, markGoalMet, onExternalChange, previewKill, setBury, snapDayRule, toggleStar, useApp } from "@/lib/store";
import { PostQuiz, PreviewList } from "./study-extra";
import { postQuizWords, postSummary, retryWords } from "@/lib/learnflow";
import { curStreak } from "@/lib/habit";
import { celebrate } from "@/lib/celebrate";
import { cn } from "@/lib/utils";
import { Confusables, Examples, Meanings, Phonetic, Phrases } from "./word-bits";
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
  if (mode === "new") return nextNewGroup(index, st, day);
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

function wordSize(w: string) {
  if (w.length <= 7) return "text-[56px] md:text-[64px]";
  if (w.length <= 10) return "text-[46px] md:text-[56px]";
  if (w.length <= 14) return "text-[36px] md:text-[44px]";
  return "text-[30px] md:text-[36px]";
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
        <div className="text-[20px] font-extrabold">记录在另一个窗口被替换了</div>
        <p className="mt-2 text-[14px] text-muted-foreground">这一组已经结束，刚才这一题没有写进新的记录。</p>
        <button type="button" onClick={() => void router.navigate({ to: "/", replace: true })} className="mt-6 h-12 w-full rounded-2xl bg-primary font-bold text-primary-foreground">
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
    <div className="mx-auto flex h-dvh max-w-xl flex-col px-4 pb-safe md:py-6" data-testid="study" data-mode={mode}>
      {/* 顶栏：只留退出和进度（11.1 · 撤销 / 明天再说 / 收藏放到卡片下面，带文字） */}
      <div className="flex shrink-0 items-center gap-1.5 pt-3 pt-safe md:gap-2">
        <button type="button" onClick={() => exitBack(router)} aria-label="退出" data-testid="study-quit" className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary md:size-10">
          <X className="size-5" />
        </button>
        <div className="flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(doneN / total) * 100}%` }} />
          </div>
        </div>
        <span className="tnum min-w-11 text-center text-[13px] font-semibold text-muted-foreground" data-testid="progress">
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

      <div className="mt-1 flex h-6 shrink-0 items-center justify-center gap-2 text-[12px] font-medium text-muted-foreground">
        <span className="max-w-[10em] truncate" data-testid="study-title">{mode === "list" && listName ? `词单 · ${listName}` : MODE_TITLE[mode]}</span>
        {relearn && <span className="rounded-full bg-forget-soft px-2 py-px text-forget" data-testid="relearn-tag">再来一遍</span>}
        {isQuiz && <span className="rounded-full bg-secondary px-2 py-px">{MODE_LABEL[shownItem.mode]}</span>}
        {word.c && <span className="rounded-full bg-brand-soft px-2 py-px text-primary">核心</span>}
        {leech && (
          <span className="rounded-full bg-forget px-2 py-px text-white" data-testid="leech-tag">
            顽固
          </span>
        )}
        {practice && <span className="rounded-full bg-secondary px-2 py-px">不影响复习计划</span>}
        {resumed > 0 && doneN === 0 && (
          <span className="rounded-full bg-know-soft px-2 py-px text-know" data-testid="resume-note">
            刚才学的 {resumed} 个已保存 ✓
          </span>
        )}
        {eta && (
          <span className="tnum shrink-0" data-testid="eta" data-min={eta.min}>
            · {eta.label}
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
                    className="h-14 w-[38%] rounded-2xl bg-secondary text-[15px] font-semibold text-muted-foreground transition active:scale-[0.98]"
                  >
                    记错了
                  </button>
                ) : (
                  <div className="flex h-14 w-[38%] items-center justify-center rounded-2xl bg-forget-soft text-[13px] font-semibold text-forget">
                    稍后再来
                  </div>
                )}
                <button
                  type="button"
                  onClick={next}
                  data-testid="next"
                  className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-[16px] font-bold text-primary-foreground shadow-lg shadow-primary/25 transition active:scale-[0.98]"
                >
                  下一个 {fine && <span className="rounded-md bg-white/20 px-1.5 text-[11px] font-semibold" data-testid="kbd-hint">空格</span>}
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
  const cls = "flex h-8 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold text-muted-foreground transition hover:bg-secondary disabled:opacity-35";
  return (
    <div className="flex shrink-0 items-center justify-center gap-1 pt-2" data-testid="card-tools">
      <button type="button" onClick={onUndo} disabled={!canUndo} data-testid="undo" aria-label="撤销" className={cls}>
        <Undo2 className="size-4" /> 撤销
      </button>
      {onBury && (
        <button type="button" onClick={onBury} data-testid="bury" aria-label="明天再说" className={cls}>
          <CalendarClock className="size-4" /> 明天再说
        </button>
      )}
      <button type="button" onClick={onStar} data-testid="star" aria-label={starred ? "移出生词本" : "加入生词本"} aria-pressed={starred} className={cn(cls, starred && "text-vague")}>
        <Star className={cn("size-4", starred && "fill-current")} /> {starred ? "已收藏" : "收藏"}
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
        "flex h-16 items-center justify-center gap-2 rounded-2xl text-[16px] font-bold shadow-sm transition active:scale-[0.97]",
        tone === "know" ? "bg-know text-white shadow-know/25 dark:text-[oklch(0.2_0.02_170)]" : "bg-forget-soft text-forget",
      )}
    >
      {side === "left" && <ArrowLeft className="size-4" />}
      <span className="flex flex-col items-center leading-tight">
        {label}
        {hint && <span className="tnum mt-0.5 text-[11px] font-semibold opacity-75">{hint}</span>}
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
        className="relative h-full touch-pan-y select-none overflow-hidden rounded-[32px] border border-border/70 bg-card shadow-[0_18px_50px_-24px_rgba(60,30,20,0.35)]"
        style={dx !== null ? { transform: `translateX(${dx}px) rotate(${dx / 24}deg)` } : { transition: "transform 160ms ease-out" }}
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
        <div className="paper-grain absolute inset-0 opacity-60" />
        <div className="relative flex h-full flex-col items-center px-6 pb-14 pt-8 text-center">
          <div className="fs-card flex flex-1 flex-col items-center justify-center">
            <h2 className={cn("font-display break-all font-extrabold leading-[1.05] tracking-[-0.035em]", wordSize(word.w))} data-testid="card-word" style={{ "--wl": word.w.length } as React.CSSProperties}>
              {word.w}
            </h2>
            <div className="mt-3 flex items-center gap-2.5 text-[16px] text-muted-foreground">
              {(frontIpa || reveal) && <Phonetic word={word} accent={accent} />}
              <button
                type="button"
                aria-label="播放发音"
                onClick={(e) => {
                  e.stopPropagation();
                  speak(word.w, accent);
                }}
                className="grid size-9 place-items-center rounded-full bg-brand-soft text-primary active:scale-90"
              >
                <Volume2 className="size-[18px]" />
              </button>
            </div>
          </div>
          <div className="fs-card w-full max-w-md shrink-0" data-testid="speed-meaning" data-revealed={reveal ? 1 : 0}>
            {reveal ? (
              <div className="rounded-2xl bg-secondary/70 px-4 py-3 text-left">
                <Meanings word={word} />
              </div>
            ) : (
              <div className="flex h-16 items-center justify-center rounded-2xl border-2 border-dashed border-border text-[13px] font-medium text-muted-foreground">
                点一下看释义 · {swipeHint(swap)}
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
          className="absolute bottom-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-secondary/90 px-3.5 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-know"
        >
          <Swords className="size-3.5" /> 斩 · 我本来就会
        </button>
        {hint && (
          <div className={cn("pointer-events-none absolute inset-0 grid place-items-center rounded-[32px] text-[28px] font-extrabold", hint === "know" ? "bg-know/15 text-know" : "bg-forget/15 text-forget")} data-testid="swipe-hint" data-rating={hint}>
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
        "grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary disabled:opacity-35 md:size-10",
        active && "text-vague",
        className,
      )}
    >
      {children}
    </button>
  );
}

function RateBtn({ tone, label, k, hint, onClick, compact }: { tone: Grade4; label: string; k: string; hint?: string; onClick: () => void; compact?: boolean }) {
  const cls = {
    easy: "bg-primary text-primary-foreground shadow-primary/25",
    know: "bg-know text-white shadow-know/25 dark:text-[oklch(0.2_0.02_170)]",
    vague: "bg-vague-soft text-vague",
    forget: "bg-forget-soft text-forget",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`rate-${tone}`}
      className={cn("relative flex h-16 flex-col items-center justify-center rounded-2xl font-bold shadow-sm transition active:scale-[0.97]", compact ? "text-[15px]" : "text-[16px]", cls)}
    >
      <span className="leading-tight">{label}</span>
      {hint && (
        <span className="tnum mt-0.5 text-[11px] font-semibold leading-none opacity-75" data-testid={`ivl-${tone}`}>
          {hint}
        </span>
      )}
      <span className="absolute right-2 top-1.5 hidden text-[10px] font-semibold opacity-60 fine:block">{k}</span>
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

  const front = (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center" data-testid="card-front">
      {cnFirst ? (
        <div className="fs-card w-full max-w-md text-left">
          <Meanings word={word} size="lg" />
          <p className="mt-6 text-center text-[13px] text-muted-foreground">想一想对应的英文单词</p>
        </div>
      ) : (
        <div className="fs-card flex max-w-full flex-col items-center">
          <h2 className={cn("font-display break-all font-extrabold leading-[1.05] tracking-[-0.035em]", wordSize(word.w))} data-testid="card-word">
            {word.w}
          </h2>
          <div className="mt-4 flex items-center gap-2.5 text-[17px] text-muted-foreground" data-testid="front-ipa" data-shown={frontIpa ? 1 : 0}>
            {frontIpa && <Phonetic word={word} accent={accent} />}
            <button
              type="button"
              aria-label="播放发音"
              onClick={(e) => {
                e.stopPropagation();
                speak(word.w, accent);
              }}
              className="grid size-10 place-items-center rounded-full bg-brand-soft text-primary active:scale-90"
            >
              <Volume2 className="size-5" />
            </button>
          </div>
          <p className="mt-10 text-[13px] text-muted-foreground/80" data-testid="front-hint">{frontIpa ? "认识这个词吗？点卡片可以先看释义" : "先认词形 · 音标在背面"}</p>
        </div>
      )}
    </div>
  );

  const ratingTag = last ? (
    <span
      className={cn(
        "pop rounded-full px-2.5 py-1 text-[12px] font-bold",
        last.rating === "know" ? "bg-know-soft text-know" : last.rating === "vague" ? "bg-vague-soft text-vague" : "bg-forget-soft text-forget",
      )}
      data-testid="rated-tag"
    >
      {last.rating === "know" ? "认识" : last.rating === "vague" ? "模糊" : "不认识"}
    </span>
  ) : null;

  const back = (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-6 text-left" data-testid="card-back">
      <div className="fs-card my-auto">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display break-words text-[34px] font-extrabold leading-tight tracking-tight">{word.w}</h2>
          <div className="mt-1 flex items-center gap-2 text-[15px] text-muted-foreground">
            <Phonetic word={word} accent={accent} />
            <button
              type="button"
              aria-label="播放发音"
              onClick={(e) => {
                e.stopPropagation();
                speak(word.w, accent);
              }}
              className="grid size-8 place-items-center rounded-full bg-brand-soft text-primary"
            >
              <Volume2 className="size-4" />
            </button>
          </div>
        </div>
        {ratingTag}
      </div>
      <div className="my-5 h-px bg-border" />
      <Meanings word={word} size="lg" />
      <div className="mt-6 empty:hidden">
        <Phrases word={word} />
      </div>
      <div className="mt-6 empty:hidden">
        <Confusables index={index} word={word} accent={accent} />
      </div>
      <div className="mt-6 empty:hidden">
        <Examples word={word} enabled={flipped} />
      </div>
      </div>
    </div>
  );

  const style = drag
    ? { transform: `translate(${drag.x}px, ${Math.min(0, drag.y) * 0.6}px) rotate(${drag.x / 18}deg)`, transition: "none" }
    : { transition: "transform 260ms cubic-bezier(.2,.8,.2,1)" };

  return (
    <div className="relative min-h-0 flex-1 card-in">
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
          <div
            className={cn(
              "flip-face relative h-full overflow-hidden rounded-[32px] border border-border/70 bg-card shadow-[0_18px_50px_-24px_rgba(60,30,20,0.35)]",
            )}
            aria-hidden={flipped}
          >
            <div className="paper-grain absolute inset-0 opacity-60" />
            <div className="relative h-full">{front}</div>
            {canKill && <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onKill();
              }}
              data-testid="kill"
              className="card-kill absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-secondary/90 px-3.5 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-know"
            >
              <Swords className="size-3.5" /> 斩 · 我本来就会
            </button>}
            {hint && (
              <div
                className={cn(
                  "absolute inset-0 grid place-items-center rounded-[32px] text-[28px] font-extrabold",
                  hint === "know" ? "bg-know/15 text-know" : hint === "vague" ? "bg-vague/15 text-vague" : "bg-forget/15 text-forget",
                )}
              >
                <span data-testid="swipe-hint" data-rating={hint}>{hint === "know" ? "认识" : hint === "vague" ? "模糊" : "不认识"}</span>
              </div>
            )}
          </div>
          <div className="flip-face flip-back h-full overflow-hidden rounded-[32px] border border-border/70 bg-card shadow-[0_18px_50px_-24px_rgba(60,30,20,0.35)]" aria-hidden={!flipped}>
            {back}
          </div>
        </div>
      </div>
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
      <ChoiceList choices={options} done={done} pick={answered?.pick} wrong={done && answered?.rating === "forget" && answered.pick !== -1} shakeKey={shake} onPick={onPick} subTestId={mode === "listen" ? "listen-meaning" : undefined} />
      <div className="shrink-0 pb-4 pt-3">
        {done ? (
          <div className={cn("flex gap-2.5", leftHand && "flex-row-reverse")} data-testid="quiz-actions">
            <button type="button" onClick={onUndo} className="h-14 w-[30%] rounded-2xl bg-secondary text-[15px] font-semibold text-muted-foreground">
              撤销
            </button>
            <button
              type="button"
              onClick={onNext}
              data-testid="next"
              className={cn(
                "flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-[16px] font-bold shadow-lg transition active:scale-[0.98]",
                answered?.rating === "know" ? "bg-know text-white shadow-know/25" : "bg-primary text-primary-foreground shadow-primary/25",
              )}
            >
              {answered?.rating === "know" ? "答对了 · 下一个" : "记住它 · 下一个"}
            </button>
          </div>
        ) : (
          <button type="button" onClick={onGiveUp} data-testid="give-up" className="h-11 w-full rounded-2xl text-[14px] font-semibold text-muted-foreground hover:bg-secondary">
            <CircleHelp className="mr-1.5 inline size-4" />
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
      className={cn(
        "relative flex flex-1 flex-col items-center justify-center overflow-y-auto rounded-[32px] border border-border/70 bg-card px-6 py-6 text-center shadow-[0_18px_50px_-24px_rgba(60,30,20,0.35)]",
        compact ? "min-h-[120px]" : "min-h-[150px]",
      )}
      data-testid="quiz-prompt"
    >
      <div className="fs-card flex w-full flex-col items-center">
      {mode === "cn2en" && !done && (
        <div className="w-full max-w-md text-left">
          <Meanings word={word} size="lg" />
        </div>
      )}
      {(mode === "audio" || mode === "listen") && !done && (
        <button
          type="button"
          onClick={() => speak(word.w, accent)}
          className="grid size-24 place-items-center rounded-full bg-brand-soft text-primary transition active:scale-95"
          aria-label="再听一遍"
          data-testid="quiz-audio"
        >
          <Volume2 className="size-10" />
        </button>
      )}
      {mode === "phrase" && phrase && (
        <div className={cn("w-full max-w-md", done ? "order-last mt-4 rounded-2xl bg-secondary/70 px-4 py-3 text-left" : "")} data-testid="quiz-phrase">
          <div className={cn("font-display font-bold leading-snug tracking-tight", done ? "text-[16px]" : "text-[30px]")}>
            <PhraseText phrase={phrase[0]} word={word.w} />
          </div>
          {done ? <div className="mt-0.5 text-[14px] text-muted-foreground">{phrase[1]}</div> : null}
        </div>
      )}
      {cloze && (
        <div className={cn("w-full max-w-md", done ? "order-last mt-4 rounded-2xl bg-secondary/70 px-4 py-3 text-left" : "")} data-testid="quiz-cloze">
          <div className={cn("font-display font-bold leading-snug tracking-tight", done ? "text-[16px]" : "text-[30px]")}>
            {done ? <PhraseText phrase={cloze.phrase} word={word.w} /> : <ClozeText text={cloze.blanked} />}
          </div>
          <div className={cn("text-muted-foreground", done ? "mt-0.5 text-[14px]" : "mt-2 text-[15px]")} data-testid="cloze-cn">
            {cloze.cn}
          </div>
        </div>
      )}
      {ex && (
        <div className={cn("w-full max-w-md text-left", done ? "order-last mt-4 rounded-2xl bg-secondary/70 px-4 py-3" : "")} data-testid="quiz-example">
          {!done && <div className="mb-2 text-[12px] font-bold tracking-wider text-muted-foreground">例句</div>}
          <div className={cn("leading-relaxed", done ? "text-[14px] text-foreground/85" : "font-display text-[21px] font-semibold tracking-tight")}>
            {done ? (
              <>
                {ex.blanked.split("____")[0]}
                <b className="font-semibold text-primary">{ex.form}</b>
                {ex.blanked.split("____").slice(1).join("____")}
              </>
            ) : (
              <ClozeText text={ex.blanked} />
            )}
          </div>
          {!done && ex.form.toLowerCase() !== word.w.toLowerCase() && <div className="mt-2 text-[12px] text-muted-foreground" data-testid="example-form-hint">空格处是这个词的变形</div>}
        </div>
      )}
      {cnph && (
        <div className={cn("w-full max-w-md", done ? "order-last mt-4 rounded-2xl bg-secondary/70 px-4 py-3 text-left" : "")} data-testid="quiz-cnphrase">
          {done ? (
            <>
              <div className="font-display text-[16px] font-bold leading-snug tracking-tight">
                <PhraseText phrase={cnph[0]} word={word.w} />
              </div>
              <div className="mt-0.5 text-[14px] text-muted-foreground">{cnph[1]}</div>
            </>
          ) : (
            <div className="text-[28px] font-bold leading-snug" data-testid="cnphrase-cn">
              {cnph[1]}
            </div>
          )}
        </div>
      )}
      {revealWord && (
        <>
          <h2 className={cn("font-display break-all font-extrabold leading-[1.05] tracking-[-0.035em]", done ? "text-[38px]" : wordSize(word.w))} data-testid="quiz-word">
            {word.w}
          </h2>
          <div className="mt-2 flex items-center gap-2 text-[16px] text-muted-foreground">
            <Phonetic word={word} accent={accent} />
            <button type="button" aria-label="播放发音" onClick={() => speak(word.w, accent)} className="grid size-9 place-items-center rounded-full bg-brand-soft text-primary">
              <Volume2 className="size-[18px]" />
            </button>
          </div>
        </>
      )}
      {done && (
        <div className="mt-4 w-full max-w-md text-left">
          <Meanings word={word} />
        </div>
      )}
      {done && !compact && word.ph?.length && mode !== "cloze" && mode !== "cnphrase" ? (
        <div className="mt-4 w-full max-w-md text-left">
          <Phrases word={word} max={3} />
        </div>
      ) : null}
      {!done && <p className="mt-5 text-[13px] text-muted-foreground" data-testid="quiz-hint">{MODE_HINT[mode] ?? "选出正确的意思"}</p>}
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
              "flex min-h-[52px] w-full min-w-0 items-center gap-3 rounded-2xl border px-4 py-2.5 text-left text-[15px] transition active:scale-[0.99]",
              !done && "border-border/80 bg-card hover:border-primary/50",
              done && isCorrect && "border-know bg-know-soft text-foreground",
              done && picked && !isCorrect && "border-forget bg-forget-soft",
              done && !isCorrect && !picked && "border-border/60 bg-card opacity-55",
            )}
          >
            {(fine || (done && (isCorrect || picked))) && (
              <span
                data-testid="choice-badge"
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-lg bg-secondary text-[12px] font-bold text-muted-foreground",
                  done && isCorrect && "bg-know text-white",
                  done && picked && !isCorrect && "bg-forget text-white",
                )}
              >
                {done && isCorrect ? <Check className="size-3.5" /> : done && picked ? <X className="size-3.5" /> : k + 1}
              </span>
            )}
            <span className={cn("fs-card min-w-0 flex-1 leading-snug", o.en ? "font-display text-[17px] font-semibold" : "line-clamp-2")}>
              {o.text}
              {done && o.sub && (
                <span className="mt-0.5 block truncate font-sans text-[12px] font-normal text-muted-foreground" data-testid={subTestId}>
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
          {k < parts.length - 1 && <span className="mx-1 inline-block w-20 border-b-[3px] border-primary align-baseline" data-testid="cloze-blank" />}
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
      <span className="text-primary">{phrase.slice(i, i + word.length)}</span>
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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center" data-testid="study-empty">
      <div className="pop grid size-20 place-items-center rounded-full bg-know-soft text-know">
        <Check className="size-9" />
      </div>
      <h1 className="mt-6 text-[22px] font-extrabold">{text[mode][0]}</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">{text[mode][1]}</p>
      <Link to="/" className="mt-8 flex h-12 items-center rounded-2xl bg-primary px-8 font-semibold text-primary-foreground">
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
        <button type="button" onClick={() => exitBack(router)} aria-label="关闭" data-testid="summary-close" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
          <X className="size-5" />
        </button>
      </div>
      <div className="flex flex-col items-center pt-4 text-center">
        <div className="pop grid size-20 place-items-center rounded-[28px] bg-primary text-primary-foreground shadow-xl shadow-primary/30">
          <Check className="size-10" strokeWidth={3} />
        </div>
        <h1 className="mt-5 font-display text-[28px] font-extrabold tracking-tight" data-testid="summary-title">
          {firstEver ? "第一组 ✓" : "本组完成！"}
        </h1>
        {firstEver && (
          <p className="mt-1 text-[14px] font-semibold text-primary" data-testid="first-group">
            好的开始！{comeBackLine(words.filter(([w]) => !st.cards[w]?.k).map(([w]) => st.cards[w]?.d).filter((d): d is string => !!d), day, words.length)}
          </p>
        )}
        <p className="mt-1 text-[15px] text-muted-foreground">
          {MODE_TITLE[mode]} {words.length} 词 · 首次正确率 {acc}% · 用时 {Math.max(1, Math.round(ms / 60000))} 分钟
        </p>
      </div>

      {/* 11.3 · 第一组学完就说清楚：数据只存在本机 */}
      {firstEver && (
        <div className="mt-5 flex gap-3 rounded-3xl border border-vague/30 bg-vague-soft px-4 py-3.5 text-left" data-testid="local-only-warning">
          <HardDriveDownload className="mt-0.5 size-5 shrink-0 text-vague" />
          <div className="min-w-0 text-[13px] leading-snug">
            <b className="block text-[14px] text-vague">数据只存在本机，卸载 / 清除会丢失</b>
            <span className="text-muted-foreground">不用注册、不上传。删掉桌面图标、卸载或清理浏览器，学习记录会一起删掉。学几天后记得在「我的 → 数据与备份」导出一份。</span>
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-2.5 text-center">
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
      </div>

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
          className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[16px] font-bold text-primary-foreground shadow-lg shadow-primary/25"
        >
          <Flame className="size-5" /> 今日任务完成，打卡
        </button>
      )}

      {sum.checked && (
        <button
          type="button"
          data-testid="summary-share"
          onClick={() => setShare(true)}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary text-[15px] font-semibold"
        >
          <Flame className="size-4 text-primary" /> 今日已打卡 · 生成分享图
        </button>
      )}

      {postRes && postN > 0 && (
        <div className="mt-5 flex items-center gap-3 rounded-3xl border border-know/25 bg-know-soft px-4 py-3.5" data-testid="post-result" data-ok={postOk} data-n={postN}>
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-know text-white dark:text-[oklch(0.2_0.02_170)]">
            <ClipboardCheck className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-know">
              学后速测 {postOk}/{postN} · {postPct}%
            </span>
            <span className="block truncate text-[12px] text-muted-foreground">{postWrong.length ? `没记住：${postWrong.join("、")}` : "刚学的词全部答对，记得很牢"}</span>
          </span>
        </div>
      )}

      {!postRes && onPostQuiz && (
        <button
          type="button"
          data-testid="post-quiz-start"
          onClick={onPostQuiz}
          className="mt-5 flex w-full items-center gap-3 rounded-3xl border border-know/25 bg-know-soft px-4 py-3.5 text-left transition active:scale-[0.99]"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-know text-white dark:text-[oklch(0.2_0.02_170)]">
            <ClipboardCheck className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-know">学后速测 {words.filter(([w]) => !st.cards[w]?.k).length} 题</span>
            <span className="block truncate text-[12px] text-muted-foreground">刚学的词马上四选一检验，结果计入小结</span>
          </span>
          <ArrowRight className="size-5 shrink-0 text-know" />
        </button>
      )}

      {missed.length > 0 && (
        <button
          type="button"
          data-testid="retry-wrong"
          onClick={() => replaceStudy(router, { mode: "practice", words: missed.join(","), t: Date.now() })}
          className="mt-5 flex w-full items-center gap-3 rounded-3xl border border-forget/25 bg-forget-soft px-4 py-3.5 text-left transition active:scale-[0.99]"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-forget text-white">
            <Dumbbell className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-forget">{mode === "practice" ? "还有错的，再练一遍" : "错词再练"} {missed.length}</span>
            <span className="block truncate text-[12px] text-muted-foreground">换成选择题再过一遍，不影响复习计划</span>
          </span>
        </button>
      )}

      <div className="mt-6 rounded-3xl border border-border/70 bg-card p-2">
        {words.map(([w, r]) => {
          const word = index.map.get(w);
          return (
            <div key={w} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  r === "know" ? "bg-know" : r === "vague" ? "bg-vague" : "bg-forget",
                )}
              />
              <span className="font-display w-28 shrink-0 truncate text-[16px] font-bold">{w}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{word ? shortMeaning(word, 1) : ""}</span>
              {postRes && w in postRes && (
                <span
                  className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", postRes[w] ? "bg-know-soft text-know" : "bg-forget-soft text-forget")}
                  data-testid="post-mark"
                  data-ok={postRes[w] ? 1 : 0}
                >
                  速测{postRes[w] ? "✓" : "✗"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex gap-2.5">
        {mode === "new" && sum.newLeft > 0 ? (
          <button
            type="button"
            onClick={() => restart("new")}
            data-testid="again"
            className="flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl bg-secondary py-3.5 font-semibold"
          >
            <RotateCcw className="size-4" />
            {sum.remainingGoal > 0 ? "下一组" : "再学一组"}
          </button>
        ) : null}
        {mode === "list" && listId ? (
          <button
            type="button"
            onClick={() => replaceStudy(router, { mode: "list", list: listId, t: Date.now() })}
            data-testid="list-again"
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-secondary py-3.5 font-semibold"
          >
            <RotateCcw className="size-4" /> 继续词单
          </button>
        ) : sum.due > 0 ? (
          <button
            type="button"
            onClick={() => restart(mode === "speed" ? "speed" : "review")}
            data-testid="go-review"
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-secondary py-3.5 font-semibold"
          >
            {mode === "speed" ? "继续速刷" : "去复习"} {sum.due}
          </button>
        ) : null}
        <Link to="/" data-testid="back-home" className="flex flex-1 items-center justify-center rounded-2xl bg-primary py-3.5 font-semibold text-primary-foreground">
          回到今日
        </Link>
      </div>
      <ShareSheet open={share} onOpenChange={setShare} info={info} />
    </div>
  );
}

function MiniStat({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="rounded-2xl bg-secondary/80 px-2 py-3" data-testid={testid}>
      <div className="tnum truncate text-[20px] font-extrabold">{value}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{label}</div>
    </div>
  );
}

