/**
 * CRM KPI history for the React cockpits' sparklines and deltas.
 *
 * One Cockpit_KPI_Snapshot__c row per banker (record owner), per metric, per
 * day. The metrics mirror the cockpit tiles:
 *   pipeline     SUM(Amount) of open opportunities the banker owns
 *   openOpps     COUNT of those opportunities
 *   stage:<S>    SUM(Amount) of open opportunities in stage S (Pipeline Movement)
 *   leads        COUNT of unconverted leads the banker owns
 *   openCases    COUNT of open cases on accounts the banker owns
 *   goals        COUNT of financial goals the banker owns
 *
 * Nightly (Schedulable, 01:30) measures today. backfill(weeks) reconstructs
 * the same metrics for each of the last N weekly dates from record dates:
 *   · an opportunity is open on day D if it was created by D and is still
 *     open, or it closed after D (CloseDate > D) having been open (its stage
 *     history has a non-closed stage). One created already closed was never
 *     open. While open it counts in its last non-closed stage.
 *   · a case is open on D if created by D and not closed by D (ClosedDate).
 *   · a lead is open on D if created by D and not converted by D (ConvertedDate).
 *   · a goal counts from its CreatedDate.
 * The same code measures "today" both ways, so a backfilled series and the
 * nightly rows line up.
 *
 * Runs as a chain of batches (Opportunity → Case → Lead → FinancialGoal),
 * carrying the totals forward, then CockpitKpiSnapshotWriter upserts the rows
 * on Unique_Key__c, so re-running a night or the backfill replaces, never
 * duplicates. Without sharing: it measures every banker's book.
 */
