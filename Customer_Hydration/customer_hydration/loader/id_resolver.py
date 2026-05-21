"""Post-wave ID resolution.

After Wave A loads Accounts, the resolver queries the org for
{External_ID__c → Salesforce Id} maps. Subsequent waves' CSVs use these
maps to fill in `WhatId`, `ContactId`, and other parent references that
can't be resolved client-side at generation time.

CSV markers like "RESOLVE:HYDRATE-RT-000001" are replaced in-place.

# TODO(Plan 3 / Task 5): implement IdResolver + rewrite_csv_resolve_markers
"""
from __future__ import annotations
