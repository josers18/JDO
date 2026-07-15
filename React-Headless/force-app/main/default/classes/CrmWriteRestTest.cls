@IsTest
private class CrmWriteRestTest {
    private static void setupRequest(String body) {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/crm/';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf(body);
        RestContext.request = req;
        RestContext.response = new RestResponse();
    }

    private static Map<String, Object> parseBody() {
        return (Map<String, Object>) JSON.deserializeUntyped(RestContext.response.responseBody.toString());
    }

    @IsTest
    static void createsTask() {
        setupRequest('{"action":"task","subject":"Follow up call","description":"Ring the client","dueDate":"2026-08-01","priority":"High"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'task should 200');
        Map<String, Object> out = parseBody();
        System.assertEquals(true, out.get('success'), 'success flag');
        System.assertNotEquals(null, out.get('id'), 'task id returned');
        System.assertEquals(1, [SELECT COUNT() FROM Task WHERE Subject = 'Follow up call'], 'one task inserted');
    }

    @IsTest
    static void createsEvent() {
        setupRequest('{"action":"event","subject":"Portfolio review","activityDateTime":"2026-08-05T15:00:00Z","durationMinutes":45}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'event should 200');
        Map<String, Object> out = parseBody();
        System.assertEquals(true, out.get('success'), 'success flag');
        System.assertNotEquals(null, out.get('id'), 'event id returned');
        System.assertEquals(1, [SELECT COUNT() FROM Event WHERE Subject = 'Portfolio review'], 'one event inserted');
    }

    @IsTest
    static void createsEventWithDefaults() {
        setupRequest('{"action":"event","subject":"Quick sync"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'event defaults should 200');
        Event ev = [SELECT DurationInMinutes FROM Event WHERE Subject = 'Quick sync' LIMIT 1];
        System.assertEquals(30, ev.DurationInMinutes, 'default duration');
    }

    @IsTest
    static void createsCase() {
        setupRequest('{"action":"case","subject":"Card dispute","description":"Customer disputes a charge"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'case should 200');
        Map<String, Object> out = parseBody();
        System.assertEquals(true, out.get('success'), 'success flag');
        System.assertNotEquals(null, out.get('id'), 'case id returned');
        Case c = [SELECT Origin, Status, Priority FROM Case WHERE Subject = 'Card dispute' LIMIT 1];
        System.assertEquals('React Command Center', c.Origin, 'origin set');
        System.assertEquals('New', c.Status, 'default status');
        System.assertEquals('Medium', c.Priority, 'default priority');
    }

    @IsTest
    static void sendsEmail() {
        setupRequest('{"action":"email","subject":"Your statement","toAddress":"client@example.com","htmlBody":"<p>Attached</p>"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'email should 200');
        Map<String, Object> out = parseBody();
        System.assertEquals(true, out.get('success'), 'success flag');
        System.assertEquals(null, out.get('id'), 'email returns no id');
    }

    @IsTest
    static void handlesCaseInsensitiveAction() {
        setupRequest('{"action":"  TASK  ","subject":"Cased action"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'case-insensitive action should 200');
        System.assertEquals(true, parseBody().get('success'), 'success flag');
    }

    @IsTest
    static void rejectsBlankBody() {
        setupRequest('');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'blank body should 400');
        System.assertEquals(false, parseBody().get('success'), 'success false');
    }

    @IsTest
    static void rejectsUnknownAction() {
        setupRequest('{"action":"frobnicate","subject":"nope"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'unknown action should 400');
        System.assert(((String) parseBody().get('error')).contains('Unknown action'), 'error mentions unknown action');
    }

    @IsTest
    static void rejectsBlankSubject() {
        setupRequest('{"action":"task"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'blank subject should 400');
        System.assertEquals(false, parseBody().get('success'), 'success false');
    }

    @IsTest
    static void rejectsEmailWithoutToAddress() {
        setupRequest('{"action":"email","subject":"No recipient"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'email without recipient should 400');
        System.assertEquals(false, parseBody().get('success'), 'success false');
    }

    @IsTest
    static void updatesTask() {
        Task t = new Task(Subject = 'Old subject', Status = 'Not Started', Priority = 'Normal', ActivityDate = Date.today());
        insert t;
        setupRequest('{"action":"update","sobjectType":"Task","recordId":"' + t.Id + '","subject":"New subject","status":"Completed","priority":"High","dueDate":"2026-09-01"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'update task should 200');
        System.assertEquals(true, parseBody().get('success'), 'success flag');
        Task after = [SELECT Subject, Status, Priority, ActivityDate FROM Task WHERE Id = :t.Id];
        System.assertEquals('New subject', after.Subject, 'subject updated');
        System.assertEquals('Completed', after.Status, 'status updated');
        System.assertEquals('High', after.Priority, 'priority updated');
        System.assertEquals(Date.valueOf('2026-09-01'), after.ActivityDate, 'date updated');
    }

    @IsTest
    static void updatesEvent() {
        Event ev = new Event(Subject = 'Old meeting', ActivityDateTime = Datetime.now(), DurationInMinutes = 30);
        insert ev;
        setupRequest('{"action":"update","sobjectType":"Event","recordId":"' + ev.Id + '","subject":"New meeting","activityDateTime":"2026-09-05T16:00:00Z"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'update event should 200');
        Event after = [SELECT Subject, ActivityDateTime FROM Event WHERE Id = :ev.Id];
        System.assertEquals('New meeting', after.Subject, 'subject updated');
        System.assertEquals(
            (Datetime) JSON.deserialize('"2026-09-05T16:00:00Z"', Datetime.class),
            after.ActivityDateTime,
            'activityDateTime updated'
        );
    }

    @IsTest
    static void updateLeavesOmittedFieldsUntouched() {
        // Only the subject is sent; Status/Priority/ActivityDate must survive.
        Task t = new Task(Subject = 'Before', Status = 'In Progress', Priority = 'High', ActivityDate = Date.valueOf('2026-08-15'));
        insert t;
        setupRequest('{"action":"update","sobjectType":"Task","recordId":"' + t.Id + '","subject":"After"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'subject-only update should 200');
        Task after = [SELECT Subject, Status, Priority, ActivityDate FROM Task WHERE Id = :t.Id];
        System.assertEquals('After', after.Subject, 'subject updated');
        System.assertEquals('In Progress', after.Status, 'status left untouched');
        System.assertEquals('High', after.Priority, 'priority left untouched');
        System.assertEquals(Date.valueOf('2026-08-15'), after.ActivityDate, 'date left untouched');
    }

    @IsTest
    static void rejectsUpdateWhenIdTypeMismatchesSobjectType() {
        // A real Task Id declared as an Event — must 400, not surface a 500.
        Task t = new Task(Subject = 'x', Status = 'Not Started', Priority = 'Normal');
        insert t;
        setupRequest('{"action":"update","sobjectType":"Event","recordId":"' + t.Id + '","subject":"nope"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'Id/type mismatch should 400');
        System.assertEquals(false, parseBody().get('success'), 'success false');
    }

    @IsTest
    static void rejectsUpdateWithoutRecordId() {
        setupRequest('{"action":"update","sobjectType":"Task","subject":"No id"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'missing recordId should 400');
        System.assertEquals(false, parseBody().get('success'), 'success false');
    }

    @IsTest
    static void rejectsUpdateWithBadSobjectType() {
        Task t = new Task(Subject = 'x', Status = 'Not Started', Priority = 'Normal');
        insert t;
        setupRequest('{"action":"update","sobjectType":"Contact","recordId":"' + t.Id + '","subject":"nope"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'bad sobjectType should 400');
        System.assert(((String) parseBody().get('error')).containsIgnoreCase('sobjecttype'), 'error mentions sobjectType');
    }

    @IsTest
    static void updateSetsTypeAndDescription() {
        Task t = new Task(Subject = 'Typed task', Status = 'Not Started', Priority = 'Normal');
        insert t;
        setupRequest('{"action":"update","sobjectType":"Task","recordId":"' + t.Id + '","type":"Meeting","description":"call notes"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'update task type/desc should 200');
        Task after = [SELECT Type, Description FROM Task WHERE Id = :t.Id];
        System.assertEquals('Meeting', after.Type, 'type set');
        System.assertEquals('call notes', after.Description, 'description set');
    }

    @IsTest
    static void updateSetsEventShowAsAndLocation() {
        Event ev = new Event(Subject = 'Typed event', ActivityDateTime = Datetime.now(), DurationInMinutes = 30);
        insert ev;
        setupRequest('{"action":"update","sobjectType":"Event","recordId":"' + ev.Id + '","type":"Call","location":"HQ","showAs":"Free","description":"agenda"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'update event fields should 200');
        Event after = [SELECT Type, Location, ShowAs, Description FROM Event WHERE Id = :ev.Id];
        System.assertEquals('Call', after.Type, 'type set');
        System.assertEquals('HQ', after.Location, 'location set');
        System.assertEquals('Free', after.ShowAs, 'showAs set');
        System.assertEquals('agenda', after.Description, 'description set');
    }

    @IsTest
    static void deletesTask() {
        Task t = new Task(Subject = 'Doomed task', Status = 'Not Started', Priority = 'Normal');
        insert t;
        setupRequest('{"action":"delete","sobjectType":"Task","recordId":"' + t.Id + '"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'delete task should 200');
        System.assertEquals(true, parseBody().get('success'), 'success flag');
        System.assertEquals(0, [SELECT COUNT() FROM Task WHERE Id = :t.Id], 'task deleted');
    }

    @IsTest
    static void deletesEvent() {
        Event ev = new Event(Subject = 'Doomed event', ActivityDateTime = Datetime.now(), DurationInMinutes = 30);
        insert ev;
        setupRequest('{"action":"delete","sobjectType":"Event","recordId":"' + ev.Id + '"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'delete event should 200');
        System.assertEquals(true, parseBody().get('success'), 'success flag');
        System.assertEquals(0, [SELECT COUNT() FROM Event WHERE Id = :ev.Id], 'event deleted');
    }

    @IsTest
    static void rejectsDeleteWithoutRecordId() {
        setupRequest('{"action":"delete","sobjectType":"Task"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'delete without recordId should 400');
        System.assertEquals(false, parseBody().get('success'), 'success false');
    }

    @IsTest
    static void rejectsDeleteWhenIdTypeMismatches() {
        // A real Task Id declared as an Event — must 400, not surface a 500.
        Task t = new Task(Subject = 'x', Status = 'Not Started', Priority = 'Normal');
        insert t;
        setupRequest('{"action":"delete","sobjectType":"Event","recordId":"' + t.Id + '"}');
        Test.startTest();
        CrmWriteRest.write();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'delete Id/type mismatch should 400');
        System.assertEquals(false, parseBody().get('success'), 'success false');
        System.assertEquals(1, [SELECT COUNT() FROM Task WHERE Id = :t.Id], 'task not deleted');
    }
}
