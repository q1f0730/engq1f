/**
 * v11 · 数据与多设备（无云）——纯逻辑，按需加载，不进首屏
 *
 *  - 合并导入：两台设备的记录按「最近复习」合并，可重复合并（幂等）
 *  - 加密备份：PBKDF2-SHA256 → AES-GCM-256（WebCrypto）
 *  - 数据体检：找出并修复损坏 / 不存在的记录
 *  - 导入词表：从 CSV / TXT 里挑出词库收录的词
 *  - 词单链接：词单压缩后编码进链接 hash，不经服务器
 *  - 自动快照：每天一份、保留最近 7 份的取舍规则
 */
import type { Card, DayLog } from "./srs";
import { BACKUP_VERSION, NEWER_MSG, RAW_DEAD_MSG, type AppState } from "./store";
import { isRawDump, unwrapRaw } from "./salvage";
import { LIST_MAX, LIST_WORDS_MAX, addWords, cleanListName, type WordList } from "./lists";
import { REV_MAX, isRevEntry, type RevEntry } from "./stats";
import type { QuizRecord } from "./exam";
import { MAKEUP_MAX } from "./habit";

// ---------------------------------------------------------------- 合并导入

export interface MergeStats {
  /** 只在备份里有的词 */
  added: number;
  /** 两边都有、备份里更新的词 */
  updated: number;
  /** 两边都有、本机更新（或一样）的词 */
  kept: number;
  /** 新增复习日志条数 */
  revAdded: number;
  /** 新增打卡天数 */
  daysAdded: number;
  /** 新增 / 合并的词单数 */
  lists: number;
  /** 新增生词本 */
  starAdded: number;
}

/** 每个词最后一次作答的时间（epoch 秒） */
function lastSeen(log: RevEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of log) if ((m.get(e[0]) ?? -1) < e[1]) m.set(e[0], e[1]);
  return m;
}

/** 选哪一边的卡片：最近复习日更晚的；同一天看日志里的最后作答时间；再看作答次数；都一样留本机 */
export function pickCard(a: Card, b: Card, ta = 0, tb = 0): "a" | "b" {
  if (a.t !== b.t) return b.t > a.t ? "b" : "a";
  if (ta !== tb) return tb > ta ? "b" : "a";
  if (a.r + a.l !== b.r + b.l) return b.r + b.l > a.r + a.l ? "b" : "a";
  return "a";
}

const maxLog = (a: DayLog, b: DayLog): DayLog => ({
  n: Math.max(a.n, b.n),
  r: Math.max(a.r, b.r),
  ok: Math.max(a.ok, b.ok),
  a: Math.max(a.a, b.a),
  ms: Math.max(a.ms, b.ms),
});

const later = (a?: string, b?: string) => (!a ? b : !b ? a : b > a ? b : a);

/**
 * 合并：local = 本机，remote = 备份。设置、主题、档案相关的留本机。
 * 同一份备份合并两次结果不变。
 */
