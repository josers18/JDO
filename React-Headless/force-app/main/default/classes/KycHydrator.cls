/**
 * Fills native KYC gaps on Accounts: one FinServ__IdentificationDocument__c (SourceSystemId kyc:<accountId>)
 * for accounts without any document, and FinServ__LastReview__c / NextReview__c / ReviewFrequency__c where null.
 * Dates are consistent with FinServ__KYCStatus__c (read only) and derived deterministically from the account Id.
 */
public with sharing class KycHydrator {

    public static final String PREFIX = 'kyc:';

    public static void hydrate(List<Account> scope) {
        if (scope == null || scope.isEmpty()) return;
        Set<Id> ids = new Set<Id>();
        for (Account a : scope) ids.add(a.Id);

        Set<Id> hasDoc = new Set<Id>();
        for (FinServ__IdentificationDocument__c d : [
            SELECT FinServ__Account__c FROM FinServ__IdentificationDocument__c WHERE FinServ__Account__c IN :ids
        ]) {
            hasDoc.add(d.FinServ__Account__c);
        }

        Date today = Date.today();
        List<FinServ__IdentificationDocument__c> newDocs = new List<FinServ__IdentificationDocument__c>();
        List<Account> toUpdate = new List<Account>();
        for (Account a : scope) {
            Integer h = Math.abs(String.valueOf(a.Id).hashCode());
            String status = a.FinServ__KYCStatus__c;
            Boolean past = status == 'Expired' || status == 'Overdue';
            Boolean valid = status == 'Completed - Valid';

            Date expiry;
            Date lastReview;
            Date nextReview;
            if (past) {
                expiry = today.addDays(-(30 + Math.mod(h, 150)));
                nextReview = today.addDays(-(10 + Math.mod(h, 80)));
                lastReview = nextReview.addYears(-1);
            } else if (valid) {
                expiry = today.addDays(365 + Math.mod(h, 700));
                lastReview = today.addDays(-(10 + Math.mod(h, 80)));
                nextReview = lastReview.addYears(1);
            } else {
                expiry = today.addDays(30 + Math.mod(h, 60));
                lastReview = today.addDays(-(300 + Math.mod(h, 50)));
                nextReview = lastReview.addYears(1);
            }

            if (!hasDoc.contains(a.Id)) {
                newDocs.add(new FinServ__IdentificationDocument__c(
                    FinServ__Account__c = a.Id,
                    FinServ__DocumentType__c = Math.mod(h, 2) == 0 ? 'Passport' : 'License',
                    FinServ__IssueDate__c = expiry.addYears(-10),
                    FinServ__ExpirationDate__c = expiry,
                    FinServ__SourceSystemId__c = PREFIX + String.valueOf(a.Id)
                ));
            }

            Account u = new Account(Id = a.Id);
            Boolean changed = false;
            if (a.FinServ__LastReview__c == null) { u.FinServ__LastReview__c = lastReview; changed = true; }
            if (a.FinServ__NextReview__c == null) { u.FinServ__NextReview__c = nextReview; changed = true; }
            if (a.FinServ__ReviewFrequency__c == null) { u.FinServ__ReviewFrequency__c = 'Annually'; changed = true; }
            if (changed) toUpdate.add(u);
        }

        if (!newDocs.isEmpty()) log('insert document', Database.insert(newDocs, false));
        if (!toUpdate.isEmpty()) log('update account', Database.update(toUpdate, false));
    }

    private static void log(String what, List<Database.SaveResult> res) {
        for (Database.SaveResult r : res) {
            if (!r.isSuccess()) {
                System.debug(LoggingLevel.ERROR, 'KycHydrator ' + what + ' failed: '
                    + r.getErrors()[0].getStatusCode() + ' ' + r.getErrors()[0].getMessage());
            }
        }
    }
}
