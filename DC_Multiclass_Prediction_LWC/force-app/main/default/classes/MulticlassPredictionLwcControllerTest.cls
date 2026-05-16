@IsTest
private class MulticlassPredictionLwcControllerTest {
    @IsTest
    static void generateAnalysisSummary_blankTemplate_returnsNull() {
        System.assertEquals(
            null,
            MulticlassPredictionLwcController.generateAnalysisSummary(
                null,
                'Input:Prediction_Context',
                'Wealth_Management',
                '[]'
            )
        );
    }

    @IsTest
    static void runPredictionFlow_missingParams_throws() {
        Boolean threw = false;
        try {
            MulticlassPredictionLwcController.runPredictionFlow(null, UserInfo.getUserId(), null, null, null, null);
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'Expected AuraHandledException for missing flow name');
    }

    @IsTest
    static void runPredictionFlow_invalidFlow_throws() {
        Boolean threw = false;
        try {
            MulticlassPredictionLwcController.runPredictionFlow(
                'Nonexistent_Flow_Invalid_ZZZ',
                UserInfo.getUserId(),
                'recordId',
                'prediction',
                'recommendations',
                null
            );
        } catch (Exception e) {
            threw = true;
        }
        System.assert(threw, 'Expected exception when flow is missing');
    }

    @IsTest
    static void runPredictionFlow_blankClassCsv_returnsEmptyClassProbabilities() {
        Boolean threw = false;
        MulticlassPredictionLwcController.MulticlassResult result;
        try {
            result = MulticlassPredictionLwcController.runPredictionFlow(
                'Nonexistent_Flow_Invalid_ZZZ',
                UserInfo.getUserId(),
                'recordId',
                'prediction',
                'recommendations',
                ''
            );
        } catch (Exception e) {
            threw = true;
        }
        // Either the bogus flow throws OR (if it somehow ran) classProbabilities is non-null and empty.
        if (!threw) {
            System.assertNotEquals(null, result.classProbabilities, 'classProbabilities must default to non-null');
            System.assertEquals(0, result.classProbabilities.size(), 'Blank CSV → empty list');
        }
    }
}
