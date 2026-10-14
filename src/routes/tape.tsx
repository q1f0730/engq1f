import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Headphones, Pause, Play, Repeat, SkipBack, SkipForward, Timer, X } from "@/components/app/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { Segmented, Spinner } from "@/components/app/shell";
import { Phonetic } from "@/components/app/word-bits";
import { say, speak, stopAudio } from "@/lib/audio";
import { now, today } from "@/lib/clock";
import { posLabel, useWords, type Word, type WordIndex } from "@/lib/data";
import { bindTapeHandlers, disposeKeepAlive, setTapeMeta, startKeepAlive, stopKeepAlive } from "@/lib/media-session";
import { TAPE_SOURCES, tapeList, todayNewWords, type TapeSource } from "@/lib/plan";
import { REPEAT_OPTIONS, RATE_OPTIONS, SLEEP_OPTIONS, getState, setSettings, useApp } from "@/lib/store";
import { cnSpeech, fmtRemain, sleepLeft, tapeSteps, wrapIndex, type TapeStep } from "@/lib/tape";
import { useWakeLock } from "@/lib/wakelock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tape")({
  validateSearch: (s: Record<string, unknown>): { src?: TapeSource } => ({
    src: TAPE_SOURCES.includes(s.src as TapeSource) ? (s.src as TapeSource) : undefined,
  }),
  component: TapePage,
});

const SRC_LABEL: Record<TapeSource, string> = { new: "今日新词", due: "到期复习", star: "生词本", wrong: "错词本", hard: "顽固词" };

