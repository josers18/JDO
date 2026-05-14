#!/usr/bin/env bash
# Hit every Semantic Model sub-endpoint and summarize the result for a given model.
# Usage: probe_model_subendpoints.sh <org-alias> <model-api-name> [output-dir]

set -euo pipefail
ORG="${1:?Usage: $0 <org-alias> <model-api-name> [output-dir]}"
MODEL="${2:?Usage: $0 <org-alias> <model-api-name> [output-dir]}"
OUTDIR="${3:-/tmp/sf-probes-${MODEL}}"
mkdir -p "$OUTDIR"

for sub in "" "/shallow" "/data-objects" "/relationships" "/calculated-dimensions" "/calculated-measurements" "/groupings" "/parameters"; do
  fname="$(echo "${MODEL}${sub}" | tr '/' '_').json"
  out="$OUTDIR/$fname"
  sf api request rest "/services/data/v65.0/ssot/semantic/models/${MODEL}${sub}" --target-org "$ORG" 2>/dev/null > "$out" || true
  size=$(wc -c < "$out")
  echo "  ${size:>9} bytes  ${MODEL}${sub}  →  $out"
done

echo
echo "Saved to: $OUTDIR"
