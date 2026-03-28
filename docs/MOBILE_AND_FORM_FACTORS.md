# Mobile and form factors

## Lightning Home pages are desktop-only

Salesforce **Lightning Home** pages support only the **Large** (desktop) form factor. Components on a **Home** tab **do not render** in the **Salesforce mobile app** or in phone-sized Lightning experiences.

**Implication:** If users only open a **Home** page on their phone, they will not see any custom LWCs that live only there—including **Prediction Model**, **Multiclass Prediction**, **AgentForce Output**, and **DC Query to Table**.

**Mitigation:** Surface the same experience on an **App page** or **Record page** (both support **Large** and **Small**), assign that page for mobile users, and add navigation to it.

## App and Record pages

For **App** and **Record** pages, custom LWCs can appear on phone when:

1. The **Lightning page** is **activated** for the app and profiles (and record types) your mobile users use.
2. The **Phone** layout in App Builder actually contains the component (switch preview from Desktop to Phone).
3. **Component visibility** rules do not hide the component on small screens.

## `supportedFormFactors` in LWC metadata

If your bundle’s `js-meta.xml` sets `<supportedFormFactors>` to **only** `Large`, the component will not appear on phone for supported page types. The JDO projects generally **omit** this tag so the component inherits the page type’s supported factors—but **Home** still excludes phone regardless.

## Official reference

- [Configure Your Component for Different Form Factors](https://developer.salesforce.com/docs/platform/lwc/guide/use-config-form-factors.html) (LWC Developer Guide)
