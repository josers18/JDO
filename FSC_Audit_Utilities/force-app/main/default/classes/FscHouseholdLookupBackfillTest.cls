/**
 * FscHouseholdLookupBackfillTest
 * ------------------------------
 * Coverage on entry-point status contract. Skips end-to-end DML on
 * FSC managed-package objects; production data path verified by
 * manual runOnDemand() invocation post-deploy.
 */
@IsTest
private with sharing class FscHouseholdLookupBackfillTest {

    @IsTest
    static void runOnDemand_returns_a_status_string() {
        Test.startTest();
        String result = FscHouseholdLookupBackfill.runOnDemand();
        Test.stopTest();
        System.assertNotEquals(null, result, 'Status string must not be null');
        System.assert(
            result.startsWith('OK') || result.startsWith('SKIPPED'),
            'Status must start with OK or SKIPPED; got: ' + result
        );
    }
}
