#!/usr/bin/env bash
set -euo pipefail
# Two modes:
#   create (default): provision_demo_user.sh <requester-salesforce-email> [firstName] [lastName]
#                     Creates (or tops up) the demo user <localpart>@finsdc3.demo.
#   align:            provision_demo_user.sh --existing <username|email|Id>
#                     Brings an EXISTING org user up to the full baseline (49 PSLs, 9 PSGs,
#                     WebMessagingQueue + Demo_Users group). Additive only — never touches
#                     the target's profile, role, or password.
# Name args (create mode) are optional; if omitted, first/last derive from the email local part.

MODE="create"
EMAIL=""
FIRST=""
LAST=""
IDENTIFIER=""

if [ "${1:-}" = "--existing" ]; then
  MODE="align"
  IDENTIFIER="${2:?Usage: provision_demo_user.sh --existing <username|email|Id>}"
  # Substituted into an Apex string literal — allow only safe characters (letters, digits,
  # and the set that appears in usernames/emails/Ids). A stray quote would break the literal.
  if ! printf '%s' "$IDENTIFIER" | grep -qE '^[A-Za-z0-9._%+@-]+$'; then
    echo "ERROR: invalid identifier '$IDENTIFIER' — letters/digits/@ . _ % + - only (no quotes)" >&2
    exit 1
  fi
else
  EMAIL="${1:?Usage: provision_demo_user.sh <requester-salesforce-email> [firstName] [lastName]  (or: --existing <username|email|Id>)}"
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
fi

PASSWORD="${DEMO_USER_PASSWORD:-salesforce1}"
ORG="jdo-oe0sdd"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -t provision.XXXXXX.apex)"
trap 'rm -f "$TMP"' EXIT
sed -e "s|{{MODE}}|${MODE}|g" -e "s|{{EMAIL}}|${EMAIL}|g" -e "s|{{IDENTIFIER}}|${IDENTIFIER}|g" \
    -e "s|{{PASSWORD}}|${PASSWORD}|g" -e "s|{{FIRSTNAME}}|${FIRST}|g" -e "s|{{LASTNAME}}|${LAST}|g" \
    "$DIR/apex/ProvisionDemoUser.apex" > "$TMP"
sf apex run -o "$ORG" -f "$TMP"
