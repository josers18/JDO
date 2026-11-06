/**
 * Upserts the rows CockpitKpiSnapshot computed, in chunks, on Unique_Key__c.
 * A separate batch so a full backfill (owners × metrics × dates) never hits
 * the 10,000-row DML limit of one transaction.
 */
public without sharing class CockpitKpiSnapshotWriter implements Database.Batchable<SObject> {
    private final List<SObject> rows;

    public CockpitKpiSnapshotWriter(List<Cockpit_KPI_Snapshot__c> rows) {
        this.rows = rows;
    }

    public Iterable<SObject> start(Database.BatchableContext bc) {
        return rows;
    }

    public void execute(Database.BatchableContext bc, List<SObject> scope) {
        Database.upsert((List<Cockpit_KPI_Snapshot__c>) scope, Cockpit_KPI_Snapshot__c.Unique_Key__c, false);
    }

    public void finish(Database.BatchableContext bc) {}
}
