#!/usr/bin/env node
// Voice-over for the recorded demo, in two steps around the recording:
//   node voice.mjs clips [--track TALK_TRACK_VIDEO.md]   one ElevenLabs clip per segment's Say line -> voice/*.mp3 + clips.json
//   (record with: npm run video:record -- --track ... --voice video-out/clips.json, so each segment lasts as long as its clip)
//   node voice.mjs mux                                     lays each clip at its segment's real start (timing.json) -> demo-voiced.mp4
// Common: [--video-dir ./video-out] [--voice <voiceId>]; also --list-voices.
// Key: ELEVENLABS_API_KEY from the environment, or from ./elevenlabs.env or ~/Documents/Git/ace-banking-demo/.env (never printed).
// Clips are cached by a hash of voice, model, settings, pace and text, so only changed Say lines are re-voiced.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  for (const file of [join(HERE, "elevenlabs.env"), join(HERE, "../../../../ace-banking-demo/.env")]) {
    if (!existsSync(file)) continue;
    const m = /^\s*(?:export\s+)?ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s]+)["']?/m.exec(readFileSync(file, "utf8"));
    if (m) return m[1].trim();
  }
  throw new Error("No ELEVENLABS_API_KEY in the environment, ./elevenlabs.env or ~/Documents/Git/ace-banking-demo/.env");
}

let KEY;
const API = "https://api.elevenlabs.io/v1";

async function call(path, init = {}) {
  KEY ??= apiKey();
  const res = await fetch(`${API}${path}`, { ...init, headers: { "xi-api-key": KEY, ...(init.headers ?? {}) } });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200).replace(KEY, "***");
    throw new Error(`ElevenLabs ${res.status} on ${path}: ${body}`);
  }
  return res;
}

if (args.includes("--list-voices")) {
  const { voices } = await (await call("/voices")).json();
  for (const v of voices) console.log(`${v.voice_id}  ${v.name}  ${v.labels ? Object.values(v.labels).join(", ") : ""}`);
  process.exit(0);
}

const dir = resolve(opt("--video-dir", join(HERE, "video-out")));
const voiceId = opt("--voice", process.env.ELEVENLABS_VOICE_ID ?? "n7jD9bTX5SyieU570qQS"); // Jose's cloned voice
const model = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";
// Presenter delivery: stability 0.6 keeps a cloned voice clean (lower lets it improvise ums and repeats),
// style 0.3 gives it lift; the script's punctuation (! and dashes) carries the energy. Default speed. Override with ELEVENLABS_STABILITY / _SIMILARITY / _STYLE (0-1) and _SPEED (0.7-1.2).
const num = (k, d) => (process.env[k] !== undefined ? Number(process.env[k]) : d);
const voiceSettings = {
  stability: num("ELEVENLABS_STABILITY", 0.6),
  similarity_boost: num("ELEVENLABS_SIMILARITY", 0.85),
  style: num("ELEVENLABS_STYLE", 0.3),
  use_speaker_boost: true,
  speed: num("ELEVENLABS_SPEED", 0.92),
};
// Natural pacing: each segment is voiced as ONE paragraph, all at the SAME speed (ELEVENLABS_SPEED, default 0.92),
// because per-segment speeds make the joins audible (one clip noticeably slower than the last). Each request is
// stitched to the previous segment's (previous_request_ids) plus neighbouring text, so the voice carries its
// energy and pace across clips like one take. A clip whose pace drifts more than 10% from ELEVENLABS_WPM (default
// 200) is re-rolled at the same speed, up to 3 times, keeping the closest. No audio stretching.
const TARGET_WPM = num("ELEVENLABS_WPM", 200);
const WARM_UP = "Hi everyone, thanks for having me. I'm really excited about this one, so let's jump right in!";
const words = (s) => s.split(/\s+/).filter(Boolean).length;
const step = args[0];
const probe = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString()) * 1000;

