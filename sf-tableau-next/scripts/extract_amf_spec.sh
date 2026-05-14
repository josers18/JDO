#!/usr/bin/env bash
# Download an AMF JSON-LD spec from developer.salesforce.com.
# A naive curl gets 404 because the static asset requires a Referer header from the
# corresponding documentation page. This script handles that.
#
# Usage:
#   extract_amf_spec.sh <static-amf-url> [output-file]
#
# Example:
#   extract_amf_spec.sh https://developer.salesforce.com/static/analytics/tableau-next-rest-api/visualizations-operations/v64.0/visualizations.yaml.amf.json
#
# To find the static URL: open the Reference page in a browser, watch the network tab
# for `*.amf.json`, and grab that URL.

set -euo pipefail
URL="${1:?Usage: $0 <static-amf-url> [output-file]}"
OUT="${2:-$(basename "$URL")}"

# Derive a plausible Referer from the static URL by reversing the doc path.
# Static path:  /static/<doc-tree>/<resource>/v<N>/<resource>.yaml.amf.json
# Referer page: /docs/<doc-tree>/references/<resource>
RES_PATH="$(echo "$URL" | sed -E 's#^https?://[^/]+/static/([^/]+)/([^/]+)/([^/]+)/v[^/]+/.*#\1/\2/\3#')"
DOC_TREE="${RES_PATH%/*/*}"
RESOURCE="${RES_PATH##*/}"
REFERER="https://developer.salesforce.com/docs/${DOC_TREE}/references/${RESOURCE}"

curl -sL \
  -H "Referer: $REFERER" \
  -H "Origin: https://developer.salesforce.com" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122 Safari/537.36" \
  -H "Accept: application/json,*/*" \
  "$URL" \
  -o "$OUT"

size=$(wc -c < "$OUT")
echo "Downloaded $size bytes → $OUT"

# Quick sanity check
if head -c 50 "$OUT" | grep -q "DOCTYPE"; then
  echo "WARNING: response is HTML, not JSON-LD. Probably the wrong Referer."
  echo "Tried: $REFERER"
  echo "Try opening the doc page in a browser, watching network for *.amf.json, and using that URL with the same path you saw."
  exit 1
fi
