#!/usr/bin/env bash
# Inventory Tableau Next + Semantic Layer assets in an org.
# Usage: list_assets.sh <org-alias>

set -euo pipefail
ORG="${1:?Usage: $0 <org-alias>}"

echo "=== Tableau Next workspaces (v66.0) ==="
sf api request rest "/services/data/v66.0/tableau/workspaces" --target-org "$ORG" 2>/dev/null \
  | python3 -c "import json,sys; d=json.load(sys.stdin);
print(f'count: {len(d.get(\"workspaces\",[]))}');
[print(f'  {w[\"name\"]:50s}  {w[\"label\"]}') for w in d.get('workspaces',[])]"

echo
echo "=== Tableau Next visualizations (v66.0) ==="
sf api request rest "/services/data/v66.0/tableau/visualizations" --target-org "$ORG" 2>/dev/null \
  | python3 -c "import json,sys; d=json.load(sys.stdin);
items=d.get('visualizations',[]);
print(f'count: {len(items)}');
[print(f'  {v[\"name\"]:50s}  {v[\"label\"]:40s}  ws={v.get(\"workspace\",{}).get(\"name\",\"?\")}  src={v.get(\"dataSource\",{}).get(\"name\",\"?\")}') for v in items[:50]]"

echo
echo "=== Tableau Semantic Models (v65.0) ==="
sf api request rest "/services/data/v65.0/ssot/semantic/models?limit=1000" --target-org "$ORG" 2>/dev/null \
  | python3 -c "import json,sys; d=json.load(sys.stdin);
items=d.get('items',[]);
print(f'count: {d.get(\"count\",len(items))}');
[print(f'  {m[\"apiName\"]:50s}  {m[\"label\"]:40s}  src={m.get(\"sourceCreation\",\"?\")}  ds={m.get(\"dataspace\",\"?\")}') for m in items]"
