#!/usr/bin/env python3
"""US-English gate for demo videos: flag British spellings in what the viewer reads or hears.

Usage: usspell.py <file-or-dir> [...]   (talk tracks, transcripts.json, app source dirs)
Exit 1 if anything is flagged. In code files only string literals and JSX text are
checked (comments, identifiers and aria-labelledby never reach the screen). A word list, not a model: the check must be exact and repeatable.
"""
import json, os, re, sys

# British -> US. Stems match inflections (behaviour, behaviours, behavioural ...).
STEMS = {
    "behaviour": "behavior", "colour": "color", "favour": "favor", "honour": "honor", "labour": "labor",
    "neighbour": "neighbor", "harbour": "harbor", "rumour": "rumor", "humour": "humor", "flavour": "flavor",
    "endeavour": "endeavor", "savour": "savor", "vapour": "vapor", "armour": "armor", "parlour": "parlor",
    "organis": "organiz", "recognis": "recogniz", "realis": "realiz", "prioritis": "prioritiz", "optimis": "optimiz",
    "authoris": "authoriz", "minimis": "minimiz", "maximis": "maximiz", "summaris": "summariz", "utilis": "utiliz",
    "customis": "customiz", "standardis": "standardiz", "finalis": "finaliz", "categoris": "categoriz",
    "personalis": "personaliz", "visualis": "visualiz", "normalis": "normaliz", "apologis": "apologiz",
    "capitalis": "capitaliz", "centralis": "centraliz", "digitalis": "digitaliz", "modernis": "moderniz",
    "synchronis": "synchroniz", "monetis": "monetiz", "itemis": "itemiz", "criticis": "criticiz",
    "analys": "analyz", "paralys": "paralyz", "catalys": "catalyz",
    "labelled": "labeled", "labelling": "labeling", "cancelled": "canceled", "cancelling": "canceling",
    "travelled": "traveled", "travelling": "traveling", "modelled": "modeled", "modelling": "modeling",
    "signalled": "signaled", "signalling": "signaling", "totalled": "totaled", "fuelled": "fueled",
    "centre": "center", "metre": "meter", "litre": "liter", "fibre": "fiber", "theatre": "theater",
    "licence": "license", "defence": "defense", "offence": "offense", "cheque": "check", "programme": "program",
    "catalogue": "catalog", "dialogue": "dialog", "enrolment": "enrollment", "fulfilment": "fulfillment",
    "judgement": "judgment", "ageing": "aging", "aluminium": "aluminum", "grey": "gray", "tyre": "tire",
    "whilst": "while", "amongst": "among", "learnt": "learned", "spelt": "spelled",
    "cosy": "cozy", "mum": "mom", "postcode": "ZIP code", "fortnight": "two weeks",
}
# `analys` must not hit "analysis"/"analyst" (US spellings too).
EXCEPT = re.compile(r"^(analys(is|es|t|ts)|catalys(is|t|ts)|paralysis)$", re.I)
WORD = re.compile(r"[A-Za-z]+")
# Only real inflections, so camelCase like "learnTile" never matches "learnt".
SUFFIXES = {"", "s", "e", "es", "ed", "er", "ers", "ing", "ings", "al", "ally", "ly", "ation", "ations", "able", "ment", "ments"}
CODE = {".ts", ".tsx", ".js", ".mjs", ".jsx", ".py"}
# In code, only strings and JSX text can reach the screen or the model; identifiers never do.
VISIBLE = re.compile(r'"(?:[^"\\\n]|\\.)*"|\'(?:[^\'\\\n]|\\.)*\'|`[^`\n]*`|>[^<>{}\n]+<')
SKIP_LINE = re.compile(r"^\s*(//|\*|/\*|#!)")
EXTS = {".md", ".ts", ".tsx", ".js", ".mjs", ".jsx", ".json", ".txt", ".html", ".srt", ".py", ".yaml", ".yml"}
SKIP_DIRS = {"node_modules", ".next", ".git", "dist", "build", "video-out", "__pycache__"}


def hits(text):
    for m in WORD.finditer(text):
        w = m.group(0)
        lw = w.lower()
        if EXCEPT.match(lw):
            continue
        for brit, us in STEMS.items():
            if lw.startswith(brit) and lw[len(brit):] in SUFFIXES:
                yield w, us + lw[len(brit):]
                break


def scan_text(path, text):
    out = []
    code = os.path.splitext(path)[1] in CODE
    for n, line in enumerate(text.splitlines(), 1):
        if SKIP_LINE.match(line):
            continue
        if code:
            line = " ".join(VISIBLE.findall(line))
        clean = re.sub(r"aria-labelledby|labelledby", "", line)
        for w, us in hits(clean):
            out.append(f"{path}:{n}: {w} -> {us}")
    return out


def scan_file(path):
    if os.path.basename(path) == "transcripts.json":
        data = json.load(open(path))
        items = data.items() if isinstance(data, dict) else enumerate(data)
        return [f"{path}:{k}: {w} -> {us}" for k, t in items for w, us in hits(str(t))]
    if os.path.splitext(path)[1] not in EXTS or ".bak" in path:
        return []
    try:
        return scan_text(path, open(path, encoding="utf-8").read())
    except UnicodeDecodeError:
        return []


def main(args):
    if not args:
        print(__doc__)
        return 2
    found = []
    for a in args:
        if os.path.isdir(a):
            for root, dirs, files in os.walk(a):
                dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
                for f in files:
                    found += scan_file(os.path.join(root, f))
        else:
            found += scan_file(a)
    for f in found:
        print(f)
    print(f"{'FLAG' if found else 'OK  '} {len(found)} British spelling(s)")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
