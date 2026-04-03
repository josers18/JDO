# Setup guide — Customer Profile Widget

Follow these steps after deploying `force-app` to your org.

## 1. Prerequisites

- Salesforce org with **Lightning Experience**.
- **Account** and/or **Contact** record pages where you want the card (or App/Home for summary-only placement).
- If you use **Insight summary**: **Einstein Generative AI** and a **Prompt template** with a text input whose API name matches the component (default `Input:Prediction_Context`).
- If you use **Flow**: **autolaunched** Flows that accept the record Id. **Assembly** Flow exposes **output variables** mapped in App Builder; **prediction** Flow outputs prediction text and recommendations (JSON string or serializable collection).

## 2. Permission sets

The project includes permission sets under `force-app/main/default/permissionsets/`:

| API name | Purpose |
|----------|---------|
| **Customer_Profile_Widget_User** | **Apex class access** to `CustomerProfileWidgetController` (required for every org). |
| **Customer_Profile_Widget_DC_Callout** | External Credential principal access for optional **Named Credential** metadata shipped in the repo (`DataCloud` / **D360**). **Not required** for the widget’s current Apex path (SOQL + Flow only). |

Assign **Customer_Profile_Widget_User** to users who load the widget.

**CLI assign (example):**

```bash
sf org assign permset --name Customer_Profile_Widget_User --target-org <alias> --on-behalf-of user@company.com
```

## 3. Add the component to a Lightning page

1. Open **Lightning App Builder** for an **Account** or **Contact** record page (or App/Home).
2. Drag **Customer Profile Widget** onto the region.
3. Configure properties (see [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md)).

### Record page

The platform injects **`recordId`**. No manual binding is required.

### App / Home

There is no automatic record Id. Supply **`recordId`** via a wrapper or host context if you need profile data. App/Home target configs expose **data source** and **card label** properties; theme properties use **JavaScript defaults** unless you extend the bundle.

## 4. Optional profile assembly Flow

1. Create an **autolaunched** Flow with an input for the current record (e.g. `recordId`).
2. Use **Assignments** (and Get Records, subflows, etc.) to set **output variables** for each field you want on the card.
3. In the component, set **Profile assembly flow API name** and **Profile output map (JSON object)** with at least one logical key → output variable name.
4. SOQL still **fills gaps** for any slot the Flow leaves blank.

## 5. Optional prediction Flow

1. Create an **autolaunched** Flow with input `recordId` (or match **Flow input: record Id variable** in App Builder).
2. Output **prediction** (text) and **recommendations** (Text with JSON array, or serializable collection).
3. Set **Autolaunched flow API name (predictions)** and output variable names in App Builder.

If the prediction Flow **API name** equals the **assembly** Flow API name, Apex runs **one** interview.

Flow failures for predictions are **swallowed** in Apex so the rest of the profile still renders; check debug logs if Insight looks empty.

## 6. Optional Einstein prompt template

See [PROMPT_TEMPLATE.md](PROMPT_TEMPLATE.md). Set **Prompt template Id or API name** and ensure **Auto-generate AI summary** is on (default in meta).

## 7. Smoke test checklist

- [ ] Open an Account with known CRM fields → Overview shows Name, billing/standard fields from SOQL.
- [ ] With assembly Flow + output map → mapped values appear; blanks still filled from CRM where configured.
- [ ] Insight tab: prediction appears after prediction Flow; summary appears after template is configured.
- [ ] Theming: change accent hex in App Builder → header/accents update after refresh.

---

**Next:** [ARCHITECTURE.md](ARCHITECTURE.md) · [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
