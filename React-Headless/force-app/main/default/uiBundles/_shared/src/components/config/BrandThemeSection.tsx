import { useEffect, useState } from 'react';
import { GlassCard } from '../GlassCard';
import { Button } from '../Button';
import { Pill } from '../Pill';
import { Field, FieldRow, TextInput } from '../home/fields';
import { useToast } from '../Toast';
import {
  fetchBrandLogo,
  listThemes,
  saveTheme,
  deleteTheme,
  setActiveTheme,
} from '../../data/brandThemeClient';
import { buildGradient, buildGlow, type BrandTheme } from '../../theme/brandThemes';
import { extractPalette, extractPaletteCandidates, complementOf } from '../../theme/paletteExtract';
import { setBrandOverride } from '../../theme/activeBrand';
import { DEFAULT_THEMES, type DefaultTheme } from '../../theme/defaultThemes';

const DEFAULT_ACCENT = '#14b8a6';
const DEFAULT_ACCENT_SOFT = '#5eead4';

/**
 * Best-effort canvas palette extraction off a fetched logo. Pure DOM/canvas
 * plumbing around the pure `extractPalette` — never throws, returns `null`
 * on any failure so the caller keeps the pickers at their current values.
 */
async function paletteFromLogo(
  dataBody: string,
  contentType: string,
): Promise<{ accent: string; accentSoft: string; candidates: string[] } | null> {
  try {
    const src = 'data:' + (contentType || 'image/png') + ';base64,' + dataBody;
    const img = new Image();
    img.src = src;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('img'));
    });

    const MAX = 64;
    const naturalW = img.naturalWidth || img.width || MAX;
    const naturalH = img.naturalHeight || img.height || MAX;
    const scale = Math.min(1, MAX / Math.max(naturalW, naturalH));
    const w = Math.max(1, Math.round(naturalW * scale));
    const h = Math.max(1, Math.round(naturalH * scale));

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);

    const { data } = ctx.getImageData(0, 0, w, h);
    const { accent, accentSoft } = extractPalette(data);
    return { accent, accentSoft, candidates: extractPaletteCandidates(data) };
  } catch {
    return null;
  }
}

/** Derives a stable-ish id for a new theme (Save always creates a new row). */
function makeThemeId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Best-effort "acmebank.com" → "Acmebank" prefill for the theme name. */
function nameFromUrl(url: string): string {
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
    const label = host.split('.')[0] ?? host;
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return '';
  }
}

/**
 * Config-page section for the custom brand theming system: paste a site URL,
 * extract a logo + suggested accent palette, refine the colors, name and
 * save the theme, then manage the saved-theme library (apply / delete).
 *
 * D1: gradient/glow are DERIVED via buildGradient/buildGlow(accent) for the
 * live preview only — never stored on the theme, never sent to saveTheme.
 */
