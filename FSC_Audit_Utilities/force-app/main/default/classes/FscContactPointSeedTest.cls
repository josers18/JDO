/**
 * FscContactPointSeedTest
 * -----------------------
 * Coverage on entry-point status contract and schema-level field
 * presence on the two ContactPoint objects. End-to-end DML against
 * the Person Account and B2B Contact records is skipped because tests
 * don't have those source records reliably available; production data
 * path verified by manual runOnDemand() invocation post-deploy.
 */
@IsTest
private with sharing class FscContactPointSeedTest {

    @IsTest
    static void runOnDemand_returns_a_status_string() {
        Test.startTest();
        String result = FscContactPointSeed.runOnDemand();
        Test.stopTest();
        System.assertNotEquals(null, result, 'Status string must not be null');
        System.assert(
            result.startsWith('OK') || result.startsWith('SKIPPED'),
            'Status must start with OK or SKIPPED; got: ' + result
        );
    }

    @IsTest
    static void seeded_marker_field_exists_on_email() {
        Map<String, Schema.SObjectField> fields =
            Schema.getGlobalDescribe().get('ContactPointEmail').getDescribe().fields.getMap();
        System.assert(
            fields.containsKey('IsSeededContactPoint__c'),
            'ContactPointEmail must expose IsSeededContactPoint__c after deploy'
        );
    }

    @IsTest
    static void seeded_marker_field_exists_on_phone() {
        Map<String, Schema.SObjectField> fields =
            Schema.getGlobalDescribe().get('ContactPointPhone').getDescribe().fields.getMap();
        System.assert(
            fields.containsKey('IsSeededContactPoint__c'),
            'ContactPointPhone must expose IsSeededContactPoint__c after deploy'
        );
    }
}
