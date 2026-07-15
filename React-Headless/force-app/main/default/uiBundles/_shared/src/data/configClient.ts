/**
 * Command-center configuration client for React UI bundles.
 *
 * Same apexrest-bridge constraint as aiGenerateClient / crmWriteClient: the
 * bundle's app-domain session can only reach /services/apexrest/*. So the
 * Configuration page reads and writes its org-level settings through
 * CommandCenterConfigRest.
 *
 *   GET  /services/apexrest/config/?center=retail   → { config }
 *   GET  /services/apexrest/config/models           → { models, source }
 *   POST /services/apexrest/config/                  → { config }
 *
 * Config is org-level and shared (one singleton record, one JSON blob per
 * center). Each center is independent: saving Retail never touches Wealth.
 */
import { createDataSDK } from '@salesforce/platform-sdk';
import type { PersonaKey } from '../theme/themes';
import type { AiGenerateTask } from './aiGenerateClient';

/** The AI actions a center can pick a model for — mirrors AiGenerateTask and
 *  the server's ACTIONS allowlist. */
export type AiActionKey = AiGenerateTask;

/** One selectable model in the catalog dropdown. */
export interface ModelOption {
  /** API name sent to the Models API (e.g. 'sfdc_ai__DefaultGPT4Omni'). */
  name: string;
  /** Human-facing dropdown label. */
  label: string;
}

/** Generation parameters. Stored & validated server-side; see the "not yet
 *  applied" note in ConfigPage — this org's Apex Models API binding exposes no
 *  temperature/maxTokens field, so these round-trip but don't yet reach the
 *  model. */
export interface GenerationParams {
  temperature: number;
  maxTokens: number;
}

/** A center's full configuration: a model per AI action + generation params. */
export interface CommandCenterConfig {
  /** action → model API name. '' means "use the server default model". */
  models: Record<AiActionKey, string>;
  params: GenerationParams;
}

/** Catalog response: the selectable models plus where they came from. */
export interface ModelCatalog {
  models: ModelOption[];
  /** 'catalog' = live Einstein list; 'fallback' = curated built-in list. */
  source: 'catalog' | 'fallback';
}

/** The AI actions, in dropdown order, with their human labels. */
export const AI_ACTION_LABELS: Record<AiActionKey, string> = {
  queue_rationale: 'Priority queue — “why this order”',
  pipeline_summary: 'Pipeline summary',
  followups: 'Follow-up drafting',
  freeform: 'Free-form / ad-hoc asks',
};

/** Ordered action keys (Object key order isn't guaranteed for iteration UIs). */
export const AI_ACTION_KEYS: AiActionKey[] = [
  'queue_rationale',
  'pipeline_summary',
  'followups',
  'freeform',
];

/** Server defaults, mirrored client-side so the UI can render before the first
 *  fetch resolves and so a failed fetch degrades to a sane baseline. */
export const DEFAULT_CONFIG: CommandCenterConfig = {
  models: {
    queue_rationale: '',
    pipeline_summary: '',
    followups: '',
    freeform: '',
  },
  params: { temperature: 0.7, maxTokens: 512 },
};

async function sdkFetch(): Promise<(input: string, init?: RequestInit) => Promise<Response>> {
  const sdk = await createDataSDK();
  if (!sdk.fetch) {
    throw new Error('fetch is not available on this surface');
  }
  return sdk.fetch.bind(sdk);
}

/** Coerce an arbitrary server payload into a well-formed CommandCenterConfig so
 *  the UI never has to null-check nested fields. */
function normalizeConfig(raw: unknown): CommandCenterConfig {
  const cfg = (raw ?? {}) as Partial<CommandCenterConfig>;
  const modelsIn = (cfg.models ?? {}) as Partial<Record<AiActionKey, string>>;
  const paramsIn = (cfg.params ?? {}) as Partial<GenerationParams>;
  return {
    models: {
      queue_rationale: modelsIn.queue_rationale ?? '',
      pipeline_summary: modelsIn.pipeline_summary ?? '',
      followups: modelsIn.followups ?? '',
      freeform: modelsIn.freeform ?? '',
    },
    params: {
      temperature:
        typeof paramsIn.temperature === 'number' ? paramsIn.temperature : DEFAULT_CONFIG.params.temperature,
      maxTokens:
        typeof paramsIn.maxTokens === 'number' ? paramsIn.maxTokens : DEFAULT_CONFIG.params.maxTokens,
    },
  };
}

/** Read a center's saved configuration (defaults-filled server-side). */
export async function fetchConfig(center: PersonaKey): Promise<CommandCenterConfig> {
  const fetch = await sdkFetch();
  const res = await fetch(`/services/apexrest/config/?center=${encodeURIComponent(center)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const json = (await res.json()) as { config?: unknown; error?: string };
  if (!res.ok) {
    throw new Error(json?.error ?? `Failed to read configuration (HTTP ${res.status})`);
  }
  return normalizeConfig(json.config);
}

/** Save a center's configuration. Returns the server-sanitized result (models
 *  validated to the allowlist, params clamped) so the UI shows exactly what was
 *  stored. */
export async function saveConfig(
  center: PersonaKey,
  config: CommandCenterConfig
): Promise<CommandCenterConfig> {
  const fetch = await sdkFetch();
  const res = await fetch('/services/apexrest/config/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ center, config }),
  });
  const json = (await res.json()) as { config?: unknown; error?: string };
  if (!res.ok) {
    throw new Error(json?.error ?? `Failed to save configuration (HTTP ${res.status})`);
  }
  return normalizeConfig(json.config);
}

/** Fetch the selectable-model catalog (live Einstein list, or curated
 *  fallback). Never rejects for "catalog unavailable" — the server returns the
 *  fallback with source:'fallback' instead. */
export async function fetchModelCatalog(): Promise<ModelCatalog> {
  const fetch = await sdkFetch();
  const res = await fetch('/services/apexrest/config/models', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const json = (await res.json()) as { models?: ModelOption[]; source?: ModelCatalog['source']; error?: string };
  if (!res.ok) {
    throw new Error(json?.error ?? `Failed to read model catalog (HTTP ${res.status})`);
  }
  return { models: json.models ?? [], source: json.source ?? 'fallback' };
}
