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
    private static final String DEFAULT_MODEL = 'sfdc_ai__DefaultGPT4Omni';
    /** Models the Configuration page may select (mirror of
     *  CommandCenterConfigRest's curated allowlist). A blank or unrecognized
     *  modelName falls back to DEFAULT_MODEL so a stale/typo'd config never
     *  breaks generation. */
    private static final Set<String> ALLOWED_MODELS = new Set<String>{
        'sfdc_ai__DefaultOpenAIGPT5',
        'sfdc_ai__DefaultOpenAIGPT5Mini',
        'sfdc_ai__DefaultOpenAIGPT5Nano',
        'sfdc_ai__DefaultOpenAIGPT41',
        'sfdc_ai__DefaultOpenAIGPT41Mini',
        'sfdc_ai__DefaultBedrockAnthropicClaude45Sonnet',
        'sfdc_ai__DefaultBedrockAnthropicClaude4Sonnet',
        'sfdc_ai__DefaultBedrockAnthropicClaude37Sonnet',
        'sfdc_ai__DefaultVertexAIGemini25Flash001',
        'sfdc_ai__DefaultVertexAIGemini20Flash001',
        'sfdc_ai__DefaultGPT4Omni',
        'sfdc_ai__DefaultGPT4OmniMini',
        'sfdc_ai__DefaultBedrockAnthropicClaude35Sonnet',
        'sfdc_ai__DefaultBedrockAnthropicClaude3Haiku',
        'sfdc_ai__DefaultOpenAIGPT4'
    };

    global class GenRequest {
        public String task;
        public String prompt;
        public String context;
        public String modelName;    // optional — from the Configuration page
        public Double temperature;  // optional generation parameter
        public Integer maxTokens;   // optional generation parameter
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
            String model = (String.isBlank(req.modelName) || !ALLOWED_MODELS.contains(req.modelName))
                ? DEFAULT_MODEL
                : req.modelName;
            String generated = generate(prompt, composed, model, req.temperature, req.maxTokens);
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
    private static String generate(String prompt, String context, String model, Double temperature, Integer maxTokens) {
        String fullPrompt = String.isBlank(context) ? prompt : prompt + '\n\n' + context;
        try {
            aiplatform.ModelsAPI.createGenerations_Request gen = new aiplatform.ModelsAPI.createGenerations_Request();
            aiplatform.ModelsAPI_GenerationRequest reqBody = new aiplatform.ModelsAPI_GenerationRequest();
            reqBody.prompt = fullPrompt;
            applyParams(reqBody, temperature, maxTokens);
            gen.body = reqBody;
            // modelName is the one knob the Apex Models API binding exposes per
            // request — the Configuration page's per-action model selection.
            gen.modelName = model;

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

    /**
     * Apply generation parameters (temperature / maxTokens) to the request.
     *
     * NO-OP TODAY, BY DESIGN. This org's `aiplatform.ModelsAPI` Apex binding
     * exposes only { prompt, modelName, contentModeration, localization, tags }
     * on the generation request — it binds no temperature/maxTokens field
     * (verified by reflecting the type). So the Configuration page still stores
     * these params (they round-trip and are validated), but they cannot be
     * pushed through the Apex path until the platform binding gains the fields.
     * Keeping this hook — instead of dropping the params — means the day the
     * binding adds them, only this method changes. The UI flags params as
     * "stored, not yet applied" so the behavior is never misrepresented.
     */
    @SuppressWarnings('PMD.EmptyStatementBlock')
    private static void applyParams(aiplatform.ModelsAPI_GenerationRequest reqBody, Double temperature, Integer maxTokens) {
        // Intentionally empty — see method doc.
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
