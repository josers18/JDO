/**
 * FscIsEnrichAndExpand
 * --------------------
 * Phase B5 implementation per audit decision §6.1 D4. Builds on B1's
 * 200 InteractionSummary stubs and adds another 300 fresh records to
 * land at the D4-target of ~300 advisor-authored InteractionSummaries
 * — ending up at 500 "fresh activity layer" records on top of the
 * historical 1,065.
 *
 * Two operations:
 *   - enrichExistingStubs(): backfill the 200 B1 IS stubs with
 *     AccountId (round-robin across 54 Person Accounts), realistic
 *     MeetingNotes / NextSteps content, Status, InteractionPurpose,
 *     and canonical "Summary: [Channel] - [Account]" naming.
 *   - expandWithFresh(): generate 300 net-new InteractionSummaries
 *     each with a fresh parent Interaction. Owner rotation reuses
 *     B1's 7-persona spread.
 *
 * Idempotency:
 *   - enrichExistingStubs uses MeetingNotes IS NULL as the gate; once
 *     enriched, re-runs find no targets.
 *   - expandWithFresh uses a target-count gate: if count of seeded IS
 *     >= 500, no new records are generated.
 *
 * Closes audit finding §4.1 C2 by adding diverse-author records that
 * dominate the recent-activity surface; the historical 1,065 stay
 * untouched per D4.
 */
