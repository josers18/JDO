@IsTest
private class BusinessProfileWidgetControllerTest {
    @TestSetup
    static void setup() {
        Account acc = new Account(
            Name = 'Omega Industries Inc.',
            BillingCity = 'San Francisco',
            BillingState = 'CA',
            BillingStreet = '1300 Veterans Blvd',
            BillingPostalCode = '94016',
            Industry = 'Manufacturing',
            NumberOfEmployees = 150,
            AnnualRevenue = 8400000,
            Website = 'omegainc.com'
        );
        insert acc;
    }

    @IsTest
    static void testGetProfileDataLegacySoql() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        String fieldMappingsJson = JSON.serialize(
            new Map<String, String>{
                'fieldCompanyName' => 'name',
                'fieldCity' => 'billingCity',
                'fieldIndustry' => 'industry'
            }
        );

        Test.startTest();
        String result = BusinessProfileWidgetController.getProfileData(acc.Id, fieldMappingsJson, '', '', '', '', '', '', true, null);
        Test.stopTest();

        System.assertNotEquals(null, result);
        Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(result);
        System.assertEquals('Omega Industries Inc.', parsed.get('companyName'));
    }

    @IsTest
    static void testSoqlUsesExplicitAccountFieldPaths() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        String fieldMappingsJson = JSON.serialize(
            new Map<String, String>{
                'fieldCompanyName' => 'Name',
                'fieldCity' => 'BillingCity'
            }
        );

        Test.startTest();
        String result = BusinessProfileWidgetController.getProfileData(acc.Id, fieldMappingsJson, '', '', '', '', '', '', true, null);
        Test.stopTest();

        Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(result);
        System.assertEquals('Omega Industries Inc.', parsed.get('companyName'));
        System.assertEquals('San Francisco', parsed.get('city'));
    }

    @IsTest
    static void testGetProfileDataEmptyMappingsUsesLegacyShape() {
        Account acc = [SELECT Id FROM Account LIMIT 1];

        Test.startTest();
        String result = BusinessProfileWidgetController.getProfileData(acc.Id, '{}', '', '', '', '', '', '', true, null);
        Test.stopTest();

        System.assertNotEquals(null, result);
        Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(result);
        System.assertEquals('Omega Industries Inc.', parsed.get('companyName'));
    }

    @IsTest
    static void testAssemblyFlowHintWhenFlowMappingWithoutFlowApiName() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        String fieldMappingsJson = JSON.serialize(
            new Map<String, String>{
                'fieldCompanyName' => 'Name',
                'fieldInterestExpense' => 'flow:InterestExpenseVar'
            }
        );

        Test.startTest();
        String result = BusinessProfileWidgetController.getProfileData(acc.Id, fieldMappingsJson, '', '', '', '', '', '', true, null);
        Test.stopTest();

        Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(result);
        System.assertNotEquals(null, parsed.get('assemblyFlowHint'));
        System.assert(
            String.valueOf(parsed.get('assemblyFlowHint')).contains('assembly'),
            'Hint should mention assembly flow configuration'
        );
    }

    @IsTest
    static void testStructureTabKeyContactsAndOrgChartFromCrm() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        Account child = new Account(Name = 'Child Sub Inc', ParentId = acc.Id, Type = 'Customer');
        insert child;
        Contact c = new Contact(
            FirstName = 'Jane',
            LastName = 'Morris',
            Title = 'Chief Executive Officer',
            AccountId = acc.Id
        );
        insert c;

        Test.startTest();
        String result = BusinessProfileWidgetController.getProfileData(acc.Id, '{}', '', '', '', '', '', '', false, null);
        Test.stopTest();

        Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(result);
        List<Object> kc = (List<Object>) parsed.get('keyContacts');
        System.assertNotEquals(null, kc);
        System.assert(kc.size() >= 1, 'Key contacts should load from related Contact');
        List<Object> org = (List<Object>) parsed.get('orgChartChildren');
        System.assertNotEquals(null, org);
        System.assert(org.size() >= 1, 'Org chart should include child account and/or contact');
        Object subCt = parsed.get('subsidiaries');
        System.assertEquals(1, subCt, 'Subsidiaries should be count of related accounts (ParentId + junction), not contacts');
    }

    @IsTest
    static void testLastUsedChannelPicklistLabelFromMapping() {
        Account acc = [SELECT Id, Industry FROM Account LIMIT 1];
        System.assertNotEquals(null, acc.Industry, 'Setup should set Industry for picklist label test');
        String fieldMappingsJson = JSON.serialize(
            new Map<String, String>{
                'fieldCompanyName' => 'Name',
                'fieldWalletCapture' => 'Industry'
            }
        );
        Test.startTest();
        String result = BusinessProfileWidgetController.getProfileData(acc.Id, fieldMappingsJson, '', '', '', '', '', '', true, null);
        Test.stopTest();
        Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(result);
        Object luc = parsed.get('lastUsedChannel');
        System.assertNotEquals(null, luc);
        String expectedLabel;
        expectedLabel = null;
        for (Schema.PicklistEntry pe : Account.Industry.getDescribe().getPicklistValues()) {
            if (acc.Industry != null && acc.Industry.equals(pe.getValue())) {
                expectedLabel = pe.getLabel();
                break;
            }
        }
        System.assertNotEquals(null, expectedLabel, 'Industry value from setup should resolve to a picklist label');
        System.assertEquals(expectedLabel, luc, 'Last used channel should show picklist label like the record detail UI');
    }

    @IsTest
    static void testPipelineOpenOpportunitiesOnAccount() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        String stageVal;
        for (Schema.PicklistEntry pe : Opportunity.StageName.getDescribe().getPicklistValues()) {
            if (pe.isActive()) {
                stageVal = pe.getValue();
                break;
            }
        }
        System.assertNotEquals(null, stageVal, 'Org should expose at least one active Opportunity stage');
        Opportunity opp = new Opportunity(
            Name = 'Strategic Expansion Q1',
            AccountId = acc.Id,
            StageName = stageVal,
            Amount = 25000,
            CloseDate = Date.today().addDays(45)
        );
        insert opp;

        Test.startTest();
        String result = BusinessProfileWidgetController.getProfileData(acc.Id, '{}', '', '', '', '', '', '', false, null);
        Test.stopTest();

        Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(result);
        List<Object> pipe = (List<Object>) parsed.get('pipelineOpenOpportunities');
        System.assertNotEquals(null, pipe, 'Pipeline list should be present');
        System.assertEquals(1, pipe.size(), 'One open opportunity should appear');
        Map<String, Object> row = (Map<String, Object>) pipe[0];
        System.assertEquals(String.valueOf(opp.Id), String.valueOf(row.get('id')));
        System.assertEquals('Strategic Expansion Q1', row.get('name'));
        System.assertEquals(stageVal, row.get('stageName'));
    }

    @IsTest
    static void testPipelineOpenOpportunitiesRespectsLimit() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        String stageVal;
        for (Schema.PicklistEntry pe : Opportunity.StageName.getDescribe().getPicklistValues()) {
            if (pe.isActive()) {
                stageVal = pe.getValue();
                break;
            }
        }
        System.assertNotEquals(null, stageVal);
        List<Opportunity> opps = new List<Opportunity>();
        for (Integer i = 0; i < 3; i++) {
            opps.add(
                new Opportunity(
                    Name = 'Limit Test Opp ' + i,
                    AccountId = acc.Id,
                    StageName = stageVal,
                    Amount = 1000 * (i + 1),
                    CloseDate = Date.today().addDays(30 + i)
                )
            );
        }
        insert opps;

        Test.startTest();
        String result = BusinessProfileWidgetController.getProfileData(acc.Id, '{}', '', '', '', '', '', '', false, 2);
        Test.stopTest();

        Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(result);
        List<Object> pipe = (List<Object>) parsed.get('pipelineOpenOpportunities');
        System.assertNotEquals(null, pipe);
        System.assertEquals(2, pipe.size(), 'Pipeline limit=2 should return at most two rows');
    }
}
