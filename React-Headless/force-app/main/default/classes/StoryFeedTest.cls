@IsTest
private class StoryFeedTest {

    private static final Date D1 = Date.newInstance(2026, 1, 5);

    @TestSetup
    static void setup() {
        insert new List<Account>{
            new Account(Name = 'Story A'), new Account(Name = 'Story B'), new Account(Name = 'Story C')
        };
    }

    // Runs the batch synchronously for a given date over all test accounts.
    private static void runOn(Date d) {
        StoryFeed job = new StoryFeed(3, d);
        List<SObject> scope = new List<SObject>();
        for (SObject s : job.start(null)) scope.add(s);
        job.execute(null, scope);
        job.finish(null);
    }

    private static Integer notesOn(Id accountId) {
        return [SELECT COUNT() FROM ContentDocumentLink WHERE LinkedEntityId = :accountId];
    }

    @IsTest
    static void createsAllRecordsPerAccount() {
        Test.startTest();
        Id jobId = StoryFeed.run(3);
        Test.stopTest();
        System.assertNotEquals(null, jobId);
        for (Account a : [SELECT Id FROM Account]) {
            System.assertEquals(1, [SELECT COUNT() FROM Interaction WHERE AccountId = :a.Id]);
            System.assertEquals(1, [SELECT COUNT() FROM InteractionSummary WHERE AccountId = :a.Id]);
            System.assertEquals(1, notesOn(a.Id));
            String s = StoryFeed.stem(a.Id, Date.today(), 1);
            System.assertEquals(1, [SELECT COUNT() FROM ContentVersion WHERE External_ID__c = :s]);
            Interaction i = [SELECT Id, External_ID__c, Description FROM Interaction WHERE AccountId = :a.Id];
            System.assertEquals(s, i.External_ID__c);
            System.assert(String.isNotBlank(i.Description));
            System.assertEquals(i.Id, [SELECT InteractionId FROM InteractionSummary WHERE AccountId = :a.Id].InteractionId);
        }
    }

    @IsTest
    static void stemFormat() {
        Id accId = [SELECT Id FROM Account LIMIT 1].Id;
        System.assertEquals('story:' + accId + ':20260105:1', StoryFeed.stem(accId, D1, 1));
    }

    @IsTest
    static void rerunCreatesNoDuplicates() {
        Test.startTest();
        runOn(D1);
        runOn(D1);
        Test.stopTest();
        System.assertEquals(3, [SELECT COUNT() FROM Interaction]);
        System.assertEquals(3, [SELECT COUNT() FROM InteractionSummary]);
        System.assertEquals(3, [SELECT COUNT() FROM ContentVersion WHERE External_ID__c LIKE 'story:%']);
        for (Account a : [SELECT Id FROM Account]) System.assertEquals(1, notesOn(a.Id));
    }

    @IsTest
    static void retentionExpiresOldGenerated() {
        Account a = [SELECT Id FROM Account WHERE Name = 'Story A'];
        ContentVersion manual = new ContentVersion(Title = 'Manual note', PathOnClient = 'Manual note.snote',
            VersionData = Blob.valueOf('kept'));
        insert manual;
        Id manualDoc = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :manual.Id].ContentDocumentId;
        insert new ContentDocumentLink(ContentDocumentId = manualDoc, LinkedEntityId = a.Id, ShareType = 'I', Visibility = 'AllUsers');

        Test.startTest();
        runOn(D1);
        runOn(D1.addDays(31));
        runOn(D1.addDays(62));
        runOn(D1.addDays(93));
        Test.stopTest();

