"""Reset path — delete all HYDRATE-* records in reverse-wave order.

Refuses to run unless ≥1 HYDRATE-* record exists (so it's never used in
a clean org). Uses Bulk API 2.0 hard-delete jobs gated by
`External_ID__c LIKE 'HYDRATE-%'` (or `FinServ__SourceSystemId__c` for
objects without External_ID__c).

# TODO(Plan 3 / Task 9): implement reset_hydrate
"""
from __future__ import annotations
