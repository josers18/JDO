# DC Carousel LWC

## What is it?

**DC Carousel** is a Lightning Web Component that shows **one piece of content at a time** in a **horizontal carousel** (previous / next, optional dots and autoplay), following [SLDS carousel](https://www.lightningdesignsystem.com/2e1ef8501/p/99642e-carousel) interaction patterns. The main idea is to **group several existing components in one place**—for example your **Prediction Model**, **Multiclass Prediction**, and **DC Query to Table** cards—**without using tabs**. You add **DC Carousel** to the page, then **nest other components inside it** in Lightning App Builder when your page template supports that. If nesting is not available, you can still configure **Fallback slides (JSON)** with HTML content for simple slides.

<div align="center">

[![Salesforce DX](https://img.shields.io/badge/Salesforce-DX-00A1E0?style=for-the-badge&logo=salesforce&logoColor=white)](https://developer.salesforce.com/developer-centers/salesforce-dx)
[![LWC](https://img.shields.io/badge/Lightning-Web_Components-0176D3?style=for-the-badge)](https://developer.salesforce.com/docs/component-library/overview/components)
[![Metadata API](https://img.shields.io/badge/API-v66.0-032D60?style=for-the-badge)](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_intro.htm)

[![SF CLI](https://img.shields.io/badge/SF_CLI-v2-111111?style=for-the-badge&logo=gnu-bash&logoColor=white)](https://developer.salesforce.com/tools/salesforcecli)
[![Monorepo](https://img.shields.io/badge/Monorepo-JDO-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/josers18/JDO)

<br/>

**SLDS-style carousel** · **Composable slot** · **JSON fallback**

</div>

---

## Documentation map

| Document | Purpose |
|----------|---------|
| [artifacts.md](artifacts.md) | Metadata inventory |
| [docs/COMPOSITION.md](docs/COMPOSITION.md) | Nesting components in App Builder vs JSON fallback |

---

## Deploy

```bash
cd JDO/DC_Carousel_LWC
sf project deploy start --source-dir force-app --target-org <alias>
```

Deploy **this project** and any LWCs you want **inside** the carousel (for example from **DC_Prediction_Model_LWC**) to the **same org**.

---

## App Builder behavior

- **Nested components (preferred):** Open the carousel on the canvas and **drag other components into it**. Each root child becomes **one slide**. Arrow keys move between slides when focus is inside the carousel region.
- **Fallback slides:** If nothing is nested, set **Fallback slides (JSON)** to an array like `[{"title":"Overview","content":"<p>Hello</p>"}]`. `content` is passed to `lightning-formatted-rich-text` (HTML supported per platform rules).
- **Autoplay** applies only when **composition mode** (nested LWCs) is active and there are at least two slides.

---

## Limits (important)

- **Nesting** custom components inside another custom component depends on **Lightning App Builder** and **page template** support in your org. If you do not see a drop target inside **DC Carousel**, use **JSON fallback** or place related components as **siblings** and ask your admin about supported layouts.
- **Autoplay** is off by default; when on, it pauses while the user hovers or focuses inside the card.

---

## References

- [SLDS: Carousel](https://www.lightningdesignsystem.com/2e1ef8501/p/99642e-carousel)
- [LWC composition](https://developer.salesforce.com/docs/component-library/documentation/en/lwc/lwc.create_components_compose_intro)
