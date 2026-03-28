# UI layout

Visual structure of **DC AgentForce Output** (`dcAgentforceOutputLwc`) for admins and implementers.

---

## Card shell

The root is an `<article class="lwc-shell">` with SLDS-style borders and padding.

| Region | Content |
|--------|---------|
| **Header row** | **Header icon** (left) + **Card title** (from **Card title** property). Title color from **Title color (hex)** via `--dc-output-title-color`. |
| **Toolbar** | **Run** button (when not auto-run-only path), **Copy**, **Expand**, **Print**, **thumbs up/down** (when feedback enabled). |
| **Output panel** | Scrollable region; height from **Output height** (`auto` / `compact` / `medium` / `tall`). |
| **Footer** | Optional hint text when thumbs are disabled (no generation Id). |

---

## Output panel

- **Plain text** — Simple text node / pre-wrapped content depending on mode.
- **Rich text** — `lightning-formatted-rich-text` for HTML and rendered Markdown (sanitized).

Loading state shows a spinner in the output area.

---

## Modals

| Modal | Purpose |
|-------|---------|
| **dcAgentforceOutputModal** | Full-screen-style expand; includes its own **Copy** fallback for nested clipboard issues. |
| **dcAgentforceCopyModal** | Small dialog with selectable text when programmatic copy fails. |

---

## Spacing and density

Toolbar uses compact icon buttons with `slds-button_icon` patterns. Output area uses internal padding consistent with SLDS cards.

---

## Customization (today)

- **Card title**, **Header icon name**, **Title color** — App Builder only.
- Deeper theming would require forking the LWC CSS.

---

## See also

- [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) — property list
- [README.md](../README.md) — feature overview
