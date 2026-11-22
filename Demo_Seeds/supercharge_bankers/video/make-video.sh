#!/usr/bin/env bash
# Voice, record and mux the "After the call" demo (Commercial Bankers Cockpit, org jdo-oe0sdd, Rodriguez Industries).
# Needs `sf` logged into jdo-oe0sdd. Each take reads the last take's timing.json so slow actions get room.
# The recorder clears the panel's writes (today's Tasks, Call summary notes, KYC back to Expired) before and after.
# VIDEO_OUT=<dir> writes elsewhere (e.g. video-out-v2) so an earlier video is left alone.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${VIDEO_OUT:-$HERE/video-out}"
mkdir -p "$OUT"
node "$HERE/voice.mjs" clips --track "$HERE/TALK_TRACK_VIDEO.md" --video-dir "$OUT"
MEASURED=(); [[ -f "$OUT/timing.json" ]] && MEASURED=(--measured "$OUT/timing.json")
node "$HERE/record.mjs" --track "$HERE/TALK_TRACK_VIDEO.md" --out "$OUT" --voice "$OUT/clips.json" "${MEASURED[@]}"
node "$HERE/voice.mjs" mux --video-dir "$OUT"
