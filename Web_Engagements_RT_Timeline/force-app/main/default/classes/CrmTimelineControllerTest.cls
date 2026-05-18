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

    @IsTest
    static void eventsHappyPathReturnsTimelineEvents() {
        Account a = [SELECT Id FROM Account LIMIT 1];

        Event meeting = new Event(
            Subject = 'Quarterly review',
            StartDateTime = Datetime.now().addDays(-1),
            DurationInMinutes = 30,
            Location = 'HQ Conference Room',
            WhatId = a.Id
        );
        insert meeting;

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'event' }, 90);
        Test.stopTest();

        System.assertEquals(1, result.size());
        CrmTimelineController.TimelineEvent t = result[0];
        System.assertEquals('event', t.source);
        System.assertEquals('standard:event', t.iconName);
        System.assertEquals('Quarterly review', t.title);
        System.assertEquals('HQ Conference Room', t.subtitle,
            'Location should be the subtitle when present.');
        System.assert(t.recordUrl.startsWith('/lightning/r/Event/'));
    }

    @IsTest
    static void voiceCallSourceDoesNotThrowEvenWhenAbsent() {
        Account a = [SELECT Id FROM Account LIMIT 1];

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'voice' }, 90);
        Test.stopTest();

        // Either Voice isn't provisioned (Schema.getGlobalDescribe lookup fails)
        // and we get [] silently, or it is provisioned and there are no calls
        // for this fresh Test Account. Both paths return empty without throwing.
        System.assertNotEquals(null, result);
        System.assertEquals(0, result.size(),
            'Fresh Test Account should have no VoiceCall records (or Voice is absent).');
    }

    @IsTest
    static void multiSourceMergedAndSortedDesc() {
        Account a = [SELECT Id FROM Account LIMIT 1];

        // Insert a Case (CreatedDate is now), a Task with ActivityDate -5d,
        // and an Event -2d. Result sorted DESC: case, event, task.
        Case c = new Case(Subject = 'Newest', Status = 'New', AccountId = a.Id);
        insert c;
        Task task = new Task(
            Subject = 'Older Task',
            Type = 'Email',
            ActivityDate = Date.today().addDays(-5),
            WhatId = a.Id
        );
        insert task;
        Event evt = new Event(
            Subject = 'Middle Event',
            StartDateTime = Datetime.now().addDays(-2),
            DurationInMinutes = 30,
            WhatId = a.Id
        );
        insert evt;

        Test.startTest();
        List<CrmTimelineController.TimelineEvent> result =
            CrmTimelineController.getCrmTimelineEvents(
                a.Id,
                new List<String>{ 'case', 'task', 'event' },
                90
            );
        Test.stopTest();

        System.assertEquals(3, result.size());
        System.assertEquals('case',  result[0].source);
        System.assertEquals('event', result[1].source);
        System.assertEquals('task',  result[2].source);
    }

    @IsTest
    static void lookbackDaysClampingBehavior() {
        Account a = [SELECT Id FROM Account LIMIT 1];
        // Insert a Case 200 days ago (within MAX_LOOKBACK_DAYS=365 but outside
        // any caller's request below 200).
        Case c = new Case(Subject = 'Old', Status = 'New', AccountId = a.Id);
        insert c;
        // Backdate CreatedDate via Test.setCreatedDate for assertion accuracy.
        Test.setCreatedDate(c.Id, Datetime.now().addDays(-200));

        Test.startTest();
        // Within window: 250 days lookback should include the 200-day-old case.
        List<CrmTimelineController.TimelineEvent> within =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'case' }, 250);
        // Outside window: 100 days lookback should exclude it.
        List<CrmTimelineController.TimelineEvent> outside =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'case' }, 100);
        // Null defaults to 90 days, also excluded.
        List<CrmTimelineController.TimelineEvent> nullDays =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'case' }, null);
        // Negative also defaults to 90, excluded.
        List<CrmTimelineController.TimelineEvent> negativeDays =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'case' }, -5);
        // Wildly large clamps to MAX_LOOKBACK_DAYS=365, still includes 200-day case.
        List<CrmTimelineController.TimelineEvent> huge =
            CrmTimelineController.getCrmTimelineEvents(a.Id, new List<String>{ 'case' }, 99999);
        Test.stopTest();

        System.assertEquals(1, within.size(),       '250-day lookback should include 200-day-old case.');
        System.assertEquals(0, outside.size(),      '100-day lookback should exclude 200-day-old case.');
        System.assertEquals(0, nullDays.size(),     'null lookbackDays should default to 90 (excluded).');
        System.assertEquals(0, negativeDays.size(), 'negative lookbackDays should default to 90 (excluded).');
        System.assertEquals(1, huge.size(),         'huge lookbackDays should clamp to 365 (included).');
    }
}
