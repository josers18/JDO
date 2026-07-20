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
        public String sobjectType;      // 'Task' | 'Event'  (required for update/delete)
        public String recordId;         // Id of the record to update/delete
        public String type;             // Task/Event Type picklist
        public String location;         // Event location
        public String showAs;           // Event ShowAs (Busy|OutOfOffice|Free)
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
            } else if (action == 'update') {
                handleUpdate(res, reqBody);
            } else if (action == 'delete') {
                handleDelete(res, reqBody);
            } else {
                writeError(res, 400, 'Unknown action "' + reqBody.action + '". Use task, event, case, email, update, or delete.');
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
        if (sot != 'Task' && sot != 'Event') {
            writeError(res, 400, 'Unsupported sobjectType "' + req.sobjectType + '". Use Task or Event.');
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
        if (req.sobjectType.trim() == 'Task') {
            delete new Task(Id = recId);
        } else {
            delete new Event(Id = recId);
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
