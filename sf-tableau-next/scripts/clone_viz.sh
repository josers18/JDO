#!/usr/bin/env bash
# Clone an existing Tableau Next visualization to a new name.
# Strips server-managed and future-version fields automatically.
#
# Usage: clone_viz.sh <org-alias> <source-viz-name> <new-name> [new-label]

set -euo pipefail
ORG="${1:?Usage: $0 <org-alias> <source-viz-name> <new-name> [new-label]}"
SRC="${2:?Usage: $0 <org-alias> <source-viz-name> <new-name> [new-label]}"
NEW_NAME="${3:?Usage: $0 <org-alias> <source-viz-name> <new-name> [new-label]}"
NEW_LABEL="${4:-$NEW_NAME}"

TMP="$(mktemp -t clone-viz-XXXXXX.json)"

# Fetch source
sf api request rest "/services/data/v66.0/tableau/visualizations/${SRC}" --target-org "$ORG" 2>/dev/null > "$TMP.src"

if grep -q '"errorCode"' "$TMP.src"; then
  echo "Failed to fetch source viz $SRC:" >&2
  cat "$TMP.src" >&2
  exit 1
fi

# Strip server-managed + known future-version fields
python3 <<PY > "$TMP"
import json
src = json.load(open("$TMP.src"))
SERVER_FIELDS = {'id','createdBy','createdDate','lastModifiedBy','lastModifiedDate','permissions','sourceVersion','isOriginal','url'}
FUTURE_FIELDS = {'startToEndSteps','middleToEndSteps','startToMiddleSteps'}
def strip(node):
    if isinstance(node, dict):
        return {k: strip(v) for k,v in node.items() if k not in SERVER_FIELDS and k not in FUTURE_FIELDS}
    if isinstance(node, list):
        return [strip(x) for x in node]
    return node
out = strip(src)
out['name']  = "$NEW_NAME"
out['label'] = "$NEW_LABEL"
print(json.dumps(out, indent=2))
PY

# POST
sf api request rest "/services/data/v66.0/tableau/visualizations" \
  --method POST \
  --body "@$TMP" \
  --target-org "$ORG" 2>&1 | grep -v Warning

rm -f "$TMP" "$TMP.src"
