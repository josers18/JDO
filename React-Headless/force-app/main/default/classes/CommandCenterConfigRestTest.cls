@IsTest
private class CommandCenterConfigRestTest {
    private static RestResponse doGet(String uri) {
        RestRequest req = new RestRequest();
        req.requestUri = uri;
        req.httpMethod = 'GET';
        // Mimic the framework populating req.params from the query string.
        Integer q = uri.indexOf('?');
        if (q >= 0) {
            for (String pair : uri.substring(q + 1).split('&')) {
                List<String> kv = pair.split('=');
                if (kv.size() == 2) req.params.put(kv[0], kv[1]);
            }
        }
        RestContext.request = req;
        RestContext.response = new RestResponse();
        CommandCenterConfigRest.read();
        return RestContext.response;
    }

    private static RestResponse doPost(String body) {
        RestRequest req = new RestRequest();
        req.requestUri = '/services/apexrest/config/';
        req.httpMethod = 'POST';
        req.requestBody = body == null ? null : Blob.valueOf(body);
        RestContext.request = req;
        RestContext.response = new RestResponse();
        CommandCenterConfigRest.save();
        return RestContext.response;
    }

    @SuppressWarnings('PMD.ApexAssertionsShouldIncludeMessage')
    private static Map<String, Object> body(RestResponse res) {
        return (Map<String, Object>) JSON.deserializeUntyped(res.responseBody.toString());
    }

    @IsTest
    static void readReturnsDefaultsWhenUnset() {
        RestResponse res = doGet('/services/apexrest/config/?center=retail');
        System.assertEquals(200, res.statusCode, 'unset center should read defaults at 200');
        Map<String, Object> cfg = (Map<String, Object>) body(res).get('config');
        Map<String, Object> models = (Map<String, Object>) cfg.get('models');
        Map<String, Object> params = (Map<String, Object>) cfg.get('params');
        System.assertEquals('', models.get('queue_rationale'), 'default model is blank (server default)');
        System.assertEquals(0.7, params.get('temperature'), 'default temperature');
        System.assertEquals(512, params.get('maxTokens'), 'default maxTokens');
    }

    @IsTest
    static void rejectsUnknownCenterOnRead() {
        RestResponse res = doGet('/services/apexrest/config/?center=mars');
        System.assertEquals(400, res.statusCode, 'unknown center should be 400');
        System.assert(((String) body(res).get('error')).containsIgnoreCase('center'), 'error mentions center');
    }

    @IsTest
    static void saveClampsParamsAndAllowlistsModels() {
        // temperature above range, maxTokens above range, one valid + one bogus model.
        String payload =
            '{"center":"retail","config":{"models":{"queue_rationale":"sfdc_ai__DefaultGPT4OmniMini","freeform":"bogus_x"},' +
            '"params":{"temperature":5,"maxTokens":99999}}}';
        RestResponse res = doPost(payload);
        System.assertEquals(200, res.statusCode, 'valid save should be 200');
        Map<String, Object> cfg = (Map<String, Object>) body(res).get('config');
        Map<String, Object> models = (Map<String, Object>) cfg.get('models');
        Map<String, Object> params = (Map<String, Object>) cfg.get('params');
        System.assertEquals('sfdc_ai__DefaultGPT4OmniMini', models.get('queue_rationale'), 'valid model kept');
        System.assertEquals('', models.get('freeform'), 'bogus model dropped to blank');
        System.assertEquals(2.0, params.get('temperature'), 'temperature clamped to 2.0');
        System.assertEquals(4096, params.get('maxTokens'), 'maxTokens clamped to 4096');
    }

    @IsTest
    static void savePersistsAndRoundTrips() {
        doPost('{"center":"wealth","config":{"models":{"pipeline_summary":"sfdc_ai__DefaultOpenAIGPT4"},"params":{"temperature":1.2,"maxTokens":256}}}');
        RestResponse res = doGet('/services/apexrest/config/?center=wealth');
        System.assertEquals(200, res.statusCode, 'read back should be 200');
        Map<String, Object> cfg = (Map<String, Object>) body(res).get('config');
        Map<String, Object> models = (Map<String, Object>) cfg.get('models');
        Map<String, Object> params = (Map<String, Object>) cfg.get('params');
        System.assertEquals('sfdc_ai__DefaultOpenAIGPT4', models.get('pipeline_summary'), 'saved model persisted');
        System.assertEquals(1.2, params.get('temperature'), 'saved temperature persisted');
        System.assertEquals(256, params.get('maxTokens'), 'saved maxTokens persisted');
    }

    @IsTest
    static void centersAreIndependent() {
        doPost('{"center":"retail","config":{"models":{"freeform":"sfdc_ai__DefaultGPT4Omni"},"params":{"temperature":0.5,"maxTokens":100}}}');
        // Commercial was never written — must still read defaults.
        RestResponse res = doGet('/services/apexrest/config/?center=commercial');
        Map<String, Object> cfg = (Map<String, Object>) body(res).get('config');
        Map<String, Object> models = (Map<String, Object>) cfg.get('models');
        Map<String, Object> params = (Map<String, Object>) cfg.get('params');
        System.assertEquals('', models.get('freeform'), 'commercial untouched by retail save');
        System.assertEquals(0.7, params.get('temperature'), 'commercial keeps default temperature');
    }

    @IsTest
    static void rejectsUnknownCenterOnSave() {
        RestResponse res = doPost('{"center":"pluto","config":{"models":{},"params":{}}}');
        System.assertEquals(400, res.statusCode, 'unknown center on save should be 400');
    }

    @IsTest
    static void rejectsMissingConfigOnSave() {
        RestResponse res = doPost('{"center":"retail"}');
        System.assertEquals(400, res.statusCode, 'missing config object should be 400');
    }

    @IsTest
    static void modelsEndpointReturnsFallbackCatalogInTest() {
        // Test.isRunningTest() short-circuits the live callout → curated fallback.
        RestResponse res = doGet('/services/apexrest/config/models');
        System.assertEquals(200, res.statusCode, 'models endpoint should be 200');
        Map<String, Object> out = body(res);
        System.assertEquals('fallback', out.get('source'), 'test run uses the fallback catalog');
        List<Object> models = (List<Object>) out.get('models');
        System.assert(!models.isEmpty(), 'fallback catalog is non-empty');
    }

    @IsTest
    static void secondSaveUpdatesExistingSingleton() {
        doPost('{"center":"retail","config":{"models":{"freeform":"sfdc_ai__DefaultGPT4Omni"},"params":{"temperature":0.7,"maxTokens":512}}}');
        doPost('{"center":"retail","config":{"models":{"freeform":"sfdc_ai__DefaultGPT4OmniMini"},"params":{"temperature":0.7,"maxTokens":512}}}');
        // Only one singleton record should exist regardless of save count.
        Integer count = [SELECT COUNT() FROM CommandCenterConfig__c WHERE Name = 'GLOBAL'];
        System.assertEquals(1, count, 'repeated saves upsert one singleton, not many');
        RestResponse res = doGet('/services/apexrest/config/?center=retail');
        Map<String, Object> cfg = (Map<String, Object>) body(res).get('config');
        Map<String, Object> models = (Map<String, Object>) cfg.get('models');
        System.assertEquals('sfdc_ai__DefaultGPT4OmniMini', models.get('freeform'), 'second save wins');
    }
}
