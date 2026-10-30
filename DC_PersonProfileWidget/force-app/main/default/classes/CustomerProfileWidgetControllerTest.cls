@IsTest
private class CustomerProfileWidgetControllerTest {
    @IsTest
    static void testGetProfileDataFallbackSoql() {
        Account a = new Account(
            Name = 'Fallback LLC',
            BillingStreet = '1 Market St',
            BillingCity = 'San Francisco',
            BillingState = 'CA',
            BillingPostalCode = '94105',
            Phone = '4155550100',
            Industry = 'Technology',
            NumberOfEmployees = 120,
            AnnualRevenue = 5000000,
            Website = 'https://example.com'
        );
        insert a;

        Test.startTest();
        CustomerProfileWidgetController.ProfileResult res = CustomerProfileWidgetController.getProfileData(
            a.Id,
            null,
            null,
            null,
            null,
            '',
            null,
            null,
            null,
            null
        );
        Test.stopTest();

        System.assertEquals('Fallback LLC', res.fullName);
        System.assertEquals('San Francisco', res.city);
        System.assertEquals('CA', res.state);
        System.assertEquals(Integer.valueOf(120), res.employees);
        System.assertEquals('4155550100', res.phone);
        System.assertNotEquals(null, res.orgChartChildren, 'Structure tab payload should be initialized');
        System.assertNotEquals(null, res.keyContacts);
    }

    @IsTest
    static void testGetProfileDataContactFallback() {
        Contact c = new Contact(FirstName = 'Pat', LastName = 'Lee', Email = 'pat@example.com', MailingCity = 'Austin', MailingState = 'TX');
        insert c;

        Test.startTest();
        CustomerProfileWidgetController.ProfileResult res = CustomerProfileWidgetController.getProfileData(
            c.Id,
            null,
            null,
            null,
            null,
            '',
            null,
            null,
            null,
            null
        );
        Test.stopTest();

        System.assertEquals('Pat Lee', res.fullName);
        System.assertEquals('pat@example.com', res.email);
        System.assertNotEquals(null, res.orgChartChildren);
        System.assertNotEquals(null, res.keyContacts);
    }

    @IsTest
    static void testAssemblyOutputMap_soqlPathWithoutAssemblyFlow() {
        Contact c = new Contact(
            FirstName = 'Ann',
            LastName = 'Smith',
            Email = 'ann@example.com',
            MailingCity = 'Denver',
            MailingState = 'CO'
        );
        insert c;
        Test.startTest();
        CustomerProfileWidgetController.ProfileResult res = CustomerProfileWidgetController.getProfileData(
            c.Id,
            null,
            null,
            null,
            null,
            '',
            '',
            'recordId',
            '{"city":"MailingCity"}',
            false
        );
        Test.stopTest();
        System.assertEquals('Denver', res.city);
    }

    @IsTest
    static void testLastUsedChannel_coreCustomPicklistLabelOnAccount() {
        String industryVal = null;
        for (Schema.PicklistEntry pe : Account.Industry.getDescribe().getPicklistValues()) {
            if (pe.isActive() && String.isNotBlank(pe.getValue())) {
                industryVal = pe.getValue();
                break;
            }
        }
        System.assertNotEquals(null, industryVal, 'Org should expose at least one active Industry picklist value');
        Account acc = new Account(Name = 'LUC Co', Industry = industryVal);
        insert acc;
        acc = [SELECT Id, Industry FROM Account WHERE Id = :acc.Id];
        System.assertNotEquals(null, acc.Industry, 'Industry should be set for picklist label test');
        String coreJson = '{"lastUsedChannel":"Industry"}';
        Test.startTest();
        CustomerProfileWidgetController.ProfileResult res = CustomerProfileWidgetController.buildFallbackFromSoql(acc.Id, coreJson);
        Test.stopTest();
        String expectedLabel;
        expectedLabel = null;
        for (Schema.PicklistEntry pe : Account.Industry.getDescribe().getPicklistValues()) {
            if (acc.Industry != null && acc.Industry.equals(pe.getValue())) {
                expectedLabel = pe.getLabel();
                break;
            }
        }
        System.assertNotEquals(null, expectedLabel, 'Industry value should resolve to a picklist label');
        System.assertEquals(expectedLabel, res.lastUsedChannel, 'lastUsedChannel should show picklist label like the record detail UI');
    }

    @IsTest
    static void testBuildFallbackFromSoql_invalidId() {
        Test.startTest();
        CustomerProfileWidgetController.ProfileResult r = CustomerProfileWidgetController.buildFallbackFromSoql('bad', null);
        Test.stopTest();
        System.assertEquals(null, r.fullName);
    }

