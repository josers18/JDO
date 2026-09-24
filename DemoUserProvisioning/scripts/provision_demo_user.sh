#!/usr/bin/env bash
set -euo pipefail
# Usage: provision_demo_user.sh <requester-salesforce-email> [firstName] [lastName]
# Name args are optional. If omitted, first/last are derived from the email local part.
EMAIL="${1:?Usage: provision_demo_user.sh <requester-salesforce-email> [firstName] [lastName]}"
FIRST="${2:-}"
LAST="${3:-}"
if ! printf '%s' "$EMAIL" | grep -qE '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'; then
  echo "ERROR: invalid email '$EMAIL' — expected e.g. jdoe@salesforce.com" >&2
  exit 1
fi
# Names are substituted into an Apex string literal, so reject anything with quotes/odd
# characters (a stray quote would break the literal). Letters, spaces, hyphens, dots only.
for n in "$FIRST" "$LAST"; do
  if [ -n "$n" ] && ! printf '%s' "$n" | grep -qE "^[A-Za-z][A-Za-z .-]*$"; then
    echo "ERROR: invalid name '$n' — letters/spaces/hyphens/dots only (no quotes/apostrophes)" >&2
    exit 1
  fi
done
PASSWORD="${DEMO_USER_PASSWORD:-salesforce1}"
ORG="jdo-oe0sdd"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -t provision.XXXXXX.apex)"
trap 'rm -f "$TMP"' EXIT
sed -e "s|{{EMAIL}}|${EMAIL}|g" -e "s|{{PASSWORD}}|${PASSWORD}|g" \
    -e "s|{{FIRSTNAME}}|${FIRST}|g" -e "s|{{LASTNAME}}|${LAST}|g" \
    "$DIR/apex/ProvisionDemoUser.apex" > "$TMP"
sf apex run -o "$ORG" -f "$TMP"
