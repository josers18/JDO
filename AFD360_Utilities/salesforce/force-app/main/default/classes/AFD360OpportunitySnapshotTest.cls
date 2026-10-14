@IsTest
private class AFD360OpportunitySnapshotTest {
    @TestSetup
    static void setup() {
        Account a = new Account(Name = 'AFD360 Opp Test Account');
        insert a;
        insert new List<Opportunity>{
            new Opportunity(Name = 'AFD360 Opp Large', AccountId = a.Id, StageName = 'Prospecting', CloseDate = Date.newInstance(2030, 3, 15), Amount = 90000, NextStep = 'Pricing call'),
            new Opportunity(Name = 'AFD360 Opp Small', AccountId = a.Id, StageName = 'Prospecting', CloseDate = Date.newInstance(2030, 4, 1), Amount = 100)
        };
    }

    @IsTest
    static void returnsLargestOpenForAccount() {
        Account a = [SELECT Id FROM Account WHERE Name = 'AFD360 Opp Test Account' LIMIT 1];
        AFD360OpportunitySnapshot.OpportunitySnapshotRequest req = new AFD360OpportunitySnapshot.OpportunitySnapshotRequest();
        req.accountId = a.Id;
        AFD360OpportunitySnapshot.Snapshot s = AFD360OpportunitySnapshot.getOpportunitySnapshot(new List<AFD360OpportunitySnapshot.OpportunitySnapshotRequest>{ req })[0].opportunity;
        Assert.isTrue(s.found);
        Assert.areEqual('AFD360 Opp Large', s.name);
        Assert.areEqual('AFD360 Opp Test Account', s.accountName);
        Assert.areEqual('Mar 15, 2030', s.closeDate);
        Assert.areEqual('Pricing call', s.nextStep);
    }

    @IsTest
    static void returnsByNameAndId() {
        Opportunity o = [SELECT Id FROM Opportunity WHERE Name = 'AFD360 Opp Small' LIMIT 1];
        AFD360OpportunitySnapshot.OpportunitySnapshotRequest byName = new AFD360OpportunitySnapshot.OpportunitySnapshotRequest();
        byName.opportunityName = 'AFD360 Opp Small';
        AFD360OpportunitySnapshot.OpportunitySnapshotRequest byId = new AFD360OpportunitySnapshot.OpportunitySnapshotRequest();
        byId.opportunityId = o.Id;
        List<AFD360OpportunitySnapshot.OpportunitySnapshotResponse> res = AFD360OpportunitySnapshot.getOpportunitySnapshot(
            new List<AFD360OpportunitySnapshot.OpportunitySnapshotRequest>{ byName, byId });
        Assert.areEqual(o.Id, res[0].opportunity.opportunityId);
        Assert.isTrue(res[1].opportunity.recordUrl.endsWith('/lightning/r/Opportunity/' + o.Id + '/view'));
    }

    @IsTest
    static void reportsNotFound() {
        AFD360OpportunitySnapshot.OpportunitySnapshotRequest req = new AFD360OpportunitySnapshot.OpportunitySnapshotRequest();
        req.opportunityName = 'nobody-by-this-name';
        Assert.isFalse(AFD360OpportunitySnapshot.getOpportunitySnapshot(new List<AFD360OpportunitySnapshot.OpportunitySnapshotRequest>{ req })[0].opportunity.found);
        Assert.isFalse(AFD360OpportunitySnapshot.getOpportunitySnapshot(new List<AFD360OpportunitySnapshot.OpportunitySnapshotRequest>{ new AFD360OpportunitySnapshot.OpportunitySnapshotRequest() })[0].opportunity.found);
    }
}
