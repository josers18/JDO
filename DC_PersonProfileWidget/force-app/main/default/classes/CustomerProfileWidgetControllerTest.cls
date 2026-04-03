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
