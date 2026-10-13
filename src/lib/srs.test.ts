import { describe, expect, it } from "vitest";
import {
  MASTER_DAYS,
  addDays,
  answer,
  canCheckIn,
  createSession,
  current,
  diffDays,
  dueWords,
  finishDate,
  forecast,
  isDue,
  isFinished,
  kill,
  killCurrent,
  longestStreak,
  masteryCounts,
  masteryOf,
  pickMode,
  schedule,
  sessionAccuracy,
  shuffle,
  streak,
  undo,
  unkill,
  type Card,
  type SessionItem,
} from "./srs";

const T = "2026-10-13";

describe("dates", () => {
  it("adds and diffs days across month/year", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-10-13", "2026-11-13")).toBe(31);
  });
});

describe("schedule: 认识 / 模糊 / 不认识", () => {
  it("new + 认识 → review in 2 days", () => {
    const c = schedule(undefined, "know", T);
    expect(c).toMatchObject({ st: "review", i: 2, d: "2026-10-15", r: 1, l: 0, e: 2.5, f: T });
  });
  it("new + 模糊 → learning, due today, ease down", () => {
    const c = schedule(undefined, "vague", T);
    expect(c).toMatchObject({ st: "learning", i: 0, d: T, l: 0, e: 2.35 });
  });
  it("new + 不认识 → learning, due today, one lapse", () => {
    const c = schedule(undefined, "forget", T);
    expect(c).toMatchObject({ st: "learning", i: 0, d: T, l: 1, e: 2.3 });
  });
  it("learning + 认识 → 1 day", () => {
    const c = schedule(schedule(undefined, "forget", T), "know", T);
    expect(c).toMatchObject({ st: "review", i: 1, d: addDays(T, 1) });
  });
  it("review + 认识 multiplies interval by ease", () => {
    const c0: Card = { st: "review", e: 2.5, i: 4, r: 2, l: 0, d: T, f: "2026-10-01", t: "2026-10-09" };
    const c = schedule(c0, "know", T);
    expect(c.i).toBe(10);
    expect(c.d).toBe(addDays(T, 10));
    expect(c.r).toBe(3);
  });
  it("review + 认识 always grows at least by one day, even at min ease", () => {
    const c0: Card = { st: "review", e: 1.3, i: 1, r: 1, l: 3, d: T, f: T, t: T };
    expect(schedule(c0, "know", T).i).toBe(2);
  });
  it("review + 模糊 → interval × 1.2, ease − 0.15", () => {
    const c0: Card = { st: "review", e: 2.5, i: 10, r: 3, l: 0, d: T, f: T, t: T };
    const c = schedule(c0, "vague", T);
    expect(c).toMatchObject({ i: 12, e: 2.35, st: "review", l: 0 });
  });
  it("review + 不认识 → reset to today, lapse +1", () => {
    const c0: Card = { st: "review", e: 2.5, i: 10, r: 3, l: 1, d: T, f: T, t: T };
    const c = schedule(c0, "forget", T);
    expect(c).toMatchObject({ i: 0, d: T, l: 2, st: "learning", e: 2.3 });
  });
  it("ease never drops below 1.3", () => {
    let c: Card | undefined;
    for (let k = 0; k < 20; k++) c = schedule(c, "forget", T);
    expect(c!.e).toBe(1.3);
    expect(c!.l).toBe(20);
  });
  it("repeat answers do not compound the interval or the lapses", () => {
    const c0: Card = { st: "review", e: 2.5, i: 10, r: 3, l: 0, d: T, f: T, t: T };
    const vague = schedule(c0, "vague", T); // i=12
    const relearned = schedule(vague, "know", T, { repeat: true });
    expect(relearned.i).toBe(12);
    const f = schedule(undefined, "forget", T);
    const f2 = schedule(f, "forget", T, { repeat: true });
    expect(f2.l).toBe(1);
    expect(schedule(f2, "know", T, { repeat: true })).toMatchObject({ i: 1, st: "review" });
  });
});

