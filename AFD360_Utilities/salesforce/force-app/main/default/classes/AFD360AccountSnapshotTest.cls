@IsTest
private class AFD360AccountSnapshotTest {
    @TestSetup
    static void setup() {
        Account a = new Account(Name = 'AFD360 Snapshot Bank', Industry = 'Banking', Phone = '555-0100', BillingCity = 'Austin', BillingState = 'TX');
        insert a;
        insert new List<Opportunity>{
            new Opportunity(Name = 'AFD360 Big Deal', AccountId = a.Id, StageName = 'Prospecting', CloseDate = Date.today().addDays(30), Amount = 50000),
            new Opportunity(Name = 'AFD360 Small Deal', AccountId = a.Id, StageName = 'Prospecting', CloseDate = Date.today().addDays(60), Amount = 1000)
        };
    }

    @IsTest
    static void returnsSnapshotByName() {
        AFD360AccountSnapshot.AccountSnapshotRequest req = new AFD360AccountSnapshot.AccountSnapshotRequest();
        req.accountName = 'AFD360 Snapshot';
        AFD360AccountSnapshot.Snapshot s = AFD360AccountSnapshot.getAccountSnapshot(new List<AFD360AccountSnapshot.AccountSnapshotRequest>{ req })[0].account;
        Assert.isTrue(s.found);
        Assert.areEqual('Banking', s.industry);
        Assert.areEqual('Austin, TX', s.location);
        Assert.areEqual('2 open opportunities', s.openOpportunities);
        Assert.isTrue(s.openPipeline.startsWith('$'));
    }

    @IsTest
    static void returnsSnapshotById() {
        Account a = [SELECT Id FROM Account WHERE Name = 'AFD360 Snapshot Bank' LIMIT 1];
        AFD360AccountSnapshot.AccountSnapshotRequest req = new AFD360AccountSnapshot.AccountSnapshotRequest();
        req.accountId = a.Id;
        AFD360AccountSnapshot.Snapshot s = AFD360AccountSnapshot.getAccountSnapshot(new List<AFD360AccountSnapshot.AccountSnapshotRequest>{ req })[0].account;
        Assert.isTrue(s.recordUrl.endsWith('/lightning/r/Account/' + a.Id + '/view'));
    }

    @IsTest
    static void reportsNotFound() {
        AFD360AccountSnapshot.AccountSnapshotRequest req = new AFD360AccountSnapshot.AccountSnapshotRequest();
        req.accountName = 'nobody-by-this-name';
        Assert.isFalse(AFD360AccountSnapshot.getAccountSnapshot(new List<AFD360AccountSnapshot.AccountSnapshotRequest>{ req })[0].account.found);
        Assert.isFalse(AFD360AccountSnapshot.getAccountSnapshot(new List<AFD360AccountSnapshot.AccountSnapshotRequest>{ new AFD360AccountSnapshot.AccountSnapshotRequest() })[0].account.found);
    }
}
