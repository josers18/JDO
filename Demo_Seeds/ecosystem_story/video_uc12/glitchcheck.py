"""Audio glitch features per voiced clip, for the Laya glitch gate.

ElevenLabs sometimes ends a clip mid-waveform (a click, the last word clipped) or drops out mid-sentence. Whisper and
the transcript-based Laya check can't hear that, so this measures it from the samples:
  end_peak     loudest sample in the last 15 ms (a clean clip has faded to near-silence, < 0.05)
  end_db       loudness of the last 15 ms in dB (clean: below about -45)
  dropouts     places where loud speech (> -30 dB) falls to near-silence (< -60 dB) within 10 ms and comes straight
               back within 120 ms; speech never does that, a glitch does
  start_peak   the same as end_peak for the first 15 ms
Usage: python3 -I glitchcheck.py <video-out-dir>   -> prints features and writes <dir>/glitch_features.json
       python3 -I glitchcheck.py --mix <demo-voiced.mp4>  -> lists hard audio cuts in the final video
"""
import json, subprocess, sys
import numpy as np

SR, WIN = 16000, 160  # 10 ms frames

def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)

def features(path):
    x = load(path)
    edge = int(SR * 0.015)
    db = lambda a: float(20 * np.log10(np.sqrt((a ** 2).mean()) + 1e-9))
    frames = np.array([db(x[i:i + WIN]) for i in range(0, len(x) - WIN, WIN)])
    dropouts = []
    for i in range(1, len(frames) - 13):
        if frames[i - 1] > -30 and frames[i] < -60 and frames[i + 1:i + 13].max() > -30:
            dropouts.append(round(i * WIN / SR, 2))
    return {"end_peak": round(float(np.abs(x[-edge:]).max()), 3), "end_db": round(db(x[-edge:]), 1),
            "start_peak": round(float(np.abs(x[:edge]).max()), 3), "dropouts_s": dropouts}

def problems(f):
    """Hard thresholds (Laya can't compare numbers reliably, so this gate is code, not a model)."""
    out = []
    if f["end_db"] > -45 or f["end_peak"] > 0.05: out.append("cut off at the end")
    if f["start_peak"] > 0.3: out.append("starts mid-sound")
    if f["dropouts_s"]: out.append(f"dropout at {f['dropouts_s']}")
    return out

if __name__ == "__main__":
    if sys.argv[1] == "--json": print(json.dumps(features(sys.argv[2]))); sys.exit()
    if sys.argv[1] == "--mix":  # final video: loud audio followed straight by digital silence = an audible hard cut
        x = load(sys.argv[2]); f = [20 * np.log10(np.sqrt((x[i:i + WIN] ** 2).mean()) + 1e-9) for i in range(0, len(x) - WIN, WIN)]
        cuts = [f"{i * WIN / SR // 60:.0f}:{i * WIN / SR % 60:05.2f}" for i in range(1, len(f)) if f[i - 1] > -30 and min(f[i:i + 3]) < -90]
        print("hard cuts:", cuts or "none"); sys.exit(1 if cuts else 0)
    d = sys.argv[1]
    clips = json.load(open(f"{d}/clips.json"))
    clips = clips["clips"] if isinstance(clips, dict) else clips
    out = {c["id"]: features(c["file"]) for c in clips}
    for k, v in out.items(): print("FLAG" if problems(v) else "OK  ", k, "; ".join(problems(v)) or "", v)
    json.dump(out, open(f"{d}/glitch_features.json", "w"), indent=1)
