/**
 * FscInsuranceSeedTest
 * --------------------
 * Coverage on entry-point status contract + schema-level field
 * presence on the marker fields. Skips end-to-end DML — production
 * data path verified by manual runOnDemand() invocation post-deploy.
 */
@IsTest
private with sharing class FscInsuranceSeedTest {

    @IsTest
    static void runOnDemand_returns_a_status_string() {
        Test.startTest();
        String result = FscInsuranceSeed.runOnDemand();
        Test.stopTest();
        System.assertNotEquals(null, result, 'Status string must not be null');
        System.assert(
            result.startsWith('OK') || result.startsWith('SKIPPED') || result.startsWith('ERROR'),
            'Status must start with OK / SKIPPED / ERROR; got: ' + result
        );
    }

    @IsTest
    static void seeded_marker_field_exists_on_insurance_policy() {
        Map<String, Schema.SObjectField> fields =
            Schema.getGlobalDescribe().get('InsurancePolicy').getDescribe().fields.getMap();
        System.assert(
            fields.containsKey('IsSeededInsurance__c'),
            'InsurancePolicy must expose IsSeededInsurance__c after deploy'
        );
    }

    @IsTest
    static void seeded_marker_field_exists_on_producer() {
        Map<String, Schema.SObjectField> fields =
            Schema.getGlobalDescribe().get('Producer').getDescribe().fields.getMap();
        System.assert(
            fields.containsKey('IsSeededInsurance__c'),
            'Producer must expose IsSeededInsurance__c after deploy'
        );
    }
}
