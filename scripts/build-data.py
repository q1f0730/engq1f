#!/usr/bin/env python3
"""Build public/data/cet4.json for 四级单词打卡.

Sources
- KyleBing/english-vocabulary json/3-CET4-顺序.json (BSD-3): words, meanings, phrases
- qwerty-learner dicts (../qwerty/public/dicts/*.json): usphone / ukphone, CET4_T = core list

Output: compact JSON array, one entry per word:
  {"w": word, "p": [us, uk], "t": [[pos, meaning], ...] (merged by POS, <=3 lines), "ph": [[phrase, cn], ...], "c": 1}
  "o": 1 if the word is in Oxford 3000 (basic tier, used by the vocab test)
  p / ph / c / o are omitted when empty.

Usage: python3 scripts/build-data.py [--src /tmp/cet4k.json]
"""
import glob
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DICTS = os.path.join(ROOT, "..", "qwerty", "public", "dicts")
URL = "https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/json/3-CET4-%E9%A1%BA%E5%BA%8F.json"
OUT = os.path.join(ROOT, "public", "data", "cet4.json")
MAX_PHRASES = 6


def load_source():
    src = "/tmp/cet4k.json"
    if "--src" in sys.argv:
        src = sys.argv[sys.argv.index("--src") + 1]
    if not os.path.exists(src):
        print("downloading", URL)
        urllib.request.urlretrieve(URL, src)
    with open(src, encoding="utf-8") as f:
        return json.load(f)


def clean_phone(s):
    if not s:
        return ""
    s = str(s).strip().strip("/[]").strip()
    # several variants "a; b; c" -> keep the first
    s = re.split(r"[;；,]", s)[0].strip()
    return s


