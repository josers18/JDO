#!/usr/bin/env bash
# Voice, record and mux the UC-12 Campaign responders demo (ReactRetailV2 Growth, as Justin Chen, org jdo-oe0sdd).
# Needs `sf` logged into jdo-oe0sdd. Each take reads the last take's timing.json so slow actions get room.
# The recorder deletes the "Follow up:" Task that Approve writes on the featured customer, before and after.
# VIDEO_OUT=<dir> writes elsewhere (e.g. video-out-v2) so an earlier video is left alone.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${VIDEO_OUT:-$HERE/video-out}"
mkdir -p "$OUT"
node "$HERE/voice.mjs" clips --track "$HERE/TALK_TRACK_VIDEO.md" --video-dir "$OUT"
MEASURED=(); [[ -f "$OUT/timing.json" ]] && MEASURED=(--measured "$OUT/timing.json")
node "$HERE/record.mjs" --track "$HERE/TALK_TRACK_VIDEO.md" --out "$OUT" --voice "$OUT/clips.json" ${MEASURED[@]+"${MEASURED[@]}"}
node "$HERE/voice.mjs" mux --video-dir "$OUT"
# Rename the finished video so the file says which use case it is.
mv -f "$OUT/demo-voiced.mp4" "$OUT/UC-12-Campaign-Responders-Data360.mp4"
