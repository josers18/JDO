// Pure parser and timing for the video talk track. No I/O, no browser.
// Format: "## Sxx · Title" headings, "- do: <action> [arg]" lines, one "**Say:** ..." paragraph.

const ARG_REQUIRED = {};
/** draft: click Draft follow-ups and wait for the draft; approve: click Approve and wait for the saved line; reload: reopen the Notes tab (the panel re-reads CRM). */
const NO_ARG = new Set(["draft", "approve", "reload"]);
const KNOWN = new Set([...NO_ARG, "pause", "point", "spot", "slide", "card"]);
/** Actions that hold the frame for their `seconds` (and that measured timing may squeeze). */
export const HELD = new Set(["point", "spot", "slide"]);
const holdSeconds = (actions) => actions.reduce((n, a) => n + (a.type === "pause" ? Number(a.arg) : HELD.has(a.type) ? a.seconds : 0), 0);

export const WORDS_PER_SECOND = 2.5;
/** Named things `point` can aim at (record.mjs maps each to an element). */
export const POINT_TARGETS = ["panel", "summary", "tasks", "email", "gaps", "compliance", "approve", "status", "notes", "transcript", "kyc"];
/** `<scope>:<phrase>` targets ring the newest visible element (or phrase) with that text, inside the scope. */
export const POINT_SCOPES = ["text", "panel", "notes", "summary"];
/** Air after a voice clip before the next segment starts. */
export const VOICE_BREATH_S = 0.5;

const words = (s) => s.split(/\s+/).filter(Boolean).length;

function parseAction(line, where) {
  const [type, ...rest] = line.trim().split(/\s+/);
  const arg = rest.join(" ");
  if (!KNOWN.has(type)) throw new Error(`${where}: unknown action "${type}"`);
  if (NO_ARG.has(type)) {
    if (arg) throw new Error(`${where}: "${type}" takes no argument`);
    return { type };
  }
  if (!arg) throw new Error(`${where}: "${type}" needs an argument`);
  if (ARG_REQUIRED[type] && !ARG_REQUIRED[type].includes(arg)) {
    throw new Error(`${where}: "${type} ${arg}" must be one of ${ARG_REQUIRED[type].join(", ")}`);
  }
  if (type === "pause" && !(Number.isFinite(Number(arg)) && Number(arg) >= 0)) throw new Error(`${where}: pause needs seconds`);
  if (type === "slide") {
    // slide <seconds> <kicker> | <title> | <sub> | <when> = <text> ; ... | <footer>
    const m = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(arg);
    const parts = m ? m[2].split(" | ").map((x) => x.trim()) : [];
    if (parts.length !== 5) throw new Error(`${where}: slide needs "<seconds> <kicker> | <title> | <sub> | <when> = <text> ; ... | <footer>"`);
    const [kicker, title, sub, steps, footer] = parts;
    const parsed = steps.split(" ; ").map((st) => {
      const [when, ...text] = st.split(" = ");
      if (!text.length) throw new Error(`${where}: slide step "${st}" needs "<when> = <text>"`);
      return { when: when.trim(), text: text.join(" = ").trim() };
    });
    return { type, arg, seconds: Number(m[1]), kicker, title, sub, steps: parsed, footer };
  }
  if (type === "point" || type === "spot") {
    // point <seconds> <target>[ | <target> ...][ -- <caption>]
    // spot  <seconds> <target>[ | <target> ...] -- <kicker> | <headline>[ | <bullet> ; <bullet> ...]
    const m = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(arg);
    if (!m) throw new Error(`${where}: ${type} needs "<seconds> <target>"`);
    const [spec, ...cap] = m[2].split(" -- ");
    const label = cap.join(" -- ").trim() || undefined;
    const targets = spec.split(" | ").map((t) => t.trim());
    for (const target of targets) {
      const scoped = /^([a-z]+):\S/.exec(target);
      if (!POINT_TARGETS.includes(target) && !(scoped && POINT_SCOPES.includes(scoped[1]))) {
        throw new Error(`${where}: ${type} target "${target}" must be one of ${POINT_TARGETS.join(", ")} or ${POINT_SCOPES.map((x) => `${x}:<text>`).join(", ")}`);
      }
    }
    if (type === "spot") {
      const [kicker, headline, bullets] = (label ?? "").split(" | ").map((x) => x.trim());
      if (!headline) throw new Error(`${where}: spot needs "-- <kicker> | <headline>[ | <bullet> ; ...]"`);
      return { type, arg, seconds: Number(m[1]), targets, kicker, headline, bullets: bullets ? bullets.split(" ; ").map((x) => x.trim()) : [] };
    }
    return { type, arg, seconds: Number(m[1]), targets, ...(label ? { label } : {}) };
  }
  return { type, arg };
}

