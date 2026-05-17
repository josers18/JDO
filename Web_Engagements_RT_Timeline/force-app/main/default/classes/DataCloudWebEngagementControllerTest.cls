@IsTest
private class DataCloudWebEngagementControllerTest {

    /**
     * Reusable HttpCalloutMock for the Data Graph endpoint.
     * Caller sets statusCode + body; respond() echoes them back.
     */
    private class DataGraphMock implements HttpCalloutMock {
        Integer statusCode;
        String body;

        DataGraphMock(Integer statusCode, String body) {
            this.statusCode = statusCode;
            this.body = body;
        }

        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(this.statusCode);
            res.setHeader('Content-Type', 'application/json');
            res.setBody(this.body);
            return res;
        }
    }

    @IsTest
    static void getWebEngagementData_blankAccountId_returnsEmptyArray() {
        Test.startTest();
        String resultNull  = DataCloudWebEngagementController.getWebEngagementData(null);
        String resultEmpty = DataCloudWebEngagementController.getWebEngagementData('');
        String resultBlank = DataCloudWebEngagementController.getWebEngagementData('   ');
        Test.stopTest();

        System.assertEquals('[]', resultNull,  'null accountId should return []');
        System.assertEquals('[]', resultEmpty, 'empty accountId should return []');
        System.assertEquals('[]', resultBlank, 'whitespace accountId should return []');
    }

    @IsTest
    static void getWebEngagementData_happyPath_returnsMockedDataGraphBody() {
        // Arrange: seam fakes the unified ID; HttpCalloutMock fakes the Data Graph response.
        String fakeUnifiedId = 'unified-12345';
        String fakeBody = '{"data":[{"json_blob__c":"{\\"CumulusWeb_Engagements__dlm\\":[]}"}]}';

        DataCloudWebEngagementController.testMockUnifiedId = fakeUnifiedId;
        Test.setMock(HttpCalloutMock.class, new DataGraphMock(200, fakeBody));

        // Act
        Test.startTest();
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000001AAA');
        Test.stopTest();

        // Assert
        System.assertEquals(fakeBody, result, 'Controller should return the HTTP response body verbatim on 200.');
    }

    @IsTest
    static void getWebEngagementData_http500_returnsEmptyArray() {
        DataCloudWebEngagementController.testMockUnifiedId = 'unified-9';
        Test.setMock(HttpCalloutMock.class, new DataGraphMock(500, '{"error":"upstream timeout"}'));

        Test.startTest();
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000002AAA');
        Test.stopTest();

        // Controller's catch block on non-200 returns '[]' (see DataCloudWebEngagementController.cls:42).
        System.assertEquals('[]', result, 'Non-200 response should yield "[]" sentinel.');
    }

    @IsTest
    static void getWebEngagementData_http404_returnsEmptyArray() {
        DataCloudWebEngagementController.testMockUnifiedId = 'unified-404';
        Test.setMock(HttpCalloutMock.class, new DataGraphMock(404, '{"error":"data graph not found"}'));

        Test.startTest();
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000003AAA');
        Test.stopTest();

        System.assertEquals('[]', result, '404 should also yield "[]".');
    }

    @IsTest
    static void getWebEngagementData_noUnifiedId_returnsEmptyArray() {
        // Empty string from the seam means "no unified ID found" — controller's
        // String.isBlank(unifiedId) check at line 19-22 short-circuits to '[]'
        // without firing the HTTP callout.
        DataCloudWebEngagementController.testMockUnifiedId = '';

        // Mock the HTTP layer too, just so a stray callout (regression) would
        // fail loudly with a TestException rather than a real network attempt.
        Test.setMock(HttpCalloutMock.class, new DataGraphMock(500, 'should not be called'));

        Test.startTest();
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000004AAA');
        Test.stopTest();

        System.assertEquals('[]', result, 'Empty unified ID should short-circuit to "[]" without HTTP.');
    }

    // Tests follow in subsequent tasks.
}
