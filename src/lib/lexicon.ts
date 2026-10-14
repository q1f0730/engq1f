/**
 * 13.0 · 构词与难度（纯函数、确定性、无随机数）
 *
 * 构词拆分 decompose()
 *  - 合成词：classroom = class + room（两半都是词库里的常用词，各 ≥3 个字母）
 *  - 派生词：unhappiness = un + happy + ness（前缀 / 后缀剥一层，词根要在词库里，词性要对得上；最多两层）
 *  - 拼写还原：happi → happy，mak(ing) → make，runn(ing) → run，possibil(ity) → possible
 *  词表 = 全部词条（含隐藏的基础词），所以 classroom 能拆出基础词 class / room。
 *
 * 难度分 difficulty()：0–100，五项加权
 *  长度 20% · 音节 15%（按音标数元音核）· 拼写不规则 15% · 词频 35%（wordfreq Zipf）· 构词 15%（语素个数）
 * 有效难度 effective()：组成部分都认识了（已掌握 / 复习中答对过 / 隐藏的基础词），长词的难度最多降 45%。
 * 三档：按当前词库的基础难度三分位切开（轻松 / 适中 / 挑战），「混合」不筛。
 */
import type { Word, WordIndex } from "./data";
import type { Card } from "./srs";
import type { Level } from "./level";
import { EXTRA_WORDS } from "./lexicon-extra";

/** 补充词的占位词条：只用来拆词；z = 45（常见），b = 1（默认认识） */
const extraCache = new Map<string, Word>();
function extraWord(w: string): Word | undefined {
  if (!EXTRA_WORDS.has(w)) return undefined;
  let x = extraCache.get(w);
  if (!x) extraCache.set(w, (x = { w, t: [], z: 45, b: 1 }));
  return x;
}

// ---------------------------------------------------------------- 构词

export interface Morph {
  kind: "compound" | "derived";
  /** 按出现顺序的全部片段：["un", "happy", "ness"] */
  parts: string[];
  /** 其中是词的那些（词根 / 合成词的两半）：["happy"] */
  roots: string[];
}

type Pos = "n" | "v" | "adj" | "adv";
type Lookup = (w: string) => Word | undefined;

/** 后缀 → 允许的词根词性（空 = 不限）。长的在前。 */
const SUFFIXES: [string, Pos[]][] = [
  ["ization", ["v", "n", "adj"]],
  ["ation", ["v"]],
  ["ition", ["v"]],
  ["ness", ["adj"]],
  ["ment", ["v"]],
  ["ship", ["n"]],
  ["hood", ["n"]],
  ["less", ["n", "v"]],
  ["able", ["v", "n"]],
  ["ible", ["v"]],
  ["ful", ["n", "v"]],
  ["ity", ["adj"]],
  ["ise", ["adj", "n"]],
  ["ize", ["adj", "n"]],
  ["ion", ["v"]],
  ["ism", ["n", "adj"]],
  ["ist", ["n", "adj"]],
  ["ous", ["n"]],
  ["ive", ["v"]],
  ["ial", ["n"]],
  ["al", ["n", "v"]],
  ["ly", ["adj", "n"]],
  ["er", ["v"]],
  ["or", ["v"]],
  ["en", ["adj", "n"]],
  ["ic", ["n"]],
  ["ward", ["n", "adv"]],
  ["y", ["n"]],
];

