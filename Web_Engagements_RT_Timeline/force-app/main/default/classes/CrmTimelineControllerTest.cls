@IsTest
private class CrmTimelineControllerTest {

    @TestSetup
    static void setupAccountAndContact() {
        Account a = new Account(Name = 'Timeline Test Account');
        insert a;
        Contact c = new Contact(LastName = 'Timeline Test Contact', AccountId = a.Id);
        insert c;
    }

    @IsTest
    static void unsupportedRecordIdThrows() {
        Account a = [SELECT Id FROM Account LIMIT 1];
        Opportunity o = new Opportunity(Name = 'O', StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30), AccountId = a.Id);
        insert o;

        Boolean threw = false;
        try {
            Test.startTest();
            CrmTimelineController.getCrmTimelineEvents(o.Id, new List<String>{ 'case' }, 90);
            Test.stopTest();
        } catch (AuraHandledException e) {
            threw = true;
            System.assert(
                String.isNotBlank(e.getMessage()),
                'AuraHandledException should carry a message.'
            );
        }
        System.assert(threw, 'Expected AuraHandledException for non-Account/non-Contact recordId.');
    }

    @IsTest
    static void emptyEnabledSourcesReturnsEmpty() {
        Account a = [SELECT Id FROM Account LIMIT 1];

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>(), 90);
        Test.stopTest();

        System.assertEquals(0, result.size(), 'Empty enabledSources should yield empty list.');
    }

    @IsTest
    static void whitelistRejectsUnknownSources() {
        Account a = [SELECT Id FROM Account LIMIT 1];

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(
                a.Id,
                new List<String>{ 'malicious_source', 'unknown_source' },
                90
            );
        Test.stopTest();

        System.assertEquals(0, result.size(),
            'Sources not in ALLOWED_SOURCES whitelist should be silently dropped.');
    }
}
