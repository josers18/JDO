public class FscGroupRollupBatch implements Database.Batchable<sObject>, Database.AllowsCallouts {
    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator(
            'SELECT Id FROM Account WHERE External_ID__c LIKE \'HYDRATE-HH-%\''
        );
    }

    public void execute(Database.BatchableContext bc, List<Account> scope) {
        // No-op fallback that just touches each Household Account so any
        // declarative roll-up rules / triggers re-fire. The documented
        // FinServ.GroupAssignmentBatch path is preferred; we land here only
        // when that API isn't reachable (Type.forName returned null or
        // newInstance threw).
        update scope;
    }

    public void finish(Database.BatchableContext bc) {
        System.debug(LoggingLevel.INFO, '[CustomerHydration] FscGroupRollupBatch finished');
    }
}
