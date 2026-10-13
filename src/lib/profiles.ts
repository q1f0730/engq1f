/**
 * v11 · 多学习档案（同一设备、互相独立）
 *
 * 档案表存在 cet4v-profiles-v1：{ active, list }。
 * 默认档案 id = "main"，沿用 v1 起的 key（cet4v-state-v1 / cet4v-revlog-v1），老用户无感升级；
 * 其他档案的 key 加后缀 @id。这个文件在首屏里，保持很小。
 */
export interface Profile {
  id: string;
  name: string;
  /** 创建日期 YYYY-MM-DD */
  at: string;
}

export interface Registry {
  active: string;
  list: Profile[];
}

export const PROFILES_KEY = "cet4v-profiles-v1";
export const MAIN = "main";
export const PROFILE_MAX = 5;
export const PROFILE_NAME_MAX = 12;

export const stateKeyOf = (id: string) => (id === MAIN ? "cet4v-state-v1" : `cet4v-state-v1@${id}`);
export const revKeyOf = (id: string) => (id === MAIN ? "cet4v-revlog-v1" : `cet4v-revlog-v1@${id}`);

const mainProfile = (): Profile => ({ id: MAIN, name: "默认档案", at: "" });

/** 校验档案表：默认档案总在第一个，id 去重，active 必须存在 */
export function cleanRegistry(raw: unknown): Registry {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Registry>;
  const seen = new Set<string>();
  const list: Profile[] = [];
  for (const p of Array.isArray(r.list) ? r.list : []) {
    if (!p || typeof p !== "object" || typeof p.id !== "string" || !/^[a-z0-9]{1,16}$/.test(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    list.push({ id: p.id, name: cleanProfileName(String(p.name ?? ""), p.id === MAIN ? "默认档案" : "档案"), at: typeof p.at === "string" ? p.at : "" });
  }
  if (!seen.has(MAIN)) list.unshift(mainProfile());
  else list.sort((a, b) => (a.id === MAIN ? -1 : b.id === MAIN ? 1 : 0));
  const active = typeof r.active === "string" && list.some((p) => p.id === r.active) ? r.active : MAIN;
  return { active, list: list.slice(0, PROFILE_MAX) };
}

export function cleanProfileName(name: string, fallback = "档案"): string {
  return name.replace(/\s+/g, " ").trim().slice(0, PROFILE_NAME_MAX).trim() || fallback;
}

export function readRegistry(): Registry {
  try {
    return cleanRegistry(JSON.parse(localStorage.getItem(PROFILES_KEY) || "null"));
  } catch {
    return cleanRegistry(null);
  }
}

export function writeRegistry(r: Registry) {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(r));
  } catch {
    /* 存储已满 */
  }
}

/** 新建档案（纯函数）：满 5 个返回 null */
export function addProfile(r: Registry, name: string, id: string, day: string): Registry | null {
  if (r.list.length >= PROFILE_MAX) return null;
  return { ...r, list: [...r.list, { id, name: cleanProfileName(name, `档案 ${r.list.length + 1}`), at: day }] };
}

/** 删除档案：默认档案和正在用的档案不能删 */
export function removeProfile(r: Registry, id: string): Registry {
  if (id === MAIN || id === r.active) return r;
  return { ...r, list: r.list.filter((p) => p.id !== id) };
}

export function renameProfile(r: Registry, id: string, name: string): Registry {
  return { ...r, list: r.list.map((p) => (p.id === id ? { ...p, name: cleanProfileName(name, p.name) } : p)) };
}

export const newProfileId = () => "p" + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 1296).toString(36);

/** 当前档案（页面加载时定下来，切换档案会整页重载） */
export const ACTIVE_PROFILE: string = typeof localStorage === "undefined" ? MAIN : readRegistry().active;