/** 前缀 → 允许的词根词性 */
const PREFIXES: [string, Pos[]][] = [
  ["under", ["v", "n", "adj"]],
  ["inter", ["v", "n", "adj"]],
  ["super", ["n", "adj"]],
  ["trans", ["v", "n"]],
  ["multi", ["n", "adj"]],
  ["micro", ["n"]],
  ["over", ["v", "n", "adj"]],
  ["anti", ["n", "adj"]],
  ["fore", ["v", "n"]],
  ["semi", ["n", "adj"]],
  ["post", ["n", "adj"]],
  ["non", ["n", "adj"]],
  ["mis", ["v", "n"]],
  ["dis", ["v", "adj", "n"]],
  ["out", ["v", "n"]],
  ["pre", ["v", "n"]],
  ["sub", ["n", "v"]],
  ["un", ["adj", "v"]],
  ["re", ["v"]],
  ["im", ["adj"]],
  ["in", ["adj"]],
  ["il", ["adj"]],
  ["ir", ["adj"]],
  ["en", ["n", "adj"]],
  ["co", ["v", "n"]],
];

/** 看着能拆、其实不是：car+pet、hat+red、mess+age… 以及剥词缀的假阳性（corner ≠ corn + er） */
export const NOT_SPLIT = new Set([
  "carpet", "hatred", "message", "passage", "damage", "manage", "target", "button", "season", "pirate", "office", "cabbage",
  "sausage", "voyage", "average", "garage", "homage", "corner", "butter", "number", "deliver", "hammer", "liver", "flower",
  "ladder", "letter", "matter", "member", "summer", "winter", "water", "silver", "danger", "finger", "ginger", "proper",
  "mister", "master", "monster", "error", "mirror", "terror", "honor", "colony", "money", "honey", "only", "early", "belly",
  "rally", "ally", "fly", "reply", "supply", "apply", "family", "holy", "ugly", "bully", "lily", "jolly", "silly", "folly",
  "belong", "began", "begin", "become", "behave", "below", "bureau", "island", "kingdom", "wisdom", "freedom", "random",
  "seldom", "reason", "season", "treason", "prison", "poison", "person", "lesson", "present", "recent", "decent", "detail",
  "retail", "repeat", "relish", "remain", "reveal", "revenue", "reside", "resign", "result", "return", "reward", "record",
  "recover", "refuse", "relate", "relax", "rely", "report", "request", "rescue", "resort", "rest", "restore", "review",
  "unite", "unit", "under", "until", "undo", "uniform", "union", "univers", "universe", "university", "unique", "universal",
  "income", "insist", "inside", "intend", "invent", "invite", "index", "infant", "inform", "inquire", "instant", "intent",
  "interest", "internal", "interval", "interview", "into", "insect", "inner", "insult", "induce", "income", "impress",
  "import", "impose", "impulse", "image", "immense", "discuss", "disease", "dismiss", "display", "dispose", "distance",
  "distant", "district", "discover", "district", "distress", "distribute", "dish", "disk", "display", "comment", "company",
  "compare", "complete", "concern", "conduct", "contain", "content", "context", "convey", "cotton", "couple", "cover",
  "coward", "cowboy", "outer", "outcome", "pretend", "present", "presence", "president", "press", "pressure", "prevent",
  "preview", "prefer", "premier", "prepare", "subject", "submit", "subtle", "suburb", "subway", "succeed", "support",
  "oversea", "overall", "enter", "entire", "energy", "engine", "enough", "ensure", "entry", "envy", "enemy", "enable",
  "female", "male", "mayor", "monitor", "motor", "sector", "factor", "doctor", "tractor", "tutor", "author", "editor",
  "visitor", "favor", "flavor", "labor", "major", "minor", "anchor", "armor", "floor", "door", "poor", "hello", "pillow",
  "shadow", "window", "widow", "yellow", "fellow", "follow", "hollow", "narrow", "arrow", "sorrow", "tomorrow", "borrow",
  "barrow", "meadow", "bonus", "focus", "virus", "campus", "census", "chorus", "minus", "plus", "status", "genius", "nervous",
  "bias", "atlas", "canvas", "ideal", "metal", "petal", "royal", "rival", "signal", "total", "animal", "capital", "festival",
  "hospital", "interval", "journal", "local", "moral", "normal", "oval", "pedal", "plural", "rural", "spiral", "trial",
  "vital", "dental", "mental", "rental", "fatal", "final", "legal", "loyal", "medal", "naval", "neutral", "global",
  "rascal", "scandal", "sandal", "canal", "cereal", "mineral", "liberal", "general", "federal", "funeral", "several",
  "literal", "natural", "material", "official", "special", "social", "partial", "initial", "essential", "potential",
  "eagle", "table", "cable", "fable", "noble", "bible", "fiction", "lion", "onion", "opinion", "region", "religion",
  "million", "billion", "champion", "fashion", "cushion", "nation", "station", "ration", "action", "fraction", "motion",
  "notion", "potion", "lotion", "portion", "caution", "question", "mention", "pension", "tension", "mansion", "passion",
  "mission", "session", "cousin", "basin", "sharpen", "garden", "golden", "kitten", "mitten", "often", "linen", "token",
  "chicken", "kitchen", "women", "lemon", "listen", "citizen", "dozen", "frozen", "heaven", "seven", "eleven", "even",
  "oven", "raven", "haven", "open", "happen", "children", "burden", "sudden", "hidden", "golden", "warden", "maiden",
  "music", "panic", "picnic", "magic", "logic", "topic", "tonic", "tropic", "traffic", "public", "comic", "basic",
  "fabric", "garlic", "plastic", "elastic", "republic", "toward", "towards", "award", "reward", "forward", "steward",
  "body", "lady", "baby", "city", "copy", "duty", "army", "party", "pity", "story", "study", "worry", "hurry", "carry",
  "marry", "berry", "cherry", "jury", "fury", "glory", "theory", "history", "victory", "memory", "factory", "pony", "puppy",
  "already", "ready", "steady", "heavy", "every", "very", "candy", "handy", "sandy", "dirty", "empty", "forty", "fifty",
  "sixty", "twenty", "thirty", "eighty", "ninety", "seventy", "plenty", "penny", "nanny", "ivory", "jelly", "bloody",
  "beauty", "county", "mighty", "treaty", "safety", "society", "variety", "anxiety", "piety", "property", "poverty",
  "liberty", "majesty", "modesty", "honesty", "dynasty", "faculty", "difficulty", "loyalty", "royalty", "penalty",
  "cruelty", "novelty", "specialty", "certainty", "uncertainty", "sovereignty", "warranty", "ally", "tally",
  "intimate", "inmate", "invest", "infer", "insert", "intact", "invade", "invoice", "income", "ingredient",
  "imply", "impact", "impair", "implement", "export", "expose", "express", "extend", "extent", "exist", "expert", "explain",
  "discard", "disguise", "disgust", "dismay", "dispute", "dissolve", "comfort", "commit", "commerce", "common", "compose",
  "compound", "concert", "concrete", "confirm", "conform", "connect", "consent", "consist", "constant", "consult", "contact",
  "contest", "contract", "contrast", "control", "convert", "convict", "convince", "costly", "courage", "covert", "colon",
  // 13.0 逐条看过的假拆分（合成：bar+gain、gene+rate…；派生：both+er、re+pair、pre+serve…）
  "bargain", "capable", "rearrange", "generate", "alternative", "endanger", "legend", "beginner", "betray", "generally", "labour",
  "moderate", "nowhere", "portable", "developmental", "bother", "banner", "brandy", "career", "cordial", "former", "gravity",
  "intense", "intensity", "multiply", "policy", "preface", "preposition", "relativity", "release", "remark", "repair", "resolve",
  "reserve", "reservation", "preserve", "preservation", "refine", "retreat", "retire", "retirement", "storey", "supervision",
  "tender", "transparent", "unless", "tradition", "charter", "classic", "classical", "encounter", "restrain", "counter",
  "considerable", "considerably", "organism", "organic", "metric", "canteen", "decline", "replace", "incline", "alphabet",
  "despair", "donkey", "electron", "minimum", "thorough", "summary", "thinking", "handsome",
]);

