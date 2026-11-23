/**
 * One-off: copies each Meeting_Note__c (with an Account) to a ContentNote linked to that Account.
 * Marker ContentVersion.External_ID__c = 'migrated:<recordId>' makes reruns skip done rows.
 * Originals are kept. Run: MeetingNoteMigration.run();
 */
public with sharing class MeetingNoteMigration {
    public static Integer run() {
        List<Meeting_Note__c> all = [SELECT Id, Title__c, Notes__c, Date__c, Account__c FROM Meeting_Note__c ORDER BY CreatedDate];
        List<Id> skipped = new List<Id>();
        Map<String, Meeting_Note__c> byMarker = new Map<String, Meeting_Note__c>();
        for (Meeting_Note__c m : all) {
            if (m.Account__c == null) skipped.add(m.Id);
            else byMarker.put('migrated:' + m.Id, m);
        }
        if (!skipped.isEmpty()) System.debug('MeetingNoteMigration skipped (no Account): ' + skipped);
        for (ContentVersion done : [SELECT External_ID__c FROM ContentVersion WHERE External_ID__c IN :byMarker.keySet()]) {
            byMarker.remove(done.External_ID__c);
        }

        List<ContentVersion> cvs = new List<ContentVersion>();
        List<Meeting_Note__c> source = new List<Meeting_Note__c>();
        for (String marker : byMarker.keySet()) {
            Meeting_Note__c m = byMarker.get(marker);
            String title = String.isBlank(m.Title__c) ? 'Meeting note' : m.Title__c;
            String body = escapeHtml(m.Notes__c);
            ContentVersion cv = new ContentVersion(
                Title = title.left(255),
                PathOnClient = title.left(249) + '.snote',
                VersionData = Blob.valueOf(String.isBlank(body) ? ' ' : body),
                External_ID__c = marker);
            if (m.Date__c != null && m.Date__c < Date.today()) {
                cv.ContentModifiedDate = Datetime.newInstanceGmt(m.Date__c, Time.newInstance(0, 0, 0, 0));
            }
            cvs.add(cv);
            source.add(m);
        }
        if (cvs.isEmpty()) return 0;
        insert cvs;

        Map<Id, Id> docByCv = new Map<Id, Id>();
        for (ContentVersion cv : [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id IN :cvs]) {
            docByCv.put(cv.Id, cv.ContentDocumentId);
        }
        List<ContentDocumentLink> links = new List<ContentDocumentLink>();
        for (Integer i = 0; i < cvs.size(); i++) {
            links.add(new ContentDocumentLink(ContentDocumentId = docByCv.get(cvs[i].Id),
                LinkedEntityId = source[i].Account__c, ShareType = 'I', Visibility = 'AllUsers'));
        }
        insert links;
        return cvs.size();
    }

    @TestVisible
    private static String escapeHtml(String text) {
        if (text == null) return '';
        return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;').replace('\'', '&#39;')
            .replace('\r\n', '\n').replace('\n', '<br>');
    }
}
