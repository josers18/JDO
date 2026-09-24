#!/usr/bin/env bash
set -euo pipefail
ORG="jdo-oe0sdd"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
sf apex run -o "$ORG" -f "$DIR/apex/SyncDemoUsers.apex"