def load_phones():
    phones = {}
    core = set()
    basic = set()
    # CET4_T first so CET-4 entries win, then others fill gaps
    files = sorted(glob.glob(os.path.join(DICTS, "*.json")), key=lambda p: (0 if p.endswith("CET4_T.json") else 1, p))
    for fp in files:
        try:
            with open(fp, encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:  # noqa
            print("skip", fp, e)
            continue
        is_core = fp.endswith("CET4_T.json")
        is_basic = fp.endswith("Oxford3000.json")
        for e in data:
            name = str(e.get("name", "")).strip()
            if not name:
                continue
            k = name.lower()
            if is_core:
                core.add(k)
            if is_basic:
                basic.add(k)
            us, uk = clean_phone(e.get("usphone")), clean_phone(e.get("ukphone"))
            if not (us or uk):
                continue
            cur = phones.get(k)
            if cur is None:
                phones[k] = [us, uk]
            else:
                if not cur[0] and us:
                    cur[0] = us
                if not cur[1] and uk:
                    cur[1] = uk
    return phones, core, basic


def clean_text(s):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    # drop stray spaces around Chinese punctuation
    s = re.sub(r"\s*([，；。、（）…])\s*", r"\1", s)
    s = re.sub(r"…{2,}", "…", s)
    return s

MAX_LINES = 3
MAX_ATOMS = 10  # cap sub-senses per line so long entries stay readable
POS_ALIAS = {"a": "adj", "ad": "adv", "interjection": "int", "v.": "v"}
VERB = {"v", "vt", "vi"}
TRUNCATED = 0


def norm_pos(raw):
    """'n & v' -> 'n&v'; 'a' -> 'adj'; 'vt&vi' -> 'v'; duplicates removed, order kept."""
    raw = re.sub(r"\(.*?\)", "", str(raw or "").lower())
    toks = [POS_ALIAS.get(t, t) for t in re.findall(r"[a-z]+", raw)]
    out = []
    for t in toks:
        if t not in out:
            out.append(t)
    if set(out) == {"vt", "vi"}:
        out = ["v"]
    return "&".join(out)


def split_top(s, seps):
    """Split on any char in seps, ignoring separators inside （）/()."""
    parts, cur, depth = [], "", 0
    for ch in s:
        if ch in "（(":
            depth += 1
        elif ch in "）)":
            depth = max(0, depth - 1)
        if ch in seps and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return [x.strip() for x in parts if x.strip()]


def sense_key(atom):
    k = re.sub(r"（[^）]*）|\([^)]*\)", "", atom)
    k = k.replace("帐", "账")
    return re.sub(r"[\s…\.。,，；;、\-]", "", k) or atom


class Line:
    """One POS line: groups (split on ；;) of atoms (split on ，,), atoms deduped globally."""

    def __init__(self, pos):
        self.pos, self.groups, self.keys = pos, [], {}

    def add(self, text, seen):
        for g in split_top(text, "；;"):
            grp, attached = [], False
            for a in split_top(g, "，,"):
                k = sense_key(a)
                if k in seen and not grp and not attached and seen[k][0] in self.groups:
                    # "抽象的，抽象派的" after "抽象的": extend the existing group instead of a new line part
                    grp, attached = seen[k][0], True
                    continue
                if k in seen:
                    # keep the more informative variant, e.g. 吸收 -> 吸收（液体、气体等）
                    gi, ai = seen[k]
                    if gi is not None and len(a) > len(gi[ai]):
                        gi[ai] = a
                    continue
                grp.append(a)
                seen[k] = (grp, len(grp) - 1)
            if grp and not attached:
                self.groups.append(grp)

    def atoms(self):
        return [a for g in self.groups for a in g]

    def text(self):
        out, n = [], 0
        for g in self.groups:
            if n >= MAX_ATOMS:
                break
            g = g[: MAX_ATOMS - n]
            n += len(g)
            out.append("，".join(g))
        return "；".join(out)


def merge_meanings(pairs):
    """pairs: [(pos, text)] in source order -> [[pos, text]] merged by part of speech."""
    by = {}
    order = []
    for pos, txt in pairs:
        p = norm_pos(pos)
        if p not in by:
            by[p] = []
            order.append(p)
        by[p].append(txt)
    # verbs: v / vt / vi. Keep vt and vi apart only when vi adds senses vt does not have.
    verbs = [p for p in order if p in VERB]
    groups = []  # (label, [texts])
    if verbs:
        T = by.get("vt", []) + by.get("v", [])
        I = by.get("vi", [])
        keys_t = {sense_key(a) for t in T for g in split_top(t, "；;") for a in split_top(g, "，,")}
        keys_i = {sense_key(a) for t in I for g in split_top(t, "；;") for a in split_top(g, "，,")}
        if "vt" in by and I and (keys_i - keys_t):
            vlabels = {"vt": by.get("v", []) + by["vt"], "vi": I}
        elif set(verbs) == {"vt"} or set(verbs) == {"vi"}:
            vlabels = {verbs[0]: by[verbs[0]]}
        else:
            vlabels = {"v": [t for p in order if p in VERB for t in by[p]]}
    lines, done_verbs = [], False
    seen_by_label = {}
    for p in order:
        if p in VERB:
            if done_verbs:
                continue
            done_verbs = True
            for lab, texts in vlabels.items():
                ln = Line(lab)
                seen = seen_by_label.setdefault(lab, {})
                for t in texts:
                    ln.add(t, seen)
                lines.append(ln)
            continue
        ln = Line(p)
        seen = {}
        for t in by[p]:
            ln.add(t, seen)
        lines.append(ln)
    # vi line: drop senses already on the vt line
    labs = {l.pos: l for l in lines}
    if "vt" in labs and "vi" in labs:
        kt = {sense_key(a) for a in labs["vt"].atoms()}
        labs["vi"].groups = [g2 for g2 in ([a for a in g if sense_key(a) not in kt] for g in labs["vi"].groups) if g2]
    # combined tags ("n&v", "vi&n") mostly repeat the single-POS lines: keep only what they add
    single = {sense_key(a) for l in lines if "&" not in l.pos for a in l.atoms()}
    for l in lines:
        if "&" in l.pos:
            l.groups = [g2 for g2 in ([a for a in g if sense_key(a) not in single] for g in l.groups) if g2]
    lines.sort(key=lambda l: "&" in l.pos)  # stable: single-POS lines first, combined tags last
    res = [[l.pos, l.text()] for l in lines if l.text()]
    global TRUNCATED
    if len(res) > MAX_LINES:
        TRUNCATED += 1
    return res[:MAX_LINES]



def main():
    src = load_source()
    phones, core, basic = load_phones()
    # The source lists 7508 entries but many words appear 2-3 times (one per
    # source book); merge them: union of meanings (deduped) and phrases.
    merged, order = {}, []
    for e in src:
        w = clean_text(e.get("word"))
        if not w:
            continue
        k = w.lower()
        if k not in merged:
            merged[k] = {"w": w, "raw": [], "ph": [], "pk": set()}
            order.append(k)
        m = merged[k]
        for tr in e.get("translations") or []:
            txt = clean_text(tr.get("translation"))
            if txt:
                m["raw"].append((clean_text(tr.get("type")), txt))
        for x in e.get("phrases") or []:
            a, b = clean_text(x.get("phrase")), clean_text(x.get("translation"))
            if a and b and a.lower() not in m["pk"]:
                m["pk"].add(a.lower())
                m["ph"].append([a, b])
    out = []
    with_phone = core_count = 0
    for k in order:
        m = merged[k]
        m["t"] = merge_meanings(m["raw"])
        if not m["t"]:
            continue
        item = {"w": m["w"]}
        p = phones.get(k)
        if p and (p[0] or p[1]):
            item["p"] = [p[0] or p[1], p[1] or p[0]]
            with_phone += 1
        item["t"] = m["t"]
        if m["ph"]:
            item["ph"] = m["ph"][:MAX_PHRASES]
        if k in core:
            item["c"] = 1
            core_count += 1
        if k in basic:
            item["o"] = 1  # Oxford 3000 basic word: used as the easiest tier in the vocab test
        out.append(item)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(OUT)
    print(f"source_entries={len(src)} words={len(out)} core={core_count} phonetic={with_phone} ({with_phone / len(out) * 100:.1f}%) size={size / 1024:.0f}KB pos_lines_dropped_words={TRUNCATED}")


if __name__ == "__main__":
    main()