/** 合成词里太短、太虚的半边（office ≠ off + ice，pirate ≠ pir + ate） */
const WEAK_HALF = new Set(["age", "ate", "ion", "son", "pet", "red", "ice", "get", "ant", "ear", "tar", "car", "hat", "mess",
  "pass", "dam", "man", "but", "ton", "sea", "pi", "lit", "tin", "pin", "con", "dis", "ion", "ism", "ive", "ory", "ary", "ade",
  "ally", "tic", "ure", "ant", "ent", "ence", "ance", "ess", "let", "lee", "nee", "tee", "her", "his", "him", "its", "the", "and",
  "are", "was", "has", "had", "not", "for", "nor", "per", "via", "yet", "out", "off", "own", "one", "any", "all", "few"]);

function posesOf(w: Word): Set<Pos> {
  const out = new Set<Pos>();
  for (const [pos] of w.t) {
    for (const p0 of pos.toLowerCase().match(/[a-z]+/g) ?? []) {
      const p = p0 === "vt" || p0 === "vi" ? "v" : p0 === "a" ? "adj" : p0 === "ad" ? "adv" : p0;
      if (p === "n" || p === "v" || p === "adj" || p === "adv") out.add(p);
    }
  }
  return out;
}

const okPos = (w: Word, allow: Pos[]) => {
  if (!allow.length) return true;
  const ps = posesOf(w);
  return !ps.size || allow.some((p) => ps.has(p));
};

