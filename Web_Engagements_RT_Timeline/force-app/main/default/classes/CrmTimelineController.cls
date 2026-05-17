public with sharing class CrmTimelineController {

    public class TimelineEvent {
        @AuraEnabled public String   id;
        @AuraEnabled public String   source;
        @AuraEnabled public String   sourceLabel;
        @AuraEnabled public String   iconName;
        @AuraEnabled public String   iconColor;
        @AuraEnabled public Datetime occurredAt;
        @AuraEnabled public String   title;
        @AuraEnabled public String   subtitle;
        @AuraEnabled public String   recordUrl;
        @AuraEnabled public List<DetailField> details;
    }

    public class DetailField {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
        public DetailField(String label, String value) {
            this.label = label;
            this.value = value;
        }
    }

    private class TimelineEventComparator implements Comparator<TimelineEvent> {
        public Integer compare(TimelineEvent a, TimelineEvent b) {
            if (a.occurredAt == b.occurredAt) return 0;
            return (a.occurredAt > b.occurredAt) ? -1 : 1;
        }
    }

    private static final Set<String> ALLOWED_SOURCES =
        new Set<String>{ 'case', 'task', 'event', 'voice' };

    private static final Integer MAX_LOOKBACK_DAYS = 365;
    private static final Integer DEFAULT_LOOKBACK_DAYS = 90;
    private static final Integer PER_SOURCE_LIMIT = 200;

    @AuraEnabled(cacheable=false)
    public static List<TimelineEvent> getCrmTimelineEvents(
        Id recordId,
        List<String> enabledSources,
        Integer lookbackDays
    ) {
        Schema.SObjectType sot = recordId.getSObjectType();
        if (sot != Account.SObjectType && sot != Contact.SObjectType) {
            throw new AuraHandledException(
                'Web Engagements timeline only supports Account and Contact record pages.'
            );
        }

        Set<String> sources = new Set<String>();
        for (String s : (enabledSources == null ? new List<String>() : enabledSources)) {
            if (ALLOWED_SOURCES.contains(s)) sources.add(s);
        }
        if (sources.isEmpty()) return new List<TimelineEvent>();

        Integer days = (lookbackDays == null || lookbackDays < 1)
            ? DEFAULT_LOOKBACK_DAYS
            : Math.min(lookbackDays, MAX_LOOKBACK_DAYS);
        Datetime since = Datetime.now().addDays(-days);

        List<TimelineEvent> events = new List<TimelineEvent>();
        if (sources.contains('case')) events.addAll(queryCases(recordId, sot, since));
        if (sources.contains('task')) events.addAll(queryTasks(recordId, sot, since));
        // event / voice added in subsequent tasks.

        TimelineEvent[] arr = events.clone();
        arr.sort(new TimelineEventComparator());
        return arr;
    }

    private static List<TimelineEvent> queryCases(Id recordId, Schema.SObjectType sot, Datetime since) {
        List<Case> rows = (sot == Account.SObjectType)
            ? [SELECT Id, CaseNumber, Subject, Status, Owner.Name, CreatedDate
               FROM Case
               WHERE AccountId = :recordId AND CreatedDate >= :since
               ORDER BY CreatedDate DESC
               LIMIT :PER_SOURCE_LIMIT]
            : [SELECT Id, CaseNumber, Subject, Status, Owner.Name, CreatedDate
               FROM Case
               WHERE ContactId = :recordId AND CreatedDate >= :since
               ORDER BY CreatedDate DESC
               LIMIT :PER_SOURCE_LIMIT];

        List<TimelineEvent> out = new List<TimelineEvent>();
        for (Case c : rows) {
            TimelineEvent t = new TimelineEvent();
            t.id          = c.Id;
            t.source      = 'case';
            t.sourceLabel = 'Case';
            t.iconName    = 'standard:case';
            t.iconColor   = '#c23934';
            t.occurredAt  = c.CreatedDate;
            t.title       = c.Subject == null ? 'Case ' + c.CaseNumber : c.Subject;
            String ownerName = (c.Owner != null) ? c.Owner.Name : 'Unassigned';
            t.subtitle    = 'Case ' + c.CaseNumber + ' on ' + c.Status + ' owner ' + ownerName;
            t.recordUrl   = '/lightning/r/Case/' + c.Id + '/view';
            t.details     = new List<DetailField>{
                new DetailField('Case Number', c.CaseNumber),
                new DetailField('Status', c.Status),
                new DetailField('Owner', ownerName)
            };
            out.add(t);
        }
        return out;
    }

    private static List<TimelineEvent> queryTasks(Id recordId, Schema.SObjectType sot, Datetime since) {
        // Task.WhatId points to Account/Opportunity/etc.; Task.WhoId points to Contact/Lead.
        // For the Account record page we query WhatId = recordId; for Contact, WhoId = recordId.
        // Activities use ActivityDate (Date), not Datetime — fall back to CreatedDate when null.
        List<Task> rows = (sot == Account.SObjectType)
            ? [SELECT Id, Subject, Type, CallType, ActivityDate, CreatedDate, Owner.Name
               FROM Task
               WHERE WhatId = :recordId AND CreatedDate >= :since
               ORDER BY CreatedDate DESC
               LIMIT :PER_SOURCE_LIMIT]
            : [SELECT Id, Subject, Type, CallType, ActivityDate, CreatedDate, Owner.Name
               FROM Task
               WHERE WhoId = :recordId AND CreatedDate >= :since
               ORDER BY CreatedDate DESC
               LIMIT :PER_SOURCE_LIMIT];

        List<TimelineEvent> out = new List<TimelineEvent>();
        for (Task task : rows) {
            TimelineEvent t = new TimelineEvent();
            t.id          = task.Id;
            t.source      = 'task';
            t.sourceLabel = 'Task';
            t.iconName    = String.isNotBlank(task.CallType) ? 'standard:log_a_call' : 'standard:task';
            t.iconColor   = '#04844b';
            t.occurredAt  = (task.ActivityDate != null)
                ? Datetime.newInstanceGmt(task.ActivityDate, Time.newInstance(0, 0, 0, 0))
                : task.CreatedDate;
            t.title       = String.isBlank(task.Subject) ? '(no subject)' : task.Subject;
            String sub    = String.isBlank(task.Type) ? 'Task' : task.Type;
            if (String.isNotBlank(task.CallType)) sub += ' on ' + task.CallType;
            t.subtitle    = sub;
            t.recordUrl   = '/lightning/r/Task/' + task.Id + '/view';
            t.details     = new List<DetailField>{
                new DetailField('Type', task.Type),
                new DetailField('Owner', (task.Owner != null) ? task.Owner.Name : 'Unassigned')
            };
            if (String.isNotBlank(task.CallType)) {
                t.details.add(new DetailField('Call Type', task.CallType));
            }
            out.add(t);
        }
        return out;
    }
}
