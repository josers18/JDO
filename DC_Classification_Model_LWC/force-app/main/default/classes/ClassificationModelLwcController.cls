/**
 * Runs an autolaunched flow for classification / prediction outputs and optionally invokes
 * Einstein Prompt Builder for a natural-language summary (LWC: classificationModelLwc).
 */
public with sharing class ClassificationModelLwcController {
    public class PredictionResult {
        @AuraEnabled
        public Decimal prediction;
        @AuraEnabled
        public String factorsJson;
        @AuraEnabled
        public String recommendationsJson;
    }

    @AuraEnabled
    public static PredictionResult runPredictionFlow(
        String flowApiName,
        Id recordId,
        String recordIdVariableName,
        String predictionVariableName,
        String factorsVariableName,
        String recommendationsVariableName
    ) {
        if (String.isBlank(flowApiName) || recordId == null) {
            throw new AuraHandledException('Flow API name and record Id are required.');
        }

        String recordVar = String.isBlank(recordIdVariableName) ? 'recordId' : recordIdVariableName;
        String predVar = String.isBlank(predictionVariableName) ? 'prediction' : predictionVariableName;
        String factorsVar = String.isBlank(factorsVariableName) ? 'factors' : factorsVariableName;
        String recVar = String.isBlank(recommendationsVariableName)
            ? 'recommendations'
            : recommendationsVariableName;

        Map<String, Object> inputs = new Map<String, Object>();
        inputs.put(recordVar, recordId);

        Flow.Interview interview = Flow.Interview.createInterview(flowApiName, inputs);
        interview.start();

        PredictionResult result = new PredictionResult();
        Object pred = interview.getVariableValue(predVar);
        if (pred instanceof Decimal) {
            result.prediction = (Decimal) pred;
        } else if (pred instanceof Integer) {
            result.prediction = Decimal.valueOf(String.valueOf(pred));
        } else if (pred != null) {
            result.prediction = Decimal.valueOf(String.valueOf(pred));
        }

        result.factorsJson = flowOutputToJsonString(resolveFlowOutput(interview, factorsVar));
        result.recommendationsJson = flowOutputToJsonString(resolveFlowOutput(interview, recVar));

        return result;
    }

    private static Object resolveFlowOutput(Flow.Interview interview, String apiName) {
        if (String.isBlank(apiName)) {
            return null;
        }
        String trimmed = apiName.trim();
        Object value = interview.getVariableValue(trimmed);
        if (value != null) {
            return value;
        }
        if (trimmed.length() > 0) {
            String firstUpper = trimmed.substring(0, 1).toUpperCase() + trimmed.substring(1);
            if (!firstUpper.equals(trimmed)) {
                value = interview.getVariableValue(firstUpper);
                if (value != null) {
                    return value;
                }
            }
            String lower = trimmed.toLowerCase();
            if (!lower.equals(trimmed)) {
                value = interview.getVariableValue(lower);
                if (value != null) {
                    return value;
                }
            }
        }
        return null;
    }

    private static String flowOutputToJsonString(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof String) {
            return (String) value;
        }
        try {
            return JSON.serialize(value);
        } catch (Exception e) {
            return String.valueOf(value);
        }
    }

    @AuraEnabled
    public static String generateAnalysisSummary(
        String promptTemplateId,
        String promptInputApiName,
        Decimal prediction,
        String factorsJson,
        String recommendationsJson
    ) {
        if (String.isBlank(promptTemplateId)) {
            return null;
        }

        String inputName = String.isBlank(promptInputApiName) ? 'Input:Prediction_Context' : promptInputApiName;

        Map<String, Object> payload = new Map<String, Object>{
            'prediction' => prediction,
            'factors' => factorsJson,
            'recommendations' => recommendationsJson
        };
        String contextJson = JSON.serialize(payload);

        try {
            ConnectApi.EinsteinPromptTemplateGenerationsInput promptInput = new ConnectApi.EinsteinPromptTemplateGenerationsInput();
            promptInput.isPreview = false;

            ConnectApi.EinsteinLlmAdditionalConfigInput extra = new ConnectApi.EinsteinLlmAdditionalConfigInput();
            extra.numGenerations = 1;
            extra.applicationName = 'PromptTemplateGenerationsInvocable';
            promptInput.additionalConfig = extra;

            Map<String, ConnectApi.WrappedValue> valueMap = new Map<String, ConnectApi.WrappedValue>();
            ConnectApi.WrappedValue wrapped = new ConnectApi.WrappedValue();
            wrapped.value = contextJson;
            valueMap.put(inputName, wrapped);
            promptInput.inputParams = valueMap;

            ConnectApi.EinsteinPromptTemplateGenerationsRepresentation output = ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(
                promptTemplateId,
                promptInput
            );

            if (output != null && output.generations != null && !output.generations.isEmpty()) {
                ConnectApi.EinsteinLLMGenerationItemOutput first = output.generations[0];
                return first.text;
            }
            return null;
        } catch (Exception e) {
            throw new AuraHandledException(
                'AI summary could not be generated. Confirm Einstein Generative AI, prompt access, and that the template input API name matches. Details: ' +
                e.getMessage()
            );
        }
    }
}
