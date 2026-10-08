---
name: AFD360 Utilities
description: A live Agentforce and Data 360 API test bench, built to be shown on a customer's screen.
colors:
  ground: "#F3F4F6"
  surface: "#FFFFFF"
  line: "#E0E3E8"
  ink: "#111827"
  ink-2: "#3D4554"
  ink-3: "#555E6D"
  side: "#14213D"
  side-2: "#1E2E52"
  side-ink: "#EEF1F7"
  side-ink-2: "#AEB9CF"
  side-line: "#2B3C63"
  rail: "#0D172C"
  rail-ink: "#93A1BC"
  rail-on: "#1E2E52"
  sent: "#E6ECF5"
  sent-line: "#C8D4E6"
  sent-ink: "#1A3360"
  sent-chip: "#D4DFEF"
  recv: "#F7F0DC"
  recv-line: "#E6D6A8"
  recv-ink: "#5F4A0F"
  ok: "#2F7D5B"
  live: "#E2C15A"
  err: "#B23A33"
  action: "#C9A227"
  action-ink: "#1A1405"
typography:
  page-title:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
  session-title:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.25
  message:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.625
  body:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
  mono:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  sm: "6px"
  chip: "8px"
  md: "10px"
  lg: "12px"
  card: "16px"
  composer: "18px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-action:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 14px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  button-stop:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  card-sent:
    backgroundColor: "{colors.sent}"
    textColor: "{colors.sent-ink}"
    rounded: "{rounded.card}"
    padding: "14px 18px 16px"
  card-received:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "14px 18px 16px"
  chip-sent:
    backgroundColor: "{colors.sent-chip}"
    textColor: "{colors.sent-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  chip-received:
    backgroundColor: "{colors.recv}"
    textColor: "{colors.recv-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  tool-card:
    backgroundColor: "{colors.recv}"
    textColor: "{colors.recv-ink}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  field-change-chip:
    backgroundColor: "{colors.sent}"
    textColor: "{colors.sent-ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.chip}"
    padding: "2px 8px"
  input-composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.message}"
    rounded: "{rounded.composer}"
    padding: "6px 6px 6px 16px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  sidebar:
    backgroundColor: "{colors.side}"
    textColor: "{colors.side-ink}"
    width: "256px"
  sidebar-item-active:
    backgroundColor: "{colors.side-2}"
    textColor: "{colors.side-ink}"
    rounded: "{rounded.lg}"
    padding: "10px 12px"
  rail:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.rail-ink}"
    width: "72px"
  rail-item-active:
    backgroundColor: "{colors.rail-on}"
    textColor: "{colors.side-ink}"
    rounded: "{rounded.lg}"
    width: "52px"
---

# Design System: AFD360 Utilities

## Overview

**Creative North Star: "The Refined Flight Board"**

Every exchange with Salesforce is a strip on a board: a softly rounded, timestamped card that says which way it travelled. What we sent is cool, what came back is warm, and a lane chip (→ Sent / ← Received) names the direction so an audience on a screen-share can follow without narration. The canvas is a quiet tinted ground with white surfaces; the session list lives in a dark-tinted sidebar beside a darker module rail, so navigation and content never blur together.

The system is a token set, not a palette. Seventeen runtime themes (eight Finance, nine Color; two dark) each fill the same 29 tokens, applied as CSS custom properties on `:root` before first render and persisted in `localStorage` (`afd360.theme`). Navy & Gold is the default and is the set recorded in the frontmatter. Components only ever reference token roles (`sent`, `recv-line`, `action`), so a new surface is themed for free if it does the same.

Density is operator-grade but legible at projector distance: 12px is the floor for any text, timestamps and IDs are monospaced and tabular, and state (live, running, failed, pending approval) is always shown with a dot, chip or icon rather than implied.

**Key Characteristics:**
- Sent = cool `sent` family, Received = warm `recv` family, everywhere: chat cards, tool cards, Wire panel sides, HXL tones.
- Dark rail (module nav + theme picker at its foot), dark-tinted session sidebar, light canvas.
- Softly rounded cards (16px) on a tinted ground with low ambient shadows.
- Archivo for the UI voice; JetBrains Mono only for IDs, timestamps, durations, URLs and payloads.
- One gold-family `action` color for the primary decision on a surface.

## Colors

Two directional tint families on neutral ground, with one action color; all values come from the active theme (Navy & Gold shown).

### Primary
- **Ledger Gold** (action): the primary action on a surface: New chat, Send, Approve, Save. Paired with **Ink-on-Gold** (action-ink). Also drives the focus outline, caret, text selection (30% mix) and checkbox accent.

