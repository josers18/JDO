"""FinancialAccount — native FSC mirror of FinServ__FinancialAccount__c.

Plan 4 / Task 2: emit FinancialAccount rows with LegacyId__c set to the
legacy FA's Salesforce Id (resolved Phase 3, post-Wave-D).

Bridge field: LegacyId__c (existing on the native object in jdo-fw51xz)
Phase 3 dependency: legacy FA External_ID__c → legacy FA Salesforce Id map
"""
from __future__ import annotations

# TODO(Plan 4 / Task 2): implement generate_native_financial_accounts
