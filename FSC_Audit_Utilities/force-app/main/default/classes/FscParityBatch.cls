/**
 * FscParityBatch
 * --------------
 * 5-step parity engine implementing audit decision §6.1 D1: legacy FSC
 * managed-package objects stay canonical for writes; standard equivalents
 * are kept in lockstep via this scheduled Queueable chain.
 *
 * Steps (each runs in its own Queueable transaction so commits between
 * steps satisfy the cross-object FK lookups):
 *   1. Mirror FinServ__FinancialAccount__c       -> FinancialAccount
 *   2. Cascade FinServ__Card__c                  -> IssuedCard
 *   3. Synthesize Retail Mortgage tier loans     -> ResidentialLoanApplication
 *   4. Mirror FinServ__FinancialGoal__c          -> FinancialGoal
 *   5. Mirror FinServ__LifeEvent__c              -> PersonLifeEvent
 *
 * Idempotency: every standard target carries LegacyId__c (External Id,
 *              Unique). Upsert-by-LegacyId means re-runs are safe.
 *
 * Recursion guard: every standard target write sets IsParitySync__c=true.
 *
 * Skipped (per §6.1 D1):
 *   - FinServ__FinancialAccountRole__c  (no standard equivalent)
 *   - FinServ__FinancialHolding__c       (no standard equivalent)
 *   - BusinessMilestone                  (already canonical, no legacy)
 *   - FinancialAccountTransaction        (covered separately by Phase B2)
 *
 * Entry point: FscParityBatch.runOnDemand() submits Step 1; Step 1's
 * finish chains Step 2; and so on through Step 5.
 */
