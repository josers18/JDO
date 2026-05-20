/**
 * Runs Data Cloud ANSI SQL via ConnectApi.CdpQuery.queryAnsiSqlV2 and returns rows formatted for lightning-datatable.
 * Requires Data Cloud in the same org (or equivalent platform support for CdpQuery in Apex).
 * See README for cross-org Named Credential options.
 */
public with sharing class DcQueryToTableController {
    private static final Integer DEFAULT_MAX_ROWS = 500;
    private static final Integer ABSOLUTE_MAX_ROWS = 2000;

    public class ColumnDef {
        @AuraEnabled
        public String fieldName;
        @AuraEnabled
        public String label;
        @AuraEnabled
        public String type;
        @AuraEnabled
        public Integer initialWidth;
        @AuraEnabled
        public Boolean wrapText;
        @AuraEnabled
        public Map<String, Object> typeAttributes;
    }

    public class TableQueryResult {
        @AuraEnabled
        public List<ColumnDef> columns;
        @AuraEnabled
        public List<Map<String, Object>> rows;
        @AuraEnabled
        public Integer rowCount;
        @AuraEnabled
        public String nextBatchId;
        @AuraEnabled
        public String warning;
    }

    @TestVisible
    static TableQueryResult testMockResult;

    /**
     * @param sql Raw Data Cloud SQL (SELECT or WITH ... SELECT).
     * @param maxRows Caps rows when no LIMIT is present in the statement (clamped 1–2000).
     * @param defaultColumnWrap When true, sets wrapText on every column (table-level wrap is separate on the LWC).
     * @param defaultInitialWidth Optional default column width in px for the datatable.
     */
    @AuraEnabled
    public static TableQueryResult runDataCloudSql(
        String sql,
        Integer maxRows,
        Boolean defaultColumnWrap,
        Integer defaultInitialWidth
    ) {
        if (Test.isRunningTest() && testMockResult != null) {
            return testMockResult;
        }

        if (String.isBlank(sql)) {
            throw buildAuraException('Enter a Data Cloud SQL statement.');
        }

        String trimmed = sql.trim();
        if (trimmed.endsWith(';')) {
            trimmed = trimmed.substring(0, trimmed.length() - 1).trim();
        }

        validateReadOnlySql(trimmed);

        Integer cap = maxRows == null || maxRows < 1 ? DEFAULT_MAX_ROWS : maxRows;
        if (cap > ABSOLUTE_MAX_ROWS) {
            cap = ABSOLUTE_MAX_ROWS;
        }

        String toRun = trimmed;
        if (!hasLimitClause(trimmed)) {
            toRun = trimmed + ' LIMIT ' + cap;
        }

        ConnectApi.CdpQueryInput input = new ConnectApi.CdpQueryInput();
        input.sql = toRun;

        try {
            ConnectApi.CdpQueryOutputV2 response = ConnectApi.CdpQuery.queryAnsiSqlV2(input);
            return buildResult(response, defaultColumnWrap == true, defaultInitialWidth);
        } catch (ConnectApi.ConnectApiException e) {
            // ConnectApi messages from CdpQuery are Salesforce-curated (e.g. "Query
            // failed: invalid column", "Permission denied") — safe to surface verbatim.
            System.debug(LoggingLevel.ERROR, 'runDataCloudSql ConnectApiException: ' + e);
            throw buildAuraException(e.getMessage());
        } catch (Exception e) {
            // Anything else gets a sanitized message; full detail goes to debug logs only.
            System.debug(LoggingLevel.ERROR, 'runDataCloudSql unexpected: ' + e.getTypeName() + ': ' + e.getMessage() + '\n' + e.getStackTraceString());
            throw buildAuraException('Data Cloud query failed.');
        }
    }

    /**
     * AuraHandledException surfaces a custom message to the LWC layer only when both
     * the constructor argument AND setMessage() are populated; without setMessage()
     * the JS toast falls back to a generic "Script-thrown exception" string.
     */
    private static AuraHandledException buildAuraException(String msg) {
        String safe = String.isBlank(msg) ? 'Data Cloud query failed.' : msg;
        AuraHandledException ahe = new AuraHandledException(safe);
        ahe.setMessage(safe);
        return ahe;
    }

    private static void validateReadOnlySql(String s) {
        String lower = s.toLowerCase().replaceAll('\\s+', ' ').trim();
        if (!Pattern.compile('^(select|with)\\s').matcher(lower).find()) {
            throw buildAuraException('Only SELECT queries (optionally starting with WITH) are allowed.');
        }
        if (
            lower.contains(' insert ') ||
            lower.contains(' update ') ||
            lower.contains(' delete ') ||
            lower.contains(' merge ') ||
            lower.contains(' drop ') ||
            lower.contains(' truncate ') ||
            lower.contains(' alter ') ||
            lower.contains(' create ') ||
            lower.contains(' exec ') ||
            lower.contains(' execute ') ||
            lower.contains(' call ')
        ) {
            throw buildAuraException('Mutating or DDL keywords are not allowed in the SQL editor.');
        }
    }

    /** True if SQL already contains a LIMIT n anywhere (avoids appending a second LIMIT after OFFSET, etc.). */
    private static Boolean hasLimitClause(String s) {
        return Pattern.compile('(?i)\\blimit\\s+\\d+').matcher(s).find();
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

    private static TableQueryResult buildResult(
        ConnectApi.CdpQueryOutputV2 response,
        Boolean defaultColumnWrap,
        Integer defaultInitialWidth
    ) {
        TableQueryResult out = new TableQueryResult();
        out.columns = new List<ColumnDef>();
        out.rows = new List<Map<String, Object>>();
        out.rowCount = response != null && response.rowCount != null
            ? Integer.valueOf(String.valueOf(response.rowCount))
            : 0;
        out.nextBatchId = response != null ? response.nextBatchId : null;

        if (response == null) {
            out.warning = 'Empty response from Data Cloud.';
            return out;
        }

        String payloadJson = JSON.serialize(response);
        Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(payloadJson);

        Object metaObj = mapGetCi(root, new List<String>{ 'metadata', 'Metadata' });
        Map<String, Object> metaRoot = metaObj instanceof Map<String, Object> ? (Map<String, Object>) metaObj : null;

        List<Map<String, Object>> orderedMeta = new List<Map<String, Object>>();
        if (metaRoot != null) {
            for (String fieldName : metaRoot.keySet()) {
                Object mo = metaRoot.get(fieldName);
                if (!(mo instanceof Map<String, Object>)) {
                    continue;
                }
                Map<String, Object> col = (Map<String, Object>) mo;
                Map<String, Object> row = new Map<String, Object>();
                row.put('name', fieldName);
                row.put(
                    'placeInOrder',
                    mapGetCi(col, new List<String>{ 'placeInOrder', 'PlaceInOrder', 'place_in_order' })
                );
                Object typeVal = mapGetCi(col, new List<String>{ 'type', 'Type', 'dataType', 'DataType' });
                String sqlT = null;
                if (typeVal instanceof String) {
                    sqlT = (String) typeVal;
                } else if (typeVal != null) {
                    sqlT = String.valueOf(typeVal);
                }
                row.put('sqlType', sqlT);
                orderedMeta.add(row);
            }
        }

        orderedMeta = sortMetadataRows(orderedMeta);

        Integer colIndex = 0;
        Map<Integer, String> indexToField = new Map<Integer, String>();
        for (Map<String, Object> om : orderedMeta) {
            String rawName = (String) om.get('name');
            String fieldName = toSafeFieldName(rawName, colIndex);
            indexToField.put(colIndex, fieldName);
            ColumnDef cd = new ColumnDef();
            cd.fieldName = fieldName;
            cd.label = rawName;
            cd.type = mapSqlTypeToDatatableType((String) om.get('sqlType'));
            cd.wrapText = defaultColumnWrap;
            if (defaultInitialWidth != null && defaultInitialWidth > 0) {
                cd.initialWidth = defaultInitialWidth;
            }
            if ('number'.equals(cd.type)) {
                cd.typeAttributes = new Map<String, Object>{ 'minimumFractionDigits' => 0 };
            }
            out.columns.add(cd);
            colIndex++;
        }

        Object rawData = mapGetCi(root, new List<String>{ 'data', 'Data', 'rows', 'Rows' });
        List<Object> dataList = rawData instanceof List<Object> ? (List<Object>) rawData : null;

        if (dataList == null) {
            appendWarning(
                out,
                'Could not read result rows from the Data Cloud response (unexpected JSON shape).'
            );
        } else if (orderedMeta.isEmpty() && !dataList.isEmpty()) {
            List<Object> firstCells = extractRowDataList(dataList[0]);
            if (firstCells != null) {
                for (Integer i = 0; i < firstCells.size(); i++) {
                    String fn = 'col_' + i;
                    indexToField.put(i, fn);
                    ColumnDef cd = new ColumnDef();
                    cd.fieldName = fn;
                    cd.label = 'Column ' + String.valueOf(i + 1);
                    cd.type = 'text';
                    cd.wrapText = defaultColumnWrap;
                    if (defaultInitialWidth != null && defaultInitialWidth > 0) {
                        cd.initialWidth = defaultInitialWidth;
                    }
                    out.columns.add(cd);
                }
            }
            appendWarning(
                out,
                'Query returned rows but no column metadata; using generic column labels.'
            );
        }

        if (dataList != null) {
            Integer r = 0;
            for (Object rowObj : dataList) {
                List<Object> rowData = extractRowDataList(rowObj);
                Map<String, Object> lwcRow = new Map<String, Object>();
                lwcRow.put('_rowUid', 'r' + String.valueOf(r));

                if (rowData != null) {
                    for (Integer i = 0; i < rowData.size(); i++) {
                        String fn = indexToField.get(i);
                        if (fn == null) {
                            fn = 'col_' + i;
                        }
                        lwcRow.put(fn, rowData[i]);
                    }
                }
                out.rows.add(lwcRow);
                r++;
            }
        }

        if (out.rows.isEmpty() && out.rowCount != null && out.rowCount > 0) {
            appendWarning(
                out,
                'API reported rowCount=' +
                    out.rowCount +
                    ' but no rows were parsed. Check Data Cloud permissions, dataspace, or query result shape.'
            );
        }

        if (!String.isBlank(out.nextBatchId)) {
            appendWarning(
                out,
                'More rows are available via nextBatchId; this component returns the first batch only.'
            );
        }

        return out;
    }

    private static void appendWarning(TableQueryResult out, String msg) {
        if (String.isBlank(msg)) {
            return;
        }
        if (String.isBlank(out.warning)) {
            out.warning = msg;
        } else {
            out.warning = out.warning + ' ' + msg;
        }
    }

    private static List<Object> extractRowDataList(Object rowObj) {
        if (rowObj == null) {
            return null;
        }
        if (rowObj instanceof List<Object>) {
            return (List<Object>) rowObj;
        }
        if (!(rowObj instanceof Map<String, Object>)) {
            return null;
        }
        Map<String, Object> rowMap = (Map<String, Object>) rowObj;
        Object cells = mapGetCi(
            rowMap,
            new List<String>{ 'rowData', 'RowData', 'row_data', 'values', 'Values', 'cells', 'Cells' }
        );
        if (cells instanceof List<Object>) {
            return (List<Object>) cells;
        }
        return null;
    }

    /**
     * Sort metadata rows by placeInOrder ascending. Uses Map<Integer, List> bucketing
     * so the cost stays O(n log n) on key sort + O(n) row copy — well-behaved against
     * a wide SELECT * (some Data Cloud DMOs expose 100+ fields).
     */
    private static List<Map<String, Object>> sortMetadataRows(List<Map<String, Object>> rows) {
        Map<Integer, List<Map<String, Object>>> buckets = new Map<Integer, List<Map<String, Object>>>();
        Integer fallback = 0;
        for (Map<String, Object> row : rows) {
            Integer place = metadataPlace(row);
            if (!buckets.containsKey(place)) {
                buckets.put(place, new List<Map<String, Object>>());
            }
            buckets.get(place).add(row);
            if (place > fallback) {
                fallback = place;
            }
        }
        List<Integer> keys = new List<Integer>(buckets.keySet());
        keys.sort();
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (Integer key : keys) {
            out.addAll(buckets.get(key));
        }
        return out;
    }

    private static Integer metadataPlace(Map<String, Object> m) {
        Object p = m.get('placeInOrder');
        if (p instanceof Integer) {
            return (Integer) p;
        }
        if (p instanceof Decimal) {
            return ((Decimal) p).intValue();
        }
        if (p instanceof Long) {
            return ((Long) p).intValue();
        }
        return 0;
    }

    private static String toSafeFieldName(String raw, Integer idx) {
        if (String.isBlank(raw)) {
            return 'col_' + idx;
        }
        String s = raw.trim();
        if (!Pattern.compile('^[a-zA-Z_][a-zA-Z0-9_]*$').matcher(s).matches()) {
            return 'col_' + idx;
        }
        return s;
    }

    /**
     * SQL → datatable type. Order matters: timestamp must be checked before date, and
     * date must exclude timestamp, because types like TIMESTAMP_NTZ contain both
     * substrings. Don't reorder without re-reading these guards.
     */
    private static String mapSqlTypeToDatatableType(String sqlType) {
        if (String.isBlank(sqlType)) {
            return 'text';
        }
        String t = sqlType.toLowerCase();
        if (t.contains('bool')) {
            return 'boolean';
        }
        if (t.contains('int') || t.contains('decimal') || t.contains('numeric') || t.contains('double') || t.contains('float') || t.contains('real') || t.contains('number')) {
            return 'number';
        }
        if (t.contains('timestamp') || t.contains('datetime')) {
            return 'datetime';
        }
        if (t.contains('date') && !t.contains('timestamp')) {
            return 'date';
        }
        if (t.contains('time') && !t.contains('timestamp') && !t.contains('datetime')) {
            return 'text';
        }
        return 'text';
    }
}