/** @returns {{id:string,title:string,actions:{type:string,arg?:string}[],say:string,seconds:number}[]} */
export function parseTalkTrack(markdown) {
  const segments = [];
  let cur = null;
  let inSay = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const h = /^##\s+(S\d+)\s*·\s*(.+?)\s*$/.exec(raw);
    if (h) {
      cur = { id: h[1], title: h[2], actions: [], say: "", seconds: 0 };
      segments.push(cur);
      inSay = false;
      continue;
    }
    if (!cur) continue;
    if (/^---\s*$/.test(raw) || /^##\s/.test(raw)) {
      inSay = false;
      if (/^##\s/.test(raw)) cur = null;
      continue;
    }
    const d = /^-\s*do:\s*(.+)$/.exec(raw);
    if (d) {
      cur.actions.push(parseAction(d[1], cur.id));
      continue;
    }
    const s = /^\*\*Say:\*\*\s*(.*)$/.exec(raw);
    if (s) {
      cur.say = s[1].trim();
      inSay = true;
      continue;
    }
    if (inSay && raw.trim()) cur.say += ` ${raw.trim()}`;
  }
  for (const seg of segments) {
    seg.seconds = Math.max(words(seg.say) / WORDS_PER_SECOND + 1, holdSeconds(seg.actions) + 3);
  }
  return segments;
}

function ts(ms) {
  const t = Math.max(0, Math.round(ms));
  const p = (n, w) => String(n).padStart(w, "0");
  return `${p(Math.floor(t / 3600000), 2)}:${p(Math.floor(t / 60000) % 60, 2)}:${p(Math.floor(t / 1000) % 60, 2)},${p(t % 1000, 3)}`;
}

/** One cue per segment: starts at the actual start, ends at the next start (or start + seconds for the last). */
export function toSrt(segments, startsMs) {
  return (
    segments
      .map((seg, i) => {
        const end = i + 1 < segments.length ? startsMs[i + 1] : startsMs[i] + seg.seconds * 1000;
        return `${i + 1}\n${ts(startsMs[i])} --> ${ts(end)}\n${seg.say}\n`;
      })
      .join("\n")
  );
}

/**
 * Time each segment from its real voice clip instead of the word estimate: clip length plus a breath,
 * or the pauses/points plus 3 s if longer. `clips` is [{ id, text, ms }]; a clip whose text is not the
 * segment's current Say line is stale and fails before anything runs.
 */
export function applyVoiceTiming(segments, clips) {
  const byId = new Map(clips.map((c) => [c.id, c]));
  for (const seg of segments) {
    const c = byId.get(seg.id);
    if (!c) throw new Error(`${seg.id}: no voice clip; re-run the voice step`);
    if (c.text !== seg.say) throw new Error(`${seg.id}: voice clip is stale (Say line changed); re-run the voice step`);
    seg.seconds = Math.max(c.ms / 1000 + VOICE_BREATH_S, holdSeconds(seg.actions) + 3);
  }
  return segments;
}

/** Seconds of slack added after a segment's measured action time, for take-to-take variance. */
export const MEASURED_MARGIN_S = 1;
/** A highlight is never squeezed below this many seconds. */
export const MIN_POINT_S = 1.5;

/**
 * Fit each segment to its voice clip using an earlier take's timing.json ([{ id, seconds, overrunMs,
 * actionsMs?, pointMs? }]; pointMs covers every HELD action). The fixed part of a segment (typing, waiting for replies, clicks) is
 * actionsMs - pointMs; the point holds share what is left of the voice-timed length, shrunk
 * proportionally (down to MIN_POINT_S each) so the screen doesn't sit still after the narration ends.
 * Only if that still doesn't fit is the segment stretched. Highlights linger until the next action, so
 * shorter holds lose nothing on screen. Older takes without pointMs count each hold at its written length.
 */
export function applyMeasuredTiming(segments, timing) {
  const byId = new Map(timing.map((t) => [t.id, t]));
  for (const seg of segments) {
    const t = byId.get(seg.id);
    if (!t) continue;
    const actionsMs = t.actionsMs ?? (t.overrunMs > 0 ? t.seconds * 1000 + t.overrunMs : 0);
    const points = seg.actions.filter((a) => HELD.has(a.type));
    if (!points.length) {
      seg.seconds = Math.max(seg.seconds, actionsMs / 1000 + MEASURED_MARGIN_S);
      continue;
    }
    const want = points.reduce((n, a) => n + a.seconds, 0);
    // Takes before pointMs was recorded: the holds ran about their written length.
    const fixed = Math.max(0, actionsMs / 1000 - (t.pointMs ?? want * 1000) / 1000);
    const budget = seg.seconds - MEASURED_MARGIN_S - fixed;
    if (budget < want) {
      const floor = MIN_POINT_S * points.length;
      const room = Math.max(0, budget - floor);
      const spare = want - floor;
      for (const a of points) a.seconds = Math.floor((MIN_POINT_S + (spare > 0 ? ((a.seconds - MIN_POINT_S) * room) / spare : 0)) * 10) / 10;
    }
    const held = points.reduce((n, a) => n + a.seconds, 0);
    seg.seconds = Math.max(seg.seconds, fixed + held + MEASURED_MARGIN_S);
  }
  return segments;
}
