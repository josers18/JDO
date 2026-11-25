import { AtlasReadPerformance } from './AtlasReadPerformance';
import { AtlasAgentSettings } from './AtlasAgentSettings';
import { useContext, useEffect, useState } from 'react';
import { GlassCard } from '../GlassCard';
import { Button } from '../Button';
import { Icon } from '../iconMap';
import { Field, SelectInput, TextInput } from '../home/fields';
import { useToast } from '../Toast';
import type { PersonaKey } from '../../theme/themes';
import {
  fetchConfig,
  saveConfig,
  fetchModelCatalog,
  AI_ACTION_LABELS,
  AI_ACTION_KEYS,
  DEFAULT_CONFIG,
  type CommandCenterConfig,
  type ModelOption,
  type ModelCatalog,
  type AiActionKey,
} from '../../data/configClient';
import { primeCenterConfig } from '../../data/configCache';
import { BrandThemeSection } from './BrandThemeSection';
import { DisplaySizeControl } from './DisplaySizeControl';
import { AtlasAccentContext } from '../atlas/AtlasAccentContext';

function readAtlasModelDraft(key: string): CommandCenterConfig | null {
  if (!key) return null;
  try {
    const draft: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (!draft || typeof draft !== 'object' || !('models' in draft) || !('params' in draft)) return null;
    const { models, params } = draft;
    if (!models || typeof models !== 'object' || !params || typeof params !== 'object') return null;
    const selections = models as Record<string, unknown>;
    const values = params as Record<string, unknown>;
    const temperature = values.temperature;
    const maxTokens = values.maxTokens;
    if (!AI_ACTION_KEYS.every(action => typeof selections[action] === 'string')
      || typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2
      || typeof maxTokens !== 'number' || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096) return null;
    return { models: Object.fromEntries(AI_ACTION_KEYS.map(action => [action, selections[action]])) as CommandCenterConfig['models'], params: { temperature, maxTokens } };
  } catch {
    return null;
  }
}

/**
 * Command-center Configuration page.
 *
 * Org-level, shared settings for one center (Retail / Wealth / Commercial):
 *   · a model per AI action (queue rationale, pipeline summary, follow-ups,
 *     free-form) — chosen from the live Einstein catalog (curated fallback);
 *   · generation parameters (temperature, max tokens).
 *
 * Reads on mount, saves instantly through CommandCenterConfigRest, and primes
 * the shared config cache so the home page's next AI action uses the new
 * settings without a reload. Each center is independent — this page only ever
 * reads/writes `center`.
 *
 * SELF-UPDATING CATALOG: the model list is discovered by the server probing the
 * live Models API and cached; a stale cache refreshes in the background. When a
 * refresh is in flight the page shows a "checking for new models…" hint, and
 * the current tab polls until the probe completes.
 *
 * HONESTY NOTE (rendered in the UI too): this org's Apex Models API binding
 * exposes only a per-request model name — no temperature/max-tokens field. The
 * parameters are stored and validated (they round-trip and clamp) but are NOT
 * yet applied to generation. The model selection IS applied per action.
 */
