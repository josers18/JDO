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
}
