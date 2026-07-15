/**
 * Discovers which Agentforce foundation models are LIVE in this org and caches
 * the result on the CommandCenterConfig__c singleton.
 *
 * WHY PROBE: this org exposes no API that *lists* foundation models — every
 * einstein/platform/models REST path 404s, the sfdc_ai__Default* models are not
 * queryable sObjects, and aiplatform.ModelsAPI has no list method (verified
 * empirically). The only way to know a model is usable is to CALL it: a live
 * name returns Code200, a retired/unprovisioned one throws. So we run a curated
 * candidate superset through createGenerations and keep the survivors.
 *
 * WHY ASYNC: each probe is a real (billable) micro-generation. Probing ~20
 * candidates takes ~16s wall-clock — far too slow and costly for a page-load
 * GET. So this runs as a Queueable; GET /config/models serves the cached list
 * instantly and only *enqueues* a refresh when the cache is stale or a manual
 * refresh is requested. The page shows the last-known list until the job lands.
 *
 * The candidate list is deliberately FORWARD-LOOKING (GPT-5.x, Claude 4.x/5,
 * Gemini 2.x/3) so a newly provisioned model appears the day it goes live with
 * no code change — that is what makes the catalog genuinely self-updating.
 */
public with sharing class ModelCatalogProbe implements Queueable, Database.AllowsCallouts {
    /** Marker written to Model_Catalog_Cache__c.source when the list came from a
     *  successful probe run (vs. the REST layer's hardcoded 'fallback'). */
    public static final String SOURCE_PROBED = 'probed';

    /** Candidate model API names to probe, each with the label shown in the
     *  dropdown. Superset of what's expected to be provisionable — survivors
     *  (those returning Code200) become the catalog. Add future names here;
     *  no other change is needed for them to auto-appear once provisioned. */
    private static final List<Map<String, String>> CANDIDATES = new List<Map<String, String>>{
        // OpenAI — GPT-5 family
        cand('sfdc_ai__DefaultOpenAIGPT5',        'GPT-5'),
        cand('sfdc_ai__DefaultOpenAIGPT5Mini',    'GPT-5 mini'),
        cand('sfdc_ai__DefaultOpenAIGPT5Nano',    'GPT-5 nano'),
        // OpenAI — GPT-4.1 family
        cand('sfdc_ai__DefaultOpenAIGPT41',       'GPT-4.1'),
        cand('sfdc_ai__DefaultOpenAIGPT41Mini',   'GPT-4.1 mini'),
        cand('sfdc_ai__DefaultOpenAIGPT41Nano',   'GPT-4.1 nano'),
        // OpenAI — GPT-4o / 4 (older, kept for continuity)
        cand('sfdc_ai__DefaultGPT4Omni',          'GPT-4o'),
        cand('sfdc_ai__DefaultGPT4OmniMini',      'GPT-4o mini'),
        cand('sfdc_ai__DefaultOpenAIGPT4',        'GPT-4'),
        cand('sfdc_ai__DefaultAzureOpenAIGPT4Omni','GPT-4o (Azure)'),
        // Anthropic Claude via Bedrock
        cand('sfdc_ai__DefaultBedrockAnthropicClaude45Sonnet', 'Claude 4.5 Sonnet'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude4Sonnet',  'Claude 4 Sonnet'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude4Opus',    'Claude 4 Opus'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude37Sonnet', 'Claude 3.7 Sonnet'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude35Sonnet', 'Claude 3.5 Sonnet'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude35Haiku',  'Claude 3.5 Haiku'),
        cand('sfdc_ai__DefaultBedrockAnthropicClaude3Haiku',   'Claude 3 Haiku'),
        // Google Gemini via Vertex
        cand('sfdc_ai__DefaultVertexAIGemini25Pro',      'Gemini 2.5 Pro'),
        cand('sfdc_ai__DefaultVertexAIGemini25Flash001', 'Gemini 2.5 Flash'),
        cand('sfdc_ai__DefaultVertexAIGemini20Flash001', 'Gemini 2.0 Flash')
    };

    private static Map<String, String> cand(String name, String label) {
        return new Map<String, String>{ 'name' => name, 'label' => label };
    }

    public void execute(QueueableContext ctx) {
        List<Map<String, String>> live = new List<Map<String, String>>();
        for (Map<String, String> c : CANDIDATES) {
            if (isModelLive(c.get('name'))) {
                live.add(c);
            }
        }
        // A totally empty result means every probe failed (e.g. Models API off in
        // this org right now) — don't overwrite a good cache with nothing.
        if (live.isEmpty()) {
            return;
        }
        writeCache(live);
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
        Map<String, Object> payload = new Map<String, Object>{
            'models' => live,
            'source' => SOURCE_PROBED,
            'discoveredAt' => System.now().getTime()
        };
        CommandCenterConfig__c rec = CommandCenterConfigRest.loadOrNewSingleton();
        rec.Model_Catalog_Cache__c = JSON.serialize(payload);
        upsert rec;
    }
}
