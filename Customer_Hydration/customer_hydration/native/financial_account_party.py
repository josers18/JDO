"""FinancialAccountParty — native FSC mirror of FinServ__FinancialAccountRole__c.

Plan 4 / Task 8: emit FinancialAccountParty rows linking native FAs to
Account or Contact parties, mirroring the legacy FA Role data.

Bridge field: none — natural-key dedupe on (FinancialAccountId, AccountId|ContactId, Role)
Phase 3 dependency: native FA Salesforce Ids (post-Wave-F), legacy Account/Contact ID maps
"""
from __future__ import annotations

# TODO(Plan 4 / Task 8): implement generate_native_financial_account_parties (Wave G)