export function mergeStates(local: AppState, remote: AppState): { state: AppState; stats: MergeStats } {
  const stats: MergeStats = { added: 0, updated: 0, kept: 0, revAdded: 0, daysAdded: 0, lists: 0, starAdded: 0 };
  const la = lastSeen(local.revlog ?? []);
  const lb = lastSeen(remote.revlog ?? []);

  const cards: Record<string, Card> = { ...local.cards };
  for (const [w, rc] of Object.entries(remote.cards ?? {})) {
    const lc = cards[w];
    if (!lc) {
      cards[w] = rc;
      stats.added++;
    } else if (pickCard(lc, rc, la.get(w), lb.get(w)) === "b") {
      if (JSON.stringify(lc) !== JSON.stringify(rc)) {
        cards[w] = rc;
        stats.updated++;
      } else stats.kept++;
    } else stats.kept++;
  }

  // 复习日志：并集，按 词 + 时间 + 评分 去重，按时间排序
  const key = (e: RevEntry) => `${e[0]}|${e[1]}|${e[2]}`;
  const seen = new Set((local.revlog ?? []).map(key));
  const extra = (remote.revlog ?? []).filter((e) => !seen.has(key(e)) && (seen.add(key(e)), true));
  stats.revAdded = extra.length;
  const revlog = extra.length ? [...(local.revlog ?? []), ...extra].sort((x, y) => x[1] - y[1]).slice(-REV_MAX) : local.revlog;

  // 每日日志：同一天取各项最大值（两边都学了的那天不会翻倍，重复合并也不变）
  const log: Record<string, DayLog> = { ...local.log };
  for (const [d, l] of Object.entries(remote.log ?? {})) log[d] = log[d] ? maxLog(log[d], l) : l;

  const checkSet = new Set(local.checkins);
  for (const d of remote.checkins ?? []) if (!checkSet.has(d)) (checkSet.add(d), stats.daysAdded++);
  const checkins = [...checkSet].sort();
  const patched = [...new Set([...(local.patched ?? []), ...(remote.patched ?? [])])].sort();

  const star = { ...local.star };
  for (const w of Object.keys(remote.star ?? {})) if (!star[w]) (star[w] = 1, stats.starAdded++);

  const bury = { ...local.bury };
  for (const [w, d] of Object.entries(remote.bury ?? {})) bury[w] = later(bury[w], d)!;

  // 小测：按时间戳去重
  const qk = (q: QuizRecord) => `${q.ts}|${q.n}|${q.ok}`;
  const qs = new Map<string, QuizRecord>();
  for (const q of [...(local.quizzes ?? []), ...(remote.quizzes ?? [])]) if (!qs.has(qk(q))) qs.set(qk(q), q);
  const quizzes = [...qs.values()].sort((a, b) => a.ts - b.ts).slice(-60);

  // 词单：同 id 或同名的合并词（本机顺序在前），其余追加
  let lists: WordList[] = (local.lists ?? []).map((l) => ({ ...l, words: l.words.slice() }));
  for (const rl of remote.lists ?? []) {
    const k = lists.findIndex((l) => l.id === rl.id || l.name === rl.name);
    if (k >= 0) {
      const merged = addWords(lists[k], rl.words);
      if (merged.words.length !== lists[k].words.length) stats.lists++;
      lists[k] = merged;
    } else if (lists.length < LIST_MAX) {
      lists = [...lists, { ...rl, words: rl.words.slice(0, LIST_WORDS_MAX), name: cleanListName(rl.name, lists.map((l) => l.name)) }];
      stats.lists++;
    }
  }

  // 成就：取更早的解锁日期
  const badges = { ...local.badges };
  for (const [id, d] of Object.entries(remote.badges ?? {})) badges[id] = !badges[id] || d < badges[id] ? d : badges[id];

  const gameBest = { ...local.gameBest };
  for (const [g, v] of Object.entries(remote.gameBest ?? {})) gameBest[g] = Math.max(gameBest[g] ?? 0, v);

  const test = !local.test ? remote.test : !remote.test ? local.test : remote.test.at > local.test.at ? remote.test : local.test;

  return {
    state: {
      ...local,
      onboarded: local.onboarded || remote.onboarded,
      cards,
      revlog,
      log,
      checkins,
      patched,
      star,
      bury,
      quizzes,
      lists,
      badges,
      gameBest,
      test,
      makeup: Math.min(MAKEUP_MAX, Math.max(local.makeup ?? 0, remote.makeup ?? 0)),
      makeupEarned: later(local.makeupEarned, remote.makeupEarned),
      lastBackup: later(local.lastBackup, remote.lastBackup),
      // 11.4 · 两边记下的「任务完成」都算；每天的任务快照以先记下的为准（本机优先，缺的补上）
      goalMet: [...new Set([...(local.goalMet ?? []), ...(remote.goalMet ?? [])])].sort().slice(-14),
      dayRule: local.dayRule || remote.dayRule ? { ...(remote.dayRule ?? {}), ...(local.dayRule ?? {}) } : undefined,
    },
    stats,
  };
}

