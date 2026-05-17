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

    @IsTest
    static void casesHappyPathReturnsTimelineEvents() {
        Account a = [SELECT Id FROM Account LIMIT 1];

        Case c1 = new Case(Subject = 'Statement discrepancy', Status = 'New', AccountId = a.Id);
        Case c2 = new Case(Subject = 'Loan question',         Status = 'Working', AccountId = a.Id);
        insert new List<Case>{ c1, c2 };

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'case' }, 90);
        Test.stopTest();

        System.assertEquals(2, result.size(), 'Both Cases should be returned.');
        Set<String> titles = new Set<String>();
        for (CrmTimelineController.TimelineEvent t : result) {
            titles.add(t.title);
            System.assertEquals('case', t.source, 'Source should be case.');
            System.assertEquals('Case', t.sourceLabel);
            System.assertEquals('standard:case', t.iconName);
            System.assertEquals('#c23934', t.iconColor);
            System.assertNotEquals(null, t.occurredAt, 'occurredAt should be populated from CreatedDate.');
            System.assert(t.recordUrl.startsWith('/lightning/r/Case/'), 'recordUrl should be a Case path.');
            System.assert(t.subtitle.contains('owner '), 'Subtitle should mention owner.');
            System.assertEquals(3, t.details.size());
        }
        System.assert(titles.contains('Statement discrepancy'));
        System.assert(titles.contains('Loan question'));
    }

    @IsTest
    static void casesContactPagePath() {
        Contact c = [SELECT Id FROM Contact LIMIT 1];
        Case caseRecord = new Case(Subject = 'Contact-page Case', Status = 'New', ContactId = c.Id);
        insert caseRecord;

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(c.Id, new List<String>{ 'case' }, 90);
        Test.stopTest();

        System.assertEquals(1, result.size());
        System.assertEquals('Contact-page Case', result[0].title);
    }

    @IsTest
    static void tasksHappyPathReturnsBothTaskAndLoggedCall() {
        Account a = [SELECT Id FROM Account LIMIT 1];

        Task plain = new Task(
            Subject = 'Follow up email',
            Type = 'Email',
            ActivityDate = Date.today(),
            WhatId = a.Id
        );
        Task call = new Task(
            Subject = 'Outbound to Jane',
            Type = 'Call',
            CallType = 'Outbound',
            ActivityDate = Date.today(),
            WhatId = a.Id
        );
        insert new List<Task>{ plain, call };

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'task' }, 90);
        Test.stopTest();

        System.assertEquals(2, result.size());

        Map<String, CrmTimelineController.TimelineEvent> bySubject = new Map<String, CrmTimelineController.TimelineEvent>();
        for (CrmTimelineController.TimelineEvent t : result) bySubject.put(t.title, t);

        CrmTimelineController.TimelineEvent emailEvt = bySubject.get('Follow up email');
        System.assertEquals('standard:task', emailEvt.iconName,
            'Plain task should use the task icon (CallType blank).');
        System.assertEquals('Email', emailEvt.subtitle);

        CrmTimelineController.TimelineEvent callEvt = bySubject.get('Outbound to Jane');
        System.assertEquals('standard:log_a_call', callEvt.iconName,
            'Logged call (CallType populated) should use the call icon.');
        System.assertEquals('Call on Outbound', callEvt.subtitle);
        Boolean hasCallTypeDetail = false;
        for (CrmTimelineController.DetailField d : callEvt.details) {
            if (d.label == 'Call Type') hasCallTypeDetail = true;
        }
        System.assert(hasCallTypeDetail, 'Logged call should include a Call Type detail row.');
    }
}
