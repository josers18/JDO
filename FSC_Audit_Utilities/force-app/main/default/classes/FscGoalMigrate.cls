/**
 * FscGoalMigrate
 * --------------
 * Phase B13 implementation. After A6c reclassified 175 contaminated
 * legacy Goal records, ~148 ended up bucketed as `Other` because the
 * standard FinancialGoal.Type picklist doesn't have slots for
 * wealth-advisor portfolio goals, commercial-banking objectives, or
 * sales-pipeline targets. This utility migrates those records forward
 * into their architecturally-correct homes WITHOUT touching the
 * source goal records (forward-create only; no deletes).
 *
 * Routing:
 *   - "wealth-advisor portfolio" goals (~80) -> ActionPlan attached
 *     via TargetId to the *standard* FinancialGoal mirror (resolved
 *     by LegacyId__c, populated by FscParityBatch). The
 *     `Financial Goal Funding & Execution` template requires
 *     TargetEntityType=FinancialGoal (standard), not the namespaced
 *     legacy custom object.
 *   - "commercial-banking" goals (~40) -> if PrimaryOwner is a B2B
 *     Account, create a BusinessMilestone on it; otherwise (PA-owned
 *     "commercial" goals — wealth advisor managing a personal portfolio
 *     with commercial language), attach an ActionPlan with TargetId =
 *     PrimaryOwner Account Id, using the `Commercial - Annual Client
 *     Plan` template (TargetEntityType=Account).
 *   - "sales-pipeline" records (~20) -> create an Opportunity with
 *     StageName='Qualification', CloseDate today+90, AccountId = goal
 *     PrimaryOwner.
 *   - "true Other" (no keyword match) -> no-op; stays as Other on
 *     FinancialGoal.
 *
 * Source FinServ__FinancialGoal__c records are NOT modified or deleted.
 * Each migration record carries IsSeededMigration__c=true and
 * OriginalLegacyGoalId__c=<source goal Id> for traceback.
 *
 * Idempotent via: re-runs find target records already exist via the
 * OriginalLegacyGoalId__c External-Id-Unique field, so duplicate insert
 * fails per-record and gets logged but doesn't break the batch.
 */
