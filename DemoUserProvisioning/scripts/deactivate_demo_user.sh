#!/usr/bin/env bash
set -euo pipefail
USERNAME="${1:?Usage: deactivate_demo_user.sh <username@finsdc3.demo>}"
ORG="jdo-oe0sdd"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -t deactivate.XXXXXX.apex)"
trap 'rm -f "$TMP"' EXIT
sed -e "s|{{USERNAME}}|${USERNAME}|g" "$DIR/apex/DeactivateDemoUser.apex" > "$TMP"
sf apex run -o "$ORG" -f "$TMP"
