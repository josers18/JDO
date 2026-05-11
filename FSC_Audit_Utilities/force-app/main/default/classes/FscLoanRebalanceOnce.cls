/**
 * FscLoanRebalanceOnce
 * --------------------
 * One-time, idempotent Apex utility that resolves audit finding §4.2 H7
 * (101 legacy loan FAs with avg $337M, max $9.7B — data-quality bug from
 * a prior bulk import). Implements decision §6.1 D3.
 *
 * Idempotency:  IsRebalanced__c = FALSE is the queryable eligibility gate.
 *               OriginalSnapshot__c holds the JSON payload of original
 *               values; the boolean is the SOQL-filterable marker because
 *               LongTextArea fields cannot appear in WHERE clauses.
 *
 * Determinism: records are ordered by CreatedDate ASC, Id ASC and
 *              assigned to tiers by index modulo 100, mapped to the
 *              D3 distribution (0-69 retail, 70-94 SMB, 95-99 mid-market).
 *              Within-tier value spread comes from a stable hash of the
 *              record Id, so the same record always lands on the same
 *              new value.
 *
 * Audit trail: every change writes one RebalanceLog__c row capturing
 *              the before/after pair, the assigned tier, the AsyncApexJob
 *              Id of the run, and any notes (skip reasons, warnings).
 *
 * See: audits/fsc-master-org-audit.md §6.1 D3 and Phase A13.
 */
public with sharing class FscLoanRebalanceOnce
    implements Database.Batchable<SObject>, Database.Stateful {

    private static final Set<String> LOAN_TYPES = new Set<String>{
        'Loan', 'Mortgage', 'Line of Credit', 'Auto Loan'
    };

    @TestVisible
    private Integer rebalancedCount = 0;

    @TestVisible
    private Integer skippedCount = 0;

    private String runBatchId;

    /**
     * @description Returns the QueryLocator over loan-type FAs that have
     *              not yet been snapshotted (idempotency gate).
     */
    public Database.QueryLocator start(Database.BatchableContext bc) {
        runBatchId = bc != null ? bc.getJobId() : 'OnDemand-' + String.valueOf(Datetime.now().getTime());
        return Database.getQueryLocator([
            SELECT Id, CreatedDate,
                   FinServ__Balance__c, FinServ__LoanAmount__c,
                   FinServ__FinancialAccountType__c,
                   IsRebalanced__c
            FROM   FinServ__FinancialAccount__c
            WHERE  FinServ__FinancialAccountType__c IN :LOAN_TYPES
            AND    IsRebalanced__c = FALSE
            ORDER BY CreatedDate ASC, Id ASC
        ]);
    }

    /**
     * @description Processes one batch chunk: assigns each FA to a tier,
     *              computes deterministic new balance / loan amount, writes
     *              the snapshot JSON, and queues an audit-log row.
     */
    public void execute(Database.BatchableContext bc, List<SObject> scope) {
        List<FinServ__FinancialAccount__c> faToUpdate = new List<FinServ__FinancialAccount__c>();
        List<RebalanceLog__c> logsToInsert = new List<RebalanceLog__c>();

        Integer index = rebalancedCount + skippedCount;

        for (SObject row : scope) {
            FinServ__FinancialAccount__c fa = (FinServ__FinancialAccount__c) row;
            Tier tier = pickTier(index);
            index++;

            Decimal originalBalance = nz(fa.FinServ__Balance__c);
            Decimal originalLoan    = nz(fa.FinServ__LoanAmount__c);
            Decimal newBalance      = computeAmount(fa.Id, tier);
            Decimal newLoan         = newBalance;

            String snapshotJson = JSON.serialize(new Map<String, Object>{
                'balance'      => originalBalance,
                'loanAmount'   => originalLoan,
                'snapshotAt'   => Datetime.now(),
                'tierAssigned' => tier.label,
                'runBatchId'   => runBatchId
            });

            fa.FinServ__Balance__c     = newBalance;
            fa.FinServ__LoanAmount__c  = newLoan;
            fa.OriginalSnapshot__c     = snapshotJson;
            fa.IsRebalanced__c         = true;
            faToUpdate.add(fa);

            logsToInsert.add(new RebalanceLog__c(
                SourceFA__c           = fa.Id,
                Tier__c               = tier.label,
                OriginalBalance__c    = originalBalance,
                NewBalance__c         = newBalance,
                OriginalLoanAmount__c = originalLoan,
                NewLoanAmount__c      = newLoan,
                RunBatchId__c         = runBatchId,
                Notes__c              = 'Rebalanced by FscLoanRebalanceOnce. FA type: '
                                        + fa.FinServ__FinancialAccountType__c
            ));
            rebalancedCount++;
        }

        Database.SaveResult[] faResults = Database.update(faToUpdate, false);
        for (Integer i = 0; i < faResults.size(); i++) {
            if (!faResults[i].isSuccess()) {
                logsToInsert[i].Notes__c += ' | UPDATE FAILED: '
                    + faResults[i].getErrors()[0].getMessage();
                skippedCount++;
                rebalancedCount--;
            }
        }

        insert logsToInsert;
    }

    /**
     * @description Logs the final tally for the run. Counters are populated
     *              by execute() and read here for the System.debug summary.
     */
    public void finish(Database.BatchableContext bc) {
        System.debug(LoggingLevel.INFO,
            'FscLoanRebalanceOnce complete. Rebalanced=' + rebalancedCount
            + ' Skipped=' + skippedCount + ' RunBatchId=' + runBatchId);
    }

    /**
     * On-demand entry point for demo prep. Submits the batch and returns
     * the AsyncApexJob Id so the caller can poll status.
     */
    @AuraEnabled
    public static Id runOnDemand() {
        return Database.executeBatch(new FscLoanRebalanceOnce(), 200);
    }

    // ---- tier selection -----------------------------------------------

    @TestVisible
    private static Tier pickTier(Integer index) {
        Integer bucket = Math.mod(index, 100);
        if (bucket < 70) {
            return new Tier('Retail Mortgage', 50000, 2000000);
        }
        if (bucket < 95) {
            return new Tier('Small Business', 250000, 5000000);
        }
        return new Tier('Mid-Market Commercial', 5000000, 50000000);
    }

    @TestVisible
    private static Decimal computeAmount(Id recordId, Tier tier) {
        Integer h = Math.abs(String.valueOf(recordId).hashCode());
        Integer rangeSize = (tier.maxAmount - tier.minAmount).intValue();
        Decimal raw = tier.minAmount + Math.mod(h, rangeSize);
        // round to nearest $100 so values look hand-set, not random
        return raw.divide(100, 0, System.RoundingMode.HALF_UP) * 100;
    }

    @TestVisible
    private static Decimal nz(Decimal value) {
        return value == null ? 0 : value;
    }

    @TestVisible
    private class Tier {
        public String label;
        public Decimal minAmount;
        public Decimal maxAmount;

        public Tier(String label, Decimal minAmount, Decimal maxAmount) {
            this.label     = label;
            this.minAmount = minAmount;
            this.maxAmount = maxAmount;
        }
    }
}