export function BrandThemeSection({ index }: { index?: number }) {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [logoContentType, setLogoContentType] = useState('');
  const [logoError, setLogoError] = useState(false);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [accentSoft, setAccentSoft] = useState(DEFAULT_ACCENT_SOFT);
  // Dominant colors pulled from the logo (most frequent first), offered as
  // clickable swatches so the user can choose which brand color is the accent.
  const [candidates, setCandidates] = useState<string[]>([]);
  const [name, setName] = useState('');
  // The wordmark shown in the app chrome (replaces "Cumulus"). Defaults to the
  // theme name when left blank.
  const [brandName, setBrandName] = useState('');
  const [themes, setThemes] = useState<BrandTheme[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The id of the saved theme currently loaded into the form for editing, or
  // null when composing a brand-new theme. When set, Save reuses this id so the
  // Apex `upsert` (which matches on id) REPLACES that row instead of adding a
  // new one.
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listThemes()
      .then(res => {
        if (!alive) return;
        setThemes(res.themes);
        setActiveThemeId(res.activeThemeId);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        toast('Couldn’t load saved themes', e instanceof Error ? e.message : undefined);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onExtract() {
    setExtracting(true);
    setLogoError(false);
    try {
      const trimmed = url.trim();
      const { logoBase64: nextLogo, logoContentType: nextType } = await fetchBrandLogo(trimmed);
      if (nextLogo) {
        setLogoBase64(nextLogo);
        setLogoContentType(nextType);
        const palette = await paletteFromLogo(nextLogo, nextType);
        if (palette) {
          setAccent(palette.accent);
          setAccentSoft(palette.accentSoft);
          setCandidates(palette.candidates);
        }
      } else {
        setLogoError(true);
      }
      if (!name.trim()) {
        const guess = nameFromUrl(trimmed);
        if (guess) setName(guess);
      }
      if (!brandName.trim()) {
        const guess = nameFromUrl(trimmed);
        if (guess) setBrandName(guess);
      }
    } finally {
      setExtracting(false);
    }
  }

  /** Clear the composer back to a fresh, empty "new theme" state. */
  function resetForm() {
    setEditingId(null);
    setUrl('');
    setLogoBase64(null);
    setLogoContentType('');
    setLogoError(false);
    setAccent(DEFAULT_ACCENT);
    setAccentSoft(DEFAULT_ACCENT_SOFT);
    setCandidates([]);
    setName('');
    setBrandName('');
  }

  /** Load a saved theme into the composer for editing (Save will replace it). */
  function startEdit(theme: BrandTheme) {
    setEditingId(theme.id);
    setUrl(theme.sourceUrl ?? '');
    setLogoBase64(theme.logoBase64);
    setLogoContentType(theme.logoContentType ?? '');
    setLogoError(false);
    setAccent(theme.accent);
    setAccentSoft(theme.accentSoft);
    setCandidates([]);
    setName(theme.name);
    setBrandName(theme.brandName?.trim() || theme.name);
  }

  async function onSave() {
    setSaving(true);
    try {
      const theme: BrandTheme = {
        // Reuse the id when editing so the server upsert replaces that row;
        // mint a fresh id for a brand-new theme.
        id: editingId ?? makeThemeId(),
        name: name.trim(),
        sourceUrl: url.trim(),
        logoBase64,
        logoContentType,
        accent,
        accentSoft,
        // Fall back to the theme name so the wordmark is never blank.
        brandName: brandName.trim() || name.trim(),
      };
      const res = await saveTheme(theme);
      setThemes(res.themes);
      setActiveThemeId(res.activeThemeId);
      // If we just edited the theme that's currently active, push the new
      // colors/logo/wordmark into the live override so the edit is visible
      // immediately without re-applying.
      if (editingId && res.activeThemeId === theme.id) {
        setBrandOverride({
          accent: theme.accent,
          accentSoft: theme.accentSoft,
          logoBase64: theme.logoBase64,
          brandName: theme.brandName?.trim() || theme.name,
        });
      }
      toast(editingId ? 'Theme updated' : 'Theme saved', theme.name);
      resetForm();
    } catch (e) {
      toast('Save failed', e instanceof Error ? e.message : 'Could not save theme.');
    } finally {
      setSaving(false);
    }
  }

  async function onApply(theme: BrandTheme) {
    setBusyId(theme.id);
    try {
      await setActiveTheme(theme.id);
      setActiveThemeId(theme.id);
      setBrandOverride({
        accent: theme.accent,
        accentSoft: theme.accentSoft,
        logoBase64: theme.logoBase64,
        brandName: theme.brandName?.trim() || theme.name,
      });
      toast('Theme applied', theme.name);
    } catch (e) {
      toast('Apply failed', e instanceof Error ? e.message : 'Could not apply theme.');
    } finally {
      setBusyId(null);
    }
  }

  async function onApplyDefault(theme: DefaultTheme) {
    setBusyId(theme.id);
    try {
      await setActiveTheme(theme.id);
      setActiveThemeId(theme.id);
      // Defaults carry a structural mode (dark|light) and no logo.
      setBrandOverride({
        accent: theme.accent,
        accentSoft: theme.accentSoft,
        logoBase64: null,
        mode: theme.mode,
      });
      toast('Theme applied', theme.name);
    } catch (e) {
      toast('Apply failed', e instanceof Error ? e.message : 'Could not apply theme.');
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(theme: BrandTheme) {
    setBusyId(theme.id);
    try {
      const res = await deleteTheme(theme.id);
      setThemes(res.themes);
      setActiveThemeId(res.activeThemeId);
      if (activeThemeId === theme.id) setBrandOverride(null);
      // If the deleted theme was loaded in the composer, drop back to a fresh
      // form so Save can't recreate it under the same (now-stale) id.
      if (editingId === theme.id) resetForm();
      toast('Theme deleted', theme.name);
    } catch (e) {
      toast('Delete failed', e instanceof Error ? e.message : 'Could not delete theme.');
    } finally {
      setBusyId(null);
    }
  }

  // Pick a logo color as the accent and auto-suggest a harmonious partner as
  // the accent-soft (split-complementary hue). The user can still override the
  // soft color with the picker afterward.
  function pickAccent(hex: string) {
    setAccent(hex);
    setAccentSoft(complementOf(hex));
  }

  const logoDataUrl = logoBase64 ? `data:${logoContentType || 'image/png'};base64,${logoBase64}` : null;

  return (
    <GlassCard title="Brand theme" index={index}>
      <p className="mb-4 text-[12.5px] text-muted">
        Paste a site URL to extract a logo and suggested palette. Refine the colors, name it, and
        apply it across every surface.
      </p>

      {editingId && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-[11px] border border-accent-border bg-accent-bg px-4 py-2.5">
          <span className="text-[12.5px] text-fg">
            Editing <b className="font-semibold">{name || 'theme'}</b> — Save replaces it.
          </span>
          <button
            type="button"
            onClick={resetForm}
            disabled={saving}
            className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-accent hover:brightness-110 disabled:opacity-50"
          >
            Cancel edit
          </button>
        </div>
      )}

      {logoError && (
        <div className="mb-4 rounded-[11px] border border-risk bg-risk-bg px-4 py-3 text-[13px] text-risk">
          Couldn&rsquo;t fetch a logo &mdash; add colors manually or continue with colors only.
        </div>
      )}

      <Field label="Site URL">
        <div className="flex items-center gap-2.5">
          <TextInput
            type="text"
            placeholder="acmebank.com"
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={extracting}
            className="flex-1"
          />
          <Button variant="ai" onClick={onExtract} disabled={!url.trim() || extracting}>
            {extracting ? 'Extracting…' : 'Extract'}
          </Button>
        </div>
      </Field>

      <div className="mb-4 flex items-center gap-3.5">
        {logoDataUrl && (
          <img src={logoDataUrl} alt="Extracted logo" className="h-11 w-11 rounded-[9px] object-contain" />
        )}
        <span
          className="h-11 flex-1 rounded-[9px]"
          style={{ background: buildGradient(accent) }}
          aria-hidden="true"
        />
        <span
          className="h-11 flex-1 rounded-[9px]"
          style={{ background: buildGlow(accent) }}
          aria-hidden="true"
        />
      </div>

      {candidates.length > 0 && (
        <div className="mb-4">
          <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            Colors from logo · click to set accent
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {candidates.map(c => {
              const isAccent = c.toLowerCase() === accent.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => pickAccent(c)}
                  title={`${c} — set as accent (soft auto-paired)`}
                  aria-label={`Set accent to ${c}`}
                  aria-pressed={isAccent}
                  className={`h-8 w-8 flex-none rounded-[8px] border transition-transform hover:scale-110 ${
                    isAccent ? 'border-fg ring-2 ring-accent ring-offset-1 ring-offset-bg' : 'border-line'
                  }`}
                  style={{ background: c }}
                />
              );
            })}
          </div>
        </div>
      )}

      <FieldRow>
        <Field label="Accent">
          <TextInput type="color" value={accent} onChange={e => setAccent(e.target.value)} />
        </Field>
        <Field label="Accent soft">
          <TextInput type="color" value={accentSoft} onChange={e => setAccentSoft(e.target.value)} />
        </Field>
      </FieldRow>

      <div className="mb-4 -mt-1">
        <button
          type="button"
          onClick={() => setAccentSoft(complementOf(accent))}
          className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-accent hover:brightness-110"
        >
          ↻ Suggest complementary soft color
        </button>
      </div>

      <Field label="Brand name (shown in the app)">
        <TextInput
          type="text"
          placeholder="Acmebank"
          value={brandName}
          onChange={e => setBrandName(e.target.value)}
          disabled={saving}
        />
      </Field>

      <Field label="Theme name">
        <div className="flex items-center gap-2.5">
          <TextInput
            type="text"
            placeholder="Acmebank"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={saving}
            className="flex-1"
          />
          <Button variant="accent" onClick={onSave} disabled={!name.trim() || saving}>
            {saving ? 'Saving…' : editingId ? 'Update theme' : 'Save theme'}
          </Button>
        </div>
      </Field>

      <div className="mt-5">
        <span className="mb-2.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Base themes
        </span>
        <div className="flex flex-col gap-2.5">
          {DEFAULT_THEMES.map(t => {
            const isActive = t.id === activeThemeId;
            const isBusy = busyId === t.id;
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-[11px] border border-line bg-bg px-3.5 py-2.5"
              >
                <span
                  className="h-8 w-8 flex-none rounded-[7px]"
                  style={{ background: buildGradient(t.accent) }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <b className="truncate text-[13.5px] font-semibold text-fg">{t.name}</b>
                    {isActive && <Pill tone="accent">Active</Pill>}
                  </div>
                  <div className="truncate font-mono text-[10.5px] text-muted">
                    Standard {t.mode} · always available
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onApplyDefault(t)}
                  disabled={isBusy || isActive}
                >
                  Apply
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <span className="mb-2.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Saved themes
        </span>
        {themes.length === 0 ? (
          <p className="text-[13px] text-muted">No saved themes yet.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {themes.map(t => {
              const isActive = t.id === activeThemeId;
              const isBusy = busyId === t.id;
              return (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 rounded-[11px] border bg-bg px-3.5 py-2.5 ${
                    editingId === t.id ? 'border-accent ring-1 ring-accent-border' : 'border-line'
                  }`}
                >
                  {t.logoBase64 ? (
                    <img
                      src={`data:${t.logoContentType || 'image/png'};base64,${t.logoBase64}`}
                      alt=""
                      aria-hidden="true"
                      className="h-8 w-8 flex-none rounded-[7px] border border-line bg-white object-contain p-0.5"
                    />
                  ) : (
                    <span
                      className="h-8 w-8 flex-none rounded-[7px]"
                      style={{ background: buildGradient(t.accent) }}
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <b className="truncate text-[13.5px] font-semibold text-fg">{t.name}</b>
                      {isActive && <Pill tone="accent">Active</Pill>}
                    </div>
                    {t.sourceUrl && (
                      <div className="truncate font-mono text-[10.5px] text-muted">{t.sourceUrl}</div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onApply(t)}
                    disabled={isBusy || isActive}
                  >
                    Apply
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(t)}
                    disabled={isBusy || saving}
                  >
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(t)} disabled={isBusy}>
                    Delete
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
