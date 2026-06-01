@IsTest
private class DcAgentforceOutputControllerTest {
    @IsTest
    static void runPromptFlow_blankFlow_throws() {
        Boolean threw = false;
        try {
            DcAgentforceOutputController.runPromptFlow(null, UserInfo.getUserId(), 'recordID', 'promptResponse', true, null);
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'Expected AuraHandledException for blank flow API name');
    }

    @IsTest
    static void runPromptFlow_invalidFlow_throws() {
        Boolean threw = false;
        try {
            DcAgentforceOutputController.runPromptFlow(
                'Nonexistent_Flow_ZZZ_Invalid',
                UserInfo.getUserId(),
                'recordID',
                'promptResponse',
                true,
                null
            );
        } catch (Exception e) {
            threw = true;
        }
        System.assert(threw, 'Expected exception for missing flow');
    }

    @IsTest
    static void submitGenerationFeedback_blankGenerationId_throws() {
        Boolean threw = false;
        try {
            DcAgentforceOutputController.submitGenerationFeedback(null, true, 'ok');
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'Expected AuraHandledException for blank generation Id');
    }

    @IsTest
    static void submitGenerationFeedback_oversizeText_throws() {
        // 1025-char string: cap is 1024, exclusive.
        String oversize = 'x'.repeat(1025);
        Boolean threw = false;
        try {
            DcAgentforceOutputController.submitGenerationFeedback('gen-123', true, oversize);
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'Expected AuraHandledException for >1024-char feedback text');
    }

    @IsTest
    static void flowOutputToDisplayString_string_passesThrough() {
        String result = DcAgentforceOutputController.flowOutputToDisplayString('hello world');
        System.assertEquals('hello world', result, 'String input should pass through unchanged');
    }

    @IsTest
    static void flowOutputToDisplayString_null_returnsNull() {
        Object nullObj = null;
        String result = DcAgentforceOutputController.flowOutputToDisplayString(nullObj);
        System.assertEquals(null, result, 'Null input should return null');
    }

    @IsTest
    static void flowOutputToDisplayString_sObject_returnsNull() {
        // Non-String flow output (SObject) should NOT serialize as JSON into
        // the panel — the LWC's "blank promptResponse" path produces a clearer
        // user message than a serialized payload.
        Account a = new Account(Name = 'Acme');
        String result = DcAgentforceOutputController.flowOutputToDisplayString(a);
        System.assertEquals(null, result, 'SObject input should return null (mistyped flow variable)');
    }

    @IsTest
    static void flowOutputToDisplayString_decimal_returnsNull() {
        String result = DcAgentforceOutputController.flowOutputToDisplayString((Object) 3.14);
        System.assertEquals(null, result, 'Decimal input should return null (mistyped flow variable)');
    }
}
