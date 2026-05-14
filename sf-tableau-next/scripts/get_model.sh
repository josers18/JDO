#!/usr/bin/env bash
# Get a full Tableau Semantic Model by api-name (all sub-collections inlined).
# Usage: get_model.sh <org-alias> <model-api-name>

set -euo pipefail
ORG="${1:?Usage: $0 <org-alias> <model-api-name>}"
MODEL="${2:?Usage: $0 <org-alias> <model-api-name>}"

sf api request rest "/services/data/v65.0/ssot/semantic/models/${MODEL}" --target-org "$ORG"
