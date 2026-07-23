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

    /** How long a probed catalog is considered fresh. After this the next
     *  /models read serves the cached list AND kicks off a background refresh
     *  (stale-while-revalidate). 24 hours. */
    private static final Long CACHE_TTL_MS = 24L * 60L * 60L * 1000L;
    /** Debounce so concurrent page loads in the stale window don't stack probe
     *  jobs (each probe = ~20 billable generations). 10 minutes. */
    private static final Long PROBE_DEBOUNCE_MS = 10L * 60L * 1000L;

    /** Curated model allowlist — the validation set AND the fallback catalog
     *  when the live Einstein catalog callout is unavailable. Label order is the
     *  dropdown order. Blank ('') is always accepted too: it means "use the
     *  server default model". */
    private static final List<Map<String, String>> FALLBACK_MODELS = new List<Map<String, String>>{
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultOpenAIGPT5',                       'label' => 'GPT-5' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultOpenAIGPT5Mini',                   'label' => 'GPT-5 mini' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultOpenAIGPT5Nano',                   'label' => 'GPT-5 nano' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultOpenAIGPT41',                      'label' => 'GPT-4.1' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultOpenAIGPT41Mini',                  'label' => 'GPT-4.1 mini' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultBedrockAnthropicClaude45Sonnet',   'label' => 'Claude 4.5 Sonnet' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultBedrockAnthropicClaude4Sonnet',    'label' => 'Claude 4 Sonnet' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultBedrockAnthropicClaude37Sonnet',   'label' => 'Claude 3.7 Sonnet' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultVertexAIGemini25Flash001',         'label' => 'Gemini 2.5 Flash' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultVertexAIGemini20Flash001',         'label' => 'Gemini 2.0 Flash' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultGPT4Omni',                         'label' => 'GPT-4o (default)' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultGPT4OmniMini',                     'label' => 'GPT-4o mini' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultBedrockAnthropicClaude35Sonnet',   'label' => 'Claude 3.5 Sonnet' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultBedrockAnthropicClaude3Haiku',     'label' => 'Claude 3 Haiku' },
        new Map<String, String>{ 'name' => 'sfdc_ai__DefaultOpenAIGPT4',                       'label' => 'GPT-4' }
    };

    // ── GET ────────────────────────────────────────────────────────────────
    @HttpGet
    global static void read() {
        RestResponse res = ensureResponse();
        try {
            RestRequest req = RestContext.request;
            String uri = req == null || req.requestURI == null ? '' : req.requestURI;
            // Suffix branches below match on the PATH only — requestURI may carry
            // a query string (e.g. /brand-logo?url=acmebank.com), which would
            // otherwise never end with '/brand-logo'.
            Integer q = uri.indexOf('?');
            String path = q >= 0 ? uri.substring(0, q) : uri;
            // The models sub-path is a suffix on the mapped URL: /config/models
            if (path.endsWith('/models')) {
                Boolean forceRefresh = req != null && req.params != null
                    && '1'.equals(req.params.get('refresh'));
                Map<String, Object> catalog = modelCatalog(forceRefresh);
                writeRaw(res, 200, new Map<String, Object>{
                    'models'     => catalog.get('models'),
                    'source'     => catalog.get('source'),
                    'refreshing' => catalog.get('refreshing')
                });
                return;
            }
            // Brand-logo lookup: /config/brand-logo?url=<site> → { logoBase64, logoContentType }.
            if (path.endsWith('/brand-logo')) {
                String rawUrl = req != null && req.params != null ? req.params.get('url') : null;
                writeRaw(res, 200, fetchBrandLogo(rawUrl));
                return;
            }
            // Theme library + this user's active theme: /config/themes.
            if (path.endsWith('/themes')) {
                writeRaw(res, 200, new Map<String, Object>{
                    'themes' => loadThemeList(),
                    'activeThemeId' => activeThemeIdForUser()
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
            String uri = req == null || req.requestURI == null ? '' : req.requestURI;
            String body = req != null && req.requestBody != null ? req.requestBody.toString() : '';
            Map<String, Object> parsed = String.isBlank(body)
                ? new Map<String, Object>()
                : (Map<String, Object>) JSON.deserializeUntyped(body);

            // Theme library mutation: /config/themes { op:'upsert'|'delete', theme?, id? }.
            // Checked BEFORE the center gate below — themes/active-theme POSTs are not centers.
            if (uri.endsWith('/themes')) {
                saveTheme(res, parsed);
                return;
            }
            // This user's active theme selection: /config/active-theme { themeId }.
            if (uri.endsWith('/active-theme')) {
                saveActiveTheme(res, parsed);
                return;
            }

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
            SELECT Id, Name, Retail_Config__c, Wealth_Config__c, Commercial_Config__c, Model_Catalog_Cache__c,
                   Theme_Library__c, Active_Themes__c
            FROM CommandCenterConfig__c
            WHERE Name = :SINGLETON_NAME
            LIMIT 1
        ];
        return rows.isEmpty() ? null : rows[0];
    }

    /** The singleton, or a fresh unsaved one if none exists yet — never null.
     *  ModelCatalogProbe.writeCache() uses this to persist probed results into
     *  Model_Catalog_Cache__c without having to duplicate the singleton lookup
     *  and the 'GLOBAL' naming convention. */
    public static CommandCenterConfig__c loadOrNewSingleton() {
        CommandCenterConfig__c rec = loadSingleton();
        return rec == null ? new CommandCenterConfig__c(Name = SINGLETON_NAME) : rec;
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

    // ── brand theming ─────────────────────────────────────────────────────

    /** Max stored logo data length (base64 chars) — keeps a single theme well
     *  under the field cap even with the max-size library. */
    private static final Integer MAX_LOGO_LEN = 32000;
    /** Cap on the shared theme library size. */
    private static final Integer MAX_THEMES = 50;
    /** Safe accent/accentSoft used when an inbound color fails hex validation. */
    private static final String DEFAULT_ACCENT = '#14b8a6';
    private static final String DEFAULT_ACCENT_SOFT = '#5eead4';
    private static final Pattern HEX_COLOR = Pattern.compile('^#[0-9a-fA-F]{6}$');

    /** Fetch a brand logo for a pasted site URL via Google's S2 favicon
     *  service. Never returns a 500 and never throws out of this method: any
     *  blank host, non-200 response, oversize body, or exception degrades to
     *  { logoBase64: null, logoContentType: '' } so a logo miss never blocks
     *  the theming flow. Intentionally NOT guarded by Test.isRunningTest() —
     *  the test class registers an HttpCalloutMock that needs Http.send to
     *  actually fire so it can intercept the callout. */
    private static Map<String, Object> fetchBrandLogo(String rawUrl) {
        Map<String, Object> nullLogo = new Map<String, Object>{
            'logoBase64' => null,
            'logoContentType' => ''
        };
        String host = normalizeHost(rawUrl);
        if (String.isBlank(host)) {
            return nullLogo;
        }
        try {
            HttpRequest hReq = new HttpRequest();
            // Google's legacy /s2/favicons endpoint now 301-redirects to the
            // gstatic faviconV2 service, and Apex Http.send does not follow
            // redirects — so call faviconV2 directly (returns image bytes, 200).
            hReq.setEndpoint('https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=128&url=' + EncodingUtil.urlEncode('https://' + host, 'UTF-8'));
            hReq.setMethod('GET');
            hReq.setTimeout(10000);
            HttpResponse hRes = new Http().send(hReq);
            if (hRes.getStatusCode() != 200) {
                return nullLogo;
            }
            Blob img = hRes.getBodyAsBlob();
            if (img == null) {
                return nullLogo;
            }
            String b64 = EncodingUtil.base64Encode(img);
            if (String.isBlank(b64) || b64.length() > MAX_LOGO_LEN) {
                return nullLogo;
            }
            String contentType = hRes.getHeader('Content-Type');
            return new Map<String, Object>{
                'logoBase64' => b64,
                'logoContentType' => String.isBlank(contentType) ? 'image/png' : contentType
            };
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'fetchBrandLogo failed: ' + e.getMessage());
            return nullLogo;
        }
    }

    /** Normalize an arbitrary pasted URL/domain to a bare host: lowercase,
     *  strip scheme, strip path, strip port. Never throws. */
    private static String normalizeHost(String rawUrl) {
        if (String.isBlank(rawUrl)) return null;
        String h = rawUrl.trim().toLowerCase();
        Integer scheme = h.indexOf('://');
        if (scheme >= 0) {
            h = h.substring(scheme + 3);
        }
        Integer slash = h.indexOf('/');
        if (slash >= 0) {
            h = h.substring(0, slash);
        }
        Integer colon = h.indexOf(':');
        if (colon >= 0) {
            h = h.substring(0, colon);
        }
        return String.isBlank(h) ? null : h;
    }

    /** POST /config/themes { op:'upsert'|'delete', theme?, id? }. */
    private static void saveTheme(RestResponse res, Map<String, Object> parsed) {
        String op = parsed.get('op') == null ? '' : String.valueOf(parsed.get('op')).trim().toLowerCase();
        List<Object> themes = loadThemeList();

        if (op == 'delete') {
            String id = parsed.get('id') == null ? '' : String.valueOf(parsed.get('id'));
            List<Object> kept = new List<Object>();
            for (Object t : themes) {
                if (t instanceof Map<String, Object>
                    && String.valueOf(((Map<String, Object>) t).get('id')) == id) {
                    continue;
                }
                kept.add(t);
            }
            persistThemes(kept);
            writeRaw(res, 200, new Map<String, Object>{
                'themes' => loadThemeList(),
                'activeThemeId' => activeThemeIdForUser()
            });
            return;
        }

        if (op == 'upsert') {
            Object themeRaw = parsed.get('theme');
            if (!(themeRaw instanceof Map<String, Object>)) {
                writeError(res, 400, 'theme object is required.');
                return;
            }
            Map<String, Object> clean = sanitizeTheme((Map<String, Object>) themeRaw);
            String id = String.valueOf(clean.get('id'));
            List<Object> next = new List<Object>();
            Boolean replaced = false;
            for (Object t : themes) {
                if (t instanceof Map<String, Object>
                    && String.valueOf(((Map<String, Object>) t).get('id')) == id) {
                    next.add(clean);
                    replaced = true;
                } else {
                    next.add(t);
                }
            }
            // New theme (not a replace) at cap: skip the append rather than reject
            // the whole request — simplest safe behavior for a shared library.
            if (!replaced && next.size() < MAX_THEMES) {
                next.add(clean);
            } else if (!replaced) {
                next = themes; // library full — leave unchanged.
            }
            persistThemes(next);
            writeRaw(res, 200, new Map<String, Object>{
                'themes' => loadThemeList(),
                'activeThemeId' => activeThemeIdForUser()
            });
            return;
        }

        writeError(res, 400, 'Unknown theme op: ' + op);
    }

    /** POST /config/active-theme { themeId }. Writes the running user's
     *  choice into the shared per-user map keyed by UserInfo.getUserId(). */
    private static void saveActiveTheme(RestResponse res, Map<String, Object> parsed) {
        String themeId = parsed.get('themeId') == null ? '' : String.valueOf(parsed.get('themeId')).trim();
        Map<String, Object> activeMap = loadActiveMap();
        if (String.isBlank(themeId)) {
            activeMap.remove(UserInfo.getUserId());
        } else {
            activeMap.put(UserInfo.getUserId(), themeId);
        }
        persistActiveMap(activeMap);
        writeRaw(res, 200, new Map<String, Object>{ 'activeThemeId' => activeThemeIdForUser() });
    }

    /** Coerce an inbound theme into the validated shape (D1): keeps ONLY the
     *  8 whitelisted fields — id, name, sourceUrl, logoBase64, logoContentType,
     *  accent, accentSoft, brandName. gradient/glow/aurora/ai* (or any other
     *  key) are dropped by omission; they are derived client-side from accent
     *  and never stored. */
    private static Map<String, Object> sanitizeTheme(Map<String, Object> t) {
        String id = t.get('id') == null ? '' : String.valueOf(t.get('id')).trim();
        if (String.isBlank(id)) {
            id = 'theme-' + String.valueOf(System.now().getTime());
        }
        String name = t.get('name') == null ? '' : String.valueOf(t.get('name')).trim();
        if (name.length() > 255) name = name.substring(0, 255);
        // brandName is the wordmark shown in the app chrome; falls back to name.
        String brandName = t.get('brandName') == null ? '' : String.valueOf(t.get('brandName')).trim();
        if (String.isBlank(brandName)) brandName = name;
        if (brandName.length() > 255) brandName = brandName.substring(0, 255);
        String sourceUrl = t.get('sourceUrl') == null ? '' : String.valueOf(t.get('sourceUrl')).trim();
        if (sourceUrl.length() > 255) sourceUrl = sourceUrl.substring(0, 255);
        String logoContentType = t.get('logoContentType') == null ? '' : String.valueOf(t.get('logoContentType')).trim();

        String logo = t.get('logoBase64') == null ? null : String.valueOf(t.get('logoBase64'));
        if (logo != null && logo.length() > MAX_LOGO_LEN) {
            logo = null; // oversize → drop rather than store a truncated (broken) image.
        }

        return new Map<String, Object>{
            'id' => id,
            'name' => name,
            'brandName' => brandName,
            'sourceUrl' => sourceUrl,
            'logoBase64' => logo,
            'logoContentType' => logoContentType,
            'accent' => hexOrDefault(t.get('accent'), DEFAULT_ACCENT),
            'accentSoft' => hexOrDefault(t.get('accentSoft'), DEFAULT_ACCENT_SOFT)
        };
    }

    /** Accept a #rrggbb hex string; anything else coerces to the given default. */
    private static String hexOrDefault(Object v, String dflt) {
        if (v == null) return dflt;
        String s = String.valueOf(v).trim();
        return hexValid(s) ? s : dflt;
    }

    private static Boolean hexValid(String s) {
        return s != null && Pattern.matches('^#[0-9a-fA-F]{6}$', s);
    }

    /** Parse the theme library array off the singleton. Empty list if unset
     *  or unparseable. Never throws. */
    private static List<Object> loadThemeList() {
        CommandCenterConfig__c rec = loadSingleton();
        if (rec == null || String.isBlank(rec.Theme_Library__c)) {
            return new List<Object>();
        }
        try {
            Object root = JSON.deserializeUntyped(rec.Theme_Library__c);
            return (root instanceof List<Object>) ? (List<Object>) root : new List<Object>();
        } catch (Exception e) {
            return new List<Object>();
        }
    }

    /** Persist the theme library list onto the singleton. */
    private static void persistThemes(List<Object> themes) {
        CommandCenterConfig__c rec = loadOrNewSingleton();
        rec.Theme_Library__c = JSON.serialize(themes);
        upsert rec;
    }

    /** Parse the per-user active-theme map off the singleton. Empty map if
     *  unset or unparseable. Never throws. */
    private static Map<String, Object> loadActiveMap() {
        CommandCenterConfig__c rec = loadSingleton();
        if (rec == null || String.isBlank(rec.Active_Themes__c)) {
            return new Map<String, Object>();
        }
        try {
            Object root = JSON.deserializeUntyped(rec.Active_Themes__c);
            return (root instanceof Map<String, Object>) ? (Map<String, Object>) root : new Map<String, Object>();
        } catch (Exception e) {
            return new Map<String, Object>();
        }
    }

    /** Persist the per-user active-theme map onto the singleton. */
    private static void persistActiveMap(Map<String, Object> m) {
        CommandCenterConfig__c rec = loadOrNewSingleton();
        rec.Active_Themes__c = JSON.serialize(m);
        upsert rec;
    }

    /** The running user's active theme id, resolved against the current
     *  library — null if unset OR the referenced theme no longer exists
     *  (fallback-when-deleted). */
    private static String activeThemeIdForUser() {
        String id = (String) loadActiveMap().get(UserInfo.getUserId());
        if (id == null) return null;
        // Fixed default themes (Dark/Light) are client-side sentinels that never
        // live in the saved library — they are always valid selections.
        if (id == '__default_dark__' || id == '__default_light__') {
            return id;
        }
        for (Object t : loadThemeList()) {
            if (t instanceof Map<String, Object> && id.equals(String.valueOf(((Map<String, Object>) t).get('id')))) {
                return id;
            }
        }
        return null;
    }

    /**
     * Self-updating model catalog (stale-while-revalidate).
     *
     * The org exposes NO API that *lists* foundation models, so the only way to
     * know a model is live is to call it — which is slow (~16s for ~20 models)
     * and billable, far too costly for a page-load GET. So discovery is done
     * asynchronously by ModelCatalogProbe, which caches survivors onto the
     * singleton's Model_Catalog_Cache__c field. This method just SERVES that
     * cache and decides whether a background refresh is due:
     *
     *   - Fresh cache (< CACHE_TTL_MS old): serve it, no probe.
     *   - Stale/missing cache: serve last-known (or FALLBACK_MODELS) AND enqueue
     *     a probe so the next load is current. Debounced by probeStartedAt so
     *     concurrent loads don't stack jobs.
     *   - forceRefresh (manual "Refresh models" button): always enqueue
     *     (respecting the debounce), serve whatever we have now.
     *
     * Never throws — a discovery failure degrades to the fallback catalog.
     * During tests no job is enqueued and the fallback is returned.
     */
    private static Map<String, Object> modelCatalog(Boolean forceRefresh) {
        Map<String, Object> cached = readCache();
        List<Object> models = cached == null ? null : (List<Object>) cached.get('models');
        Long discoveredAt   = cached == null ? 0 : asLong(cached.get('discoveredAt'));
        Long probeStartedAt = cached == null ? 0 : asLong(cached.get('probeStartedAt'));

        Long nowMs = System.now().getTime();
        Boolean haveCache = models != null && !models.isEmpty();
        Boolean stale = !haveCache || (nowMs - discoveredAt) > CACHE_TTL_MS;
        // Debounce: only enqueue if no probe has started within the debounce window.
        Boolean probeInFlight = (nowMs - probeStartedAt) < PROBE_DEBOUNCE_MS;
        Boolean wantProbe = (forceRefresh || stale) && !probeInFlight;

        Boolean enqueued = false;
        if (wantProbe && !Test.isRunningTest()) {
            enqueued = enqueueProbe();
        }

        if (haveCache) {
            return new Map<String, Object>{
                'models'     => models,
                'source'     => cached.get('source') == null ? 'probed' : cached.get('source'),
                'refreshing' => enqueued || (probeInFlight && stale)
            };
        }
        // No cache yet: serve the curated fallback while the first probe runs.
        return new Map<String, Object>{
            'models'     => FALLBACK_MODELS,
            'source'     => 'fallback',
            'refreshing' => enqueued
        };
    }

    /** Parse the cache JSON off the singleton. Returns null if unset/unparseable. */
    private static Map<String, Object> readCache() {
        CommandCenterConfig__c rec = loadSingleton();
        if (rec == null || String.isBlank(rec.Model_Catalog_Cache__c)) {
            return null;
        }
        try {
            Object root = JSON.deserializeUntyped(rec.Model_Catalog_Cache__c);
            return (root instanceof Map<String, Object>) ? (Map<String, Object>) root : null;
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'readCache parse failed: ' + e.getMessage());
            return null;
        }
    }

    /** Stamp probeStartedAt on the cache (so the debounce holds) and enqueue the
     *  probe. Returns true if the job was enqueued. Never throws. */
    private static Boolean enqueueProbe() {
        try {
            stampProbeStarted();
            System.enqueueJob(new ModelCatalogProbe());
            return true;
        } catch (Exception e) {
            // e.g. async job limit hit this transaction — serve cache, try later.
            System.debug(LoggingLevel.WARN, 'ModelCatalogProbe enqueue failed: ' + e.getMessage());
            return false;
        }
    }

    /** Record that a probe just started, preserving any existing cached models.
     *  This is what makes the debounce durable across separate GET requests. */
    private static void stampProbeStarted() {
        CommandCenterConfig__c rec = loadOrNewSingleton();
        Map<String, Object> payload = readCache();
        if (payload == null) {
            payload = new Map<String, Object>{ 'models' => new List<Object>(), 'source' => 'fallback' };
        }
        payload.put('probeStartedAt', System.now().getTime());
        rec.Model_Catalog_Cache__c = JSON.serialize(payload);
        upsert rec;
    }

    private static Long asLong(Object v) {
        if (v == null) return 0;
        try {
            return Long.valueOf(String.valueOf(v));
        } catch (Exception e) {
            return 0;
        }
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
