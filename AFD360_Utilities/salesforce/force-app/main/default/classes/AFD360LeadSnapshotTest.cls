@IsTest
private class AFD360LeadSnapshotTest {
    @TestSetup
    static void setup() {
        insert new Lead(FirstName = 'Ada', LastName = 'Snapshot', Company = 'AFD360 Test Co', Status = 'Open - Not Contacted', Rating = 'Hot');
    }

    @IsTest
    static void returnsSnapshotById() {
        Lead l = [SELECT Id FROM Lead WHERE LastName = 'Snapshot' LIMIT 1];
        AFD360LeadSnapshot.LeadSnapshotRequest req = new AFD360LeadSnapshot.LeadSnapshotRequest();
        req.leadId = l.Id;
        List<AFD360LeadSnapshot.LeadSnapshotResponse> res = AFD360LeadSnapshot.getLeadSnapshot(new List<AFD360LeadSnapshot.LeadSnapshotRequest>{ req });
        Assert.isTrue(res[0].lead.found);
        Assert.areEqual('Ada Snapshot', res[0].lead.name);
        Assert.areEqual('Hot', res[0].lead.rating);
        Assert.isTrue(res[0].lead.recordUrl.endsWith('/lightning/r/Lead/' + l.Id + '/view'));
    }

    @IsTest
    static void returnsSnapshotByName() {
        AFD360LeadSnapshot.LeadSnapshotRequest req = new AFD360LeadSnapshot.LeadSnapshotRequest();
        req.leadName = 'Ada Snap';
        List<AFD360LeadSnapshot.LeadSnapshotResponse> res = AFD360LeadSnapshot.getLeadSnapshot(new List<AFD360LeadSnapshot.LeadSnapshotRequest>{ req });
        Assert.areEqual('AFD360 Test Co', res[0].lead.company);
    }

    @IsTest
    static void reportsNotFound() {
        AFD360LeadSnapshot.LeadSnapshotRequest req = new AFD360LeadSnapshot.LeadSnapshotRequest();
        req.leadName = 'nobody-by-this-name';
        List<AFD360LeadSnapshot.LeadSnapshotResponse> res = AFD360LeadSnapshot.getLeadSnapshot(new List<AFD360LeadSnapshot.LeadSnapshotRequest>{ req });
        Assert.isFalse(res[0].lead.found);
    }
}