public with sharing class FscIsEnrichAndExpand {

    private static final Integer EXPAND_TARGET = 300;
    private static final Integer TOTAL_TARGET  = 500; // 200 enriched + 300 fresh

    // Owner rotation pool — same 7 personas as FscEngagementSeed (B1)
    private static final List<String> OWNER_USERNAMES = new List<String>{
        'bill.south@finsdc3.demo',
        'cindy.central@finsdc3.demo',
        'ely.east@finsdc3.demo',
        'valerie.east@finsdc3.demo',
        'vanessa.central@finsdc3.demo',
        'brenda.service@finsdc3.demo',
        'steven.service@finsdc3.demo'
    };

    // Existing in-org InteractionPurpose values (from B5 investigation)
    private static final List<String> PURPOSES = new List<String>{
        'Quarterly Check-In', 'Deal Execution', 'Meet and Greet',
        'Annual Review', 'Service Request', 'Insurance Discussion',
        'Complaint Resolution', 'Loan Application', 'Financial Planning',
        'Product Inquiry'
    };

    // Realistic note libraries keyed by interaction purpose
    private static final Map<String, List<String>> NOTES_BY_PURPOSE = new Map<String, List<String>>{
        'Quarterly Check-In' => new List<String>{
            'Reviewed portfolio performance YTD. Allocations remain on track. Client expressed confidence in current strategy.',
            'Discussed market volatility and impact on holdings. Reaffirmed long-term plan and risk tolerance.',
            'Walked through quarterly statement. Client had minor questions about new fee structure; clarified.'
        },
        'Annual Review' => new List<String>{
            'Comprehensive annual review covering goals, retirement timeline, and risk profile. No major changes recommended.',
            'Reviewed all accounts and beneficiary designations. Updated emergency contact information.',
            'Annual planning session. Adjusted retirement date and updated savings target.'
        },
        'Deal Execution' => new List<String>{
            'Executed mortgage refinance closing. Documents signed; funds disbursed within 24 hours.',
            'Completed CD ladder restructuring. New ladder maturities span 6-month to 5-year horizons.',
            'Closed line of credit application. Funds available within 3 business days.'
        },
        'Loan Application' => new List<String>{
            'Discussed home equity line of credit options. Pre-qualified for $250K. Sending application package.',
            'Reviewed auto loan rates. Client comparing offers. Will follow up next week.',
            'Took preliminary mortgage application. Pending appraisal and underwriting review.'
        },
        'Financial Planning' => new List<String>{
            'Built initial financial plan. Identified gaps in disability coverage and college savings strategy.',
            'Updated plan with new income projections. Education funding shortfall narrowed.',
            'Estate planning consultation. Will coordinate with attorney and accountant on trust structure.'
        },
        'Insurance Discussion' => new List<String>{
            'Reviewed life and disability coverage. Identified gap in long-term disability protection.',
            'Discussed umbrella liability policy. Sending coverage analysis next week.',
            'Annual policy review. Client opted to increase term life coverage by $500K.'
        },
        'Service Request' => new List<String>{
            'Resolved card replacement request. New card mailed; expected delivery 5-7 business days.',
            'Updated address of record. Confirmed all account holders notified of change.',
            'Processed wire transfer authorization. Confirmed fees and exchange rates.'
        },
        'Complaint Resolution' => new List<String>{
            'Resolved fee dispute. Reversed $35 overdraft fee as one-time courtesy.',
            'Investigated unauthorized transaction claim. Card replaced; new account number issued.',
            'Addressed concerns about online banking outage. Provided account credit and apology.'
        },
        'Product Inquiry' => new List<String>{
            'Walked through high-yield savings options. Client interested in money market for short-term cash.',
            'Discussed commercial banking products for business expansion. Sending term sheets for review.',
            'Compared CD vs Treasury bill yields. Client to decide after consulting with spouse.'
        },
        'Meet and Greet' => new List<String>{
            'Initial meeting with new prospect referred by existing client. Discussed wealth management services.',
            'Welcomed new account holder. Walked through online banking setup and contact preferences.',
            'Met with prospective business banking client. Discussed commercial lending capabilities.'
        }
    };

    private static final List<String> NEXT_STEPS_LIBRARY = new List<String>{
        'Send follow-up email with proposal materials within 48 hours.',
        'Schedule next quarterly review for early next quarter.',
        'Send updated financial plan and meeting notes to client.',
        'Loop in legal team for trust structure review.',
        'Confirm next meeting date with client and add to calendar.',
        'Prepare quarterly review deck and email to client.',
        'Coordinate with operations to process account changes.',
        'Send thank-you note and follow up in 2 weeks.',
        'Update CRM with new contact preferences and communication schedule.',
        'Prepare annual review summary and mail to client.'
    };

    private static final List<String> CHANNELS = new List<String>{
        'Phone Call', 'Video Conference', 'Branch Visit', 'In-Person Meeting',
        'Email Thread', 'Web Chat'
    };

    /**
     * @description Run both enrichment and expansion in one shot.
     */
    @AuraEnabled
    public static String runOnDemand() {
        String enrichResult = enrichExistingStubs();
        String expandResult = expandWithFresh();
        return enrichResult + ' | ' + expandResult;
    }

    // -- Step 1: enrich the 200 B1 stubs -----------------------------

    @TestVisible
    public static String enrichExistingStubs() {
        // Find seeded IS that haven't been enriched yet (no AccountId).
        // MeetingNotes is a LongTextArea and can't be used as a filter,
        // so we use AccountId as the idempotency gate — equally null
        // on B1 stubs and equally populated by enrichment.
        List<InteractionSummary> stubs = [
            SELECT Id, Name, OwnerId
            FROM InteractionSummary
            WHERE IsSeededEngagement__c = TRUE
            AND   AccountId = NULL
            LIMIT 500
        ];
        if (stubs.isEmpty()) {
            return 'enrich: 0 stubs to enrich (already enriched or none exist).';
        }

        Map<Id, Account> personAccounts = loadPersonAccounts();
        if (personAccounts.isEmpty()) {
            return 'enrich: ERROR no Person Accounts found to link IS to.';
        }
        List<Id> paIds = new List<Id>(personAccounts.keySet());

        List<InteractionSummary> updates = new List<InteractionSummary>();
        for (Integer i = 0; i < stubs.size(); i++) {
            InteractionSummary src = stubs[i];
            String purpose = PURPOSES[Math.mod(i, PURPOSES.size())];
            String channel = CHANNELS[Math.mod(i, CHANNELS.size())];
            Id accountId = paIds[Math.mod(i, paIds.size())];
            Account acct = personAccounts.get(accountId);
            String acctLast = (acct == null || acct.LastName == null) ? 'Customer' : acct.LastName;
            updates.add(new InteractionSummary(
                Id                  = src.Id,
                Name                = 'Summary: ' + channel + ' - ' + acctLast,
                AccountId           = accountId,
                MeetingNotes        = pickNote(purpose, i),
                NextSteps           = NEXT_STEPS_LIBRARY[Math.mod(i, NEXT_STEPS_LIBRARY.size())],
                Status              = pickStatus(i),
                InteractionPurpose  = purpose
            ));
        }
        Database.SaveResult[] results = Database.update(updates, false);
        return 'enrich: ' + countOk(results, 'IS-update') + ' / ' + updates.size() + ' enriched.';
    }

    // -- Step 2: generate 300 net-new IS with fresh parent Interactions

    @TestVisible
    public static String expandWithFresh() {
        Integer existingSeeded = [
            SELECT COUNT() FROM InteractionSummary WHERE IsSeededEngagement__c = TRUE
        ];
        if (existingSeeded >= TOTAL_TARGET) {
            return 'expand: SKIPPED (' + existingSeeded + ' seeded IS already exist; target ' + TOTAL_TARGET + ').';
        }

        List<Id> ownerIds = loadOwners();
        if (ownerIds.isEmpty()) {
            return 'expand: ERROR no owner rotation users found.';
        }
        Map<Id, Account> personAccounts = loadPersonAccounts();
        List<Id> paIds = new List<Id>(personAccounts.keySet());
        if (paIds.isEmpty()) {
            return 'expand: ERROR no Person Accounts found.';
        }

        // Step A: insert parent Interactions
        List<Interaction> interactions = new List<Interaction>();
        for (Integer i = 0; i < EXPAND_TARGET; i++) {
            Date d = pickDate(i);
            Datetime startDt = Datetime.newInstance(d, Time.newInstance(10 + Math.mod(i, 7), 0, 0, 0));
            Datetime endDt = startDt.addMinutes(30 + Math.mod(i, 4) * 15);
            String channel = CHANNELS[Math.mod(i, CHANNELS.size())];
            interactions.add(new Interaction(
                Name                  = channel + ' - ' + d.format(),
                StartTime             = startDt,
                EndTime               = endDt,
                InteractionType       = mapChannelToInteractionType(channel),
                Description           = 'Engagement #' + i + ' generated by FscIsEnrichAndExpand.',
                OwnerId               = ownerIds[Math.mod(i, ownerIds.size())],
                IsSeededEngagement__c = true
            ));
        }
        insert interactions;

        // Step B: insert child InteractionSummary with rich content
        List<InteractionSummary> summaries = new List<InteractionSummary>();
        for (Integer i = 0; i < interactions.size(); i++) {
            String purpose = PURPOSES[Math.mod(i, PURPOSES.size())];
            String channel = CHANNELS[Math.mod(i, CHANNELS.size())];
            Id accountId = paIds[Math.mod(i, paIds.size())];
            Account acct = personAccounts.get(accountId);
            String acctLast = (acct == null || acct.LastName == null) ? 'Customer' : acct.LastName;
            summaries.add(new InteractionSummary(
                Name                  = 'Summary: ' + channel + ' - ' + acctLast,
                InteractionId         = interactions[i].Id,
                AccountId             = accountId,
                OwnerId               = ownerIds[Math.mod(i, ownerIds.size())],
                MeetingNotes          = pickNote(purpose, i),
                NextSteps             = NEXT_STEPS_LIBRARY[Math.mod(i, NEXT_STEPS_LIBRARY.size())],
                Status                = pickStatus(i),
                InteractionPurpose    = purpose,
                IsSeededEngagement__c = true
            ));
        }
        Database.SaveResult[] results = Database.insert(summaries, false);
        return 'expand: ' + countOk(results, 'IS-insert') + ' new IS created (with '
             + interactions.size() + ' parent Interactions).';
    }

    // -- helpers ----------------------------------------------------

    @TestVisible
    private static Map<Id, Account> loadPersonAccounts() {
        Map<Id, Account> result = new Map<Id, Account>();
        for (Account a : [
            SELECT Id, FirstName, LastName, PersonContactId
            FROM Account
            WHERE IsPersonAccount = TRUE AND LastName != NULL
            ORDER BY Id
        ]) {
            result.put(a.Id, a);
        }
        return result;
    }

    @TestVisible
    private static List<Id> loadOwners() {
        List<Id> ids = new List<Id>();
        for (User u : [SELECT Id FROM User WHERE Username IN :OWNER_USERNAMES AND IsActive = TRUE]) {
            ids.add(u.Id);
        }
        return ids;
    }

    @TestVisible
    private static String pickNote(String purpose, Integer seed) {
        List<String> pool = NOTES_BY_PURPOSE.get(purpose);
        if (pool == null || pool.isEmpty()) {
            // Fallback to generic Quarterly Check-In notes
            pool = NOTES_BY_PURPOSE.get('Quarterly Check-In');
        }
        return pool[Math.mod(Math.abs(seed * 7), pool.size())];
    }

    @TestVisible
    private static String pickStatus(Integer seed) {
        // Match historical distribution: ~58% Published, ~36% Complete,
        // ~6% Pending, ~0% Draft.
        Integer bucket = Math.mod(Math.abs(seed * 13 + 5), 100);
        if (bucket < 58) return 'Published';
        if (bucket < 94) return 'Complete';
        return 'Pending';
    }

    @TestVisible
    private static Date pickDate(Integer seed) {
        // Match B1's recent-bias date picker: ~50% last 14 days,
        // ~30% 14-30 days past, ~20% in the 30-60-past or 1-30-future range.
        Integer bucket = Math.mod(Math.abs(seed * 31 + 17), 100);
        Integer offset;
        if (bucket < 50) {
            offset = -1 * Math.mod(Math.abs(seed * 7), 14);
        } else if (bucket < 80) {
            offset = -14 - Math.mod(Math.abs(seed * 11), 16);
        } else {
            if (Math.mod(Math.abs(seed * 13), 2) == 0) {
                offset = -30 - Math.mod(Math.abs(seed * 17), 30);
            } else {
                offset = 1 + Math.mod(Math.abs(seed * 19), 30);
            }
        }
        return Date.today().addDays(offset);
    }

    @TestVisible
    private static String mapChannelToInteractionType(String channel) {
        if (channel == 'Phone Call')        return 'Phone';
        if (channel == 'Video Conference')  return 'Video';
        if (channel == 'Branch Visit')      return 'Branch';
        if (channel == 'In-Person Meeting') return 'Meeting';
        if (channel == 'Email Thread')      return 'Email';
        if (channel == 'Web Chat')          return 'Web';
        return 'Phone';
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
                        label + ' failed: ' + r.getErrors()[0].getMessage());
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
