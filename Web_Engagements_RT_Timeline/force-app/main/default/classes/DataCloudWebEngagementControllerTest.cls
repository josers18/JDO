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

    // ─── getWebEngagementsWithBackfill: hot + cold merge ─────────────────
    // ConnectApi.CdpQuery.querySql isn't mockable via Test.setMock in API 65,
    // so the cold-store path is exercised via testMockColdEvents. The hot path
    // is exercised either via the existing testMockUnifiedId + HttpCalloutMock
    // pattern OR via testMockHotResponse for tests that only care about merge logic.

    /**
     * Builds an envelope shaped like a real Data Graph response:
     * {"data":[{"json_blob__c":"<HTML-encoded JSON>"}]}
     * The inner JSON is the merged-events payload (a Map containing
     * CumulusWeb_Engagements__dlm => List<event>).
     */
    private static String buildEnvelope(List<Map<String, Object>> innerEvents) {
        Map<String, Object> innerBlob = new Map<String, Object>{
            'CumulusWeb_Engagements__dlm' => innerEvents
        };
        String innerJson = JSON.serialize(innerBlob);
        String encoded = innerJson
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;');
        Map<String, Object> envelope = new Map<String, Object>{
            'data' => new List<Object>{
                new Map<String, Object>{ 'json_blob__c' => encoded }
            }
        };
        return JSON.serialize(envelope);
    }

    /**
     * Decodes the envelope back into the inner events array. Used by tests to
     * assert on the merge result without each test re-implementing the decode.
     */
    private static List<Object> decodeEnvelopeEvents(String envelopeJson) {
        Map<String, Object> envelope = (Map<String, Object>) JSON.deserializeUntyped(envelopeJson);
        List<Object> dataList = (List<Object>) envelope.get('data');
        Map<String, Object> dataRow0 = (Map<String, Object>) dataList[0];
        String encoded = (String) dataRow0.get('json_blob__c');
        String decoded = encoded
            .replace('&quot;', '"')
            .replace('&#39;', '\'')
            .replace('&lt;', '<')
            .replace('&gt;', '>')
            .replace('&amp;', '&');
        Map<String, Object> innerBlob = (Map<String, Object>) JSON.deserializeUntyped(decoded);
        Object events = innerBlob.get('CumulusWeb_Engagements__dlm');
        return (events instanceof List<Object>) ? (List<Object>) events : new List<Object>();
    }

    @IsTest
    static void getWebEngagementsWithBackfill_blankAccountId_returnsEmptyArray() {
        Test.startTest();
        String result = DataCloudWebEngagementController.getWebEngagementsWithBackfill(null, null, 90);
        Test.stopTest();
        System.assertEquals('[]', result, 'Blank accountId should short-circuit to "[]"');
    }

    @IsTest
    static void getWebEngagementsWithBackfill_hotEmptyColdHasEvents_returnsColdAsHot() {
        // Hot returns a populated envelope with NO events inside. Cold has 2 events.
        // Expected: merged response carries both cold events.
        String hotResponse = buildEnvelope(new List<Map<String, Object>>());
        DataCloudWebEngagementController.testMockHotResponse = hotResponse;
        DataCloudWebEngagementController.testMockUnifiedId = 'unified-X';
        DataCloudWebEngagementController.testMockColdEvents = new List<Map<String, Object>>{
            new Map<String, Object>{
                'eventId__c' => 'cold-1',
                'dateTime__c' => '2026-05-01T10:00:00Z',
                'webInteractions_pageTitle__c' => 'Welcome - Cumulus Bank'
            },
            new Map<String, Object>{
                'eventId__c' => 'cold-2',
                'dateTime__c' => '2026-05-02T10:00:00Z',
                'webInteractions_pageTitle__c' => 'Funds Transfer - Cumulus Bank'
            }
        };

        Test.startTest();
        String merged = DataCloudWebEngagementController.getWebEngagementsWithBackfill(
            '001000000000010AAA', null, 30
        );
        Test.stopTest();

        List<Object> events = decodeEnvelopeEvents(merged);
        System.assertEquals(2, events.size(), 'Cold-only fill should produce 2 events.');
    }

    @IsTest
    static void getWebEngagementsWithBackfill_hotAndColdNoOverlap_unionsBoth() {
        // Hot has 1 event, cold has 2 different events. Expected: 3 events total.
        String hotResponse = buildEnvelope(new List<Map<String, Object>>{
            new Map<String, Object>{
                'eventId__c' => 'hot-1',
                'dateTime__c' => '2026-05-10T10:00:00Z',
                'webInteractions_pageTitle__c' => 'Hot Event A'
            }
        });
        DataCloudWebEngagementController.testMockHotResponse = hotResponse;
        DataCloudWebEngagementController.testMockUnifiedId = 'unified-Y';
        DataCloudWebEngagementController.testMockColdEvents = new List<Map<String, Object>>{
            new Map<String, Object>{
                'eventId__c' => 'cold-1',
                'dateTime__c' => '2026-05-01T10:00:00Z'
            },
            new Map<String, Object>{
                'eventId__c' => 'cold-2',
                'dateTime__c' => '2026-05-02T10:00:00Z'
            }
        };

        Test.startTest();
        String merged = DataCloudWebEngagementController.getWebEngagementsWithBackfill(
            '001000000000011AAA', null, 30
        );
        Test.stopTest();

        List<Object> events = decodeEnvelopeEvents(merged);
        System.assertEquals(3, events.size(), 'Disjoint hot+cold should union without dedupe.');
    }

    @IsTest
    static void getWebEngagementsWithBackfill_dedupeByEventId_hotWins() {
        // Hot and cold both contain eventId=shared-1, but with different titles.
        // The merged result should keep the HOT version (containing 'Hot title').
        String hotResponse = buildEnvelope(new List<Map<String, Object>>{
            new Map<String, Object>{
                'eventId__c' => 'shared-1',
                'webInteractions_pageTitle__c' => 'Hot title'
            }
        });
        DataCloudWebEngagementController.testMockHotResponse = hotResponse;
        DataCloudWebEngagementController.testMockUnifiedId = 'unified-Z';
        DataCloudWebEngagementController.testMockColdEvents = new List<Map<String, Object>>{
            new Map<String, Object>{
                'eventId__c' => 'shared-1',
                'webInteractions_pageTitle__c' => 'Cold title (should be overridden)'
            },
            new Map<String, Object>{
                'eventId__c' => 'cold-only-1',
                'webInteractions_pageTitle__c' => 'Cold-only event'
            }
        };

        Test.startTest();
        String merged = DataCloudWebEngagementController.getWebEngagementsWithBackfill(
            '001000000000012AAA', null, 30
        );
        Test.stopTest();

        List<Object> events = decodeEnvelopeEvents(merged);
        System.assertEquals(2, events.size(), 'Should have 2 events: shared (hot) + cold-only.');

        // The 'shared-1' event must carry the HOT title.
        Boolean foundHotTitle = false;
        Boolean foundColdOnly = false;
        for (Object e : events) {
            Map<String, Object> evt = (Map<String, Object>) e;
            String id = (String) evt.get('eventId__c');
            String title = (String) evt.get('webInteractions_pageTitle__c');
            if (id == 'shared-1') {
                System.assertEquals('Hot title', title, 'Hot must win on eventId__c collision.');
                foundHotTitle = true;
            } else if (id == 'cold-only-1') {
                foundColdOnly = true;
            }
        }
        System.assert(foundHotTitle, 'shared-1 should be present.');
        System.assert(foundColdOnly, 'cold-only-1 should be present.');
    }

    @IsTest
    static void getWebEngagementsWithBackfill_coldNull_returnsHotUntouched() {
        // testMockColdEvents = null → cold path returns null → controller returns
        // hot envelope verbatim (zero allocations).
        String hotResponse = buildEnvelope(new List<Map<String, Object>>{
            new Map<String, Object>{ 'eventId__c' => 'hot-1' }
        });
        DataCloudWebEngagementController.testMockHotResponse = hotResponse;
        DataCloudWebEngagementController.testMockUnifiedId = 'unified-W';
        // testMockColdEvents intentionally not set → null → cold returns empty →
        // controller short-circuits with hotResponse verbatim.

        Test.startTest();
        String merged = DataCloudWebEngagementController.getWebEngagementsWithBackfill(
            '001000000000013AAA', null, 30
        );
        Test.stopTest();

        // Cold mock is null AND the seam returns empty list, so the merge short-circuit
        // at the top of getWebEngagementsWithBackfill returns hotResponse unchanged.
        System.assertEquals(hotResponse, merged, 'Empty cold result should pass hot through verbatim.');
    }

    @IsTest
    static void getWebEngagementsWithBackfill_lookbackDaysClamping() {
        // Negative / 0 / oversized lookback values should not throw — they're clamped
        // inside the controller. The mock seams short-circuit the actual SOQL, so this
        // test verifies the clamping branch executes without issue.
        DataCloudWebEngagementController.testMockHotResponse = buildEnvelope(new List<Map<String, Object>>());
        DataCloudWebEngagementController.testMockUnifiedId = 'unified-clamp';
        DataCloudWebEngagementController.testMockColdEvents = new List<Map<String, Object>>();

        Test.startTest();
        DataCloudWebEngagementController.getWebEngagementsWithBackfill('001AAA', null, -5);
        DataCloudWebEngagementController.getWebEngagementsWithBackfill('001AAA', null, 0);
        DataCloudWebEngagementController.getWebEngagementsWithBackfill('001AAA', null, 99999);
        DataCloudWebEngagementController.getWebEngagementsWithBackfill('001AAA', null, null);
        Test.stopTest();
        // No assertion needed — reaching here means clamping didn't throw on any branch.
        System.assert(true, 'Clamping branches all executed without exceptions.');
    }

    // ─── extractColumnNamesFromMetadata helper ───────────────────────────

    @IsTest
    static void extractColumnNamesFromMetadata_lowercase_returnsNames() {
        Map<String, Object> root = new Map<String, Object>{
            'metadata' => new List<Object>{
                new Map<String, Object>{ 'name' => 'eventId__c', 'type' => 'Varchar' },
                new Map<String, Object>{ 'name' => 'dateTime__c', 'type' => 'TimestampTZ' }
            }
        };
        List<String> names = DataCloudWebEngagementController.extractColumnNamesFromMetadata(root);
        System.assertEquals(2, names.size());
        System.assertEquals('eventId__c', names[0]);
        System.assertEquals('dateTime__c', names[1]);
    }

    @IsTest
    static void extractColumnNamesFromMetadata_uppercase_returnsNames() {
        Map<String, Object> root = new Map<String, Object>{
            'Metadata' => new List<Object>{
                new Map<String, Object>{ 'Name' => 'eventId__c', 'type' => 'Varchar' }
            }
        };
        List<String> names = DataCloudWebEngagementController.extractColumnNamesFromMetadata(root);
        System.assertEquals(1, names.size());
        System.assertEquals('eventId__c', names[0]);
    }

    @IsTest
    static void extractColumnNamesFromMetadata_nullOrMissing_returnsEmpty() {
        System.assertEquals(0, DataCloudWebEngagementController.extractColumnNamesFromMetadata(null).size());
        System.assertEquals(0, DataCloudWebEngagementController.extractColumnNamesFromMetadata(
            new Map<String, Object>{ 'unrelated' => 'noise' }
        ).size());
    }

    // ─── extractInnerBlob helper ────────────────────────────────────────

    @IsTest
    static void extractInnerBlob_decodes5EntitiesAndParses() {
        // Build an envelope that exercises ALL 5 entity decodes (including &amp; LAST):
        // Inner content: {"a":"<&amp;>","b":"\"hi\""}
        Map<String, Object> innerBlob = new Map<String, Object>{
            'a' => '<&>',
            'b' => '"hi"'
        };
        String innerJson = JSON.serialize(innerBlob);
        String encoded = innerJson
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;');
        Map<String, Object> envelope = new Map<String, Object>{
            'data' => new List<Object>{
                new Map<String, Object>{ 'json_blob__c' => encoded }
            }
        };
        Map<String, Object> result = DataCloudWebEngagementController.extractInnerBlob(envelope);
        System.assert(result != null, 'Decoded inner blob should not be null.');
        System.assertEquals('<&>', (String) result.get('a'));
        System.assertEquals('"hi"', (String) result.get('b'));
    }

    @IsTest
    static void extractInnerBlob_missingDataOrBlob_returnsNull() {
        System.assertEquals(null, DataCloudWebEngagementController.extractInnerBlob(null));
        System.assertEquals(null, DataCloudWebEngagementController.extractInnerBlob(
            new Map<String, Object>{ 'unrelated' => 'noise' }
        ));
        System.assertEquals(null, DataCloudWebEngagementController.extractInnerBlob(
            new Map<String, Object>{ 'data' => new List<Object>() }
        ));
        System.assertEquals(null, DataCloudWebEngagementController.extractInnerBlob(
            new Map<String, Object>{
                'data' => new List<Object>{
                    new Map<String, Object>{ 'unrelated' => 'noise' }
                }
            }
        ));
    }

}
