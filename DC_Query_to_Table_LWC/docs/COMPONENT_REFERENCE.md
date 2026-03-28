# Component reference — DC Query to Table

**Component:** `c/dcQueryToTableLwc`  
**App Builder label:** DC Query to Table  

Properties are set in **Lightning App Builder** only (no runtime configuration panel on the page).

Record pages use the same properties as app/home; record target additionally restricts **objects** in metadata (default **Account** — extend `js-meta.xml` for more).

---

## Header and chrome

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| **Card title** | String | `Data Cloud SQL` | Heading next to the icon (hidden when **Show title** is off). |
| **Header icon name** | String | `utility:table` | SLDS icon `namespace:name` (e.g. `utility:graph`, `standard:account`). Invalid values fall back to `utility:table`. |
| **Title color (hex)** | String | `#032d60` | CSS color for title text: `#RGB`, `#RRGGBB`, or `#RRGGBBAA`. |
| **Show title (icon and heading)** | Boolean | `true` | When `false`, hides icon and title; shell uses compact padding; header row omitted entirely when **Auto-run** is on and not loading (no empty spacer). |
| **Show table configuration (legacy)** | Boolean | `true` | **Unused at runtime.** Kept for existing pages that still store the property. |

---

## Query execution

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| **Data Cloud SQL query** | String | (sample SELECT) | ANSI SQL executed in the org’s Data Cloud context. Not shown on the page. |
| **Auto-run query on page load** | Boolean | `true` | When `false`, shows a **Run query** button in the header instead of running immediately. |
| **Max rows (auto LIMIT)** | Integer | `500` | If the statement has no `LIMIT`, Apex appends `LIMIT n` (clamped to **2000**). |

---

## Table (`lightning-datatable`)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| **Wrap text in columns** | Boolean | `false` | Sets `wrapText` on generated column definitions. |
| **Default column width (px)** | Integer | (empty) | Optional initial width for every column. |
| **Show selection checkboxes** | Boolean | `false` | Row selection column (off by default for read-only Data Cloud results). |
| **Show row numbers** | Boolean | `false` | Row index column. |
| **Column widths mode** | String | `auto` | `auto` or `fixed` (platform datatable). |
| **Minimum column width (px)** | Integer | `120` | Floor for column sizing when resize is enabled. |
| **Disable column resize** | Boolean | `false` | Disables user column resize. |
| **Wrap table header** | Boolean | `false` | Maps to `wrap-table-header` on `lightning-datatable`. |
| **Wrap text max lines** | Integer | `3` | Max lines when wrapping is active. |
| **Suppress bottom bar** | Boolean | `false` | Hides footer bar when supported. |
| **Enable column sorting** | Boolean | `true` | `sortable` columns; **client-side** sort on loaded rows only (`onsort`). |

---

## Targets

- `lightning__AppPage`
- `lightning__HomePage`
- `lightning__RecordPage` (with `<objects>` in metadata)

---

## See also

- [lightning-datatable documentation](https://developer.salesforce.com/docs/component-library/bundle/lightning-datatable/documentation)
- [UI_LAYOUT.md](UI_LAYOUT.md) for visual structure
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) if the grid is empty
