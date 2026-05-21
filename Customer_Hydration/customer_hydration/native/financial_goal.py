"""FinancialGoal — native FSC mirror of FinServ__FinancialGoal__c.

Plan 4 / Task 3: emit native FinancialGoal rows with LegacyId__c bridge.

Bridge field: LegacyId__c (verified in jdo-fw51xz: native FinancialGoal has both External_ID__c and LegacyId__c)
Phase 3 dependency: legacy Goal External_ID__c → legacy Goal Salesforce Id map
"""
from __future__ import annotations

# TODO(Plan 4 / Task 3): implement generate_native_financial_goals