describe("mastery", () => {
  it("interval ≥ 21 days counts as mastered", () => {
    let c = schedule(undefined, "know", T); // 2
    let day = T;
    const seen: number[] = [c.i];
    while (c.i < MASTER_DAYS) {
      day = c.d;
      c = schedule(c, "know", day);
      seen.push(c.i);
    }
    expect(seen).toEqual([2, 5, 13, 33]);
    expect(c.st).toBe("mastered");
    expect(masteryOf(c)).toBe("mastered");
    expect(isDue(c, addDays(day, 33))).toBe(true); // mastered words still get long reviews
  });
  it("斩 marks a word mastered forever and hides it from reviews", () => {
    const k = kill(undefined, T);
    expect(k).toMatchObject({ st: "mastered", k: 1 });
    expect(isDue(k, "2099-01-01")).toBe(false);
    expect(schedule(k, "know", T).k).toBe(1);
    const forgot = schedule(k, "forget", T);
    expect(forgot.k).toBeUndefined();
    expect(forgot).toMatchObject({ st: "learning", d: T, l: 1 });
  });
  it("unkill puts the word back into review tomorrow", () => {
    const u = unkill(kill(undefined, T), T);
    expect(u.k).toBeUndefined();
    expect(u.d).toBe(addDays(T, 1));
    expect(u.st).toBe("review");
  });
  it("counts the mastery distribution", () => {
    const cards: Record<string, Card> = {
      a: schedule(undefined, "know", T),
      b: kill(undefined, T),
      c: schedule(undefined, "forget", T),
    };
    expect(masteryCounts(cards, 10)).toEqual({ new: 7, learning: 2, mastered: 1 });
    expect(masteryOf(undefined)).toBe("new");
  });
});

describe("due computation", () => {
  const cards: Record<string, Card> = {
    late: { st: "review", e: 2.5, i: 5, r: 1, l: 0, d: "2026-10-10", f: T, t: T },
    today: { st: "review", e: 2.5, i: 2, r: 1, l: 0, d: T, f: T, t: T },
    today0: { st: "learning", e: 2.5, i: 0, r: 0, l: 1, d: T, f: T, t: T },
    tomorrow: { st: "review", e: 2.5, i: 1, r: 1, l: 0, d: addDays(T, 1), f: T, t: T },
    week: { st: "review", e: 2.5, i: 6, r: 1, l: 0, d: addDays(T, 6), f: T, t: T },
    far: { st: "mastered", e: 2.5, i: 30, r: 4, l: 0, d: addDays(T, 30), f: T, t: T },
    killed: kill(undefined, T),
  };
  it("lists overdue first, then shortest interval", () => {
    expect(dueWords(cards, T)).toEqual(["late", "today0", "today"]);
    expect(dueWords(cards, addDays(T, 1))).toContain("tomorrow");
  });
  it("forecasts the next 7 days (overdue lands on day 0, killed never)", () => {
    const f = forecast(cards, T, 7);
    expect(f.map((x) => x.count)).toEqual([3, 1, 0, 0, 0, 0, 1]);
    expect(f[0].day).toBe(T);
    expect(f[6].day).toBe(addDays(T, 6));
  });
});

