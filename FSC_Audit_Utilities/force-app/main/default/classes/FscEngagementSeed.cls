/**
 * FscEngagementSeed
 * -----------------
 * Phase B1 implementation per audit decision §6.1 D4 + B1.
 *
 * Generates 1,200 demo-engagement records (500 Events + 300 Tasks +
 * 200 Interactions + 200 stub InteractionSummaries) distributed across
 * the rolling 90-day window (60 days past, 30 days future). Records are
 * weighted-random distributed with bias toward the recent past so demos
 * showing "this week's activity" look populated.
 *
 * Owners rotate across 7 advisor personas (5 Sales + 2 Service) per the
 * D4 prescription. Subjects/descriptions pulled from an embedded
 * FSC-flavored content library so records look like real client engagement.
 *
 * Idempotency: gated by IsSeededEngagement__c. If any seeded records
 * already exist on Event, the script exits early without re-generating.
 * Safe to re-run; safe to leave deployed.
 *
 * Companion: FscEngagementShifter (Schedulable) shifts these records'
 * dates forward by 30 days monthly to keep the rolling window fresh
 * without unbounded record growth.
 *
 * Closes audit finding §4.1 C1 (no fresh activity). Pairs with §6.1 D4
 * for InteractionSummary authorship rotation.
 */
