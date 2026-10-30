# UI layout — DC Query to Table

## Regions

```text
┌─────────────────────────────────────────────────────────┐
│  article.dcqt-shell (card: border, radius, padding)      │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Optional header (.dcqt-shell__header)                │ │
│  │  [icon] Card title          [Run query] [spinner]    │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ .dcqt-shell__body                                    │ │
│  │  • Error message (if any)                            │ │
│  │  • .dcqt-shell__table → lightning-datatable          │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Header visibility

| Configuration | What renders |
|---------------|----------------|
| **Show title** on, **Auto-run** on, not loading | Icon + title; no button. |
| **Show title** on, **Auto-run** off | Icon + title + **Run query**. |
| **Show title** off, **Auto-run** on, not loading | **No header row** — compact top padding so the table sits higher. |
| **Show title** off, **Auto-run** off | Header with **Run query** only (compact `--no-title` header styles). |
| Loading | Spinner in header when header row is shown. |

Title text color uses CSS variable **`--dcqt-title-color`** set inline from **Title color (hex)**.

## Table container

`.dcqt-shell__table` has a **max-height** and scrolls vertically only; it never scrolls sideways.

- **Columns fit** (each at least **Minimum column width**): a `lightning-datatable`, sized to a whole-pixel width so fixed column mode can't overflow by a fraction of a pixel.
- **Columns don't fit**: each row renders as a stacked card (`.dcqt-stack__row`) of wrapping label: value pairs. Empty values show `—`, booleans `Yes`/`No`.

The layout switches again when the card width changes (window resize).

## Platform component

The grid is **`lightning-datatable`** (SLDS **data table** patterns). Column headers, sort affordances, and row styling follow platform defaults; arbitrary header background colors are not exposed by the platform component.
