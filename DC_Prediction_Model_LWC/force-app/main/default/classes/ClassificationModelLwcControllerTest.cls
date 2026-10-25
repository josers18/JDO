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
