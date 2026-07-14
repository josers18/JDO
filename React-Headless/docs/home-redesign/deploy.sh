#!/usr/bin/env bash
# Deploy the home-redesign rollout to jdo-1lrnov:
#   1. Apex CRM write bridge (+ run its test)
#   2. All 3 UI bundles (build dist/ first) + their app + access permset
# Follows docs/DEPLOYMENT_GUIDE.md. Run from the SFDX project ROOT.
# Reads --json status; stops on first hard failure.
set -euo pipefail
ORG="jdo-1lrnov"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"   # -> repo root (docs/home-redesign -> ../../)
cd "$ROOT"
echo "Repo root: $ROOT"
echo "Target org: $ORG"

# ── 0. sanity: org reachable ───────────────────────────────────────────
sf org display -o "$ORG" >/dev/null

# ── 1. Apex CRM write bridge ────────────────────────────────────────────
echo "== Deploying Apex CrmWriteRest (+ test) =="
sf project deploy start \
  --source-dir force-app/main/default/classes/CrmWriteRest.cls \
  --source-dir force-app/main/default/classes/CrmWriteRestTest.cls \
  -o "$ORG" --json | tee /tmp/deploy-apex.json
echo "== Running CrmWriteRestTest =="
sf apex run test --tests CrmWriteRestTest --result-format human --wait 10 -o "$ORG"

# ── 2. UI bundles ───────────────────────────────────────────────────────
for APP in ReactRetail ReactWealth ReactCommercial; do
  echo "== Building $APP =="
  ( cd "force-app/main/default/uiBundles/$APP" && npm run build )

  echo "== Deploying $APP bundle + app + access permset =="
  sf project deploy start \
    --source-dir "force-app/main/default/uiBundles/$APP" \
    --source-dir "force-app/main/default/applications/$APP.app-meta.xml" \
    --source-dir "force-app/main/default/permissionsets/${APP}_Access.permissionset-meta.xml" \
    -o "$ORG" --json | tee "/tmp/deploy-$APP.json"
done

echo ""
echo "✅ Deploy commands issued. VERIFY each /tmp/deploy-*.json for:"
echo "   result.status == 'Succeeded' and result.numberComponentErrors == 0"
echo ""
echo "Then open (App Domain URL, NOT /lightning/app/...):"
echo "  https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactRetail"
echo "  https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactWealth"
echo "  https://storm-16a17dc388fbe6--c.demo.my.salesforce.app/app/c__ReactCommercial"
