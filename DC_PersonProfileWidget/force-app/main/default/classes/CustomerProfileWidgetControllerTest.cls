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

}