describe("session: group of 10 with relearning", () => {
  const items = (n: number): SessionItem[] =>
    Array.from({ length: n }, (_, k) => ({ w: `w${k}`, kind: "new" as const, mode: "recall" as const }));

  function run(s: ReturnType<typeof createSession>, cards: Record<string, Card>, ratings: Record<string, ("know" | "vague" | "forget")[]>) {
    let log;
    let steps = 0;
    while (!isFinished(s) && steps < 100) {
      const it = current(s)!;
      const r = ratings[it.w]?.shift() ?? "know";
      const res = answer(s, cards[it.w], r, T, log);
      cards[it.w] = res.card;
      log = res.log;
      s = res.session;
      steps++;
    }
    return { s, log: log!, steps };
  }

  it("re-queues 模糊/不认识 until one clean 认识", () => {
    const cards: Record<string, Card> = {};
    const { s, log, steps } = run(createSession(items(10)), cards, {
      w0: ["forget", "vague", "know"],
      w1: ["vague", "know"],
    });
    expect(isFinished(s)).toBe(true);
    expect(steps).toBe(13);
    expect(s.done).toHaveLength(10);
    expect(log).toMatchObject({ n: 10, a: 10, ok: 8 });
    expect(cards.w0).toMatchObject({ l: 1, i: 1, st: "review" });
    expect(cards.w1).toMatchObject({ l: 0, i: 1 });
    expect(cards.w2).toMatchObject({ i: 2 });
    expect(sessionAccuracy(s)).toBeCloseTo(0.8);
  });

  it("puts a failed word back RELEARN_GAP (3) items later as a recall card", () => {
    const s0 = createSession(items(10));
    const { session } = answer(s0, undefined, "forget", T, undefined);
    expect(session.queue.map((q) => q.w).slice(0, 5)).toEqual(["w1", "w2", "w3", "w0", "w4"]);
    expect(session.queue[3]).toMatchObject({ repeat: true, mode: "recall" });
  });

  it("keeps the last word at the head when nothing else is left", () => {
    const s0 = createSession(items(1));
    const { session } = answer(s0, undefined, "vague", T, undefined);
    expect(current(session)?.w).toBe("w0");
    expect(isFinished(session)).toBe(false);
  });

  it("undo restores queue, card and log", () => {
    const s0 = createSession(items(3));
    const a = answer(s0, undefined, "know", T, undefined);
    const b = answer(a.session, undefined, "forget", T, a.log);
    expect(b.log.n).toBe(2);
    const u = undo(b.session)!;
    expect(u.w).toBe("w1");
    expect(u.card).toBeUndefined();
    expect(u.log).toEqual(a.log);
    expect(current(u.session)?.w).toBe("w1");
    expect(u.session.done).toEqual(["w0"]);
    expect(u.session.firsts).toEqual({ w0: "know" });
    const u2 = undo(u.session)!;
    expect(u2.w).toBe("w0");
    expect(u2.log).toBeUndefined();
    expect(undo(u2.session)).toBeNull();
  });

  it("斩 finishes the word and drops its pending relearn", () => {
    const s0 = createSession(items(5));
    const a = answer(s0, undefined, "forget", T, undefined);
    // advance to the repeat of w0
    let s = a.session;
    for (let k = 0; k < 3; k++) s = answer(s, undefined, "know", T, undefined).session;
    expect(current(s)).toMatchObject({ w: "w0", repeat: true });
    const k = killCurrent(s, a.card, T, a.log);
    expect(k.card.k).toBe(1);
    expect(k.session.queue.some((q) => q.w === "w0")).toBe(false);
    expect(k.log.n).toBe(1); // already counted once
  });

  it("review sessions log reviews, not new words", () => {
    const s0 = createSession([{ w: "x", kind: "review", mode: "en2cn" }]);
    const prev: Card = { st: "review", e: 2.5, i: 2, r: 1, l: 0, d: T, f: T, t: T };
    const r = answer(s0, prev, "know", T, undefined);
    expect(r.log).toMatchObject({ n: 0, r: 1, ok: 1 });
    expect(r.card.i).toBe(5);
  });
});

describe("check-in and streak", () => {
  it("counts consecutive days ending today or yesterday", () => {
    const c = ["2026-10-10", "2026-10-11", "2026-10-12"];
    expect(streak(c, T)).toBe(3);
    expect(streak([...c, T], T)).toBe(4);
    expect(streak(["2026-10-01"], T)).toBe(0);
    expect(longestStreak(["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"])).toBe(3);
  });
  it("allows check-in only when new words are done and reviews cleared", () => {
    expect(canCheckIn({ learnedToday: 20, goal: 20, newLeft: 100, due: 0 })).toBe(true);
    expect(canCheckIn({ learnedToday: 19, goal: 20, newLeft: 100, due: 0 })).toBe(false);
    expect(canCheckIn({ learnedToday: 20, goal: 20, newLeft: 100, due: 1 })).toBe(false);
    expect(canCheckIn({ learnedToday: 3, goal: 20, newLeft: 0, due: 0 })).toBe(true);
  });
  it("estimates the finish date", () => {
    expect(finishDate(T, 100, 20)).toBe(addDays(T, 4));
    expect(finishDate(T, 0, 20)).toBe(T);
  });
});

describe("helpers", () => {
  it("shuffle is deterministic per seed", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(a, 42)).toEqual(shuffle(a, 42));
    expect(shuffle(a, 42).sort()).toEqual(a);
  });
  it("pickMode spreads modes and respects cn-first", () => {
    const modes = new Set(Array.from({ length: 50 }, (_, k) => pickMode(`w${k}`, T)));
    expect(modes.size).toBe(4);
    const cn = new Set(Array.from({ length: 50 }, (_, k) => pickMode(`w${k}`, T, true)));
    expect(cn.has("recall")).toBe(false);
  });
});
