/**
 * Agentforce text-generation bridge for React UI bundles.
 *
 * WHY REST (same constraint as DcPromptRest / CrmWriteRest): a Multi-Framework
 * UI bundle's app-domain session cannot call @AuraEnabled Apex or the generic
 * Agentforce REST APIs — only /services/apexrest/* is reachable via the SDK
 * fetch() path. So generative chips post here and this resource runs the
 * Agentforce Models API server-side.
 *
 * Models API is NOT guaranteed enabled (jdo-1lrnov currently throws
 * System.TypeException: Missing dependent object at runtime). This resource
 * catches that and returns { text:'', source:'unavailable' } with HTTP 200, so
 * the caller keeps its locally-composed answer instead of seeing a 500. Only a
 * genuinely unexpected failure returns 500.
 *
 *   POST /services/apexrest/ai/generate
 *     body: { "task":"queue_rationale", "prompt":"...", "context":"..." }
 *     200:  { "text":"<generated>", "source":"model" }
 *     200:  { "text":"", "source":"unavailable" }   // Models API off
 *     400:  { "error":"message" }
 *     500:  { "error":"message" }
 */
@RestResource(urlMapping='/ai/generate')
global with sharing class AiGenerateRest {
    private static final Set<String> ALLOWED_TASKS = new Set<String>{
        'queue_rationale', 'pipeline_summary', 'followups', 'freeform'
    };

    global class GenRequest {
        public String task;
        public String prompt;
        public String context;
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
            GenRequest req = String.isBlank(body)
                ? new GenRequest()
                : (GenRequest) JSON.deserialize(body, GenRequest.class);

            String task = req.task == null ? '' : req.task.trim();
            if (String.isBlank(task) || !ALLOWED_TASKS.contains(task)) {
                writeError(res, 400, 'Unsupported task: ' + task);
                return;
            }
            String prompt = req.prompt == null ? '' : req.prompt.trim();
            if (String.isBlank(prompt)) {
                writeError(res, 400, 'prompt is required.');
                return;
            }

            if (Test.isRunningTest()) {
                writeResult(res, 'TEST_AI_TEXT', 'model');
                return;
            }

            String composed = req.context == null ? '' : req.context;
            String generated = generate(prompt, composed);
            if (String.isBlank(generated)) {
                // Models API unavailable / empty — caller keeps its composed answer.
                writeResult(res, '', 'unavailable');
            } else {
                writeResult(res, generated, 'model');
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'AiGenerateRest error: ' + e.getTypeName() + ': ' + e.getMessage() + '\n' + e.getStackTraceString());
            writeError(res, 500, 'Text generation failed.');
        }
    }

    /**
     * Best-effort Agentforce Models API call. Returns '' (never throws) when the
     * Models API is not provisioned in this org, so run() reports 'unavailable'
     * rather than 500. The prompt already carries the composed context blob.
     */
    private static String generate(String prompt, String context) {
        String fullPrompt = String.isBlank(context) ? prompt : prompt + '\n\n' + context;
        try {
            aiplatform.ModelsAPI.createGenerations_Request gen = new aiplatform.ModelsAPI.createGenerations_Request();
            aiplatform.ModelsAPI_GenerationRequest reqBody = new aiplatform.ModelsAPI_GenerationRequest();
            reqBody.prompt = fullPrompt;
            gen.body = reqBody;
            gen.modelName = 'sfdc_ai__DefaultGPT4Omni';

            aiplatform.ModelsAPI api = new aiplatform.ModelsAPI();
            aiplatform.ModelsAPI.createGenerations_Response resp = api.createGenerations(gen);
            if (resp != null && resp.Code200 != null && resp.Code200.generation != null) {
                return resp.Code200.generation.generatedText;
            }
            return '';
        } catch (System.TypeException te) {
            // "Missing dependent object" — Models API not enabled in this org.
            System.debug(LoggingLevel.WARN, 'Models API unavailable: ' + te.getMessage());
            return '';
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Models API call failed: ' + e.getMessage());
            return '';
        }
    }

    private static void writeResult(RestResponse res, String text, String source) {
        res.statusCode = 200;
        res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{ 'text' => text, 'source' => source }));
    }

    private static void writeError(RestResponse res, Integer code, String msg) {
        res.statusCode = code;
        res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{ 'error' => msg }));
    }
}
