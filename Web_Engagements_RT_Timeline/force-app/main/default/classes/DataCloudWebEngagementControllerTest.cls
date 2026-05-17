@IsTest
private class DataCloudWebEngagementControllerTest {

    /**
     * HttpCalloutMock that captures the inbound request endpoint URL,
     * exposing it via a public `capturedEndpoint` field. Used to assert
     * that the controller built the expected URL from its parameters.
     */
    private class CapturingMock implements HttpCalloutMock {
        public String capturedEndpoint;
        public HttpResponse respond(HttpRequest req) {
            this.capturedEndpoint = req.getEndpoint();
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setHeader('Content-Type', 'application/json');
            res.setBody('{"data":[]}');
            return res;
        }
    }

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
        String resultNull  = DataCloudWebEngagementController.getWebEngagementData(null, null);
        String resultEmpty = DataCloudWebEngagementController.getWebEngagementData('', null);
        String resultBlank = DataCloudWebEngagementController.getWebEngagementData('   ', null);
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
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000001AAA', null);
        Test.stopTest();

        // Assert
        System.assertEquals(fakeBody, result, 'Controller should return the HTTP response body verbatim on 200.');
    }

    @IsTest
    static void getWebEngagementData_http500_returnsEmptyArray() {
        DataCloudWebEngagementController.testMockUnifiedId = 'unified-9';
        Test.setMock(HttpCalloutMock.class, new DataGraphMock(500, '{"error":"upstream timeout"}'));

        Test.startTest();
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000002AAA', null);
        Test.stopTest();

        // Controller's else branch on non-200 returns '[]' (see DataCloudWebEngagementController.cls:45-47).
        System.assertEquals('[]', result, 'Non-200 response should yield "[]" sentinel.');
    }

    @IsTest
    static void getWebEngagementData_http404_returnsEmptyArray() {
        DataCloudWebEngagementController.testMockUnifiedId = 'unified-404';
        Test.setMock(HttpCalloutMock.class, new DataGraphMock(404, '{"error":"data graph not found"}'));

        Test.startTest();
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000003AAA', null);
        Test.stopTest();

        System.assertEquals('[]', result, '404 should also yield "[]".');
    }

    @IsTest
    static void getWebEngagementData_noUnifiedId_returnsEmptyArray() {
        // Empty string from the seam means "no unified ID found" — controller's
        // String.isBlank(unifiedId) check at lines 25-27 short-circuits to '[]'
        // without firing the HTTP callout.
        DataCloudWebEngagementController.testMockUnifiedId = '';

        // Mock the HTTP layer too, just so a stray callout (regression) would
        // fail loudly with a TestException rather than a real network attempt.
        Test.setMock(HttpCalloutMock.class, new DataGraphMock(500, 'should not be called'));

        Test.startTest();
        String result = DataCloudWebEngagementController.getWebEngagementData('001000000000004AAA', null);
        Test.stopTest();

        System.assertEquals('[]', result, 'Empty unified ID should short-circuit to "[]" without HTTP.');
    }

    /**
     * HttpCalloutMock that always throws — simulates network-level failure
     * (DNS, TLS, certificate). Controller's outer try/catch wraps any
     * Exception into AuraHandledException at lines 50-55.
     */
    private class ThrowingMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            throw new CalloutException('simulated DNS failure');
        }
    }

    @IsTest
    static void getWebEngagementData_calloutException_throwsAuraHandledException() {
        DataCloudWebEngagementController.testMockUnifiedId = 'unified-throw';
        Test.setMock(HttpCalloutMock.class, new ThrowingMock());

        Boolean threw = false;
        Test.startTest();
        try {
            DataCloudWebEngagementController.getWebEngagementData('001000000000005AAA', null);
        } catch (AuraHandledException e) {
            threw = true;
            // Note: AuraHandledException.getMessage() returns the *configured* message,
            // which the controller sets via ahe.setMessage(e.getMessage()).
            System.assert(
                String.isNotBlank(e.getMessage()),
                'AuraHandledException should carry a non-blank message.'
            );
        }
        Test.stopTest();

        System.assert(threw, 'Expected AuraHandledException to bubble up.');
    }

    @IsTest
    static void getWebEngagementData_customDataGraphName_buildsEndpointWithIt() {
        DataCloudWebEngagementController.testMockUnifiedId = 'unified-custom';
        CapturingMock mock = new CapturingMock();
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        DataCloudWebEngagementController.getWebEngagementData(
            '001000000000099AAA',
            'My_Custom_DataGraph'
        );
        Test.stopTest();

        // The endpoint should contain the custom data graph name segment, NOT
        // the default RT_Web_Engagementsv2.
        System.assert(
            mock.capturedEndpoint != null,
            'Mock should have captured an endpoint.'
        );
        System.assert(
            mock.capturedEndpoint.contains('/data/My_Custom_DataGraph/'),
            'Endpoint should embed the custom dataGraphName: ' + mock.capturedEndpoint
        );
        System.assert(
            !mock.capturedEndpoint.contains('RT_Web_Engagementsv2'),
            'Endpoint should NOT contain the default when a custom name is passed: ' + mock.capturedEndpoint
        );
    }

    @IsTest
    static void getWebEngagementData_blankDataGraphName_fallsBackToDefault() {
        DataCloudWebEngagementController.testMockUnifiedId = 'unified-default';
        CapturingMock mock = new CapturingMock();
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        DataCloudWebEngagementController.getWebEngagementData(
            '001000000000098AAA',
            ''
        );
        Test.stopTest();

        System.assert(
            mock.capturedEndpoint != null && mock.capturedEndpoint.contains('/data/RT_Web_Engagementsv2/'),
            'Blank dataGraphName should fall back to the default constant: ' + mock.capturedEndpoint
        );
    }

    // ─── extractUnifiedIdFromQueryOutput parser tests ────────────────────
    // These test the helper directly via the @TestVisible seam, since
    // ConnectApi.CdpQuery.querySql is not mockable in API 65.0.

    @IsTest
    static void extractUnifiedIdFromQueryOutput_dataRowsAndRowData_returnsValue() {
        Map<String, Object> result = new Map<String, Object>{
            'dataRows' => new List<Object>{
                new Map<String, Object>{ 'rowData' => new List<Object>{ 'unified-A' } }
            }
        };
        String id = DataCloudWebEngagementController.extractUnifiedIdFromQueryOutput(result);
        System.assertEquals('unified-A', id, 'dataRows + rowData shape should yield first value.');
    }

    @IsTest
    static void extractUnifiedIdFromQueryOutput_dataRowsAndRow_returnsValue() {
        Map<String, Object> result = new Map<String, Object>{
            'dataRows' => new List<Object>{
                new Map<String, Object>{ 'row' => new List<Object>{ 'unified-B' } }
            }
        };
        String id = DataCloudWebEngagementController.extractUnifiedIdFromQueryOutput(result);
        System.assertEquals('unified-B', id, 'dataRows + row shape should yield first value.');
    }

    @IsTest
    static void extractUnifiedIdFromQueryOutput_dataAndRowData_returnsValue() {
        Map<String, Object> result = new Map<String, Object>{
            'data' => new List<Object>{
                new Map<String, Object>{ 'rowData' => new List<Object>{ 'unified-C' } }
            }
        };
        String id = DataCloudWebEngagementController.extractUnifiedIdFromQueryOutput(result);
        System.assertEquals('unified-C', id, 'data + rowData shape should yield first value.');
    }

    @IsTest
    static void extractUnifiedIdFromQueryOutput_dataAndRow_returnsValue() {
        Map<String, Object> result = new Map<String, Object>{
            'data' => new List<Object>{
                new Map<String, Object>{ 'row' => new List<Object>{ 'unified-D' } }
            }
        };
        String id = DataCloudWebEngagementController.extractUnifiedIdFromQueryOutput(result);
        System.assertEquals('unified-D', id, 'data + row shape should yield first value.');
    }

    @IsTest
    static void extractUnifiedIdFromQueryOutput_nullResult_returnsNull() {
        System.assertEquals(
            null,
            DataCloudWebEngagementController.extractUnifiedIdFromQueryOutput(null),
            'null input should yield null.'
        );
    }

    @IsTest
    static void extractUnifiedIdFromQueryOutput_missingRowsKey_returnsNull() {
        Map<String, Object> result = new Map<String, Object>{ 'unrelated' => 'noise' };
        System.assertEquals(
            null,
            DataCloudWebEngagementController.extractUnifiedIdFromQueryOutput(result),
            'Map with neither dataRows nor data should yield null.'
        );
    }

    @IsTest
    static void extractUnifiedIdFromQueryOutput_emptyRows_returnsNull() {
        Map<String, Object> result = new Map<String, Object>{
            'dataRows' => new List<Object>()
        };
        System.assertEquals(
            null,
            DataCloudWebEngagementController.extractUnifiedIdFromQueryOutput(result),
            'Empty dataRows list should yield null.'
        );
    }

    @IsTest
    static void extractUnifiedIdFromQueryOutput_rowMissingValuesKey_returnsNull() {
        Map<String, Object> result = new Map<String, Object>{
            'data' => new List<Object>{
                new Map<String, Object>{ 'unrelated' => 'noise' }
            }
        };
        System.assertEquals(
            null,
            DataCloudWebEngagementController.extractUnifiedIdFromQueryOutput(result),
            'Row map with neither rowData nor row should yield null.'
        );
    }

    @IsTest
    static void extractUnifiedIdFromQueryOutput_emptyValues_returnsNull() {
        Map<String, Object> result = new Map<String, Object>{
            'dataRows' => new List<Object>{
                new Map<String, Object>{ 'rowData' => new List<Object>() }
            }
        };
        System.assertEquals(
            null,
            DataCloudWebEngagementController.extractUnifiedIdFromQueryOutput(result),
            'Empty rowData list should yield null.'
        );
    }

}