public with sharing class FscGoalMigrate {

    // ATV Ids resolved 2026-05-12 from the org's installed templates
    private static final Id ATV_FINANCIAL_GOAL    = '0PTam000000VW3oGAG'; // Financial Goal Funding & Execution
    private static final Id ATV_COMMERCIAL_PLAN   = '0PTam000000VW3iGAG'; // Commercial - Annual Client Plan

    // Keyword routing buckets
    private static final List<String> ADVISOR_KEYWORDS = new List<String>{
        'portfolio', 'wealth', 'aum', 'managed', 'advisor', 'rsu', 'broker',
        'maintain', 'preserve', 'allocation', 'estate'
    };
    private static final List<String> COMMERCIAL_KEYWORDS = new List<String>{
        'working capital', 'expansion', 'm&a', 'merger', 'acquisition',
        'transformation', 'esg', 'sustainability', 'product line',
        'operational', 'reserve', 'efficiency', 'digital banking'
    };
    private static final List<String> SALES_KEYWORDS = new List<String>{
        'customer acquisition', 'business acquisition', 'revenue diversification',
        'pipeline', 'cross-sell', 'new customer', 'new business'
    };

    @AuraEnabled
    public static String runOnDemand() {
        // Find all goals classified as 'Other' on the legacy object
        List<FinServ__FinancialGoal__c> sources = [
            SELECT Id, Name, FinServ__Description__c, FinServ__PrimaryOwner__c,
                   FinServ__PrimaryOwner__r.IsPersonAccount,
                   FinServ__TargetValue__c, FinServ__TargetDate__c
            FROM FinServ__FinancialGoal__c
            WHERE FinServ__Type__c = 'Other'
        ];
        if (sources.isEmpty()) {
            return 'SKIPPED: 0 Other-classified goals to migrate.';
        }

        // Resolve standard FinancialGoal mirror Ids (parity-maintained by FscParityBatch
        // via LegacyId__c). Advisor-bucket ActionPlans must target standard FinancialGoal,
        // not the legacy custom object — the template version's TargetEntityType is
        // 'FinancialGoal' and rejects FinServ__FinancialGoal__c.
        Set<Id> legacyGoalIds = new Set<Id>();
        for (FinServ__FinancialGoal__c g : sources) {
            legacyGoalIds.add(g.Id);
        }
        Map<Id, Id> legacyToStandardGoal = new Map<Id, Id>();
        for (FinancialGoal sg : [
            SELECT Id, LegacyId__c
            FROM FinancialGoal
            WHERE LegacyId__c IN :legacyGoalIds
        ]) {
            if (sg.LegacyId__c != null) {
                legacyToStandardGoal.put((Id) sg.LegacyId__c, sg.Id);
            }
        }

        // Pre-load already-migrated source goal Ids so re-runs skip them rather than
        // hitting per-record unique-key insert failures (idempotency).
        Set<String> alreadyMigrated = new Set<String>();
        for (ActionPlan ap : [
            SELECT OriginalLegacyGoalId__c FROM ActionPlan
            WHERE OriginalLegacyGoalId__c != null
        ]) {
            alreadyMigrated.add(ap.OriginalLegacyGoalId__c);
        }
        for (BusinessMilestone bm : [
            SELECT OriginalLegacyGoalId__c FROM BusinessMilestone
            WHERE OriginalLegacyGoalId__c != null
        ]) {
            alreadyMigrated.add(bm.OriginalLegacyGoalId__c);
        }
        for (Opportunity op : [
            SELECT OriginalLegacyGoalId__c FROM Opportunity
            WHERE OriginalLegacyGoalId__c != null
        ]) {
            alreadyMigrated.add(op.OriginalLegacyGoalId__c);
        }

        List<ActionPlan> actionPlans = new List<ActionPlan>();
        List<BusinessMilestone> milestones = new List<BusinessMilestone>();
        List<Opportunity> opportunities = new List<Opportunity>();
        Integer trueOther = 0;
        Integer skippedNoMirror = 0;
        Integer skippedAlreadyMigrated = 0;

        Date today = Date.today();

        for (FinServ__FinancialGoal__c g : sources) {
            if (alreadyMigrated.contains(String.valueOf(g.Id))) {
                skippedAlreadyMigrated++;
                continue;
            }
            String text = ((g.Name == null ? '' : g.Name) + ' '
                         + (g.FinServ__Description__c == null ? '' : g.FinServ__Description__c))
                         .toLowerCase();
            String bucket = classify(text);

            if (bucket == 'advisor') {
                Id standardGoalId = legacyToStandardGoal.get(g.Id);
                if (standardGoalId == null) {
                    skippedNoMirror++;
                    continue;
                }
                actionPlans.add(buildActionPlan(g, ATV_FINANCIAL_GOAL, 'Industries', standardGoalId));
            } else if (bucket == 'commercial') {
                if (g.FinServ__PrimaryOwner__c != null && g.FinServ__PrimaryOwner__r != null
                        && !g.FinServ__PrimaryOwner__r.IsPersonAccount) {
                    milestones.add(buildBusinessMilestone(g, today));
                } else if (g.FinServ__PrimaryOwner__c != null) {
                    // Commercial template targets Account, so use the PrimaryOwner directly.
                    actionPlans.add(buildActionPlan(g, ATV_COMMERCIAL_PLAN, 'Industries', g.FinServ__PrimaryOwner__c));
                } else {
                    trueOther++;
                }
            } else if (bucket == 'sales') {
                if (g.FinServ__PrimaryOwner__c != null) {
                    opportunities.add(buildOpportunity(g, today));
                } else {
                    trueOther++;
                }
            } else {
                trueOther++;
            }
        }

        // BusinessMilestone and Opportunity inserts are cheap; do them in one shot.
        Database.SaveResult[] bmResults = milestones.isEmpty() ? new Database.SaveResult[]{} : Database.insert(milestones, false);
        Database.SaveResult[] opResults = opportunities.isEmpty() ? new Database.SaveResult[]{} : Database.insert(opportunities, false);

        // ActionPlan inserts instantiate the full template hierarchy (steps, assignments)
        // and are CPU-heavy. Chunk and bail before hitting the sync CPU limit so that
        // subsequent runs resume from where this one stopped (idempotency via the
        // already-migrated set above).
        Integer apOk = 0;
        Integer apChunk = 10;
        Integer cpuLimit = Limits.getLimitCpuTime();
        Integer cpuSafetyFloor = (Integer) (cpuLimit * 0.85);
        Integer apProcessed = 0;
        for (Integer i = 0; i < actionPlans.size(); i += apChunk) {
            if (Limits.getCpuTime() > cpuSafetyFloor) {
                System.debug(LoggingLevel.WARN,
                    'ActionPlan: CPU safety floor reached at ' + Limits.getCpuTime()
                    + 'ms; stopping after ' + apProcessed + ' of ' + actionPlans.size()
                    + '. Re-run to continue.');
                break;
            }
            Integer endIdx = Math.min(i + apChunk, actionPlans.size());
            List<ActionPlan> slice = new List<ActionPlan>();
            for (Integer j = i; j < endIdx; j++) {
                slice.add(actionPlans[j]);
            }
            Database.SaveResult[] sliceRes = Database.insert(slice, false);
            apOk += countOk(sliceRes, 'ActionPlan');
            apProcessed += slice.size();
        }

        Integer bmOk = countOk(bmResults, 'BusinessMilestone');
        Integer opOk = countOk(opResults, 'Opportunity');

        return 'OK: source ' + sources.size() + ' goals -> '
             + apOk + ' ActionPlans + '
             + bmOk + ' BusinessMilestones + '
             + opOk + ' Opportunities created. '
             + trueOther + ' stayed as true-Other goals (no keyword match or owner missing). '
             + skippedNoMirror + ' advisor goals skipped (no standard FinancialGoal mirror). '
             + skippedAlreadyMigrated + ' skipped (already migrated on prior run).';
    }

    @TestVisible
    private static String classify(String text) {
        for (String k : ADVISOR_KEYWORDS) {
            if (text.contains(k)) return 'advisor';
        }
        for (String k : COMMERCIAL_KEYWORDS) {
            if (text.contains(k)) return 'commercial';
        }
        for (String k : SALES_KEYWORDS) {
            if (text.contains(k)) return 'sales';
        }
        return 'other';
    }

    @TestVisible
    private static ActionPlan buildActionPlan(FinServ__FinancialGoal__c g, Id atvId, String planType, Id targetId) {
        return new ActionPlan(
            Name                          = g.Name,
            ActionPlanTemplateVersionId   = atvId,
            ActionPlanType                = planType,
            StartDate                     = Date.today(),
            TargetId                      = targetId,
            IsSeededMigration__c          = true,
            OriginalLegacyGoalId__c       = String.valueOf(g.Id)
        );
    }

    @TestVisible
    private static BusinessMilestone buildBusinessMilestone(FinServ__FinancialGoal__c g, Date today) {
        return new BusinessMilestone(
            Name                          = g.Name,
            PrimaryAccountId              = g.FinServ__PrimaryOwner__c,
            MilestoneDate                 = Datetime.newInstance(today, Time.newInstance(0,0,0,0)),
            MilestoneType                 = 'Expansion',
            MilestoneDescription          = g.FinServ__Description__c,
            IsSeededMigration__c          = true,
            OriginalLegacyGoalId__c       = String.valueOf(g.Id)
        );
    }

    @TestVisible
    private static Opportunity buildOpportunity(FinServ__FinancialGoal__c g, Date today) {
        Decimal amount = g.FinServ__TargetValue__c == null ? 50000 : g.FinServ__TargetValue__c;
        return new Opportunity(
            Name                          = g.Name,
            AccountId                     = g.FinServ__PrimaryOwner__c,
            StageName                     = 'Qualification',
            CloseDate                     = today.addDays(90),
            Amount                        = amount,
            Description                   = g.FinServ__Description__c,
            IsSeededMigration__c          = true,
            OriginalLegacyGoalId__c       = String.valueOf(g.Id)
        );
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
            System.debug(LoggingLevel.WARN, label + ': ' + ok + ' ok / ' + fail + ' failed');
        }
        return ok;
    }
}
