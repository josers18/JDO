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

`.dcqt-shell__table` wraps `lightning-datatable` with **max-height** and **overflow auto** so wide/tall result sets scroll inside the card.

## Platform component

The grid is **`lightning-datatable`** (SLDS **data table** patterns). Column headers, sort affordances, and row styling follow platform defaults; arbitrary header background colors are not exposed by the platform component.
