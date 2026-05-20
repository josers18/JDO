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

    /**
     * @description Returns merged CRM activity (Cases, Tasks, Events, VoiceCalls) for an
     *              Account or Contact record page, sorted by occurredAt descending.
     * @param recordId        Account.Id or Contact.Id; throws if any other SObject type.
     * @param enabledSources  Subset of {'case','task','event','voice'}; unknown values are
     *                        silently dropped. Returns [] when the resulting set is empty.
     * @param lookbackDays    Clamped to [1..365]; null or <1 falls back to 90.
     * @return List<TimelineEvent>, capped at PER_SOURCE_LIMIT (200) per source.
     */
    @AuraEnabled(cacheable=false)
    public static List<TimelineEvent> getCrmTimelineEvents(
        Id recordId,
        List<String> enabledSources,
        Integer lookbackDays
    ) {
        Schema.SObjectType sot = recordId.getSObjectType();
        if (sot != Account.SObjectType && sot != Contact.SObjectType) {
            throw buildAuraException(
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
        if (sources.contains('case'))  events.addAll(queryCases(recordId, sot, since));
        if (sources.contains('task'))  events.addAll(queryTasks(recordId, sot, since));
        if (sources.contains('event')) events.addAll(queryEvents(recordId, sot, since));
        if (sources.contains('voice')) events.addAll(queryVoiceCalls(recordId, sot, since));

        TimelineEvent[] arr = events.clone();
        arr.sort(new TimelineEventComparator());
        return arr;
    }

    /**
     * AuraHandledException surfaces a custom message to the LWC layer only when both
     * the constructor argument AND setMessage() are populated; without setMessage()
     * the JS toast falls back to a generic "Script-thrown exception" string.
     * Mirror of the helper in DC_Prediction_Model_LWC, DC_Multiclass_Prediction_LWC,
     * DC_Query_to_Table_LWC, and DC_AgentForce_Output_LWC.
     */
    private static AuraHandledException buildAuraException(String msg) {
        String safe = String.isBlank(msg) ? 'Operation failed.' : msg;
        AuraHandledException ahe = new AuraHandledException(safe);
        ahe.setMessage(safe);
        return ahe;
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

    private static List<TimelineEvent> queryEvents(Id recordId, Schema.SObjectType sot, Datetime since) {
        List<Event> rows = (sot == Account.SObjectType)
            ? [SELECT Id, Subject, Description, StartDateTime, Location, Owner.Name
               FROM Event
               WHERE WhatId = :recordId AND StartDateTime >= :since
               ORDER BY StartDateTime DESC
               LIMIT :PER_SOURCE_LIMIT]
            : [SELECT Id, Subject, Description, StartDateTime, Location, Owner.Name
               FROM Event
               WHERE WhoId = :recordId AND StartDateTime >= :since
               ORDER BY StartDateTime DESC
               LIMIT :PER_SOURCE_LIMIT];

        List<TimelineEvent> out = new List<TimelineEvent>();
        for (Event evt : rows) {
            TimelineEvent t = new TimelineEvent();
            t.id          = evt.Id;
            t.source      = 'event';
            t.sourceLabel = 'Event';
            t.iconName    = 'standard:event';
            t.iconColor   = '#c97a00';
            t.occurredAt  = evt.StartDateTime;
            t.title       = String.isBlank(evt.Subject) ? '(no subject)' : evt.Subject;
            String subtitle = 'Event';
            if (String.isNotBlank(evt.Location)) {
                subtitle = evt.Location;
            } else if (String.isNotBlank(evt.Description)) {
                subtitle = evt.Description.length() > 80
                    ? evt.Description.substring(0, 80) + '...'
                    : evt.Description;
            }
            t.subtitle    = subtitle;
            t.recordUrl   = '/lightning/r/Event/' + evt.Id + '/view';
            t.details     = new List<DetailField>{
                new DetailField('Owner', (evt.Owner != null) ? evt.Owner.Name : 'Unassigned')
            };
            if (String.isNotBlank(evt.Location)) {
                t.details.add(new DetailField('Location', evt.Location));
            }
            out.add(t);
        }
        return out;
    }

    private static List<TimelineEvent> queryVoiceCalls(Id recordId, Schema.SObjectType sot, Datetime since) {
        // VoiceCall only exists in orgs with Service Cloud Voice provisioned.
        // Silently return empty if absent so admins can leave 'Show Voice' on
        // without breaking the timeline.
        if (!Schema.getGlobalDescribe().containsKey('VoiceCall')) {
            return new List<TimelineEvent>();
        }

        // Use Database.query so this method compiles in orgs without VoiceCall
        // (a static SOQL would fail Apex compilation there).
        String soql =
            'SELECT Id, CallStartDateTime, CallType, CallDisposition, ' +
                'CallDurationInSeconds, RelatedRecordId ' +
            'FROM VoiceCall ' +
            'WHERE RelatedRecordId = :recordId AND CallStartDateTime >= :since ' +
            'ORDER BY CallStartDateTime DESC ' +
            'LIMIT ' + PER_SOURCE_LIMIT;
        List<SObject> rows = Database.query(soql);

        List<TimelineEvent> out = new List<TimelineEvent>();
        for (SObject row : rows) {
            TimelineEvent t = new TimelineEvent();
            t.id          = (String) row.get('Id');
            t.source      = 'voice';
            t.sourceLabel = 'Voice';
            t.iconName    = 'standard:live_chat';
            t.iconColor   = '#0176d3';
            t.occurredAt  = (Datetime) row.get('CallStartDateTime');
            String direction = (String) row.get('CallType');
            Integer durationSec = (Integer) row.get('CallDurationInSeconds');
            String durationLabel = (durationSec == null)
                ? '?'
                : (durationSec / 60) + 'm ' + Math.mod(durationSec, 60) + 's';
            t.title       = (String.isBlank(direction) ? 'Call' : direction) + ' on ' + durationLabel;
            String dispo = (String) row.get('CallDisposition');
            t.subtitle    = String.isBlank(dispo)
                ? 'Agentforce Voice'
                : 'Agentforce Voice on ' + dispo;
            t.recordUrl   = '/lightning/r/VoiceCall/' + t.id + '/view';
            t.details     = new List<DetailField>{
                new DetailField('Direction', direction),
                new DetailField('Duration', durationLabel),
                new DetailField('Disposition', dispo)
            };
            out.add(t);
        }
        return out;
    }
}
