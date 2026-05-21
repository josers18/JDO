"""BusinessMilestone — native FSC standard object (no legacy counterpart in jdo-fw51xz).

Plan 4 / Task 4: emit native BusinessMilestone rows for SMB and Commercial customers.
Note: the legacy FinServ__BusinessMilestone__c object is NOT installed in jdo-fw51xz
(verified Plan 1 prelude), so this is native-only — no legacy bridge.

Bridge field: none (OriginalLegacyGoalId__c left null since no legacy counterpart)
Phase 3 dependency: SMB + Commercial Account External_ID__c → Salesforce Id map
"""
from __future__ import annotations

# TODO(Plan 4 / Task 4): implement generate_business_milestones
