@IsTest
private class ClassificationModelLwcControllerTest {
    @IsTest
    static void generateAnalysisSummary_blankTemplate_returnsNull() {
        System.assertEquals(
            null,
            ClassificationModelLwcController.generateAnalysisSummary(
                null,
                'Input:Prediction_Context',
                50.5,
                '[]',
                '[]',
                null
            )
        );
    }

    @IsTest
    static void runPredictionFlow_missingParams_throws() {
        Boolean threw = false;
        try {
            ClassificationModelLwcController.runPredictionFlow(null, UserInfo.getUserId(), null, null, null, null);
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'Expected AuraHandledException for missing flow name');
    }

    @IsTest
    static void runPredictionFlow_invalidFlow_throws() {
        Boolean threw = false;
        try {
            ClassificationModelLwcController.runPredictionFlow(
                'Nonexistent_Flow_Invalid_ZZZ',
                UserInfo.getUserId(),
                'recordId',
                'prediction',
                'factors',
                'recommendations'
            );
        } catch (Exception e) {
            threw = true;
        }
        System.assert(threw, 'Expected exception when flow is missing');
    }
}