export function ConfigPage({ center, onBack, appearance }: { center: PersonaKey; onBack?: () => void; appearance?: 'atlas' }) {
  const { toast } = useToast();
  const { actorScope } = useContext(AtlasAccentContext);
  const [section, setSection] = useState<'Themes' | 'AI models' | 'Agents' | 'Display size' | 'Performance'>('Themes');
  const draftKey = appearance === 'atlas' && actorScope ? `cumulus.atlas.config.${center}.${actorScope}` : '';
  const [config, setConfig] = useState<CommandCenterConfig>(DEFAULT_CONFIG);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [catalogSource, setCatalogSource] = useState<'probed' | 'fallback'>('fallback');
  const [refreshing, setRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number>();
  const [catalogError, setCatalogError] = useState('');
  function applyCatalog(catalog: ModelCatalog) {
    setModels(catalog.models);
    setCatalogSource(catalog.source);
    setRefreshing(catalog.refreshing);
    setCheckedAt(catalog.discoveredAt);
    setCatalogError(catalog.lastAttemptFailed && !catalog.refreshing ? 'The last check could not verify any models.' : '');
  }
  const [loading, setLoading] = useState(true);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setConfigLoaded(false);
    setError(null);
    Promise.all([fetchConfig(center), fetchModelCatalog()])
      .then(([cfg, catalog]) => {
        if (!alive) return;
        setConfig(readAtlasModelDraft(draftKey) ?? cfg);
        setConfigLoaded(true);
        applyCatalog(catalog);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Failed to load configuration.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [center, draftKey]);

  useEffect(() => {
    if (!refreshing) return;
    let alive = true;
    let timer: number;
    const until = Date.now() + 10 * 60_000;
    async function poll() {
      try {
        const next = await fetchModelCatalog();
        if (!alive) return;
        applyCatalog(next);
        if (!next.refreshing) return;
        if (Date.now() < until) timer = window.setTimeout(poll, 5000);
        else {
          setRefreshing(false);
          setCatalogError('Verification is taking longer than expected. Refresh to check again.');
        }
      } catch {
        if (alive) {
          setRefreshing(false);
          setCatalogError('Could not read the model catalog. Refresh to try again.');
        }
      }
    }
    timer = window.setTimeout(poll, 5000);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [refreshing]);

  async function onRefreshModels() {
    setRefreshing(true);
    try {
      applyCatalog(await fetchModelCatalog({ refresh: true }));
    } catch (e) {
      setRefreshing(false);
      setCatalogError(e instanceof Error ? e.message : 'Could not refresh models.');
    }
  }

  function setModel(action: AiActionKey, name: string) {
    setConfig(c => ({ ...c, models: { ...c.models, [action]: name } }));
  }

  function setParam(key: keyof CommandCenterConfig['params'], value: number) {
    setConfig(c => ({ ...c, params: { ...c.params, [key]: value } }));
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveConfig(center, config);
      setConfig(saved); // server-sanitized (models allowlisted, params clamped)
      primeCenterConfig(center, saved);
      if (draftKey) {
        try { sessionStorage.removeItem(draftKey); } catch { /* The live save still succeeded. */ }
      }
      toast('Configuration saved', `${centerLabel(center)} command center`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save configuration.';
      setError(msg);
      toast('Save failed', msg);
    } finally {
      setSaving(false);
    }
  }

  function keepDraft() {
    if (!draftKey) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(config));
      toast('Configuration draft kept', 'Available in this browser tab.');
    } catch {
      toast('Draft unavailable', 'This browser did not allow local storage.');
    }
  }

  const modelsCard = (
      <GlassCard title="Model per AI action" index={0}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className="text-[12.5px] text-muted">
            Choose which model powers each generative action. “Server default” uses the application’s default model.
            {catalogSource === 'fallback' && (
              <span className="ml-1 text-warn">
                Showing documented model names. Availability in this org is unverified.
              </span>
            )}
            {catalogError && <span role="status" className="ml-1 text-warn">{catalogError}</span>}
            {refreshing ? (
              <span className="ml-1 text-accent">Checking for new models…</span>
            ) : (
              catalogSource === 'probed' && (
                <span className="ml-1 text-muted">Verified in this org{checkedAt ? ` · ${new Date(checkedAt).toLocaleString()}` : ''}.</span>
              )
            )}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefreshModels}
            disabled={loading || refreshing}
            className="shrink-0"
          >
            <Icon name="refresh" size={13} className={refreshing ? 'animate-spin' : undefined} />
            {refreshing ? 'Checking…' : 'Refresh models'}
          </Button>
        </div>
        {loading ? (
          <p className="text-[13px] text-muted">Loading…</p>
        ) : (
          AI_ACTION_KEYS.map(action => (
            <Field key={action} label={AI_ACTION_LABELS[action]}>
              <SelectInput
                value={config.models[action]}
                onChange={e => setModel(action, e.target.value)}
                disabled={saving}
              >
                <option value="">Server default</option>
                {config.models[action] && !models.some(m => m.name === config.models[action]) && <option value={config.models[action]}>{config.models[action]}</option>}
                {models.map(m => (
                  <option key={m.name} value={m.name}>
                    {m.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
          ))
        )}
      </GlassCard>
  );

  const paramsCard = (
      <GlassCard title="Generation parameters" index={1}>
        <p className="mb-4 text-[12.5px] text-muted">
          <span className="font-semibold text-warn">Stored, not yet applied.</span> This org’s Apex
          Models API binding accepts only a model name per request — temperature and max tokens are
          saved and validated here for when the platform binding supports them.
        </p>
        <div className="grid grid-cols-2 gap-3.5">
          <Field label="Temperature (0–2)">
            <TextInput
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={config.params.temperature}
              onChange={e => setParam('temperature', Number(e.target.value))}
              disabled={saving || loading}
            />
          </Field>
          <Field label="Max tokens (1–4096)">
            <TextInput
              type="number"
              min={1}
              max={4096}
              step={1}
              value={config.params.maxTokens}
              onChange={e => setParam('maxTokens', Number(e.target.value))}
              disabled={saving || loading}
            />
          </Field>
        </div>
      </GlassCard>
  );

  const displayCard = (
      <GlassCard title="Display size" index={3}>
        <p className="mb-4 text-[12.5px] text-muted">
          Scales the whole interface — text, labels, and boxes — for readability and
          presentations. Applies instantly and is saved to your user, so it follows you across
          command centers. This is a personal setting; it doesn’t affect other users.
        </p>
        <DisplaySizeControl />
      </GlassCard>
  );

  const saveButton = (
      <div className="mt-6 flex justify-end">
        <Button variant="accent" onClick={onSave} disabled={saving || loading}>
          {saving ? 'Saving…' : 'Save configuration'}
        </Button>
      </div>
  );

  if (appearance === 'atlas') return (
    <div className="atlas-settings">
      <header><p>{centerLabel(center)} command center</p><h1>Configuration</h1></header>
      <nav aria-label="Configuration sections">
        {(['Themes', 'AI models', 'Agents', 'Display size', 'Performance'] as const).map(name =>
          <button key={name} aria-pressed={section === name} onClick={() => setSection(name)}>{name}</button>)}
      </nav>
      {error && <p role="alert">{error}</p>}
      <div hidden={section !== 'Themes'}><BrandThemeSection workspace={center} /></div>
      <div hidden={section !== 'AI models'}>{modelsCard}{paramsCard}
        <div className="atlas-settings-actions">
          <Button variant="ghost" onClick={keepDraft} disabled={!draftKey || !configLoaded}>Keep configuration draft</Button>
          <Button variant="accent" onClick={onSave} disabled={!configLoaded || saving}>{saving ? 'Saving…' : 'Save configuration'}</Button>
        </div>
      </div>
      {section === 'Performance' && <AtlasReadPerformance />}
      {section === 'Agents' && <AtlasAgentSettings center={center} />}
      <div hidden={section !== 'Display size'}>{displayCard}</div>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-5">
          <Icon name="arrow" size={14} className="rotate-180" />
          Back to command center
        </Button>
      )}

      <header className="mb-6">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          {centerLabel(center)} command center
        </p>
        <h1 className="text-2xl font-semibold text-fg">Configuration</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          Org-level settings shared by everyone using this command center. Changes save instantly.
        </p>
      </header>

      {error && (
        <div className="mb-5 rounded-[11px] border border-risk bg-risk-bg px-4 py-3 text-[13px] text-risk">
          {error}
        </div>
      )}

      {modelsCard}

      <div className="h-5" />

      {paramsCard}

      <div className="h-5" />
      <BrandThemeSection index={2} />

      <div className="h-5" />
      {displayCard}

      {saveButton}
    </div>
  );
}

function centerLabel(center: PersonaKey): string {
  return center.charAt(0).toUpperCase() + center.slice(1);
}
