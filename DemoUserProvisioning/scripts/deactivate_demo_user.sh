#!/usr/bin/env bash
set -euo pipefail
USERNAME="${1:?Usage: deactivate_demo_user.sh <username@finsdc3.demo>}"
if ! printf '%s' "$USERNAME" | grep -qE '^[A-Za-z0-9._%+-]+@finsdc3\.demo$'; then
  echo "ERROR: invalid username '$USERNAME' — expected e.g. jdoe@finsdc3.demo" >&2
  exit 1
fi
ORG="jdo-oe0sdd"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -t deactivate.XXXXXX.apex)"
trap 'rm -f "$TMP"' EXIT
sed -e "s|{{USERNAME}}|${USERNAME}|g" "$DIR/apex/DeactivateDemoUser.apex" > "$TMP"
sf apex run -o "$ORG" -f "$TMP"