function TapePage() {
  const { index, error } = useWords();
  if (error) return <div className="p-8 text-center text-sm text-ink-3">{error}</div>;
  if (!index) return <Spinner />;
  return <Tape index={index} />;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function Tape({ index }: { index: WordIndex }) {
  const st = useApp();
  const navigate = useNavigate();
  const { src: srcParam } = Route.useSearch();
  const day = today();
  const accent = st.settings.accent;
  const rate = st.settings.rate ?? 1;
  const repeat = st.settings.tapeRepeat ?? 1;

  // 各来源的数量（进入页面时算一次，播放中不随学习记录变化）
  const [counts] = useState(() => {
    const s = getState();
    return Object.fromEntries(TAPE_SOURCES.map((k) => [k, tapeList(index, s, k, day).length])) as Record<TapeSource, number>;
  });
  const preview = useMemo(() => todayNewWords(index, getState(), day).preview, [index, day]);
  const initial: TapeSource = srcParam ?? (TAPE_SOURCES.find((k) => counts[k] > 0) || "new");
  const [src, setSrc] = useState<TapeSource>(initial);
  const list = useMemo(() => tapeList(index, getState(), src, day), [index, src, day]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState<TapeStep | null>(null);
  const [sleepEnd, setSleepEnd] = useState<number | null>(null);
  const [sleepMin, setSleepMin] = useState(0);
  const [tick, setTick] = useState(0);
  const run = useRef(0);

  useWakeLock(true);

  const word: Word | undefined = list.length ? index.map.get(list[wrapIndex(i, list.length)]) : undefined;

  // 播放循环：当前词的步骤串联执行；切词/暂停/改设置时作废旧循环
  useEffect(() => {
    if (!playing || !word) return;
    const my = ++run.current;
    const steps = tapeSteps(word, repeat, rate);
    (async () => {
      for (const s of steps) {
        if (run.current !== my) return;
        setStep(s);
        if (s.kind === "en") await speak(word.w, accent, rate);
        else if (s.kind === "cn") await say(s.text, "zh-CN", rate);
        else await sleep(s.ms);
      }
      if (run.current !== my) return;
      setI((x) => wrapIndex(x + 1, list.length));
    })();
    return () => {
      run.current++;
      stopAudio();
    };
  }, [playing, word, repeat, rate, accent, list.length]);

  // 后台保活 + 锁屏信息
  useEffect(() => {
    if (playing) startKeepAlive();
    else stopKeepAlive();
  }, [playing]);
  useEffect(() => () => disposeKeepAlive(), []);
  useEffect(() => {
    if (word) setTapeMeta(word.w, cnSpeech(word), playing);
  }, [word, playing]);

  const go = useCallback(
    (d: number) => {
      setStep(null);
      setI((x) => wrapIndex(x + d, list.length));
    },
    [list.length],
  );
  const toggle = useCallback(() => {
    if (!list.length) return;
    setPlaying((p) => !p);
  }, [list.length]);

  // 锁屏 / 耳机键
  const handlers = useRef({ play: () => {}, pause: () => {}, prev: () => {}, next: () => {} });
  handlers.current = { play: () => list.length && setPlaying(true), pause: () => setPlaying(false), prev: () => go(-1), next: () => go(1) };
  useEffect(
    () =>
      bindTapeHandlers({
        play: () => handlers.current.play(),
        pause: () => handlers.current.pause(),
        prev: () => handlers.current.prev(),
        next: () => handlers.current.next(),
      }),
    [],
  );

  // 定时停止：按绝对时间判断
  useEffect(() => {
    if (sleepEnd === null) return;
    const t = setInterval(() => {
      setTick((x) => x + 1);
      if (now() >= sleepEnd) {
        setPlaying(false);
        setSleepEnd(null);
        setSleepMin(0);
        toast("定时结束，已停止播放");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [sleepEnd]);
  const left = sleepLeft(sleepEnd, now());
  void tick;

  const chooseSleep = (m: number) => {
    setSleepMin(m);
    setSleepEnd(m ? now() + m * 60000 : null);
    if (m) toast(`${m} 分钟后停止播放`);
  };

  const chooseSrc = (k: TapeSource) => {
    if (k === src) return;
    setSrc(k);
    setI(0);
    setStep(null);
    navigate({ to: "/tape", search: { src: k }, replace: true });
  };

  // 键盘：空格播放/暂停，←/→ 切词
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") navigate({ to: "/" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, go, navigate]);

  const pos = list.length ? wrapIndex(i, list.length) : 0;
  const phase = playing && step ? (step.kind === "gap" ? null : step.kind) : null;
  const pass = step?.pass ?? 1;

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col px-4 pb-safe md:py-6" data-testid="tape" data-playing={playing ? 1 : 0}>
      {/* 顶栏 */}
      <div className="flex shrink-0 items-center gap-2 pt-3 pt-safe">
        <Link to="/" aria-label="退出" className="grid size-10 place-items-center rounded-full text-ink-3 hover:bg-paper-2">
          <X className="size-5" />
        </Link>
        <div className="flex flex-1 items-center justify-center gap-1.5 text-[0.9375rem] font-semibold">
          <Headphones className="size-4 text-ink" /> 磁带模式
        </div>
        <div className="flex min-w-10 justify-end">
          {left !== null && (
            <span className="tnum flex items-center gap-1 rounded-lg bg-mark-soft px-2.5 py-1 text-xs font-semibold text-ink" data-testid="tape-sleep-left">
              <Timer className="size-3.5" />
              {fmtRemain(left)}
            </span>
          )}
        </div>
      </div>

      {/* 播放范围 */}
      <div className="no-scrollbar -mx-4 mt-2 flex shrink-0 gap-2 overflow-x-auto px-4 pb-1" data-testid="tape-sources">
        {TAPE_SOURCES.map((k) => (
          <button
            key={k}
            type="button"
            data-testid={`tape-src-${k}`}
            data-count={counts[k]}
            disabled={counts[k] === 0}
            aria-pressed={src === k}
            onClick={() => chooseSrc(k)}
            className={cn(
              "shrink-0 rounded-lg px-3.5 py-2 text-[0.8125rem] font-semibold transition disabled:opacity-40",
              src === k ? "bg-foreground text-background" : "bg-paper-2 text-ink-3 hover:text-ink",
            )}
          >
            {SRC_LABEL[k]}
            {k === "new" && preview && counts.new > 0 ? "·预习" : ""} <span className="tnum opacity-70">{counts[k]}</span>
          </button>
        ))}
      </div>

      {/* 当前词 */}
      <div className="relative mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-rule bg-paper-3" data-testid="tape-card">
        <div className="paper-grain absolute inset-0 opacity-60" />
        {word ? (
          <div className="relative flex h-full flex-col px-6 py-5">
            <div className="flex items-center justify-between text-xs font-semibold text-ink-3">
              <span className="tnum" data-testid="tape-pos">
                {pos + 1} / {list.length}
              </span>
              <span className="flex items-center gap-1">
                <Repeat className="size-3.5" /> 循环播放
              </span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
              <h2
                className={cn(
                  "font-display break-all font-semibold leading-[1.05] tracking-[-0.035em] transition-colors",
                  word.w.length <= 8 ? "text-[3.25rem]" : word.w.length <= 12 ? "text-[2.625rem]" : "text-[2rem]",
                  phase === "en" && "text-ink",
                )}
                data-testid="tape-word"
              >
                {word.w}
              </h2>
              <Phonetic word={word} accent={accent} className="mt-2 text-base text-ink-3" />
              <ul className={cn("mt-5 w-full max-w-sm space-y-1.5 text-[0.9375rem] leading-relaxed transition-colors", phase === "cn" ? "text-ink" : "text-ink")} data-testid="tape-meaning">
                {word.t.slice(0, 2).map(([p, m], k) => (
                  <li key={k} className="line-clamp-2">
                    {p && <span className="mr-1.5 text-xs font-semibold italic text-ink-3">{posLabel(p)}</span>}
                    {m}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-center gap-2" data-testid="tape-phase" data-phase={phase ?? "idle"}>
              <PhasePill active={phase === "en"} label="英文" />
              <span className="h-px w-5 bg-rule" />
              <PhasePill active={phase === "cn"} label="中文" />
              {repeat > 1 && (
                <span className="tnum ml-2 text-xs font-semibold text-ink-3" data-testid="tape-pass">
                  第 {pass}/{repeat} 遍
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="relative grid h-full place-items-center px-8 text-center" data-testid="tape-empty">
            <div>
              <div className="mx-auto grid size-16 place-items-center rounded-full bg-paper-2 text-ink-3">
                <Headphones className="size-7" />
              </div>
              <p className="mt-4 text-[0.9375rem] font-semibold">{SRC_LABEL[src]}是空的</p>
              <p className="mt-1 text-[0.8125rem] text-ink-3">换一个播放范围试试</p>
            </div>
          </div>
        )}
      </div>

      {/* 进度 */}
      <div className="mt-4 h-1.5 shrink-0 overflow-hidden rounded-full bg-paper-2">
        <div className="h-full rounded-full bg-ink transition-all duration-300" style={{ width: `${list.length ? ((pos + 1) / list.length) * 100 : 0}%` }} />
      </div>

      {/* 播放控制 */}
      <div className="flex shrink-0 items-center justify-center gap-8 py-4">
        <CtlBtn label="上一个" testid="tape-prev" onClick={() => go(-1)} disabled={!list.length}>
          <SkipBack className="size-6 fill-current" />
        </CtlBtn>
        <button
          type="button"
          onClick={toggle}
          disabled={!list.length}
          aria-label={playing ? "暂停" : "播放"}
          data-testid="tape-play"
          className="grid size-[72px] place-items-center rounded-full bg-ink text-paper-3 shadow-primary/30 transition active:scale-95 disabled:opacity-40"
        >
          {playing ? <Pause className="size-8 fill-current" /> : <Play className="ml-1 size-8 fill-current" />}
        </button>
        <CtlBtn label="下一个" testid="tape-next" onClick={() => go(1)} disabled={!list.length}>
          <SkipForward className="size-6 fill-current" />
        </CtlBtn>
      </div>

      {/* 设置 */}
      <div className="mb-3 shrink-0 space-y-2 rounded-2xl bg-paper-2 p-3" data-testid="tape-settings">
        <SetRow label="语速">
          <Segmented<number>
            className="w-full max-w-64 bg-paper-3"
            value={rate}
            onChange={(v) => setSettings({ rate: v })}
            testid="tape-rate"
            options={RATE_OPTIONS.map((v) => ({ value: v, label: `${v}×` }))}
          />
        </SetRow>
        <SetRow label="每词">
          <Segmented<number>
            className="w-full max-w-64 bg-paper-3"
            value={repeat}
            onChange={(v) => setSettings({ tapeRepeat: v })}
            testid="tape-repeat"
            options={REPEAT_OPTIONS.map((v) => ({ value: v, label: `${v} 遍` }))}
          />
        </SetRow>
        <SetRow label="定时">
          <Segmented<number>
            className="w-full max-w-64 bg-paper-3"
            value={sleepMin}
            onChange={chooseSleep}
            testid="tape-sleep"
            options={SLEEP_OPTIONS.map((v) => ({ value: v, label: v ? `${v} 分` : "关" }))}
          />
        </SetRow>
      </div>
    </div>
  );
}

function PhasePill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors", active ? "bg-ink text-paper-3" : "bg-paper-2 text-ink-3")}>
      {label}
    </span>
  );
}

function CtlBtn({ children, label, onClick, testid, disabled }: { children: React.ReactNode; label: string; onClick: () => void; testid: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      data-testid={testid}
      disabled={disabled}
      className="grid size-14 place-items-center rounded-full text-ink transition hover:bg-paper-2 active:scale-90 disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function SetRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pl-1.5">
      <span className="shrink-0 text-[0.8125rem] font-semibold text-ink-3">{label}</span>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </div>
  );
}