if (step === "clips") {
  const { parseTalkTrack } = await import(join(HERE, "talkTrack.mjs"));
  const trackPath = resolve(opt("--track", join(HERE, "TALK_TRACK_VIDEO.md")));
  // US English only, before any credits are spent: usspell.py lists each British spelling and exits 1.
  try {
    execFileSync("python3", ["-I", join(HERE, "usspell.py"), trackPath], { stdio: "inherit" });
  } catch {
    throw new Error("talk track has British spellings (see above); fix them before voicing");
  }
  const segments = parseTalkTrack(readFileSync(trackPath, "utf8"));
  const voiceDir = join(dir, "voice");
  mkdirSync(voiceDir, { recursive: true });
  const clips = [];
  let lastId; // request id of the previous segment's clip, for stitching
  // The opening clip has nothing before it, so it starts cold (flat, sad). Give it an upbeat unspoken lead-in and,
  // when one exists, the request id of a mid-track clip whose delivery was approved (ELEVENLABS_ANCHOR, default S05),
  // so it starts with the same energy as the rest. Request ids only stitch for a couple of hours after generation.
  const anchorSeg = process.env.ELEVENLABS_ANCHOR ?? "S05";
  const anchorFile = readdirSync(voiceDir).filter((f) => f.startsWith(`${anchorSeg}-`) && f.endsWith(".mp3.id")).sort()
    .map((f) => join(voiceDir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  const anchorId = anchorFile ? readFileSync(anchorFile, "utf8").trim() : undefined;
  for (const [n, seg] of segments.entries()) {
    const before = segments[n - 1]?.say, after = segments[n + 1]?.say;
    const hash = createHash("sha256").update(`${voiceId}|${model}|${JSON.stringify(voiceSettings)}|${TARGET_WPM}|${seg.say}`).digest("hex").slice(0, 10);
    const file = join(voiceDir, `${seg.id}-${hash}.mp3`);
    const cached = existsSync(file);
    let tries = 0;
    if (!cached) {
      let best;
      // Roll up to 4 takes at the same speed. Keep the best take that is within 15% of the target pace, ranked by
      // pitch variation (liveliness.py, semitones): a flat take sounds sad and monotone even when its pace is fine.
      // Stop early once a take is in pace AND lively (>= 2.8 st).
      for (tries = 1; tries <= 4; tries++) {
        const res = await call(`/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "audio/mpeg" },
          body: JSON.stringify({ text: seg.say, model_id: model, voice_settings: voiceSettings, previous_text: before ?? WARM_UP, next_text: after,
            previous_request_ids: lastId ? [lastId] : n === 0 && anchorId ? [anchorId] : undefined }),
        });
        const audio = Buffer.from(await res.arrayBuffer());
        writeFileSync(file, audio);
        const wpm = words(seg.say) / (probe(file) / 60000), off = Math.abs(wpm / TARGET_WPM - 1);
        const lively = JSON.parse(execFileSync("python3", ["-I", join(HERE, "liveliness.py"), "--json", file]).toString()).pitch_sd_st;
        // glitch gate: a take that ends mid-word (still loud in its last 15 ms), starts mid-sound or drops out is
        // never kept while another take exists. ElevenLabs occasionally truncates a clip; you hear it as a cut/pop.
        const g = JSON.parse(execFileSync("python3", ["-I", join(HERE, "glitchcheck.py"), "--json", file]).toString());
        const glitch = g.end_db > -45 || g.end_peak > 0.05 || g.start_peak > 0.3 || g.dropouts_s.length > 0;
        const score = (glitch ? 100 : 0) + (off <= 0.15 ? -lively : 10 + off * 10); // in-pace takes ranked by liveliness; otherwise closest pace wins
        console.log(`   ${seg.id} take ${tries}: ${Math.round(wpm)} wpm, pitch ${lively} st${glitch ? "  GLITCH" : ""}`);
        if (!best || score < best.score) best = { score, audio, id: res.headers.get("request-id") };
        if (!glitch && off <= 0.15 && lively >= 2.8) break;
      }
      writeFileSync(file, best.audio);
      if (best.id) writeFileSync(`${file}.id`, best.id);
    }
    lastId = existsSync(`${file}.id`) ? readFileSync(`${file}.id`, "utf8").trim() : undefined;
    const ms = Math.round(probe(file));
    clips.push({ id: seg.id, text: seg.say, ms, file });
    console.log(`${seg.id}  ${(ms / 1000).toFixed(1)} s${cached ? "  (cached)" : `  ${Math.min(tries, 4)} take(s)`}  ${Math.round(words(seg.say) / (ms / 60000))} wpm`);
  }
  writeFileSync(join(dir, "clips.json"), `${JSON.stringify(clips, null, 2)}\n`);
  console.log(`\n${clips.length} clips, ${(clips.reduce((n, c) => n + c.ms, 0) / 1000).toFixed(1)} s of voice -> ${join(dir, "clips.json")}`);
} else if (step === "mux") {
  const clips = JSON.parse(readFileSync(join(dir, "clips.json"), "utf8"));
  const timing = new Map(JSON.parse(readFileSync(join(dir, "timing.json"), "utf8")).map((t) => [t.id, t]));
  const GAP_MS = 300; // breath between clips if one ever runs past its segment
  let prevEnd = 0;
  let late = 0;
  const placed = clips.map((c) => {
    const t = timing.get(c.id);
    if (!t) throw new Error(`${c.id}: not in timing.json; re-record with --voice clips.json`);
    // A segment can hold its line until a `voice` cue (voiceAtMs into the segment), so the words wait for the screen.
    const dueMs = t.startMs + (t.voiceAtMs ?? 0);
    const atMs = Math.max(dueMs, prevEnd ? prevEnd + GAP_MS : 0);
    if (atMs > dueMs) late++;
    prevEnd = atMs + c.ms;
    return { ...c, atMs };
  });
  const inputs = ["-i", join(dir, "demo.mp4")]; // the recorder's 4K H.264 take
  const parts = [];
  placed.forEach((c, i) => {
    inputs.push("-i", c.file);
    parts.push(`[${i + 1}:a]adelay=${c.atMs}|${c.atMs}[a${i}]`);
  });
  const filter = `${parts.join(";")};${placed.map((_, i) => `[a${i}]`).join("")}amix=inputs=${placed.length}:normalize=0[aout]`;
  const out = join(dir, "demo-voiced.mp4");
  execFileSync(
    "ffmpeg",
    ["-loglevel", "error", "-y", ...inputs, "-filter_complex", filter, "-map", "0:v", "-map", "[aout]",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out], // video copied, never re-encoded
    { stdio: "inherit" },
  );
  console.log(`${placed.length} clips muxed, ${late} started late -> ${out}`);
} else {
  console.error("usage: node voice.mjs clips|mux [--video-dir dir] [--voice id] [--track file]   (or --list-voices)");
  process.exit(2);
}
