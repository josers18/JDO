import { useEffect, useState } from 'react';
import { GlassCard } from '../GlassCard';
import { Button } from '../Button';
import { Pill } from '../Pill';
import { Modal } from '../Modal';
import { Field, TextInput } from '../home/fields';
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
import { setBrandOverride, type BrandOverride } from '../../theme/activeBrand';
import { DEFAULT_THEMES, type DefaultTheme } from '../../theme/defaultThemes';

const DEFAULT_ACCENT = '#14b8a6';
const DEFAULT_ACCENT_SOFT = '#5eead4';

/** Clamp to a 0–255 byte and 2-digit hex. */
function byteHex(n: number): string {
  const b = Math.max(0, Math.min(255, Math.round(n)));
  return b.toString(16).padStart(2, '0');
}

/**
 * Parse a user-typed color in hex (`#abc`, `abc`, `#aabbcc`, `aabbcc`) OR rgb
 * (`rgb(12, 34, 56)`, `12,34,56`, `12 34 56`) into a canonical `#rrggbb`, or
 * `null` when it isn't a complete/valid color yet (so the caller can keep the
 * last good value while the user is mid-type).
 */
function parseColor(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  // hex, with or without leading '#'
  const hex = s.replace(/^#/, '');
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  if (/^[0-9a-f]{3}$/.test(hex)) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  // rgb: pull the first three integers out of any "rgb(...)" / "r,g,b" / "r g b"
  const nums = s.replace(/rgba?/, '').match(/\d{1,3}/g);
  if (nums && nums.length >= 3) {
    const [r, g, b] = nums.slice(0, 3).map(Number);
    if ([r, g, b].every(n => n >= 0 && n <= 255)) return `#${byteHex(r)}${byteHex(g)}${byteHex(b)}`;
  }
  return null;
}

/** Format a `#rrggbb` for display in the chosen mode: hex passthrough or `rgb(r, g, b)`. */
function formatColor(hex: string, mode: 'hex' | 'rgb'): string {
  if (mode === 'hex') return hex;
  const h = hex.replace(/^#/, '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * A color control that pairs the native OS swatch picker with a text field
 * accepting BOTH hex and rgb, plus a HEX/RGB display toggle. `value` is always
 * a canonical `#rrggbb`; `onChange` reports one back. Invalid/partial text is
 * kept locally (so typing isn't clobbered) and only committed once it parses.
 */
function ColorInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
}) {
  const [mode, setMode] = useState<'hex' | 'rgb'>('hex');
  const [text, setText] = useState(() => formatColor(value, 'hex'));
  const [focused, setFocused] = useState(false);

  // Reseed the text from the canonical value when it changes externally (swatch
  // pick, palette fill, reset) or when the display mode flips — but not while
  // the user is actively editing, so we don't fight their keystrokes.
  useEffect(() => {
    if (!focused) setText(formatColor(value, mode));
  }, [value, mode, focused]);

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 w-11 flex-none rounded-[9px] border border-line bg-bg"
        aria-label="Color swatch"
      />
      <input
        type="text"
        value={text}
        spellCheck={false}
        placeholder={mode === 'hex' ? '#14b8a6' : 'rgb(20, 184, 166)'}
        onFocus={() => setFocused(true)}
        onChange={e => {
          setText(e.target.value);
          const parsed = parseColor(e.target.value);
          if (parsed) onChange(parsed);
        }}
        onBlur={() => {
          setFocused(false);
          const parsed = parseColor(text);
          setText(formatColor(parsed ?? value, mode));
          if (parsed) onChange(parsed);
        }}
        className="min-w-0 flex-1 rounded-[11px] border border-line bg-bg px-3 py-2 font-mono text-[12.5px] text-fg outline-none focus:border-accent-border"
      />
      <div className="inline-flex flex-none rounded-[9px] border border-line bg-bg p-0.5">
        {(['hex', 'rgb'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`rounded-[7px] px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] transition-colors ${
              mode === m ? 'bg-accent text-white' : 'text-muted hover:text-fg'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Build the live brand override from a saved theme, carrying every optional
 *  per-role color (empty → undefined so the client derives its default). */
function overrideFromTheme(t: BrandTheme): BrandOverride {
  return {
    accent: t.accent,
    accentSoft: t.accentSoft,
    aiAccent: t.aiAccent?.trim() || undefined,
    bgAccent: t.bgAccent?.trim() || undefined,
    posColor: t.posColor?.trim() || undefined,
    negColor: t.negColor?.trim() || undefined,
    linkColor: t.linkColor?.trim() || undefined,
    logoBase64: t.logoBase64,
    brandName: t.brandName?.trim() || t.name,
  };
}

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
  // Optional dedicated AI/agentic accent — empty string means "derive from
  // accent" (agentic surfaces share the brand hue). A #rrggbb gives AI its own.
  const [aiAccent, setAiAccent] = useState('');
  // Optional per-role colors; '' means "derive default" (see BrandTheme).
  const [bgAccent, setBgAccent] = useState('');
  const [posColor, setPosColor] = useState('');
  const [negColor, setNegColor] = useState('');
  const [linkColor, setLinkColor] = useState('');
  const [rolesOpen, setRolesOpen] = useState(false);
  // Dominant colors pulled from the logo (most frequent first), offered as
  // clickable swatches. `swatchRole` selects which role a swatch click fills:
  // the primary accent (auto-pairs a soft), the soft directly, or the AI accent.
  const [candidates, setCandidates] = useState<string[]>([]);
  const [swatchRole, setSwatchRole] = useState<'accent' | 'accentSoft' | 'aiAccent'>('accent');
  // Inside the "Assign colors to elements" modal: the palette swatch the user
  // has selected to fill into a role next (click-to-fill UX). '' = none picked.
  const [modalSwatch, setModalSwatch] = useState('');
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
    setAiAccent('');
    setBgAccent('');
    setPosColor('');
    setNegColor('');
    setLinkColor('');
    setCandidates([]);
    setSwatchRole('accent');
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
    setAiAccent(theme.aiAccent?.trim() || '');
    setBgAccent(theme.bgAccent?.trim() || '');
    setPosColor(theme.posColor?.trim() || '');
    setNegColor(theme.negColor?.trim() || '');
    setLinkColor(theme.linkColor?.trim() || '');
    setCandidates([]);
    setSwatchRole('accent');
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
        // Only send optional role colors when explicitly set — empty means
        // "derive default" and is stored as absent.
        ...(aiAccent.trim() ? { aiAccent: aiAccent.trim() } : {}),
        ...(bgAccent.trim() ? { bgAccent: bgAccent.trim() } : {}),
        ...(posColor.trim() ? { posColor: posColor.trim() } : {}),
        ...(negColor.trim() ? { negColor: negColor.trim() } : {}),
        ...(linkColor.trim() ? { linkColor: linkColor.trim() } : {}),
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
        setBrandOverride(overrideFromTheme(theme));
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
      setBrandOverride(overrideFromTheme(theme));
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

  // Assign a clicked logo color to the currently-selected role. Picking the
  // primary accent also auto-pairs a harmonious soft (split-complementary);
  // soft and AI are set directly. All remain overridable via the pickers.
  function pickSwatch(hex: string) {
    if (swatchRole === 'accent') {
      setAccent(hex);
      setAccentSoft(complementOf(hex));
    } else if (swatchRole === 'accentSoft') {
      setAccentSoft(hex);
    } else {
      setAiAccent(hex);
    }
  }

  /** The current color occupying a given role (for the swatch selected-ring). */
  function roleValue(role: 'accent' | 'accentSoft' | 'aiAccent'): string {
    return role === 'accent' ? accent : role === 'accentSoft' ? accentSoft : aiAccent;
  }

  const logoDataUrl = logoBase64 ? `data:${logoContentType || 'image/png'};base64,${logoBase64}` : null;

  // The themeable "elements" shown in the Assign-colors modal. Each row maps a
  // human element name to a color slot. `value` is the raw stored color (''
  // means "not set — derive default"); `effective` is what actually renders so
  // the chip always shows a real color even for an unset optional role.
  // Optional roles show a "Reset" affordance; required ones (accent/soft) don't.
  const roles: {
    key: string;
    label: string;
    hint: string;
    value: string;
    effective: string;
    set: (hex: string) => void;
    reset?: () => void;
  }[] = [
    {
      key: 'accent',
      label: 'Buttons & primary actions',
      hint: 'Schedule call, Approve, Save — the “you act” color',
      value: accent,
      effective: accent,
      set: setAccent,
    },
    {
      key: 'accentSoft',
      label: 'Highlights & soft accents',
      hint: 'Gradients, active states, hover glows',
      value: accentSoft,
      effective: accentSoft,
      set: setAccentSoft,
      reset: () => setAccentSoft(complementOf(accent)),
    },
    {
      key: 'aiAccent',
      label: 'AI & Agentforce chat',
      hint: 'Prep me, the Agentforce bubble — the “AI acts” color',
      value: aiAccent,
      effective: aiAccent || accent,
      set: setAiAccent,
      reset: () => setAiAccent(''),
    },
    {
      key: 'bgAccent',
      label: 'Background wash',
      hint: 'The ambient page aurora behind everything',
      value: bgAccent,
      effective: bgAccent || accent,
      set: setBgAccent,
      reset: () => setBgAccent(''),
    },
    {
      key: 'posColor',
      label: 'Positive / success',
      hint: 'Up trends, healthy metrics, confirmations',
      value: posColor,
      effective: posColor || '#22c55e',
      set: setPosColor,
      reset: () => setPosColor(''),
    },
    {
      key: 'negColor',
      label: 'Negative / risk',
      hint: 'Down trends, at-risk flags, errors',
      value: negColor,
      effective: negColor || '#ef4444',
      set: setNegColor,
      reset: () => setNegColor(''),
    },
    {
      key: 'linkColor',
      label: 'Links & info',
      hint: 'View all →, + New, informational chips',
      value: linkColor,
      effective: linkColor || accent,
      set: setLinkColor,
      reset: () => setLinkColor(''),
    },
  ];

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
            Colors from logo · click a swatch to fill the selected role
          </span>
          <div className="mb-2.5 inline-flex rounded-[9px] border border-line bg-bg p-0.5">
            {([
              ['accent', 'Accent'],
              ['accentSoft', 'Accent soft'],
              ['aiAccent', 'AI accent'],
            ] as const).map(([role, label]) => (
              <button
                key={role}
                type="button"
                onClick={() => setSwatchRole(role)}
                aria-pressed={swatchRole === role}
                className={`rounded-[7px] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ${
                  swatchRole === role ? 'bg-accent text-white' : 'text-muted hover:text-fg'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {candidates.map(c => {
              const isSelected = c.toLowerCase() === roleValue(swatchRole).toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => pickSwatch(c)}
                  title={`${c} — set as ${swatchRole}`}
                  aria-label={`Set ${swatchRole} to ${c}`}
                  aria-pressed={isSelected}
                  className={`h-8 w-8 flex-none rounded-[8px] border transition-transform hover:scale-110 ${
                    isSelected ? 'border-fg ring-2 ring-accent ring-offset-1 ring-offset-bg' : 'border-line'
                  }`}
                  style={{ background: c }}
                />
              );
            })}
          </div>
        </div>
      )}

      <Field label="Accent">
        <ColorInput value={accent} onChange={setAccent} />
      </Field>
      <Field label="Accent soft">
        <ColorInput value={accentSoft} onChange={setAccentSoft} />
      </Field>

      <div className="mb-4 -mt-1">
        <button
          type="button"
          onClick={() => setAccentSoft(complementOf(accent))}
          className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-accent hover:brightness-110"
        >
          ↻ Suggest complementary soft color
        </button>
      </div>

      <Field label="AI accent (Agentforce chat, AI buttons)">
        <div className="flex items-center gap-2.5">
          <ColorInput
            value={aiAccent || complementOf(accent)}
            onChange={setAiAccent}
            className="flex-1"
          />
          {aiAccent ? (
            <Button variant="ghost" size="sm" onClick={() => setAiAccent('')}>
              Derive from accent
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setAiAccent(complementOf(accent))}>
              Use distinct color
            </Button>
          )}
        </div>
        <p className="mt-1 text-[11.5px] text-muted">
          {aiAccent
            ? 'AI surfaces use this dedicated color.'
            : 'AI surfaces derive from the accent. Set a distinct color to separate “you act” from “AI acts”.'}
        </p>
      </Field>

      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => setRolesOpen(true)}>
          🎨 Assign colors to elements…
        </Button>
        {(bgAccent || posColor || negColor || linkColor) && (
          <span className="ml-2 align-middle font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            {[bgAccent && 'bg', posColor && 'pos', negColor && 'neg', linkColor && 'link']
              .filter(Boolean)
              .join(' · ')}{' '}
            set
          </span>
        )}
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

      <Modal
        open={rolesOpen}
        onClose={() => setRolesOpen(false)}
        title="Assign colors to elements"
        subtitle="Pick a color from the palette, then click an element to fill it. Or use each element’s picker."
        icon="🎨"
        tone="accent"
        size="md"
        footer={
          <div className="flex items-center justify-end">
            <Button variant="accent" onClick={() => setRolesOpen(false)}>
              Done
            </Button>
          </div>
        }
      >
        {candidates.length > 0 && (
          <div className="mb-5">
            <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              Palette from logo · select a color, then click an element below
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {candidates.map(c => {
                const isSelected = c.toLowerCase() === modalSwatch.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setModalSwatch(isSelected ? '' : c)}
                    title={c}
                    aria-label={`Select ${c} to fill an element`}
                    aria-pressed={isSelected}
                    className={`h-9 w-9 flex-none rounded-[8px] border transition-transform hover:scale-110 ${
                      isSelected ? 'border-fg ring-2 ring-accent ring-offset-1 ring-offset-bg' : 'border-line'
                    }`}
                    style={{ background: c }}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {roles.map(r => {
            const isUnset = !r.value.trim();
            const canFill = !!modalSwatch;
            return (
              <div
                key={r.key}
                className="flex items-center gap-3 rounded-[11px] border border-line bg-bg px-3.5 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => canFill && r.set(modalSwatch)}
                  disabled={!canFill}
                  title={canFill ? `Fill with ${modalSwatch}` : 'Select a palette color first'}
                  aria-label={`Fill ${r.label}${canFill ? ` with ${modalSwatch}` : ''}`}
                  className={`h-9 w-9 flex-none rounded-[8px] border border-line transition-transform ${
                    canFill ? 'cursor-pointer hover:scale-110' : 'cursor-default'
                  }`}
                  style={{ background: r.effective }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <b className="truncate text-[13px] font-semibold text-fg">{r.label}</b>
                    {isUnset && r.reset && (
                      <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                        default
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11.5px] text-muted">{r.hint}</div>
                </div>
                <ColorInput value={r.effective} onChange={r.set} className="flex-none" />
                {r.reset && (
                  <button
                    type="button"
                    onClick={r.reset}
                    disabled={isUnset}
                    title="Reset to default"
                    className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted hover:text-fg disabled:opacity-40"
                  >
                    Reset
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {candidates.length === 0 && (
          <p className="mt-4 text-[11.5px] text-muted">
            Tip: extract a logo above to get a clickable palette here. You can still set any element
            with its own color picker.
          </p>
        )}
      </Modal>
    </GlassCard>
  );
}
