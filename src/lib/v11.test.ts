import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { posOf, type Word, type WordIndex } from "./data";

// store 依赖浏览器全局：node 环境里给最小替身（要在 import store 之前）
const mem = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
g.localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};
g.window = { matchMedia: () => ({ matches: false }) };
const el = { classList: { contains: () => false, remove: () => {}, add: () => {} }, setAttribute: () => {} };
g.document = { documentElement: el, querySelector: () => null };

const { algoOptions, fitInitialEase, FIT_MIN } = await import("./algo");
const { addDays, newCard, schedule } = await import("./srs");
type Card = import("./srs").Card;
const { GRADE_LABEL, F_NEW, gradeOf, isCorrect, isRecall, isRevEntry, normalizeRevlog, retention, revEntry, revlogCsv } = await import("./stats");
type RevEntry = import("./stats").RevEntry;
const { dayDetail } = await import("./habit");
const store = await import("./store");
const { KEY, LEGACY_ALGO, REV_KEY, defaultSettings, exportBackup, getState, initialState, normalize, parseBackup, replaceState } = store;
type AppState = import("./store").AppState;
const P = await import("./profiles");
const S = await import("./sync");
const { needAutoSnap, snapsToPrune, SNAP_KEEP } = await import("./snapshots");
type SnapMeta = import("./snapshots").SnapMeta;
const { reportData } = await import("./report");

const T = "2026-10-13";

function mkIndex(list: Word[]): WordIndex {
  const map = new Map<string, Word>();
  const byPos = new Map<string, Word[]>();
  for (const w of list) {
    map.set(w.w, w);
    const p = posOf(w);
    if (!byPos.has(p)) byPos.set(p, []);
    byPos.get(p)!.push(w);
  }
  return { list, map, byPos, coreCount: list.filter((w) => w.c).length };
}
const REAL = mkIndex(JSON.parse(readFileSync(new URL("../../public/data/cet4.json", import.meta.url), "utf8")) as Word[]);
const has = (w: string) => REAL.map.has(w);
const st = (patch: Partial<AppState> = {}): AppState => ({ ...initialState(), onboarded: true, seed: 7, ...patch });
const card = (p: Partial<Card> = {}): Card => ({ st: "review", e: 2.5, i: 3, r: 2, l: 0, d: T, f: "2026-09-01", t: "2026-10-10", ...p });
const at = (day: string, h: number) => Math.floor(new Date(`${day}T${String(h).padStart(2, "0")}:00:00`).getTime() / 1000);

// ---------------------------------------------------------------- 发布加固 (a) 新安装默认打开高级排程
describe("v11 · 新安装默认打开高级排程，老用户不变", () => {
  it("默认：扰动 / 均衡 / 逾期加成 / 重学步骤 / 初始难度拟合 开；保持目标 90%；四键关", () => {
    const d = defaultSettings();
    expect(d).toMatchObject({ fuzz: true, balance: true, overdue: true, steps: true, fitEase: true, retention: 90, fourKey: false });
    expect(initialState().settings.fuzz).toBe(true);
  });
  it("新默认下 algoOptions 带上扰动、逾期、重学步骤和负荷；拟合样本不够时不改初始 ease", () => {
    const o = algoOptions(defaultSettings(), { cards: {}, revlog: [], today: T });
    expect(o.fuzz).toBe(true);
    expect(o.overdue).toBe(true);
    expect(o.steps).toBe(true);
    expect(o.load).toBeDefined();
    expect(o.initEase).toBeUndefined();
    expect(o.retention).toBeUndefined();
  });
  it("存档里没有这些开关（v10 之前的存档 / 旧备份）→ 按旧默认全关", () => {
    const s = normalize({ cards: {}, settings: { daily: 20 } });
    expect(s.settings).toMatchObject(LEGACY_ALGO);
    expect(normalize({ cards: {} }).settings).toMatchObject(LEGACY_ALGO);
  });
  it("v10 存档里写着的值原样保留（关的还是关，开的还是开）", () => {
    const off = normalize({ cards: {}, settings: { ...defaultSettings(), ...LEGACY_ALGO } });
    expect(off.settings).toMatchObject(LEGACY_ALGO);
    const mixed = normalize({ cards: {}, settings: { ...defaultSettings(), fuzz: true, steps: false, balance: false, overdue: true, fitEase: false } });
    expect(mixed.settings).toMatchObject({ fuzz: true, steps: false, balance: false, overdue: true, fitEase: false });
  });
  it("清空记录 / 新档案 = 新安装：用新默认", () => {
    store.resetAll();
    expect(getState().settings).toMatchObject({ fuzz: true, balance: true, overdue: true, steps: true, fitEase: true });
  });
});