/** 剥掉后缀后，词根可能的几种写法 */
function rootCandidates(stem: string, suffix: string): string[] {
  const out = [stem];
  if (stem.endsWith("i")) out.push(stem.slice(0, -1) + "y"); // happi → happy
  out.push(stem + "e"); // us(able) → use
  const last = stem[stem.length - 1];
  if (stem.length >= 4 && last === stem[stem.length - 2] && !"aeiouyls".includes(last)) out.push(stem.slice(0, -1)); // runn → run
  if (suffix === "ity" && stem.endsWith("il")) out.push(stem.slice(0, -2) + "le"); // possibil → possible
  if (suffix === "ity" && stem.endsWith("al")) out.push(stem); // reality → real(ity)? keep as is
  if (suffix === "ly" && stem.endsWith("ab")) out.push(stem + "le"); // comfortab(ly) → comfortable
  if (suffix === "ly" && stem.endsWith("ib")) out.push(stem + "le");
  if ((suffix === "ation" || suffix === "ition") && stem.endsWith("ic")) out.push(stem.slice(0, -2) + "y"); // classific(ation) → classify
  if (suffix === "ion" && stem.endsWith("ss")) out.push(stem); // discuss(ion)
  if (suffix === "ion" && stem.endsWith("t")) out.push(stem + "e"); // creat(ion) → create
  return [...new Set(out)];
}

const isWordLike = (w: string) => /^[a-z]+$/.test(w);

const cache = new WeakMap<object, Map<string, Morph | null>>();

/**
 * 拆一个词；lookup 查词库（含基础词）。拆不开 / 在黑名单里返回 null。
 * 结果按 lookup 缓存（同一个索引只算一次）。
 */
export function decompose(word: string, lookup: Lookup | WordIndex, depth = 0): Morph | null {
  const base: Lookup = typeof lookup === "function" ? lookup : (w) => lookup.map.get(w);
  const look: Lookup = (w) => base(w) ?? extraWord(w);
  const key = typeof lookup === "function" ? lookup : lookup.map;
  let memo = cache.get(key);
  if (!memo) cache.set(key, (memo = new Map()));
  const w = word.toLowerCase();
  const id = `${depth}|${w}`;
  if (memo.has(id)) return memo.get(id)!;
  const res = split(w, look, depth);
  memo.set(id, res);
  return res;
}

