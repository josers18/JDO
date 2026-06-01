# Widget theme catalog & cookbook

Single reference for the **`--wp-*` theme system** shared by JDO's record-page LWCs (profile widgets, prediction cards, journey cockpit). Point new components at this doc — don't copy from a sibling and hope.

- **Visual catalog (PDF):** [`assets/widget_theme_catalog.pdf`](assets/widget_theme_catalog.pdf)
- **Palette poster (PDF):** [`assets/output/pdf/widget_theme_palette_poster.pdf`](assets/output/pdf/widget_theme_palette_poster.pdf)
- **Canonical worked example:** [`DC_Goals_Cockpit_lwc/.../fscJourneyCockpit/`](../DC_Goals_Cockpit_lwc/force-app/main/default/lwc/fscJourneyCockpit/) — newest implementation, includes the adapter pattern.

---

## 1. Theme inventory

42 named themes plus `default`, organised in eight families. Same names across every consumer.

| Component | Bundle | Theme module |
|---|---|---|
| DC_PersonProfileWidget | `customerProfileWidget` | inline `THEMES` constant in `customerProfileWidget.js` |
| DC_BusinessProfileWidget | `businessProfileWidget` | inline `THEMES` constant |
| DC_Prediction_Model_LWC | `classificationModelLwc` | `predictionThemes.js` |
| DC_Multiclass_Prediction_LWC | `multiclassPredictionLwc` | `predictionThemes.js` *(kept identical to Prediction Model)* |
| DC_Goals_Cockpit_lwc | `fscJourneyCockpit` | `cockpitThemes.js` *(adapter — imports `c/predictionThemes` and adds 3 cockpit tokens)* |

> **Today's duplication.** `predictionThemes.js` is physically copied between `DC_Prediction_Model_LWC` and `DC_Multiclass_Prediction_LWC` with a "keep this file identical" comment. New components should follow the **adapter pattern** ([§4](#4-adapter-pattern-recommended-for-new-components)) — `import { THEMES as BASE_THEMES } from 'c/predictionThemes'` and layer your own tokens on top, like `cockpitThemes.js` does.

---

## 2. CSS variable contract