/** 备份里有没有学习数据（决定导入时要不要问「覆盖还是合并」） */
export const hasProgress = (st: Pick<AppState, "cards" | "checkins">) => Object.keys(st.cards ?? {}).length > 0 || (st.checkins ?? []).length > 0;

// ---------------------------------------------------------------- 加密备份

export interface EncEnvelope {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

export const ENC_ITER = 150_000;
export const PASS_MIN = 4;

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
  return out;
}

async function deriveKey(pass: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter }, raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export const cryptoReady = () => typeof crypto !== "undefined" && !!crypto.subtle;

/** 加密整份备份文本，返回同样以 app: cet4-vocab 开头的 JSON（一眼能认出是加密备份） */
export async function encryptBackup(plain: string, pass: string, iter = ENC_ITER): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt, iter);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(plain)));
  const enc: EncEnvelope = { v: 1, kdf: "PBKDF2-SHA256", iter, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  return JSON.stringify({ app: "cet4-vocab", version: 1, exportedAt: new Date().toISOString(), enc });
}

export async function decryptBackup(enc: EncEnvelope, pass: string): Promise<string> {
  let key: CryptoKey;
  try {
    key = await deriveKey(pass, unb64(enc.salt), enc.iter);
  } catch {
    throw new Error("备份已损坏");
  }
  try {
    const out = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(enc.iv) as BufferSource }, key, unb64(enc.ct) as BufferSource);
    return new TextDecoder().decode(out);
  } catch {
    throw new Error("口令不对，或者备份被改动过");
  }
}

export type ParsedBackup = { kind: "plain"; text: string; exportedAt?: string } | { kind: "enc"; enc: EncEnvelope; exportedAt?: string };

/** 认出备份文本：明文 / 加密；不是本应用的备份抛错 */
export function sniffBackup(text: string): ParsedBackup {
  let p: { app?: string; state?: unknown; enc?: EncEnvelope; exportedAt?: string };
  try {
    p = JSON.parse(text.trim());
  } catch {
    throw new Error("不是有效的备份（JSON 格式不对）");
  }
  if (p?.app !== "cet4-vocab") throw new Error("这不是四级单词打卡的备份");
  if (typeof (p as { version?: unknown }).version === "number" && (p as { version: number }).version > BACKUP_VERSION) throw new Error(NEWER_MSG);
  const at = typeof p.exportedAt === "string" ? p.exportedAt : undefined;
  if (p.enc) {
    const e = p.enc;
    if (e.v !== 1 || typeof e.salt !== "string" || typeof e.iv !== "string" || typeof e.ct !== "string" || !Number.isInteger(e.iter) || e.iter < 1000 || e.iter > 5_000_000)
      throw new Error("加密备份格式不对");
    return { kind: "enc", enc: e, exportedAt: at };
  }
  // 11.3 · 救援页导出的原始数据：转成普通备份格式（坏掉的逐条抢救，记下救回几个词）
  if (isRawDump(p)) {
    const u = unwrapRaw(p.raw);
    if (!u) throw new Error(RAW_DEAD_MSG);
    return { kind: "plain", text: JSON.stringify({ app: "cet4-vocab", version: BACKUP_VERSION, exportedAt: at, state: u.state, ...(u.salvaged !== undefined ? { salvaged: u.salvaged } : {}) }), exportedAt: at };
  }
  if (!p.state) throw new Error("这不是四级单词打卡的备份");
  return { kind: "plain", text: text.trim(), exportedAt: at };
}

// ---------------------------------------------------------------- 数据体检

export type IssueKind = "unknown-card" | "bad-card" | "unknown-star" | "bad-bury" | "list-words" | "unknown-rev" | "bad-checkin" | "bad-log";

export interface Issue {
  kind: IssueKind;
  label: string;
  /** 修复方式 */
  fix: string;
  n: number;
  sample: string[];
}

