# Pitch liveliness of mp3 clips: std of voiced F0 in semitones + energy variation. Higher = less monotone.
import sys, subprocess, json, numpy as np
def f0_track(path, sr=16000):
    raw = subprocess.run(["ffmpeg","-v","error","-i",path,"-ac","1","-ar",str(sr),"-f","f32le","-"],capture_output=True,check=True).stdout
    x = np.frombuffer(raw, np.float32); hop, win = 160, 640
    f0, rms = [], []
    for i in range(0, len(x)-win, hop):
        fr = x[i:i+win] - x[i:i+win].mean(); e = np.sqrt((fr**2).mean()); rms.append(e)
        if e < 0.02: continue
        ac = np.correlate(fr, fr, "full")[win-1:]; lo, hi = sr//300, sr//70
        lag = lo + np.argmax(ac[lo:hi])
        if ac[lag] / ac[0] > 0.5: f0.append(sr/lag)
    f0 = np.array(f0); st = 12*np.log2(f0/np.median(f0))
    st = st[np.abs(st) < 12]
    r = np.array(rms); r = r[r > 0.02]
    return dict(f0_med=round(float(np.median(f0)),1), pitch_sd_st=round(float(st.std()),2), energy_cv=round(float(r.std()/r.mean()),2))
if __name__ == "__main__":
    if sys.argv[1] == "--json": print(json.dumps(f0_track(sys.argv[2])))
    else:
        for p in sys.argv[1:]: print(p.split("/")[-1][:3], f0_track(p))
