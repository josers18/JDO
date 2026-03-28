@IsTest
private class DcQueryToTableControllerTest {
    @IsTest
    static void runSql_blankSql_throws() {
        Boolean threw = false;
        try {
            DcQueryToTableController.runDataCloudSql('  ', 10, false, null);
        } catch (AuraHandledException e) {
            threw = true;
            System.assert(e.getMessage().contains('Enter'));
        }
        System.assert(threw, 'Expected validation error');
    }

    @IsTest
    static void runSql_disallowsDelete() {
        Boolean threw = false;
        try {
            DcQueryToTableController.runDataCloudSql('SELECT Id FROM t; DELETE FROM t', 10, false, null);
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'Expected DDL/DML keyword rejection');
    }

    @IsTest
    static void runSql_requiresSelectOrWith() {
        Boolean threw = false;
        try {
            DcQueryToTableController.runDataCloudSql('SHOW TABLES', 10, false, null);
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'Expected SELECT/WITH guard');
    }

    @IsTest
    static void runSql_mocked_returnsRows() {
        DcQueryToTableController.ColumnDef c1 = new DcQueryToTableController.ColumnDef();
        c1.fieldName = 'a';
        c1.label = 'a';
        c1.type = 'text';

        Map<String, Object> row = new Map<String, Object>();
        row.put('_rowUid', 'r0');
        row.put('a', 'x');

        DcQueryToTableController.TableQueryResult mock = new DcQueryToTableController.TableQueryResult();
        mock.columns = new List<DcQueryToTableController.ColumnDef>{ c1 };
        mock.rows = new List<Map<String, Object>>{ row };
        mock.rowCount = 1;

        DcQueryToTableController.testMockResult = mock;
        try {
            DcQueryToTableController.TableQueryResult res = DcQueryToTableController.runDataCloudSql(
                'SELECT 1',
                10,
                true,
                120
            );
            System.assertEquals(1, res.rows.size());
            System.assertEquals(1, res.columns.size());
            System.assertEquals('x', res.rows[0].get('a'));
        } finally {
            DcQueryToTableController.testMockResult = null;
        }
    }
}
