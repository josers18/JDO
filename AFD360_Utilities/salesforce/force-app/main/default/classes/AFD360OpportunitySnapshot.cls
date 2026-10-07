// Invocable action behind AFD360_HXL_Agent's get_opportunity_snapshot and the AFD360Demo getOpportunitySnapshot MCP tool; renders as the afd360OpportunityCard HXL widget.
global with sharing class AFD360OpportunitySnapshot {

    @InvocableMethod(label='Get Opportunity Snapshot' description='Returns a snapshot of an Opportunity (account, stage, amount, close date, probability, owner) by Opportunity Id or name; with only an Account Id, returns that account\'s largest open opportunity')
    global static List<OpportunitySnapshotResponse> getOpportunitySnapshot(List<OpportunitySnapshotRequest> requests) {
        List<OpportunitySnapshotResponse> responses = new List<OpportunitySnapshotResponse>();
        for (OpportunitySnapshotRequest req : requests) {
            OpportunitySnapshotResponse res = new OpportunitySnapshotResponse();
            Opportunity o = findOpportunity(req);
            res.opportunity = o == null ? notFound(req) : toSnapshot(o);
            responses.add(res);
        }
        return responses;
    }

    private static Opportunity findOpportunity(OpportunitySnapshotRequest req) {
        List<Opportunity> found;
        if (String.isNotBlank(req.opportunityId)) {
            String oppId = req.opportunityId.trim();
            found = [SELECT Id, Name, StageName, Amount, CloseDate, Probability, Account.Name, Owner.Name, NextStep
                     FROM Opportunity WHERE Id = :oppId WITH USER_MODE LIMIT 1];
        } else if (String.isNotBlank(req.opportunityName)) {
            String pattern = '%' + req.opportunityName.trim() + '%';
            found = [SELECT Id, Name, StageName, Amount, CloseDate, Probability, Account.Name, Owner.Name, NextStep
                     FROM Opportunity WHERE Name LIKE :pattern WITH USER_MODE ORDER BY IsClosed ASC, Amount DESC NULLS LAST LIMIT 1];
        } else if (String.isNotBlank(req.accountId)) {
            String accountId = req.accountId.trim();
            found = [SELECT Id, Name, StageName, Amount, CloseDate, Probability, Account.Name, Owner.Name, NextStep
                     FROM Opportunity WHERE AccountId = :accountId AND IsClosed = false WITH USER_MODE ORDER BY Amount DESC NULLS LAST LIMIT 1];
        } else {
            return null;
        }
        return found.isEmpty() ? null : found[0];
    }

    private static Snapshot toSnapshot(Opportunity o) {
        Snapshot s = new Snapshot();
        s.found = true;
        s.opportunityId = o.Id;
        s.name = o.Name;
        s.accountName = o.Account == null ? '—' : o.Account.Name;
        s.stage = o.StageName;
        s.amount = o.Amount == null ? '—' : AFD360AccountSnapshot.formatMoney(o.Amount);
        s.closeDate = o.CloseDate == null ? '—' : Datetime.newInstance(o.CloseDate, Time.newInstance(12, 0, 0, 0)).format('MMM d, yyyy');
        s.probability = o.Probability == null ? '—' : o.Probability.setScale(0) + '%';
        s.owner = o.Owner == null ? '—' : o.Owner.Name;
        s.nextStep = String.isBlank(o.NextStep) ? '—' : o.NextStep;
        s.recordUrl = URL.getOrgDomainUrl().toExternalForm() + '/lightning/r/Opportunity/' + o.Id + '/view';
        return s;
    }

    private static Snapshot notFound(OpportunitySnapshotRequest req) {
        Snapshot s = new Snapshot();
        s.found = false;
        s.name = 'Opportunity not found';
        s.accountName = '—';
        s.stage = '—';
        s.amount = '—';
        s.closeDate = '—';
        s.probability = '—';
        s.owner = '—';
        s.nextStep = '—';
        return s;
    }

    global class OpportunitySnapshotRequest {
        @InvocableVariable(label='Opportunity Id' description='18-character Opportunity Id')
        global String opportunityId;
        @InvocableVariable(label='Opportunity Name' description='Full or partial Opportunity name')
        global String opportunityName;
        @InvocableVariable(label='Account Id' description='Account Id; returns its largest open opportunity when no Opportunity Id or name is given')
        global String accountId;
    }

    global class OpportunitySnapshotResponse {
        @InvocableVariable(label='Opportunity Snapshot')
        global Snapshot opportunity;
    }

    global class Snapshot {
        @InvocableVariable global Boolean found;
        @InvocableVariable global String opportunityId;
        @InvocableVariable global String name;
        @InvocableVariable global String accountName;
        @InvocableVariable global String stage;
        @InvocableVariable global String amount;
        @InvocableVariable global String closeDate;
        @InvocableVariable global String probability;
        @InvocableVariable global String owner;
        @InvocableVariable global String nextStep;
        @InvocableVariable global String recordUrl;
    }
}
