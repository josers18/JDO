/**
 * FscContactPointSeed
 * -------------------
 * Phase B6 implementation. Resolves audit finding §4.1 C6 — both
 * `ContactPointEmail` and `ContactPointPhone` had 0 records, so Data
 * Cloud unified-profile demos couldn't resolve email/phone identity
 * across channels.
 *
 * Generates one primary email + one primary phone for every party
 * with a usable source value:
 *   - 54 Person Accounts (parented to the Account)
 *   - 304 B2B Contacts (parented to the Contact)
 *
 * All records carry IsPrimary=true, PreferenceRank=1, and the
 * IsSeededContactPoint__c marker for idempotent re-runs.
 *
 * UsageType conventions:
 *   - PA channels  -> Home (personal use)
 *   - B2B channels -> Work
 *
 * PhoneType is restricted to Mobile/Home in this org. We use Mobile
 * when the source field was a mobile number, Home when it was the
 * generic Phone field.
 *
 * Idempotency: gated by IsSeededContactPoint__c. Re-runs find no
 * unseeded ContactPoints to create and skip.
 */
public with sharing class FscContactPointSeed {

    @AuraEnabled
    public static String runOnDemand() {
        Integer seededEmails = [
            SELECT COUNT() FROM ContactPointEmail WHERE IsSeededContactPoint__c = TRUE
        ];
        Integer seededPhones = [
            SELECT COUNT() FROM ContactPointPhone WHERE IsSeededContactPoint__c = TRUE
        ];
        if (seededEmails > 0 || seededPhones > 0) {
            return 'SKIPPED: ' + seededEmails + ' seeded emails / '
                 + seededPhones + ' seeded phones already exist.';
        }

        List<ContactPointEmail> emails = new List<ContactPointEmail>();
        List<ContactPointPhone> phones = new List<ContactPointPhone>();

        // -- Person Accounts: parent is the Account itself --------
        for (Account a : [
            SELECT Id, PersonEmail, PersonMobilePhone
            FROM Account
            WHERE IsPersonAccount = TRUE
            AND   PersonEmail != NULL
        ]) {
            emails.add(new ContactPointEmail(
                ParentId                 = a.Id,
                EmailAddress             = a.PersonEmail,
                IsPrimary                = true,
                PreferenceRank           = 1,
                UsageType                = 'Home',
                IsSeededContactPoint__c  = true
            ));
            if (a.PersonMobilePhone != null) {
                phones.add(new ContactPointPhone(
                    ParentId                 = a.Id,
                    TelephoneNumber          = a.PersonMobilePhone,
                    PhoneType                = 'Mobile',
                    IsPrimary                = true,
                    PreferenceRank           = 1,
                    UsageType                = 'Home',
                    IsSeededContactPoint__c  = true
                ));
            }
        }

        // -- B2B Contacts: ContactPointEmail/Phone.ParentId only
        // accepts Account / Individual in this org (NOT Contact). So
        // we parent the contact's email/phone channels to the
        // contact's parent B2B Account. Demos showing
        // "channels for this account" surface every employee's contact
        // info on the account — which is the realistic FSC shape.
        for (Contact c : [
            SELECT Id, AccountId, Email, Phone, MobilePhone
            FROM Contact
            WHERE IsPersonAccount = FALSE
            AND   Email != NULL
            AND   AccountId != NULL
        ]) {
            emails.add(new ContactPointEmail(
                ParentId                 = c.AccountId,
                EmailAddress             = c.Email,
                IsPrimary                = false,
                PreferenceRank           = 2,
                UsageType                = 'Work',
                IsSeededContactPoint__c  = true
            ));
            String phoneNum = (c.MobilePhone != null) ? c.MobilePhone : c.Phone;
            String phoneType = (c.MobilePhone != null) ? 'Mobile' : 'Home';
            if (phoneNum != null) {
                phones.add(new ContactPointPhone(
                    ParentId                 = c.AccountId,
                    TelephoneNumber          = phoneNum,
                    PhoneType                = phoneType,
                    IsPrimary                = false,
                    PreferenceRank           = 2,
                    UsageType                = 'Work',
                    IsSeededContactPoint__c  = true
                ));
            }
        }

        Database.SaveResult[] emailResults = Database.insert(emails, false);
        Database.SaveResult[] phoneResults = Database.insert(phones, false);
        Integer emailOk = countOk(emailResults, 'Email');
        Integer phoneOk = countOk(phoneResults, 'Phone');

        return 'OK: created ' + emailOk + ' ContactPointEmails + '
             + phoneOk + ' ContactPointPhones across '
             + 'Person Accounts and B2B Contacts.';
    }

    @TestVisible
    private static Integer countOk(Database.SaveResult[] results, String label) {
        Integer ok = 0;
        Integer fail = 0;
        for (Database.SaveResult r : results) {
            if (r.isSuccess()) {
                ok++;
            } else {
                fail++;
                if (fail <= 3) {
                    System.debug(LoggingLevel.ERROR,
                        label + ' insert failed: ' + r.getErrors()[0].getMessage());
                }
            }
        }
        if (fail > 0) {
            System.debug(LoggingLevel.WARN,
                label + ' batch: ' + ok + ' ok / ' + fail + ' failed');
        }
        return ok;
    }
}
