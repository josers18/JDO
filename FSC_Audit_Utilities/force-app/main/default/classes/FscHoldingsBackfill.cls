/**
 * FscHoldingsBackfill
 * -------------------
 * Phase B3 implementation. Resolves audit finding §4.1 C5 — 35 of 110
 * Investment FAs (32%) have zero holdings, so investment-account
 * drilldowns show empty position lists.
 *
 * For each empty Investment FA, generates 8-12 holdings drawn from the
 * existing 28-security catalog (FinServ__Securities__c), weighted by
 * asset class to a classic 60/40-ish wealth-advisor allocation:
 *   - 65% Equities (US + international)
 *   - 25% Fixed Income (bonds, munis)
 *   -  5% Cash Equivalents (money market)
 *   -  5% Alternative Investments (gold, REITs)
 *
 * Each holding has coherent math:
 *   Shares × Price = MarketValue
 *   PurchasePrice = MarketValue × (1 ± random 25%) biased so ~60% gains
 *   GainLoss = MarketValue − PurchasePrice
 *   PercentChange = GainLoss / PurchasePrice
 *
 * Owner / Household flow through from the parent FA so dashboards roll up.
 *
 * Idempotency: gated by IsSeededHolding__c. Re-runs find no eligible
 * Investment FAs (every previously-empty FA now has holdings) and skip.
 *
 * Companion to FscEngagementSeed (B1) and FscLoanRebalanceOnce (A13).
 * Closes audit finding §4.1 C5.
 */
