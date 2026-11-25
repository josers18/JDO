@IsTest
private class MeetingNoteMigrationTest {
    private static List<ContentVersion> migrated(Id noteId) {
        return [SELECT Id, Title, VersionData, ContentDocumentId, ContentModifiedDate
                FROM ContentVersion WHERE External_ID__c = :('migrated:' + noteId)];
    }

    @IsTest
    static void migratesNoteWithTitleBodyAndLink() {
        Account a = new Account(Name = 'Mig Test');
        insert a;
        Meeting_Note__c m = new Meeting_Note__c(
            Title__c = 'Quarterly Check-In', Notes__c = 'A & B <ok> it\'s "q"\nline2',
            Date__c = Date.newInstance(2025, 9, 3), Account__c = a.Id);
        insert m;

        Test.startTest();
        Integer n = MeetingNoteMigration.run();
        Test.stopTest();

        System.assertEquals(1, n);
        List<ContentVersion> cvs = migrated(m.Id);
        System.assertEquals(1, cvs.size());
        System.assertEquals('Quarterly Check-In', cvs[0].Title);
        System.assertEquals('A &amp; B &lt;ok&gt; it&#39;s &quot;q&quot;<br>line2', cvs[0].VersionData.toString());
        System.assertEquals(Datetime.newInstanceGmt(2025, 9, 3, 0, 0, 0), cvs[0].ContentModifiedDate);
        List<ContentDocumentLink> links = [SELECT ShareType, Visibility FROM ContentDocumentLink
            WHERE ContentDocumentId = :cvs[0].ContentDocumentId AND LinkedEntityId = :a.Id];
        System.assertEquals(1, links.size());
        System.assertEquals('AllUsers', links[0].Visibility);
        System.assertEquals(1, [SELECT COUNT() FROM Meeting_Note__c WHERE Id = :m.Id], 'original kept');
    }

    @IsTest
    static void skipsNoteWithoutAccount() {
        Meeting_Note__c m = new Meeting_Note__c(Title__c = 'Orphan', Notes__c = 'x', Date__c = Date.today());
        insert m;
        Integer n = MeetingNoteMigration.run();
        System.assertEquals(0, n);
        System.assertEquals(0, migrated(m.Id).size());
    }

    @IsTest
    static void rerunDoesNotDuplicate() {
        Account a = new Account(Name = 'Mig Test 2');
        insert a;
        Meeting_Note__c m = new Meeting_Note__c(Title__c = 'T', Notes__c = 'x', Date__c = Date.today(), Account__c = a.Id);
        insert m;
        System.assertEquals(1, MeetingNoteMigration.run());
        System.assertEquals(0, MeetingNoteMigration.run());
        System.assertEquals(1, migrated(m.Id).size());
    }
}