### Secondary
- **Outbound Steel Blue** (sent, sent-line, sent-ink, sent-chip): anything we sent to Salesforce. The user's message card, the Sent chip, the Wire panel request side, field-change chips on approvals, the Live status chip, and the HXL `info` / `discovery` tones.

### Tertiary
- **Inbound Parchment** (recv, recv-line, recv-ink): anything Salesforce sent back or did. The Received chip, tool cards and their spine, the Wire panel response side, the agent avatar tile, the approval count chip, and the HXL `warning` / `caution` tones.

### Neutral
- **Tinted Ground** (ground): the app canvas and Wire panel backdrop.
- **Card White** (surface): cards, panels, popovers, inputs. Received cards sit on surface with a `line` border, so warmth comes from the chip and tool cards, not the whole card.
- **Hairline** (line): every 1px border and divider.
- **Ink / Ink-2 / Ink-3** (ink, ink-2, ink-3): primary text, secondary text, and muted metadata/placeholder. Ink-3 is the lightest text tone permitted.
- **Navy Sidebar** (side, side-2, side-ink, side-ink-2, side-line): session sidebar; side-2 is the raised fill for the org select and the active conversation.
- **Midnight Rail** (rail, rail-ink, rail-on): module rail; rail-on fills the active item. `rail-on-ink` falls back to side-ink, and light-sidebar themes set it explicitly.
- **Derived** (no theme entry): `tint` = ground 60% into surface (hover fills, header strips, segmented controls); `console` = rail 92% into black with `console-ink` = white 86% into rail (SQL, payload and code blocks).

### Status
- **ok** (success checks, connected), **live** (the live-session dot in the sidebar), **err** (errors, failed steps, Rejected). Status fills use low-alpha mixes (`err/10`, `ok/12`) with the full color only on the icon or text.

### Named Rules
**The Two Lanes Rule.** Direction is always encoded by the sent/recv families and nothing else. Any new surface showing traffic to or from Salesforce uses `sent*` for outbound and `recv*` for inbound, with the same arrows and words.

**The Token-Only Rule.** Components never hard-code a color. They reference a token role, so all 17 themes (including Midnight and Obsidian, the dark ones) keep working. A new theme must fill every token in the order `themes.ts` declares.

**The One Gold Rule.** `action` marks the single primary decision in a region. Secondary actions are surface buttons with a hairline border.

## Typography

**Display Font:** Archivo Variable (with system-ui, sans-serif)
**Body Font:** Archivo Variable
**Label/Mono Font:** JetBrains Mono Variable (with ui-monospace, monospace)

**Character:** Archivo is a sturdy grotesque that holds up on a projector; JetBrains Mono marks machine truth (what the API literally returned). Both are self-hosted via `@fontsource-variable` (imported in `main.tsx`), and `body` sets `font-variant-numeric: tabular-nums` globally.

### Hierarchy
- **Page title** (600, 1.5rem, tracking -0.025em): module landing headings ("Pick an agent", "Orgs"). Tool titles in MCP step down to 1.25rem, dialog titles to 1.125rem.
- **Session title** (600, 17px, 1.25): the agent name in the session bar.
- **Message** (400, 15px, 1.625): message text and agent markdown; user messages are 500. Prose uses `@tailwindcss/typography`, remapped onto the ink and line tokens, with inline code on a tint pill (6px radius).
- **Body** (400 to 600, 0.875rem): controls, list rows, tool-card titles, approval rows.
- **Label** (600, 0.75rem, sentence case): chips, list group headings ("Today", "Earlier"), Wire side labels.
- **Mono** (400 to 600, 0.75rem): timestamps (24-hour `HH:MM:SS`), durations, session and agent IDs, URLs, HTTP status, action types, JSON and SQL.

### Named Rules
**The Machine Voice Rule.** Mono is reserved for values the platform produced or will parse: IDs, timestamps, durations, URLs, payloads, field-change values. Human words beside them ("2 turns", "idle 3m") switch back to sans even inside a mono run.

**The 12px Floor Rule.** No text below 0.75rem (12px), anywhere. Icons can be 11 to 13px; text cannot.

## Layout

A fixed horizontal shell that follows the window from about 900px to 2560px with no horizontal scroll:

- **Rail** 72px, holding the AF mark, module buttons (icon over label, 52px wide) and the theme picker pinned to the foot with `mt-auto`. New API modules are added as rail buttons.
- **Session sidebar** 256px, widening to 288px at `xl` and 320px at `2xl`: org select, New chat, then conversations grouped Today / Earlier.
- **Main canvas** `min-w-0 flex-1`: a floating session bar card (16px inset, 24px at `lg`), then the thread centered at max 72rem with 14px between cards, then the composer pinned to the same 72rem column. Landing pages (gallery, Orgs) center at max 88rem with 24px to 40px padding.
- **Right panel** (Wire in Chat, inspector in MCP), separated by a single `line` border and collapsible from the session bar. In MCP the panel hides below `lg`.
- **Card asymmetry:** sent cards are inset 8% from the left and received cards 4% from the right, so lanes read at a glance without bubbles.

