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
        setupRequest('{"action":"delete","subject":"nope"}');
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
}
