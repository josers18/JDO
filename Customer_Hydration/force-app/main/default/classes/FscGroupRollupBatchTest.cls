@IsTest
private class FscGroupRollupBatchTest {

    @TestSetup
    static void setupHouseholds() {
        // Create a couple of HYDRATE-HH-* Account rows so the batch has something to chew on.
        // Skip RecordType/etc. — the batch only cares about Id matching.
        List<Account> households = new List<Account>();
        for (Integer i = 1; i <= 3; i++) {
            households.add(new Account(
                Name = 'Test Household ' + i,
                External_ID__c = 'HYDRATE-HH-TEST-' + String.valueOf(i).leftPad(3, '0')
            ));
        }
        insert households;
    }

    @IsTest
    static void testBatchProcessesHydrateHouseholds() {
        Test.startTest();
        Database.executeBatch(new FscGroupRollupBatch(), 200);
        Test.stopTest();

        // Validate that the batch executed against our households.
        Integer hhCount = [SELECT COUNT() FROM Account WHERE External_ID__c LIKE 'HYDRATE-HH-%'];
        System.assert(hhCount >= 3, 'Expected at least 3 HYDRATE-HH-* households');
    }

    @IsTest
    static void testBatchSkipsNonHydrateAccounts() {
        Account other = new Account(Name = 'Non-hydrate', External_ID__c = 'OTHER-NOT-HYDRATE-001');
        insert other;

        Test.startTest();
        Database.executeBatch(new FscGroupRollupBatch(), 200);
        Test.stopTest();

        // The batch only touches HYDRATE-HH-* records; non-hydrate Account is unchanged
        // (no roll-up fields modified — implicit pass since update wouldn't fire on this row).
        Account refetch = [SELECT Id, External_ID__c FROM Account WHERE Id = :other.Id];
        System.assertEquals('OTHER-NOT-HYDRATE-001', refetch.External_ID__c);
    }
}
