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
            throw buildAuraException('Flow API name and record Id are required.');
        }

        String recordVar = String.isBlank(recordIdVariableName) ? 'recordId' : recordIdVariableName;
        String predVar = String.isBlank(predictionVariableName) ? 'prediction' : predictionVariableName;
        String recVar = String.isBlank(recommendationsVariableName)
            ? 'recommendations'
            : recommendationsVariableName;

        Map<String, Object> inputs = new Map<String, Object>();
        inputs.put(recordVar, recordId);

        Flow.Interview interview;
        try {
            interview = Flow.Interview.createInterview(flowApiName, inputs);
        } catch (TypeException e) {
            // Unknown flow API name surfaces as "Invalid type: ..." — log it, show a clear message.
            System.debug(LoggingLevel.ERROR, 'runPredictionFlow createInterview: ' + e.getMessage());
            throw buildAuraException(
                'Prediction flow "' + flowApiName + '" was not found. Confirm the flow API name and that it is active.'
            );
        }
        try {
            interview.start();
        } catch (FlowException e) {
            // Flow fault messages can carry element names and query detail; keep those in the debug log.
            System.debug(LoggingLevel.ERROR, 'runPredictionFlow fault: ' + e.getMessage() + '\n' + e.getStackTraceString());
            throw buildAuraException('The prediction flow failed while running. Check the flow fault details in the debug log.');
        }

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
        String recommendationsJson,
        String classProbabilitiesJson
    ) {
        if (String.isBlank(promptTemplateId)) {
            return null;
        }

        String inputName = String.isBlank(promptInputApiName) ? 'Input:Prediction_Context' : promptInputApiName;
        String contextJson = buildPromptContext(predictionLabel, recommendationsJson, classProbabilitiesJson);

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
     * The single JSON string the prompt template reads: {prediction, predictionType,
     * recommendations, classProbabilities?}. classProbabilities is the card's displayed
     * [{label, percent}] list, so the summary can tell a close call from a clear win.
     * Malformed classProbabilitiesJson is dropped rather than failing the summary.
     */
    @TestVisible
    private static String buildPromptContext(
        String predictionLabel,
        String recommendationsJson,
        String classProbabilitiesJson
    ) {
        Map<String, Object> payload = new Map<String, Object>{
            'prediction' => predictionLabel,
            'predictionType' => 'multiclass_label',
            'recommendations' => recommendationsJson != null ? humanizeFieldNames(recommendationsJson) : '[]'
        };
        if (String.isNotBlank(classProbabilitiesJson)) {
            try {
                Object parsed = JSON.deserializeUntyped(classProbabilitiesJson);
                if (parsed instanceof List<Object> && !((List<Object>) parsed).isEmpty()) {
                    payload.put('classProbabilities', parsed);
                }
            } catch (JSONException e) {
                System.debug(LoggingLevel.WARN, 'buildPromptContext: ignoring malformed classProbabilitiesJson');
            }
        }
        return JSON.serialize(payload);
    }

    /**
     * Rewrites each factor field `name` (in fields[] or on the flat factor) from its API name to a readable label
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
        // Flows sometimes return the array double-encoded as a JSON string; the LWC unwraps it too.
        if (parsed instanceof String) {
            try {
                parsed = JSON.deserializeUntyped(((String) parsed).trim());
            } catch (JSONException e) {
                return factorJson;
            }
        }
        if (!(parsed instanceof List<Object>)) {
            return factorJson;
        }
        for (Object item : (List<Object>) parsed) {
            if (!(item instanceof Map<String, Object>)) {
                continue;
            }
            Map<String, Object> factor = (Map<String, Object>) item;
            Object fields = factor.get('fields');
            if (fields instanceof List<Object>) {
                for (Object f : (List<Object>) fields) {
                    if (f instanceof Map<String, Object>) {
                        humanizeNameKey((Map<String, Object>) f);
                    }
                }
            } else {
                // Flat factor shape: {name, inputValue, value} with no fields[] wrapper.
                humanizeNameKey(factor);
            }
        }
        return JSON.serialize(parsed);
    }

    private static void humanizeNameKey(Map<String, Object> field) {
        Object label = field.get('label');
        Object name = field.get('name');
        if (label instanceof String && String.isNotBlank((String) label)) {
            field.put('name', label);
        } else if (name instanceof String && String.isNotBlank((String) name)) {
            field.put('name', humanizeApiName((String) name));
        }
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
