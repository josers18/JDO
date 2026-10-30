@IsTest
private class ClassificationModelLwcControllerTest {
    @IsTest
    static void humanizeFieldNames_rewritesApiNamesAndPrefersLabels() {
        String input =
            '[{"fields":[{"name":"Complaint_Count__c","label":null,"inputValue":"4"}],"value":-17.1},' +
            '{"fields":[{"name":"Tenure_Years__c","label":"Tenure (Years)"}],"value":7.0},' +
            '{"fields":[{"name":"Direct_Deposit_c__c"}],"value":15.2}]';
        List<Object> out = (List<Object>) JSON.deserializeUntyped(
            ClassificationModelLwcController.humanizeFieldNames(input)
        );
        System.assertEquals('Complaint Count', fieldName(out, 0));
        System.assertEquals('Tenure (Years)', fieldName(out, 1));
        System.assertEquals('Direct Deposit', fieldName(out, 2));
        Map<String, Object> first = (Map<String, Object>) ((List<Object>) ((Map<String, Object>) out[0]).get('fields'))[0];
        System.assertEquals('4', first.get('inputValue'), 'Other keys are preserved');
    }

    @IsTest
    static void humanizeFieldNames_nonArrayInput_returnedUnchanged() {
        System.assertEquals('not json', ClassificationModelLwcController.humanizeFieldNames('not json'));
        System.assertEquals('{"a":1}', ClassificationModelLwcController.humanizeFieldNames('{"a":1}'));
        System.assertEquals(null, ClassificationModelLwcController.humanizeFieldNames(null));
    }

    @IsTest
    static void humanizeApiName_splitsCamelCase() {
        System.assertEquals('ARR Growth', ClassificationModelLwcController.humanizeApiName('ARRGrowth__c'));
        System.assertEquals('customer Lifetime Value', ClassificationModelLwcController.humanizeApiName('customerLifetimeValue'));
    }

    private static String fieldName(List<Object> factors, Integer i) {
        List<Object> fields = (List<Object>) ((Map<String, Object>) factors[i]).get('fields');
        return (String) ((Map<String, Object>) fields[0]).get('name');
    }

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
                null,
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
        } catch (AuraHandledException e) {
            threw = true;
            System.assert(e.getMessage().contains('Nonexistent_Flow_Invalid_ZZZ'), 'Message names the flow: ' + e.getMessage());
        }
        System.assert(threw, 'Expected AuraHandledException when flow is missing');
    }

    @IsTest
    static void buildPromptContext_withRiskContext_includesIt() {
        Map<String, Object> ctx = (Map<String, Object>) JSON.deserializeUntyped(
            ClassificationModelLwcController.buildPromptContext(
                38.2,
                '[]',
                '[]',
                ' percent ',
                '{"band":"Moderate risk","actions":[{"input":"Complaint Count","projectedRisk":12}]}'
            )
        );
        System.assertEquals(38.2, (Decimal) ctx.get('prediction'));
        System.assertEquals('percent', ctx.get('predictionOutputFormat'), 'Format is trimmed');
        Map<String, Object> risk = (Map<String, Object>) ctx.get('riskContext');
        System.assertEquals('Moderate risk', risk.get('band'));
        System.assertEquals(1, ((List<Object>) risk.get('actions')).size());
    }

    @IsTest
    static void buildPromptContext_noRiskContext_omitsKey() {
        Map<String, Object> ctx = (Map<String, Object>) JSON.deserializeUntyped(
            ClassificationModelLwcController.buildPromptContext(72, '[]', '[]', null, null)
        );
        System.assert(!ctx.containsKey('riskContext'), 'Score cards must not send riskContext');
        System.assert(!ctx.containsKey('predictionOutputFormat'), 'Blank format is omitted');
    }

    @IsTest
    static void buildPromptContext_malformedRiskContext_dropsIt() {
        Map<String, Object> ctx = (Map<String, Object>) JSON.deserializeUntyped(
            ClassificationModelLwcController.buildPromptContext(40, '[]', '[]', 'percent', '{not json')
        );
        System.assert(!ctx.containsKey('riskContext'), 'Malformed riskContext is dropped, not thrown');
        System.assertEquals('percent', ctx.get('predictionOutputFormat'));
    }

    @IsTest
    static void buildPromptContext_humanizesFactorNames() {
        Map<String, Object> ctx = (Map<String, Object>) JSON.deserializeUntyped(
            ClassificationModelLwcController.buildPromptContext(
                40,
                '[{"fields":[{"name":"Complaint_Count__c"}],"value":-17.1}]',
                '[]',
                null,
                null
            )
        );
        List<Object> factors = (List<Object>) JSON.deserializeUntyped((String) ctx.get('factors'));
        System.assertEquals('Complaint Count', fieldName(factors, 0));
    }
}
