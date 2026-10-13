/**
 * v11 · 自动快照：存在 IndexedDB（比 localStorage 空间大，不挤占学习记录）
 * 每天第一次打开应用时自动存一份，每个档案保留最近 7 份；导入 / 合并前也会先存一份。
 */
// 取舍规则（纯函数）

export const SNAP_KEEP = 7;

export interface SnapMeta {
  id: string;
  profile: string;
  /** 本地日期 */
  day: string;
  /** 时间戳 ms */
  at: number;
  /** auto = 每日自动，manual = 手动，import = 导入 / 合并前 */
  kind: "auto" | "manual" | "import";
  words: number;
  size: number;
}

/** 今天还没有自动快照 */
export const needAutoSnap = (list: SnapMeta[], day: string) => !list.some((s) => s.day === day && s.kind === "auto");

/** 超出 7 份时要删的（最旧的先删） */
export function snapsToPrune(list: SnapMeta[], keep = SNAP_KEEP): string[] {
  return [...list]
    .sort((a, b) => b.at - a.at)
    .slice(keep)
    .map((s) => s.id);
}


const DB = "cet4v-snaps";
const STORE = "snaps";

interface SnapRow extends SnapMeta {
  data: string;
}

let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("这个浏览器不支持 IndexedDB"));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore(STORE, { keyPath: "id" });
      s.createIndex("profile", "profile");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  dbp.catch(() => (dbp = null));
  return dbp;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx(mode: IDBTransactionMode) {
  return (await db()).transaction(STORE, mode).objectStore(STORE);
}

/** 某个档案的快照（新 → 旧），不含数据本体 */
export async function listSnaps(profile: string): Promise<SnapMeta[]> {
  const rows = (await req((await tx("readonly")).index("profile").getAll(profile))) as SnapRow[];
  return rows.map(({ data: _d, ...m }) => (void _d, m)).sort((a, b) => b.at - a.at);
}

export async function snapData(id: string): Promise<string | null> {
  const row = (await req((await tx("readonly")).get(id))) as SnapRow | undefined;
  return row?.data ?? null;
}

export async function deleteSnap(id: string) {
  await req((await tx("readwrite")).delete(id));
}

export async function deleteProfileSnaps(profile: string) {
  for (const s of await listSnaps(profile)) await deleteSnap(s.id);
}

/** 存一份并把超出 7 份的旧快照删掉 */
export async function saveSnap(profile: string, day: string, kind: SnapMeta["kind"], data: string, words: number): Promise<SnapMeta> {
  const at = Date.now();
  const meta: SnapMeta = { id: `${profile}|${at}`, profile, day, at, kind, words, size: data.length * 2 };
  await req((await tx("readwrite")).put({ ...meta, data } satisfies SnapRow));
  for (const id of snapsToPrune(await listSnaps(profile), SNAP_KEEP)) await deleteSnap(id);
  return meta;
}

/** 每天一份：今天还没自动存过才存；返回是否存了 */
export async function autoSnapshot(profile: string, day: string, data: () => string, words: number): Promise<boolean> {
  const list = await listSnaps(profile);
  if (!needAutoSnap(list, day)) return false;
  await saveSnap(profile, day, "auto", data(), words);
  return true;
}

/** 全部快照占用（所有档案） */
export async function snapUsage(): Promise<{ n: number; bytes: number }> {
  const rows = (await req((await tx("readonly")).getAll())) as SnapRow[];
  return { n: rows.length, bytes: rows.reduce((s, r) => s + r.size, 0) };
}
