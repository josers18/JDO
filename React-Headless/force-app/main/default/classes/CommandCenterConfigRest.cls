/**
 * Configuration bridge for the React command centers (Retail/Wealth/Commercial).
 *
 * WHY REST (same constraint as DcBridgeRest / AiGenerateRest / CrmWriteRest): a
 * Multi-Framework UI bundle's app-domain session can only reach
 * /services/apexrest/*. So the Configuration page reads and writes its settings
 * through this custom @RestResource.
 *
 * Config is a single CommandCenterConfig__c record (a singleton — DeveloperName
 * 'GLOBAL'), one JSON blob per center in its own LongText field. Read with a
 * SOQL LIMIT 1; written instantly with an upsert (no async metadata deploy).
 *
 *   GET  /services/apexrest/config/?center=retail
 *        200: { "config": { "models": {...}, "params": {...} } }
 *   GET  /services/apexrest/config/models
 *        200: { "models": [{name,label}...], "source": "catalog"|"fallback" }
 *   POST /services/apexrest/config/    body: { center, config }
 *        200: { "config": { ...saved... } }
 *        400: { "error": "message" }
 *        500: { "error": "message" }
 */
@RestResource(urlMapping='/config/*')
global with sharing class CommandCenterConfigRest {
    private static final String SINGLETON_NAME = 'GLOBAL';
    private static final String DEFAULT_MODEL = 'sfdc_ai__DefaultGPT4Omni';
    private static final Set<String> CENTERS = new Set<String>{ 'retail', 'wealth', 'commercial' };
    private static final Set<String> ACTIONS = new Set<String>{
        'queue_rationale', 'pipeline_summary', 'followups', 'freeform'
    };

    /** Curated model allowlist — the validation set AND the fallback catalog
     *  when the live Einstein catalog callout is unavailable. Label order is the
     *  dropdown order. Blank ('') is always accepted too: it means "use the
     *  server default model". */
    private static final List<Map<String, String>> FALLBACK_MODELS = new List<Map<String, String>>{
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultGPT4Omni',                    'label' => 'GPT-4o (default)' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultGPT4OmniMini',                'label' => 'GPT-4o mini' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultBedrockAnthropicClaude35Sonnet', 'label' => 'Claude 3.5 Sonnet' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultBedrockAnthropicClaude3Haiku',   'label' => 'Claude 3 Haiku' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultVertexAIGemini25Flash',       'label' => 'Gemini 2.5 Flash' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultOpenAIGPT4',                   'label' => 'GPT-4' }
    };

    // ── GET ────────────────────────────────────────────────────────────────
    @HttpGet
    global static void read() {
        RestResponse res = ensureResponse();
        try {
            RestRequest req = RestContext.request;
            String uri = req == null || req.requestURI == null ? '' : req.requestURI;
            // The models sub-path is a suffix on the mapped URL: /config/models
            if (uri.endsWith('/models')) {
                Map<String, Object> catalog = modelCatalog();
                writeRaw(res, 200, new Map<String, Object>{
                    'models' => catalog.get('models'),
                    'source' => catalog.get('source')
                });
                return;
            }
            String center = paramCenter(req);
            if (!CENTERS.contains(center)) {
                writeError(res, 400, 'Unknown center: ' + center);
                return;
            }
            writeRaw(res, 200, new Map<String, Object>{ 'config' => configForCenter(center) });
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'CommandCenterConfigRest.read: ' + e.getMessage());
            writeError(res, 500, 'Failed to read configuration.');
        }
    }

    // ── POST (save) ──────────────────────────────────────────────────────────
    @HttpPost
    global static void save() {
        RestResponse res = ensureResponse();
        try {
            RestRequest req = RestContext.request;
            String body = req != null && req.requestBody != null ? req.requestBody.toString() : '';
            Map<String, Object> parsed = String.isBlank(body)
                ? new Map<String, Object>()
                : (Map<String, Object>) JSON.deserializeUntyped(body);

            String center = parsed.get('center') == null ? '' : String.valueOf(parsed.get('center')).trim().toLowerCase();
            if (!CENTERS.contains(center)) {
                writeError(res, 400, 'Unknown center: ' + center);
                return;
            }
            Object cfgRaw = parsed.get('config');
            if (!(cfgRaw instanceof Map<String, Object>)) {
                writeError(res, 400, 'config object is required.');
                return;
            }

            Map<String, Object> clean = sanitize((Map<String, Object>) cfgRaw);
            persist(center, JSON.serialize(clean));
            writeRaw(res, 200, new Map<String, Object>{ 'config' => clean });
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'CommandCenterConfigRest.save: ' + e.getMessage());
            writeError(res, 500, 'Failed to save configuration.');
        }
    }

    // ── helpers ───────────────────────────────────────────────────────────

    /** Coerce an arbitrary inbound config map into the validated shape:
     *  models limited to known actions + allowlisted (or blank) values, params
     *  clamped to safe ranges. Unknown keys are dropped. */
    private static Map<String, Object> sanitize(Map<String, Object> cfg) {
        Set<String> allowed = allowedModelNames();

        Map<String, Object> models = new Map<String, Object>();
        Object mRaw = cfg.get('models');
        Map<String, Object> mIn = (mRaw instanceof Map<String, Object>) ? (Map<String, Object>) mRaw : new Map<String, Object>();
        for (String action : ACTIONS) {
            String picked = mIn.get(action) == null ? '' : String.valueOf(mIn.get(action)).trim();
            // '' (server default) always allowed; otherwise must be allowlisted.
            models.put(action, (picked == '' || allowed.contains(picked)) ? picked : '');
        }

        Map<String, Object> params = new Map<String, Object>();
        Object pRaw = cfg.get('params');
        Map<String, Object> pIn = (pRaw instanceof Map<String, Object>) ? (Map<String, Object>) pRaw : new Map<String, Object>();
        params.put('temperature', clampDouble(pIn.get('temperature'), 0.0, 2.0, 0.7));
        params.put('maxTokens', clampInt(pIn.get('maxTokens'), 1, 4096, 512));

        return new Map<String, Object>{ 'models' => models, 'params' => params };
    }

    private static Decimal clampDouble(Object v, Decimal lo, Decimal hi, Decimal dflt) {
        if (v == null) return dflt;
        try {
            Decimal d = Decimal.valueOf(String.valueOf(v));
            return d < lo ? lo : (d > hi ? hi : d);
        } catch (Exception e) {
            return dflt;
        }
    }

    private static Integer clampInt(Object v, Integer lo, Integer hi, Integer dflt) {
        if (v == null) return dflt;
        try {
            Integer i = Integer.valueOf(Decimal.valueOf(String.valueOf(v)).round());
            return i < lo ? lo : (i > hi ? hi : i);
        } catch (Exception e) {
            return dflt;
        }
    }

    private static Set<String> allowedModelNames() {
        Set<String> names = new Set<String>();
        for (Map<String, String> m : FALLBACK_MODELS) {
            names.add(m.get('name'));
        }
        return names;
    }

    /** The full defaults object used when a center has no saved config. */
    private static Map<String, Object> defaultConfig() {
        Map<String, Object> models = new Map<String, Object>();
        for (String action : ACTIONS) {
            models.put(action, '');
        }
        return new Map<String, Object>{
            'models' => models,
            'params' => new Map<String, Object>{ 'temperature' => 0.7, 'maxTokens' => 512 }
        };
    }

    /** Read the saved JSON for a center (defaults-filled if unset/blank). */
    private static Map<String, Object> configForCenter(String center) {
        CommandCenterConfig__c rec = loadSingleton();
        String stored = fieldFor(rec, center);
        if (String.isBlank(stored)) {
            return defaultConfig();
        }
        try {
            Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(stored);
            // Re-sanitize on read so a schema addition (new action) gets defaulted.
            return sanitize(parsed);
        } catch (Exception e) {
            return defaultConfig();
        }
    }

    private static String fieldFor(CommandCenterConfig__c rec, String center) {
        if (rec == null) return null;
        if (center == 'retail') return rec.Retail_Config__c;
        if (center == 'wealth') return rec.Wealth_Config__c;
        return rec.Commercial_Config__c;
    }

    private static CommandCenterConfig__c loadSingleton() {
        List<CommandCenterConfig__c> rows = [
            SELECT Id, Name, Retail_Config__c, Wealth_Config__c, Commercial_Config__c
            FROM CommandCenterConfig__c
            WHERE Name = :SINGLETON_NAME
            LIMIT 1
        ];
        return rows.isEmpty() ? null : rows[0];
    }

    /** Upsert the singleton, setting only the target center's field. */
    private static void persist(String center, String json) {
        CommandCenterConfig__c rec = loadSingleton();
        if (rec == null) {
            rec = new CommandCenterConfig__c(Name = SINGLETON_NAME);
        }
        if (center == 'retail') {
            rec.Retail_Config__c = json;
        } else if (center == 'wealth') {
            rec.Wealth_Config__c = json;
        } else {
            rec.Commercial_Config__c = json;
        }
        upsert rec;
    }

    /** Live Einstein model catalog with curated fallback. Never throws. During
     *  tests the callout is skipped and the fallback is returned. */
    private static Map<String, Object> modelCatalog() {
        if (!Test.isRunningTest()) {
            try {
                HttpRequest hr = new HttpRequest();
                hr.setEndpoint(Url.getOrgDomainUrl().toExternalForm()
                    + '/services/data/v62.0/einstein/platform/models');
                hr.setMethod('GET');
                hr.setHeader('Authorization', 'Bearer ' + UserInfo.getSessionId());
                hr.setHeader('Content-Type', 'application/json');
                hr.setTimeout(10000);
                HttpResponse resp = new Http().send(hr);
                if (resp.getStatusCode() == 200) {
                    List<Map<String, String>> parsed = parseCatalog(resp.getBody());
                    if (!parsed.isEmpty()) {
                        return new Map<String, Object>{ 'models' => parsed, 'source' => 'catalog' };
                    }
                }
            } catch (Exception e) {
                System.debug(LoggingLevel.WARN, 'Model catalog callout failed: ' + e.getMessage());
            }
        }
        return new Map<String, Object>{ 'models' => FALLBACK_MODELS, 'source' => 'fallback' };
    }

    /** Best-effort extraction of {name,label} pairs from the catalog response.
     *  The Einstein models endpoint shape varies by release, so we probe a few
     *  common list keys and identifier fields; anything unrecognized yields an
     *  empty list (→ caller uses the fallback). */
    private static List<Map<String, String>> parseCatalog(String bodyJson) {
        List<Map<String, String>> out = new List<Map<String, String>>();
        try {
            Object root = JSON.deserializeUntyped(bodyJson);
            if (!(root instanceof Map<String, Object>)) return out;
            Map<String, Object> m = (Map<String, Object>) root;
            List<Object> items = null;
            for (String key : new List<String>{ 'models', 'data', 'items', 'modelList' }) {
                if (m.get(key) instanceof List<Object>) {
                    items = (List<Object>) m.get(key);
                    break;
                }
            }
            if (items == null) return out;
            for (Object o : items) {
                if (!(o instanceof Map<String, Object>)) continue;
                Map<String, Object> row = (Map<String, Object>) o;
                String name = firstNonBlank(row, new List<String>{ 'name', 'modelName', 'id', 'apiName' });
                if (String.isBlank(name)) continue;
                String label = firstNonBlank(row, new List<String>{ 'label', 'displayName', 'title' });
                out.add(new Map<String, String>{ 'name' => name, 'label' => String.isBlank(label) ? name : label });
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'parseCatalog failed: ' + e.getMessage());
        }
        return out;
    }

    private static String firstNonBlank(Map<String, Object> row, List<String> keys) {
        for (String k : keys) {
            if (row.get(k) != null && !String.isBlank(String.valueOf(row.get(k)))) {
                return String.valueOf(row.get(k));
            }
        }
        return null;
    }

    private static String paramCenter(RestRequest req) {
        if (req == null || req.params == null) return '';
        String c = req.params.get('center');
        return c == null ? '' : c.trim().toLowerCase();
    }

    private static RestResponse ensureResponse() {
        RestResponse res = RestContext.response;
        if (res == null) {
            res = new RestResponse();
            RestContext.response = res;
        }
        res.addHeader('Content-Type', 'application/json');
        return res;
    }

    private static void writeRaw(RestResponse res, Integer code, Map<String, Object> payload) {
        res.statusCode = code;
        res.responseBody = Blob.valueOf(JSON.serialize(payload));
    }

    private static void writeError(RestResponse res, Integer code, String msg) {
        res.statusCode = code;
        res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{ 'error' => msg }));
    }
}
