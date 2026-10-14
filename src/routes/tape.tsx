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
        <Link to="/" aria-label="退出" className="press -ml-2 grid size-11 place-items-center rounded-lg text-ink-2 hover:bg-paper-2 hover:text-ink">
          <X className="size-[22px]" />
        </Link>
        <div className="flex flex-1 items-center justify-center gap-1.5 text-[0.9375rem] font-semibold">
          <Headphones className="size-4" /> 磁带模式
        </div>
        <div className="flex min-w-10 justify-end">
          {left !== null && (
            <span className="tnum flex items-center gap-1 font-serif text-[1.125rem] leading-none" data-testid="tape-sleep-left">
              <Timer className="size-3.5" />
              <span className="hl">{fmtRemain(left)}</span>
            </span>
          )}
        </div>
      </div>

      {/* 播放范围：一排字，选中的划荧光笔 */}
      <div className="no-scrollbar -mx-4 mt-1 flex shrink-0 gap-5 overflow-x-auto border-b border-rule px-4" data-testid="tape-sources">
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
              "press relative -mb-px h-11 shrink-0 whitespace-nowrap border-b-2 text-[0.875rem] disabled:opacity-35",
              src === k ? "border-ink font-semibold text-ink" : "border-transparent text-ink-3 hover:text-ink",
            )}
          >
            <span className={cn(src === k && "hl")}>
              {SRC_LABEL[k]}
              {k === "new" && preview && counts.new > 0 ? "·预习" : ""}
            </span>{" "}
            <span className="tnum font-serif text-[1rem] font-normal">{counts[k]}</span>
          </button>
        ))}
      </div>

      {/* 12.0 · 当前词：像磁带盒里的曲目单——词头大字，读音一行，释义按词典排，英文 / 中文哪个正在念就划荧光笔 */}
      <div className="relative flex min-h-0 flex-1 flex-col pt-4" data-testid="tape-card">
        {word ? (
          <article className="flex h-full flex-col">
            <div className="flex min-h-0 flex-1 flex-col justify-center">
              <h2
                className={cn(
                  "word-head break-all leading-[1] transition-opacity duration-300",
                  word.w.length <= 8 ? "text-[3.5rem]" : word.w.length <= 12 ? "text-[2.75rem]" : "text-[2.125rem]",
                  phase === "cn" && "opacity-55",
                )}
                data-testid="tape-word"
              >
                <span className={cn(phase === "en" && "hl")}>{word.w}</span>
              </h2>
              <Phonetic word={word} accent={accent} className="mt-2.5 text-base text-ink-2" />
              <dl className={cn("mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[1rem] leading-relaxed transition-opacity duration-300", phase === "en" && "opacity-55")} data-testid="tape-meaning">
                {word.t.slice(0, 2).map(([p, m], k) => (
                  <div key={k} className="contents">
                    <dt className="pos text-[1.0625rem] text-ink-3">{p ? posLabel(p) : ""}</dt>
                    <dd className={cn("line-clamp-2", phase === "cn" && "hl")}>{m}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <footer className="flex items-center gap-3 py-2 text-[0.75rem] text-ink-3" data-testid="tape-phase" data-phase={phase ?? "idle"}>
              <span className="tnum font-medium text-ink-2" data-testid="tape-pos">
                {pos + 1} / {list.length}
              </span>
              <span className="flex items-center gap-1.5">
                <PhasePill active={phase === "en"} label="英" />
                <span aria-hidden>→</span>
                <PhasePill active={phase === "cn"} label="中" />
              </span>
              {repeat > 1 && (
                <span className="tnum" data-testid="tape-pass">
                  第 {pass}/{repeat} 遍
                </span>
              )}
              <span className="ml-auto flex items-center gap-1">
                <Repeat className="size-3.5" /> 循环
              </span>
            </footer>
          </article>
        ) : (
          <div className="flex h-full flex-col justify-center px-2" data-testid="tape-empty">
            <p className="border-l-2 border-rule-strong pl-4 text-[1.125rem] font-semibold">{SRC_LABEL[src]}是空的</p>
            <p className="mt-1 pl-[1.125rem] text-[0.8125rem] text-ink-3">换一个播放范围试试</p>
          </div>
        )}
      </div>

      {/* 走带区：一条磁带刻度（每个词一格，太多就只画线）+ 三个控制键 */}
      <section aria-label="播放控制" className="shrink-0 border-t border-rule pt-3">
        <div className="relative h-3" aria-hidden>
          <div className="absolute inset-x-0 top-1/2 h-px bg-rule-strong" />
          <div className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 bg-ink transition-all duration-300" style={{ width: `${list.length ? ((pos + 1) / list.length) * 100 : 0}%` }} />
          {list.length > 0 && list.length <= 40 && (
            <div className="absolute inset-0 flex justify-between">
              {list.map((_, k) => (
                <span key={k} className={cn("h-full w-px", k <= pos ? "bg-ink" : "bg-rule-strong")} />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-center gap-10 py-4">
          <CtlBtn label="上一个" testid="tape-prev" onClick={() => go(-1)} disabled={!list.length}>
            <SkipBack className="size-6 fill-current" />
          </CtlBtn>
          <button
            type="button"
            onClick={toggle}
            disabled={!list.length}
            aria-label={playing ? "暂停" : "播放"}
            data-testid="tape-play"
            className={cn("press grid size-[72px] place-items-center rounded-full disabled:opacity-40", playing ? "bg-mark text-mark-ink ring-[1.5px] ring-ink" : "bg-ink text-paper-3")}
          >
            {playing ? <Pause className="size-8 fill-current" /> : <Play className="ml-1 size-8 fill-current" />}
          </button>
          <CtlBtn label="下一个" testid="tape-next" onClick={() => go(1)} disabled={!list.length}>
            <SkipForward className="size-6 fill-current" />
          </CtlBtn>
        </div>
      </section>

      {/* 设置：一张三行的小表，名字在左、刻度在右 */}
      <dl className="mb-3 shrink-0 divide-y divide-rule border-y border-rule" data-testid="tape-settings">
        <SetRow label="语速">
          <Segmented<number> className="w-full max-w-64" value={rate} onChange={(v) => setSettings({ rate: v })} testid="tape-rate" options={RATE_OPTIONS.map((v) => ({ value: v, label: `${v}×` }))} />
        </SetRow>
        <SetRow label="每词">
          <Segmented<number> className="w-full max-w-64" value={repeat} onChange={(v) => setSettings({ tapeRepeat: v })} testid="tape-repeat" options={REPEAT_OPTIONS.map((v) => ({ value: v, label: `${v} 遍` }))} />
        </SetRow>
        <SetRow label="定时">
          <Segmented<number> className="w-full max-w-64" value={sleepMin} onChange={chooseSleep} testid="tape-sleep" options={SLEEP_OPTIONS.map((v) => ({ value: v, label: v ? `${v} 分` : "关" }))} />
        </SetRow>
      </dl>
    </div>
  );
}

function PhasePill({ active, label }: { active: boolean; label: string }) {
  return <span className={cn("font-medium transition-colors", active ? "hl font-semibold text-ink" : "text-ink-3")}>{label}</span>;
}

function CtlBtn({ children, label, onClick, testid, disabled }: { children: React.ReactNode; label: string; onClick: () => void; testid: string; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} data-testid={testid} disabled={disabled} className="press grid size-14 place-items-center rounded-full text-ink ring-1 ring-inset ring-rule hover:bg-paper-2 disabled:opacity-35">
      {children}
    </button>
  );
}

function SetRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3 py-1.5">
      <dt className="w-10 shrink-0 text-[0.8125rem] text-ink-2">{label}</dt>
      <dd className="flex min-w-0 flex-1 justify-end">{children}</dd>
    </div>
  );
}
