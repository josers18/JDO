/**
 * Multiclass classification: flow returns a text prediction label and recommendations JSON only.
 * LWC: multiclassPredictionLwc
 */
public with sharing class MulticlassPredictionLwcController {
    public class MulticlassResult {
        @AuraEnabled
        public String predictionLabel;
        @AuraEnabled
        public String recommendationsJson;
        @AuraEnabled
        public List<ClassProbability> classProbabilities;
    }

    public class ClassProbability {
        @AuraEnabled
        public String apiName;
        @AuraEnabled
        public Decimal value;

        public ClassProbability(String apiName, Decimal value) {
            this.apiName = apiName;
            this.value = value;
        }
    }

    @AuraEnabled
    public static MulticlassResult runPredictionFlow(
        String flowApiName,
        Id recordId,
        String recordIdVariableName,
        String predictionVariableName,
        String recommendationsVariableName,
        String classVariableNamesCsv
    ) {
        if (String.isBlank(flowApiName) || recordId == null) {
            throw new AuraHandledException('Flow API name and record Id are required.');
        }

        String recordVar = String.isBlank(recordIdVariableName) ? 'recordId' : recordIdVariableName;
        String predVar = String.isBlank(predictionVariableName) ? 'prediction' : predictionVariableName;
        String recVar = String.isBlank(recommendationsVariableName)
            ? 'recommendations'
            : recommendationsVariableName;

        Map<String, Object> inputs = new Map<String, Object>();
        inputs.put(recordVar, recordId);

        Flow.Interview interview = Flow.Interview.createInterview(flowApiName, inputs);
        interview.start();

        MulticlassResult result = new MulticlassResult();
        Object pred = interview.getVariableValue(predVar);
        if (pred == null) {
            result.predictionLabel = null;
        } else if (pred instanceof String) {
            result.predictionLabel = ((String) pred).trim();
        } else {
            result.predictionLabel = String.valueOf(pred).trim();
        }
        result.predictionLabel = LlmOutputSanitizer.stripClosingCourtesy(result.predictionLabel);

        result.recommendationsJson = flowOutputToJsonString(resolveFlowOutput(interview, recVar));

        result.classProbabilities = parseClassProbabilities(interview, classVariableNamesCsv);
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
            // Falling back to String.valueOf — log so future maintainers can diagnose
            // shapes that JSON.serialize can't handle (circular refs, unsupported types).
            System.debug(LoggingLevel.WARN, 'flowOutputToJsonString JSON.serialize failed: ' + e.getTypeName() + ': ' + e.getMessage());
            return String.valueOf(value);
        }
    }

    @AuraEnabled
    public static String generateAnalysisSummary(
        String promptTemplateId,
        String promptInputApiName,
        String predictionLabel,
        String recommendationsJson
    ) {
        if (String.isBlank(promptTemplateId)) {
            return null;
        }

        String inputName = String.isBlank(promptInputApiName) ? 'Input:Prediction_Context' : promptInputApiName;

        Map<String, Object> payload = new Map<String, Object>{
            'prediction' => predictionLabel,
            'predictionType' => 'multiclass_label',
            'recommendations' => recommendationsJson != null ? recommendationsJson : '[]'
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
                return LlmOutputSanitizer.stripClosingCourtesy(first.text);
            }
            return null;
        } catch (ConnectApi.ConnectApiException e) {
            // ConnectApi exception messages from EinsteinLLM are intended for the caller
            // (e.g. "Prompt template not found", "Generation timed out") — safe to surface.
            System.debug(LoggingLevel.ERROR, 'generateAnalysisSummary ConnectApiException: ' + e);
            AuraHandledException ahe = new AuraHandledException(e.getMessage());
            ahe.setMessage(e.getMessage());
            throw ahe;
        } catch (Exception e) {
            // Anything else (TypeException, NoAccessException, internal platform errors)
            // gets a sanitized message; full detail goes to debug logs only.
            System.debug(LoggingLevel.ERROR, 'generateAnalysisSummary unexpected: ' + e.getTypeName() + ': ' + e.getMessage() + '\n' + e.getStackTraceString());
            String safeMsg = 'AI summary could not be generated. Confirm Einstein Generative AI, prompt access, and that the template input API name matches.';
            AuraHandledException ahe = new AuraHandledException(safeMsg);
            ahe.setMessage(safeMsg);
            throw ahe;
        }
    }

    @TestVisible
    private static List<ClassProbability> parseClassProbabilities(Flow.Interview interview, String csv) {
        List<ClassProbability> out = new List<ClassProbability>();
        if (String.isBlank(csv)) {
            return out;
        }
        for (String raw : csv.split(',')) {
            String name = raw == null ? '' : raw.trim();
            if (String.isBlank(name)) {
                continue;
            }
            Object rawValue = resolveFlowOutput(interview, name);
            Decimal coerced = coerceToDecimal(rawValue);
            out.add(new ClassProbability(name, coerced));
        }
        return out;
    }

    @TestVisible
    private static Decimal coerceToDecimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Decimal) {
            return (Decimal) value;
        }
        if (value instanceof Double) {
            return Decimal.valueOf(String.valueOf((Double) value));
        }
        if (value instanceof Integer) {
            return Decimal.valueOf((Integer) value);
        }
        if (value instanceof Long) {
            return Decimal.valueOf((Long) value);
        }
        if (value instanceof String) {
            String s = ((String) value).trim();
            if (String.isBlank(s)) {
                return null;
            }
            try {
                return Decimal.valueOf(s);
            } catch (TypeException e) {
                return null;
            }
        }
        return null;
    }
}
