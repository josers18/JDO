import { useEffect, useState } from 'react';
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
  type AiActionKey,
} from '../../data/configClient';
import { primeCenterConfig } from '../../data/configCache';

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
 * HONESTY NOTE (rendered in the UI too): this org's Apex Models API binding
 * exposes only a per-request model name — no temperature/max-tokens field. The
 * parameters are stored and validated (they round-trip and clamp) but are NOT
 * yet applied to generation. The model selection IS applied per action.
 */
export function ConfigPage({ center, onBack }: { center: PersonaKey; onBack?: () => void }) {
  const { toast } = useToast();
  const [config, setConfig] = useState<CommandCenterConfig>(DEFAULT_CONFIG);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [catalogSource, setCatalogSource] = useState<'catalog' | 'fallback'>('fallback');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([fetchConfig(center), fetchModelCatalog()])
      .then(([cfg, catalog]) => {
        if (!alive) return;
        setConfig(cfg);
        setModels(catalog.models);
        setCatalogSource(catalog.source);
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
  }, [center]);

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
      toast('Configuration saved', `${centerLabel(center)} command center`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save configuration.';
      setError(msg);
      toast('Save failed', msg);
    } finally {
      setSaving(false);
    }
  }

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

      <GlassCard title="Model per AI action" index={0}>
        <p className="mb-4 text-[12.5px] text-muted">
          Choose which model powers each generative action. “Server default” lets the org decide.
          {catalogSource === 'fallback' && (
            <span className="ml-1 text-warn">Live catalog unavailable — showing a curated list.</span>
          )}
        </p>
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

      <div className="h-5" />

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

      <div className="mt-6 flex justify-end">
        <Button variant="accent" onClick={onSave} disabled={saving || loading}>
          {saving ? 'Saving…' : 'Save configuration'}
        </Button>
      </div>
    </div>
  );
}

function centerLabel(center: PersonaKey): string {
  return center.charAt(0).toUpperCase() + center.slice(1);
}