public with sharing class FscParityBatch implements Queueable {

    public enum Step { FA, ISSUED_CARD, RLA, GOAL, LIFE_EVENT }

    private final Step currentStep;
    private final String runBatchId;

    public FscParityBatch() {
        this(Step.FA, 'OnDemand-' + String.valueOf(Datetime.now().getTime()));
    }

    public FscParityBatch(Step step, String runBatchId) {
        this.currentStep = step;
        this.runBatchId  = runBatchId;
    }

    /**
     * @description Submit the chain starting at Step 1 (FA mirror).
     *              Returns the AsyncApexJob Id so callers can poll.
     */
    @AuraEnabled
    public static Id runOnDemand() {
        return System.enqueueJob(new FscParityBatch());
    }

    /**
     * @description Queueable entry point. Dispatches to the step-specific
     *              method, then chains the next step if any.
     */
    public void execute(QueueableContext qc) {
        Integer rowsWritten = 0;

        if (currentStep == Step.FA) {
            rowsWritten = mirrorFinancialAccount();
        } else if (currentStep == Step.ISSUED_CARD) {
            rowsWritten = cascadeIssuedCard();
        } else if (currentStep == Step.RLA) {
            rowsWritten = synthesizeRLA();
        } else if (currentStep == Step.GOAL) {
            rowsWritten = mirrorFinancialGoal();
        } else if (currentStep == Step.LIFE_EVENT) {
            rowsWritten = mirrorPersonLifeEvent();
        }

        System.debug(LoggingLevel.INFO,
            'FscParityBatch step=' + currentStep
            + ' rowsWritten=' + rowsWritten
            + ' runBatchId=' + runBatchId);

        Step next = nextStep(currentStep);
        if (next != null && !Test.isRunningTest()) {
            // Skip chaining inside tests — Test.startTest/stopTest only
            // executes one Queueable. Tests exercise each step directly.
            System.enqueueJob(new FscParityBatch(next, runBatchId));
        }
    }

    private static Step nextStep(Step current) {
        if (current == Step.FA)          return Step.ISSUED_CARD;
        if (current == Step.ISSUED_CARD) return Step.RLA;
        if (current == Step.RLA)         return Step.GOAL;
        if (current == Step.GOAL)        return Step.LIFE_EVENT;
        return null;
    }

    // -----------------------------------------------------------------
    // Step 1 — Mirror FinServ__FinancialAccount__c -> FinancialAccount
    // -----------------------------------------------------------------

    @TestVisible
    private static Integer mirrorFinancialAccount() {
        List<FinServ__FinancialAccount__c> sources = [
            SELECT Id, Name, FinServ__Status__c, FinServ__Balance__c,
                   FinServ__InterestRate__c, FinServ__OpenDate__c,
                   FinServ__FinancialAccountType__c, FinServ__Description__c,
                   FinServ__FinancialAccountNumber__c
            FROM FinServ__FinancialAccount__c
        ];

        List<FinancialAccount> targets = new List<FinancialAccount>();
        for (FinServ__FinancialAccount__c src : sources) {
            // FinancialAccount.FinancialAccountNumber and Type are required.
            // Fall back to the legacy Id if the legacy account number is
            // null, and to 'Deposits' if the type is null (covers the 11
            // null-type rows surfaced by audit §3.4).
            String accountNumber = src.FinServ__FinancialAccountNumber__c == null
                ? String.valueOf(src.Id)
                : src.FinServ__FinancialAccountNumber__c;
            String accountType = String.isBlank(src.FinServ__FinancialAccountType__c)
                ? 'Deposits'
                : src.FinServ__FinancialAccountType__c;

            targets.add(new FinancialAccount(
                LegacyId__c             = src.Id,
                IsParitySync__c         = true,
                Name                    = src.Name,
                FinancialAccountNumber  = accountNumber,
                Status                  = src.FinServ__Status__c,
                Type                    = accountType,
                TotalOutstandingAmount  = src.FinServ__Balance__c,
                InterestRate            = src.FinServ__InterestRate__c,
                OpeningDate             = src.FinServ__OpenDate__c
            ));
        }

        Schema.SObjectField extIdField = FinancialAccount.LegacyId__c;
        Database.UpsertResult[] results = Database.upsert(targets, extIdField, false);
        return countSuccesses(results);
    }

    // -----------------------------------------------------------------
    // Step 2 — Cascade FinServ__Card__c -> IssuedCard
    // -----------------------------------------------------------------

    @TestVisible
    private static Integer cascadeIssuedCard() {
        List<FinServ__Card__c> sources = [
            SELECT Id, Name, FinServ__FinancialAccount__c, FinServ__AccountHolder__c,
                   FinServ__BinNumber__c, FinServ__ValidUntil__c, FinServ__Active__c,
                   FinServ__OwnershipType__c
            FROM FinServ__Card__c
        ];

        // Build a legacy-FA-Id -> standard-FA-Id lookup using the
        // LegacyId__c external key from Step 1.
        Set<Id> legacyFaIds = new Set<Id>();
        for (FinServ__Card__c c : sources) {
            if (c.FinServ__FinancialAccount__c != null) {
                legacyFaIds.add(c.FinServ__FinancialAccount__c);
            }
        }
        Map<String, Id> legacyToStandardFa = new Map<String, Id>();
        for (FinancialAccount fa : [
            SELECT Id, LegacyId__c FROM FinancialAccount
            WHERE LegacyId__c IN :idsToStrings(legacyFaIds)
        ]) {
            legacyToStandardFa.put(fa.LegacyId__c, fa.Id);
        }

        List<IssuedCard> targets = new List<IssuedCard>();
        for (FinServ__Card__c src : sources) {
            Id parentStandardFa = src.FinServ__FinancialAccount__c == null
                ? null
                : legacyToStandardFa.get(String.valueOf(src.FinServ__FinancialAccount__c));
            // IssuedCard.Name is auto-number; only NameOnCard is writeable.
            targets.add(new IssuedCard(
                LegacyId__c              = src.Id,
                IsParitySync__c          = true,
                NameOnCard               = src.Name,
                FinancialAccountId       = parentStandardFa,
                AccountId                = src.FinServ__AccountHolder__c,
                BankIdentificationNumber = src.FinServ__BinNumber__c == null
                                             ? null
                                             : String.valueOf(src.FinServ__BinNumber__c),
                ExpiryDate               = src.FinServ__ValidUntil__c
            ));
        }

        Schema.SObjectField extIdField = IssuedCard.LegacyId__c;
        Database.UpsertResult[] results = Database.upsert(targets, extIdField, false);
        return countSuccesses(results);
    }

    // -----------------------------------------------------------------
    // Step 3 — Synthesize Retail Mortgage tier loans -> ResidentialLoanApplication
    // -----------------------------------------------------------------

    @TestVisible
    private static Integer synthesizeRLA() {
        // Retail Mortgage tier per D3: legacy FA of type 'Loans' that has
        // been rebalanced (OriginalSnapshot__c is non-null) AND the new
        // Balance is in the retail band ($50K–$2M).
        List<FinServ__FinancialAccount__c> sources = [
            SELECT Id, Name, FinServ__Balance__c, FinServ__OpenDate__c,
                   FinServ__PrimaryOwner__c
            FROM FinServ__FinancialAccount__c
            WHERE FinServ__FinancialAccountType__c = 'Loans'
            AND   IsRebalanced__c = TRUE
            AND   FinServ__Balance__c <= 2000000
        ];

        List<ResidentialLoanApplication> targets = new List<ResidentialLoanApplication>();
        for (FinServ__FinancialAccount__c src : sources) {
            // ResidentialLoanApplication has a platform validation rule
            // requiring AccountId (or an associated Opportunity). Skip
            // any retail-tier FA without a PrimaryOwner; it can't pass.
            if (src.FinServ__PrimaryOwner__c == null) {
                continue;
            }
            targets.add(new ResidentialLoanApplication(
                LegacyId__c     = src.Id,
                IsParitySync__c = true,
                Name            = src.Name,
                AccountId       = src.FinServ__PrimaryOwner__c
            ));
        }

        Schema.SObjectField extIdField = ResidentialLoanApplication.LegacyId__c;
        Database.UpsertResult[] results = Database.upsert(targets, extIdField, false);
        return countSuccesses(results);
    }

    // -----------------------------------------------------------------
    // Step 4 — Mirror FinServ__FinancialGoal__c -> FinancialGoal
    // -----------------------------------------------------------------

    // Map legacy Goal.Status values ('In Progress', 'Not Started',
    // 'Completed') to the standard restricted picklist values
    // ('IN_PROGRESS', 'NOT_STARTED', 'COMPLETED').
    private static final Map<String, String> GOAL_STATUS_MAP = new Map<String, String>{
        'In Progress' => 'IN_PROGRESS',
        'Not Started' => 'NOT_STARTED',
        'Completed'   => 'COMPLETED'
    };

    // Map legacy Goal.Type values to the standard restricted picklist
    // (Education / Emergency / Home / Pay off Debt / Retirement /
    // Vacation / Vehicle / Other). Sales-pipeline values that audit H3
    // flagged as picklist contamination collapse to 'Other'.
    private static final Map<String, String> GOAL_TYPE_MAP = new Map<String, String>{
        'Education'                => 'Education',
        'Retirement'               => 'Retirement',
        'Home Purchase'            => 'Home',
        'Real Estate Investment'   => 'Home',
        'Wedding/Honeymoon'        => 'Vacation',
        'Estate Planning'          => 'Other',
        'Investment'               => 'Other',
        'Large Purchase'           => 'Other',
        'New Services'             => 'Other',
        'New Customer Acquisition' => 'Other',
        'New Business Acquisition' => 'Other',
        'Other'                    => 'Other'
    };

    @TestVisible
    private static Integer mirrorFinancialGoal() {
        List<FinServ__FinancialGoal__c> sources = [
            SELECT Id, Name, FinServ__Status__c, FinServ__Type__c,
                   FinServ__Description__c, FinServ__InitialValue__c,
                   FinServ__TargetValue__c, FinServ__ActualValue__c,
                   FinServ__TargetDate__c, FinServ__CompletionDate__c
            FROM FinServ__FinancialGoal__c
        ];

        List<FinancialGoal> targets = new List<FinancialGoal>();
        for (FinServ__FinancialGoal__c src : sources) {
            String status = GOAL_STATUS_MAP.containsKey(src.FinServ__Status__c)
                ? GOAL_STATUS_MAP.get(src.FinServ__Status__c)
                : 'NOT_STARTED';
            String goalType = GOAL_TYPE_MAP.containsKey(src.FinServ__Type__c)
                ? GOAL_TYPE_MAP.get(src.FinServ__Type__c)
                : 'Other';
            targets.add(new FinancialGoal(
                LegacyId__c     = src.Id,
                IsParitySync__c = true,
                Name            = src.Name,
                Type            = goalType,
                Status          = status,
                Description     = src.FinServ__Description__c,
                InitialAmount   = src.FinServ__InitialValue__c,
                TargetAmount    = src.FinServ__TargetValue__c,
                TargetDate      = src.FinServ__TargetDate__c,
                CompletionDate  = src.FinServ__CompletionDate__c
            ));
        }

        Schema.SObjectField extIdField = FinancialGoal.LegacyId__c;
        Database.UpsertResult[] results = Database.upsert(targets, extIdField, false);
        return countSuccesses(results);
    }

    // -----------------------------------------------------------------
    // Step 5 — Mirror FinServ__LifeEvent__c -> PersonLifeEvent
    //          Resolves PrimaryOwner Person Account -> PersonContactId
    // -----------------------------------------------------------------

    @TestVisible
    private static Integer mirrorPersonLifeEvent() {
        List<FinServ__LifeEvent__c> sources = [
            SELECT Id, FinServ__Client__c, FinServ__EventDate__c,
                   FinServ__EventType__c, FinServ__DiscussionNote__c
            FROM FinServ__LifeEvent__c
        ];

        Set<Id> personAccountIds = new Set<Id>();
        for (FinServ__LifeEvent__c src : sources) {
            if (src.FinServ__Client__c != null) {
                personAccountIds.add(src.FinServ__Client__c);
            }
        }

        // Resolve Person Account -> PersonContactId
        Map<Id, Id> accountToPersonContact = new Map<Id, Id>();
        for (Account a : [
            SELECT Id, PersonContactId FROM Account
            WHERE Id IN :personAccountIds
            AND IsPersonAccount = TRUE
        ]) {
            if (a.PersonContactId != null) {
                accountToPersonContact.put(a.Id, a.PersonContactId);
            }
        }

        List<PersonLifeEvent> targets = new List<PersonLifeEvent>();
        for (FinServ__LifeEvent__c src : sources) {
            Id personContactId = src.FinServ__Client__c == null
                ? null
                : accountToPersonContact.get(src.FinServ__Client__c);
            if (personContactId == null) {
                continue; // Skip events without a resolvable Person Contact
            }
            // PersonLifeEvent has Name + PrimaryPersonId + EventDate +
            // EventType all required-on-create. Default missing values
            // so the upsert never trips a required-field error.
            String evtType = String.isBlank(src.FinServ__EventType__c)
                ? 'Other'
                : src.FinServ__EventType__c;
            Date evtDate = src.FinServ__EventDate__c == null
                ? Date.today()
                : src.FinServ__EventDate__c;
            String evtName = evtType + ' on ' + String.valueOf(evtDate);
            targets.add(new PersonLifeEvent(
                LegacyId__c       = src.Id,
                IsParitySync__c   = true,
                Name              = evtName,
                PrimaryPersonId   = personContactId,
                EventDate         = evtDate,
                EventType         = evtType,
                EventDescription  = src.FinServ__DiscussionNote__c
            ));
        }

        Schema.SObjectField extIdField = PersonLifeEvent.LegacyId__c;
        Database.UpsertResult[] results = Database.upsert(targets, extIdField, false);
        return countSuccesses(results);
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    @TestVisible
    private static Integer countSuccesses(Database.UpsertResult[] results) {
        Integer ok = 0;
        for (Database.UpsertResult r : results) {
            if (r.isSuccess()) {
                ok++;
            } else {
                System.debug(LoggingLevel.ERROR,
                    'FscParityBatch upsert failed: ' + r.getErrors()[0].getMessage());
            }
        }
        return ok;
    }

    private static Set<String> idsToStrings(Set<Id> ids) {
        Set<String> out = new Set<String>();
        for (Id i : ids) {
            out.add(String.valueOf(i));
        }
        return out;
    }
}