// ---------------------------------------------------------------- (b) 「简单」单独记一档
describe("v11 · 「简单」在复习日志里单独记 4", () => {
  it("gradeOf / revEntry / 标签", () => {
    expect(gradeOf("easy")).toBe(4);
    expect(gradeOf("know")).toBe(2);
    expect(GRADE_LABEL[4]).toBe("简单");
    const c = schedule(card({ i: 5 }), "know", T, { algo: { easy: true } });
    expect(revEntry("abandon", 1_000_000, "easy", { card: c })).toEqual(["abandon", 1000, 4, 0, c.i]);
  });
  it("旧日志（简单记成 2）照样读；新日志的 4 能读；5 之类的坏值丢掉", () => {
    const old: RevEntry = ["a", 1, 2, 0, 3];
    const neu: RevEntry = ["b", 2, 4, 0, 9];
    expect(isRevEntry(neu)).toBe(true);
    expect(normalizeRevlog([old, neu, ["c", 3, 5, 0, 1]])).toEqual([old, neu]);
  });
  it("简单算答对：保持率、记得判定、初始难度拟合都把 4 当作记得；斩不算 recall", () => {
    expect(isCorrect(["a", 1, 4, 0, 3])).toBe(true);
    expect(isRecall(4)).toBe(true);
    expect(isRecall(3)).toBe(false);
    const log: RevEntry[] = [
      ["a", at(T, 9), 4, 0, 9],
      ["b", at(T, 9), 0, 0, 0],
    ];
    expect(retention(log, T).rate).toBe(50);
    const firsts: RevEntry[] = Array.from({ length: FIT_MIN }, (_, k) => [`w${k}`, k, k % 2 ? 4 : 0, F_NEW, 2] as RevEntry);
    expect(fitInitialEase(firsts).acc).toBe(0.5);
  });
  it("CSV 与当日回看带出「简单」", () => {
    expect(revlogCsv([["abandon", at(T, 9), 4, 0, 12]])).toContain(",简单,");
    const d = dayDetail([["abandon", at(T, 9), 4, 0, 12]], { abandon: card({ f: "2026-09-01" }) }, T);
    expect(d.reviewed).toEqual([{ w: "abandon", g: 4 }]);
  });
});

// ---------------------------------------------------------------- 8 多学习档案
describe("v11 · 8 多学习档案", () => {
  it("默认档案沿用旧 key，其他档案加后缀；当前档案 key 是旧 key", () => {
    expect(P.stateKeyOf(P.MAIN)).toBe("cet4v-state-v1");
    expect(P.revKeyOf(P.MAIN)).toBe("cet4v-revlog-v1");
    expect(P.stateKeyOf("pabc")).toBe("cet4v-state-v1@pabc");
    expect(KEY).toBe("cet4v-state-v1");
    expect(REV_KEY).toBe("cet4v-revlog-v1");
  });
  it("档案表校验：没有 → 只有默认档案；坏 id 丢掉；active 不存在回默认；默认档案排第一", () => {
    expect(P.cleanRegistry(null)).toEqual({ active: "main", list: [{ id: "main", name: "默认档案", at: "" }] });
    const r = P.cleanRegistry({ active: "zzz", list: [{ id: "p1", name: "  六级  ", at: T }, { id: "BAD ID", name: "x" }, { id: "p1", name: "dup" }, { id: "main", name: "" }] });
    expect(r.active).toBe("main");
    expect(r.list.map((p) => p.id)).toEqual(["main", "p1"]);
    expect(r.list[1].name).toBe("六级");
    expect(r.list[0].name).toBe("默认档案");
  });
  it("新建最多 5 个；默认档案和当前档案不能删；重命名去空白、截 12 字", () => {
    let r = P.cleanRegistry(null);
    for (let k = 1; k < P.PROFILE_MAX; k++) r = P.addProfile(r, `档案${k}`, `p${k}`, T)!;
    expect(r.list).toHaveLength(5);
    expect(P.addProfile(r, "x", "p9", T)).toBeNull();
    r = { ...r, active: "p2" };
    expect(P.removeProfile(r, "main")).toBe(r);
    expect(P.removeProfile(r, "p2")).toBe(r);
    expect(P.removeProfile(r, "p3").list.map((p) => p.id)).toEqual(["main", "p1", "p2", "p4"]);
    expect(P.renameProfile(r, "p1", "  一个特别特别特别长的档案名字  ").list[1].name).toBe("一个特别特别特别长的档案");
    expect(P.addProfile(P.cleanRegistry(null), "", "p1", T)!.list[1].name).toBe("档案 2");
  });
});

