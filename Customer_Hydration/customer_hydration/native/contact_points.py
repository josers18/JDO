"""ContactPointAddress / ContactPointEmail / ContactPointPhone — native FSC contact points.

Plan 4 / Task 7: emit one of each per Person Account / business Contact,
mirroring the legacy direct fields. Data Cloud's harmonization step prefers
ContactPoint* objects over inline Account/Contact email/phone fields.

Bridge field: none — uses shared parent Id (resolved Phase 3)
Phase 3 dependency: Account + Contact External_ID__c → Salesforce Id maps
"""
from __future__ import annotations

# TODO(Plan 4 / Task 7): implement generate_contact_points (3 sub-generators or one combined)
