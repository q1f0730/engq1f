/**
 * 13.0 · 云同步的合并规则（纯函数，单元测试覆盖）
 *
 *  - 学习卡片：每个词一行，按「这个词最后一次作答的时间」ts（毫秒）比较，更晚的赢；
 *    ts 一样但内容不一样 → 作答次数多的赢 → 还一样留本机。服务端 vocab_push_cards 也按 ts 把关。
 *  - 乱序种子：云端已经有就用云端的（换设备新词顺序不变）；云端没有就上传本机的。
 *  - 其余记录（打卡日、生词本、词单、补卡、成就、复习日志尾部…）：沿用 v11「合并导入」的 mergeStates，取并集 / 较大值，
 *    重复合并结果不变，所以第一次登录把本机进度并进云端不会丢任何一边的数据。
 *  - 删除（重置单词 / 批量重置 / 撤销第一次作答 / 清空）：墓碑。本机 state.tomb 记「哪个词在什么时刻被删」，
 *    上传成一行 card = null、ts = 删除时刻；和卡片一样按 ts 比较，更晚的赢，ts 一样时删除赢。
 *    所以删掉 / 重置的词不会被云端更早的那份拉回来；删掉以后又学了，新卡片的 ts 更晚，照常同步。
 *  - 设置（主题、字号、每日新词…）留在各自设备上，不同步。
 */
import type { Card } from "./srs";
import { cleanTomb, normalize, type AppState } from "./store";
import { mergeStates } from "./sync";
import type { RevEntry } from "./stats";

export interface CardRow {
  word: string;
  /** null = 墓碑：这个词在 ts 时刻被删掉 / 重置了 */
  card: Card | null;
  /** 最后一次作答时间（epoch 毫秒） */
  ts: number;
}

export interface CloudSnapshot {
  /** 云端的乱序种子；null = 这个账号还没同步过 */
  seed: number | null;
  meta: Partial<AppState> | null;
  cards: CardRow[];
}

/** 复习日志只同步最近这么多条（统计页够用，profile 一行不会太大） */
export const META_REV_MAX = 2000;

const dayMs = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return y && m && dd ? new Date(y, m - 1, dd, 12).getTime() : 0;
};

/** 每个词最后一次作答（复习日志里是 epoch 秒） */
export function lastAnswered(revlog: RevEntry[] | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of revlog ?? []) if ((m.get(e[0]) ?? -1) < e[1]) m.set(e[0], e[1]);
  return m;
}

/** 卡片的时间戳：日志里最后作答的时刻；日志里没有就按「最近复习日」那天中午算 */
export function cardTs(card: Card, lastSec?: number): number {
  return Math.max(lastSec ? lastSec * 1000 : 0, card.t ? dayMs(card.t) : 0);
}

/**
 * 本机的行：每张卡片一行（ts = 最后作答；撤销 / 回滚放回来的卡片按放回的时刻算），每条墓碑（没有卡片的词）一行 card = null。
 * 卡片和墓碑都在（墓碑比卡片新，只会出现在旧数据里）→ 取更晚的那个。
 */
export function localRows(st: Pick<AppState, "cards" | "revlog" | "tomb">): CardRow[] {
  const last = lastAnswered(st.revlog);
  const tomb = st.tomb ?? {};
  const rows: CardRow[] = [];
  for (const [word, card] of Object.entries(st.cards)) {
    const t = tomb[word] ?? 0;
    const ts = Math.max(cardTs(card, last.get(word)), t < 0 ? -t : 0);
    rows.push(t > ts ? { word, card: null, ts: t } : { word, card, ts });
  }
  for (const [word, t] of Object.entries(tomb)) if (t > 0 && !st.cards[word]) rows.push({ word, card: null, ts: t });
  return rows;
}

const same = (a: Card | null, b: Card | null) => JSON.stringify(a) === JSON.stringify(b);

