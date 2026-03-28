/**
 * Runs an autolaunched Flow that produces generative output (e.g. Einstein Prompt) and optionally submits Models API feedback.
 */
public with sharing class DcAgentforceOutputController {
    public class FlowPromptResult {
        @AuraEnabled
        public String text;
        /** Flow runs do not surface Einstein generation Id; feedback stays disabled unless extended. */
        @AuraEnabled
        public String generationId;
    }

    /**
     * Starts an autolaunched flow and reads the text output variable (default: promptResponse).
     * When passRecordId is true and recordId is set, loads that row and passes it into the flow input
     * (Record single / SObject variable). The flow variable must be the same object type as the page record.
     */
    @AuraEnabled
    public static FlowPromptResult runPromptFlow(
        String flowApiName,
        Id recordId,
        String recordIdVariableName,
        String promptResponseVariableName,
        Boolean passRecordId,
        String generationIdVariableName
    ) {
        if (String.isBlank(flowApiName)) {
            throw new AuraHandledException('Autolaunched Flow API name is required.');
        }

        String recordVar = String.isBlank(recordIdVariableName) ? 'recordID' : recordIdVariableName.trim();
        String outVar = String.isBlank(promptResponseVariableName) ? 'promptResponse' : promptResponseVariableName.trim();
        Boolean doPass = passRecordId != false;

        Map<String, Object> inputs = new Map<String, Object>();
        if (doPass && recordId != null) {
            SObject row = queryRecordShellForFlow(recordId);
            if (row == null) {
                throw new AuraHandledException(
                    'Record could not be loaded for the flow (check Id and your access). Id: ' + String.valueOf(recordId)
                );
            }
            inputs.put(recordVar, row);
        }

        try {
            Flow.Interview interview = Flow.Interview.createInterview(flowApiName.trim(), inputs);
            interview.start();

            FlowPromptResult result = new FlowPromptResult();
            Object raw = resolveFlowOutput(interview, outVar);
            result.text = LlmOutputSanitizer.stripClosingCourtesy(flowOutputToDisplayString(raw));
            if (String.isBlank(result.text)) {
                result.text = 'The flow returned an empty promptResponse.';
            }
            result.generationId = resolveGenerationId(interview, generationIdVariableName);
            return result;
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException(
                'Flow could not run. Confirm the Flow API name, that it is autolaunched and active, and output variable name. Details: ' +
                e.getMessage()
            );
        }
    }

    /**
     * Minimal row for Flow Record inputs. Object type comes from the Id (must match the flow variable's object type).
     */
    private static SObject queryRecordShellForFlow(Id recordId) {
        if (recordId == null) {
            return null;
        }
        String objectApiName = recordId.getSObjectType().getDescribe().getName();
        String soql = 'SELECT Id FROM ' + objectApiName + ' WHERE Id = :recordId LIMIT 1';
        List<SObject> rows = Database.query(soql);
        return rows.isEmpty() ? null : rows[0];
    }

    private static Object resolveFlowOutput(Flow.Interview interview, String apiName) {
        if (String.isBlank(apiName) || interview == null) {
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

    private static String flowOutputToDisplayString(Object value) {
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

    /**
     * Reads optional Text output from the flow (e.g. Einstein / Models API generation Id) for thumbs feedback.
     */
    private static String resolveGenerationId(Flow.Interview interview, String variableApiName) {
        if (String.isBlank(variableApiName) || interview == null) {
            return null;
        }
        Object gid = resolveFlowOutput(interview, variableApiName.trim());
        if (gid == null) {
            return null;
        }
        String s = gid instanceof String ? (String) gid : String.valueOf(gid);
        s = s != null ? s.trim() : null;
        return String.isBlank(s) ? null : s;
    }

    @AuraEnabled
    public static void submitGenerationFeedback(String generationId, Boolean thumbsUp, String feedbackText) {
        if (String.isBlank(generationId)) {
            throw new AuraHandledException('Generation Id is required to submit feedback.');
        }

        String trimmed = feedbackText != null ? feedbackText.trim() : '';
        if (trimmed.length() > 1024) {
            trimmed = trimmed.substring(0, 1024);
        }

        String feedbackId = UUID.randomUUID().toString();

        try {
            aiplatform.ModelsAPI_FeedbackRequest body = new aiplatform.ModelsAPI_FeedbackRequest();
            body.id = feedbackId;
            body.generationId = generationId;
            body.feedback = thumbsUp == true ? 'GOOD' : 'BAD';
            body.feedbackText = trimmed;
            body.source = 'HUMAN';

            aiplatform.ModelsAPI.submitFeedback_Request request = new aiplatform.ModelsAPI.submitFeedback_Request();
            request.body = body;

            aiplatform.ModelsAPI modelsAPI = new aiplatform.ModelsAPI();
            modelsAPI.submitFeedback(request);
        } catch (aiplatform.ModelsAPI.submitFeedback_ResponseException e) {
            throw new AuraHandledException(
                'Feedback could not be submitted. Confirm Models API is enabled in the org. Details: ' + e.getMessage()
            );
        } catch (Exception e) {
            throw new AuraHandledException('Feedback could not be submitted. Details: ' + e.getMessage());
        }
    }
}
