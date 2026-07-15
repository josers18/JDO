@IsTest
private class AiGenerateRestTest {
    private static RestResponse invoke(String body) {
        RestRequest req = new RestRequest();
        req.requestUri = '/services/apexrest/ai/generate';
        req.httpMethod = 'POST';
        req.requestBody = body == null ? null : Blob.valueOf(body);
        RestContext.request = req;
        RestContext.response = new RestResponse();
        AiGenerateRest.run();
        return RestContext.response;
    }

    @IsTest
    static void returnsGeneratedTextForValidTask() {
        Test.startTest();
        RestResponse res = invoke('{"task":"queue_rationale","prompt":"Explain the order."}');
        Test.stopTest();
        System.assertEquals(200, res.statusCode, 'valid request should be 200');
        Map<String, Object> out = (Map<String, Object>) JSON.deserializeUntyped(res.responseBody.toString());
        System.assertEquals('TEST_AI_TEXT', out.get('text'), 'test branch returns deterministic text');
        System.assertEquals('model', out.get('source'), 'test branch reports model source');
    }

    @IsTest
    static void acceptsEachAllowlistedTask() {
        for (String t : new List<String>{ 'queue_rationale', 'pipeline_summary', 'followups', 'freeform' }) {
            RestResponse res = invoke('{"task":"' + t + '","prompt":"hi"}');
            System.assertEquals(200, res.statusCode, 'task ' + t + ' should be allowed');
        }
    }

    @IsTest
    static void rejectsUnknownTask() {
        RestResponse res = invoke('{"task":"delete_everything","prompt":"hi"}');
        System.assertEquals(400, res.statusCode, 'unknown task should be 400');
        Map<String, Object> out = (Map<String, Object>) JSON.deserializeUntyped(res.responseBody.toString());
        System.assert(((String) out.get('error')).containsIgnoreCase('task'), 'error should mention task');
    }

    @IsTest
    static void rejectsEmptyPrompt() {
        RestResponse res = invoke('{"task":"freeform","prompt":"   "}');
        System.assertEquals(400, res.statusCode, 'empty prompt should be 400');
    }

    @IsTest
    static void rejectsEmptyBody() {
        RestResponse res = invoke('');
        System.assertEquals(400, res.statusCode, 'empty body should be 400');
    }

    @IsTest
    static void acceptsOptionalModelAndParams() {
        // The Configuration page forwards modelName + generation params. They
        // must deserialize into GenRequest and be accepted without error.
        // (Model-fallback validation lives past the Test.isRunningTest branch,
        //  so it is exercised by CommandCenterConfigRestTest, not here.)
        RestResponse res = invoke(
            '{"task":"queue_rationale","prompt":"hi","modelName":"sfdc_ai__DefaultGPT4OmniMini","temperature":0.4,"maxTokens":256}'
        );
        System.assertEquals(200, res.statusCode, 'request with model + params should be 200');
        Map<String, Object> out = (Map<String, Object>) JSON.deserializeUntyped(res.responseBody.toString());
        System.assertEquals('TEST_AI_TEXT', out.get('text'), 'still returns deterministic test text');
    }

    @IsTest
    static void acceptsBogusModelNameWithoutError() {
        // A stale/typo'd model must not break the request contract — the server
        // silently falls back to the default at generation time.
        RestResponse res = invoke('{"task":"freeform","prompt":"hi","modelName":"totally_made_up_model"}');
        System.assertEquals(200, res.statusCode, 'bogus model should not 400/500');
    }

    @IsTest
    static void acceptsBlankModelName() {
        // Blank modelName = "use server default" — the common case from an
        // unconfigured action.
        RestResponse res = invoke('{"task":"followups","prompt":"hi","modelName":""}');
        System.assertEquals(200, res.statusCode, 'blank model should be accepted');
    }
}
