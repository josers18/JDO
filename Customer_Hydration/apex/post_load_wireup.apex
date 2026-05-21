// Customer_Hydration Phase 5 post-load wireup.
// Runs after Plan 1+2+3+4 record loading completes. Three jobs:
//   1. Roll up household total assets / liabilities for HYDRATE-HH-* households
//   2. Kick the FSC Group Builder so the standard FSC roll-up logic propagates
//   3. Escalate aged HYDRATE-* Cases (age > 7 days, Priority High/Critical, IsClosed=false)
//
// All SOQL uses WITH USER_MODE per project convention. Re-runs are idempotent.

// 1. Household roll-ups
Map<Id, Decimal> assetsByHousehold = new Map<Id, Decimal>();
Map<Id, Decimal> liabsByHousehold  = new Map<Id, Decimal>();

for (FinServ__FinancialAccount__c fa : [
    SELECT FinServ__PrimaryOwner__c,
           FinServ__PrimaryOwner__r.External_ID__c,
           FinServ__PrimaryOwner__r.FinServ__GroupId__c,
           FinServ__Balance__c,
           FinServ__LoanAmount__c,
           FinServ__FinancialAccountType__c
    FROM   FinServ__FinancialAccount__c
    WHERE  FinServ__PrimaryOwner__r.External_ID__c LIKE 'HYDRATE-%'
    WITH USER_MODE
]) {
    Id hhId = fa.FinServ__PrimaryOwner__r.FinServ__GroupId__c;
    if (hhId == null) continue;
    if (fa.FinServ__FinancialAccountType__c == 'Loans') {
        Decimal cur = liabsByHousehold.get(hhId);
        liabsByHousehold.put(hhId, (cur == null ? 0 : cur) + (fa.FinServ__LoanAmount__c == null ? 0 : fa.FinServ__LoanAmount__c));
    } else if (fa.FinServ__FinancialAccountType__c == 'Deposits' || fa.FinServ__FinancialAccountType__c == 'Investments') {
        Decimal cur = assetsByHousehold.get(hhId);
        assetsByHousehold.put(hhId, (cur == null ? 0 : cur) + (fa.FinServ__Balance__c == null ? 0 : fa.FinServ__Balance__c));
    }
}

List<Account> households = [
    SELECT Id, External_ID__c
    FROM   Account
    WHERE  External_ID__c LIKE 'HYDRATE-HH-%'
    WITH USER_MODE
];
List<Account> updates = new List<Account>();
for (Account hh : households) {
    Account upd = new Account(Id = hh.Id);
    upd.FinServ__TotalAssets__c      = assetsByHousehold.containsKey(hh.Id) ? assetsByHousehold.get(hh.Id) : 0;
    upd.FinServ__TotalLiabilities__c = liabsByHousehold.containsKey(hh.Id) ? liabsByHousehold.get(hh.Id) : 0;
    updates.add(upd);
}
if (!updates.isEmpty()) {
    update Security.stripInaccessible(AccessType.UPDATABLE, updates).getRecords();
}
System.debug(LoggingLevel.INFO, '[CustomerHydration] Updated ' + updates.size() + ' household roll-ups');

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
