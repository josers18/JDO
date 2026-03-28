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
            throw new AuraHandledException('Enter a Data Cloud SQL statement.');
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
        } catch (Exception e) {
            String msg = e.getMessage();
            throw new AuraHandledException(
                String.isBlank(msg) ? 'Data Cloud query failed.' : msg
            );
        }
    }

    private static void validateReadOnlySql(String s) {
        String lower = s.toLowerCase().replaceAll('\\s+', ' ').trim();
        if (!Pattern.compile('^(select|with)\\s').matcher(lower).find()) {
            throw new AuraHandledException('Only SELECT queries (optionally starting with WITH) are allowed.');
        }
        if (
            lower.contains(' insert ') ||
            lower.contains(' update ') ||
            lower.contains(' delete ') ||
            lower.contains(' merge ') ||
            lower.contains(' drop ') ||
            lower.contains(' truncate ') ||
            lower.contains(' alter ') ||
            lower.contains(' create ')
        ) {
            throw new AuraHandledException('Mutating or DDL keywords are not allowed in the SQL editor.');
        }
    }

    private static Boolean hasLimitClause(String s) {
        Pattern p = Pattern.compile('(?i)\\blimit\\s+\\d+\\s*$');
        return p.matcher(s.trim()).find();
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

        String json = JSON.serialize(response);
        Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(json);
        Map<String, Object> metaRoot = (Map<String, Object>) root.get('metadata');

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
                row.put('placeInOrder', col.get('placeInOrder'));
                row.put('sqlType', col.get('type'));
                orderedMeta.add(row);
            }
        }

        orderedMeta.sort(new MetadataPlaceCmp());

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

        List<Object> dataList = (List<Object>) root.get('data');
        if (dataList == null) {
            return out;
        }

        Integer r = 0;
        for (Object rowObj : dataList) {
            if (!(rowObj instanceof Map<String, Object>)) {
                continue;
            }
            Map<String, Object> rowMap = (Map<String, Object>) rowObj;
            List<Object> rowData = (List<Object>) rowMap.get('rowData');
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

        if (!String.isBlank(out.nextBatchId)) {
            out.warning = 'More rows are available via nextBatchId; this component returns the first batch only.';
        }

        return out;
    }

    private class MetadataPlaceCmp implements Comparator {
        public Integer compare(Object o1, Object o2) {
            Map<String, Object> a = (Map<String, Object>) o1;
            Map<String, Object> b = (Map<String, Object>) o2;
            Integer pa = place(a);
            Integer pb = place(b);
            if (pa == pb) {
                return 0;
            }
            return pa < pb ? -1 : 1;
        }

        private Integer place(Map<String, Object> m) {
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
