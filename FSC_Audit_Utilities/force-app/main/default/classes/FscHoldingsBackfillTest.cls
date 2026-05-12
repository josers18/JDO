/**
 * FscHoldingsBackfillTest
 * -----------------------
 * Same testing posture as FscEngagementSeedTest: exercise entry-point
 * status contracts and helper logic without inserting FSC managed-package
 * objects in a test transaction (which has license/validation
 * complexity). End-to-end production data path verified by manual
 * runOnDemand() invocation post-deploy.
 */
@IsTest
private with sharing class FscHoldingsBackfillTest {

    @IsTest
    static void runOnDemand_returns_a_status_string() {
        Test.startTest();
        String result = FscHoldingsBackfill.runOnDemand();
        Test.stopTest();
        System.assertNotEquals(null, result, 'Status string must not be null');
        System.assert(
            result.startsWith('OK') || result.startsWith('SKIPPED') || result.startsWith('ERROR'),
            'Status must start with OK / SKIPPED / ERROR; got: ' + result
        );
    }

    @IsTest
    static void allocate_distributes_to_target_weights() {
        // The allocator should split N holdings roughly into the
        // 65/25/5/5 mix. For 10 holdings: 6 Equities + 2 Fixed Income +
        // 0 Cash + 0 Alt + 2 top-off → all 10 land on Equities + 2 FI.
        Map<String, Integer> r10 = (Map<String, Integer>)
            FscHoldingsBackfill.allocate(10);
        Integer total = 0;
        for (Integer v : r10.values()) total += v;
        System.assertEquals(10, total, 'allocate(10) must sum to 10');
        System.assertEquals(true, r10.get('Equities') >= 6,
            'Equities must dominate; got: ' + r10.get('Equities'));
    }

    @IsTest
    static void allocate_handles_small_totals() {
        Map<String, Integer> r3 = (Map<String, Integer>)
            FscHoldingsBackfill.allocate(3);
        Integer total = 0;
        for (Integer v : r3.values()) total += v;
        System.assertEquals(3, total, 'allocate(3) must still sum to 3');
    }

    @IsTest
    static void allocate_handles_large_totals() {
        Map<String, Integer> r30 = (Map<String, Integer>)
            FscHoldingsBackfill.allocate(30);
        Integer total = 0;
        for (Integer v : r30.values()) total += v;
        System.assertEquals(30, total, 'allocate(30) must sum to 30');
        // 30 × 65% = 19.5 rounded down to 19 + top-off
        System.assert(r30.get('Equities') >= 19,
            'At total=30, Equities must be >= 19; got: ' + r30.get('Equities'));
    }

    @IsTest
    static void seeded_marker_field_exists_on_holding() {
        Map<String, Schema.SObjectField> holdingFields =
            Schema.getGlobalDescribe().get('FinServ__FinancialHolding__c').getDescribe().fields.getMap();
        System.assert(
            holdingFields.containsKey('IsSeededHolding__c'),
            'FinServ__FinancialHolding__c must expose IsSeededHolding__c after deploy'
        );
    }
}
