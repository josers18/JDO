# Cumulus cockpit studies — three distinct working environments

An isolated, disposable exploration of three banker workspaces. This is not the production redesign or an approved implementation specification. No application source, dependencies, Salesforce metadata, or deployed behavior changed. Study 01 established the palettes; Study 02 restored information density; Study 03 makes the persona compositions different and replaces Retail's green wash with a balanced ivory/ink/coral/ochre palette. Prior versions remain in `v1.html` and `v2.html`.

**Binding requirement:** preserve every existing feature and backend integration. See [FUNCTIONALITY_MAP.md](FUNCTIONALITY_MAP.md) for the initial preservation map and production acceptance requirements.

See [LIVE_APP_REVIEW.md](LIVE_APP_REVIEW.md) for the deployed-app section review, source/scope distinctions, and Study 03 design decisions.

## Study 03

- **Retail:** a slim navigation rail and three-part daily workspace: work/commitments, customer needs/moments, and selected customer context. Pipeline and detailed relationship information follow. The palette uses warm ivory, ink blue, coral and ochre, with teal as a minor accent.
- **Wealth:** a horizontal capital ribbon and household review environment, with a household selector, broader advisory dossier, three advisory lenses, and a compact work rail. Headline metrics now use the visibly rendered Wealth-book values from the Nov 12 review: held-away assets, plans at risk, reviews due, and net flow; CRM pipeline remains accessible.
- **Commercial:** an intelligence table with relationship/credit/product lenses, a selected-company context/Intel column, a pipeline execution band and a coverage research strip.
- Shared study data and handlers are reused; layout code is in `persona-layouts.js` and persona styling in `persona-layouts.css`. These are not imported by any deployed React bundle.
- Desktop, tablet and mobile interaction checks passed for the three compositions, including search/empty state, selection, dialogs, notes, record explorers, action previews, persona switching and the new Wealth/Commercial lenses. Screenshots use `*-v3-*.png`.

## Open the studies

Open `index.html` directly in a browser. It loads sibling JavaScript/CSS files and has no build step or external assets. For a local server, run this from the React-Headless root:

```bash
python3 -m http.server 5187 --bind 127.0.0.1
```

Then visit:

- Retail: <http://127.0.0.1:5187/docs/design-studies/2026-11-11-cockpits/index.html?persona=retail>
- Wealth: <http://127.0.0.1:5187/docs/design-studies/2026-11-11-cockpits/index.html?persona=wealth>
- Commercial: <http://127.0.0.1:5187/docs/design-studies/2026-11-11-cockpits/index.html?persona=commercial>

Use the persona switch, relationship search, My day/Grow/Protect views, signal filters, relationship selection, evidence/approach switch, KPI explorers, CRM record dialogs, and preparation dialog. Cmd/Ctrl+K focuses search. Escape closes dialogs. Editable preparation notes persist in this browser tab's session only; no Salesforce records are written. Direct-file browser storage policies can vary; use the HTTP server if session storage is restricted.

Full 360, cross-sell, existing action types, goals, intelligence, and configuration links open explicit placement/contract previews. They do not implement or replace those production features. The in-study capability map makes their required preservation visible.

## Study 02 composition

- Compact heading and context-sensitive briefing replace the large editorial opening.
- Five owner-scoped CRM KPIs show full aggregate totals, independently of bounded row lists.
- A relationship worklist brings saved Data 360 signals together with captured open cases and tasks.
- A pipeline distribution chart and deal table show the scale, stages, amounts, and stale close dates of real opportunities.
- Wealth adds plan-success comparisons and held-away relationships; Commercial adds payment watch and saved model probabilities; Retail connects website intent to open service needs.
- Supporting panels keep service and leads visible. A context rail holds selected-relationship evidence, task commitments, and preparation shortcuts.
- Retail explicitly leads with Gabe's service issues before his lending interest: the read-only capture returned open lost-card and direct-deposit cases for the same customer named in the saved website signal.
- No upcoming events were returned for these owners from Nov 11 onward. Tasks are labeled separately and overdue dates remain visible; no appointments were invented.

## Creative thesis

One calm operating system for relationships, with different working rhythms for each banker. Typography, spacing, evidence, and deliberate selection provide the hierarchy. Decorative glass, competing gradients, and repeated KPI cards give way to a clear working surface.

The first studies intentionally explore a shared list/context interaction and distinct persona art directions. They do **not** yet prove the complete persona-specific information architecture, calendar, book metrics, full 360, growth/health pages, theme editor, dark mode, or real Agentforce experiences. Those require further design and integration.

### Retail — The relationship desk

Evergreen, a warm neutral canvas, direct language, and approachable customer context. The working unit is a person with a need. Website interest becomes a reason to understand the customer's plans, rather than immediately pitch a product.

Next composition to explore: an appointment-oriented day with customer needs between meetings. Retention, service recovery, life events, and deposit opportunities should meet in one worklist. Meeting preparation, an outreach draft, and a follow-up task belong beside the customer rather than behind separate dashboards.

### Wealth — The advisory desk

Parchment, bronze, editorial serif headings, and more breathing room. The working unit is a household and its goals. Relationship tone, plan progress, held-away assets, flows, and concentration are connected without presenting a model score as a decision.

Next composition to explore: a household review workspace with upcoming reviews, asset flows, financial-plan context, and a curated relationship agenda. Separate market-driven movement from actual client flows wherever the data permits. Evidence should support conversations about goals, liquidity, and consolidation.

### Commercial — Relationship command

Ink blue, stronger structure, compact company context, and a deliberately restrained risk palette. The working unit is a company and the people around it. Payment behavior, credit outlook, call sentiment, and a modeled opportunity appear together so the banker can decide the order of engagement.

