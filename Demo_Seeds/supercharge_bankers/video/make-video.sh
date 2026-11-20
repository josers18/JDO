#!/usr/bin/env bash
# Voice, record and mux the "After the call" demo (ReactCommercial, org jdo-oe0sdd, Rodriguez Industries).
# Needs `sf` logged into jdo-oe0sdd. Each take reads the last take's timing.json so slow actions get room.
# The recorder clears the panel's writes (today's Tasks, Call summary notes, KYC back to Expired) before and after.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/video-out"
mkdir -p "$OUT"
node "$HERE/voice.mjs" clips --track "$HERE/TALK_TRACK_VIDEO.md"
MEASURED=(); [[ -f "$OUT/timing.json" ]] && MEASURED=(--measured "$OUT/timing.json")
node "$HERE/record.mjs" --track "$HERE/TALK_TRACK_VIDEO.md" --out "$OUT" --voice "$OUT/clips.json" "${MEASURED[@]}"
node "$HERE/voice.mjs" mux
