@IsTest
private class FinancialOverviewControllerTest {

    @IsTest
    static void returnsMetricsForAccount() {
        Account a = new Account(Name = 'Test Customer');
        insert a;

        Test.startTest();
        FinancialOverviewController.FinancialMetrics m =
            FinancialOverviewController.getFinancialMetrics(a.Id);
        Test.stopTest();

        System.assertNotEquals(null, m, 'DTO should be returned');
        System.assertNotEquals(null, m.depositsAmount, 'Amount fields should be non-null');
    }

    @IsTest
    static void handlesNullRecordIdGracefully() {
        Test.startTest();
        FinancialOverviewController.FinancialMetrics m =
            FinancialOverviewController.getFinancialMetrics(null);
        FinancialOverviewController.TrendData t =
            FinancialOverviewController.getTrendData(null, 6);
        Test.stopTest();

        System.assertNotEquals(null, m);
        System.assertNotEquals(null, t);
        System.assertEquals(true, t.depositsTrend.isEmpty());
    }

    @IsTest
    static void trendDataReturnsStructure() {
        Account a = new Account(Name = 'Trend Fallback Test');
        insert a;

        Test.startTest();
        FinancialOverviewController.TrendData t =
            FinancialOverviewController.getTrendData(a.Id, 6);
        Test.stopTest();

        System.assertNotEquals(null, t);
        System.assertNotEquals(null, t.depositsTrend);
        System.assertNotEquals(null, t.loansTrend);
        System.assertNotEquals(null, t.investmentsTrend);
    }

    @IsTest
    static void trendWindowDefaultsWhenInvalid() {
        Account a = new Account(Name = 'Default Window');
        insert a;

        Test.startTest();
        FinancialOverviewController.TrendData t1 =
            FinancialOverviewController.getTrendData(a.Id, null);
        FinancialOverviewController.TrendData t2 =
            FinancialOverviewController.getTrendData(a.Id, -5);
        Test.stopTest();

        System.assertNotEquals(null, t1);
        System.assertNotEquals(null, t2);
    }
}
