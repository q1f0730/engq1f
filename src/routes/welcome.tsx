import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Gauge, Layers, ShieldCheck, WifiOff, Zap } from "lucide-react";
import { useState } from "react";
import { Logo, Spinner } from "@/components/app/shell";
import { today } from "@/lib/clock";
import { useWords } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { bookSize } from "@/lib/plan";
import { finishDate } from "@/lib/srs";
import { DAILY_OPTIONS, completeOnboarding, getState, type Book, type Order } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/welcome")({ component: Welcome });

function Welcome() {
  const { index } = useWords();
  const navigate = useNavigate();
  const init = getState().settings;
  const [step, setStep] = useState(0);
  const [book, setBook] = useState<Book>(init.book);
  const [order, setOrder] = useState<Order>(init.order);
  const [daily, setDaily] = useState(init.daily);

  if (!index) return <Spinner />;
  const size = bookSize(index, book);
  const days = Math.ceil(size / daily);
  const finish = finishDate(today(), size, daily);

  const finishSetup = (to: "/" | "/test") => {
    completeOnboarding({ book, order, daily });
    navigate({ to, replace: true });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-safe pt-safe" data-testid="welcome" data-step={step}>
      <div className="flex h-14 items-center justify-between">
        {step > 0 ? (
          <button type="button" onClick={() => setStep(step - 1)} className="grid size-10 place-items-center rounded-full hover:bg-secondary" aria-label="上一步">
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((k) => (
            <span key={k} className={cn("h-1.5 rounded-full transition-all", k === step ? "w-6 bg-primary" : "w-1.5 bg-border")} />
          ))}
        </div>
        <span className="w-10" />
      </div>

      {step === 0 && (
        <div className="card-in flex flex-1 flex-col">
          <div className="flex flex-1 flex-col justify-center">
            <Logo className="size-20 drop-shadow-xl" />
            <h1 className="mt-8 font-display text-[40px] font-extrabold leading-[1.1] tracking-tight">
              四级单词，
              <br />
              <span className="text-primary">每天十分钟</span>拿下。
            </h1>
            <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
              {index.list.length} 个四级词汇，分组学习 + 智能复习。记不住的词会反复出现，记住的词会越隔越久。
            </p>
            <div className="mt-8 grid grid-cols-2 gap-2.5">
              <Feature icon={<ShieldCheck className="size-4" />} label="不用注册" />
              <Feature icon={<WifiOff className="size-4" />} label="离线可用" />
              <Feature icon={<Zap className="size-4" />} label="秒开无广告" />
              <Feature icon={<Layers className="size-4" />} label="墨墨式复习算法" />
            </div>
          </div>
          <Primary onClick={() => setStep(1)} testid="welcome-next">
            开始制定计划 <ArrowRight className="size-5" />
          </Primary>
        </div>
      )}

      {step === 1 && (
        <div className="card-in flex flex-1 flex-col">
          <h1 className="mt-4 font-display text-[30px] font-extrabold tracking-tight">选择词书</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">之后可以在「我的」里随时修改。</p>
          <div className="mt-6 space-y-3">
            <Choice active={book === "all"} onClick={() => setBook("all")} title="四级全部词汇" sub={`${index.list.length} 词 · 覆盖大纲全部词汇`} testid="book-all" />
            <Choice active={book === "core"} onClick={() => setBook("core")} title="四级核心词汇" sub={`${index.coreCount} 词 · 高频必考，时间紧先背这个`} testid="book-core" />
          </div>
          <div className="mb-2 mt-7 text-[12px] font-bold tracking-wider text-muted-foreground">学习顺序</div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["core", "核心优先"],
                ["alpha", "字母顺序"],
                ["random", "乱序"],
              ] as [Order, string][]
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setOrder(v)}
                data-testid={`order-${v}`}
                className={cn(
                  "rounded-2xl border py-3 text-[14px] font-semibold transition",
                  order === v ? "border-primary bg-brand-soft text-primary" : "border-border bg-card text-muted-foreground",
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <Primary onClick={() => setStep(2)} testid="welcome-next">
            下一步 <ArrowRight className="size-5" />
          </Primary>
        </div>
      )}

      {step === 2 && (
        <div className="card-in flex flex-1 flex-col">
          <h1 className="mt-4 font-display text-[30px] font-extrabold tracking-tight">每天学多少新词？</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">复习量会随新词增加，建议从 20 开始。</p>
          <div className="mt-6 grid grid-cols-3 gap-2.5" data-testid="daily-pick">
            {DAILY_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDaily(n)}
                data-testid={`daily-${n}`}
                className={cn(
                  "relative rounded-3xl border py-5 transition",
                  daily === n ? "border-primary bg-brand-soft" : "border-border bg-card",
                )}
              >
                <div className={cn("tnum font-display text-[30px] font-extrabold leading-none", daily === n ? "text-primary" : "")}>{n}</div>
                <div className="mt-1.5 text-[12px] text-muted-foreground">{Math.ceil(size / n)} 天</div>
                {n === 20 && <span className="absolute -top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">推荐</span>}
              </button>
            ))}
          </div>
          <div className="mt-6 rounded-3xl bg-secondary/80 p-5" data-testid="plan-preview">
            <div className="text-[13px] text-muted-foreground">按这个节奏</div>
            <div className="mt-1 text-[20px] font-extrabold">
              {days} 天，<span className="text-primary">{fmtDate(finish, true)}</span> 学完
            </div>
            <div className="mt-1 text-[13px] text-muted-foreground">
              每天约 {daily} 个新词 + {Math.round(daily * 2.5)} 个左右复习，约 {Math.max(5, Math.round((daily * 3.5 * 8) / 60))} 分钟
            </div>
          </div>
          <div className="flex-1" />
          <Primary onClick={() => finishSetup("/")} testid="welcome-done">
            <Check className="size-5" /> 开始背单词
          </Primary>
          <button
            type="button"
            onClick={() => finishSetup("/test")}
            data-testid="welcome-test"
            className="mb-4 flex h-12 items-center justify-center gap-2 text-[14px] font-semibold text-muted-foreground"
          >
            <Gauge className="size-4" /> 先测一下词汇量（3 分钟）
          </button>
        </div>
      )}
      <p className="pb-3 text-center text-[11px] text-muted-foreground/70">
        by Q1f730 · 词表 KyleBing/english-vocabulary · 音标 qwerty-learner
      </p>
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-card px-3.5 py-3 text-[14px] font-semibold shadow-sm ring-1 ring-border/70">
      <span className="text-primary">{icon}</span>
      {label}
    </div>
  );
}

function Primary({ children, onClick, testid }: { children: React.ReactNode; onClick: () => void; testid?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className="my-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[17px] font-bold text-primary-foreground shadow-xl shadow-primary/25 transition active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function Choice({ active, onClick, title, sub, testid }: { active: boolean; onClick: () => void; title: string; sub: string; testid?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={cn(
        "flex w-full items-center gap-4 rounded-3xl border p-5 text-left transition",
        active ? "border-primary bg-brand-soft" : "border-border bg-card",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[17px] font-bold">{title}</div>
        <div className="mt-0.5 text-[13px] text-muted-foreground">{sub}</div>
      </div>
      <span className={cn("grid size-6 place-items-center rounded-full border-2", active ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
        {active && <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}
