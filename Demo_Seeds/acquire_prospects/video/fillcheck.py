#!/usr/bin/env python3
"""Flag voice clips with fillers (um, uh), stutters or improvised words, using local whisper.cpp.
   python3 fillcheck.py <video-dir> [--retake N]   with --retake, deletes flagged clips and re-voices them, up to N rounds."""
import json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.environ.get("WHISPER_MODEL", os.path.expanduser("~/Downloads/ggml-small.en.bin"))
FILLERS = {"um", "umm", "uh", "uhh", "er", "erm", "ah", "hmm", "mm", "yeah", "oh"}
norm = lambda s: re.sub(r"[^a-z' ]", " ", s.lower().replace("—", " ")).split()
pairs = lambda w: {(w[i - 1], w[i]) for i in range(1, len(w)) if w[i] == w[i - 1]}

def check(d):
    bad, heard_all = [], {}
    for c in json.load(open(f"{d}/clips.json")):
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", c["file"], "-ar", "16000", "-ac", "1", "/tmp/fc.wav"], check=True)
        out = subprocess.run(["whisper-cli", "-m", MODEL, "-f", "/tmp/fc.wav", "-np", "-nt", "--prompt", "Um, uh, I, I, I mean, you know, like, so, er."], capture_output=True, text=True).stdout
        heard_all[c["id"]] = " ".join(out.split())
        heard, said = norm(out), norm(c["text"])
        why = [w for w in heard if w in FILLERS and w not in said]
        why += [f"{a} {b}" for a, b in pairs(heard) - pairs(said)]
        why += [f"+{w}" for w in ("know", "like", "mean") if heard.count(w) > said.count(w)]
        print(("FLAG" if why else "OK  "), c["id"], f"{c['ms'] / 1000:.1f}s", " ".join(why))
        if why: bad.append(c)
    # Transcripts for the naturalness judge (Laya: natural / rushed / choppy per segment).
    json.dump(heard_all, open(f"{d}/transcripts.json", "w"), indent=2)
    return bad

d = os.path.abspath(sys.argv[1])
rounds = int(sys.argv[sys.argv.index("--retake") + 1]) if "--retake" in sys.argv else 0
bad = check(d)
for r in range(rounds):
    if not bad: break
    print(f"-- retake round {r + 1}: {' '.join(c['id'] for c in bad)}")
    for c in bad:
        os.remove(c["file"])
        if os.path.exists(c["file"] + ".id"): os.remove(c["file"] + ".id")
    subprocess.run(["node", f"{HERE}/voice.mjs", "clips", "--track", f"{HERE}/TALK_TRACK_VIDEO.md", "--video-dir", d], check=True, capture_output=True)
    bad = check(d)
print("clean" if not bad else f"still flagged: {' '.join(c['id'] for c in bad)}")
sys.exit(1 if bad else 0)
