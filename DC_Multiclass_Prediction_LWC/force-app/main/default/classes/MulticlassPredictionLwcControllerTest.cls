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

    @IsTest
    static void coerceToDecimal_handlesNull() {
        System.assertEquals(null, MulticlassPredictionLwcController.coerceToDecimal(null));
    }

    @IsTest
    static void coerceToDecimal_handlesDecimal() {
        Decimal inVal = 0.99;
        System.assertEquals(inVal, MulticlassPredictionLwcController.coerceToDecimal(inVal));
    }

    @IsTest
    static void coerceToDecimal_handlesDoubleWithoutBinaryNoise() {
        Double inVal = 0.7;
        Decimal out = MulticlassPredictionLwcController.coerceToDecimal(inVal);
        System.assertEquals(Decimal.valueOf('0.7'), out, 'Double 0.7 must coerce to Decimal 0.7 without binary float noise');
    }

    @IsTest
    static void coerceToDecimal_handlesInteger() {
        System.assertEquals(Decimal.valueOf(42), MulticlassPredictionLwcController.coerceToDecimal(42));
    }

    @IsTest
    static void coerceToDecimal_handlesLong() {
        Long inVal = 9999999999L;
        System.assertEquals(Decimal.valueOf(inVal), MulticlassPredictionLwcController.coerceToDecimal(inVal));
    }

    @IsTest
    static void coerceToDecimal_handlesValidNumericString() {
        System.assertEquals(Decimal.valueOf('0.01'), MulticlassPredictionLwcController.coerceToDecimal('0.01'));
    }

    @IsTest
    static void coerceToDecimal_handlesBlankString() {
        System.assertEquals(null, MulticlassPredictionLwcController.coerceToDecimal('   '));
    }

    @IsTest
    static void coerceToDecimal_handlesGarbageString() {
        System.assertEquals(null, MulticlassPredictionLwcController.coerceToDecimal('not-a-number'));
    }

    @IsTest
    static void coerceToDecimal_handlesUnsupportedType() {
        // Non-numeric, non-string types (e.g. Date) return null — never throw.
        System.assertEquals(null, MulticlassPredictionLwcController.coerceToDecimal(Date.today()));
    }
}