public with sharing class FscEngagementSeed {

    // -- Owner rotation pool (5 Sales + 2 Service per B1 design) ---------
    // Resolved at run-time by username so tests don't break on Id changes.
    private static final List<String> OWNER_USERNAMES = new List<String>{
        'bill.south@finsdc3.demo',
        'cindy.central@finsdc3.demo',
        'ely.east@finsdc3.demo',
        'valerie.east@finsdc3.demo',
        'vanessa.central@finsdc3.demo',
        'brenda.service@finsdc3.demo',
        'steven.service@finsdc3.demo'
    };

    // -- Content libraries -----------------------------------------------

    private static final List<String> EVENT_SUBJECTS = new List<String>{
        'Portfolio Review',
        'Quarterly Wealth Review',
        'Tax Planning Session',
        'Retirement Planning Workshop',
        'Estate Planning Discussion',
        'Branch Visit: Account Opening',
        'Client Appreciation Lunch',
        'Mortgage Pre-Approval Meeting',
        'Investment Strategy Session',
        'Annual Financial Health Check',
        'New Account Onboarding',
        'College Savings Plan Review',
        'Life Insurance Needs Analysis',
        'Loan Application Review',
        'Wealth Management Strategy',
        'Trust & Estate Consultation',
        'Asset Allocation Review',
        'Risk Tolerance Assessment',
        'Beneficiary Update Meeting',
        'Cross-Sell Opportunity Discussion',
        'Wire Transfer Authorization',
        'IRA Rollover Discussion',
        '401k Plan Review',
        'Small Business Lending Consult',
        'Commercial Banking Review'
    };

    private static final List<String> TASK_SUBJECTS = new List<String>{
        'Follow up on retirement planning email',
        'Send investment proposal',
        'Confirm appointment for Tuesday',
        'Review client portfolio statements',
        'Submit loan documents to underwriting',
        'Send beneficiary update form',
        'Schedule quarterly review call',
        'Prepare wealth management deck',
        'Send CD renewal reminder',
        'Follow up on mortgage application',
        'Review prospect referral',
        'Send tax document checklist',
        'Confirm wire transfer details',
        'Schedule branch visit',
        'Send new account welcome packet',
        'Update client contact preferences',
        'Verify identity documents',
        'Send investment performance report',
        'Schedule estate planning attorney intro',
        'Review credit card cross-sell list'
    };

    private static final List<String> INTERACTION_DESCRIPTIONS = new List<String>{
        'Inbound call regarding account balance and recent transactions',
        'Outbound follow-up on portfolio review action items',
        'Mobile app session: client checked balances and initiated transfer',
        'Web banking session: bill pay and account inquiry',
        'In-person branch visit for cashier check',
        'Video call for quarterly wealth review',
        'Email exchange regarding mortgage rate lock',
        'Inbound call: dispute charge inquiry',
        'Outbound call: new product recommendation',
        'Chat session: account inquiry and authorization',
        'Branch visit: signature update and ID verification',
        'Mobile alert acknowledgment and follow-up',
        'Webinar attendance: Retirement 2026 webinar',
        'Inbound call: card replacement request',
        'Outbound check-in following major life event'
    };

    private static final List<String> INTERACTION_TYPES = new List<String>{
        'Phone', 'Email', 'Meeting', 'Web', 'Mobile', 'Branch'
    };

    // -- Volume targets per B1 ------------------------------------------
    private static final Integer EVENT_COUNT       = 500;
    private static final Integer TASK_COUNT        = 300;
    private static final Integer INTERACTION_COUNT = 200;

    /**
     * @description Public entry point. Submits the generation job and
     *              returns a status string. Suitable for anonymous Apex
     *              or AuraEnabled invocation from an admin LWC.
     */
    @AuraEnabled
    public static String runOnDemand() {
        // Idempotency gate
        Integer existingSeeded = [
            SELECT COUNT() FROM Event WHERE IsSeededEngagement__c = TRUE
        ];
        if (existingSeeded > 0) {
            return 'SKIPPED: ' + existingSeeded + ' seeded Events already exist. '
                 + 'Re-runs are no-ops. Use FscEngagementShifter for monthly refresh.';
        }

        List<Id> ownerIds = resolveOwners();
        if (ownerIds.isEmpty()) {
            return 'ERROR: no rotation owners found. Verify the 7 demo personas exist in the org.';
        }

        List<Id> personIds  = resolvePersonAccountIds();
        List<Id> contactIds = resolvePersonContactIds();
        if (personIds.isEmpty() || contactIds.isEmpty()) {
            return 'ERROR: no Person Accounts / PersonContactIds found to link engagement records to.';
        }

        Integer generated = generateAll(ownerIds, personIds, contactIds);
        return 'OK: generated ' + generated + ' engagement records ('
             + EVENT_COUNT + ' Events + ' + TASK_COUNT + ' Tasks + '
             + INTERACTION_COUNT + ' Interactions + '
             + INTERACTION_COUNT + ' InteractionSummary stubs).';
    }

    // -- Generation orchestrator ---------------------------------------

    @TestVisible
    private static Integer generateAll(List<Id> ownerIds, List<Id> personIds, List<Id> contactIds) {
        Integer total = 0;
        total += generateEvents(ownerIds, personIds);
        total += generateTasks(ownerIds, contactIds);
        Map<Id, Id> interactionToSummary = generateInteractions(ownerIds);
        total += interactionToSummary.size();
        total += generateInteractionSummaries(interactionToSummary, personIds, contactIds, ownerIds);
        return total;
    }

    // -- Step 1: Events --------------------------------------------------

    @TestVisible
    private static Integer generateEvents(List<Id> ownerIds, List<Id> personIds) {
        List<Event> rows = new List<Event>();
        for (Integer i = 0; i < EVENT_COUNT; i++) {
            Date d = pickWeightedDate(i);
            String subject = EVENT_SUBJECTS[Math.mod(i, EVENT_SUBJECTS.size())];
            Id ownerId  = ownerIds[Math.mod(i, ownerIds.size())];
            Id whatId   = personIds[Math.mod(i, personIds.size())];
            rows.add(new Event(
                Subject              = subject,
                ActivityDate         = d,
                ActivityDateTime     = Datetime.newInstance(d, Time.newInstance(9, 0, 0, 0)),
                DurationInMinutes    = 30 + Math.mod(i, 4) * 15,
                OwnerId              = ownerId,
                WhatId               = whatId,
                IsSeededEngagement__c = true
            ));
        }
        Database.SaveResult[] results = Database.insert(rows, false);
        return countOk(results, 'Event');
    }

    // -- Step 2: Tasks ---------------------------------------------------

    @TestVisible
    private static Integer generateTasks(List<Id> ownerIds, List<Id> contactIds) {
        List<Task> rows = new List<Task>();
        for (Integer i = 0; i < TASK_COUNT; i++) {
            Date d = pickWeightedDate(i + EVENT_COUNT);
            String subject = TASK_SUBJECTS[Math.mod(i, TASK_SUBJECTS.size())];
            Id ownerId  = ownerIds[Math.mod(i, ownerIds.size())];
            Id whoId    = contactIds[Math.mod(i, contactIds.size())];
            rows.add(new Task(
                Subject              = subject,
                ActivityDate         = d,
                Status               = (Math.mod(i, 3) == 0 ? 'Completed' : 'In Progress'),
                Priority             = (Math.mod(i, 5) == 0 ? 'High' : 'Normal'),
                OwnerId              = ownerId,
                WhoId                = whoId,
                IsSeededEngagement__c = true
            ));
        }
        Database.SaveResult[] results = Database.insert(rows, false);
        return countOk(results, 'Task');
    }

    // -- Step 3: Interactions -----------------------------------------

    @TestVisible
    private static Map<Id, Id> generateInteractions(List<Id> ownerIds) {
        List<Interaction> rows = new List<Interaction>();
        for (Integer i = 0; i < INTERACTION_COUNT; i++) {
            Date d = pickWeightedDate(i + EVENT_COUNT + TASK_COUNT);
            Datetime startDt = Datetime.newInstance(d, Time.newInstance(10 + Math.mod(i, 7), 0, 0, 0));
            Datetime endDt   = startDt.addMinutes(15 + Math.mod(i, 4) * 15);
            String channelType = INTERACTION_TYPES[Math.mod(i, INTERACTION_TYPES.size())];
            String summary = INTERACTION_DESCRIPTIONS[Math.mod(i, INTERACTION_DESCRIPTIONS.size())];
            Id ownerId = ownerIds[Math.mod(i, ownerIds.size())];
            rows.add(new Interaction(
                Name                 = channelType + ' - ' + d.format(),
                StartTime            = startDt,
                EndTime               = endDt,
                InteractionType       = channelType,
                Description           = summary,
                OwnerId               = ownerId,
                IsSeededEngagement__c = true
            ));
        }
        Database.SaveResult[] results = Database.insert(rows, false);
        Map<Id, Id> interactionIds = new Map<Id, Id>();
        for (Integer i = 0; i < results.size(); i++) {
            if (results[i].isSuccess()) {
                interactionIds.put(results[i].getId(), results[i].getId());
            } else {
                System.debug(LoggingLevel.ERROR,
                    'Interaction insert failed: ' + results[i].getErrors()[0].getMessage());
            }
        }
        return interactionIds;
    }

    // -- Step 4: InteractionSummary stubs -----------------------------

    @TestVisible
    private static Integer generateInteractionSummaries(
        Map<Id, Id> interactionIds,
        List<Id> personIds,
        List<Id> contactIds,
        List<Id> ownerIds
    ) {
        List<InteractionSummary> rows = new List<InteractionSummary>();
        Integer i = 0;
        for (Id interactionId : interactionIds.keySet()) {
            String subj = EVENT_SUBJECTS[Math.mod(i, EVENT_SUBJECTS.size())] + ' summary';
            Id ownerId = ownerIds[Math.mod(i, ownerIds.size())];
            rows.add(new InteractionSummary(
                Name                 = subj,
                InteractionId        = interactionId,
                OwnerId              = ownerId,
                IsSeededEngagement__c = true
            ));
            i++;
        }
        Database.SaveResult[] results = Database.insert(rows, false);
        return countOk(results, 'InteractionSummary');
    }

    // -- Helpers -----------------------------------------------------

    /**
     * @description Picks a date in the rolling 90-day window
     *              (60 past, 30 future) with weighted bias:
     *              ~50% within last 14 days, ~30% within 14-30 days,
     *              ~20% in the 30-60 past + future range. The seed
     *              parameter makes the choice deterministic per index.
     */
    @TestVisible
    private static Date pickWeightedDate(Integer seed) {
        Integer bucket = Math.mod(Math.abs(seed * 31 + 17), 100);
        Integer offset;
        if (bucket < 50) {
            // Recent past: -14 to today
            offset = -1 * Math.mod(Math.abs(seed * 7), 14);
        } else if (bucket < 80) {
            // Mid past: -30 to -14
            offset = -14 - Math.mod(Math.abs(seed * 11), 16);
        } else {
            // Tail: -60 to -30 OR future +1 to +30
            if (Math.mod(Math.abs(seed * 13), 2) == 0) {
                offset = -30 - Math.mod(Math.abs(seed * 17), 30);
            } else {
                offset = 1 + Math.mod(Math.abs(seed * 19), 30);
            }
        }
        return Date.today().addDays(offset);
    }

    @TestVisible
    private static List<Id> resolveOwners() {
        List<Id> ids = new List<Id>();
        for (User u : [SELECT Id FROM User WHERE Username IN :OWNER_USERNAMES AND IsActive = TRUE]) {
            ids.add(u.Id);
        }
        return ids;
    }

    @TestVisible
    private static List<Id> resolvePersonAccountIds() {
        List<Id> ids = new List<Id>();
        for (Account a : [SELECT Id FROM Account WHERE IsPersonAccount = TRUE LIMIT 100]) {
            ids.add(a.Id);
        }
        return ids;
    }

    @TestVisible
    private static List<Id> resolvePersonContactIds() {
        List<Id> ids = new List<Id>();
        for (Account a : [
            SELECT PersonContactId FROM Account
            WHERE IsPersonAccount = TRUE AND PersonContactId != NULL
            LIMIT 100
        ]) {
            ids.add(a.PersonContactId);
        }
        return ids;
    }

    @TestVisible
    private static Integer countOk(Database.SaveResult[] results, String label) {
        Integer ok = 0;
        Integer fail = 0;
        for (Database.SaveResult r : results) {
            if (r.isSuccess()) {
                ok++;
            } else {
                fail++;
                if (fail <= 3) {
                    System.debug(LoggingLevel.ERROR,
                        label + ' insert failed: ' + r.getErrors()[0].getMessage());
                }
            }
        }
        if (fail > 0) {
            System.debug(LoggingLevel.WARN,
                label + ' batch: ' + ok + ' ok / ' + fail + ' failed');
        }
        return ok;
    }
}