Spacing follows Tailwind's 4px grid. 8px and 12px gaps dominate inside components, 16px is the standard card and section inset, and 24px is the outer page gutter. Wrapping rows (`flex-wrap`) with `min-w-0` text children are how narrow widths are absorbed.

## Elevation & Depth

Hybrid: depth is mostly tonal (rail darker than sidebar, sidebar darker than ground, ground darker than surface), with two soft, cool-neutral ambient shadows on top. No glows, no colored shadows, no hard offsets.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 1px 2px rgb(15 23 36 / 0.05), 0 6px 20px rgb(15 23 36 / 0.06)`): message cards, the session bar, the composer, primary action buttons, the open Wire row.
- **Lift** (`box-shadow: 0 2px 6px rgb(15 23 36 / 0.08), 0 16px 40px rgb(15 23 36 / 0.14)`): popovers and dialogs (theme picker, org editor) and the Wire row highlighted by hovering its chat turn.

### Named Rules
**The Resting Flat Rule.** Nested containers (tool cards, approval cards, details, Wire rows at rest) carry a border and no shadow. Shadow belongs to the outermost card or to something floating above the page.

## Shapes

A soft-rounded system where radius steps down with nesting: top-level cards are 16px, the composer 18px, nested cards, buttons and inputs 12px, segmented controls and the Wire sides 10px, small buttons and field chips 8px, inline code and swatches 6px or less. Chips, status badges, live dots and step markers are full pills. Borders are always 1px in `line` (or the lane's `*-line`); the only side borders are the 1px panel separators.

The signature form is the **spine**: a 2px rounded `recv-line` rule running behind a column of 20px circular step markers. Running steps are an outlined ink ring with a pulsing dot, done steps are `ok` fills with a check, and failed steps are `err` fills with a cross.

## Components

### Buttons
- **Shape:** gently rounded (12px).
- **Primary (action):** gold fill with action-ink, semibold 0.875rem, Card shadow; hover raises brightness to 105%; disabled drops to 50% opacity and loses its shadow.
- **Secondary:** surface fill, 1px line border, ink text, medium weight; hover fills with `tint`. Session-bar buttons (End session, New session, Wire) use this with a leading 13 to 14px Lucide icon.
- **Stop:** ink fill with surface text, shown in place of Send while streaming.
- **Icon / ghost:** 8px radius, ink-3 icon, hover tint plus ink.
- **Focus:** global 2px outline mixing action 70% into ink, 2px offset.

### Chips
- **Lane chips:** pills with a 12px arrow icon. Sent uses the sent-chip fill with sent-ink; Received uses the recv fill, a recv-line border and recv-ink.
- **Status:** the Live chip uses sent-chip with an `ok` dot, while other states use tint and ink-2. Approval outcomes use `ok/12` or `err/10` fills.
- **Field change:** 8px-radius sent chip, mono, rendered as `Label → value` with the value in semibold.
- **Segmented filter:** tint track (10px, 3px padding), with ink fill and surface text on the active segment.

### Cards / Containers
- **Message cards:** 16px radius, 14/18/16px padding, Card shadow. Sent cards use a sent fill with a sent-line border; received cards use surface with a line border. The header row has the lane chip, then the sender in semibold, then the mono timestamp on the right (plus duration on received cards, or "streaming…" while drafting).
- **Session bar:** a floating 16px card with a recv avatar tile, the session title, a status chip and a mono metadata line.
- **Tool card:** a recv tint with a recv-line border and 12px radius. It holds a 28px icon tile on a 70% surface wash, and `×N` and result-count pills. Consecutive identical steps collapse into one card. A delegation renders its first step as the title and the rest as a checklist on the spine.
- **Wire row:** 12px surface card on a 3-column grid (mono time, label with status pill, then status and duration on the right). Expanded, it shows a sent-tinted request side and a recv-tinted response side, with copy-as-curl.
- **Code / console:** the console fill with console-ink in mono for SQL, raw action output and payloads.

### Inputs / Fields
- **Composer:** surface, 18px radius, line border, Card shadow; `focus-within` shifts the border to ink-3 rather than drawing an outline. The 15px textarea grows to 160px, Enter sends and Shift+Enter adds a newline.
- **Form fields:** 12px radius, line border, focus border ink-3. IDs and secrets fields render in mono. Placeholders use ink-3, and the caret uses `action`.
- **Sidebar select:** side-2 fill, side-line border, semibold side-ink.

### Navigation
- **Rail:** each item is a Lucide icon (20px, stroke 1.7) over a 0.75rem medium label in rail-ink. Hover gives a 60% rail-on fill. Active gives a solid rail-on fill with `aria-current="page"`. The AF mark is a 36px gold tile.
- **Theme picker:** a popover from the foot of the rail (Lift, 16px radius, 288px wide), grouped Finance / Color. Each row previews the theme as a mini board: a side stripe, sent and received bars on ground, and an action stripe. A "dark" tag marks dark themes, and the selected row gets a tint fill and a check. Escape or an outside click closes it.
- **Conversation list:** 12px rows with a status dot (`live` fill; expired as a hollow ring; ended in side-line), a two-line clamped title, an agent and turn count, and a mono time that swaps for a delete control on hover.

### Approval Card
The house rule that nothing changes in the org without consent, as a component. It is a nested 12px surface card. The tint header strip has a ShieldCheck icon, "Approve changes", a recv count chip ("3 pending") and Select all. Rows show the record's object-color dot, the object label, the record link or "New X", the mono action type, and field-change chips, with a checkbox per row while pending. The tint footer states **"Nothing is changed until you approve."** beside Reject (secondary) and "Approve all (N)" / "Approve selected (N)" (action). After a decision the header shows an outcome badge, and rows that weren't approved dim to 45%.

### HXL Cards (widget theming bridge)
Salesforce HXL widgets render in a sandboxed frame, but they wear the app's theme:
- **Bridge:** `widgetHostStyles()` in `web/src/themes.ts` maps the active theme onto the MCP Apps host-style variables the HXL runtime reads from `hostContext.styles.variables`. The values are literal colors (or `color-mix`) because the widget runs in its own document. Background primary, secondary and tertiary map to surface, tint and ground. Text maps to ink, ink-2 and ink-3. Borders map to line. The ring and the primary solid map to action and action-ink. The tones map like this: `info` and `discovery` go to the sent family, `warning` and `caution` to the recv family, and `success` and `danger` to ok and err mixed 14% into surface, with 40% borders. Radii are 6, 10, 14 and 16px, and the shadows are the Card and Lift values above.
- **Fonts:** the host passes `--font-sans` and `--font-mono` as Archivo Variable and JetBrains Mono Variable. `server/sandbox.ts` injects `@font-face` rules and serves the two woff2 files from its own origin under `font-src 'self'`.
- **Frame:** chat HXL cards render frameless, inheriting the received card, with a raw "Action output" details block below. MCP widgets get a 12px line-bordered surface frame unless the widget declares `prefersBorder: false`.
- **Composition** (`salesforce/.../uiWidgets/afd360{Lead,Account,Opportunity,Task}Card`): a column with an md gap, built from:
  1. An avatar header: a large rounded avatar, then an h3 semibold name over a muted caption subtitle.
  2. Stats where the record has them, as caption labels over h4 semibold values.
  3. Info and warning badges, shown only when the record is found.
  4. A separator.
  5. A two-column detail grid of muted caption labels over medium body values.
  6. An action row with a secondary button that sends a chat message (`action/sendMessage`) and an "Open in Salesforce" link.

  New record cards follow the same order.

## Do's and Don'ts

### Do:
- **Do** reference token roles (`bg-sent`, `border-recv-line`, `text-ink-3`) and never literal colors, so every one of the 17 themes renders correctly.
- **Do** mark direction with the sent/recv families plus an arrow and a word (→ Sent / ← Received, "Sent to Salesforce" / "From Salesforce").
- **Do** set IDs, timestamps (24-hour), durations, URLs and payloads in JetBrains Mono at 0.75rem, and everything else in Archivo.
- **Do** keep text at 12px or larger and body text at ink-3 or darker.
- **Do** use the Card shadow for outermost cards and Lift only for floating layers.
- **Do** step radius down as containers nest (16, then 12, then 10, then 8px).
- **Do** pass any new embedded surface the active theme the way `widgetHostStyles()` does for HXL.

### Don't:
- **Don't** use glow shadows, colored shadows or hard offset shadows.
- **Don't** add border-left accents wider than 1px. The only side borders are 1px panel separators.
- **Don't** put uppercase or tracked eyebrow labels above headings. Group labels are sentence-case 0.75rem semibold.
- **Don't** fill a whole received card with the recv tint. Warmth sits in the chip, tool cards and response side.
- **Don't** let any width produce horizontal scroll. Wrap rows and give text children `min-w-0`.
- **Don't** load fonts from a CDN. Both families are self-hosted.
