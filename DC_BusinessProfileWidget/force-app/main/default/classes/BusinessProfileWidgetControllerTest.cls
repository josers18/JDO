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

    @IsTest
    static void testGetUnifiedRelationshipsQueryJson_blankRecordId_throws() {
        Boolean threw = false;
        Test.startTest();
        try {
            BusinessProfileWidgetController.getUnifiedRelationshipsQueryJson(
                null,
                'DC_UnifiedAccounts',
                'id',
                'queryResultJSON'
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'expected AuraHandledException');
    }

    @IsTest
    static void testGetUnifiedRelationshipsQueryJson_invalidRecordId_throws() {
        Boolean threw = false;
        Test.startTest();
        try {
            BusinessProfileWidgetController.getUnifiedRelationshipsQueryJson(
                'not-a-valid-id',
                'DC_UnifiedAccounts',
                'id',
                'queryResultJSON'
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'expected AuraHandledException');
    }

    @IsTest
    static void testGetUnifiedRelationshipsQueryJson_blankClass_returnsNull() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        Test.startTest();
        BusinessProfileWidgetController.UnifiedRelationshipsApexResult res = BusinessProfileWidgetController.getUnifiedRelationshipsQueryJson(
            acc.Id,
            '',
            'id',
            'queryResultJSON'
        );
        Test.stopTest();
        System.assertEquals(null, res.queryResultJson);
    }

    @IsTest
    static void testGetUnifiedRelationshipsQueryJson_badClassName_throws() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        Boolean threw = false;
        Test.startTest();
        try {
            BusinessProfileWidgetController.getUnifiedRelationshipsQueryJson(
                acc.Id,
                '9Invalid',
                'id',
                'queryResultJSON'
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'expected AuraHandledException for unsafe class token');
    }

    private class GeocodeMock implements HttpCalloutMock {
        Integer calls = 0;
        String nominatimBody;
        GeocodeMock(String nominatimBody) {
            this.nominatimBody = nominatimBody;
        }
        public HttpResponse respond(HttpRequest req) {
            calls++;
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody(req.getEndpoint().contains('nominatim') ? nominatimBody : '{"features":[]}');
            return res;
        }
    }

    private static BusinessProfileWidgetController.BusinessProfileResult geocodeTarget(String street) {
        BusinessProfileWidgetController.BusinessProfileResult r = new BusinessProfileWidgetController.BusinessProfileResult();
        r.street = street;
        r.city = 'Springfield';
        r.state = 'IL';
        r.zip = '62701';
        return r;
    }

    @IsTest
    static void testGeocodeHitSetsCoordinates() {
        GeocodeMock mock = new GeocodeMock('[{"lat":"39.7817","lon":"-89.6501"}]');
        Test.setMock(HttpCalloutMock.class, mock);
        BusinessProfileWidgetController.BusinessProfileResult r = geocodeTarget('100 Hit Test Way ' + Crypto.getRandomInteger());
        Test.startTest();
        BusinessProfileWidgetController.applyGeocodeIfNeeded(r);
        Test.stopTest();
        System.assertEquals(Decimal.valueOf('39.7817'), r.mapLatitude);
        System.assertEquals(Decimal.valueOf('-89.6501'), r.mapLongitude);
        System.assertEquals(1, mock.calls, 'first Nominatim hit should stop further callouts');
    }

    @IsTest
    static void testGeocodeMissRespectsCalloutBudget() {
        GeocodeMock mock = new GeocodeMock('[]');
        Test.setMock(HttpCalloutMock.class, mock);
        BusinessProfileWidgetController.BusinessProfileResult r = geocodeTarget('200 Miss Test Way ' + Crypto.getRandomInteger());
        r.branchAddress = '1 Branch Plaza, Springfield, IL';
        Test.startTest();
        BusinessProfileWidgetController.applyGeocodeIfNeeded(r);
        Test.stopTest();
        System.assertEquals(null, r.mapLatitude);
        System.assertEquals(BusinessProfileWidgetController.MAX_GEOCODE_CALLOUTS, mock.calls, 'callouts must stop at the budget');
    }

    @IsTest
    static void testGeocodeCacheKeyIsNormalizedAndShort() {
        String a = BusinessProfileWidgetController.geocodeCacheKey('  1 Main St, Springfield ');
        String b = BusinessProfileWidgetController.geocodeCacheKey('1 MAIN ST, SPRINGFIELD');
        System.assertEquals(a, b, 'cache key should ignore case and surrounding whitespace');
        System.assert(a.length() <= 50, 'Platform Cache keys max out at 50 chars');
        System.assert(a.isAlphanumeric(), 'Platform Cache keys must be alphanumeric');
    }

    @IsTest
    static void testDecValAvoidsBinaryFloatDrift() {
        Double d = 0.7;
        System.assertEquals('0.7', String.valueOf(BusinessProfileWidgetController.decVal(d)));
        System.assertEquals(Decimal.valueOf('1234.5'), BusinessProfileWidgetController.decVal('$1,234.5'));
        System.assertEquals(null, BusinessProfileWidgetController.decVal('not a number'));
    }

    @IsTest
    static void testValidateAccountFieldPath() {
        System.assertEquals('Name', BusinessProfileWidgetController.validateAccountFieldPath('name'));
        System.assertEquals('Owner.Name', BusinessProfileWidgetController.validateAccountFieldPath('owner.name'));
        System.assertEquals(null, BusinessProfileWidgetController.validateAccountFieldPath('NotARealField__zz'));
        System.assertEquals(null, BusinessProfileWidgetController.validateAccountFieldPath('Name; DELETE'));
    }

    @IsTest
    static void testAllowlistEmptyTableAllowsEverything() {
        BusinessProfileWidgetController.allowedActionsOverride = new List<Profile_Widget_Allowed_Action__mdt>();
        System.assert(BusinessProfileWidgetController.isActionAllowed(BusinessProfileWidgetController.ACTION_TYPE_FLOW, 'Any_Flow'));
        System.assert(!BusinessProfileWidgetController.isActionAllowed(BusinessProfileWidgetController.ACTION_TYPE_FLOW, ' '));
    }

    @IsTest
    static void testAllowlistMatchesTypeAndName() {
        BusinessProfileWidgetController.allowedActionsOverride = new List<Profile_Widget_Allowed_Action__mdt>{
            new Profile_Widget_Allowed_Action__mdt(Action_Type__c = 'Flow', Api_Name__c = 'DC_Multiclass_Business'),
            new Profile_Widget_Allowed_Action__mdt(Action_Type__c = 'Apex', Api_Name__c = 'DC_UnifiedAccounts')
        };
        System.assert(BusinessProfileWidgetController.isActionAllowed('Flow', ' dc_multiclass_business '));
        System.assert(BusinessProfileWidgetController.isActionAllowed('Apex', 'DC_UnifiedAccounts'));
        System.assert(!BusinessProfileWidgetController.isActionAllowed('Apex', 'DC_Multiclass_Business'), 'type must match');
        System.assert(!BusinessProfileWidgetController.isActionAllowed('Flow', 'Evil_Flow'));
    }

    @IsTest
    static void testGetProfileDataBlocksUnlistedFlow() {
        BusinessProfileWidgetController.allowedActionsOverride = new List<Profile_Widget_Allowed_Action__mdt>{
            new Profile_Widget_Allowed_Action__mdt(Action_Type__c = 'Flow', Api_Name__c = 'Some_Other_Flow')
        };
        Account acc = [SELECT Id FROM Account LIMIT 1];
        Boolean threw = false;
        Test.startTest();
        try {
            BusinessProfileWidgetController.getProfileData(acc.Id, '{}', 'Evil_Flow', 'recordId', '', '', '', '', false, null);
        } catch (AuraHandledException e) {
            threw = e.getMessage().contains('allowlist');
        }
        Test.stopTest();
        System.assert(threw, 'an unlisted flow must be rejected before it runs');
    }

    @IsTest
    static void testGetProfileDataRejectsMalformedMappings() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        Boolean threw = false;
        Test.startTest();
        try {
            BusinessProfileWidgetController.getProfileData(acc.Id, '{not json', '', '', '', '', '', '', false, null);
        } catch (AuraHandledException e) {
            threw = e.getMessage() == 'Field mappings are not valid JSON.';
        }
        Test.stopTest();
        System.assert(threw, 'malformed mappings must surface a friendly error');
    }

    @IsTest
    static void testGetProfileDataRejectsBadRecordId() {
        Boolean threw = false;
        Test.startTest();
        try {
            BusinessProfileWidgetController.getProfileData('not-an-id', '{}', '', '', '', '', '', '', false, null);
        } catch (AuraHandledException e) {
            threw = e.getMessage() == 'Invalid record Id.';
        }
        Test.stopTest();
        System.assert(threw, 'a malformed record Id must surface a friendly error');
    }
}