Every theme is a flat object of CSS custom properties. A new component should consume these names directly (or alias them, see [§5](#5-css-aliasing)). Don't invent parallel tokens — extend.

### 2.1 Base palette (set by every theme)

| Token | What it controls |
|---|---|
| `--wp-shell-bg` | Outer card / shell background |
| `--wp-shell-border` | Outer card border |
| `--wp-panel-bg` | Inner panel / section background |
| `--wp-surface` | Raised surface (KPI tiles, inset cards) |
| `--wp-border-soft` | Hairline dividers |
| `--wp-border-med` | Stronger dividers, tab borders |
| `--wp-text-primary` | Body text, headings |
| `--wp-text-secondary` | De-emphasised text, sublabels |
| `--wp-text-tertiary` | Disabled / muted text |
| `--wp-kpi-bg` | KPI tile background |
| `--wp-track-bg` | Progress / slider track |
| `--wp-tab-border` | Tab strip underline |
| `--wp-contact-bg` | Contact-row strip |
| `--wp-org-bg` | Org affiliation strip |
| `--wp-body-bg` | Outer page-style background behind the shell |
| `--wp-hdr-glow1` | Header decorative gradient (warm) |
| `--wp-hdr-glow2` | Header decorative gradient (cool) |
| `--wp-insight-bg` | AI insight callout background |

### 2.2 Accent layer (set by `applyTheme()` from `@api accentColor`)

| Token | Derivation |
|---|---|
| `--wp-accent` | The sanitised hex (or `#b08a4a` bronze default) |
| `--wp-accent-bg` | `${accent}14` — 8-char hex alpha-strip, ~8% opacity |
| `--wp-accent-border` | `${accent}40` — ~25% opacity |
| `--wp-accent-dim` | `${accent}99` — ~60% opacity |
| `--wp-warning` | From `@api warningColor` (semantic) |
| `--wp-negative` | From `@api negativeColor` (semantic) |

### 2.3 Component-specific extensions (adapter pattern)

Cockpit adds three cockpit-only tokens in `cockpitThemes.js` derived per-theme from a luminance check:

| Token | Used by |
|---|---|
| `--wp-progress-good` | Filled-goal gradient terminal colour |
| `--wp-progress-blue` | Opportunity probability bar |
| `--wp-rail-pending` | Greyed-step circle stroke |

Your component picks its own extension tokens — same naming convention (`--wp-*`).

---

## 3. Lifecycle canon

This is the wiring every themed LWC in the family follows. Reproduce it exactly — drift here causes the FOUC, double-paint, and "first load is wrong theme" bugs that bit earlier components.

```js
// State
_isConnected = false;
_animationPending = false;
_lastAppliedThemeKey = null;

connectedCallback()    { this._isConnected = true; this.scheduleApplyTheme(); }
disconnectedCallback() { this._isConnected = false; }

renderedCallback() {
    if (!this._isConnected) return;
    if (this._animationPending) return;
    this._animationPending = true;
    // Family pattern: defer one frame so .lwc-shell exists before we touch its style.
    // Don't replace this with setTimeout — the legacy timeout race re-bit several DC_*_LWC components.
    requestAnimationFrame(() => {
        this._animationPending = false;
        this.applyTheme();
    });
}

scheduleApplyTheme() {
    // Microtask coalesce: multiple property setters in one tick → one apply.
    this._themeScheduleToken = (this._themeScheduleToken || 0) + 1;
    const token = this._themeScheduleToken;
    Promise.resolve().then(() => {
        if (token !== this._themeScheduleToken) return;
        this.applyTheme();
    });
}

applyTheme() {
    const host  = this.template?.host;
    const shell = this.template?.querySelector('.lwc-shell');
    const targets = [];
    if (host?.style)  targets.push(host);
    if (shell?.style && shell !== host) targets.push(shell);
    if (!targets.length) return;

    const mode     = (this._themeMode || 'default').toLowerCase();
    const accent   = this.sanitizeHex(this.accentColor);
    const warning  = this.sanitizeHex(this.warningColor);
    const negative = this.sanitizeHex(this.negativeColor);

    // Cache key prevents re-writing identical styles on every render.
    const key = [mode, accent || '', warning || '', negative || '', String(targets.length)].join('|');
    if (key === this._lastAppliedThemeKey) return;
    this._lastAppliedThemeKey = key;

    const tokens = THEMES[mode] || THEMES.default;
    const accentResolved = accent || '#b08a4a';
    const accentRgb =
        accentResolved.startsWith('#') && (accentResolved.length === 7 || accentResolved.length === 9)
            ? accentResolved.slice(0, 7)  // 8-char hex alpha-strip
            : null;

    targets.forEach((node) => {
        Object.entries(tokens).forEach(([prop, value]) => node.style.setProperty(prop, value));
        node.style.setProperty('--wp-accent', accentResolved);
        if (accentRgb) {
            node.style.setProperty('--wp-accent-bg',     `${accentRgb}14`);
            node.style.setProperty('--wp-accent-border', `${accentRgb}40`);
            node.style.setProperty('--wp-accent-dim',    `${accentRgb}99`);
        }
        if (warning)  node.style.setProperty('--wp-warning',  warning);
        if (negative) node.style.setProperty('--wp-negative', negative);
    });
}

sanitizeHex(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(trimmed) ? trimmed : '';
}
```

### Why each piece exists

| Piece | Reason |
|---|---|
| `_isConnected` guard in `renderedCallback` | LWC re-renders can fire after disconnect during navigation; touching style on a detached node throws. |
| `_animationPending` + RAF | `renderedCallback` fires multiple times per data update. RAF coalesces into one paint. |
| `_lastAppliedThemeKey` | Without the cache, every `@wire` data tick re-applies identical styles → measurable jank on dense pages. |
| Two targets (`host` + `.lwc-shell`) | Some Lightning page templates cache the host's inline style across renders; writing to `.lwc-shell` too is the family workaround. |
| 8-char hex alpha-strip | Lets users pick any `#RRGGBB` for `accentColor` and get derived 14/40/99 alpha variants without adding a colour-math dependency. |

---

## 4. Adapter pattern (recommended for new components)

Don't fork `predictionThemes.js`. Import it and layer your own tokens.

```js
// myWidgetThemes.js
import { THEMES as BASE_THEMES } from 'c/predictionThemes';

const FALLBACK_DEFAULT = {
    '--wp-shell-bg': '#ffffff', '--wp-text-primary': '#1a1a1a',
    '--wp-body-bg':  '#ffffff', '--wp-border-soft':  '#f0f0f0'
    // ...minimum survival kit so the LWC renders if c/predictionThemes is missing
};

function isDarkPalette(palette) {
    const bg = palette['--wp-body-bg'] || palette['--wp-shell-bg'] || '#ffffff';
    if (!bg.startsWith('#') || bg.length < 7) return false;
    const r = parseInt(bg.slice(1, 3), 16);
    const g = parseInt(bg.slice(3, 5), 16);
    const b = parseInt(bg.slice(5, 7), 16);
    if ([r, g, b].some(Number.isNaN)) return false;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 90; // Rec. 709 luminance
}

function deriveExtensionTokens(themeKey, basePalette) {
    const isDark = isDarkPalette(basePalette);
    return {
        '--wp-mywidget-accent': isDark ? '#5a8fd8' : '#2b5fb3'
        // ...your component-specific tokens, derived per-mood
    };
}

const SOURCE = BASE_THEMES && Object.keys(BASE_THEMES).length > 0 ? BASE_THEMES : { default: FALLBACK_DEFAULT };

export const THEMES = Object.fromEntries(
    Object.entries(SOURCE).map(([key, palette]) => [key, { ...palette, ...deriveExtensionTokens(key, palette) }])
);
```

Result: your component automatically gains every new theme added to `c/predictionThemes` upstream.

---

## 5. CSS aliasing

In your `.css`, alias the family `--wp-*` tokens to your component's design names. Lets the file read like the original mock while staying themed:

```css
:host {
    --gold:      var(--wp-accent,         #b08a4a);
    --gold-wash: var(--wp-accent-bg,      #f3ead9);
    --ink:       var(--wp-text-primary,   #1c2433);
    --paper:     var(--wp-body-bg,        #f6f3ec);
    --line:      var(--wp-border-soft,    #e7e1d6);
    /* Always provide a fallback hex on the var() — gives sane render
       if applyTheme() hasn't run yet on first paint. */

    display: block;
    color: var(--ink);
}

.lwc-shell {           /* applyTheme() targets host AND this node */
    background: var(--paper);
    padding: 1rem;
    border-radius: 14px;
}
```

> **Rule:** never put a literal hex inside component selectors. Pick a `--wp-*` token, or extend the contract.

---

## 6. Theme switcher UI + meta.xml

### 6.1 `@api` surface (mirror across components)

```js
@api accentColor       = '';
@api warningColor      = '';
@api negativeColor     = '';
@api showThemeSwitcher = false;

_themeMode = 'default';
@api
get themeMode() { return this._themeMode; }
set themeMode(value) {
    const m = String(value || 'default').toLowerCase();
    this._themeMode = THEMES[m] ? m : 'default';   // unknown → default, never throws
    this.scheduleApplyTheme();
}
```

### 6.2 Optional in-card quick switcher

```js
const QUICK_THEMES = ['obsidian', 'midnight', 'graphite', 'ivory'];

get themeSwitcherButtons() {
    if (!this.showThemeSwitcher) return [];
    return QUICK_THEMES.map((name) => ({
        name,
        label: name.charAt(0).toUpperCase() + name.slice(1),
        class: `theme-btn tb-${name}` + (this._themeMode === name ? ' is-active' : '')
    }));
}

handleThemeButton(event) {
    const next = event.currentTarget?.dataset?.theme;
    if (next && THEMES[next]) {
        this._themeMode = next;
        this.scheduleApplyTheme();
    }
}
```

```html
<template if:true={showThemeSwitcher}>
    <div class="theme-row" role="group" aria-label="Theme switcher">
        <template for:each={themeSwitcherButtons} for:item="btn">
            <button key={btn.name}
                    class={btn.class}
                    data-theme={btn.name}
                    title={btn.label}
                    onclick={handleThemeButton}>{btn.label}</button>
        </template>
    </div>
</template>
```

### 6.3 `.js-meta.xml` properties

Use this exact `datasource` so admins get the same dropdown across all family components:

```xml
<property name="themeMode" type="String" label="Theme" default="default"
    datasource="default,obsidian,midnight,graphite,ivory,dusk,slate,parchment,onyx,fog,forest,ember,sage,copper,verdant,steel,mercury,arctic,indigo,glacier,bordeaux,pewter,walnut,denim,moss,birch,mist,cashew,mineral,blush,chamois,bullion,prussian,coutts,vault,endowment,trust,cobalt,heritage,civic,cardinal,meridian,union"
    description="default = original light card. 42 additional themes aligned with profile/prediction widgets." />
<property name="showThemeSwitcher" type="Boolean" label="Show theme switcher in header" default="false"
    description="Quick theme buttons. Keep false in production." />
<property name="accentColor"   type="String" label="Theme accent (optional)" default=""
    description="Optional #hex accent; bronze default applied when blank." />
<property name="warningColor"  type="String" label="Theme warning override"  default="#d4900a" />
<property name="negativeColor" type="String" label="Theme negative / error tint" default="#c05070" />
```

---

## 7. Starter skeleton

Drop these three files into a new `lwc/myWidget/` bundle and you have a working themed component.

### `myWidget.js`

```js
import { LightningElement, api } from 'lwc';
import { THEMES } from './myWidgetThemes';   // see §4

const HEX_PATTERN = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const QUICK_THEMES = ['obsidian', 'midnight', 'graphite', 'ivory'];

export default class MyWidget extends LightningElement {
    @api accentColor = '';
    @api warningColor = '';
    @api negativeColor = '';
    @api showThemeSwitcher = false;

    _themeMode = 'default';
    @api
    get themeMode() { return this._themeMode; }
    set themeMode(value) {
        const m = String(value || 'default').toLowerCase();
        this._themeMode = THEMES[m] ? m : 'default';
        this.scheduleApplyTheme();
    }

    _isConnected = false;
    _animationPending = false;
    _lastAppliedThemeKey = null;
    _themeScheduleToken = 0;

    connectedCallback()    { this._isConnected = true; this.scheduleApplyTheme(); }
    disconnectedCallback() { this._isConnected = false; }

    renderedCallback() {
        if (!this._isConnected || this._animationPending) return;
        this._animationPending = true;
        requestAnimationFrame(() => {
            this._animationPending = false;
            this.applyTheme();
        });
    }

    get themeSwitcherButtons() {
        if (!this.showThemeSwitcher) return [];
        return QUICK_THEMES.map((name) => ({
            name,
            label: name.charAt(0).toUpperCase() + name.slice(1),
            class: `theme-btn tb-${name}` + (this._themeMode === name ? ' is-active' : '')
        }));
    }

    handleThemeButton(event) {
        const next = event.currentTarget?.dataset?.theme;
        if (next && THEMES[next]) { this._themeMode = next; this.scheduleApplyTheme(); }
    }

    scheduleApplyTheme() {
        this._themeScheduleToken += 1;
        const token = this._themeScheduleToken;
        Promise.resolve().then(() => {
            if (token !== this._themeScheduleToken) return;
            this.applyTheme();
        });
    }

    applyTheme() {
        const host  = this.template?.host;
        const shell = this.template?.querySelector('.lwc-shell');
        const targets = [];
        if (host?.style)  targets.push(host);
        if (shell?.style && shell !== host) targets.push(shell);
        if (!targets.length) return;

        const mode     = (this._themeMode || 'default').toLowerCase();
        const accent   = this.sanitizeHex(this.accentColor);
        const warning  = this.sanitizeHex(this.warningColor);
        const negative = this.sanitizeHex(this.negativeColor);

        const key = [mode, accent || '', warning || '', negative || '', String(targets.length)].join('|');
        if (key === this._lastAppliedThemeKey) return;
        this._lastAppliedThemeKey = key;

        const tokens = THEMES[mode] || THEMES.default;
        const accentResolved = accent || '#b08a4a';
        const accentRgb =
            accentResolved.startsWith('#') && (accentResolved.length === 7 || accentResolved.length === 9)
                ? accentResolved.slice(0, 7)
                : null;

        targets.forEach((node) => {
            Object.entries(tokens).forEach(([prop, value]) => node.style.setProperty(prop, value));
            node.style.setProperty('--wp-accent', accentResolved);
            if (accentRgb) {
                node.style.setProperty('--wp-accent-bg',     `${accentRgb}14`);
                node.style.setProperty('--wp-accent-border', `${accentRgb}40`);
                node.style.setProperty('--wp-accent-dim',    `${accentRgb}99`);
            }
            if (warning)  node.style.setProperty('--wp-warning',  warning);
            if (negative) node.style.setProperty('--wp-negative', negative);
        });
    }

    sanitizeHex(value) {
        if (typeof value !== 'string') return '';
        const trimmed = value.trim();
        return HEX_PATTERN.test(trimmed) ? trimmed : '';
    }
}
```

### `myWidget.html`

```html
<template>
    <article class="lwc-shell">
        <template if:true={showThemeSwitcher}>
            <div class="theme-row" role="group" aria-label="Theme switcher">
                <template for:each={themeSwitcherButtons} for:item="btn">
                    <button key={btn.name} class={btn.class} data-theme={btn.name}
                            title={btn.label} onclick={handleThemeButton}>{btn.label}</button>
                </template>
            </div>
        </template>
        <!-- your content -->
    </article>
</template>
```

### `myWidget.css`

```css
:host {
    --ink:    var(--wp-text-primary, #1c2433);
    --paper:  var(--wp-body-bg,      #f6f3ec);
    --card:   var(--wp-shell-bg,     #ffffff);
    --line:   var(--wp-border-soft,  #e7e1d6);
    --accent: var(--wp-accent,       #b08a4a);

    display: block;
    color: var(--ink);
}

.lwc-shell {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 1rem;
}
```

---

## 8. Reference implementations

When in doubt, read these — they're current and follow this contract exactly.

| Component | What to look at |
|---|---|
| [`fscJourneyCockpit`](../DC_Goals_Cockpit_lwc/force-app/main/default/lwc/fscJourneyCockpit/) | Adapter pattern (`cockpitThemes.js`), full lifecycle, alias-style CSS, switcher UI. **Newest, copy from this.** |
| [`classificationModelLwc`](../DC_Prediction_Model_LWC/force-app/main/default/lwc/classificationModelLwc/) | Inline `predictionThemes.js`, full meta.xml `datasource` enumeration. |
| [`customerProfileWidget`](../DC_PersonProfileWidget/force-app/main/default/lwc/customerProfileWidget/) | Originator of the contract; THEMES inline in main `.js`. |

---

## 9. GitHub Pages

If this repo publishes from `/docs`, the catalog PDF lives at `…/assets/widget_theme_catalog.pdf` and the palette poster at `…/assets/output/pdf/widget_theme_palette_poster.pdf` (relative to your Pages site root).
