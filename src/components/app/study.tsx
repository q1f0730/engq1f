import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CalendarClock, Check, CircleHelp, Dumbbell, Flame, Keyboard, Maximize, Minimize, RotateCcw, Star, Swords, Undo2, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { speak } from "@/lib/audio";
import { now, today } from "@/lib/clock";
import { shortMeaning, type Word, type WordIndex } from "@/lib/data";
import { MODE_HINT, MODE_LABEL, choicesFor, clozeFor, coreGroupWords, type Choice } from "@/lib/exam";
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
  type Notebook,
} from "@/lib/plan";
import { listGroup } from "@/lib/lists";
import { buzz } from "@/lib/haptics";
import {
  addDays,
  answer,
  buryCurrent,
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
import { applyAnswer, checkIn, getState, setBury, toggleStar, useApp } from "@/lib/store";
import { curStreak } from "@/lib/habit";
import { celebrate } from "@/lib/celebrate";
import { cn } from "@/lib/utils";
import { Confusables, Examples, Meanings, Phonetic, Phrases } from "./word-bits";
import { ShortcutsSheet } from "./shortcuts";
import { ShareSheet } from "./share-sheet";
import { useShareInfo } from "@/lib/use-share";
import { useWakeLock } from "@/lib/wakelock";
import { rankGroup, revEntry, type RevEntry } from "@/lib/stats";
import { estimateRemaining, historyPace, quizAnnouncement, rateAnnouncement, rateOrder, sideRating, speedOrder, swipeHint, swipeRating } from "@/lib/ux";
import { fullscreenSupported, useFullscreen } from "@/lib/fullscreen";

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
  mastered: "熟词回顾",
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

type Last = { item: SessionItem; rating: Rating; pick?: number; via: "rate" | "quiz" | "peek" };

export function Study({ index, mode, words = [], listId, listName }: { index: WordIndex; mode: StudyMode; words?: string[]; listId?: string; listName?: string }) {
  const st = useApp();
  const navigate = useNavigate();
  const accent = st.settings.accent;
  const leftHand = !!st.settings.leftHand;
  const swap = !!st.settings.swapSwipe;
  const frontIpa = st.settings.frontIpa !== false;
  const practice = mode === "practice";
  const speedMode = mode === "speed";
  const [items] = useState(() => buildItems(index, mode, words));
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
    if (phase !== "front" || !shownItem) return;
    shownAt.current = now();
    setReveal(false);
    const m = shownItem.repeat ? "recall" : shownItem.mode;
    if (m === "audio" || m === "listen" || (st.settings.autoplay && (m === "en2cn" || m === "poly" || m === "pos" || (m === "recall" && !cnFirst)))) speak(shownItem.w, accent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey, phase]);

  const day = today();

  const doAnswer = useCallback(
    (rating: Rating, via: Last["via"], pick?: number) => {
      const it = current(session);
      if (!it) return;
      const first = !(it.w in session.firsts);
      const spent = now() - shownAt.current;
      const res = answer(session, getCard(it.w), rating, day, getLog(day), spent);
      answerMs.current.push(spent);
      put(it.w, res.card, day, res.log, revEntry(it.w, now(), rating, { isNew: it.kind === "new", repeat: !first, card: res.card }));
      revSteps.current.push(true);
      setSession(res.session);
      buzz(rating);
      return { it, res, via, pick };
    },
    [session, day, getCard, getLog, put],
  );

  const rate = useCallback(
    (rating: Rating) => {
      if (!head || isQuiz) return;
      if (phase === "back" && !peek) return;
      const hintNext = previewIntervals(getState().cards[head.w], day, { repeat: head.w in session.firsts, early: head.early });
      const r = doAnswer(rating, peek || speedMode ? "peek" : "rate");
      if (!r) return;
      say(rateAnnouncement(r.it.w, rating, practice ? undefined : hintNext[rating]));
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

  const pick = useCallback(
    (k: number) => {
      if (!head || !isQuiz || phase !== "front" || !word) return;
      const opt = options[k];
      if (!opt) return;
      const ok = opt.correct;
      const r = doAnswer(ok ? "know" : "forget", "quiz", k);
      if (!r) return;
      if (!ok) setShake((x) => x + 1);
      say(quizAnnouncement(ok, word.w, options.find((o) => o.correct)?.text ?? word.w));
      setLast({ item: r.it, rating: ok ? "know" : "forget", pick: k, via: "quiz" });
      setPhase("back");
      if (shownItem?.mode === "cn2en" || shownItem?.mode === "audio" || shownItem?.mode === "listen" || shownItem?.mode === "cloze") speak(word.w, accent);
    },
    [head, isQuiz, phase, word, options, doAnswer, shownItem, accent, say],
  );

  const giveUp = useCallback(() => {
    if (!isQuiz || phase !== "front" || !word) return;
    const r = doAnswer("forget", "quiz", -1);
    if (!r) return;
    say(quizAnnouncement(false, word.w, options.find((o) => o.correct)?.text ?? word.w, true));
    setLast({ item: r.it, rating: "forget", pick: -1, via: "quiz" });
    setPhase("back");
    speak(word.w, accent);
  }, [isQuiz, phase, word, doAnswer, accent, options, say]);

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
    const res = answer(u.session, getCard(u.w), "forget", day, getLog(day), 0);
    put(u.w, res.card, day, res.log, revEntry(u.w, now(), "forget", { isNew: it?.kind === "new", repeat: !first, card: res.card }));
    revSteps.current.push(true);
    setSession(res.session);
    setLast({ ...last, rating: "forget" });
    buzz("forget");
    say(rateAnnouncement(u.w, "forget"));
    toast("已改为「不认识」，稍后再来一遍");
  }, [phase, last, peek, session, day, put, putUndo, getCard, getLog, say]);

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
  }, [practice, rewind, day]);

  const doKill = useCallback(() => {
    if (practice) return;
    const s0 = rewind();
    if (!s0) return;
    const it = current(s0);
    if (!it) return;
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
    toast(`已斩：${it.w}`, { description: "标记为已掌握，以后不再出现" });
  }, [practice, rewind, day]);

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
      if (help && e.key !== "?") return;
      const k = e.key.toLowerCase();
      if (k === "?" || (k === "/" && e.shiftKey)) {
        setHelp((h) => !h);
        return;
      }
      if (finished) return;
      if (k === "escape") return navigate({ to: "/" });
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
      }
      if (phase === "back" && !peek && (k === "1" || k === "2" || k === "3")) {
        // 背面按数字 = 下一个（方便连按）
        return next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [help, finished, next, doUndo, star, doKill, doBury, replay, isQuiz, phase, peek, pick, rate, navigate, speedMode, swap, canFocus, toggleFocus]);

  useWakeLock(!finished && items.length > 0);

  if (!items.length) return <Empty mode={mode} />;
  if (finished) return <Summary session={session} index={index} mode={mode} ms={now() - startedAt.current} listId={listId} />;
  if (!shownItem || !word) return null;

  const starred = !!st.star[word.w];
  const total = session.total;
  const doneN = session.done.length;
  const flipped = phase === "back" && !isQuiz;
  const relearn = !!shownItem.repeat;
  const leech = !practice && isLeech(st.cards[word.w]);
  const eta = estimateRemaining(session.queue.length, answerMs.current, pace);
  const preview =
    !practice && head && !isQuiz && (phase === "front" || peek)
      ? previewIntervals(getState().cards[head.w], day, { repeat: head.w in session.firsts, early: head.early })
      : null;

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col px-4 pb-safe md:py-6" data-testid="study" data-mode={mode}>
      {/* 顶栏 */}
      <div className="flex shrink-0 items-center gap-1.5 pt-3 pt-safe md:gap-2">
        <Link to="/" aria-label="退出" className="grid size-9 shrink-0 place-items-center md:size-10 rounded-full text-muted-foreground hover:bg-secondary">
          <X className="size-5" />
        </Link>
        <div className="flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(doneN / total) * 100}%` }} />
          </div>
        </div>
        <span className="tnum min-w-11 text-center text-[13px] font-semibold text-muted-foreground" data-testid="progress">
          {doneN}/{total}
        </span>
        <IconBtn label="撤销 (Z)" onClick={doUndo} testid="undo" disabled={!session.history.length && !peek}>
          <Undo2 className="size-[18px]" />
        </IconBtn>
        {!practice && (
          <IconBtn label="明天再说 (B)" onClick={doBury} testid="bury">
            <CalendarClock className="size-[18px]" />
          </IconBtn>
        )}
        <IconBtn label="生词本 (S)" onClick={star} testid="star" active={starred}>
          <Star className={cn("size-[18px]", starred && "fill-current")} />
        </IconBtn>
        {canFocus && (
          <IconBtn label={focus ? "退出专注 (F)" : "专注模式 (F)"} onClick={toggleFocus} testid="focus" active={focus} pressed={focus}>
            {focus ? <Minimize className="size-[18px]" /> : <Maximize className="size-[18px]" />}
          </IconBtn>
        )}
        <IconBtn label="快捷键 (?)" onClick={() => setHelp(true)} className="hidden md:grid">
          <Keyboard className="size-[18px]" />
        </IconBtn>
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
          <div className="shrink-0 pb-4 pt-4">
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
          <div className="shrink-0 pb-4 pt-4">
            {phase === "front" || peek ? (
              <div className="grid grid-cols-3 gap-2.5" data-testid="rate-buttons" data-order={rateOrder(leftHand).join(",")}>
                {rateOrder(leftHand).map((r) => (
                  <RateBtn key={r} tone={r} k={RATE_KEY[r]} label={RATE_CN[r]} hint={preview?.[r]} onClick={() => rate(r)} />
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
                  下一个 <span className="rounded-md bg-white/20 px-1.5 text-[11px] font-semibold">空格</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
      <ShortcutsSheet open={help} onOpenChange={setHelp} />
    </div>
  );
}


const RATE_CN: Record<Rating, string> = { know: "认识", vague: "模糊", forget: "不认识" };
const RATE_KEY: Record<Rating, string> = { know: "1", vague: "2", forget: "3" };

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
            <h2 className={cn("font-display break-all font-extrabold leading-[1.05] tracking-[-0.035em]", wordSize(word.w))} data-testid="card-word">
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
          <Swords className="size-3.5" /> 斩 · 已掌握
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

function RateBtn({ tone, label, k, hint, onClick }: { tone: "know" | "vague" | "forget"; label: string; k: string; hint?: string; onClick: () => void }) {
  const cls = {
    know: "bg-know text-white shadow-know/25 dark:text-[oklch(0.2_0.02_170)]",
    vague: "bg-vague-soft text-vague",
    forget: "bg-forget-soft text-forget",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`rate-${tone}`}
      className={cn("relative flex h-16 flex-col items-center justify-center rounded-2xl text-[16px] font-bold shadow-sm transition active:scale-[0.97]", cls)}
    >
      <span className="leading-tight">{label}</span>
      {hint && (
        <span className="tnum mt-0.5 text-[11px] font-semibold leading-none opacity-75" data-testid={`ivl-${tone}`}>
          {hint}
        </span>
      )}
      <span className="absolute right-2 top-1.5 hidden text-[10px] font-semibold opacity-60 md:block">{k}</span>
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
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
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
          <p className="mt-10 text-[13px] text-muted-foreground/80">{frontIpa ? "认识这个词吗？点卡片可以先看释义" : "先认词形 · 音标在背面"}</p>
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
    <div className="h-full overflow-y-auto px-6 py-6 text-left" data-testid="card-back">
      <div className="fs-card">
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
              className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-secondary/90 px-3.5 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-know"
            >
              <Swords className="size-3.5" /> 斩 · 已掌握
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
    <div className="flex min-h-0 flex-1 flex-col card-in" data-testid="quiz" data-quiz-mode={mode}>
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
      {done && !compact && word.ph?.length && mode !== "cloze" ? (
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
  return (
    <div key={shakeKey} className={cn("mt-3 grid shrink-0 gap-2", wrong && "shake")} data-testid="quiz-options">
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
              "flex min-h-[52px] items-center gap-3 rounded-2xl border px-4 py-2.5 text-left text-[15px] transition active:scale-[0.99]",
              !done && "border-border/80 bg-card hover:border-primary/50",
              done && isCorrect && "border-know bg-know-soft text-foreground",
              done && picked && !isCorrect && "border-forget bg-forget-soft",
              done && !isCorrect && !picked && "border-border/60 bg-card opacity-55",
            )}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-lg bg-secondary text-[12px] font-bold text-muted-foreground",
                done && isCorrect && "bg-know text-white",
                done && picked && !isCorrect && "bg-forget text-white",
              )}
            >
              {done && isCorrect ? <Check className="size-3.5" /> : done && picked ? <X className="size-3.5" /> : k + 1}
            </span>
            <span className={cn("fs-card min-w-0", o.en ? "font-display text-[17px] font-semibold" : "line-clamp-2")}>
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
    mastered: ["还没有熟词", "学习时按 D「斩」掉已经掌握的词。"],
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

function Summary({ session, index, mode, ms, listId }: { session: Session; index: WordIndex; mode: StudyMode; ms: number; listId?: string }) {
  const st = useApp();
  const navigate = useNavigate();
  const day = today();
  const sum = summarize(index, st, day);
  const acc = Math.round(sessionAccuracy(session) * 100);
  const words = Object.entries(session.firsts);
  const [share, setShare] = useState(false);
  const info = useShareInfo(index);
  const s = curStreak(st, day);

  const restart = (m: StudyMode) => navigate({ to: "/study", search: { mode: m, t: Date.now() } });
  const missed = words.filter(([, r]) => r !== "know").map(([w]) => w);

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-10 pt-safe" data-testid="summary">
      <div className="flex items-center pt-3">
        <Link to="/" aria-label="关闭" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
          <X className="size-5" />
        </Link>
      </div>
      <div className="flex flex-col items-center pt-4 text-center">
        <div className="pop grid size-20 place-items-center rounded-[28px] bg-primary text-primary-foreground shadow-xl shadow-primary/30">
          <Check className="size-10" strokeWidth={3} />
        </div>
        <h1 className="mt-5 font-display text-[28px] font-extrabold tracking-tight">本组完成！</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {MODE_TITLE[mode]} {words.length} 词 · 首次正确率 {acc}% · 用时 {Math.max(1, Math.round(ms / 60000))} 分钟
        </p>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2.5 text-center">
        {sum.timeMode ? (
          <MiniStat label="今日用时" value={`${Math.floor(sum.ms / 60000)}/${sum.goalMin}分`} />
        ) : (
          <MiniStat label="今日新学" value={`${sum.learned}/${sum.goal}`} />
        )}
        <MiniStat label="待复习" value={String(sum.due)} />
        <MiniStat label="连续打卡" value={`${s} 天`} />
      </div>

      {sum.ready && !sum.checked && (
        <button
          type="button"
          data-testid="summary-checkin"
          onClick={() => {
            const r = checkIn(day);
            toast.success(`打卡成功！连续 ${r.streak} 天`, r.earned ? { description: `奖励 1 张补卡（共 ${r.makeup} 张）` } : undefined);
            celebrate(r.milestone, () => setShare(true));
          }}
          className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[16px] font-bold text-primary-foreground shadow-lg shadow-primary/25"
        >
          <Flame className="size-5" /> 今日任务完成，打卡
        </button>
      )}

      {missed.length > 0 && (
        <button
          type="button"
          data-testid="retry-wrong"
          onClick={() => navigate({ to: "/study", search: { mode: "practice", words: missed.join(","), t: Date.now() } })}
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
            onClick={() => navigate({ to: "/study", search: { mode: "list", list: listId, t: Date.now() } })}
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary/80 px-2 py-3">
      <div className="tnum text-[20px] font-extrabold">{value}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{label}</div>
    </div>
  );
}
