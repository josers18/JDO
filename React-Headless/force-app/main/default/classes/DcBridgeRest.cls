/**
 * Data Cloud query bridge for React UI bundles.
 *
 * WHY REST: @AuraEnabled Apex has no invocation path from a Multi-Framework UI
 * bundle (React). The bundle can only reach Apex via /services/apexrest/* using
 * the SDK fetch() path. So this re-exposes the SAME mechanism the sibling
 * Dc_Query_to_Table_LWC uses today — ConnectApi.CdpQuery.queryAnsiSqlV2 — as a
 * REST resource. Read-only ANSI SQL only.
 *
 *   POST /services/apexrest/dc/query
 *     body: { "sql": "SELECT ...", "maxRows": 500 }
 *     200:  { "columns":[{"name","type"}], "rows":[{..}], "rowCount":N, "warning":null }
 *     400:  { "error": "message" }
 */
@RestResource(urlMapping='/dc/query')
global with sharing class DcBridgeRest {
    private static final Integer DEFAULT_MAX_ROWS = 500;
    private static final Integer ABSOLUTE_MAX_ROWS = 2000;

    @TestVisible
    static List<Map<String, Object>> mockRowsForTest;

    global class QueryRequest {
        public String sql;
        public Integer maxRows;
    }

    @HttpPost
    global static void query() {
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
            QueryRequest reqBody = String.isBlank(body)
                ? new QueryRequest()
                : (QueryRequest) JSON.deserialize(body, QueryRequest.class);

            String sql = reqBody.sql == null ? '' : reqBody.sql.trim();
            if (String.isBlank(sql)) {
                writeError(res, 400, 'Enter a Data Cloud SQL statement.');
                return;
            }
            if (sql.endsWith(';')) {
                sql = sql.substring(0, sql.length() - 1).trim();
            }
            String readOnlyError = readOnlyViolation(sql);
            if (readOnlyError != null) {
                writeError(res, 400, readOnlyError);
                return;
            }

            Integer cap = (reqBody.maxRows == null || reqBody.maxRows < 1) ? DEFAULT_MAX_ROWS : reqBody.maxRows;
            if (cap > ABSOLUTE_MAX_ROWS) {
                cap = ABSOLUTE_MAX_ROWS;
            }
            String toRun = hasLimitClause(sql) ? sql : sql + ' LIMIT ' + cap;

            List<Map<String, Object>> rows;
            if (Test.isRunningTest()) {
                rows = mockRowsForTest != null ? mockRowsForTest : new List<Map<String, Object>>();
            } else {
                rows = runCdpSql(toRun);
            }

            Map<String, Object> payload = new Map<String, Object>{
                'columns' => deriveColumns(rows),
                'rows' => rows,
                'rowCount' => rows.size(),
                'warning' => null
            };
            res.statusCode = 200;
            res.responseBody = Blob.valueOf(JSON.serialize(payload));
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'DcBridgeRest error: ' + e.getTypeName() + ': ' + e.getMessage() + '\n' + e.getStackTraceString());
            writeError(res, 400, 'Data Cloud query failed.');
        }
    }

    /**
     * Runs the SQL through the same Connect API the LWCs use, then flattens the
     * response the same JSON-based way (ConnectApi types serialize with
     * inconsistent key casing, so we deserialize untyped and read case-insensitively).
     */
    private static List<Map<String, Object>> runCdpSql(String sql) {
        ConnectApi.CdpQueryInput input = new ConnectApi.CdpQueryInput();
        input.sql = sql;
        ConnectApi.CdpQueryOutputV2 response = ConnectApi.CdpQuery.queryAnsiSqlV2(input);

        List<Map<String, Object>> out = new List<Map<String, Object>>();
        if (response == null) {
            return out;
        }

        Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(JSON.serialize(response));

        // Ordered column names from metadata (fall back to data keys if absent).
        List<String> colNames = orderedColumnNames(root);

        Object dataObj = mapGetCi(root, new List<String>{ 'data', 'Data' });
        if (!(dataObj instanceof List<Object>)) {
            return out;
        }
        for (Object rowObj : (List<Object>) dataObj) {
            Map<String, Object> row = new Map<String, Object>();
            if (rowObj instanceof List<Object>) {
                // positional array form: pair with ordered column names
                List<Object> cells = (List<Object>) rowObj;
                for (Integer i = 0; i < cells.size(); i++) {
                    String key = i < colNames.size() ? colNames[i] : 'col' + i;
                    row.put(key, cells[i]);
                }
            } else if (rowObj instanceof Map<String, Object>) {
                // object form: already keyed
                row = (Map<String, Object>) rowObj;
            }
            out.add(row);
        }
        return out;
    }

    /** Column names in placeInOrder order from the response metadata. */
    private static List<String> orderedColumnNames(Map<String, Object> root) {
        List<String> names = new List<String>();
        Object metaObj = mapGetCi(root, new List<String>{ 'metadata', 'Metadata' });
        if (!(metaObj instanceof Map<String, Object>)) {
            return names;
        }
        Map<String, Object> metaRoot = (Map<String, Object>) metaObj;
        // bucket by placeInOrder to preserve column order
        Map<Integer, String> byOrder = new Map<Integer, String>();
        Integer fallback = 0;
        for (String fieldName : metaRoot.keySet()) {
            Object mo = metaRoot.get(fieldName);
            Integer place = fallback;
            if (mo instanceof Map<String, Object>) {
                Object p = mapGetCi((Map<String, Object>) mo, new List<String>{ 'placeInOrder', 'PlaceInOrder' });
                if (p != null) {
                    place = Integer.valueOf(String.valueOf(p));
                }
            }
            byOrder.put(place, fieldName);
            fallback++;
        }
        List<Integer> keys = new List<Integer>(byOrder.keySet());
        keys.sort();
        for (Integer k : keys) {
            names.add(byOrder.get(k));
        }
        return names;
    }

    private static List<Map<String, Object>> deriveColumns(List<Map<String, Object>> rows) {
        List<Map<String, Object>> cols = new List<Map<String, Object>>();
        if (rows.isEmpty()) {
            return cols;
        }
        for (String key : rows[0].keySet()) {
            Object v = rows[0].get(key);
            String type = (v instanceof Decimal || v instanceof Integer || v instanceof Double || v instanceof Long)
                ? 'number'
                : 'text';
            cols.add(new Map<String, Object>{ 'name' => key, 'type' => type });
        }
        return cols;
    }

    /** JSON.serialize of ConnectApi types may emit camelCase or PascalCase keys. */
    private static Object mapGetCi(Map<String, Object> m, List<String> candidates) {
        if (m == null || m.isEmpty()) {
            return null;
        }
        for (String key : m.keySet()) {
            if (key == null) {
                continue;
            }
            for (String want : candidates) {
                if (key.equalsIgnoreCase(want)) {
                    return m.get(key);
                }
            }
        }
        return null;
    }

    /** Returns an error string if the SQL is not a read-only SELECT/WITH, else null. */
    private static String readOnlyViolation(String s) {
        String lower = s.toLowerCase().replaceAll('\\s+', ' ').trim();
        if (!Pattern.compile('^(select|with)\\s').matcher(lower).find()) {
            return 'Only SELECT queries (optionally starting with WITH) are allowed.';
        }
        for (String bad : new List<String>{
            ' insert ', ' update ', ' delete ', ' merge ', ' drop ', ' truncate ',
            ' alter ', ' create ', ' exec ', ' execute ', ' call '
        }) {
            if (lower.contains(bad)) {
                return 'Mutating or DDL keywords are not allowed.';
            }
        }
        return null;
    }

    private static Boolean hasLimitClause(String s) {
        return Pattern.compile('(?i)\\blimit\\s+\\d+').matcher(s).find();
    }

    private static void writeError(RestResponse res, Integer code, String msg) {
        res.statusCode = code;
        res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{ 'error' => msg }));
    }
}
