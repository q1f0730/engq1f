import { useMemo } from "react";
import { today } from "./clock";
import type { WordIndex } from "./data";
import { wordOfDay } from "./plan";
import type { ShareInfo } from "./share";
import { emptyLog, streak } from "./srs";
import { useApp } from "./store";

export function useShareInfo(index: WordIndex | null): ShareInfo | null {
  const st = useApp();
  return useMemo(() => {
    if (!index) return null;
    const day = today();
    const log = st.log[day] ?? emptyLog();
    return {
      day,
      streak: streak(st.checkins, day),
      totalDays: st.checkins.length,
      learned: log.n,
      reviewed: log.r,
      totalWords: Object.keys(st.cards).length,
      word: wordOfDay(index, day),
    };
  }, [index, st]);
}
