/**
 * Agentforce / Einstein prompt bridge for React UI bundles.
 *
 * WHY REST: like DcBridgeRest, @AuraEnabled Apex is unreachable from a
 * Multi-Framework UI bundle, AND the deployed bundle's app-domain session is
 * NOT authorized to call the generic Flow Actions REST API
 * (/services/data/vXX/actions/custom/flow/*) — that path 401s in-org even
 * though sdk.graphql and /services/apexrest/* work. So this re-exposes the SAME
 * mechanism the working DcAgentforceOutputController LWC uses today —
 * Flow.Interview running an autolaunched Flow that wraps an Einstein Prompt
 * Template — as an apexrest resource React CAN reach.
 *
 *   POST /services/apexrest/dc/prompt
 *     body: { "flowApiName":"DC_AccountSummary_Widget",
 *             "recordId":"001...", "recordVar":"recordId",
 *             "responseVar":"PromptResponse" }
 *     200:  { "text": "<generated summary>" }
 *     400:  { "error": "message" }
 */
@RestResource(urlMapping='/dc/prompt')
global with sharing class DcPromptRest {
    private static final Set<String> ALLOWED_FLOWS = new Set<String>{
        'DC_AccountSummary_Widget',
        'DC_Financial_Account_Summary_ALF',
        'DC_Financial_Transaction_Summary_ALF'
    };

    global class PromptRequest {
        public String flowApiName;
        public String recordId;
        public String recordVar;
        public String responseVar;
    }

    @HttpPost
    global static void run() {
        RestResponse res = RestContext.response;
        if (res == null) {
            res = new RestResponse();
            RestContext.response = res;
        }
        res.addHeader('Content-Type', 'application/json');
        try {
            String body = RestContext.request != null && RestContext.request.requestBody != null
                ? RestContext.request.requestBody.toString()
                : '';
            PromptRequest req = String.isBlank(body)
                ? new PromptRequest()
                : (PromptRequest) JSON.deserialize(body, PromptRequest.class);

            String flowApiName = req.flowApiName == null ? '' : req.flowApiName.trim();
            if (String.isBlank(flowApiName)) {
                writeError(res, 400, 'flowApiName is required.');
                return;
            }
            // Allowlist: only the curated summary flows may be invoked from the bundle.
            if (!ALLOWED_FLOWS.contains(flowApiName)) {
                writeError(res, 400, 'Flow not permitted: ' + flowApiName);
                return;
            }
            if (String.isBlank(req.recordId)) {
                writeError(res, 400, 'recordId is required.');
                return;
            }

            Id recordId;
            try {
                recordId = (Id) req.recordId.trim();
            } catch (Exception e) {
                writeError(res, 400, 'recordId is not a valid Salesforce Id.');
                return;
            }

            String recordVar = String.isBlank(req.recordVar) ? 'recordId' : req.recordVar.trim();
            String outVar = String.isBlank(req.responseVar) ? 'PromptResponse' : req.responseVar.trim();

            String text = Test.isRunningTest()
                ? 'TEST_PROMPT_RESPONSE'
                : runFlow(flowApiName, recordId, recordVar, outVar);

            res.statusCode = 200;
            res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{ 'text' => text }));
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'DcPromptRest error: ' + e.getTypeName() + ': ' + e.getMessage() + '\n' + e.getStackTraceString());
            writeError(res, 400, 'Prompt generation failed.');
        }
    }

    /**
     * Ports DcAgentforceOutputController.runPromptFlow: load a minimal record
     * shell, start the autolaunched flow with it as the input SObject variable,
     * and read the text output variable.
     */
    private static String runFlow(String flowApiName, Id recordId, String recordVar, String outVar) {
        String objectApiName = String.escapeSingleQuotes(recordId.getSObjectType().getDescribe().getName());
        String soql = 'SELECT Id FROM ' + objectApiName + ' WHERE Id = :recordId LIMIT 1';
        List<SObject> rows = Database.query(soql);
        if (rows.isEmpty()) {
            throw new PromptException('Record could not be loaded for the flow.');
        }

        Map<String, Object> inputs = new Map<String, Object>{ recordVar => rows[0] };
        Flow.Interview interview = Flow.Interview.createInterview(flowApiName, inputs);
        interview.start();

        Object raw = interview.getVariableValue(outVar);
        String text = raw instanceof String ? (String) raw : (raw == null ? '' : String.valueOf(raw));
        return text == null ? '' : text;
    }

    private static void writeError(RestResponse res, Integer code, String msg) {
        res.statusCode = code;
        res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{ 'error' => msg }));
    }

    private class PromptException extends Exception {}
}