function split(w: string, look: Lookup, depth: number): Morph | null {
  if (!isWordLike(w) || w.length < 6 || NOT_SPLIT.has(w) || depth > 2) return null;
  const self = look(w);
  // 1) 合成词：两半都是常用词（Zipf ≥ 3.5）、各 ≥3 个字母、都不是虚半边；取最均衡的切法
  let best: Morph | null = null;
  let bestMin = 0;
  for (let k = 3; k <= w.length - 3; k++) {
    const a = w.slice(0, k);
    const b = w.slice(k);
    if (WEAK_HALF.has(a) || WEAK_HALF.has(b)) continue;
    const wa = look(a);
    const wb = look(b);
    if (!wa || !wb || (wa.z ?? 0) < 35 || (wb.z ?? 0) < 35) continue;
    const m = Math.min(a.length, b.length);
    if (m > bestMin) {
      bestMin = m;
      best = { kind: "compound", parts: [a, b], roots: [a, b] };
    }
  }
  if (best) return best;
  // 2) 后缀
  for (const [suf, allow] of SUFFIXES) {
    if (!w.endsWith(suf) || w.length - suf.length < 3) continue;
    const stem = w.slice(0, -suf.length);
    for (const r of rootCandidates(stem, suf)) {
      if (r === w || r.length < 3) continue;
      const rw = look(r);
      if (!rw || !okPos(rw, allow)) continue;
      // 词性也得对：-ly 出副词、-ness/-ity/-ment/-tion 出名词
      if (self && !suffixPosOk(self, suf)) continue;
      const inner = decompose(r, look, depth + 1);
      if (inner && inner.kind === "derived") return { kind: "derived", parts: [...inner.parts, suf], roots: inner.roots };
      return { kind: "derived", parts: [r, suf], roots: [r] };
    }
  }
  // 3) 前缀
  for (const [pre, allow] of PREFIXES) {
    if (!w.startsWith(pre) || w.length - pre.length < 4) continue;
    const r = w.slice(pre.length);
    const rw = look(r);
    if (!rw || NOT_SPLIT.has(r) || (rw.z ?? 0) < 30) continue; // 词根本身得是个常见词
    const inner = decompose(r, look, depth + 1);
    // 词性看最里面的词根：un + happiness 里 happiness 是名词，但 happy 是形容词 → un + happy + ness
    const rootOk = okPos(rw, allow) || (!!inner && inner.kind === "derived" && inner.roots.some((x) => { const xw = look(x); return !!xw && okPos(xw, allow); }));
    if (!rootOk) continue;
    if (inner && inner.kind === "derived") return { kind: "derived", parts: [pre, ...inner.parts], roots: inner.roots };
    return { kind: "derived", parts: [pre, r], roots: [r] };
  }
  return null;
}

const SUFFIX_POS: Record<string, Pos> = {
  ness: "n", ment: "n", ship: "n", hood: "n", ity: "n", ion: "n", ation: "n", ition: "n", ization: "n", ism: "n", ist: "n",
  er: "n", or: "n", ly: "adv", less: "adj", able: "adj", ible: "adj", ful: "adj", ous: "adj", ive: "adj", al: "adj",
  ial: "adj", ic: "adj", ize: "v", ise: "v", en: "v",
};

function suffixPosOk(self: Word, suf: string): boolean {
  const want = SUFFIX_POS[suf];
  if (!want) return true;
  const ps = posesOf(self);
  if (!ps.size) return true;
  if (suf === "ly") return ps.has("adv") || ps.has("adj"); // friendly / weekly 是形容词
  if (suf === "al") return ps.has("adj") || ps.has("n"); // arrival / approval
  if (suf === "en") return ps.has("v") || ps.has("adj"); // golden 已在黑名单
  return ps.has(want);
}

/** 卡片上的一句话：「由 class + room 组成」 */
export function morphLabel(m: Morph | null): string {
  return m ? `由 ${m.parts.join(" + ")} 组成` : "";
}

// ---------------------------------------------------------------- 音节 / 拼写

