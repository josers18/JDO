/**
 * FscHouseholdLookupBackfill
 * --------------------------
 * Phase B7 extended scope. Surfaced during B7 verification: only ~10%
 * of FinServ__FinancialAccount__c records had `FinServ__Household__c`
 * populated, so 90% of household-level FSC rollups (TotalAUM,
 * TotalBankDeposits, TotalInvestments, TotalLiabilities, etc.) read
 * as $0 even when the customer was clearly an ACR household member.
 *
 * For every FA whose `FinServ__Household__c` is null but whose
 * `FinServ__PrimaryOwner__c` is a Person Account that's an ACR member
 * of a Household-typed Account, this utility writes the household Id
 * to the FA. Setting the field triggers FSC's RBL rollup on save.
 *
 * Idempotent via the `FinServ__Household__c IS NULL` query gate; any
 * FA already linked to a household is skipped on re-run.
 *
 * Sources the household lookup from AccountContactRelation:
 *   FA.PrimaryOwner (PA) → PA.PersonContactId
 *   ACR (Account.RecordType.Name='Household', ContactId=PA.PersonContactId)
 *   → ACR.AccountId is the household to write to FA.Household__c.
 *
 * Closes a finding (provisionally C9 / extension of H1) raised by
 * Phase B7 verification.
 */
public with sharing class FscHouseholdLookupBackfill {

    @AuraEnabled
    public static String runOnDemand() {
        // Pull the FAs needing backfill, with their primary-owner Id.
        List<FinServ__FinancialAccount__c> faList = [
            SELECT Id, FinServ__PrimaryOwner__c
            FROM FinServ__FinancialAccount__c
            WHERE FinServ__Household__c = NULL
            AND   FinServ__PrimaryOwner__c != NULL
        ];
        if (faList.isEmpty()) {
            return 'SKIPPED: 0 FAs without a household lookup.';
        }

        // Build the set of unique PrimaryOwner Ids and resolve each to
        // its PersonContactId (Person Account → Contact). FAs whose
        // PrimaryOwner is a B2B Account (no PersonContactId) are
        // dropped here.
        Set<Id> ownerIds = new Set<Id>();
        for (FinServ__FinancialAccount__c fa : faList) {
            ownerIds.add(fa.FinServ__PrimaryOwner__c);
        }
        Map<Id, Id> personAccountToContact = new Map<Id, Id>();
        for (Account a : [
            SELECT Id, PersonContactId
            FROM Account
            WHERE Id IN :ownerIds
            AND   IsPersonAccount = TRUE
            AND   PersonContactId != NULL
        ]) {
            personAccountToContact.put(a.Id, a.PersonContactId);
        }

        // Walk ACRs to map PersonContactId → Household Account Id.
        Map<Id, Id> contactToHousehold = new Map<Id, Id>();
        for (AccountContactRelation acr : [
            SELECT ContactId, AccountId
            FROM AccountContactRelation
            WHERE ContactId IN :personAccountToContact.values()
            AND   Account.RecordType.Name = 'Household'
        ]) {
            // First-write wins (some PAs may belong to multiple households)
            if (!contactToHousehold.containsKey(acr.ContactId)) {
                contactToHousehold.put(acr.ContactId, acr.AccountId);
            }
        }

        // Build the update list.
        List<FinServ__FinancialAccount__c> updates = new List<FinServ__FinancialAccount__c>();
        Integer skippedB2B = 0;
        Integer skippedNoHousehold = 0;
        for (FinServ__FinancialAccount__c fa : faList) {
            Id contactId = personAccountToContact.get(fa.FinServ__PrimaryOwner__c);
            if (contactId == null) {
                skippedB2B++;
                continue;
            }
            Id householdId = contactToHousehold.get(contactId);
            if (householdId == null) {
                skippedNoHousehold++;
                continue;
            }
            updates.add(new FinServ__FinancialAccount__c(
                Id                    = fa.Id,
                FinServ__Household__c = householdId
            ));
        }

        Database.SaveResult[] results = Database.update(updates, false);
        Integer ok = countSuccesses(results);
        return 'OK: linked ' + ok + ' FAs to a household. '
             + 'Skipped ' + skippedB2B + ' B2B FAs (no PersonContact); '
             + skippedNoHousehold + ' Person FAs whose owner is not in a household.';
    }

    @TestVisible
    private static Integer countSuccesses(Database.SaveResult[] results) {
        Integer ok = 0;
        Integer fail = 0;
        for (Database.SaveResult r : results) {
            if (r.isSuccess()) {
                ok++;
            } else {
                fail++;
                if (fail <= 3) {
                    System.debug(LoggingLevel.ERROR,
                        'FA update failed: ' + r.getErrors()[0].getMessage());
                }
            }
        }
        if (fail > 0) {
            System.debug(LoggingLevel.WARN, 'FA batch: ' + ok + ' ok / ' + fail + ' failed');
        }
        return ok;
    }
}
