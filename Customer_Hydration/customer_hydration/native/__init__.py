"""Native FSC standard-object mirrors.

Plan 4 builds out the native lineage: FinancialAccount, FinancialAccountParty,
FinancialGoal, BusinessMilestone, PartyRelationshipGroup, PartyProfile,
ContactPointAddress / Email / Phone. Each native generator consumes a Plan 1+2+3
legacy bundle (or post-Wave-E ID resolver) and emits native rows with
LegacyId__c bridges where applicable.

The native lineage runs in Wave F + Wave G after Plan 3's legacy waves complete.
Triggered by the runner unless --skip-natives is passed.
"""
