#!/usr/bin/env node
// Voice-over for the recorded demo, in two steps around the recording:
//   node voice.mjs clips [--track TALK_TRACK_VIDEO.md]   one ElevenLabs clip per segment's Say line -> voice/*.mp3 + clips.json
//   (record with: npm run video:record -- --track ... --voice video-out/clips.json, so each segment lasts as long as its clip)
//   node voice.mjs mux                                     lays each clip at its segment's real start (timing.json) -> demo-voiced.mp4
// Common: [--video-dir ./video-out] [--voice <voiceId>]; also --list-voices.
// Key: ELEVENLABS_API_KEY from the environment, or from ./elevenlabs.env or ~/Documents/Git/ace-banking-demo/.env (never printed).
// Clips are cached by a hash of voice, model and text, so only changed Say lines are re-voiced.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const voiceId = opt("--voice", process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM"); // premade "Rachel"
const model = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";
const step = args[0];
const probe = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString()) * 1000;

if (step === "clips") {
  const { parseTalkTrack } = await import(join(HERE, "talkTrack.mjs"));
  const segments = parseTalkTrack(readFileSync(resolve(opt("--track", join(HERE, "TALK_TRACK_VIDEO.md"))), "utf8"));
  const voiceDir = join(dir, "voice");
  mkdirSync(voiceDir, { recursive: true });
  const clips = [];
  for (const seg of segments) {
    const hash = createHash("sha256").update(`${voiceId}|${model}|${seg.say}`).digest("hex").slice(0, 10);
    const file = join(voiceDir, `${seg.id}-${hash}.mp3`);
    const cached = existsSync(file);
    if (!cached) {
      const res = await call(`/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({ text: seg.say, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      });
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }
    const ms = Math.round(probe(file));
    clips.push({ id: seg.id, text: seg.say, ms, file });
    console.log(`${seg.id}  ${(ms / 1000).toFixed(1)} s${cached ? "  (cached)" : ""}`);
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
    const atMs = Math.max(t.startMs, prevEnd ? prevEnd + GAP_MS : 0);
    if (atMs > t.startMs) late++;
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