// ---------------------------------------------------------------- 1 合并导入
describe("v11 · 1 合并导入", () => {
  const A = st({
    cards: { abandon: card({ t: "2026-10-10", i: 3 }), ability: card({ t: "2026-10-12", i: 7 }), able: card({ t: "2026-10-11", r: 1 }) },
    revlog: [["abandon", 100, 2, 0, 3]],
    log: { "2026-10-10": { n: 5, r: 3, ok: 6, a: 8, ms: 60000 } },
    checkins: ["2026-10-10"],
    star: { abandon: 1 },
    lists: [{ id: "l1", name: "Unit 1", words: ["abandon"], at: T }],
    badges: { first: "2026-10-05" },
    gameBest: { match: 50 },
  });
  const B = st({
    cards: { abandon: card({ t: "2026-10-12", i: 8 }), ability: card({ t: "2026-10-01", i: 2 }), absorb: card({ t: "2026-10-09" }), able: card({ t: "2026-10-11", r: 5 }) },
    revlog: [
      ["abandon", 100, 2, 0, 3],
      ["abandon", 50, 1, 0, 1],
      ["absorb", 200, 2, 0, 3],
    ],
    log: { "2026-10-10": { n: 2, r: 9, ok: 7, a: 11, ms: 30000 }, "2026-10-09": { n: 1, r: 0, ok: 1, a: 1, ms: 1000 } },
    checkins: ["2026-10-09", "2026-10-10"],
    star: { absorb: 1 },
    lists: [
      { id: "l1", name: "Unit 1", words: ["absorb", "abandon"], at: T },
      { id: "l9", name: "听力", words: ["ability"], at: T },
    ],
    badges: { first: "2026-10-01", s7: "2026-10-09" },
    gameBest: { match: 30, judge: 80 },
    settings: { ...defaultSettings(), daily: 80, theme: "dark" },
  });
  it("每个词取最近复习的那份；本机设置不变", () => {
    const { state, stats } = S.mergeStates(A, B);
    expect(state.cards.abandon.i).toBe(8); // 备份更新
    expect(state.cards.ability.i).toBe(7); // 本机更新
    expect(state.cards.absorb).toBeDefined(); // 只在备份里
    expect(state.cards.able.r).toBe(5); // 同一天：作答次数多的
    expect(stats).toMatchObject({ added: 1, updated: 2, kept: 1 });
    expect(state.settings).toBe(A.settings);
  });
  it("日志 / 打卡 / 生词本 / 词单取并集，同一天的学习量取最大，成就取更早日期，游戏取最高分", () => {
    const { state, stats } = S.mergeStates(A, B);
    expect(state.revlog.map((e) => e[1])).toEqual([50, 100, 200]);
    expect(stats.revAdded).toBe(2);
    expect(state.log["2026-10-10"]).toEqual({ n: 5, r: 9, ok: 7, a: 11, ms: 60000 });
    expect(state.log["2026-10-09"]).toBeDefined();
    expect(state.checkins).toEqual(["2026-10-09", "2026-10-10"]);
    expect(stats.daysAdded).toBe(1);
    expect(Object.keys(state.star).sort()).toEqual(["abandon", "absorb"]);
    expect(state.lists.map((l) => [l.name, l.words])).toEqual([
      ["Unit 1", ["abandon", "absorb"]],
      ["听力", ["ability"]],
    ]);
    expect(state.badges).toEqual({ first: "2026-10-01", s7: "2026-10-09" });
    expect(state.gameBest).toEqual({ match: 50, judge: 80 });
  });
  it("幂等：同一份备份合并两次，结果和合并一次一样", () => {
    const once = S.mergeStates(A, B).state;
    const twice = S.mergeStates(once, B);
    expect(twice.state.cards).toEqual(once.cards);
    expect(twice.state.revlog).toEqual(once.revlog);
    expect(twice.state.log).toEqual(once.log);
    expect(twice.state.lists).toEqual(once.lists);
    expect(twice.stats).toMatchObject({ added: 0, updated: 0, revAdded: 0, daysAdded: 0, lists: 0, starAdded: 0 });
  });
  it("pickCard：复习日 → 日志最后作答时间 → 作答次数 → 本机", () => {
    expect(S.pickCard(card({ t: "2026-10-01" }), card({ t: "2026-10-02" }))).toBe("b");
    expect(S.pickCard(card(), card(), 10, 20)).toBe("b");
    expect(S.pickCard(card(), card(), 30, 20)).toBe("a");
    expect(S.pickCard(card({ r: 1 }), card({ r: 3 }))).toBe("b");
    expect(S.pickCard(card(), card())).toBe("a");
  });
  it("hasProgress：有卡片或打卡才算有记录", () => {
    expect(S.hasProgress(initialState())).toBe(false);
    expect(S.hasProgress(st({ checkins: [T] }))).toBe(true);
  });
});

