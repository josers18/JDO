/**
 * FinancialOverviewController
 * ---------------------------
 * Feeds the premiumFinancialOverview LWC with:
 *   1. Current aggregate values for Deposits / Loans / Investments
 *   2. Historical trend arrays for sparklines
 *
 * Both methods receive the record ID the LWC pulls from page context
 * (@api recordId) and use it as a SOQL bind variable — never string-concat.
 *
 * Default queries target Financial Services Cloud's
 * FinServ__FinancialAccount__c object. Swap field references in the
 * constants block below to match your org's data model.
 */
public with sharing class FinancialOverviewController {

    // Tune these to match your FinServ__FinancialAccountType__c picklist values
    private static final Set<String> DEPOSIT_TYPES = new Set<String>{
        'Checking', 'Savings', 'CD', 'Money Market'
    };
    private static final Set<String> LOAN_TYPES = new Set<String>{
        'Loan', 'Mortgage', 'Line of Credit', 'Auto Loan'
    };
    private static final Set<String> INVESTMENT_TYPES = new Set<String>{
        'Brokerage', 'Retirement', 'Investment', 'IRA', '401k'
    };

    // ----------------------------------------------------------------------
    //  1. Current metric values
    // ----------------------------------------------------------------------
    //  cacheable=true lets the LWC @wire cache results on the client, which
    //  is what enables free reactive reloads when '$recordId' changes.

    @AuraEnabled(cacheable=true)
    public static FinancialMetrics getFinancialMetrics(Id recordId) {
        FinancialMetrics m = new FinancialMetrics();
        if (recordId == null) return m;

        // Deposits: sum of balance across deposit-type accounts
        AggregateResult[] depositAgg = [
            SELECT SUM(FinServ__Balance__c) totalBalance
            FROM   FinServ__FinancialAccount__c
            WHERE  FinServ__PrimaryOwner__c = :recordId
            AND    FinServ__FinancialAccountType__c IN :DEPOSIT_TYPES
        ];
        m.depositsAmount = nz((Decimal) depositAgg[0].get('totalBalance'));

        // Loans: principal, current balance, YTD interest
        AggregateResult[] loanAgg = [
            SELECT SUM(FinServ__LoanAmount__c)               principal,
                   SUM(FinServ__Balance__c)                  balance,
                   SUM(FinServ__InterestPaidYearToDate__c)   interest
            FROM   FinServ__FinancialAccount__c
            WHERE  FinServ__PrimaryOwner__c = :recordId
            AND    FinServ__FinancialAccountType__c IN :LOAN_TYPES
        ];
        m.loansAmount   = nz((Decimal) loanAgg[0].get('principal'));
        m.loansBalance  = nz((Decimal) loanAgg[0].get('balance'));
        m.loansInterest = nz((Decimal) loanAgg[0].get('interest'));

        // Investments: current balance + pre-computed ROI.
        // This org's FSC schema has no "original invested amount" field, so
        // `investmentsAmount` mirrors the current balance and ROI comes from
        // FinServ__PerformanceYTD__c (which is already a percent).
        AggregateResult[] invAgg = [
            SELECT SUM(FinServ__Balance__c)           balance,
                   AVG(FinServ__PerformanceYTD__c)    roi
            FROM   FinServ__FinancialAccount__c
            WHERE  FinServ__PrimaryOwner__c = :recordId
            AND    FinServ__FinancialAccountType__c IN :INVESTMENT_TYPES
        ];
        m.investmentsBalance = nz((Decimal) invAgg[0].get('balance'));
        m.investmentsAmount  = m.investmentsBalance;
        Decimal rawRoi = (Decimal) invAgg[0].get('roi');
        m.investmentsRoi = rawRoi == null ? 0 : rawRoi.setScale(2);

        return m;
    }

    // ----------------------------------------------------------------------
    //  2. Historical trend data (sparklines)
    // ----------------------------------------------------------------------
    //  Queries an optional Account_Financial_Snapshot__c custom object if
    //  it's deployed. Otherwise synthesizes a plausible trend so demos always
    //  render something. Replace the synthetic fallback once a real snapshot
    //  pipeline is in place.

    @AuraEnabled(cacheable=true)
    public static TrendData getTrendData(Id recordId, Integer months) {
        TrendData data = new TrendData();
        data.depositsTrend    = new List<Decimal>();
        data.loansTrend       = new List<Decimal>();
        data.investmentsTrend = new List<Decimal>();

        if (recordId == null) return data;
        Integer window = (months != null && months > 0) ? months : 6;

        if (Schema.getGlobalDescribe().containsKey('Account_Financial_Snapshot__c')) {
            try {
                String soql =
                    'SELECT Deposits_Total__c, Loans_Balance__c, Investments_Balance__c, Snapshot_Date__c ' +
                    'FROM Account_Financial_Snapshot__c ' +
                    'WHERE Account__c = :recordId ' +
                    'AND Snapshot_Date__c = LAST_N_MONTHS:' + String.valueOf(window) + ' ' +
                    'ORDER BY Snapshot_Date__c ASC';

                List<SObject> rows = Database.query(soql);
                for (SObject r : rows) {
                    data.depositsTrend.add(nz((Decimal) r.get('Deposits_Total__c')));
                    data.loansTrend.add(nz((Decimal) r.get('Loans_Balance__c')));
                    data.investmentsTrend.add(nz((Decimal) r.get('Investments_Balance__c')));
                }

                if (!data.depositsTrend.isEmpty()) return data;
            } catch (Exception ignored) {
                // Fall through to synthetic fallback
            }
        }

        // Synthetic fallback — remove or replace in production
        FinancialMetrics current = getFinancialMetrics(recordId);
        data.depositsTrend    = synthesizeTrend(current.depositsAmount,     window, 0.18, true);
        data.loansTrend       = synthesizeTrend(current.loansBalance,       window, 0.06, false);
        data.investmentsTrend = synthesizeTrend(current.investmentsBalance, window, 0.22, true);
        return data;
    }

    // ----------------------------------------------------------------------
    //  DTOs
    // ----------------------------------------------------------------------

    public class FinancialMetrics {
        @AuraEnabled public Decimal depositsAmount;
        @AuraEnabled public Decimal loansAmount;
        @AuraEnabled public Decimal loansBalance;
        @AuraEnabled public Decimal loansInterest;
        @AuraEnabled public Decimal investmentsAmount;
        @AuraEnabled public Decimal investmentsBalance;
        @AuraEnabled public Decimal investmentsRoi;
    }

    public class TrendData {
        @AuraEnabled public List<Decimal> depositsTrend;
        @AuraEnabled public List<Decimal> loansTrend;
        @AuraEnabled public List<Decimal> investmentsTrend;
    }

    // ----------------------------------------------------------------------
    //  Helpers
    // ----------------------------------------------------------------------

    private static Decimal nz(Decimal d) {
        return d == null ? 0 : d;
    }

    private static List<Decimal> synthesizeTrend(
        Decimal endValue, Integer points, Decimal volatility, Boolean trendUp
    ) {
        List<Decimal> out = new List<Decimal>();
        if (endValue == null || endValue == 0 || points < 2) return out;

        Decimal base = trendUp
            ? endValue * (1 - volatility)
            : endValue * (1 + volatility * 0.3);

        for (Integer i = 0; i < points; i++) {
            Decimal progress = Decimal.valueOf(i) / (points - 1);
            Decimal linear = base + (endValue - base) * progress;
            Decimal wiggle = Math.sin(i * 1.3) * endValue * 0.015;
            Decimal value = (linear + wiggle).setScale(2);
            out.add(value < 0 ? 0 : value);
        }
        out[points - 1] = endValue.setScale(2);
        return out;
    }
}
