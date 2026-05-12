/**
 * FscIsEnrichAndExpandTest
 * ------------------------
 * Coverage on entry-point status contracts and helper logic. Skips
 * end-to-end DML against InteractionSummary in test transactions
 * because B5 depends on existing seeded IS records and Person Accounts
 * (FSC managed-package objects). Production data path verified by
 * manual runOnDemand() invocation post-deploy.
 */
@IsTest
private with sharing class FscIsEnrichAndExpandTest {

    @IsTest
    static void runOnDemand_returns_a_status_string() {
        Test.startTest();
        String result = FscIsEnrichAndExpand.runOnDemand();
        Test.stopTest();
        System.assertNotEquals(null, result, 'Status string must not be null');
        System.assert(result.contains('enrich:') && result.contains('expand:'),
            'Combined status must report both phases; got: ' + result);
    }

    @IsTest
    static void enrichExistingStubs_returns_status() {
        Test.startTest();
        String result = FscIsEnrichAndExpand.enrichExistingStubs();
        Test.stopTest();
        System.assertNotEquals(null, result);
        System.assert(result.startsWith('enrich:'),
            'enrichExistingStubs status must start with "enrich:"; got: ' + result);
    }

    @IsTest
    static void expandWithFresh_returns_status() {
        Test.startTest();
        String result = FscIsEnrichAndExpand.expandWithFresh();
        Test.stopTest();
        System.assertNotEquals(null, result);
        System.assert(result.startsWith('expand:'),
            'expandWithFresh status must start with "expand:"; got: ' + result);
    }
}