// ---------------------------------------------------------------- 3 加密备份 + 10 剪贴板
describe("v11 · 3 加密备份 / 10 剪贴板文本", () => {
  it("加密 → 解密还原；密文里看不到明文；口令错误报「口令不对」", async () => {
    const plain = JSON.stringify({ app: "cet4-vocab", version: 1, state: st({ cards: { abandon: card() } }) });
    const enc = await S.encryptBackup(plain, "q1f730!", 1000);
    expect(enc).not.toContain("abandon");
    const p = S.sniffBackup(enc);
    expect(p.kind).toBe("enc");
    if (p.kind !== "enc") return;
    expect(p.enc.kdf).toBe("PBKDF2-SHA256");
    expect(await S.decryptBackup(p.enc, "q1f730!")).toBe(plain);
    await expect(S.decryptBackup(p.enc, "wrong")).rejects.toThrow("口令不对");
  });
  it("每次加密用新的 salt / iv；改过的密文解不开", async () => {
    const a = JSON.parse(await S.encryptBackup("x", "pass", 1000)).enc;
    const b = JSON.parse(await S.encryptBackup("x", "pass", 1000)).enc;
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    const bad = { ...a, ct: a.ct.slice(0, -4) + (a.ct.slice(-4) === "AAAA" ? "BBBB" : "AAAA") };
    await expect(S.decryptBackup(bad, "pass")).rejects.toThrow();
  });
  it("sniffBackup：明文（含首尾空白，剪贴板常见）/ 不是 JSON / 别的应用", () => {
    const text = exportBackup();
    expect(S.sniffBackup(`\n  ${text}  \n`)).toMatchObject({ kind: "plain", text });
    expect(() => S.sniffBackup("hello")).toThrow("JSON");
    expect(() => S.sniffBackup('{"app":"other","state":{}}')).toThrow("不是四级单词打卡");
    expect(() => S.sniffBackup('{"app":"cet4-vocab","enc":{"v":1,"iter":5}}')).toThrow("加密备份格式不对");
  });
  it("parseBackup 不提交；replaceState 提交并写进 localStorage", () => {
    const before = getState();
    const next = parseBackup(JSON.stringify({ app: "cet4-vocab", state: st({ cards: { absorb: card() } }) }));
    expect(getState()).toBe(before);
    replaceState(next);
    expect(getState().cards.absorb).toBeDefined();
    expect(JSON.parse(mem.get(KEY)!).cards.absorb).toBeDefined();
  });
});