/** 两边都有这个词时选哪边 */
export function pickRow(local: CardRow | undefined, remote: CardRow | undefined): "local" | "remote" {
  if (!remote) return "local";
  if (!local) return "remote";
  if (local.ts !== remote.ts) return local.ts > remote.ts ? "local" : "remote";
  if (same(local.card, remote.card)) return "remote";
  // 同一时刻一边删、一边有卡片：删除赢（删除是用户明确做的操作）
  if (!local.card || !remote.card) return local.card ? "remote" : "local";
  const n = (c: Card) => c.r + c.l;
  if (n(local.card) !== n(remote.card)) return n(local.card) > n(remote.card) ? "local" : "remote";
  return "local";
}

/** 要放进 profile.meta 的部分：除了卡片、设置、种子以外的记录 */
export function metaOf(st: AppState): Partial<AppState> {
  const { cards: _c, settings: _s, seed: _seed, epoch: _e, tomb: _t, ...rest } = st;
  void _t;
  void _c;
  void _s;
  void _seed;
  void _e;
  return { ...rest, revlog: (st.revlog ?? []).slice(-META_REV_MAX) };
}

export interface CloudMerge {
  state: AppState;
  /** 要上传的卡片（本机赢、或者云端没有的） */
  push: CardRow[];
  /** 从云端拿来的词数（新增 + 覆盖） */
  pulled: number;
  /** 云端的墓碑删掉了本机多少张卡片（已经算在 pulled 里） */
  deleted: number;
  /** 两边都改过、按时间戳裁决的词数 */
  conflicts: number;
  /** profile 要不要写（种子 / 其余记录有变化） */
  profileDirty: boolean;
}

export function mergeCloud(local: AppState, snap: CloudSnapshot): CloudMerge {
  const mine = new Map(localRows(local).map((r) => [r.word, r]));
  const theirs = new Map(snap.cards.map((r) => [r.word, r]));
  const cards: Record<string, Card> = {};
  const tomb: Record<string, number> = {};
  for (const [w, t] of Object.entries(local.tomb ?? {})) if (t < 0 && local.cards[w]) tomb[w] = t; // 「复活」标记跟着本机卡片留着
  const push: CardRow[] = [];
  let pulled = 0;
  let deleted = 0;
  let conflicts = 0;
  for (const w of new Set([...mine.keys(), ...theirs.keys()])) {
    const l = mine.get(w);
    const r = theirs.get(w);
    const side = pickRow(l, r);
    if (l && r && !same(l.card, r.card)) conflicts++;
    const win = side === "remote" ? r! : l!;
    if (win.card) cards[w] = win.card;
    else tomb[w] = win.ts;
    if (win.card && side === "remote") delete tomb[w]; // 云端的卡片更新：本机不再留这个词的墓碑 / 复活标记
    if (side === "remote") {
      if (!l || !same(l.card, r!.card)) {
        if (l?.card || r!.card) pulled++;
        if (l?.card && !r!.card) deleted++;
      }
    } else if (!r || !same(l!.card, r.card) || r.ts !== l!.ts) push.push(l!);
  }
  let state: AppState = { ...local, cards, tomb: cleanTomb(tomb) };
  let profileDirty = true;
  if (snap.meta) {
    // 其余记录：v11 合并导入的规则（并集 / 较大值，幂等）。卡片已经按时间戳合好了，两边都不带卡片进去。
    const remote = normalize({ ...snap.meta, cards: {}, settings: local.settings, seed: local.seed, v: 1 });
    state = { ...mergeStates({ ...state, cards: {} }, remote).state, cards, tomb: state.tomb };
    profileDirty = snap.seed === null || metaSig(state) !== metaSig(remote);
  }
  if (snap.seed !== null && snap.seed !== local.seed) state = { ...state, seed: snap.seed };
  return { state, push, pulled, deleted, conflicts, profileDirty };
}

/** 记录部分的签名（不含每天变的 dayRule 快照以外的东西都算） */
export const metaSig = (st: AppState) => JSON.stringify(metaOf(st));

/** 一行卡片的签名：时间戳 + 内容（内容变了时间戳没变也算改过，例如「斩」） */
export const rowSig = (r: CardRow) => `${r.ts}|${JSON.stringify(r.card)}`;

/** 增量上传：和上次同步过的签名比，变了的、新出现的 */
export function changedRows(st: Pick<AppState, "cards" | "revlog" | "tomb">, synced: Map<string, string>): CardRow[] {
  return localRows(st).filter((r) => synced.get(r.word) !== rowSig(r));
}