    @IsTest
    static void testGenerateSummary_blankTemplate_returnsNull() {
        Test.startTest();
        String out = CustomerProfileWidgetController.generateSummary(
            null,
            'Input:Prediction_Context',
            'Wealth',
            '[]'
        );
        Test.stopTest();
        System.assertEquals(null, out);
    }

    @IsTest
    static void testGenerateSummary_blankInputName_usesDefault() {
        Test.startTest();
        String out = CustomerProfileWidgetController.generateSummary(
            '',
            '',
            'X',
            '[]'
        );
        Test.stopTest();
        System.assertEquals(null, out);
    }

    @IsTest
    static void testGetByPath_listIndexSegment() {
        Object v = CustomerProfileWidgetController.debugGetByPathFromJson(
            '{"ssot__InvestmentAccount__dlm":[{"Investment_Balance__c":22820.17}]}',
            'ssot__InvestmentAccount__dlm.0.Investment_Balance__c'
        );
        System.assertNotEquals(null, v);
        System.assertEquals(22820.17, ((Decimal) v).setScale(2));
    }

    @IsTest
    static void testRunSignalGaugeFlow_blankFlow_throws() {
        Account a = new Account(Name = 'Gauge Co');
        insert a;
        Boolean threw = false;
        Test.startTest();
        try {
            CustomerProfileWidgetController.runSignalGaugeFlow(null, a.Id, 'recordId', 'prediction');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'expected AuraHandledException');
    }

    @IsTest
    static void testRunSignalGaugeFlow_invalidRecordId_throws() {
        Boolean threw = false;
        Test.startTest();
        try {
            CustomerProfileWidgetController.runSignalGaugeFlow('Any_Flow_Api', 'not-a-valid-id', 'recordId', 'prediction');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'expected AuraHandledException');
    }

