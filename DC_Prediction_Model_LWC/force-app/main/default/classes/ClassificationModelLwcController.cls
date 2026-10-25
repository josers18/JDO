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
            throw buildAuraException('Flow API name and record Id are required.');
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
        String recommendationsJson,
        String predictionOutputFormat
    ) {
        if (String.isBlank(promptTemplateId)) {
            return null;
        }

        String inputName = String.isBlank(promptInputApiName) ? 'Input:Prediction_Context' : promptInputApiName;

        Map<String, Object> payload = new Map<String, Object>{
            'prediction' => prediction,
            'factors' => humanizeFieldNames(factorsJson),
            'recommendations' => humanizeFieldNames(recommendationsJson)
        };
        if (String.isNotBlank(predictionOutputFormat)) {
            payload.put('predictionOutputFormat', predictionOutputFormat.trim());
        }
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
        } catch (ConnectApi.ConnectApiException e) {
            // ConnectApi exception messages from EinsteinLLM are intended for the caller
            // (e.g. "Prompt template not found", "Generation timed out") — safe to surface.
            System.debug(LoggingLevel.ERROR, 'generateAnalysisSummary ConnectApiException: ' + e);
            throw buildAuraException(e.getMessage());
        } catch (Exception e) {
            // Anything else (TypeException, NoAccessException, internal platform errors)
            // gets a sanitized message; full detail goes to debug logs only.
            System.debug(LoggingLevel.ERROR, 'generateAnalysisSummary unexpected: ' + e.getTypeName() + ': ' + e.getMessage() + '\n' + e.getStackTraceString());
            throw buildAuraException(
                'AI summary could not be generated. Confirm Einstein Generative AI, prompt access, and that the template input API name matches.'
            );
        }
    }

    /**
     * Rewrites each factor/prescription field `name` from its API name to a readable label
     * ("Complaint_Count__c" -> "Complaint Count") before the JSON reaches the prompt.
     * The Einstein Trust Layer masks raw API names as <ENTITY_TYPE_n> and doesn't restore
     * them in the response, so the summary would otherwise read "<ENTITY_TYPE_0> ...".
     * Returns the input unchanged when it isn't a JSON array of factor objects.
     */
    @TestVisible
    private static String humanizeFieldNames(String factorJson) {
        if (String.isBlank(factorJson)) {
            return factorJson;
        }
        Object parsed;
        try {
            parsed = JSON.deserializeUntyped(factorJson);
        } catch (JSONException e) {
            return factorJson;
        }
        if (!(parsed instanceof List<Object>)) {
            return factorJson;
        }
        for (Object item : (List<Object>) parsed) {
            if (!(item instanceof Map<String, Object>)) {
                continue;
            }
            Object fields = ((Map<String, Object>) item).get('fields');
            if (!(fields instanceof List<Object>)) {
                continue;
            }
            for (Object f : (List<Object>) fields) {
                if (f instanceof Map<String, Object>) {
                    Map<String, Object> field = (Map<String, Object>) f;
                    Object label = field.get('label');
                    Object name = field.get('name');
                    if (label instanceof String && String.isNotBlank((String) label)) {
                        field.put('name', label);
                    } else if (name instanceof String) {
                        field.put('name', humanizeApiName((String) name));
                    }
                }
            }
        }
        return JSON.serialize(parsed);
    }

    /** Mirrors the LWC's humanizeApiName: strip custom suffixes, underscores to spaces. */
    @TestVisible
    private static String humanizeApiName(String apiName) {
        String n = apiName.trim();
        for (Integer pass = 0; pass < 2; pass++) {
            for (String suffix : new List<String>{ '_c__c', '__c', '__r', '_c' }) {
                if (n.toLowerCase().endsWith(suffix)) {
                    n = n.left(n.length() - suffix.length());
                    break;
                }
            }
        }
        n = n.replace('_', ' ');
        n = n.replaceAll('([a-z0-9])([A-Z])', '$1 $2').replaceAll('([A-Z]+)([A-Z][a-z])', '$1 $2');
        return n.normalizeSpace();
    }

    /**
     * AuraHandledException surfaces a custom message to the LWC layer only when both
     * the constructor argument AND setMessage() are populated; without setMessage()
     * the JS toast falls back to a generic "Script-thrown exception" string.
     */
    private static AuraHandledException buildAuraException(String msg) {
        String safe = String.isBlank(msg) ? 'Operation failed.' : msg;
        AuraHandledException ahe = new AuraHandledException(safe);
        ahe.setMessage(safe);
        return ahe;
    }
}
