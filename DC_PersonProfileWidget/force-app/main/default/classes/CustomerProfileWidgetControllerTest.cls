@IsTest
private class CustomerProfileWidgetControllerTest {
    private class DataGraphSuccessMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setHeader('Content-Type', 'application/json');
            res.setBody(
                '{"firstName":"Graph","lastName":"Client","mailingCity":"Boston","mailingState":"MA",' +
                    '"propensityScore":82,"engagementScore":64,"churnScore":18,"lifetimeValueScore":71,' +
                    '"annualRevenue":1250000,"investmentBalance":420000,"loanBalance":88000,"depositYtd":240000,' +
                    '"customerTier":"Private","mobileEnrolled":true,"onlineEnrolled":false}'
            );
            return res;
        }
    }

    private class DataGraphErrorMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(500);
            res.setBody('{"error":"fail"}');
            return res;
        }
    }

    private class NestedGraphMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setHeader('Content-Type', 'application/json');
            res.setBody(
                '{"party":{"individual":{"fn":"Sam","ln":"Delta","cty":"Seattle","st":"WA"}}}'
            );
            return res;
        }
    }

    @IsTest
    static void testGetProfileDataWithMockDataGraph() {
        Account a = new Account(Name = 'SOQL Merge Co', BillingCity = 'Denver', BillingState = 'CO');
        insert a;

        String mappings =
            '{"firstName":"firstName","lastName":"lastName","city":"mailingCity","state":"mailingState",' +
            '"revenue":"annualRevenue","propensityScore":"propensityScore","engagementScore":"engagementScore",' +
            '"churnScore":"churnScore","ltvScore":"lifetimeValueScore","investmentBalance":"investmentBalance",' +
            '"loanBalance":"loanBalance","depositYtd":"depositYtd","tierSegment":"customerTier",' +
            '"mobileEnrolled":"mobileEnrolled","onlineEnrolled":"onlineEnrolled"}';

        Test.setMock(HttpCalloutMock.class, new DataGraphSuccessMock());
        Test.startTest();
        CustomerProfileWidgetController.ProfileResult res = CustomerProfileWidgetController.getProfileData(
            'Test_Graph',
            a.Id,
            mappings,
            null,
            null,
            null,
            null,
            'accountId__c'
        );
        Test.stopTest();

        System.assertEquals('Graph Client', res.fullName);
        System.assertEquals('Boston', res.city);
        System.assertEquals('Private', res.tierSegment);
        System.assertEquals(true, res.mobileEnrolled);
        System.assertEquals(false, res.onlineEnrolled);
    }

    @IsTest
    static void testGetProfileDataGraphHttpError() {
        Account a = new Account(Name = 'X');
        insert a;
        Test.setMock(HttpCalloutMock.class, new DataGraphErrorMock());
        Boolean threw = false;
        Test.startTest();
        try {
            CustomerProfileWidgetController.getProfileData(
                'Bad_Graph',
                a.Id,
                '{}',
                null,
                null,
                null,
                null,
                null
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'Expected AuraHandledException on HTTP error');
    }

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
            '',
            a.Id,
            '{}',
            null,
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
            '',
            c.Id,
            '{}',
            null,
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
        CustomerProfileWidgetController.ProfileResult r = CustomerProfileWidgetController.buildFallbackFromSoql('bad', new Map<String, String>());
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
    static void testGetProfileData_invalidFieldMappingsJson_usesSoql() {
        Account a = new Account(Name = 'Parse Test', BillingCity = 'Chicago');
        insert a;
        Test.startTest();
        CustomerProfileWidgetController.ProfileResult r = CustomerProfileWidgetController.getProfileData(
            '',
            a.Id,
            '{not valid json',
            null,
            null,
            null,
            null,
            null
        );
        Test.stopTest();
        System.assertEquals('Parse Test', r.fullName);
        System.assertEquals('Chicago', r.city);
    }

    @IsTest
    static void testGetProfileData_nestedGraphPaths() {
        Account a = new Account(Name = 'Nested SOQL');
        insert a;
        Test.setMock(HttpCalloutMock.class, new NestedGraphMock());
        String mappings =
            '{"firstName":"party.individual.fn","lastName":"party.individual.ln","city":"party.individual.cty"}';
        Test.startTest();
        CustomerProfileWidgetController.ProfileResult r = CustomerProfileWidgetController.getProfileData(
            'Nested_Graph',
            a.Id,
            mappings,
            null,
            null,
            null,
            null,
            null
        );
        Test.stopTest();
        System.assertEquals('Sam Delta', r.fullName);
        System.assertEquals('Seattle', r.city);
    }
}
