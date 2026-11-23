@IsTest
private class KycHydratorTest {

    private static Account mk(String name, String status) {
        Account a = new Account(Name = name, FinServ__KYCStatus__c = status);
        insert a;
        return requery(a.Id);
    }

    private static Account requery(Id id) {
        return [SELECT Id, FinServ__KYCStatus__c, FinServ__LastReview__c, FinServ__NextReview__c,
                       FinServ__ReviewFrequency__c FROM Account WHERE Id = :id];
    }

    private static List<FinServ__IdentificationDocument__c> docs(Id accId) {
        return [SELECT Id, FinServ__ExpirationDate__c, FinServ__IssueDate__c, FinServ__DocumentType__c,
                       FinServ__SourceSystemId__c FROM FinServ__IdentificationDocument__c
                WHERE FinServ__Account__c = :accId];
    }

    @IsTest
    static void expiredStatusGetsExpiredDocument() {
        Account a = mk('Kyc Expired', 'Expired');
        Test.startTest();
        KycHydrator.hydrate(new List<Account>{ a });
        Test.stopTest();
        List<FinServ__IdentificationDocument__c> d = docs(a.Id);
        System.assertEquals(1, d.size());
        System.assertEquals('kyc:' + a.Id, d[0].FinServ__SourceSystemId__c);
        System.assert(d[0].FinServ__ExpirationDate__c < Date.today());
        System.assert(d[0].FinServ__IssueDate__c < d[0].FinServ__ExpirationDate__c);
        Account r = requery(a.Id);
        System.assert(r.FinServ__NextReview__c < Date.today());
        System.assert(r.FinServ__LastReview__c < r.FinServ__NextReview__c);
        System.assertNotEquals(null, r.FinServ__ReviewFrequency__c);
        System.assertEquals('Expired', r.FinServ__KYCStatus__c);
    }

    @IsTest
    static void validStatusGetsFutureDocument() {
        Account a = mk('Kyc Valid', 'Completed - Valid');
        Test.startTest();
        KycHydrator.hydrate(new List<Account>{ a });
        Test.stopTest();
        List<FinServ__IdentificationDocument__c> d = docs(a.Id);
        System.assertEquals(1, d.size());
        System.assert(d[0].FinServ__ExpirationDate__c >= Date.today().addYears(1));
        Account r = requery(a.Id);
        System.assert(r.FinServ__NextReview__c > Date.today());
        System.assert(r.FinServ__LastReview__c <= Date.today());
    }

    @IsTest
    static void existingDocumentUntouched() {
        Account a = mk('Kyc Existing', 'Expired');
        Date exp = Date.today().addYears(5);
        insert new FinServ__IdentificationDocument__c(FinServ__Account__c = a.Id,
            FinServ__DocumentType__c = 'Passport', FinServ__ExpirationDate__c = exp);
        Test.startTest();
        KycHydrator.hydrate(new List<Account>{ a });
        Test.stopTest();
        List<FinServ__IdentificationDocument__c> d = docs(a.Id);
        System.assertEquals(1, d.size());
        System.assertEquals(exp, d[0].FinServ__ExpirationDate__c);
    }

    @IsTest
    static void existingReviewDatesUntouched() {
        Account a = mk('Kyc Dates', 'Expired');
        a.FinServ__LastReview__c = Date.newInstance(2020, 1, 1);
        a.FinServ__NextReview__c = Date.newInstance(2030, 1, 1);
        a.FinServ__ReviewFrequency__c = 'Monthly';
        update a;
        Test.startTest();
        KycHydrator.hydrate(new List<Account>{ requery(a.Id) });
        Test.stopTest();
        Account r = requery(a.Id);
        System.assertEquals(Date.newInstance(2020, 1, 1), r.FinServ__LastReview__c);
        System.assertEquals(Date.newInstance(2030, 1, 1), r.FinServ__NextReview__c);
        System.assertEquals('Monthly', r.FinServ__ReviewFrequency__c);
    }

    @IsTest
    static void rerunNoDuplicateDocument() {
        Account a = mk('Kyc Rerun', 'In progress');
        Test.startTest();
        KycHydrator.hydrate(new List<Account>{ a });
        KycHydrator.hydrate(new List<Account>{ requery(a.Id) });
        Test.stopTest();
        System.assertEquals(1, [SELECT COUNT() FROM FinServ__IdentificationDocument__c
                                WHERE FinServ__SourceSystemId__c = :('kyc:' + a.Id)]);
        System.assert(docs(a.Id)[0].FinServ__ExpirationDate__c > Date.today());
    }
}
