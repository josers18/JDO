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
                '[]',
                null
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
        } catch (AuraHandledException e) {
            threw = true;
            System.assert(e.getMessage().contains('Nonexistent_Flow_Invalid_ZZZ'), 'Message names the flow: ' + e.getMessage());
        }
        System.assert(threw, 'Expected AuraHandledException when flow is missing');
    }

    @IsTest
    static void parseClassProbabilities_blankCsv_returnsEmptyList() {
        // A blank CSV returns before the interview is touched, so a null interview is safe.
        List<MulticlassPredictionLwcController.ClassProbability> out =
            MulticlassPredictionLwcController.parseClassProbabilities(null, '  ');
        System.assertNotEquals(null, out, 'classProbabilities must default to non-null');
        System.assertEquals(0, out.size(), 'Blank CSV -> empty list');
    }

    @IsTest
    static void humanizeFieldNames_rewritesApiNamesAndPrefersLabels() {
        String input =
            '[{"fields":[{"name":"Complaint_Count__c","label":null,"inputValue":"4"}],"value":-17.1},' +
            '{"fields":[{"name":"Tenure_Years__c","label":"Tenure (Years)"}],"value":7.0},' +
            '{"name":"Direct_Deposit_c__c","inputValue":"Yes","value":15.2}]';
        List<Object> out = (List<Object>) JSON.deserializeUntyped(
            MulticlassPredictionLwcController.humanizeFieldNames(input)
        );
        System.assertEquals('Complaint Count', fieldName(out, 0));
        System.assertEquals('Tenure (Years)', fieldName(out, 1));
        System.assertEquals('Direct Deposit', ((Map<String, Object>) out[2]).get('name'), 'Flat factor shape is humanized');
        Map<String, Object> first = (Map<String, Object>) ((List<Object>) ((Map<String, Object>) out[0]).get('fields'))[0];
        System.assertEquals('4', first.get('inputValue'), 'Other keys are preserved');
    }

    @IsTest
    static void humanizeFieldNames_doubleEncoded_isUnwrapped() {
        String innerJson = '[{"fields":[{"name":"ARRGrowth__c"}],"value":3}]';
        List<Object> out = (List<Object>) JSON.deserializeUntyped(
            MulticlassPredictionLwcController.humanizeFieldNames(JSON.serialize(innerJson))
        );
        System.assertEquals('ARR Growth', fieldName(out, 0));
    }

    @IsTest
    static void humanizeFieldNames_nonArrayInput_returnedUnchanged() {
        System.assertEquals('not json', MulticlassPredictionLwcController.humanizeFieldNames('not json'));
        System.assertEquals('{"a":1}', MulticlassPredictionLwcController.humanizeFieldNames('{"a":1}'));
        System.assertEquals(null, MulticlassPredictionLwcController.humanizeFieldNames(null));
    }

    @IsTest
    static void buildPromptContext_includesClassProbabilitiesAndHumanizes() {
        Map<String, Object> ctx = (Map<String, Object>) JSON.deserializeUntyped(
            MulticlassPredictionLwcController.buildPromptContext(
                'Wealth_Management',
                '[{"fields":[{"name":"Complaint_Count__c"}],"value":-17.1}]',
                '[{"label":"Wealth Management","percent":41.2},{"label":"Retail","percent":38.0}]'
            )
        );
        System.assertEquals('Wealth_Management', ctx.get('prediction'));
        System.assertEquals('multiclass_label', ctx.get('predictionType'));
        List<Object> factors = (List<Object>) JSON.deserializeUntyped((String) ctx.get('recommendations'));
        System.assertEquals('Complaint Count', fieldName(factors, 0));
        System.assertEquals(2, ((List<Object>) ctx.get('classProbabilities')).size());
    }

    @IsTest
    static void buildPromptContext_blankOrMalformedProbabilities_omitsKey() {
        Map<String, Object> blank = (Map<String, Object>) JSON.deserializeUntyped(
            MulticlassPredictionLwcController.buildPromptContext('A', null, null)
        );
        System.assert(!blank.containsKey('classProbabilities'), 'Blank probabilities are omitted');
        System.assertEquals('[]', blank.get('recommendations'), 'Null recommendations default to an empty array');
        Map<String, Object> bad = (Map<String, Object>) JSON.deserializeUntyped(
            MulticlassPredictionLwcController.buildPromptContext('A', '[]', '{not json')
        );
        System.assert(!bad.containsKey('classProbabilities'), 'Malformed probabilities are dropped, not thrown');
    }

    private static String fieldName(List<Object> factors, Integer i) {
        List<Object> fields = (List<Object>) ((Map<String, Object>) factors[i]).get('fields');
        return (String) ((Map<String, Object>) fields[0]).get('name');
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
