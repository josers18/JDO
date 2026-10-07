// Invocable action behind AFD360_HXL_Agent's get_account_snapshot and the AFD360Demo getAccountSnapshot MCP tool; renders as the afd360AccountCard HXL widget.
global with sharing class AFD360AccountSnapshot {

    @InvocableMethod(label='Get Account Snapshot' description='Returns a snapshot of an Account (type, industry, owner, phone, website, open opportunities) by Account Id or name')
    global static List<AccountSnapshotResponse> getAccountSnapshot(List<AccountSnapshotRequest> requests) {
        List<AccountSnapshotResponse> responses = new List<AccountSnapshotResponse>();
        for (AccountSnapshotRequest req : requests) {
            AccountSnapshotResponse res = new AccountSnapshotResponse();
            Account a = findAccount(req);
            res.account = a == null ? notFound(req) : toSnapshot(a);
            responses.add(res);
        }
        return responses;
    }

    private static Account findAccount(AccountSnapshotRequest req) {
        List<Account> found;
        if (String.isNotBlank(req.accountId)) {
            String accountId = req.accountId.trim();
            found = [SELECT Id, Name, Type, Industry, Phone, Website, BillingCity, BillingState, Owner.Name
                     FROM Account WHERE Id = :accountId WITH USER_MODE LIMIT 1];
        } else if (String.isNotBlank(req.accountName)) {
            String pattern = '%' + req.accountName.trim() + '%';
            found = [SELECT Id, Name, Type, Industry, Phone, Website, BillingCity, BillingState, Owner.Name
                     FROM Account WHERE Name LIKE :pattern WITH USER_MODE ORDER BY LastModifiedDate DESC LIMIT 1];
        } else {
            return null;
        }
        return found.isEmpty() ? null : found[0];
    }

    private static Snapshot toSnapshot(Account a) {
        Snapshot s = new Snapshot();
        s.found = true;
        s.accountId = a.Id;
        s.name = a.Name;
        s.accountType = orDash(a.Type);
        s.industry = orDash(a.Industry);
        s.owner = a.Owner == null ? '—' : a.Owner.Name;
        s.phone = orDash(a.Phone);
        s.website = orDash(a.Website);
        String place = String.join(new List<String>{ orBlank(a.BillingCity), orBlank(a.BillingState) }, ', ').removeStart(', ').removeEnd(', ');
        s.location = String.isBlank(place) ? '—' : place;
        AggregateResult agg = [SELECT COUNT(Id) n, SUM(Amount) total FROM Opportunity
                               WHERE AccountId = :a.Id AND IsClosed = false WITH USER_MODE][0];
        Integer n = (Integer) agg.get('n');
        Decimal total = (Decimal) agg.get('total');
        s.openOpportunities = n + (n == 1 ? ' open opportunity' : ' open opportunities');
        s.openPipeline = total == null ? '—' : formatMoney(total);
        s.recordUrl = URL.getOrgDomainUrl().toExternalForm() + '/lightning/r/Account/' + a.Id + '/view';
        return s;
    }

    private static Snapshot notFound(AccountSnapshotRequest req) {
        Snapshot s = new Snapshot();
        s.found = false;
        s.name = 'Account not found';
        s.accountType = String.isNotBlank(req.accountId) ? req.accountId : orBlank(req.accountName);
        s.industry = '—';
        s.owner = '—';
        s.phone = '—';
        s.website = '—';
        s.location = '—';
        s.openOpportunities = '—';
        s.openPipeline = '—';
        return s;
    }

    global static String formatMoney(Decimal amount) {
        return '$' + amount.setScale(0).format();
    }

    private static String orDash(String v) { return String.isBlank(v) ? '—' : v; }
    private static String orBlank(String v) { return v == null ? '' : v; }

    global class AccountSnapshotRequest {
        @InvocableVariable(label='Account Id' description='18-character Account Id')
        global String accountId;
        @InvocableVariable(label='Account Name' description='Full or partial Account name, used when no Id is given')
        global String accountName;
    }

    global class AccountSnapshotResponse {
        @InvocableVariable(label='Account Snapshot')
        global Snapshot account;
    }

    global class Snapshot {
        @InvocableVariable global Boolean found;
        @InvocableVariable global String accountId;
        @InvocableVariable global String name;
        @InvocableVariable global String accountType;
        @InvocableVariable global String industry;
        @InvocableVariable global String owner;
        @InvocableVariable global String phone;
        @InvocableVariable global String website;
        @InvocableVariable global String location;
        @InvocableVariable global String openOpportunities;
        @InvocableVariable global String openPipeline;
        @InvocableVariable global String recordUrl;
    }
}
