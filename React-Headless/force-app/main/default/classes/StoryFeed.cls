/**
 * Generates one deterministic relationship story per Account:
 * Interaction + InteractionSummary + ContentNote (ContentVersion + ContentDocumentLink).
 * Every generated record carries External_ID__c = story:<accountId>:<yyyymmdd>:<n>, so reruns upsert.
 * Rules: at most one new story per account per 30 days; keep the latest 3 generated stories per account.
 * No VoiceCall, no Case, no callouts.
 */
public with sharing class StoryFeed implements Database.Batchable<SObject>, Database.Stateful, Schedulable {

    public static final String PREFIX = 'story:';
    public static final String CRON = '0 0 2 * * ?';
    private static final Integer SCOPE_SIZE = 50;
    private static final Integer KEEP = 3;
    private static final Integer MIN_GAP_DAYS = 30;

    private final Integer chunkSize;
    private final Date onDate;
    private Integer created = 0;
    private Integer skipped = 0;
    private Integer failed = 0;
    private Integer expired = 0;

    public StoryFeed(Integer chunkSize) {
        this(chunkSize, Date.today());
    }

    @TestVisible
    private StoryFeed(Integer chunkSize, Date onDate) {
        this.chunkSize = chunkSize;
        this.onDate = onDate;
    }

    /** Starts the batch over today's account slice of the given size. Returns the job Id. */
    public static Id run(Integer chunkSize) {
        return Database.executeBatch(new StoryFeed(chunkSize), SCOPE_SIZE);
    }

    public static String stem(Id accountId, Date onDate, Integer n) {
        return PREFIX + String.valueOf(accountId) + ':' + ymd(onDate) + ':' + n;
    }

    public void execute(SchedulableContext ctx) {
        Database.executeBatch(new StoryFeed(chunkSize), SCOPE_SIZE);
    }

    /** Rotating slice: accounts ordered by Id, offset by day-of-year x chunk size, wrapping. */
    public Iterable<SObject> start(Database.BatchableContext ctx) {
        List<Account> all = [SELECT Id FROM Account ORDER BY Id];
        List<Account> slice = new List<Account>();
        Integer total = all.size();
        if (total == 0 || chunkSize == null || chunkSize <= 0) {
            return slice;
        }
        Integer take = Math.min(chunkSize, total);
        Integer offset = sliceOffset(onDate.dayOfYear(), chunkSize, total);
        for (Integer i = 0; i < take; i++) {
            slice.add(all[Math.mod(offset + i, total)]);
        }
        return slice;
    }

    public void execute(Database.BatchableContext ctx, List<SObject> scope) {
        Set<Id> ids = new Map<Id, SObject>(scope).keySet();
        List<Account> accounts = [SELECT Id, FinServ__KYCStatus__c, Tier__c, FinServ__LastReview__c,
                                  FinServ__NextReview__c, FinServ__ReviewFrequency__c FROM Account WHERE Id IN :ids];
        KycHydrator.hydrate(accounts);

        Map<Id, Integer> openCases = new Map<Id, Integer>();
        for (AggregateResult ar : [
            SELECT AccountId acc, COUNT(Id) n FROM Case
            WHERE AccountId IN :ids AND IsClosed = false GROUP BY AccountId
        ]) {
            openCases.put((Id) ar.get('acc'), (Integer) ar.get('n'));
        }
        Set<Id> responders = new Set<Id>();
        for (CampaignMember cm : [
            SELECT AccountId, Contact.AccountId FROM CampaignMember
            WHERE HasResponded = true AND (AccountId IN :ids OR Contact.AccountId IN :ids)
        ]) {
            if (cm.AccountId != null) responders.add(cm.AccountId);
            if (cm.Contact != null && cm.Contact.AccountId != null) responders.add(cm.Contact.AccountId);
        }

        // Existing generated stems per account, and which parts of each stem exist.
        Map<Id, Set<String>> stems = new Map<Id, Set<String>>();
        Set<String> intStems = new Set<String>();
        Set<String> sumStems = new Set<String>();
        for (Interaction r : [SELECT AccountId, External_ID__c FROM Interaction
                              WHERE AccountId IN :ids AND External_ID__c LIKE 'story:%']) {
            addStem(stems, r.AccountId, r.External_ID__c);
            intStems.add(r.External_ID__c);
        }
        for (InteractionSummary r : [SELECT AccountId, External_ID__c FROM InteractionSummary
                                     WHERE AccountId IN :ids AND External_ID__c LIKE 'story:%']) {
            addStem(stems, r.AccountId, r.External_ID__c);
            sumStems.add(r.External_ID__c);
        }
        List<String> cvPatterns = new List<String>();
        for (Id i : ids) cvPatterns.add(PREFIX + String.valueOf(i) + ':%');
        Map<String, Id> cvDocByStem = new Map<String, Id>();
        for (ContentVersion r : [SELECT ContentDocumentId, External_ID__c FROM ContentVersion
                                 WHERE IsLatest = true AND External_ID__c LIKE :cvPatterns]) {
            cvDocByStem.put(r.External_ID__c, r.ContentDocumentId);
            addStem(stems, accountOf(r.External_ID__c), r.External_ID__c);
        }
        Set<String> linked = new Set<String>();
        if (!cvDocByStem.isEmpty()) {
            for (ContentDocumentLink l : [SELECT ContentDocumentId, LinkedEntityId FROM ContentDocumentLink
                                          WHERE ContentDocumentId IN :cvDocByStem.values()
                                          AND LinkedEntityId IN :ids]) {
                linked.add('' + l.ContentDocumentId + l.LinkedEntityId);
            }
        }

        // Per account: repair the latest stem if incomplete (or rerun of today's), skip if a complete
        // story is within 30 days, otherwise start today's stem.
        Map<Id, String> todayStem = new Map<Id, String>();
        Map<Id, Date> storyDate = new Map<Id, Date>();
        Map<Id, StoryTemplates.Story> stories = new Map<Id, StoryTemplates.Story>();
        Set<String> expiredStems = new Set<String>();
        for (Account a : accounts) {
            Set<String> own = stems.containsKey(a.Id) ? stems.get(a.Id) : new Set<String>();
            String latest = latestOf(own);
            String today = stem(a.Id, onDate, 1);
            Date latestDate = (latest == null) ? null : dateOf(latest);
            Boolean recent = latestDate != null && latestDate <= onDate && latestDate > onDate.addDays(-MIN_GAP_DAYS);
            String s;
            if (recent && (latest == today || !isComplete(latest, a.Id, intStems, sumStems, cvDocByStem, linked))) {
                s = latest; // same-day rerun or repair of a partial story: same stem, no new story
            } else if (recent) {
                skipped++;
                continue;
            } else {
                s = today;
            }
            Date d = dateOf(s);
            todayStem.put(a.Id, s);
            storyDate.put(a.Id, d);
            StoryTemplates.Signals sg = new StoryTemplates.Signals();
            sg.kycStatus = a.FinServ__KYCStatus__c;
            sg.openCases = openCases.containsKey(a.Id) ? openCases.get(a.Id) : 0;
            sg.campaignResponder = responders.contains(a.Id);
            sg.tier = a.Tier__c;
            stories.put(a.Id, StoryTemplates.build(a.Id, sg, d));
            Set<String> withNew = new Set<String>(own);
            withNew.add(s);
            expiredStems.addAll(olderThanKept(withNew));
        }

        // Interactions
        List<Id> order = new List<Id>(stories.keySet());
        List<Interaction> ints = new List<Interaction>();
        for (Id accId : order) {
            StoryTemplates.Story st = stories.get(accId);
            DateTime startAt = DateTime.newInstance(storyDate.get(accId), Time.newInstance(10, 0, 0, 0));
            ints.add(new Interaction(
                External_ID__c = todayStem.get(accId),
                Name = st.title.left(255),
                AccountId = accId,
                InteractionType = interactionType(st.interactionType),
                StartTime = startAt,
                EndTime = startAt.addMinutes(30),
                Description = st.transcript
            ));
        }
        Map<Id, Id> interactionByAccount = new Map<Id, Id>();
        List<Database.UpsertResult> intRes = Database.upsert(ints, Interaction.External_ID__c, false);
        for (Integer i = 0; i < intRes.size(); i++) {
            if (intRes[i].isSuccess()) {
                interactionByAccount.put(order[i], intRes[i].getId());
            } else {
                logFailure('Interaction', ints[i].External_ID__c, intRes[i].getErrors());
            }
        }

        // Interaction summaries (only where the Interaction exists)
        List<InteractionSummary> sums = new List<InteractionSummary>();
        for (Id accId : order) {
            if (!interactionByAccount.containsKey(accId)) continue;
            StoryTemplates.Story st = stories.get(accId);
            sums.add(new InteractionSummary(
                External_ID__c = todayStem.get(accId),
                Name = st.title.left(255),
                InteractionId = interactionByAccount.get(accId),
                AccountId = accId,
                MeetingNotes = st.recap,
                NextSteps = st.nextSteps,
                InteractionPurpose = st.purpose,
                Status = 'Complete'
            ));
        }
        List<Database.UpsertResult> sumRes = Database.upsert(sums, InteractionSummary.External_ID__c, false);
        for (Integer i = 0; i < sumRes.size(); i++) {
            if (!sumRes[i].isSuccess()) logFailure('InteractionSummary', sums[i].External_ID__c, sumRes[i].getErrors());
        }

        // Notes: ContentVersion is created once per stem (VersionData and PathOnClient are fixed after create).
        List<ContentVersion> notes = new List<ContentVersion>();
        for (Id accId : order) {
            if (!cvDocByStem.containsKey(todayStem.get(accId))) {
                notes.add(note(todayStem.get(accId), stories.get(accId)));
            }
        }
        List<Database.UpsertResult> cvRes = Database.upsert(notes, ContentVersion.External_ID__c, false);
        Set<Id> newCvIds = new Set<Id>();
        for (Integer i = 0; i < cvRes.size(); i++) {
            if (cvRes[i].isSuccess()) {
                newCvIds.add(cvRes[i].getId());
            } else {
                logFailure('ContentVersion', notes[i].External_ID__c, cvRes[i].getErrors());
            }
        }
        for (ContentVersion cv : [SELECT ContentDocumentId, External_ID__c FROM ContentVersion WHERE Id IN :newCvIds]) {
            cvDocByStem.put(cv.External_ID__c, cv.ContentDocumentId);
        }

        // Links: add any missing account link for today's notes (also repairs a prior partial failure).
        Map<Id, Id> docToAccount = new Map<Id, Id>();
        for (Id accId : order) {
            Id docId = cvDocByStem.get(todayStem.get(accId));
            if (docId != null) docToAccount.put(docId, accId);
        }
        List<ContentDocumentLink> links = new List<ContentDocumentLink>();
        for (Id docId : docToAccount.keySet()) {
            Id accId = docToAccount.get(docId);
            if (!linked.contains('' + docId + accId)) {
                links.add(new ContentDocumentLink(
                    ContentDocumentId = docId, LinkedEntityId = accId, ShareType = 'I', Visibility = 'AllUsers'));
            }
        }
        List<Database.SaveResult> linkRes = Database.insert(links, false);
        for (Integer i = 0; i < linkRes.size(); i++) {
            if (!linkRes[i].isSuccess()) logFailure('ContentDocumentLink', String.valueOf(links[i].ContentDocumentId), linkRes[i].getErrors());
        }

        for (Id accId : order) {
            if (interactionByAccount.containsKey(accId)) created++;
        }

        // Retention: expire generated stories beyond the latest 3 (non-generated records never match).
        if (!expiredStems.isEmpty()) {
            List<SObject> toDelete = new List<SObject>();
            toDelete.addAll((List<SObject>) [SELECT Id FROM InteractionSummary WHERE External_ID__c IN :expiredStems]);
            toDelete.addAll((List<SObject>) [SELECT Id FROM Interaction WHERE External_ID__c IN :expiredStems]);
            Set<Id> docIds = new Set<Id>();
            for (ContentVersion cv : [SELECT ContentDocumentId FROM ContentVersion WHERE External_ID__c IN :expiredStems]) {
                docIds.add(cv.ContentDocumentId);
            }
            for (Id d : docIds) toDelete.add(new ContentDocument(Id = d));
            List<Database.DeleteResult> delRes = Database.delete(toDelete, false);
            for (Integer i = 0; i < delRes.size(); i++) {
                if (delRes[i].isSuccess()) {
                    expired++;
                } else {
                    logFailure('delete', String.valueOf(toDelete[i].Id), delRes[i].getErrors());
                }
            }
        }
    }

    public void finish(Database.BatchableContext ctx) {
        System.debug(LoggingLevel.INFO, 'StoryFeed ' + ymd(onDate) + ': created=' + created + ' skipped=' + skipped
            + ' failed=' + failed + ' expiredRecords=' + expired);
    }

    @TestVisible
    private static ContentVersion note(String stemValue, StoryTemplates.Story st) {
        return new ContentVersion(
            External_ID__c = stemValue,
            Title = st.title.left(255),
            PathOnClient = st.title.left(255) + '.snote',
            VersionData = Blob.valueOf(escapeHtml(st.transcript))
        );
    }

    @TestVisible
    private static String escapeHtml(String text) {
        if (text == null) return '';
        return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;').replace('\'', '&#39;')
            .replace('\r\n', '\n').replace('\n', '<br>');
    }

    /** First slice index for a day: (dayOfYear x chunkSize) mod total. */
    @TestVisible
    private static Integer sliceOffset(Integer dayOfYear, Integer chunkSize, Integer total) {
        return Math.mod(dayOfYear * chunkSize, total);
    }

    private static String latestOf(Set<String> own) {
        String latest;
        for (String s : own) {
            if (latest == null || s > latest) latest = s;
        }
        return latest;
    }

    // Complete = Interaction, InteractionSummary and a note linked to the account all exist for the stem.
    private static Boolean isComplete(String s, Id accId, Set<String> intStems, Set<String> sumStems,
                                      Map<String, Id> cvDocByStem, Set<String> linked) {
        return intStems.contains(s) && sumStems.contains(s) && cvDocByStem.containsKey(s)
            && linked.contains('' + cvDocByStem.get(s) + accId);
    }

    private static List<String> olderThanKept(Set<String> own) {
        List<String> sorted = new List<String>(own);
        sorted.sort(); // same account prefix, so yyyymmdd:n sorts chronologically
        List<String> out = new List<String>();
        for (Integer i = 0; i < sorted.size() - KEEP; i++) out.add(sorted[i]);
        return out;
    }

    private static void addStem(Map<Id, Set<String>> m, Id accId, String s) {
        if (accId == null || s == null) return;
        if (!m.containsKey(accId)) m.put(accId, new Set<String>());
        m.get(accId).add(s);
    }

    private static Id accountOf(String s) {
        List<String> p = s.split(':');
        try {
            return p.size() == 4 ? Id.valueOf(p[1]) : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static Date dateOf(String s) {
        List<String> p = s.split(':');
        if (p.size() != 4 || p[2].length() != 8 || !p[2].isNumeric()) return null;
        return Date.newInstance(Integer.valueOf(p[2].left(4)), Integer.valueOf(p[2].mid(4, 2)), Integer.valueOf(p[2].right(2)));
    }

    private static String ymd(Date d) {
        return String.valueOf(d.year()) + String.valueOf(d.month()).leftPad(2, '0') + String.valueOf(d.day()).leftPad(2, '0');
    }

    // Map template types to the org's InteractionType picklist values.
    private static String interactionType(String t) {
        if (t == 'Call') return 'Phone Call';
        if (t == 'Video Meeting') return 'Conference';
        if (t == 'In-Person Meeting') return 'In Person';
        return t;
    }

    private void logFailure(String what, String key, List<Database.Error> errs) {
        failed++;
        System.debug(LoggingLevel.ERROR, 'StoryFeed ' + what + ' ' + key + ' failed: '
            + (errs.isEmpty() ? '' : errs[0].getStatusCode() + ' ' + errs[0].getMessage()));
    }
}
