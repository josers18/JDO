@IsTest
private class DcBridgeRestTest {
    private static void setupRequest(String body) {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/dc/query';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf(body);
        RestContext.request = req;
        RestContext.response = new RestResponse();
    }

    private static Map<String, Object> parseBody() {
        return (Map<String, Object>) JSON.deserializeUntyped(RestContext.response.responseBody.toString());
    }

    @IsTest
    static void rejectsBlankSql() {
        setupRequest('{"sql":"   "}');
        Test.startTest();
        DcBridgeRest.query();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'blank SQL should 400');
        System.assert(parseBody().containsKey('error'), 'should carry error');
    }

    @IsTest
    static void rejectsMutatingSql() {
        setupRequest('{"sql":"DELETE FROM ssot__Account__dlm"}');
        Test.startTest();
        DcBridgeRest.query();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'mutating SQL should 400');
    }

    @IsTest
    static void rejectsNonSelect() {
        setupRequest('{"sql":"CREATE TABLE x (a int)"}');
        Test.startTest();
        DcBridgeRest.query();
        Test.stopTest();
        System.assertEquals(400, RestContext.response.statusCode, 'non-SELECT should 400');
    }

    @IsTest
    static void acceptsSelectAndReturnsRows() {
        setupRequest('{"sql":"SELECT Id__c, churn__c FROM Bank_Churner__dlm","maxRows":10}');
        DcBridgeRest.mockRowsForTest = new List<Map<String, Object>>{
            new Map<String, Object>{ 'Id__c' => 'a1', 'churn__c' => 0.8 }
        };
        Test.startTest();
        DcBridgeRest.query();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'valid SELECT should 200');
        Map<String, Object> out = parseBody();
        System.assertEquals(1, out.get('rowCount'), 'one row expected');
        List<Object> cols = (List<Object>) out.get('columns');
        System.assertEquals(2, cols.size(), 'two derived columns');
    }

    @IsTest
    static void acceptsWithClauseAndEmptyRows() {
        setupRequest('{"sql":"WITH c AS (SELECT 1) SELECT * FROM c"}');
        DcBridgeRest.mockRowsForTest = new List<Map<String, Object>>();
        Test.startTest();
        DcBridgeRest.query();
        Test.stopTest();
        System.assertEquals(200, RestContext.response.statusCode, 'WITH should be allowed');
        System.assertEquals(0, parseBody().get('rowCount'), 'zero rows ok');
    }
}
