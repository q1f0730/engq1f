/** 13.0 · 每日新词难度档位（常量单独一个小模块：store 要用，构词 / 难度算法不进首屏） */
export type Level = "easy" | "mid" | "hard" | "mix";
export const LEVELS: Level[] = ["easy", "mid", "hard", "mix"];
export const LEVEL_CN: Record<Level, string> = { easy: "轻松", mid: "适中", hard: "挑战", mix: "混合" };
export const LEVEL_HINT: Record<Level, string> = {
  easy: "短词、常见词、能拆开的词",
  mid: "中等长度和词频",
  hard: "长词、少见词、拼写不规则",
  mix: "不挑，按乱序来",
};