public with sharing class FscHoldingsBackfill {

    private static final Integer HOLDINGS_MIN = 8;
    private static final Integer HOLDINGS_MAX = 12;

    // Target asset-class allocation (rough). When picking N holdings,
    // ~65% should be Equities, ~25% Fixed Income, ~5% each Cash/Alt.
    private static final Map<String, Integer> ALLOCATION_WEIGHTS = new Map<String, Integer>{
        'Equities'                => 65,
        'Fixed Income'            => 25,
        'Cash Equivalents'        => 5,
        'Alternative Investments' => 5
    };

    /**
     * @description Public entry. Returns a one-line status string.
     */
    @AuraEnabled
    public static String runOnDemand() {
        // Idempotency: count eligible empty Investment FAs.
        Integer emptyCount = [
            SELECT COUNT() FROM FinServ__FinancialAccount__c
            WHERE FinServ__FinancialAccountType__c = 'Investments'
            AND   Id NOT IN (SELECT FinServ__FinancialAccount__c FROM FinServ__FinancialHolding__c)
        ];
        if (emptyCount == 0) {
            return 'SKIPPED: 0 Investment FAs without holdings. Re-runs are no-ops.';
        }

        // Pull empty Investment FAs with owner / household for flow-through.
        List<FinServ__FinancialAccount__c> emptyFAs = [
            SELECT Id, FinServ__PrimaryOwner__c, FinServ__Household__c
            FROM FinServ__FinancialAccount__c
            WHERE FinServ__FinancialAccountType__c = 'Investments'
            AND   Id NOT IN (SELECT FinServ__FinancialAccount__c FROM FinServ__FinancialHolding__c)
        ];

        // Group catalog by asset class for weighted picking.
        Map<String, List<FinServ__Securities__c>> catalogByClass = loadCatalog();
        if (catalogByClass.isEmpty()) {
            return 'ERROR: securities catalog is empty (FinServ__Securities__c has 0 records).';
        }

        List<FinServ__FinancialHolding__c> toInsert = new List<FinServ__FinancialHolding__c>();
        for (FinServ__FinancialAccount__c fa : emptyFAs) {
            toInsert.addAll(buildHoldingsForFA(fa, catalogByClass));
        }

        Database.SaveResult[] results = Database.insert(toInsert, false);
        Integer ok = countSuccesses(results);
        return 'OK: created ' + ok + ' holdings across ' + emptyFAs.size()
             + ' previously-empty Investment FAs ('
             + (emptyFAs.size() == 0 ? 0 : (ok / emptyFAs.size())) + ' avg per FA).';
    }

    // ---- helpers -------------------------------------------------

    @TestVisible
    private static Map<String, List<FinServ__Securities__c>> loadCatalog() {
        Map<String, List<FinServ__Securities__c>> byClass = new Map<String, List<FinServ__Securities__c>>();
        for (FinServ__Securities__c s : [
            SELECT Id, Name, FinServ__AssetClass__c, FinServ__Price__c
            FROM FinServ__Securities__c
            WHERE FinServ__Price__c != NULL
        ]) {
            String cls = s.FinServ__AssetClass__c == null ? 'Equities' : s.FinServ__AssetClass__c;
            if (!byClass.containsKey(cls)) {
                byClass.put(cls, new List<FinServ__Securities__c>());
            }
            byClass.get(cls).add(s);
        }
        return byClass;
    }

    @TestVisible
    private static List<FinServ__FinancialHolding__c> buildHoldingsForFA(
        FinServ__FinancialAccount__c fa,
        Map<String, List<FinServ__Securities__c>> catalogByClass
    ) {
        List<FinServ__FinancialHolding__c> rows = new List<FinServ__FinancialHolding__c>();

        // Deterministic per-FA holding count via Id-hash mod 5 + min.
        Integer hash = Math.abs(String.valueOf(fa.Id).hashCode());
        Integer holdingCount = HOLDINGS_MIN + Math.mod(hash, HOLDINGS_MAX - HOLDINGS_MIN + 1);

        // Determine how many holdings per asset class via the allocation weights.
        Map<String, Integer> classCounts = allocate(holdingCount);

        Integer index = 0;
        for (String cls : classCounts.keySet()) {
            List<FinServ__Securities__c> pool = catalogByClass.get(cls);
            if (pool == null || pool.isEmpty()) continue;
            Integer needed = classCounts.get(cls);
            Set<Id> usedSecurities = new Set<Id>();
            for (Integer i = 0; i < needed; i++) {
                FinServ__Securities__c sec = pool[Math.mod(hash + i * 7 + index, pool.size())];
                if (usedSecurities.contains(sec.Id)) continue; // avoid duplicates within a portfolio
                usedSecurities.add(sec.Id);
                rows.add(buildHolding(fa, sec, hash + index));
                index++;
            }
        }
        return rows;
    }

    @TestVisible
    private static Map<String, Integer> allocate(Integer total) {
        Map<String, Integer> counts = new Map<String, Integer>();
        Integer assigned = 0;
        for (String cls : ALLOCATION_WEIGHTS.keySet()) {
            Integer n = (total * ALLOCATION_WEIGHTS.get(cls)) / 100;
            counts.put(cls, n);
            assigned += n;
        }
        // Top off any rounding shortfall by adding to Equities.
        if (assigned < total) {
            counts.put('Equities', counts.get('Equities') + (total - assigned));
        }
        return counts;
    }

    @TestVisible
    private static FinServ__FinancialHolding__c buildHolding(
        FinServ__FinancialAccount__c fa,
        FinServ__Securities__c sec,
        Integer seed
    ) {
        Decimal price = (sec.FinServ__Price__c == null || sec.FinServ__Price__c == 0)
            ? 100 : sec.FinServ__Price__c;
        // Shares scaled by price band: low-price securities get more shares.
        Integer baseShares = price < 50 ? 200 : price < 200 ? 50 : price < 500 ? 15 : 5;
        Decimal shares = baseShares + Math.mod(Math.abs(seed * 13), baseShares);
        Decimal marketValue = (shares * price).setScale(2, System.RoundingMode.HALF_UP);

        // Cost-basis math: PurchasePrice = MarketValue × (1 + delta).
        // Delta range: -25% to +30%, biased so ~60% of holdings show gains
        // (i.e., MarketValue > PurchasePrice → delta < 0).
        Integer deltaBucket = Math.mod(Math.abs(seed * 17 + 11), 100);
        Decimal deltaPct;
        if (deltaBucket < 60) {
            // Gain: PurchasePrice was lower than current, delta in -25%..0
            deltaPct = -1 * (Math.mod(Math.abs(seed * 7), 25) + 1) / 100.0;
        } else {
            // Loss: PurchasePrice was higher than current, delta in 0..+30
            deltaPct = (Math.mod(Math.abs(seed * 11), 30) + 1) / 100.0;
        }
        Decimal purchasePrice = (marketValue * (1 + deltaPct)).setScale(2, System.RoundingMode.HALF_UP);
        Decimal gainLoss = (marketValue - purchasePrice).setScale(2, System.RoundingMode.HALF_UP);
        Decimal percentChange = purchasePrice == 0 ? 0
            : ((gainLoss / purchasePrice) * 100).setScale(2, System.RoundingMode.HALF_UP);

        return new FinServ__FinancialHolding__c(
            FinServ__FinancialAccount__c = fa.Id,
            FinServ__Securities__c       = sec.Id,
            FinServ__Shares__c           = shares,
            FinServ__Price__c            = price,
            FinServ__MarketValue__c      = marketValue,
            FinServ__PurchasePrice__c    = purchasePrice,
            FinServ__GainLoss__c         = gainLoss,
            FinServ__PercentChange__c    = percentChange,
            FinServ__AssetClass__c       = sec.FinServ__AssetClass__c,
            FinServ__PrimaryOwner__c     = fa.FinServ__PrimaryOwner__c,
            FinServ__Household__c        = fa.FinServ__Household__c,
            FinServ__LastUpdated__c      = Date.today(),
            IsSeededHolding__c           = true
        );
    }

    @TestVisible
    private static Integer countSuccesses(Database.SaveResult[] results) {
        Integer ok = 0;
        Integer fail = 0;
        for (Database.SaveResult r : results) {
            if (r.isSuccess()) {
                ok++;
            } else {
                fail++;
                if (fail <= 3) {
                    System.debug(LoggingLevel.ERROR,
                        'Holding insert failed: ' + r.getErrors()[0].getMessage());
                }
            }
        }
        if (fail > 0) {
            System.debug(LoggingLevel.WARN,
                'Holding batch: ' + ok + ' ok / ' + fail + ' failed');
        }
        return ok;
    }
}
