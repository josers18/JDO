public with sharing class DataCloudWebEngagementController {

    // CONFIGURATION
    // 1. The Data Graph Name (API Name)
    private static final String DATA_GRAPH_NAME = 'RT_Web_Engagementsv2';

    // 2. The Link Object Name
    // We use the Link Object because it bridges Source IDs (Account) to Unified IDs.
    private static final String LINK_OBJECT_NAME = 'UnifiedLinkssotAccountAcc__dlm';

    // 3. The Engagements DMO. Cold-store backfill JOINs this to LINK_OBJECT_NAME via
    //    deviceId__c = SourceRecordId__c — verified empirically: events from this DMO
    //    that originated from a Salesforce Account carry the SF Account Id in deviceId__c,
    //    which is the same value the link table stores in SourceRecordId__c.
    private static final String ENGAGEMENTS_DMO_NAME = 'CumulusWeb_Engagements__dlm';

    // Cold-store backfill bounds. PER_QUERY_LIMIT caps any single ConnectApi.CdpQuery
    // call; DEFAULT_LOOKBACK_DAYS / MAX_LOOKBACK_DAYS apply when the LWC's lookbackDays
    // arg is missing or out of range.
    private static final Integer COLD_PER_QUERY_LIMIT = 200;
    private static final Integer COLD_DEFAULT_LOOKBACK_DAYS = 90;
    private static final Integer COLD_MAX_LOOKBACK_DAYS = 365;

    // Test seam: when running under Test.isRunningTest(), if this is non-null,
    // getUnifiedId() returns this value without calling ConnectApi.CdpQuery.
    // ConnectApi.CdpQuery.querySql is not mockable via Test.setMock in API 65.0.
    @TestVisible
    private static String testMockUnifiedId;

    // Test seam for the cold-store path. When non-null, queryWebEngagementsFromDmo
    // returns this list verbatim instead of running the JOIN. Each row should be a
    // Map<String, Object> shaped like a CumulusWeb_Engagements__dlm tuple
    // (keys: eventId__c, dateTime__c, webInteractions_pageTitle__c, etc.).
    @TestVisible
    private static List<Map<String, Object>> testMockColdEvents;

    // Test seam for the hot path. When non-null, getWebEngagementsWithBackfill uses
    // this string verbatim instead of calling getWebEngagementData. Lets tests exercise
    // the merge logic without invoking the real Data Graph callout.
    @TestVisible
    private static String testMockHotResponse;

    /**
     * @description Returns web engagements as a single payload combining the Data Graph
     *              hot-cache (real-time, may be empty after expiration) and the cold-store
     *              DMO backfill (historical, up to lookbackDays). Wraps the merged events
     *              back into the same `data[0].json_blob__c` envelope shape that
     *              getWebEngagementData returns, so the LWC's parseDataGraphResponse
     *              consumes either method's output identically. Hot wins on eventId__c
     *              collision; cold-store rows fill gaps where the hot cache has no
     *              counterpart. Cold-side failures are logged and degraded — the response
     *              falls back to hot-only rather than failing the whole call.
     *
     * @param accountId      Salesforce Account Id.
     * @param dataGraphName  Data Graph API name; falls back to RT_Web_Engagementsv2 when blank.
     * @param lookbackDays   Cold-store window in days; clamped to [1..365], null/<1 → 90.
     * @return JSON envelope shaped as `{"data":[{"json_blob__c":"<encoded merged events>"}]}`.
     */
    @AuraEnabled
    public static String getWebEngagementsWithBackfill(
        String accountId,
        String dataGraphName,
        Integer lookbackDays
    ) {
        if (String.isBlank(accountId)) return '[]';
        if (String.isBlank(dataGraphName)) dataGraphName = DATA_GRAPH_NAME;

        Integer days = (lookbackDays == null || lookbackDays < 1)
            ? COLD_DEFAULT_LOOKBACK_DAYS
            : Math.min(lookbackDays, COLD_MAX_LOOKBACK_DAYS);

        // Hot path — must succeed, since LWC's identity & link metadata depend on the envelope.
        String hotResponse = (testMockHotResponse != null)
            ? testMockHotResponse
            : getWebEngagementData(accountId, dataGraphName);

        // Cold path — best-effort. Failure here degrades gracefully to hot-only.
        List<Map<String, Object>> coldRows = null;
        try {
            String unifiedId = getUnifiedId(accountId);
            if (String.isNotBlank(unifiedId)) {
                coldRows = queryWebEngagementsFromDmo(unifiedId, days);
            }
        } catch (Exception e) {
            // Cold-side failure is non-fatal — the user still gets the hot cache.
            // Full detail goes to debug logs only; the LWC sees a degraded but valid envelope.
            System.debug(
                LoggingLevel.WARN,
                'getWebEngagementsWithBackfill cold-store failure: '
                    + e.getTypeName() + ': ' + e.getMessage()
            );
        }

        // No cold rows to merge → return hot envelope as-is, zero allocations.
        if (coldRows == null || coldRows.isEmpty()) {
            return hotResponse;
        }

        return mergeHotAndColdEvents(hotResponse, coldRows);
    }

    @AuraEnabled
    public static String getWebEngagementData(String accountId, String dataGraphName) {
        // Using accountId because this will be deployed on Person Account record page.
        // dataGraphName falls back to the default constant when blank, so existing
        // single-arg callers (none in this repo, but possible future) still work.
        if (String.isBlank(dataGraphName)) dataGraphName = DATA_GRAPH_NAME;
        if (String.isBlank(accountId)) return '[]';

        try {
            // 1. Get the Unified ID (The Bridge)
            String unifiedId = getUnifiedId(accountId);
            
            if (String.isBlank(unifiedId)) {
                System.debug('No Unified ID found for Account: ' + accountId);
                return '[]';
            }

            // 2. TRUE Real-Time Lookup via Named Credential
            // We use "callout:Data_Cloud_API" to match your Named Credential's API Name.
            HttpRequest req = new HttpRequest();
            String endpoint = 'callout:Data_Cloud_API/services/data/v65.0/ssot/data-graphs/data/' + dataGraphName + '/' + unifiedId;
            
            req.setEndpoint(endpoint);
            req.setMethod('GET');
            // No Authorization header needed - The Named Credential handles the OAuth handshake.
            req.setHeader('Content-Type', 'application/json');

            Http http = new Http();
            HttpResponse res = http.send(req);

            if (res.getStatusCode() == 200) {
                return res.getBody();
            } else {
                System.debug('Data Graph Error: ' + res.getStatus() + ' ' + res.getBody());
                return '[]';
            }

        } catch (Exception e) {
            System.debug('Error fetching Data Graph: ' + e.getMessage());
            AuraHandledException ahe = new AuraHandledException(e.getMessage());
            ahe.setMessage(e.getMessage());
            throw ahe;
        }
    }

    /**
     * Resolves Salesforce Account ID -> Data Cloud Unified ID
     */

     private static String getUnifiedId(String accountId) {
        if (Test.isRunningTest() && testMockUnifiedId != null) {
            return testMockUnifiedId;
        }
        String query = 'SELECT UnifiedRecordId__c FROM ' + LINK_OBJECT_NAME +
                       ' WHERE SourceRecordId__c = \'' + String.escapeSingleQuotes(accountId) + '\' LIMIT 1';

        ConnectApi.QuerySqlInput input = new ConnectApi.QuerySqlInput();
        input.sql = query;

        ConnectApi.QuerySqlOutput output = ConnectApi.CdpQuery.querySql(input);

        // WORKAROUND: Serialize/Deserialize to inspect the raw JSON structure
        String safeJson = JSON.serialize(output);
        Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(safeJson);

        return extractUnifiedIdFromQueryOutput(result);
    }

    /**
     * Walks the parsed ConnectApi.CdpQuery.querySql response Map and returns
     * the unified ID, or null if the response shape doesn't contain one.
     *
     * Defensive against two response shapes seen in API 65.0:
     *   - Outer: 'dataRows' (newer) OR 'data' (older)
     *   - Inner row: 'rowData' OR 'row'
     *
     * @TestVisible so unit tests can verify branch behavior with crafted Maps,
     * since ConnectApi.CdpQuery.querySql itself is not mockable via Test.setMock.
     */
    @TestVisible
    private static String extractUnifiedIdFromQueryOutput(Map<String, Object> result) {
        if (result == null) return null;

        List<Object> rows = null;
        if (result.containsKey('dataRows')) {
            rows = (List<Object>) result.get('dataRows');
        } else if (result.containsKey('data')) {
            rows = (List<Object>) result.get('data');
        }

        if (rows == null || rows.isEmpty()) return null;

        Map<String, Object> firstRow = (Map<String, Object>) JSON.deserializeUntyped(JSON.serialize(rows[0]));

        List<Object> values = null;
        if (firstRow.containsKey('rowData')) {
            values = (List<Object>) firstRow.get('rowData');
        } else if (firstRow.containsKey('row')) {
            values = (List<Object>) firstRow.get('row');
        }

        if (values == null || values.isEmpty()) return null;
        return (String) values[0];
    }

    /**
     * Cold-store backfill via ConnectApi.CdpQuery.querySql. JOINs the engagements DMO
     * to the unified link table on deviceId__c = SourceRecordId__c, scoped by unifiedId.
     * Returns a list of Map<String,Object> rows where each map's keys are the engagements
     * DMO column names (eventId__c, dateTime__c, webInteractions_pageTitle__c, ...).
     *
     * Returns an empty list (never null) — easier for callers to merge against.
     *
     * @TestVisible because ConnectApi.CdpQuery.querySql is not mockable via Test.setMock,
     * so tests use testMockColdEvents to skip the actual query.
     */
    @TestVisible
    private static List<Map<String, Object>> queryWebEngagementsFromDmo(
        String unifiedId,
        Integer lookbackDays
    ) {
        if (testMockColdEvents != null) {
            return testMockColdEvents;
        }
        if (String.isBlank(unifiedId)) {
            return new List<Map<String, Object>>();
        }
        Integer days = (lookbackDays == null || lookbackDays < 1)
            ? COLD_DEFAULT_LOOKBACK_DAYS
            : Math.min(lookbackDays, COLD_MAX_LOOKBACK_DAYS);
        Datetime sinceDt = Datetime.now().addDays(-days);
        // ISO-8601 with timezone offset; Data Cloud SQL accepts this on TimestampTZ columns.
        String sinceIso = sinceDt.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'');

        // SELECT * keeps us aligned with hot-cache row shape (so mapWebEngagement on the
        // LWC side consumes either source identically). Aliasing requires backticks /
        // double-quotes around DMO/column names that contain underscores in some Data
        // Cloud configurations; staying explicit here.
        String safeUnified = String.escapeSingleQuotes(unifiedId);
        String sql = 'SELECT e.* '
                   + 'FROM "' + ENGAGEMENTS_DMO_NAME + '" e '
                   + 'INNER JOIN "' + LINK_OBJECT_NAME + '" l '
                   + 'ON e.deviceId__c = l.SourceRecordId__c '
                   + 'WHERE l.UnifiedRecordId__c = \'' + safeUnified + '\' '
                   + 'AND e.dateTime__c >= \'' + sinceIso + '\' '
                   + 'ORDER BY e.dateTime__c DESC '
                   + 'LIMIT ' + COLD_PER_QUERY_LIMIT;

        ConnectApi.QuerySqlInput input = new ConnectApi.QuerySqlInput();
        input.sql = sql;
        ConnectApi.QuerySqlOutput output = ConnectApi.CdpQuery.querySql(input);

        // Round-trip through JSON.serialize (same workaround as getUnifiedId) since
        // the typed ConnectApi shape isn't fully introspectable.
        Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(JSON.serialize(output));

        List<Object> rows = null;
        if (root.containsKey('dataRows')) {
            rows = (List<Object>) root.get('dataRows');
        } else if (root.containsKey('data')) {
            rows = (List<Object>) root.get('data');
        }
        if (rows == null || rows.isEmpty()) {
            return new List<Map<String, Object>>();
        }

        // Pull column names from the metadata array so we can rebuild Map<columnName, value>
        // tuples. Without this, rows come back as raw List<Object> values with no field
        // labels — useless to the LWC mapper.
        List<String> columnNames = extractColumnNamesFromMetadata(root);
        if (columnNames.isEmpty()) {
            // Defensive: if we can't recover column names, returning empty is safer than
            // returning index-keyed maps the LWC can't consume.
            System.debug(
                LoggingLevel.WARN,
                'queryWebEngagementsFromDmo: could not recover column names from metadata; '
                    + 'returning empty cold backfill so the LWC degrades to hot-only.'
            );
            return new List<Map<String, Object>>();
        }

        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (Object rowObj : rows) {
            Map<String, Object> rowMap = (Map<String, Object>) JSON.deserializeUntyped(JSON.serialize(rowObj));
            List<Object> values = null;
            if (rowMap.containsKey('rowData')) {
                values = (List<Object>) rowMap.get('rowData');
            } else if (rowMap.containsKey('row')) {
                values = (List<Object>) rowMap.get('row');
            }
            if (values == null) continue;
            Map<String, Object> tuple = new Map<String, Object>();
            for (Integer i = 0; i < columnNames.size() && i < values.size(); i++) {
                tuple.put(columnNames[i], values[i]);
            }
            out.add(tuple);
        }
        return out;
    }

    /**
     * Extracts column names from a ConnectApi.CdpQuery.querySql response's metadata
     * field. Defensive against the same casing/shape variability that
     * extractUnifiedIdFromQueryOutput handles.
     *
     * @TestVisible to enable direct unit coverage without going through the full query.
     */
    @TestVisible
    private static List<String> extractColumnNamesFromMetadata(Map<String, Object> root) {
        List<String> names = new List<String>();
        if (root == null) return names;
        Object meta = root.get('metadata');
        if (meta == null) meta = root.get('Metadata');
        if (!(meta instanceof List<Object>)) return names;
        for (Object col : (List<Object>) meta) {
            if (col instanceof Map<String, Object>) {
                Object nameObj = ((Map<String, Object>) col).get('name');
                if (nameObj == null) nameObj = ((Map<String, Object>) col).get('Name');
                if (nameObj instanceof String) {
                    names.add((String) nameObj);
                }
            }
        }
        return names;
    }

    /**
     * Merges the hot-cache envelope with cold-store rows and returns a new envelope of
     * the same shape (`{"data":[{"json_blob__c":"<encoded merged events>"}]}`) that the
     * LWC's parseDataGraphResponse consumes identically to a hot-only response.
     *
     * Dedupe rule: events with matching eventId__c are kept from the hot side; cold
     * rows fill gaps. Cold rows without an eventId__c are kept (rare; defensive).
     *
     * @TestVisible to support direct merge-logic tests without spinning up callouts.
     */
    @TestVisible
    private static String mergeHotAndColdEvents(String hotResponse, List<Map<String, Object>> coldRows) {
        // Parse the hot envelope to extract its inner json_blob__c payload (which itself
        // is HTML-encoded JSON containing the events). We rebuild the envelope at the end.
        Map<String, Object> hotEnvelope = null;
        Map<String, Object> innerBlob = null;
        try {
            if (String.isNotBlank(hotResponse) && hotResponse != '[]') {
                hotEnvelope = (Map<String, Object>) JSON.deserializeUntyped(hotResponse);
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'mergeHotAndColdEvents: hot envelope was not valid JSON, treating as empty.');
        }

        // Locate the inner blob and the existing CumulusWeb_Engagements__dlm array (if any).
        List<Object> hotEvents = new List<Object>();
        if (hotEnvelope != null) {
            innerBlob = extractInnerBlob(hotEnvelope);
            if (innerBlob != null) {
                Object existing = innerBlob.get(ENGAGEMENTS_DMO_NAME);
                if (existing instanceof List<Object>) {
                    hotEvents = (List<Object>) existing;
                }
            }
        }

        // Build the dedupe set from hot eventId__c values; cold rows that collide are skipped.
        Set<String> seenEventIds = new Set<String>();
        for (Object hotEvt : hotEvents) {
            if (hotEvt instanceof Map<String, Object>) {
                Object id = ((Map<String, Object>) hotEvt).get('eventId__c');
                if (id instanceof String) seenEventIds.add((String) id);
            }
        }

        // Append non-colliding cold rows. We keep cold rows with no eventId__c (defensive
        // — better to over-include than silently drop) since they can't collide anyway.
        List<Object> mergedEvents = new List<Object>(hotEvents);
        for (Map<String, Object> coldRow : coldRows) {
            Object id = coldRow.get('eventId__c');
            if (id instanceof String && seenEventIds.contains((String) id)) {
                continue; // hot wins
            }
            mergedEvents.add(coldRow);
        }

        // Rebuild the envelope. If the hot cache had no inner blob (unusual but possible
        // when hot returned '[]' or an unparseable response), synthesize a minimal one
        // containing just the cold events so the LWC has something to render.
        if (innerBlob == null) {
            innerBlob = new Map<String, Object>();
        }
        innerBlob.put(ENGAGEMENTS_DMO_NAME, mergedEvents);

        // The LWC expects json_blob__c to be HTML-entity-encoded JSON (mirroring how Data
        // Cloud's wrapped-blob shape arrives). decodeEntities in timelineMappers.js handles
        // 5 entities: &amp; &lt; &gt; &quot; &#39;. We only need to encode &, <, >, " — JSON
        // doesn't emit single quotes literally so &#39; is a no-op on round-trip.
        String innerJson = JSON.serialize(innerBlob);
        String encoded = innerJson
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;');

        // The outer envelope retains everything from the hot response except its data[0]
        // entry, which we replace with the merged inner blob. If hot had additional fields
        // alongside json_blob__c on data[0] (e.g., ssot__Id__c), we preserve them.
        Map<String, Object> dataRow0 = new Map<String, Object>();
        if (hotEnvelope != null) {
            Object dataObj = hotEnvelope.get('data');
            if (dataObj instanceof List<Object>) {
                List<Object> dataList = (List<Object>) dataObj;
                if (!dataList.isEmpty() && dataList[0] instanceof Map<String, Object>) {
                    dataRow0 = new Map<String, Object>((Map<String, Object>) dataList[0]);
                }
            }
        }
        dataRow0.put('json_blob__c', encoded);

        Map<String, Object> outerEnvelope = new Map<String, Object>();
        if (hotEnvelope != null) {
            outerEnvelope.putAll(hotEnvelope);
        }
        outerEnvelope.put('data', new List<Object>{ dataRow0 });
        return JSON.serialize(outerEnvelope);
    }

    /**
     * Walk the hot-envelope to find the inner blob (the decoded contents of
     * data[0].json_blob__c). The blob is stored as HTML-encoded JSON on the wire so we
     * decode the same five entities the LWC's decodeEntities does, in the same order
     * (&amp; LAST so double-encoded sequences resolve over two passes).
     *
     * @TestVisible for direct coverage of the decode/parse logic.
     */
    @TestVisible
    private static Map<String, Object> extractInnerBlob(Map<String, Object> envelope) {
        if (envelope == null) return null;
        Object dataObj = envelope.get('data');
        if (!(dataObj instanceof List<Object>)) return null;
        List<Object> dataList = (List<Object>) dataObj;
        if (dataList.isEmpty()) return null;
        if (!(dataList[0] instanceof Map<String, Object>)) return null;
        Map<String, Object> dataRow = (Map<String, Object>) dataList[0];
        Object blobObj = dataRow.get('json_blob__c');
        if (!(blobObj instanceof String)) return null;
        String encoded = (String) blobObj;
        if (String.isBlank(encoded)) return null;
        // Same decode order as timelineMappers.js decodeEntities (&amp; last).
        String decoded = encoded
            .replace('&quot;', '"')
            .replace('&#39;', '\'')
            .replace('&lt;', '<')
            .replace('&gt;', '>')
            .replace('&amp;', '&');
        try {
            Object parsed = JSON.deserializeUntyped(decoded);
            return (parsed instanceof Map<String, Object>)
                ? (Map<String, Object>) parsed
                : null;
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'extractInnerBlob: inner blob is not valid JSON.');
            return null;
        }
    }
}