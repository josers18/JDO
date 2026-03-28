# Component reference — DC AgentForce Output

All properties are configured in **Lightning App Builder** when you select **DC AgentForce Output** (`dcAgentforceOutputLwc`). Defaults match `dcAgentforceOutputLwc.js-meta.xml` unless noted.

---

## Record page

| Property | Type | Default | Meaning |
|----------|------|---------|---------|
| **Card title** | String | `Generative output` | Heading next to the header icon. |
| **Header icon name** | String | `utility:agent_astro` | SLDS icon in `namespace:name` form (e.g. `utility:einstein`). Invalid values fall back to `utility:agent_astro`. |
| **Title color (hex)** | String | `#032d60` | Title color: `#RGB`, `#RRGGBB`, or `#RRGGBBAA` (no spaces). Applied via CSS variable on the card shell. |
| **Autolaunched Flow API name** | String | `DC_Agentforce_Output_Prompt` | API name of an **active** autolaunched flow. |
| **Flow input: record variable** | String | `recordID` | Name of the Flow **Record (single)** input. **Case-sensitive.** Must match the flow. Object type must match the Lightning page object. |
| **Flow output: response variable** | String | `promptResponse` | **Text** output variable containing the body to show. |
| **Flow output: generation Id variable** | String | *(empty)* | Optional **Text** output with Models API **generation Id** for thumbs feedback. |
| **Pass record to flow** | Boolean | `true` | When true, loads the current record and passes an **SObject** shell (`SELECT Id FROM …`) into the Record variable. |
| **Auto-run flow on load** | Boolean | `false` | Runs once when the page loads. |
| **Output height** | String | `medium` | `auto`, `compact`, `medium`, or `tall` (scroll region for the output panel). |
| **Output format** | String | `auto` | `auto`, `text`, `html`, or `markdown` — see README / FLOW guide. |

**Record page objects:** Metadata currently lists **Account**. Add `<object>` entries in `targetConfig` for `lightning__RecordPage` and redeploy to use other primary objects.

---

## App page & home page

Same properties as above except:

| Property | Default | Notes |
|----------|---------|--------|
| **Pass record to flow** | `false` | Usually no `recordId` on these targets unless the host passes context. |

---

## Platform-injected (not in designer)

| Property | When set |
|----------|----------|
| `recordId` | Record pages (and contexts that supply it). |

---

## Behaviors not exposed as properties

| Behavior | Notes |
|----------|--------|
| **Copy** | Uses Clipboard API, hidden textarea + `execCommand`, then copy modal. |
| **Expand** | Opens `dcAgentforceOutputModal`. |
| **Print** | Hidden iframe `print()` first; blob URL window fallback. |
| **Markdown** | Loads `marked` from static resource `marked`. |
| **Sanitized HTML** | `lightning-formatted-rich-text` strips unsafe markup. |

---

## See also

- [FLOW_GUIDE.md](FLOW_GUIDE.md) — how to name Flow variables
- [UI_LAYOUT.md](UI_LAYOUT.md) — where properties appear visually
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — property-related errors