// ---------------------------------------------------------------- 6 数据体检
describe("v11 · 6 数据体检", () => {
  it("健康的数据：0 处，原样返回", () => {
    const s = st({ cards: { abandon: card() }, checkins: [T], log: { [T]: { n: 1, r: 0, ok: 1, a: 1, ms: 5 } } });
    const r = S.inspectState(s, has, T);
    expect(r.total).toBe(0);
    expect(r.fixed).toBe(s);
  });
  it("找出并修复各类问题，修完再查为 0", () => {
    const s = st({
      cards: {
        notaword: card(),
        abandon: { ...card(), e: Number.NaN, i: -3, d: "bad", st: "mastered" } as Card,
        ability: "garbage" as unknown as Card,
        able: card({ k: 1, d: T }),
        absorb: card(),
      },
      star: { zzz: 1, absorb: 1 },
      bury: { absorb: "2026-13-45", abandon: "2026-10-14" },
      lists: [{ id: "l1", name: "U1", words: ["absorb", "qqq"], at: T }],
      revlog: [
        ["absorb", 1, 2, 0, 3],
        ["xyz", 2, 2, 0, 3],
      ],
      checkins: [T, T, "yesterday"],
      log: { [T]: { n: 1, r: 0, ok: 5, a: 1, ms: 5 }, nope: { n: 1, r: 0, ok: 0, a: 0, ms: 0 } },
    });
    const r = S.inspectState(s, has, T);
    const by = Object.fromEntries(r.issues.map((i) => [i.kind, i.n]));
    expect(by).toEqual({ "unknown-card": 1, "bad-card": 3, "unknown-star": 1, "bad-bury": 1, "list-words": 1, "unknown-rev": 1, "bad-checkin": 2, "bad-log": 2 });
    expect(r.total).toBe(12);
    const f = r.fixed;
    expect(f.cards.notaword).toBeUndefined();
    expect(f.cards.ability).toBeUndefined();
    expect(f.cards.abandon).toMatchObject({ e: 2.5, i: 0, d: T, st: "learning" });
    expect(f.cards.able.d).toBe("9999-12-31");
    expect(f.cards.absorb).toBe(s.cards.absorb);
    expect(f.star).toEqual({ absorb: 1 });
    expect(f.bury).toEqual({ abandon: "2026-10-14" });
    expect(f.lists[0].words).toEqual(["absorb"]);
    expect(f.revlog).toHaveLength(1);
    expect(f.checkins).toEqual([T]);
    expect(f.log).toEqual({ [T]: { n: 1, r: 0, ok: 1, a: 1, ms: 5 } });
    expect(S.inspectState(f, has, T).total).toBe(0);
  });
  it("fixCard：间隔 ≥21 天归为已掌握；正常卡返回 null", () => {
    expect(S.fixCard(card(), T)).toBeNull();
    expect(S.fixCard(card({ i: 30, st: "review" }), T)).toMatchObject({ st: "mastered" });
    expect(S.fixCard(null, T)).toBe("drop");
  });
});

// ---------------------------------------------------------------- 5 导入词表
describe("v11 · 5 导入词表", () => {
  const resolve = S.lowerLookup(REAL.map.keys());
  it("每行一个词 / 表格只看第一列 / 去 BOM / 大小写 / 去重 / 记录词库里没有的", () => {
    const text = "\uFEFFabandon\nability, n. 能力, He has the ability to\nABSORB\tv. 吸收\nchina\nqwertyx\nabandon\n\n能力,ability";
    const r = S.parseWordText(text, resolve);
    expect(r.found).toEqual(["abandon", "ability", "absorb", "China"]);
    expect(r.missing).toEqual(["qwertyx"]);
  });
  it("一行多个词（空格分隔）都算；带连字符的词保留", () => {
    const r = S.parseWordText("abandon ability, up-to-date\nwell-known so-called absorb.", resolve);
    expect(r.found).toEqual(["abandon", "ability", "well-known", "so-called", "absorb"]);
  });
  it("文件名 → 词单名", () => {
    expect(S.listNameFromFile("unit_3-words.csv")).toBe("unit 3 words");
    expect(S.listNameFromFile("听力高频.txt")).toBe("听力高频");
  });
});

