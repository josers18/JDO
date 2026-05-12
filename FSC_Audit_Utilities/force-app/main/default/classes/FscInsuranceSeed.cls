/**
 * FscInsuranceSeed
 * ----------------
 * Phase B12 implementation per audit decision §6.1 D2 (Insurance UI
 * stays visible — populate in a future Phase B pass). Closes the
 * insurance trio of audit finding §4.3 B6 (Producer / InsurancePolicy
 * / ComplaintCase all at 0 records).
 *
 * Generates:
 *   - 2 Producer records: Linda Carter (Captive Agent, in-house) +
 *     Premier Insurance Brokers (Partner Agent, external)
 *   - 8 InsurancePolicy records distributed across Gold/Platinum-tier
 *     Person Accounts. Type mix: 3 Auto / 2 Home / 1 Term Life /
 *     1 Umbrella / 1 Disability. 7 In Force, 1 Lapsed (for re-engagement
 *     demos).
 *
 * Skipped: ComplaintCase. The 3-record chain (Case + PublicComplaint
 * + ComplaintCase) for 1-2 demo records is disproportionate; tracked
 * as a deferred sub-item of B12.
 *
 * Idempotency via IsSeededInsurance__c marker on both objects. Re-runs
 * find existing seeded records and skip.
 */
public with sharing class FscInsuranceSeed {

    @AuraEnabled
    public static String runOnDemand() {
        Integer existingProducers = [
            SELECT COUNT() FROM Producer WHERE IsSeededInsurance__c = TRUE
        ];
        Integer existingPolicies = [
            SELECT COUNT() FROM InsurancePolicy WHERE IsSeededInsurance__c = TRUE
        ];
        if (existingProducers > 0 || existingPolicies > 0) {
            return 'SKIPPED: ' + existingProducers + ' seeded Producers + '
                 + existingPolicies + ' seeded InsurancePolicies already exist.';
        }

        // Pick high-tier Person Accounts as policyholders.
        List<Account> policyholders = [
            SELECT Id, FirstName, LastName
            FROM Account
            WHERE IsPersonAccount = TRUE
            AND   FinServ__ClientCategory__c IN ('Gold', 'Platinum')
            ORDER BY Id
            LIMIT 8
        ];
        if (policyholders.size() < 5) {
            return 'ERROR: only ' + policyholders.size()
                 + ' high-tier Person Accounts found (need at least 5).';
        }

        // Step 1: insert 2 Producers
        List<Producer> producers = new List<Producer>{
            new Producer(
                Name = 'Linda Carter',
                Type = 'Captive Agent',
                IsSeededInsurance__c = true
            ),
            new Producer(
                Name = 'Premier Insurance Brokers',
                Type = 'Partner Agent',
                IsSeededInsurance__c = true
            )
        };
        insert producers;

        // Step 2: insert 8 policies. Split between Auto/Home/Life/etc.
        List<InsurancePolicy> policies = new List<InsurancePolicy>();
        Date today = Date.today();

        // Auto policies — 3 records
        for (Integer i = 0; i < 3; i++) {
            Account holder = policyholders[Math.mod(i, policyholders.size())];
            Datetime effective = Datetime.newInstance(today.addMonths(-12 - i * 2), Time.newInstance(0,0,0,0));
            Datetime expires   = Datetime.newInstance(today.addMonths(6 - i * 2), Time.newInstance(0,0,0,0));
            policies.add(new InsurancePolicy(
                Name             = 'AUTO-' + (1001 + i),
                PolicyName       = holder.FirstName + ' ' + holder.LastName + ' - Auto Insurance',
                NameInsuredId    = holder.Id,
                PolicyType       = 'Auto',
                Status           = 'In Force',
                EffectiveDate    = effective,
                ExpirationDate   = expires,
                PremiumAmount    = 1200 + (i * 350),
                PolicyDescription = 'Comprehensive auto coverage with collision and liability.',
                IsSeededInsurance__c = true
            ));
        }

        // Home policies — 2 records
        for (Integer i = 0; i < 2; i++) {
            Account holder = policyholders[Math.mod(i + 3, policyholders.size())];
            Datetime effective = Datetime.newInstance(today.addMonths(-18 - i * 3), Time.newInstance(0,0,0,0));
            Datetime expires   = Datetime.newInstance(today.addMonths(8 - i * 3), Time.newInstance(0,0,0,0));
            policies.add(new InsurancePolicy(
                Name             = 'HOME-' + (2001 + i),
                PolicyName       = holder.FirstName + ' ' + holder.LastName + ' - Homeowners Insurance',
                NameInsuredId    = holder.Id,
                PolicyType       = 'Home',
                Status           = 'In Force',
                EffectiveDate    = effective,
                ExpirationDate   = expires,
                PremiumAmount    = 2400 + (i * 600),
                PolicyDescription = 'Homeowners coverage including dwelling, personal property, and liability.',
                IsSeededInsurance__c = true
            ));
        }

        // Term Life policy — 1 record
        Account lifeHolder = policyholders[Math.mod(5, policyholders.size())];
        policies.add(new InsurancePolicy(
            Name             = 'LIFE-3001',
            PolicyName       = lifeHolder.FirstName + ' ' + lifeHolder.LastName + ' - 20yr Term Life',
            NameInsuredId    = lifeHolder.Id,
            PolicyType       = 'Life',
            Status           = 'In Force',
            EffectiveDate    = Datetime.newInstance(today.addMonths(-24), Time.newInstance(0,0,0,0)),
            ExpirationDate   = Datetime.newInstance(today.addYears(18), Time.newInstance(0,0,0,0)),
            PremiumAmount    = 720,
            PolicyDescription = '20-year term life policy with $1M death benefit.',
            IsSeededInsurance__c = true
        ));

        // Umbrella policy — 1 record (Lapsed for re-engagement demo)
        Account umbHolder = policyholders[Math.mod(6, policyholders.size())];
        policies.add(new InsurancePolicy(
            Name             = 'UMB-4001',
            PolicyName       = umbHolder.FirstName + ' ' + umbHolder.LastName + ' - $2M Umbrella Liability',
            NameInsuredId    = umbHolder.Id,
            PolicyType       = 'General Liability',
            Status           = 'Lapsed',
            EffectiveDate    = Datetime.newInstance(today.addMonths(-15), Time.newInstance(0,0,0,0)),
            ExpirationDate   = Datetime.newInstance(today.addMonths(-2), Time.newInstance(0,0,0,0)),
            PremiumAmount    = 450,
            PolicyDescription = 'Umbrella liability policy. Lapsed; pending renewal conversation.',
            IsSeededInsurance__c = true
        ));

        // Disability policy — 1 record
        Account disHolder = policyholders[Math.mod(7, policyholders.size())];
        policies.add(new InsurancePolicy(
            Name             = 'DI-5001',
            PolicyName       = disHolder.FirstName + ' ' + disHolder.LastName + ' - Long-Term Disability',
            NameInsuredId    = disHolder.Id,
            PolicyType       = 'Disability',
            Status           = 'In Force',
            EffectiveDate    = Datetime.newInstance(today.addMonths(-9), Time.newInstance(0,0,0,0)),
            ExpirationDate   = Datetime.newInstance(today.addMonths(15), Time.newInstance(0,0,0,0)),
            PremiumAmount    = 2800,
            PolicyDescription = 'Long-term disability coverage at 60% of income, 90-day elimination period.',
            IsSeededInsurance__c = true
        ));

        Database.SaveResult[] policyResults = Database.insert(policies, false);
        Integer producerCount = producers.size();
        Integer policyCount = countSuccesses(policyResults);

        return 'OK: created ' + producerCount + ' Producers + '
             + policyCount + ' InsurancePolicies '
             + '(linked to ' + policyholders.size() + ' Gold/Platinum-tier Person Accounts).';
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
                        'Insurance insert failed: ' + r.getErrors()[0].getMessage());
                }
            }
        }
        if (fail > 0) {
            System.debug(LoggingLevel.WARN, 'Batch: ' + ok + ' ok / ' + fail + ' failed');
        }
        return ok;
    }
}
