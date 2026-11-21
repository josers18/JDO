/** Checks documented generation model identifiers against this org's Models API.
 * Source: https://developer.salesforce.com/docs/ai/agentforce/guide/supported-models.html
 * Chained jobs bound the cumulative callout time. Only the final job publishes the catalog.
 */
public with sharing class ModelCatalogProbe implements Queueable, Database.AllowsCallouts {
    public static final String SOURCE_PROBED = 'probed';
    public static final String CATALOG_VERSION = '2026-11-20';
    public static final List<Map<String, String>> CANDIDATES = new List<Map<String, String>>{
        cand('sfdc_ai__DefaultOpenAIGPT61Sol', 'GPT 6.1 Sol'),
        cand('sfdc_ai__DefaultAzureOpenAIGPT6Astra', 'GPT 6 Astra'),
        cand('sfdc_ai__DefaultAzureOpenAIGPT6Luna', 'GPT 6 Luna'),
        cand('sfdc_ai__DefaultAzureOpenAIGPT6Sol', 'GPT 6 Sol'),
        cand('sfdc_ai__DefaultAzureOpenAIGPT56Terra', 'GPT 5.6 Terra'),
        cand('sfdc_ai__DefaultAzureOpenAIGPT56Sol', 'GPT 5.6 Sol'),
        cand('sfdc_ai__DefaultAzureOpenAIGPT56Luna', 'GPT 5.6 Luna'),
        cand('sfdc_ai__DefaultGPT55', 'GPT 5.5'),
        cand('sfdc_ai__DefaultGPT54Mini', 'GPT 5.4 Mini'),
        cand('sfdc_ai__DefaultGPT54', 'GPT 5.4'),
        cand('sfdc_ai__DefaultGPT52', 'GPT 5.2'),
        cand('sfdc_ai__DefaultGPT51', 'GPT 5.1'),
        cand('sfdc_ai__DefaultGPT5Mini', 'GPT 5 Mini'),
        cand('sfdc_ai__DefaultGPT5', 'GPT 5'),
        cand('sfdc_ai__DefaultGPT41Mini', 'GPT 4.1 Mini'),
        cand('sfdc_ai__DefaultGPT41', 'GPT 4.1'),
        cand('sfdc_ai__DefaultOpenAIGPT4OmniMini', 'GPT 4o mini'),
        cand('sfdc_ai__DefaultGPT4OmniMini', 'GPT 4o mini'),
        cand('sfdc_ai__DefaultGPT4Omni', 'GPT 4o'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude55Sonnet', 'Claude Sonnet 5.5'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude5Sonnet', 'Claude Sonnet 5'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude46Sonnet', 'Claude Sonnet 4.6'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude45Sonnet', 'Claude Sonnet 4.5'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude55Opus', 'Claude Opus 5.5'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude5Opus', 'Claude Opus 5'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude48Opus', 'Claude Opus 4.8'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude47Opus', 'Claude Opus 4.7'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude46Opus', 'Claude Opus 4.6'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude45Opus', 'Claude Opus 4.5'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude55Haiku', 'Claude Haiku 5.5'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude45Haiku', 'Claude Haiku 4.5'),
        cand('sfdc_ai__DefaultVertexAIGemini4Argon', 'Gemini 4 Argon'),
        cand('sfdc_ai__DefaultVertexAIGemini38Flash', 'Gemini 3.8 Flash'),
        cand('sfdc_ai__DefaultVertexAIGemini37Flash', 'Gemini 3.7 Flash'),
        cand('sfdc_ai__DefaultVertexAIGemini36Flash', 'Gemini 3.6 Flash'),
        cand('sfdc_ai__DefaultVertexAIGemini35FlashLite', 'Gemini 3.5 Flash Lite'),
        cand('sfdc_ai__DefaultVertexAIGemini35Flash', 'Gemini 3.5 Flash'),
        cand('sfdc_ai__DefaultVertexAIGeminiPro31', 'Gemini 3.1 Pro (Beta)'),
        cand('sfdc_ai__DefaultVertexAIGemini31FlashLite', 'Gemini 3.1 Flash Lite'),
        cand('sfdc_ai__DefaultVertexAIGemini30Flash', 'Gemini 3 Flash'),
        cand('sfdc_ai__DefaultBedrockAmazonNova2Lite', 'Amazon Nova 2 Lite'),
        cand('sfdc_ai__DefaultBedrockAmazonNovaPro', 'Amazon Nova Pro'),
        cand('sfdc_ai__DefaultBedrockAmazonNovaLite', 'Amazon Nova Lite'),
        cand('sfdc_ai__DefaultBedrockNvidiaNemotronSuper3120b', 'NVIDIA Nemotron 3 Super 120B (Beta)'),
        cand('sfdc_ai__DefaultBedrockNvidiaNemotronNano330b', 'NVIDIA Nemotron 3 Nano 30B (Beta)'),
        cand('sfdc_ai__DefaultO4Mini', 'O4 Mini'),
        cand('sfdc_ai__DefaultO3', 'O3')
    };

    // Preserve previously saved selections without offering retired aliases in new menus.
    private static final Set<String> legacyNames = new Set<String>{
        'sfdc_ai__DefaultAzureOpenAIGPT4Omni',
        'sfdc_ai__DefaultBedrockAnthropicClaude35Haiku',
        'sfdc_ai__DefaultBedrockAnthropicClaude35Sonnet',
        'sfdc_ai__DefaultBedrockAnthropicClaude37Sonnet',
        'sfdc_ai__DefaultBedrockAnthropicClaude3Haiku',
        'sfdc_ai__DefaultBedrockAnthropicClaude4Opus',
        'sfdc_ai__DefaultBedrockAnthropicClaude4Sonnet',
        'sfdc_ai__DefaultOpenAIGPT4',
        'sfdc_ai__DefaultOpenAIGPT41',
        'sfdc_ai__DefaultOpenAIGPT41Mini',
        'sfdc_ai__DefaultOpenAIGPT41Nano',
        'sfdc_ai__DefaultOpenAIGPT5',
        'sfdc_ai__DefaultOpenAIGPT5Mini',
        'sfdc_ai__DefaultOpenAIGPT5Nano',
        'sfdc_ai__DefaultVertexAIGemini20Flash001',
        'sfdc_ai__DefaultVertexAIGemini25Flash001',
        'sfdc_ai__DefaultVertexAIGemini25Pro'
    };
    public static Boolean supportsSelection(String name) {
        if (legacyNames.contains(name)) return true;
        for (Map<String, String> model : CANDIDATES) {
            if (model.get('name') == name) return true;
        }
        return false;
    }

    private static Map<String, String> cand(String name, String label) {
        return new Map<String, String>{ 'name' => name, 'label' => label };
    }


    private Integer probeOffset = 0;
    private List<Map<String, String>> live = new List<Map<String, String>>();
    public ModelCatalogProbe() {}
    private ModelCatalogProbe(Integer nextOffset, List<Map<String, String>> verified) {
        probeOffset = nextOffset;
        live = verified;
    }
    public void execute(QueueableContext ctx) {
        Integer endIndex = Math.min(probeOffset + 6, CANDIDATES.size());
        for (Integer i = probeOffset; i < endIndex; i++) {
            Map<String, String> c = CANDIDATES[i];
            if (isModelLive(c.get('name'))) live.add(c);
        }
        if (endIndex < CANDIDATES.size()) {
            System.enqueueJob(new ModelCatalogProbe(endIndex, live));
        } else {
            writeCache(live);
        }
    }

    /** One probe: a tiny generation. Code200 → the model is live; any throw or
     *  non-200 → treat as not available. Never rethrows. */
    private static Boolean isModelLive(String modelName) {
        try {
            aiplatform.ModelsAPI.createGenerations_Request gen =
                new aiplatform.ModelsAPI.createGenerations_Request();
            aiplatform.ModelsAPI_GenerationRequest body =
                new aiplatform.ModelsAPI_GenerationRequest();
            body.prompt = 'ping';
            gen.body = body;
            gen.modelName = modelName;
            aiplatform.ModelsAPI.createGenerations_Response resp =
                new aiplatform.ModelsAPI().createGenerations(gen);
            return resp != null && resp.Code200 != null;
        } catch (Exception e) {
            return false;
        }
    }

    /** Persist survivors + a discovery timestamp to the singleton's cache field. */
    private static void writeCache(List<Map<String, String>> live) {

        CommandCenterConfig__c rec = CommandCenterConfigRest.loadOrNewSingleton();
        Map<String, Object> payload = String.isBlank(rec.Model_Catalog_Cache__c)
            ? new Map<String, Object>() : (Map<String, Object>) JSON.deserializeUntyped(rec.Model_Catalog_Cache__c);
        if (!live.isEmpty()) {
            payload.put('models', live);
            payload.put('source', SOURCE_PROBED);
            payload.put('discoveredAt', System.now().getTime());
            payload.put('catalogVersion', CATALOG_VERSION);
        }
        payload.put('lastAttemptFailed', live.isEmpty());
        payload.put('completedAt', System.now().getTime());
        CommandCenterConfig__c change = new CommandCenterConfig__c(Id = rec.Id, Name = rec.Name, Model_Catalog_Cache__c = JSON.serialize(payload));
        upsert change;
    }
}