// ---------------------------------------------------------------- 9 词单链接
describe("v11 · 9 词单链接", () => {
  it("压缩编码往返；比明文 JSON 短", async () => {
    const words = REAL.list.slice(0, 300).map((w) => w.w);
    const code = await S.encodeList("Unit 3 · 听力", words);
    expect(code.startsWith("z.")).toBe(true);
    expect(code).toMatch(/^z\.[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(JSON.stringify(words).length);
    expect(await S.decodeList(code)).toEqual({ name: "Unit 3 · 听力", words });
  });
  it("不支持压缩时的 j. 格式也能读；坏链接报错；非单词丢掉、最多 1000 个", async () => {
    const j = "j." + Buffer.from(JSON.stringify({ n: "x", w: ["abandon", "<script>", "China", "abandon"] })).toString("base64url");
    expect(await S.decodeList(j)).toEqual({ name: "x", words: ["abandon", "China"] });
    await expect(S.decodeList("z.!!!")).rejects.toThrow("链接无效");
    await expect(S.decodeList("hello")).rejects.toThrow("链接无效");
    const letters = (k: number) => "w" + [k % 26, Math.floor(k / 26) % 26, Math.floor(k / 676)].map((x) => String.fromCharCode(97 + x)).join("");
    const many = await S.encodeList("big", Array.from({ length: 1200 }, (_, k) => letters(k)));
    expect((await S.decodeList(many)).words).toHaveLength(S.LINK_MAX_WORDS);
  });
  it("链接带上子路径，替换掉原来的 hash", () => {
    expect(S.listLinkUrl("https://q1f730.github.io/engq1f/#/words?tab=lists", "z.abc")).toBe("https://q1f730.github.io/engq1f/#/list-link?d=z.abc");
    expect(S.listLinkUrl("http://127.0.0.1:3015/", "j.x")).toBe("http://127.0.0.1:3015/#/list-link?d=j.x");
  });
});

// ---------------------------------------------------------------- 2 自动快照
describe("v11 · 2 自动快照（取舍规则）", () => {
  const snap = (k: number, kind: SnapMeta["kind"] = "auto"): SnapMeta => ({ id: `main|${k}`, profile: "main", day: addDays(T, -k), at: 1e12 - k * 86400000, kind, words: 10, size: 100 });
  it("今天已有自动快照就不再存；手动 / 导入前的不算", () => {
    expect(needAutoSnap([], T)).toBe(true);
    expect(needAutoSnap([snap(0)], T)).toBe(false);
    expect(needAutoSnap([snap(0, "manual"), snap(0, "import")], T)).toBe(true);
    expect(needAutoSnap([snap(1)], T)).toBe(true);
  });
  it("保留最近 7 份，删最旧的", () => {
    const list = Array.from({ length: 10 }, (_, k) => snap(k));
    expect(SNAP_KEEP).toBe(7);
    expect(snapsToPrune(list)).toEqual(["main|7", "main|8", "main|9"]);
    expect(snapsToPrune(list.slice(0, 7))).toEqual([]);
  });
});

// ---------------------------------------------------------------- 4 学习报告图 + 7 存储管理
describe("v11 · 4 学习报告图 / 7 存储管理", () => {
  it("报告数据：学过、掌握分布、连续天数、近 30 天、难词", () => {
    const s = st({
      cards: {
        abandon: card({ i: 30, st: "mastered" }),
        ability: card({ k: 1, d: "9999-12-31", st: "mastered" }),
        able: card({ l: 4 }),
        absorb: card({ l: 1 }),
        notaword: card(),
      },
      checkins: [addDays(T, -2), addDays(T, -1), T],
      log: { [T]: { n: 3, r: 4, ok: 5, a: 7, ms: 600000 }, [addDays(T, -40)]: { n: 1, r: 0, ok: 1, a: 1, ms: 60000 } },
    });
    const d = reportData(REAL, s, T, "六级");
    expect(d.total).toBe(REAL.list.length);
    expect(d.learned).toBe(4);
    expect(d.dist).toEqual({ mastered: 1, killed: 1, learning: 2, fresh: REAL.list.length - 4 });
    expect(d.streak).toBe(3);
    expect(d.checkDays).toBe(3);
    expect(d.days).toHaveLength(30);
    expect(d.days[29]).toEqual({ day: T, n: 3, r: 4 });
    expect(d.studyDays30).toBe(1);
    expect(d.minutes).toBe(11);
    expect(d.answers).toBe(8);
    expect(d.hard.map((h) => h.w)).toEqual(["able", "absorb"]);
    expect(d.profile).toBe("六级");
  });
  it("字节格式化；localStorage 按 UTF-16 算", () => {
    expect(S.fmtBytes(512)).toBe("512 B");
    expect(S.fmtBytes(1536)).toBe("1.5 KB");
    expect(S.fmtBytes(300 * 1024)).toBe("300 KB");
    expect(S.fmtBytes(3.2 * 1024 * 1024)).toBe("3.2 MB");
    expect(S.lsBytes("ab", "cdef")).toBe(12);
    expect(S.lsBytes("ab", null)).toBe(0);
  });
});

// 新卡默认值没被改动（v1 起的行为）
describe("v11 · 其他", () => {
  it("newCard 不变", () => {
    expect(newCard(T)).toEqual({ st: "learning", e: 2.5, i: 0, r: 0, l: 0, d: T, f: T, t: T });
  });
});
