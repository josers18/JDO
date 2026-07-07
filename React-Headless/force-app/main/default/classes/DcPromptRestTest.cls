/**
 * Tests for DcPromptRest. Flow.Interview is not invoked under test (guarded by
 * Test.isRunningTest() in the class), so these exercise request parsing,
 * validation, the flow allowlist, and the response envelope.
 */
@IsTest
private class DcPromptRestTest {
    private static RestResponse invoke(String body) {
        RestRequest req = new RestRequest();
        req.requestUri = '/services/apexrest/dc/prompt';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf(body);
        RestContext.request = req;
        RestContext.response = new RestResponse();
        DcPromptRest.run();
        return RestContext.response;
    }

    @IsTest
    static void returnsTextForAllowedFlow() {
        Account a = new Account(Name = 'Prompt Co');
        insert a;

        Test.startTest();
        RestResponse res = invoke(
            '{"flowApiName":"DC_AccountSummary_Widget","recordId":"' + a.Id + '","recordVar":"recordId"}'
        );
        Test.stopTest();

        System.assertEquals(200, res.statusCode, 'allowed flow should return 200');
        Map<String, Object> out = (Map<String, Object>) JSON.deserializeUntyped(res.responseBody.toString());
        System.assertEquals('TEST_PROMPT_RESPONSE', out.get('text'), 'test stub text expected');
    }

    @IsTest
    static void rejectsBlankFlow() {
        RestResponse res = invoke('{"recordId":"001000000000000AAA"}');
        System.assertEquals(400, res.statusCode, 'blank flow -> 400');
        System.assert(res.responseBody.toString().contains('flowApiName'), 'error mentions flowApiName');
    }

    @IsTest
    static void rejectsFlowNotOnAllowlist() {
        Account a = new Account(Name = 'Nope Co');
        insert a;
        RestResponse res = invoke('{"flowApiName":"Some_Other_Flow","recordId":"' + a.Id + '"}');
        System.assertEquals(400, res.statusCode, 'non-allowlisted flow -> 400');
        System.assert(res.responseBody.toString().contains('not permitted'), 'error explains allowlist');
    }

    @IsTest
    static void rejectsBlankRecordId() {
        RestResponse res = invoke('{"flowApiName":"DC_AccountSummary_Widget"}');
        System.assertEquals(400, res.statusCode, 'blank recordId -> 400');
        System.assert(res.responseBody.toString().contains('recordId'), 'error mentions recordId');
    }

    @IsTest
    static void rejectsMalformedRecordId() {
        RestResponse res = invoke('{"flowApiName":"DC_AccountSummary_Widget","recordId":"not-an-id"}');
        System.assertEquals(400, res.statusCode, 'bad id -> 400');
    }

    @IsTest
    static void handlesEmptyBody() {
        RestResponse res = invoke('');
        System.assertEquals(400, res.statusCode, 'empty body -> 400');
    }
}
