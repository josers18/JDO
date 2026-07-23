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
        return doPostUri('/services/apexrest/config/', body);
    }

    /** POST to an arbitrary config sub-path (e.g. /themes, /active-theme). */
    private static RestResponse doPostUri(String uri, String body) {
        RestRequest req = new RestRequest();
        req.requestUri = uri;
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

    /** Configurable favicon-callout stub for the /brand-logo endpoint. */
    private class FaviconMock implements HttpCalloutMock {
        Integer status;
        Blob bodyBlob;
        String contentType;
        FaviconMock(Integer s, Blob b, String ct) {
            status = s;
            bodyBlob = b;
            contentType = ct;
        }
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse r = new HttpResponse();
            r.setStatusCode(status);
            if (bodyBlob != null) r.setBodyAsBlob(bodyBlob);
            if (contentType != null) r.setHeader('Content-Type', contentType);
            return r;
        }
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

    // ── brand theming ─────────────────────────────────────────────────────

    @IsTest
    static void brandLogoSuccessReturnsBase64() {
        Test.setMock(HttpCalloutMock.class, new FaviconMock(200, Blob.valueOf('PNGDATA'), 'image/png'));
        Test.startTest();
        RestResponse res = doGet('/services/apexrest/config/brand-logo?url=acmebank.com');
        Test.stopTest();
        System.assertEquals(200, res.statusCode, 'brand-logo should be 200');
        Map<String, Object> out = body(res);
        String b64 = (String) out.get('logoBase64');
        System.assert(String.isNotBlank(b64), 'a successful callout returns a non-blank base64 string');
        System.assert(((String) out.get('logoContentType')).startsWith('image/'), 'content type is an image type');
    }

    @IsTest
    static void brandLogoFailureReturnsNullNever500() {
        Test.setMock(HttpCalloutMock.class, new FaviconMock(404, null, null));
        Test.startTest();
        RestResponse res = doGet('/services/apexrest/config/brand-logo?url=acmebank.com');
        Test.stopTest();
        System.assertEquals(200, res.statusCode, 'a non-200 callout still returns 200, never 500');
        System.assertEquals(null, body(res).get('logoBase64'), 'non-200 callout degrades to null logo');
    }

    @IsTest
    static void brandLogoOversizeReturnsNull() {
        // 24001 raw bytes → base64 is ~4/3 larger (~32001 chars) > the 32000 cap.
        String raw = ''.leftPad(24001, 'x');
        Test.setMock(HttpCalloutMock.class, new FaviconMock(200, Blob.valueOf(raw), 'image/png'));
        Test.startTest();
        RestResponse res = doGet('/services/apexrest/config/brand-logo?url=acmebank.com');
        Test.stopTest();
        System.assertEquals(200, res.statusCode, 'oversize logo still returns 200, never 500');
        System.assertEquals(null, body(res).get('logoBase64'), 'oversize base64 degrades to null logo');
    }

    @IsTest
    static void themesUpsertReadDelete() {
        String upsertBody = '{"op":"upsert","theme":{"id":"t1","name":"Acme","sourceUrl":"acme.com",' +
            '"logoBase64":null,"logoContentType":"","accent":"#123abc","accentSoft":"#abcdef"}}';
        RestResponse up = doPostUri('/services/apexrest/config/themes', upsertBody);
        System.assertEquals(200, up.statusCode, 'upsert should be 200');
        List<Object> upThemes = (List<Object>) body(up).get('themes');
        Boolean found = false;
        for (Object t : upThemes) {
            if (t instanceof Map<String, Object> && 't1'.equals(((Map<String, Object>) t).get('id'))) {
                found = true;
            }
        }
        System.assert(found, 'upsert response themes array contains the new theme');

        RestResponse res = doGet('/services/apexrest/config/themes');
        System.assertEquals(200, res.statusCode, 'themes read should be 200');
        Map<String, Object> out = body(res);
        List<Object> themes = (List<Object>) out.get('themes');
        System.assertEquals(1, themes.size(), 'one theme in the library after upsert');
        System.assertEquals(null, out.get('activeThemeId'), 'not yet active for the running user');

        RestResponse del = doPostUri('/services/apexrest/config/themes', '{"op":"delete","id":"t1"}');
        System.assertEquals(200, del.statusCode, 'delete should be 200');
        System.assertEquals(0, ((List<Object>) body(del).get('themes')).size(), 'theme gone after delete');
    }

    @IsTest
    static void themeSanitizeRejectsBadHexAndDropsGradient() {
        String upsertBody = '{"op":"upsert","theme":{"id":"t1","name":"Bad","sourceUrl":"acme.com",' +
            '"accent":"#zzz","accentSoft":"#445566","gradient":"linear-gradient(...)","glow":"radial(...)"}}';
        doPostUri('/services/apexrest/config/themes', upsertBody);

        RestResponse res = doGet('/services/apexrest/config/themes');
        Map<String, Object> themeMap = (Map<String, Object>) ((List<Object>) body(res).get('themes'))[0];
        System.assertEquals('#14b8a6', themeMap.get('accent'), 'invalid hex accent coerces to the safe default');
        System.assertEquals('#445566', themeMap.get('accentSoft'), 'valid hex accentSoft is preserved');
        System.assert(!themeMap.containsKey('gradient'), 'gradient is dropped from the stored theme (D1)');
        System.assert(!themeMap.containsKey('glow'), 'glow is dropped from the stored theme (D1)');
    }

    @IsTest
    static void activeThemePerUser() {
        String upsertBody = '{"op":"upsert","theme":{"id":"t1","name":"Acme","sourceUrl":"acme.com",' +
            '"accent":"#112233","accentSoft":"#445566"}}';
        doPostUri('/services/apexrest/config/themes', upsertBody);

        RestResponse setRes = doPostUri('/services/apexrest/config/active-theme', '{"themeId":"t1"}');
        System.assertEquals(200, setRes.statusCode, 'setting active theme should be 200');

        RestResponse res = doGet('/services/apexrest/config/themes');
        System.assertEquals('t1', body(res).get('activeThemeId'), 'active theme resolves for the running user');

        // Prove per-user keying by inspecting the persisted map directly.
        CommandCenterConfig__c rec = [SELECT Active_Themes__c FROM CommandCenterConfig__c WHERE Name = 'GLOBAL' LIMIT 1];
        Map<String, Object> activeMap = (Map<String, Object>) JSON.deserializeUntyped(rec.Active_Themes__c);
        System.assertEquals('t1', activeMap.get(UserInfo.getUserId()), 'active map is keyed by the running UserId');
    }

    @IsTest
    static void activeThemeFallbackWhenDeleted() {
        String upsertBody = '{"op":"upsert","theme":{"id":"t1","name":"Acme","sourceUrl":"acme.com",' +
            '"accent":"#112233","accentSoft":"#445566"}}';
        doPostUri('/services/apexrest/config/themes', upsertBody);
        doPostUri('/services/apexrest/config/active-theme', '{"themeId":"t1"}');
        doPostUri('/services/apexrest/config/themes', '{"op":"delete","id":"t1"}');

        RestResponse res = doGet('/services/apexrest/config/themes');
        System.assertEquals(null, body(res).get('activeThemeId'), 'active id pointing at a deleted theme resolves to null');
    }
}
