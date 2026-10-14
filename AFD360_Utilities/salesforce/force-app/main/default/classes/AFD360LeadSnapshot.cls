// Invocable action behind the AFD360_Demo MCP server's getLeadSnapshot tool; its output renders as the afd360LeadCard HXL widget.
global with sharing class AFD360LeadSnapshot {

    @InvocableMethod(label='Get Lead Snapshot' description='Returns a snapshot of a Lead (name, company, status, rating, source, contact info) by Lead Id or name')
    global static List<LeadSnapshotResponse> getLeadSnapshot(List<LeadSnapshotRequest> requests) {
        List<LeadSnapshotResponse> responses = new List<LeadSnapshotResponse>();
        for (LeadSnapshotRequest req : requests) {
            LeadSnapshotResponse res = new LeadSnapshotResponse();
            Lead l = findLead(req);
            res.lead = l == null ? notFound(req) : toSnapshot(l);
            responses.add(res);
        }
        return responses;
    }

    private static Lead findLead(LeadSnapshotRequest req) {
        List<Lead> found;
        if (String.isNotBlank(req.leadId)) {
            String leadId = req.leadId.trim();
            found = [SELECT Id, Name, Company, Title, Status, Rating, LeadSource, Email, Phone, CreatedDate
                     FROM Lead WHERE Id = :leadId WITH USER_MODE LIMIT 1];
        } else if (String.isNotBlank(req.leadName)) {
            String pattern = '%' + req.leadName.trim() + '%';
            found = [SELECT Id, Name, Company, Title, Status, Rating, LeadSource, Email, Phone, CreatedDate
                     FROM Lead WHERE Name LIKE :pattern WITH USER_MODE ORDER BY CreatedDate DESC LIMIT 1];
        } else {
            return null;
        }
        return found.isEmpty() ? null : found[0];
    }

    private static Snapshot toSnapshot(Lead l) {
        Snapshot s = new Snapshot();
        s.found = true;
        s.leadId = l.Id;
        s.name = l.Name;
        s.company = l.Company;
        s.title = String.isBlank(l.Title) ? '—' : l.Title;
        s.status = l.Status;
        s.rating = String.isBlank(l.Rating) ? 'Not rated' : l.Rating;
        s.leadSource = String.isBlank(l.LeadSource) ? '—' : l.LeadSource;
        s.email = String.isBlank(l.Email) ? '—' : l.Email;
        s.phone = String.isBlank(l.Phone) ? '—' : l.Phone;
        s.createdDate = l.CreatedDate.format('MMM d, yyyy');
        s.recordUrl = URL.getOrgDomainUrl().toExternalForm() + '/lightning/r/Lead/' + l.Id + '/view';
        return s;
    }

    private static Snapshot notFound(LeadSnapshotRequest req) {
        Snapshot s = new Snapshot();
        s.found = false;
        s.name = 'Lead not found';
        s.company = String.isNotBlank(req.leadId) ? req.leadId : (req.leadName == null ? '' : req.leadName);
        s.title = '—';
        s.status = '—';
        s.rating = '—';
        s.leadSource = '—';
        s.email = '—';
        s.phone = '—';
        s.createdDate = '—';
        return s;
    }

    global class LeadSnapshotRequest {
        @InvocableVariable(label='Lead Id' description='18-character Lead Id')
        global String leadId;
        @InvocableVariable(label='Lead Name' description='Full or partial Lead name, used when no Id is given')
        global String leadName;
    }

    global class LeadSnapshotResponse {
        @InvocableVariable(label='Lead Snapshot')
        global Snapshot lead;
    }

    global class Snapshot {
        @InvocableVariable global Boolean found;
        @InvocableVariable global String leadId;
        @InvocableVariable global String name;
        @InvocableVariable global String company;
        @InvocableVariable global String title;
        @InvocableVariable global String status;
        @InvocableVariable global String rating;
        @InvocableVariable global String leadSource;
        @InvocableVariable global String email;
        @InvocableVariable global String phone;
        @InvocableVariable global String createdDate;
        @InvocableVariable global String recordUrl;
    }
}