const IPA_VOWEL = /(aɪ|aʊ|eɪ|oʊ|əʊ|ɔɪ|ɪə|eə|ʊə|aɪə|aʊə|[aeiouyæɑɒɔəɚɝɜɛɪʊʌɐ])[ːˑ]?/g;

/** 音节数：有音标按元音核数，没有按拼写的元音组（词尾不发音的 e 不算） */
export function syllables(word: Word | string): number {
  const ipa = typeof word === "string" ? "" : (word.p?.[0] || word.p?.[1] || "").replace(/[ˈˌ'.\/()\s]/g, "");
  if (ipa) {
    const n = (ipa.match(IPA_VOWEL) ?? []).length;
    if (n) return n;
  }
  const w = (typeof word === "string" ? word : word.w).toLowerCase().replace(/[^a-z]/g, "");
  let n = (w.match(/[aeiouy]+/g) ?? []).length;
  if (/[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w) && n > 1) n--;
  return Math.max(1, n);
}

/** 读音和拼写对不上的字母组合（silent letters、多种读法） */
const IRREGULAR = ["ough", "augh", "eigh", "gh", "kn", "wr", "mb", "ps", "pn", "rh", "eau", "ui", "ei", "ph", "que", "gue", "sc", "dge", "tch", "ae", "oe", "ious", "eous", "cious", "tion", "sion", "ch", "y"];

/** 0–1：不规则组合个数 + 字母数比音素数多出来的部分 */
export function spellIrregularity(word: Word): number {
  const w = word.w.toLowerCase().replace(/[^a-z]/g, "");
  let hits = 0;
  for (const g of IRREGULAR) {
    let at = w.indexOf(g);
    while (at >= 0) {
      hits += g === "y" || g === "ch" || g === "tion" || g === "sion" ? 0.5 : 1;
      at = w.indexOf(g, at + g.length);
    }
  }
  if (/(.)\1/.test(w)) hits += 0.5; // 双写辅音（accommodate）
  const ipa = (word.p?.[0] || word.p?.[1] || "").replace(/[ˈˌ'.\/()\sːˑ]/g, "");
  let extra = 0;
  if (ipa) {
    const phonemes = [...ipa.replace(/(aɪ|aʊ|eɪ|oʊ|əʊ|ɔɪ|tʃ|dʒ)/g, "X")].length;
    extra = Math.max(0, w.length / Math.max(1, phonemes) - 1.15);
  }
  return clamp01(hits * 0.18 + extra * 0.8);
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ---------------------------------------------------------------- 难度

export interface Difficulty {
  /** 0–100 基础难度 */
  score: number;
  /** 各项 0–1（调参和测试用） */
  len: number;
  syl: number;
  spell: number;
  freq: number;
  morph: number;
}

export const WEIGHTS = { len: 0.2, syl: 0.15, spell: 0.15, freq: 0.35, morph: 0.15 } as const;

export function difficulty(word: Word, lookup?: Lookup | WordIndex): Difficulty {
  const letters = word.w.replace(/[^A-Za-z]/g, "").length;
  const len = clamp01((letters - 3) / 11);
  const syl = clamp01((syllables(word) - 1) / 4);
  const spell = spellIrregularity(word);
  const zipf = (word.z ?? 0) / 10;
  const freq = zipf > 0 ? clamp01((6.5 - zipf) / 4.5) : 1;
  const m = lookup ? decompose(word.w, lookup) : null;
  const morph = m ? clamp01((m.parts.length - 1) / 3) : 0;
  const s = WEIGHTS.len * len + WEIGHTS.syl * syl + WEIGHTS.spell * spell + WEIGHTS.freq * freq + WEIGHTS.morph * morph;
  return { score: Math.round(s * 1000) / 10, len, syl, spell, freq, morph };
}

/** 「认识」这个词：斩了 / 已掌握 / 进入复习且答对过；隐藏的基础词默认认识（推断：小学初中就学过） */
export function knows(w: string, cards: Record<string, Card>, lookup: Lookup): boolean {
  const c = cards[w];
  if (c) return !!c.k || c.st === "mastered" || (c.st === "review" && c.r >= 1);
  return !!lookup(w)?.b || EXTRA_WORDS.has(w);
}

/** 组成部分认识的比例最多让难度降 45% */
export const KNOWN_DISCOUNT = 0.45;

export function effective(word: Word, index: WordIndex, cards: Record<string, Card>): { score: number; base: number; morph: Morph | null; known: string[] } {
  const look: Lookup = (w) => index.map.get(w);
  const base = baseScore(index, word);
  const m = decompose(word.w, index);
  if (!m) return { score: base, base, morph: null, known: [] };
  const known = m.roots.filter((r) => knows(r, cards, look));
  const frac = m.roots.length ? known.length / m.roots.length : 0;
  return { score: Math.round(base * (1 - KNOWN_DISCOUNT * frac) * 10) / 10, base, morph: m, known };
}

// ---------------------------------------------------------------- 档位

export { LEVELS, LEVEL_CN, LEVEL_HINT, type Level } from "./level";

interface Tiers {
  scores: Map<string, number>;
  t1: number;
  t2: number;
}
const tierCache = new WeakMap<WordIndex, Tiers>();

function tiers(index: WordIndex): Tiers {
  let t = tierCache.get(index);
  if (t) return t;
  const scores = new Map<string, number>();
  for (const w of index.map.values()) scores.set(w.w, difficulty(w, index).score);
  const sorted = index.list.map((w) => scores.get(w.w)!).sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  t = { scores, t1: q(1 / 3), t2: q(2 / 3) };
  tierCache.set(index, t);
  return t;
}

export function baseScore(index: WordIndex, word: Word): number {
  return tiers(index).scores.get(word.w) ?? difficulty(word, index).score;
}

/** 三分位阈值（当前词库） */
export function thresholds(index: WordIndex): [number, number] {
  const t = tiers(index);
  return [t.t1, t.t2];
}

export function levelOf(score: number, index: WordIndex): Exclude<Level, "mix"> {
  const [t1, t2] = thresholds(index);
  return score < t1 ? "easy" : score < t2 ? "mid" : "hard";
}

const FALLBACK: Record<Exclude<Level, "mix">, Exclude<Level, "mix">[]> = {
  easy: ["easy", "mid", "hard"],
  mid: ["mid", "easy", "hard"],
  hard: ["hard", "mid", "easy"],
};

/**
 * 从还没学的词（已经是乱序）里挑 n 个：先挑这一档的，不够再从相邻的档补。
 * 档位按「有效难度」：组成部分都认识的长词会掉进更轻松的档。顺序保持原来的乱序。
 */
export function pickByLevel(index: WordIndex, cards: Record<string, Card>, left: string[], level: Level, n: number): string[] {
  if (level === "mix" || n <= 0) return left.slice(0, n);
  const buckets: Record<string, string[]> = { easy: [], mid: [], hard: [] };
  // 只看前面一段：足够挑出 n 个，又不用每组都算完全部剩余的词
  const span = Math.min(left.length, Math.max(n * 30, 300));
  for (let i = 0; i < span; i++) {
    const w = index.map.get(left[i]);
    if (!w) continue;
    buckets[levelOf(effective(w, index, cards).score, index)].push(w.w);
  }
  const out: string[] = [];
  for (const b of FALLBACK[level]) {
    for (const w of buckets[b]) {
      if (out.length >= n) break;
      out.push(w);
    }
  }
  if (out.length < n) for (const w of left) if (out.length < n && !out.includes(w)) out.push(w);
  // 按在乱序里的先后排回去
  const pos = new Map(left.map((w, i) => [w, i]));
  return out.sort((a, b) => pos.get(a)! - pos.get(b)!);
}
