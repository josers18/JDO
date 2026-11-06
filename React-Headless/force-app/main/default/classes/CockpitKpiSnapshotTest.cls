@IsTest
private class CockpitKpiSnapshotTest {
    private static Id me() { return UserInfo.getUserId(); }

    @IsTest
    static void backfillDatesAreWeeklyAndEndToday() {
        Date today = Date.newInstance(2026, 11, 6);
        List<Date> ds = CockpitKpiSnapshot.backfillDates(8, today);
        System.assertEquals(9, ds.size());
        System.assertEquals(today.addDays(-56), ds[0]);
        System.assertEquals(today, ds[8]);
    }

    @IsTest
    static void reconstructsOpenStateFromRecordDates() {
        Date today = Date.today();
        List<Date> ds = new List<Date>{ today.addDays(-14), today.addDays(-7), today };
        CockpitKpiSnapshot job = new CockpitKpiSnapshot(CockpitKpiSnapshot.Phase.OPPS, ds, CockpitKpiSnapshot.SOURCE_BACKFILL, new Map<Id, Map<String, Decimal[]>>());

        Account a = new Account(Name = 'KPI Test Co');
        insert a;
        Opportunity open = new Opportunity(Name = 'Open', AccountId = a.Id, StageName = 'Prospecting', CloseDate = today.addDays(30), Amount = 100);
        insert open;
        open = [SELECT Id, OwnerId, StageName, Amount, IsClosed, CloseDate, CreatedDate, (SELECT StageName FROM OpportunityHistories) FROM Opportunity WHERE Id = :open.Id];
        // Created today, so only the last date counts it.
        job.addOpportunity(open);
        Map<String, Decimal[]> mine = job.totals.get(me());
        System.assertEquals(0, mine.get('openOpps')[0]);
        System.assertEquals(1, mine.get('openOpps')[2]);
        System.assertEquals(100, mine.get('pipeline')[2]);
        System.assertEquals(100, mine.get('stage:Prospecting')[2]);

        Case c = new Case(Subject = 'KPI', AccountId = a.Id, Status = 'New');
        insert c;
        job.addCase([SELECT Id, Account.OwnerId, CreatedDate, IsClosed, ClosedDate FROM Case WHERE Id = :c.Id]);
        System.assertEquals(1, job.totals.get(a.OwnerId).get('openCases')[2]);

        Lead l = new Lead(LastName = 'Kpi', Company = 'KPI Co', Status = 'New');
        insert l;
        job.addLead([SELECT Id, OwnerId, CreatedDate, IsConverted, ConvertedDate FROM Lead WHERE Id = :l.Id]);
        System.assertEquals(1, job.totals.get(me()).get('leads')[2]);

        List<Cockpit_KPI_Snapshot__c> rows = job.buildRows();
        // core metrics zero-filled: every row set has all 3 dates
        System.assert(rows.size() >= 3 * CockpitKpiSnapshot.CORE_METRICS.size());
        Test.startTest();
        Database.executeBatch(new CockpitKpiSnapshotWriter(rows), 2000);
        Test.stopTest();
        System.assertEquals(rows.size(), [SELECT COUNT() FROM Cockpit_KPI_Snapshot__c]);
        System.assertEquals(1, [SELECT COUNT() FROM Cockpit_KPI_Snapshot__c WHERE Unique_Key__c = :CockpitKpiSnapshot.uniqueKey(me(), 'openOpps', today)]);
    }

    @IsTest
    static void eachPhaseRunsAsBatch() {
        Account a = new Account(Name = 'KPI Batch Co');
        insert a;
        insert new Opportunity(Name = 'B', AccountId = a.Id, StageName = 'Prospecting', CloseDate = Date.today().addDays(10), Amount = 5);
        for (CockpitKpiSnapshot.Phase p : CockpitKpiSnapshot.Phase.values()) {
            CockpitKpiSnapshot job = new CockpitKpiSnapshot(p, new List<Date>{ Date.today() }, CockpitKpiSnapshot.SOURCE_NIGHTLY, new Map<Id, Map<String, Decimal[]>>());
            Database.QueryLocator ql = job.start(null);
            List<SObject> recs = new List<SObject>();
            Database.QueryLocatorIterator it = ql.iterator();
            while (it.hasNext()) recs.add(it.next());
            job.execute(null, recs);
        }
        System.assertNotEquals(null, CockpitKpiSnapshot.uniqueKey(me(), 'goals', Date.today()));
    }

    @IsTest
    static void schedulesNightlyAndBackfill() {
        Test.startTest();
        Id cron = CockpitKpiSnapshot.scheduleNightly();
        Id again = CockpitKpiSnapshot.scheduleNightly();
        Id job = CockpitKpiSnapshot.backfill(2);
        new CockpitKpiSnapshot().execute((SchedulableContext) null);
        Test.stopTest();
        System.assertNotEquals(null, again);
        System.assertNotEquals(null, job);
        System.assertEquals(1, [SELECT COUNT() FROM CronTrigger WHERE CronJobDetail.Name = :CockpitKpiSnapshot.JOB_NAME]);
    }
}