export const ISSUE_TEXT: Record<IssueKind, [string, string]> = {
  "unknown-card": ["词库里不存在的单词记录", "删除"],
  "bad-card": ["损坏的单词记录（间隔 / 日期 / 系数不对）", "按规则修正"],
  "unknown-star": ["生词本里不存在的词", "移出生词本"],
  "bad-bury": ["无效的「明天再说」记录", "删除"],
  "list-words": ["词单里不存在的词", "移出词单"],
  "unknown-rev": ["复习日志里不存在的词", "删除这些日志"],
  "bad-checkin": ["无效或重复的打卡日期", "去掉"],
  "bad-log": ["损坏的每日学习记录", "修正或删除"],
};

import { fixCard, isDay } from "./validate";
export { fixCard };
const nonNegInt = (x: unknown) => typeof x === "number" && Number.isInteger(x) && x >= 0;

/** 体检：返回问题清单和修好的状态（不提交） */
export function inspectState(st: AppState, has: (w: string) => boolean, today: string): { issues: Issue[]; total: number; fixed: AppState } {
  const found: Partial<Record<IssueKind, string[]>> = {};
  const note = (k: IssueKind, s: string) => (found[k] ??= []).push(s);

  const cards: Record<string, Card> = {};
  for (const [w, c] of Object.entries(st.cards ?? {})) {
    if (!has(w)) {
      note("unknown-card", w);
      continue;
    }
    const f = fixCard(c, today);
    if (f === "drop") {
      note("bad-card", w);
      continue;
    }
    if (f) note("bad-card", w);
    cards[w] = f ?? (c as Card);
  }

  const star: Record<string, 1> = {};
  for (const w of Object.keys(st.star ?? {})) (has(w) ? (star[w] = 1) : note("unknown-star", w));

  const bury: Record<string, string> = {};
  for (const [w, d] of Object.entries(st.bury ?? {})) (has(w) && isDay(d) ? (bury[w] = d) : note("bad-bury", w));

  const lists = (st.lists ?? []).map((l) => {
    const bad = l.words.filter((w) => !has(w));
    for (const w of bad) note("list-words", `${l.name}：${w}`);
    return bad.length ? { ...l, words: l.words.filter((w) => has(w)) } : l;
  });

  const revBad = (st.revlog ?? []).filter((e) => !isRevEntry(e) || !has(e[0]));
  for (const e of revBad) note("unknown-rev", String(e[0]));
  const revlog = revBad.length ? st.revlog.filter((e) => isRevEntry(e) && has(e[0])) : st.revlog;

  const ck = new Set<string>();
  for (const d of st.checkins ?? []) (isDay(d) && !ck.has(d) ? ck.add(d) : note("bad-checkin", String(d)));
  const checkins = [...ck].sort();
  const patched = (st.patched ?? []).filter((d) => ck.has(d));

  const log: Record<string, DayLog> = {};
  for (const [d, l] of Object.entries(st.log ?? {})) {
    if (!isDay(d) || !l || typeof l !== "object") {
      note("bad-log", d);
      continue;
    }
    const fields = ["n", "r", "ok", "a", "ms"] as const;
    if (fields.every((f) => nonNegInt(l[f])) && l.ok <= l.a) {
      log[d] = l;
      continue;
    }
    note("bad-log", d);
    const fixed = Object.fromEntries(fields.map((f) => [f, nonNegInt(l[f]) ? l[f] : 0])) as unknown as DayLog;
    fixed.ok = Math.min(fixed.ok, fixed.a);
    log[d] = fixed;
  }

  const issues: Issue[] = (Object.keys(ISSUE_TEXT) as IssueKind[])
    .filter((k) => found[k]?.length)
    .map((k) => ({ kind: k, label: ISSUE_TEXT[k][0], fix: ISSUE_TEXT[k][1], n: found[k]!.length, sample: [...new Set(found[k])].slice(0, 5) }));
  const total = issues.reduce((s, i) => s + i.n, 0);
  return { issues, total, fixed: total ? { ...st, cards, star, bury, lists, revlog, checkins, patched, log } : st };
}

// ---------------------------------------------------------------- 导入词表

export interface WordFileResult {
  /** 词库收录的词（去重，按文件顺序） */
  found: string[];
  /** 没收录的英文词（去重） */
  missing: string[];
}

