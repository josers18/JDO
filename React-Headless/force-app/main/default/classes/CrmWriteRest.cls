/**
 * CRM write bridge for React UI bundles.
 *
 * WHY REST: @AuraEnabled Apex has no invocation path from a Multi-Framework UI
 * bundle (React), and the app-domain session cannot call the generic write REST
 * APIs directly (same constraint documented in DcBridgeRest.cls and
 * _shared/src/data/promptClient.ts). So CRM writes are funneled through this
 * custom @RestResource, reachable via /services/apexrest/* using the SDK
 * fetch() path.
 *
 *   POST /services/apexrest/crm/
 *     body: { "action":"task|event|case|email", "subject":"...", ... }
 *     200:  { "success": true,  "id": "<recordId or null>" }
 *     400:  { "success": false, "error": "message" }
 *     500:  { "success": false, "error": "message" }
 */
@RestResource(urlMapping='/crm/*')
global with sharing class CrmWriteRest {
    private static final Integer DEFAULT_EVENT_DURATION = 30;

    global class WriteRequest {
        public String action;           // 'task' | 'event' | 'case' | 'email'  (required)
        public String subject;          // required for all
        public String description;
        public String whoId;            // Contact/Lead Id (Task/Event)
        public String whatId;           // related record Id (Task/Event) — Related To
        public String ownerId;          // Owner Id (Task/Event) — Assigned To
        public String accountId;        // for Case
        public String dueDate;          // 'YYYY-MM-DD' for Task.ActivityDate
        public String activityDateTime; // ISO for Event.ActivityDateTime
        public Integer durationMinutes; // Event, default 30
        public String priority;         // Task/Case
        public String status;           // Task/Case
        public String toAddress;        // email
        public String htmlBody;         // email
        public String sobjectType;      // 'Task' | 'Event' | 'FinancialGoal' | 'PersonLifeEvent'  (required for update/delete)
        public String recordId;         // Id of the record to update/delete
        public String type;             // Task/Event/FinancialGoal Type picklist
        public String location;         // Event location
        public String showAs;           // Event ShowAs (Busy|OutOfOffice|Free)
        // FinancialGoal (customer goal) edit/create fields —
        public String name;             // FinancialGoal.Name / PersonLifeEvent.Name
        public String financialPlanId;  // FinancialGoal.FinancialPlanId (customer link, create)
        public String targetDate;       // FinancialGoal.TargetDate 'YYYY-MM-DD'
        public Decimal targetAmount;    // FinancialGoal.TargetAmount
        public Decimal actualAmount;    // FinancialGoal.ActualAmount
        // PersonLifeEvent (life event) create/edit fields —
        public String primaryPersonId;  // PersonLifeEvent.PrimaryPersonId (Contact — the person link, create)
        public String eventType;        // PersonLifeEvent.EventType picklist (Birth|Graduation|Job|…)
        public String eventDate;        // PersonLifeEvent.EventDate 'YYYY-MM-DD' (datetime field, midnight)
        // Lead (lead / referral) create/edit fields —
        public String lastName;         // Lead.LastName (required for create)
        public String firstName;        // Lead.FirstName
        public String company;          // Lead.Company (required for create)
        public String leadSource;       // Lead.LeadSource picklist
        public String email;            // Lead.Email
        public Decimal annualRevenue;   // Lead.AnnualRevenue (est. value)
    }

    /**
     * Identity of the running user — the session the bundle already runs under.
     *
     *   GET /services/apexrest/crm/whoami
     *     200: { "success": true, "userId": "005...", "name": "Jane Banker",
     *            "firstName": "Jane", "lastName": "Banker" }
     *
     * Used by the banker home to greet the logged-in user by name instead of a
     * hardcoded placeholder. UserInfo reflects the caller (REST Apex runs as the
     * authenticated user), so no query or FLS is involved.
     */
    @HttpGet
    global static void whoami() {
        RestResponse res = RestContext.response;
        if (res == null) {
            res = new RestResponse();
            RestContext.response = res;
        }
        res.addHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{
            'success' => true,
            'userId' => UserInfo.getUserId(),
            'name' => UserInfo.getName(),
            'firstName' => UserInfo.getFirstName(),
            'lastName' => UserInfo.getLastName()
        }));
    }

    @HttpPost
    global static void write() {
        RestResponse res = RestContext.response;
        if (res == null) {
            res = new RestResponse();
            RestContext.response = res;
        }
        res.addHeader('Content-Type', 'application/json');
        try {
            String body = RestContext.request != null && RestContext.request.requestBody != null
                ? RestContext.request.requestBody.toString()
                : '';
            WriteRequest reqBody = String.isBlank(body)
                ? new WriteRequest()
                : (WriteRequest) JSON.deserialize(body, WriteRequest.class);

            String action = reqBody.action == null ? '' : reqBody.action.trim().toLowerCase();
            if (String.isBlank(action)) {
                writeError(res, 400, 'Enter an action (task, event, case, or email).');
                return;
            }

            if (action == 'task') {
                handleTask(res, reqBody);
            } else if (action == 'event') {
                handleEvent(res, reqBody);
            } else if (action == 'case') {
                handleCase(res, reqBody);
            } else if (action == 'email') {
                handleEmail(res, reqBody);
            } else if (action == 'goal') {
                handleGoal(res, reqBody);
            } else if (action == 'lifeevent') {
                handleLifeEvent(res, reqBody);
            } else if (action == 'lead') {
                handleLead(res, reqBody);
            } else if (action == 'update') {
                handleUpdate(res, reqBody);
            } else if (action == 'delete') {
                handleDelete(res, reqBody);
            } else {
                writeError(res, 400, 'Unknown action "' + reqBody.action + '". Use task, event, case, email, goal, lifeEvent, lead, update, or delete.');
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'CrmWriteRest error: ' + e.getTypeName() + ': ' + e.getMessage() + '\n' + e.getStackTraceString());
            writeError(res, 500, 'CRM write failed.');
        }
    }

    private static void handleTask(RestResponse res, WriteRequest req) {
        if (String.isBlank(req.subject)) {
            writeError(res, 400, 'A subject is required for a task.');
            return;
        }
        Task t = new Task();
        t.Subject = req.subject;
        t.Description = req.description;
        t.Priority = String.isBlank(req.priority) ? 'Normal' : req.priority;
        t.Status = String.isBlank(req.status) ? 'Not Started' : req.status;
        if (!String.isBlank(req.dueDate)) {
            t.ActivityDate = Date.valueOf(req.dueDate);
        }
        if (!String.isBlank(req.whoId)) {
            t.WhoId = req.whoId;
        }
        if (!String.isBlank(req.whatId)) {
            t.WhatId = req.whatId;
        }
        insert t;
        writeSuccess(res, t.Id);
    }

    private static void handleEvent(RestResponse res, WriteRequest req) {
        if (String.isBlank(req.subject)) {
            writeError(res, 400, 'A subject is required for an event.');
            return;
        }
        Event ev = new Event();
        ev.Subject = req.subject;
        ev.Description = req.description;
        ev.ActivityDateTime = String.isBlank(req.activityDateTime)
            ? Datetime.now().addHours(1)
            : (Datetime) JSON.deserialize('"' + req.activityDateTime + '"', Datetime.class);
        ev.DurationInMinutes = (req.durationMinutes == null || req.durationMinutes < 1)
            ? DEFAULT_EVENT_DURATION
            : req.durationMinutes;
        if (!String.isBlank(req.whoId)) {
            ev.WhoId = req.whoId;
        }
        if (!String.isBlank(req.whatId)) {
            ev.WhatId = req.whatId;
        }
        insert ev;
        writeSuccess(res, ev.Id);
    }

    private static void handleCase(RestResponse res, WriteRequest req) {
        if (String.isBlank(req.subject)) {
            writeError(res, 400, 'A subject is required for a case.');
            return;
        }
        Case c = new Case();
        c.Subject = req.subject;
        c.Description = req.description;
        c.Priority = String.isBlank(req.priority) ? 'Medium' : req.priority;
        c.Status = String.isBlank(req.status) ? 'New' : req.status;
        c.Origin = 'React Command Center';
        if (!String.isBlank(req.accountId)) {
            c.AccountId = req.accountId;
        }
        insert c;
        writeSuccess(res, c.Id);
    }

    private static void handleEmail(RestResponse res, WriteRequest req) {
        if (String.isBlank(req.subject)) {
            writeError(res, 400, 'A subject is required for an email.');
            return;
        }
        if (String.isBlank(req.toAddress)) {
            writeError(res, 400, 'A recipient address is required for an email.');
            return;
        }
        Messaging.SingleEmailMessage msg = new Messaging.SingleEmailMessage();
        msg.setToAddresses(new List<String>{ req.toAddress });
        msg.setSubject(req.subject);
        msg.setHtmlBody(String.isBlank(req.htmlBody) ? req.description : req.htmlBody);
        if (!Test.isRunningTest()) {
            Messaging.sendEmail(new List<Messaging.SingleEmailMessage>{ msg });
        }
        writeSuccess(res, null);
    }

    /**
     * Create a customer FinancialGoal from the home "New goal" flow. Requires
     * Name, Type, Status (verified via describe as the create-required trio) and
     * a FinancialPlanId — the goal's only customer link (FinancialGoal has no
     * Account field), so the new goal attributes to a household and shows up on
     * the plan-linked Customer Goals card after refetch. Optional fields
     * (priority, description, targetDate, amounts) are set only when provided.
     */
    private static void handleGoal(RestResponse res, WriteRequest req) {
        if (String.isBlank(req.name)) {
            writeError(res, 400, 'A goal name is required.');
            return;
        }
        if (String.isBlank(req.type)) {
            writeError(res, 400, 'A goal type is required.');
            return;
        }
        if (String.isBlank(req.financialPlanId)) {
            writeError(res, 400, 'Select a customer (financial plan) for the goal.');
            return;
        }
        Id planId;
        try {
            planId = (Id) req.financialPlanId;
        } catch (Exception e) {
            writeError(res, 400, 'financialPlanId is not a valid Id.');
            return;
        }
        if (planId.getSObjectType() != FinancialPlan.SObjectType) {
            writeError(res, 400, 'financialPlanId is not a FinancialPlan Id.');
            return;
        }
        FinancialGoal g = new FinancialGoal();
        g.Name = req.name;
        g.Type = req.type;
        g.Status = String.isBlank(req.status) ? 'NOT_STARTED' : req.status;
        g.FinancialPlanId = planId;
        if (!String.isBlank(req.priority))    { g.Priority = req.priority; }
        if (!String.isBlank(req.description)) { g.Description = req.description; }
        if (!String.isBlank(req.targetDate))  { g.TargetDate = Date.valueOf(req.targetDate); }
        if (req.targetAmount != null)         { g.TargetAmount = req.targetAmount; }
        if (req.actualAmount != null)         { g.ActualAmount = req.actualAmount; }
        insert g;
        writeSuccess(res, g.Id);
    }

    /**
     * Create a PersonLifeEvent from the home "Life events" flow. Requires Name,
     * EventType, EventDate, and PrimaryPersonId (verified via describe as the
     * create-required set). PrimaryPersonId is a Contact reference — for person
     * accounts the contact name equals the account name, so picking a Contact IS
     * picking the customer. EventDate is a Datetime field but the modal supplies
     * a date-only string, so it's anchored to midnight. RelatedPersonId (also a
     * Contact) is optional.
     */
    private static void handleLifeEvent(RestResponse res, WriteRequest req) {
        if (String.isBlank(req.name)) {
            writeError(res, 400, 'A life event name is required.');
            return;
        }
        if (String.isBlank(req.eventType)) {
            writeError(res, 400, 'A life event type is required.');
            return;
        }
        if (String.isBlank(req.eventDate)) {
            writeError(res, 400, 'A life event date is required.');
            return;
        }
        if (String.isBlank(req.primaryPersonId)) {
            writeError(res, 400, 'Select a customer (person) for the life event.');
            return;
        }
        Id personId;
        try {
            personId = (Id) req.primaryPersonId;
        } catch (Exception e) {
            writeError(res, 400, 'primaryPersonId is not a valid Id.');
            return;
        }
        if (personId.getSObjectType() != Contact.SObjectType) {
            writeError(res, 400, 'primaryPersonId is not a Contact Id.');
            return;
        }
        PersonLifeEvent ple = new PersonLifeEvent();
        ple.Name = req.name;
        ple.EventType = req.eventType;
        ple.PrimaryPersonId = personId;
        ple.EventDate = toEventDatetime(req.eventDate);
        insert ple;
        writeSuccess(res, ple.Id);
    }

    /**
     * Coerce a modal 'YYYY-MM-DD' string into the Datetime that
     * PersonLifeEvent.EventDate expects, anchored to local midnight. Direct
     * assignment of a Date to a Datetime field won't compile, so we build it.
     */
    private static Datetime toEventDatetime(String ymd) {
        Date d = Date.valueOf(ymd);
        return Datetime.newInstance(d, Time.newInstance(0, 0, 0, 0));
    }

    /**
     * Create a Lead from the home "Leads & referrals" flow. LastName and Company
     * are the two create-required fields on Lead (both non-nillable); Status
     * defaults to 'New' when omitted. Optional fields (firstName, leadSource,
     * email, annualRevenue) are set only when provided. Unlike PersonLifeEvent,
     * every Lead field here is both createable and updateable.
     */
    private static void handleLead(RestResponse res, WriteRequest req) {
        if (String.isBlank(req.lastName)) {
            writeError(res, 400, 'A last name is required for a lead.');
            return;
        }
        if (String.isBlank(req.company)) {
            writeError(res, 400, 'A company is required for a lead.');
            return;
        }
        Lead ld = new Lead();
        ld.LastName = req.lastName;
        ld.Company = req.company;
        ld.Status = String.isBlank(req.status) ? 'New' : req.status;
        if (!String.isBlank(req.firstName))  { ld.FirstName = req.firstName; }
        if (!String.isBlank(req.leadSource)) { ld.LeadSource = req.leadSource; }
        if (!String.isBlank(req.email))      { ld.Email = req.email; }
        if (req.annualRevenue != null)       { ld.AnnualRevenue = req.annualRevenue; }
        insert ld;
        writeSuccess(res, ld.Id);
    }

    /**
     * Validate recordId + sobjectType for an update/delete and return the Id.
     * Writes the appropriate 400 and returns null on any failure (blank id,
     * unsupported/absent sobjectType, malformed Id, or an Id whose object type
     * does not match the declared sobjectType — e.g. a Task Id sent as an
     * Event, which would otherwise surface as an opaque 500).
     */
    private static Id resolveVerifiedId(RestResponse res, WriteRequest req) {
        if (String.isBlank(req.recordId)) {
            writeError(res, 400, 'A recordId is required.');
            return null;
        }
        String sot = req.sobjectType == null ? '' : req.sobjectType.trim();
        if (sot != 'Task' && sot != 'Event' && sot != 'FinancialGoal' && sot != 'PersonLifeEvent' && sot != 'Lead') {
            writeError(res, 400, 'Unsupported sobjectType "' + req.sobjectType + '". Use Task, Event, FinancialGoal, PersonLifeEvent, or Lead.');
            return null;
        }
        Id recId;
        try {
            recId = (Id) req.recordId;
        } catch (Exception e) {
            writeError(res, 400, 'recordId is not a valid Id.');
            return null;
        }
        String recPrefix = recId.getSObjectType().getDescribe().getName();
        if (recPrefix != sot) {
            writeError(res, 400, 'recordId is a ' + recPrefix + ', not a ' + sot + '.');
            return null;
        }
        return recId;
    }

    private static void handleUpdate(RestResponse res, WriteRequest req) {
        Id recId = resolveVerifiedId(res, req);
        if (recId == null) { return; } // error already written
        String sot = req.sobjectType.trim();
        if (sot == 'Task') {
            Task t = new Task(Id = recId);
            if (!String.isBlank(req.subject))     { t.Subject = req.subject; }
            if (!String.isBlank(req.status))      { t.Status = req.status; }
            if (!String.isBlank(req.priority))    { t.Priority = req.priority; }
            if (!String.isBlank(req.dueDate))     { t.ActivityDate = Date.valueOf(req.dueDate); }
            if (!String.isBlank(req.type))        { t.Type = req.type; }
            if (!String.isBlank(req.description)) { t.Description = req.description; }
            if (!String.isBlank(req.whatId))      { t.WhatId = req.whatId; }
            if (!String.isBlank(req.ownerId))     { t.OwnerId = req.ownerId; }
            update t;
        } else if (sot == 'FinancialGoal') {
            // Customer goal edit from the home Customer Goals card. Only the
            // fields the modal exposes are written; a blank/absent field leaves
            // the server value untouched (targetAmount/actualAmount are non-null
            // Decimals so they update whenever the client sends them).
            FinancialGoal g = new FinancialGoal(Id = recId);
            if (!String.isBlank(req.name))       { g.Name = req.name; }
            if (!String.isBlank(req.status))     { g.Status = req.status; }
            if (!String.isBlank(req.priority))   { g.Priority = req.priority; }
            if (!String.isBlank(req.type))       { g.Type = req.type; }
            if (!String.isBlank(req.description)){ g.Description = req.description; }
            if (!String.isBlank(req.targetDate)) { g.TargetDate = Date.valueOf(req.targetDate); }
            if (req.targetAmount != null)        { g.TargetAmount = req.targetAmount; }
            if (req.actualAmount != null)        { g.ActualAmount = req.actualAmount; }
            update g;
        } else if (sot == 'PersonLifeEvent') {
            // Life event edit from the home Life Events flow. Only Name and
            // EventDate are written: EventType and PrimaryPersonId are
            // createable-but-NOT-updateable on PersonLifeEvent (assigning either
            // on update throws "Field is not writeable"), so they are fixed at
            // creation and silently ignored here even if the client sends them.
            // A blank/absent field leaves the server value untouched. EventDate
            // is a datetime anchored to midnight.
            PersonLifeEvent ple = new PersonLifeEvent(Id = recId);
            if (!String.isBlank(req.name))      { ple.Name = req.name; }
            if (!String.isBlank(req.eventDate)) { ple.EventDate = toEventDatetime(req.eventDate); }
            update ple;
        } else if (sot == 'Lead') {
            // Lead edit from the home Leads & referrals card. Only the fields the
            // modal exposes are written; a blank/absent field leaves the server
            // value untouched. Lead.Name is a compound read-only field, so the
            // editable name is FirstName/LastName. All fields here are updateable.
            Lead ld = new Lead(Id = recId);
            if (!String.isBlank(req.lastName))   { ld.LastName = req.lastName; }
            if (!String.isBlank(req.firstName))  { ld.FirstName = req.firstName; }
            if (!String.isBlank(req.company))    { ld.Company = req.company; }
            if (!String.isBlank(req.status))     { ld.Status = req.status; }
            if (!String.isBlank(req.leadSource)) { ld.LeadSource = req.leadSource; }
            if (!String.isBlank(req.email))      { ld.Email = req.email; }
            if (req.annualRevenue != null)       { ld.AnnualRevenue = req.annualRevenue; }
            update ld;
        } else {
            Event ev = new Event(Id = recId);
            if (!String.isBlank(req.subject)) { ev.Subject = req.subject; }
            if (!String.isBlank(req.activityDateTime)) {
                ev.ActivityDateTime = (Datetime) JSON.deserialize('"' + req.activityDateTime + '"', Datetime.class);
            }
            if (!String.isBlank(req.type))        { ev.Type = req.type; }
            if (!String.isBlank(req.description)) { ev.Description = req.description; }
            if (!String.isBlank(req.location))    { ev.Location = req.location; }
            if (!String.isBlank(req.showAs))      { ev.ShowAs = req.showAs; }
            if (!String.isBlank(req.whatId))      { ev.WhatId = req.whatId; }
            if (!String.isBlank(req.ownerId))     { ev.OwnerId = req.ownerId; }
            update ev;
        }
        writeSuccess(res, recId);
    }

    private static void handleDelete(RestResponse res, WriteRequest req) {
        Id recId = resolveVerifiedId(res, req);
        if (recId == null) { return; } // error already written
        String sot = req.sobjectType.trim();
        if (sot == 'Task') {
            delete new Task(Id = recId);
        } else if (sot == 'Event') {
            delete new Event(Id = recId);
        } else {
            // resolveVerifiedId also permits FinancialGoal / PersonLifeEvent for
            // update, but delete is only wired for activities. Reject cleanly
            // rather than attempting a mismatched-type DML.
            writeError(res, 400, 'Delete is only supported for Task and Event.');
            return;
        }
        writeSuccess(res, recId);
    }

    private static void writeSuccess(RestResponse res, Id recordId) {
        res.statusCode = 200;
        res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{
            'success' => true,
            'id' => recordId
        }));
    }

    private static void writeError(RestResponse res, Integer code, String msg) {
        res.statusCode = code;
        res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{
            'success' => false,
            'error' => msg
        }));
    }
}