    @IsTest
    static void testGetUnifiedRelationshipsQueryJson_blankRecordId_throws() {
        Boolean threw = false;
        Test.startTest();
        try {
            CustomerProfileWidgetController.getUnifiedRelationshipsQueryJson(
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
            CustomerProfileWidgetController.getUnifiedRelationshipsQueryJson(
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
        Account a = new Account(Name = 'Unified Rel Co');
        insert a;
        Test.startTest();
        CustomerProfileWidgetController.UnifiedRelationshipsApexResult res = CustomerProfileWidgetController.getUnifiedRelationshipsQueryJson(
            a.Id,
            '',
            'id',
            'queryResultJSON'
        );
        Test.stopTest();
        System.assertEquals(null, res.queryResultJson);
    }

    @IsTest
    static void testGetUnifiedRelationshipsQueryJson_badClassName_throws() {
        Account a = new Account(Name = 'Unified Rel Co 2');
        insert a;
        Boolean threw = false;
        Test.startTest();
        try {
            CustomerProfileWidgetController.getUnifiedRelationshipsQueryJson(
                a.Id,
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

    private static String firstActiveOpportunityStageName() {
        for (Schema.PicklistEntry pe : Opportunity.StageName.getDescribe().getPicklistValues()) {
            if (pe.isActive()) {
                return pe.getValue();
            }
        }
        return null;
    }

    @IsTest
    static void testOpenOppCaseRollups_account() {
        String stage = firstActiveOpportunityStageName();
        System.assertNotEquals(null, stage, 'Org should expose at least one active Opportunity StageName');
        Account a = new Account(Name = 'Rollup Account');
        insert a;
        insert new Opportunity(
            Name = 'Open Opp A',
            StageName = stage,
            CloseDate = Date.today().addDays(30),
            AccountId = a.Id,
            Amount = 2500.50
        );
        insert new Case(Subject = 'Open Case A', AccountId = a.Id, Status = 'New');

        Test.startTest();
        CustomerProfileWidgetController.ProfileResult res = CustomerProfileWidgetController.getProfileData(
            a.Id,
            null,
            null,
            null,
            null,
            '',
            null,
            null,
            null,
            null
        );
        Test.stopTest();

        System.assertEquals(Integer.valueOf(1), res.openCasesCount);
        System.assertEquals(2500.50, res.openOpportunitiesAmount);
    }

    @IsTest
    static void testOpenOppCaseRollups_contact_viaAccountAndOcr() {
        String stage = firstActiveOpportunityStageName();
        System.assertNotEquals(null, stage);
        Account a = new Account(Name = 'Rollup Account B');
        insert a;
        Contact c = new Contact(FirstName = 'Roll', LastName = 'Up', AccountId = a.Id);
        insert c;
        insert new Opportunity(
            Name = 'Open Opp B',
            StageName = stage,
            CloseDate = Date.today().addDays(45),
            AccountId = a.Id,
            Amount = 100
        );
        Account side = new Account(Name = 'Side Account');
        insert side;
        Opportunity ocrOpp = new Opportunity(
            Name = 'OCR Opp',
            StageName = stage,
            CloseDate = Date.today().addDays(60),
            AccountId = side.Id,
            Amount = 400
        );
        insert ocrOpp;
        insert new OpportunityContactRole(OpportunityId = ocrOpp.Id, ContactId = c.Id);
        insert new Case(Subject = 'Open Case B', ContactId = c.Id, Status = 'New');

        Test.startTest();
        CustomerProfileWidgetController.ProfileResult res = CustomerProfileWidgetController.getProfileData(
            c.Id,
            null,
            null,
            null,
            null,
            '',
            null,
            null,
            null,
            null
        );
        Test.stopTest();

        System.assertEquals(Integer.valueOf(1), res.openCasesCount);
        System.assertEquals(500, res.openOpportunitiesAmount);
    }

    @IsTest
    static void testGetAgentforceOverviewSummary_blankTemplate_returnsEmptyPayload() {
        Contact c = new Contact(FirstName = 'Sum', LastName = 'Mary');
        insert c;
        Test.startTest();
        String out = CustomerProfileWidgetController.getAgentforceOverviewSummary(c.Id, '', '');
        Test.stopTest();
        Map<String, Object> m = (Map<String, Object>) JSON.deserializeUntyped(out);
        System.assertEquals(null, m.get('agentforceSummary'));
        System.assertEquals('', m.get('agentforceSummaryPromptHint'));
    }

    @IsTest
    static void testGetAgentforceOverviewSummary_nonPerson_returnsHint() {
        String stage = firstActiveOpportunityStageName();
        System.assertNotEquals(null, stage);
        Account acc = new Account(Name = 'Opp Parent');
        insert acc;
        Opportunity o = new Opportunity(
            Name = 'Non Person Opp',
            StageName = stage,
            CloseDate = Date.today().addDays(30),
            AccountId = acc.Id
        );
        insert o;
        Test.startTest();
        String out = CustomerProfileWidgetController.getAgentforceOverviewSummary(o.Id, 'any_template_ref', '');
        Test.stopTest();
        Map<String, Object> m = (Map<String, Object>) JSON.deserializeUntyped(out);
        String overviewHint = (String) m.get('agentforceSummaryPromptHint');
        System.assertNotEquals(null, overviewHint);
        System.assert(
            overviewHint.contains('Opportunity'),
            'hint should name the page object type: ' + overviewHint
        );
    }

    @IsTest
    static void testGetAgentforceOverviewSummary_blankRecordId_throws() {
        Boolean threw = false;
        Test.startTest();
        try {
            CustomerProfileWidgetController.getAgentforceOverviewSummary(null, 'x', '');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'expected AuraHandledException for blank record Id');
    }

    @IsTest
    static void testDecVal_doubleRoundTripsWithoutFloatNoise() {
        Double d = 0.7;
        System.assertEquals(Decimal.valueOf('0.7'), CustomerProfileWidgetController.decVal(d));
        System.assertEquals(Decimal.valueOf('13905.02'), CustomerProfileWidgetController.decVal('13,905.02'));
        System.assertEquals(null, CustomerProfileWidgetController.decVal('n/a'));
    }

    private class GeocodeMock implements HttpCalloutMock {
        Integer calls = 0;
        String body;
        Boolean fail = false;
        GeocodeMock(String body) {
            this.body = body;
        }
        public HttpResponse respond(HttpRequest req) {
            calls++;
            if (fail) {
                throw new CalloutException('Read timed out');
            }
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody(body);
            return res;
        }
    }

    private static CustomerProfileWidgetController.ProfileResult addressOnly(String street) {
        CustomerProfileWidgetController.ProfileResult r = new CustomerProfileWidgetController.ProfileResult();
        r.billingStreet = street;
        r.billingCity = 'San Francisco';
        r.billingState = 'CA';
        r.billingPostalCode = '94105';
        return r;
    }

    @IsTest
    static void testApplyGeocode_nominatimHitSetsCoords() {
        GeocodeMock mock = new GeocodeMock('[{"lat":"37.7936","lon":"-122.3958"}]');
        Test.setMock(HttpCalloutMock.class, mock);
        CustomerProfileWidgetController.ProfileResult r = addressOnly('1 Market St');
        Test.startTest();
        CustomerProfileWidgetController.applyGeocodeIfNeeded(r);
        Test.stopTest();
        System.assertEquals(Decimal.valueOf('37.7936'), r.mapLatitude);
        System.assertEquals(Decimal.valueOf('-122.3958'), r.mapLongitude);
        System.assertEquals(1, mock.calls, 'First hit should stop further callouts');
    }

    @IsTest
    static void testApplyGeocode_calloutExceptionAbortsRemainingCandidates() {
        GeocodeMock mock = new GeocodeMock('[]');
        mock.fail = true;
        Test.setMock(HttpCalloutMock.class, mock);
        CustomerProfileWidgetController.ProfileResult r = addressOnly('2 Timeout Ave');
        Test.startTest();
        CustomerProfileWidgetController.applyGeocodeIfNeeded(r);
        Test.stopTest();
        System.assertEquals(null, r.mapLatitude);
        System.assertEquals(1, mock.calls, 'A timeout must not be retried against the remaining candidates');
    }

    @IsTest
    static void testApplyGeocode_noHitsStaysWithinCalloutBudget() {
        GeocodeMock mock = new GeocodeMock('[]');
        Test.setMock(HttpCalloutMock.class, mock);
        CustomerProfileWidgetController.ProfileResult r = addressOnly('3 Nowhere Rd');
        Test.startTest();
        CustomerProfileWidgetController.applyGeocodeIfNeeded(r);
        Test.stopTest();
        System.assertEquals(null, r.mapLatitude);
        System.assert(
            mock.calls <= CustomerProfileWidgetController.MAX_GEOCODE_CALLOUTS,
            'Callouts must stay within budget, got ' + mock.calls
        );
    }

    @IsTest
    static void testGeocodeCacheKey_isAlphanumericAndShort() {
        String k = CustomerProfileWidgetController.geocodeCacheKey('1 Market St, San Francisco, CA 94105');
        System.assert(k.isAlphanumeric(), k);
        System.assert(k.length() <= 50, k);
        System.assertEquals(k, CustomerProfileWidgetController.geocodeCacheKey('  1 MARKET ST, San Francisco, CA 94105 '));
    }

    @IsTest
    static void testValidateAccountFieldPath_enforcesFls() {
        System.assertEquals('AnnualRevenue', CustomerProfileWidgetController.validateAccountFieldPath('annualrevenue'));
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Minimum Access - Salesforce' LIMIT 1];
        User u = new User(
            Alias = 'cpwfls',
            Email = 'cpw.fls@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'FlsTest',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = p.Id,
            TimeZoneSidKey = 'America/Los_Angeles',
            Username = 'cpw.fls.' + System.currentTimeMillis() + '@example.com'
        );
        insert u;
        System.runAs(u) {
            System.assertEquals(
                null,
                CustomerProfileWidgetController.validateAccountFieldPath('AnnualRevenue'),
                'A field the running user cannot read must not be selectable'
            );
        }
    }

    private static List<Profile_Widget_Allowed_Action__mdt> allowRows(String rowsJson) {
        return (List<Profile_Widget_Allowed_Action__mdt>) JSON.deserialize(rowsJson, List<Profile_Widget_Allowed_Action__mdt>.class);
    }

    @IsTest
    static void testIsActionAllowed_emptyAllowlistAllowsAll() {
        CustomerProfileWidgetController.allowedActionsOverride = new List<Profile_Widget_Allowed_Action__mdt>();
        System.assert(CustomerProfileWidgetController.isActionAllowed('Flow', 'Anything_Goes'));
        System.assert(!CustomerProfileWidgetController.isActionAllowed('Flow', ' '), 'Blank names are never allowed');
    }

    @IsTest
    static void testIsActionAllowed_enforcesTypeAndName() {
        CustomerProfileWidgetController.allowedActionsOverride = allowRows(
            '[{"Action_Type__c":"Flow","Api_Name__c":"DC_MLCSAT"},{"Action_Type__c":"Apex","Api_Name__c":"DC_UnifiedAccounts"}]'
        );
        System.assert(CustomerProfileWidgetController.isActionAllowed('Flow', 'dc_mlcsat'));
        System.assert(CustomerProfileWidgetController.isActionAllowed('Apex', 'DC_UnifiedAccounts'));
        System.assert(!CustomerProfileWidgetController.isActionAllowed('Apex', 'DC_MLCSAT'), 'Type must match');
        System.assert(!CustomerProfileWidgetController.isActionAllowed('Flow', 'Delete_All_Accounts'));
    }

    @IsTest
    static void testRunSignalGaugeFlow_unlistedFlowThrows() {
        CustomerProfileWidgetController.allowedActionsOverride = allowRows(
            '[{"Action_Type__c":"Flow","Api_Name__c":"DC_MLCSAT"}]'
        );
        Account a = new Account(Name = 'Allowlist Co');
        insert a;
        Boolean threw = false;
        try {
            CustomerProfileWidgetController.runSignalGaugeFlow('Delete_All_Accounts', a.Id, 'recordId', 'prediction');
        } catch (AuraHandledException e) {
            threw = true;
            System.assert(e.getMessage().contains('allowlist'), e.getMessage());
        }
        System.assert(threw, 'Unlisted flow must be rejected before it runs');
    }
}