public without sharing class CockpitKpiSnapshot implements Schedulable, Database.Batchable<SObject>, Database.Stateful {
    public enum Phase { OPPS, CASES, LEADS, GOALS }

    public static final String JOB_NAME = 'Cockpit KPI Snapshot (nightly)';
    /** 01:30 every day, after the evening's CRM activity. */
    public static final String CRON_NIGHTLY = '0 30 1 * * ?';
    public static final String SOURCE_NIGHTLY = 'Nightly';
    public static final String SOURCE_BACKFILL = 'Backfill';
    public static final List<String> CORE_METRICS = new List<String>{ 'pipeline', 'openOpps', 'leads', 'openCases', 'goals' };

    @TestVisible private final Phase step;
    /** Ascending snapshot dates. */
    @TestVisible private final List<Date> dates;
    @TestVisible private final String source;
    /** ownerId → metricKey → index into dates → value */
    @TestVisible private Map<Id, Map<String, Decimal[]>> totals;
    private transient Set<String> closedStages;

    public CockpitKpiSnapshot() {
        this(Phase.OPPS, new List<Date>{ Date.today() }, SOURCE_NIGHTLY, new Map<Id, Map<String, Decimal[]>>());
    }

    @TestVisible
    private CockpitKpiSnapshot(Phase p, List<Date> dates, String source, Map<Id, Map<String, Decimal[]>> totals) {
        this.step = p;
        this.dates = dates;
        this.source = source;
        this.totals = totals;
    }

    /* ── Entry points ─────────────────────────────────────────────────── */

    /** Schedule the nightly run (idempotent: replaces an existing job of the same name). */
    public static Id scheduleNightly() {
        for (CronTrigger ct : [SELECT Id FROM CronTrigger WHERE CronJobDetail.Name = :JOB_NAME]) {
            System.abortJob(ct.Id);
        }
        return System.schedule(JOB_NAME, CRON_NIGHTLY, new CockpitKpiSnapshot());
    }

    /** Reconstruct today and each of the last `weeks` weekly dates (today − 7k). */
    public static Id backfill(Integer weeks) {
        return Database.executeBatch(
            new CockpitKpiSnapshot(Phase.OPPS, backfillDates(weeks, Date.today()), SOURCE_BACKFILL, new Map<Id, Map<String, Decimal[]>>()),
            200
        );
    }

    @TestVisible
    private static List<Date> backfillDates(Integer weeks, Date today) {
        List<Date> out = new List<Date>();
        for (Integer k = weeks; k >= 1; k--) {
            out.add(today.addDays(-7 * k));
        }
        out.add(today);
        return out;
    }

    public void execute(SchedulableContext sc) {
        Database.executeBatch(new CockpitKpiSnapshot(), 200);
    }

    /* ── Batch ────────────────────────────────────────────────────────── */

    public Database.QueryLocator start(Database.BatchableContext bc) {
        Date first = dates[0];
        Datetime endOfLast = Datetime.newInstance(dates[dates.size() - 1].addDays(1), Time.newInstance(0, 0, 0, 0));
        Datetime firstStart = Datetime.newInstance(first, Time.newInstance(0, 0, 0, 0));
        switch on step {
            when OPPS {
                return Database.getQueryLocator([
                    SELECT Id, OwnerId, StageName, Amount, IsClosed, CloseDate, CreatedDate,
                           (SELECT StageName FROM OpportunityHistories ORDER BY CreatedDate ASC)
                    FROM Opportunity
                    WHERE CreatedDate < :endOfLast AND (IsClosed = false OR CloseDate > :first)
                ]);
            }
            when CASES {
                return Database.getQueryLocator([
                    SELECT Id, Account.OwnerId, CreatedDate, IsClosed, ClosedDate
                    FROM Case
                    WHERE AccountId != null AND CreatedDate < :endOfLast AND (IsClosed = false OR ClosedDate >= :firstStart)
                ]);
            }
            when LEADS {
                return Database.getQueryLocator([
                    SELECT Id, OwnerId, CreatedDate, IsConverted, ConvertedDate
                    FROM Lead
                    WHERE CreatedDate < :endOfLast AND (IsConverted = false OR ConvertedDate > :first)
                ]);
            }
            when else {
                return Database.getQueryLocator([
                    SELECT Id, OwnerId, CreatedDate FROM FinancialGoal WHERE CreatedDate < :endOfLast
                ]);
            }
        }
    }

    public void execute(Database.BatchableContext bc, List<SObject> scope) {
        switch on step {
            when OPPS { for (SObject r : scope) { addOpportunity((Opportunity) r); } }
            when CASES { for (SObject r : scope) { addCase((Case) r); } }
            when LEADS { for (SObject r : scope) { addLead((Lead) r); } }
            when else { for (SObject r : scope) { addGoal(r); } }
        }
    }

    public void finish(Database.BatchableContext bc) {
        Phase next = step == Phase.OPPS ? Phase.CASES : step == Phase.CASES ? Phase.LEADS : step == Phase.LEADS ? Phase.GOALS : null;
        if (next != null) {
            Database.executeBatch(new CockpitKpiSnapshot(next, dates, source, totals), 2000);
        } else {
            Database.executeBatch(new CockpitKpiSnapshotWriter(buildRows()), 2000);
        }
    }

    /* ── Reconstruction ───────────────────────────────────────────────── */

    @TestVisible
    private void addOpportunity(Opportunity o) {
        if (!isUser(o.OwnerId)) return;
        String stage;
        Date closedOn;
        if (!o.IsClosed) {
            stage = o.StageName;
        } else {
            // Last non-closed stage it held; none = created closed, never open.
            for (OpportunityHistory h : o.OpportunityHistories) {
                if (h.StageName != null && !closed().contains(h.StageName)) stage = h.StageName;
            }
            if (stage == null || o.CloseDate == null) return;
            closedOn = o.CloseDate;
        }
        Date created = o.CreatedDate.date();
        Decimal amount = o.Amount == null ? 0 : o.Amount;
        for (Integer i = 0; i < dates.size(); i++) {
            Date d = dates[i];
            if (created > d || (closedOn != null && closedOn <= d)) continue;
            bump(o.OwnerId, 'pipeline', i, amount);
            bump(o.OwnerId, 'openOpps', i, 1);
            bump(o.OwnerId, 'stage:' + stage, i, amount);
        }
    }

    @TestVisible
    private void addCase(Case c) {
        Id owner = c.Account?.OwnerId;
        if (!isUser(owner)) return;
        Date created = c.CreatedDate.date();
        Date closedOn = c.IsClosed && c.ClosedDate != null ? c.ClosedDate.date() : null;
        for (Integer i = 0; i < dates.size(); i++) {
            Date d = dates[i];
            if (created > d || (closedOn != null && closedOn <= d)) continue;
            bump(owner, 'openCases', i, 1);
        }
    }

    @TestVisible
    private void addLead(Lead l) {
        if (!isUser(l.OwnerId)) return;
        Date created = l.CreatedDate.date();
        Date convertedOn = l.IsConverted ? l.ConvertedDate : null;
        for (Integer i = 0; i < dates.size(); i++) {
            Date d = dates[i];
            if (created > d || (convertedOn != null && convertedOn <= d)) continue;
            bump(l.OwnerId, 'leads', i, 1);
        }
    }

    @TestVisible
    private void addGoal(SObject g) {
        Id owner = (Id) g.get('OwnerId');
        if (!isUser(owner)) return;
        Date created = ((Datetime) g.get('CreatedDate')).date();
        for (Integer i = 0; i < dates.size(); i++) {
            if (created <= dates[i]) bump(owner, 'goals', i, 1);
        }
    }

    /**
     * One row per owner × metric × date. Core metrics are zero-filled for every
     * owner and stage keys for every date, so a series never has gaps.
     */
    @TestVisible
    private List<Cockpit_KPI_Snapshot__c> buildRows() {
        List<Cockpit_KPI_Snapshot__c> rows = new List<Cockpit_KPI_Snapshot__c>();
        for (Id owner : totals.keySet()) {
            Map<String, Decimal[]> byMetric = totals.get(owner);
            for (String m : CORE_METRICS) {
                if (!byMetric.containsKey(m)) byMetric.put(m, zeros());
            }
            for (String m : byMetric.keySet()) {
                Decimal[] vals = byMetric.get(m);
                for (Integer i = 0; i < dates.size(); i++) {
                    rows.add(new Cockpit_KPI_Snapshot__c(
                        Banker__c = owner,
                        Metric_Key__c = m,
                        Value__c = vals[i],
                        Snapshot_Date__c = dates[i],
                        Source__c = (source == SOURCE_BACKFILL && i == dates.size() - 1) ? SOURCE_NIGHTLY : source,
                        Unique_Key__c = uniqueKey(owner, m, dates[i])
                    ));
                }
            }
        }
        return rows;
    }

    public static String uniqueKey(Id owner, String metric, Date d) {
        return String.valueOf(owner).left(15) + '|' + metric + '|' + Datetime.newInstance(d, Time.newInstance(12, 0, 0, 0)).format('yyyy-MM-dd');
    }

    /* ── Helpers ──────────────────────────────────────────────────────── */

    private void bump(Id owner, String metric, Integer i, Decimal amount) {
        Map<String, Decimal[]> byMetric = totals.get(owner);
        if (byMetric == null) {
            byMetric = new Map<String, Decimal[]>();
            totals.put(owner, byMetric);
        }
        Decimal[] vals = byMetric.get(metric);
        if (vals == null) {
            vals = zeros();
            byMetric.put(metric, vals);
        }
        vals[i] += amount;
    }

    private Decimal[] zeros() {
        Decimal[] z = new Decimal[dates.size()];
        for (Integer i = 0; i < z.size(); i++) z[i] = 0;
        return z;
    }

    private static Boolean isUser(Id owner) {
        return owner != null && String.valueOf(owner).startsWith('005');
    }

    /** Closed stages by API name and label (stage history stores the API value). */
    private Set<String> closed() {
        if (closedStages == null) {
            closedStages = new Set<String>();
            for (OpportunityStage s : [SELECT ApiName, MasterLabel FROM OpportunityStage WHERE IsClosed = true]) {
                closedStages.add(s.ApiName);
                closedStages.add(s.MasterLabel);
            }
        }
        return closedStages;
    }
}
