"""PartyProfile — native FSC mirror of Person Accounts and business Contacts.

Plan 4 / Task 6: emit PartyProfile rows for every Person Account customer
plus every business Contact, with HouseholdAccountId set when applicable.

Bridge field: none — uses shared AccountId / ContactId
Phase 3 dependency: Account + Contact External_ID__c → Salesforce Id maps
"""
from __future__ import annotations

# TODO(Plan 4 / Task 6): implement generate_party_profiles