const TOKEN = /[A-Za-z][A-Za-z'.-]*[A-Za-z.]|[A-Za-z]/g;

/**
 * 从 CSV / TXT 里挑词：有分隔符（逗号 / Tab / 分号）的行只看第一个含英文的格子（后面多半是释义或例句），
 * 没有分隔符的行把每个英文词都算上。大小写不敏感，去掉首尾标点后查词库。
 */
export function parseWordText(text: string, resolve: (w: string) => string | undefined): WordFileResult {
  const found: string[] = [];
  const missing: string[] = [];
  const fs = new Set<string>();
  const ms = new Set<string>();
  const take = (raw: string) => {
    const w = raw.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
    if (!w) return;
    const hit = resolve(w) ?? resolve(raw.toLowerCase().replace(/^[^a-z]+/, ""));
    if (hit) {
      if (!fs.has(hit)) (fs.add(hit), found.push(hit));
    } else if (w.length > 1 && !ms.has(w)) (ms.add(w), missing.push(w));
  };
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.split(/[,\t;，；]/);
    if (cells.length > 1) {
      const cell = cells.find((c) => /[A-Za-z]/.test(c));
      if (!cell) continue;
      // 第一格是整条短语（如 "give up"）时按单词拆开
      for (const t of cell.match(TOKEN) ?? []) take(t);
    } else {
      for (const t of line.match(TOKEN) ?? []) take(t);
    }
  }
  return { found, missing };
}

/** 词库的小写查找表：小写 → 词库里的写法 */
export function lowerLookup(words: Iterable<string>): (w: string) => string | undefined {
  const m = new Map<string, string>();
  for (const w of words) if (!m.has(w.toLowerCase())) m.set(w.toLowerCase(), w);
  return (w) => m.get(w);
}

/** 文件名 → 词单名 */
export const listNameFromFile = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 20);

// ---------------------------------------------------------------- 词单链接

export const LINK_MAX_WORDS = 1000;

function b64url(bytes: Uint8Array): string {
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  return unb64(t + "=".repeat((4 - (t.length % 4)) % 4));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const canZip = () => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

/** 词单 → 链接里的编码：z.<deflate-raw + base64url>，不支持压缩时 j.<base64url JSON> */
export async function encodeList(name: string, words: string[]): Promise<string> {
  const json = JSON.stringify({ n: name, w: words.slice(0, LINK_MAX_WORDS) });
  const raw = new TextEncoder().encode(json);
  if (canZip()) return "z." + b64url(await pipe(raw, new CompressionStream("deflate-raw")));
  return "j." + b64url(raw);
}

export async function decodeList(code: string): Promise<{ name: string; words: string[] }> {
  const [kind, body] = [code.slice(0, 2), code.slice(2)];
  let json: string;
  try {
    if (kind === "z.") json = new TextDecoder().decode(await pipe(unb64url(body), new DecompressionStream("deflate-raw")));
    else if (kind === "j.") json = new TextDecoder().decode(unb64url(body));
    else throw new Error();
    const p = JSON.parse(json) as { n?: unknown; w?: unknown };
    if (!Array.isArray(p.w)) throw new Error();
    const words = [...new Set(p.w.filter((w): w is string => typeof w === "string" && /^[a-z][a-z' .-]*$/i.test(w)))].slice(0, LINK_MAX_WORDS);
    return { name: typeof p.n === "string" ? p.n.slice(0, 20) : "", words };
  } catch {
    throw new Error("链接无效或不完整");
  }
}

/** 完整链接：当前页面地址（含子路径）+ #/list-link?d=… */
export function listLinkUrl(href: string, code: string): string {
  const base = href.split("#")[0];
  return `${base}#/list-link?d=${code}`;
}

// ---------------------------------------------------------------- 存储

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

/** localStorage 里一个 key 占多少（UTF-16，每字符 2 字节） */
export const lsBytes = (k: string, v: string | null) => (v === null ? 0 : (k.length + v.length) * 2);
