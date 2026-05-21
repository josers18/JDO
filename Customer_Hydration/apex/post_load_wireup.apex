// Customer_Hydration Phase 5 post-load wireup.
// Runs after Plan 1+2+3+4 record loading completes. Two jobs:
//   1. Kick the FSC Group Builder so the standard FSC roll-up logic propagates
//      household total-AUM / total-liabilities / total-bank-deposits values
//      onto HYDRATE-HH-* household Accounts. (Direct write of those fields
//      isn't possible — they're declarative roll-ups in this org's FSC version.)
//   2. Escalate aged HYDRATE-* Cases (age > 7 days, Priority High/Critical, IsClosed=false)
//
// All SOQL uses WITH USER_MODE per project convention. Re-runs are idempotent.

// 1. (NO-OP for direct write — see Apex script comment above.)
//    The roll-up fields on Account (FinServ__AUM__c, FinServ__TotalBankDeposits__c,
//    FinServ__TotalInvestments__c, FinServ__TotalLiabilities__c) are read-only /
//    declaratively-rolled-up in jdo-fw51xz. The Group Builder kickoff in step 2
//    triggers the FSC standard logic that populates them. If your org has direct
//    writable roll-up fields, replace this comment with the appropriate write loop.

// 2. FSC Group Builder kickoff (try documented API; fall back to FscGroupRollupBatch)
Boolean groupBuilderKicked = false;
try {
    Type t = Type.forName('FinServ.GroupAssignmentBatch');
    if (t != null) {
        Object instance = t.newInstance();
        if (instance != null) {
            // Reflectively invoke the batch — only if it's actually callable
            Database.executeBatch((Database.Batchable<sObject>) instance, 200);
            groupBuilderKicked = true;
            System.debug(LoggingLevel.INFO, '[CustomerHydration] Kicked FinServ.GroupAssignmentBatch');
        }
    }
} catch (Exception e) {
    System.debug(LoggingLevel.WARN, '[CustomerHydration] FinServ.GroupAssignmentBatch unavailable: ' + e.getMessage());
}
if (!groupBuilderKicked) {
    try {
        Database.executeBatch(new FscGroupRollupBatch(), 200);
        System.debug(LoggingLevel.INFO, '[CustomerHydration] Kicked FscGroupRollupBatch fallback');
    } catch (Exception e) {
        System.debug(LoggingLevel.WARN, '[CustomerHydration] FscGroupRollupBatch fallback also failed: ' + e.getMessage());
    }
}

// 3. Escalate aged HYDRATE-* Cases
List<Case> escalations = [
    SELECT Id, Status, Priority, CreatedDate
    FROM   Case
    WHERE  External_ID__c LIKE 'HYDRATE-%'
      AND  IsClosed = false
      AND  Status != 'Escalated'
      AND  CreatedDate < :Datetime.now().addDays(-7)
      AND  Priority IN ('High','Critical')
    WITH USER_MODE
];
for (Case c : escalations) {
    c.Status = 'Escalated';
    c.IsEscalated = true;
}
if (!escalations.isEmpty()) {
    update Security.stripInaccessible(AccessType.UPDATABLE, escalations).getRecords();
}
System.debug(LoggingLevel.INFO, '[CustomerHydration] Escalated ' + escalations.size() + ' Cases');