        String oldest = StoryFeed.stem(a.Id, D1, 1);
        System.assertEquals(0, [SELECT COUNT() FROM Interaction WHERE External_ID__c = :oldest]);
        System.assertEquals(0, [SELECT COUNT() FROM InteractionSummary WHERE External_ID__c = :oldest]);
        System.assertEquals(0, [SELECT COUNT() FROM ContentVersion WHERE External_ID__c = :oldest]);
        System.assertEquals(3, [SELECT COUNT() FROM Interaction WHERE AccountId = :a.Id]);
        System.assertEquals(3, [SELECT COUNT() FROM InteractionSummary WHERE AccountId = :a.Id]);
        System.assertEquals(1, [SELECT COUNT() FROM ContentDocument WHERE Id = :manualDoc]);
        System.assertEquals(4, notesOn(a.Id)); // 3 generated + the manual note
        for (Account other : [SELECT Id FROM Account WHERE Id != :a.Id]) {
            System.assertEquals(3, [SELECT COUNT() FROM Interaction WHERE AccountId = :other.Id]);
            System.assertEquals(3, [SELECT COUNT() FROM InteractionSummary WHERE AccountId = :other.Id]);
            System.assertEquals(3, notesOn(other.Id));
        }
    }

    @IsTest
    static void repairsIncompleteRecentStem() {
        Account a = [SELECT Id FROM Account WHERE Name = 'Story A'];
        Date yesterday = D1.addDays(-1);
        String s = StoryFeed.stem(a.Id, yesterday, 1);
        // Seed a partial story from a failed run: Interaction + linked note, no summary.
        Interaction i = new Interaction(External_ID__c = s, Name = 'Partial', AccountId = a.Id,
            InteractionType = 'Phone Call', Description = 'partial');
        insert i;
        StoryTemplates.Story st = new StoryTemplates.Story();
        st.title = 'Partial';
        st.transcript = 'partial';
        ContentVersion cv = StoryFeed.note(s, st);
        insert cv;
        Id docId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id].ContentDocumentId;
        insert new ContentDocumentLink(ContentDocumentId = docId, LinkedEntityId = a.Id, ShareType = 'I', Visibility = 'AllUsers');

        Test.startTest();
        runOn(D1);
        Test.stopTest();

        System.assertEquals(1, [SELECT COUNT() FROM Interaction WHERE AccountId = :a.Id]);
        InteractionSummary sum = [SELECT InteractionId, External_ID__c FROM InteractionSummary WHERE AccountId = :a.Id];
        System.assertEquals(s, sum.External_ID__c);
        System.assertEquals(i.Id, sum.InteractionId);
        System.assertEquals(1, [SELECT COUNT() FROM ContentVersion WHERE External_ID__c LIKE :('story:' + a.Id + ':%')]);
        System.assertEquals(1, notesOn(a.Id));
        String today = StoryFeed.stem(a.Id, D1, 1);
        System.assertEquals(0, [SELECT COUNT() FROM Interaction WHERE External_ID__c = :today]);
    }

    @IsTest
    static void noSignalsGetsRoutineCheckIn() {
        for (Account a : [SELECT FinServ__KYCStatus__c, Tier__c FROM Account]) {
            System.assertEquals(null, a.FinServ__KYCStatus__c);
            System.assertEquals(null, a.Tier__c);
        }
        Test.startTest();
        runOn(D1);
        Test.stopTest();
        List<InteractionSummary> sums = [SELECT InteractionPurpose, MeetingNotes FROM InteractionSummary];
        System.assertEquals(3, sums.size());
        for (InteractionSummary s : sums) {
            System.assertEquals('Relationship Review', s.InteractionPurpose);
            System.assert(String.isNotBlank(s.MeetingNotes));
        }
    }

    @IsTest
    static void rotatingSliceCoversDifferentAccounts() {
        System.assertEquals(0, StoryFeed.sliceOffset(3, 1, 3));
        System.assertEquals(1, StoryFeed.sliceOffset(4, 1, 3));
        System.assertEquals(2, StoryFeed.sliceOffset(5, 1, 3));
        System.assertEquals(4, StoryFeed.sliceOffset(2, 50, 96));

        Set<Id> seen = new Set<Id>();
        for (Integer k = 0; k < 3; k++) {
            List<SObject> slice = new List<SObject>();
            for (SObject o : new StoryFeed(1, D1.addDays(k)).start(null)) slice.add(o);
            System.assertEquals(1, slice.size());
            seen.add(slice[0].Id);
        }
        System.assertEquals(3, seen.size(), 'three consecutive days cover all three accounts');
    }

    @IsTest
    static void skipsAccountWithinThirtyDays() {
        Test.startTest();
        runOn(D1);
        runOn(D1.addDays(29));
        Test.stopTest();
        System.assertEquals(3, [SELECT COUNT() FROM Interaction]);
        for (Account a : [SELECT Id FROM Account]) {
            String later = StoryFeed.stem(a.Id, D1.addDays(29), 1);
            System.assertEquals(0, [SELECT COUNT() FROM Interaction WHERE External_ID__c = :later]);
        }
    }

    @IsTest
    static void accountWithoutOwnerStillGetsStory() {
        // OwnerId cannot be null, so use an account whose owner is deactivated.
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        String uname = 'storyfeed.' + System.currentTimeMillis() + '@example.com.test';
        User u = new User(Alias = 'sfeed', Email = uname, Username = uname, LastName = 'Feed', ProfileId = p.Id,
            TimeZoneSidKey = 'America/New_York', LocaleSidKey = 'en_US', EmailEncodingKey = 'UTF-8', LanguageLocaleKey = 'en_US');
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert u;
        }
        Account a = [SELECT Id FROM Account WHERE Name = 'Story B'];
        a.OwnerId = u.Id;
        update a;
        System.runAs(new User(Id = UserInfo.getUserId())) {
            u.IsActive = false;
            update u;
        }

        Test.startTest();
        runOn(D1);
        Test.stopTest();
        System.assertEquals(1, [SELECT COUNT() FROM Interaction WHERE AccountId = :a.Id]);
        System.assertEquals(1, [SELECT COUNT() FROM InteractionSummary WHERE AccountId = :a.Id]);
        System.assertEquals(1, notesOn(a.Id));
    }

    @IsTest
    static void noteBodyEscaping() {
        String transcript = 'RM: Fees < 1% & no minimum.\nClient: Great > expected.';
        System.assertEquals('RM: Fees &lt; 1% &amp; no minimum.<br>Client: Great &gt; expected.',
            StoryFeed.escapeHtml(transcript));

        StoryTemplates.Story st = new StoryTemplates.Story();
        st.title = 'Escape check';
        st.transcript = transcript;
        Id accId = [SELECT Id FROM Account LIMIT 1].Id;
        ContentVersion cv = StoryFeed.note(StoryFeed.stem(accId, D1, 1), st);
        insert cv;
        Id docId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id].ContentDocumentId;
        ContentNote n = [SELECT Content, FileType FROM ContentNote WHERE Id = :docId];
        System.assertEquals('SNOTE', n.FileType);
        String body = n.Content.toString();
        String back = body.replaceAll('(?i)<p>|</p>', '').replace('<br>', '\n')
            .replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&');
        System.assertEquals(transcript, back, 'stored body: ' + body);
    }
}