Next composition to explore: a company table with a persistent company brief, renewal/credit calendar, and commercial pipeline. Champion changes, funding, intent, company intelligence, treasury opportunities, and payment stress should connect to the relevant company and next action. A credit signal must never be presented as proof of a covenant breach.

## Intended day-in-the-life experience

1. **Orient:** What deserves attention in my book, and what commitments do I have today? Book scope, time window, and data freshness should be visible.
2. **Choose:** A single worklist explains the signal, urgency, and relevant relationship context. Avoid showing the same account repeatedly across competing recommendation modules.
3. **Understand:** Selection opens a persistent context workspace; evidence can be expanded to its source and period. The banker can reach the existing full 360 without losing selection.
4. **Prepare:** Agentforce assembles a brief or proposes outreach from available evidence. Show the result as a proposal with editable content and explicit states for preparation, failure, and completion.
5. **Act:** The banker reviews and performs an existing supported CRM action. The worklist updates after confirmed success through the existing refresh mechanism.
6. **Close the loop:** Track actual completed actions and attributable outcomes where queryable. Do not claim time saved, revenue generated, or agent execution without evidence.

The role of Data 360 is to connect evidence and calculate meaningful business context. The role of agentic assistance is to reduce preparation and follow-through effort. Product surfaces should communicate those benefits through behavior rather than pervasive platform badges.

## Data provenance

### Study 02 CRM capture

After the user reauthenticated Headless360, read-only SOQL verified Cumulus Financial Services (`00Dam00000Uo32qEAB`) and captured data on Nov 12, 2026. `crm-snapshot.js` contains only selected CRM data; no credentials, OAuth links, tokens, or session material. It is static snapshot input, not an authenticated browser client.

| Persona | Captured owner | Query scope |
|---|---|---|
| Retail | Kim Johnson | Pipeline/tasks/leads by record owner; cases by account owner |
| Wealth | Jose Sifontes | Same ownership rules; sandbox pipeline includes large Innovation Pipeline opportunities, shown without inventing replacements |
| Commercial | Allen Carter | Same ownership rules |

Pipeline metrics aggregate every open stage returned by the query. Task and case totals come from independent counts. Lead totals come from independent per-owner counts. Pipeline tables are the largest 6 per owner, tasks the oldest 6, and cases the oldest 5. Lead rows come from the latest 30 across the three owners, then are partitioned by owner; that sample is **not** a complete per-owner list. Event queries returned zero upcoming records. CRM case counts do not include ServiceNow; production must retain its existing combined logic.

The capture was for design content only and does not change the production data-access rule: Salesforce core uses the existing GraphQL client and external data uses the existing Data Cloud/Apex client.

### Saved Data 360 fixtures

Data 360 examples are transcribed from the repository's documented real-row test fixtures. They are historical selected examples, **not live queries, complete books, current totals, or real-time signals**. Their dates differ from the newer CRM capture and remain labeled. The first study used fixtures only; Study 02 adds the read-only CRM capture above.

| Study | Source under `force-app/main/default/uiBundles/` | Scope |
|---|---|---|
| Retail | `ReactRetail/src/home/webEngagement.test.ts` | Gabe X Hoskins in Kim Johnson's book, captured Nov 10, 2026. Five views: three HELOAN, two Auto Loan. |
| Wealth | `ReactWealth/src/home/wealthWhoToCall.test.ts` | Real W9 rows for Jose Sifontes' book, captured Nov 11, 2026. Graham/Robles plan and sentiment signals, Julie E Morris concentration and plan, David H Chen held-away assets. |
| Commercial | `ReactCommercial/src/home/commercialWhoToCall.test.ts` | Real C10 rows for Allen Carter's book, captured Nov 11, 2026. Cameron-Olson Construction, Burgess Supply, Schroeder Contractors, Kennedy Ltd Enterprises. |

Wealth plan/held-away panels and Commercial payment/model panels show selected examples, not aggregate book metrics. Conversion probability is neither offer approval nor suitability. Suggested approaches and preparation text are authored design copy, clearly labeled; they are not generated AI output.

## Production constraints to preserve

- Keep the existing React 19/Vite/UI Bundle platform, authenticated GraphQL/Apex clients, CRM actions, basename handling, book scoping, theme settings, and Agentforce embedding contract.
- Create persona-specific compositions over shared primitives and data plumbing; the full redesign should go further than these first studies' shared layout.
- Support arbitrary customer brands and a legible light/dark system. The study's serif Wealth headings are a proposed departure from the incumbent typography, not a silent production change.
- Use system/self-hosted assets that work under App Domain CSP.
- Preserve honest loading, unavailable, error, empty, stale-data, and action-completion states.
- No synthetic metrics, static appointment schedules presented as real, generated proof claims, or mock fallback content in production.
- Keyboard, focus, reduced motion, contrast, and narrow-screen handling are part of the design.

## Review performed

Study 02 browser checks passed for all three personas at desktop (1512×1100), tablet widths (1024/768), and mobile (390×844): five metrics, Grow view, search/empty state, relationship selection, preparation dialogs, editable notes/session persistence, Escape dismissal, KPI explorers, CRM record details, capability map, and existing-action contract previews. Persona switching and study notes passed. No document-level horizontal overflow at the checked widths and no page JavaScript errors were recorded. Tables scroll within their regions on narrow screens. Screenshots are in `output/playwright/cockpit-studies/*-v2-*.png`.

The checks validate these study interactions; they do not validate production integrations, full accessibility, theme compatibility, or banker usability. The study uses no new dependencies. The existing React/Apex suites were not run because those applications were not changed.
