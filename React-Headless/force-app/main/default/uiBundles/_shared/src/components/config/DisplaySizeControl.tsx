import { useDisplaySize, setDisplaySize, DISPLAY_SIZE_PRESETS } from '../../theme/displaySize';
import { saveDisplaySize } from '../../data/brandThemeClient';

/**
 * Per-user "Display size" picker — a segmented list of named presets
 * (Default 100% · Comfortable 110% · Large 125% · Extra large 140%).
 *
 * Selecting a preset is OPTIMISTIC: it updates the module store immediately so
 * the whole app rescales (ThemeProvider reads `useDisplaySize` and applies the
 * preset's `zoom`), then persists to the per-user server map in the background.
 * A failed save is swallowed — the change still holds for the session, exactly
 * like the brand-theme flow; persistence is best-effort.
 *
 * `compact` renders the tight variant used inside the user menu; the default
 * renders the roomier card body used on the Configuration page.
 */
export function DisplaySizeControl({ compact = false }: { compact?: boolean }) {
  const active = useDisplaySize();

  function pick(id: string) {
    if (id === active) return;
    setDisplaySize(id); // instant rescale
    void saveDisplaySize(id).catch(() => {
      /* best-effort persistence; the session change stands regardless */
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Display size"
      style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 8 }}
    >
      {DISPLAY_SIZE_PRESETS.map((preset) => {
        const selected = preset.id === active;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => pick(preset.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              width: '100%',
              padding: compact ? '0.4rem 0.55rem' : '0.6rem 0.75rem',
              borderRadius: 'var(--wp-radius-sm)',
              border: selected
                ? '1px solid var(--wp-accent-border)'
                : '1px solid var(--wp-border)',
              background: selected ? 'var(--wp-accent-bg)' : 'transparent',
              color: 'var(--wp-text)',
              cursor: 'pointer',
              font: 'inherit',
              textAlign: 'left',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '0.5rem',
                fontSize: compact ? '0.84rem' : '0.9rem',
                fontWeight: selected ? 700 : 500,
              }}
            >
              {preset.label}
              <span style={{ fontSize: '0.72rem', color: 'var(--wp-text-faint)' }}>
                {preset.hint}
              </span>
            </span>
            {selected && (
              <span aria-hidden style={{ color: 'var(--wp-accent)', fontWeight: 800 }}>
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
