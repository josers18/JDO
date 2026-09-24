#!/usr/bin/env bash
set -euo pipefail
# Usage: provision_demo_user.sh <requester-salesforce-email>
EMAIL="${1:?Usage: provision_demo_user.sh <requester-salesforce-email>}"
if ! printf '%s' "$EMAIL" | grep -qE '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'; then
  echo "ERROR: invalid email '$EMAIL' — expected e.g. jdoe@salesforce.com" >&2
  exit 1
fi
PASSWORD="${DEMO_USER_PASSWORD:-salesforce1}"
ORG="jdo-oe0sdd"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -t provision.XXXXXX.apex)"
trap 'rm -f "$TMP"' EXIT
sed -e "s|{{EMAIL}}|${EMAIL}|g" -e "s|{{PASSWORD}}|${PASSWORD}|g" \
    "$DIR/apex/ProvisionDemoUser.apex" > "$TMP"
sf apex run -o "$ORG" -f "$TMP"
