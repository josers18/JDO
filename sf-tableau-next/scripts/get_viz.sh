#!/usr/bin/env bash
# Get a full Tableau Next visualization by name (use as POST template).
# Usage: get_viz.sh <org-alias> <viz-name-or-id>

set -euo pipefail
ORG="${1:?Usage: $0 <org-alias> <viz-name-or-id>}"
NAME="${2:?Usage: $0 <org-alias> <viz-name-or-id>}"

sf api request rest "/services/data/v66.0/tableau/visualizations/${NAME}" --target-org "$ORG"
