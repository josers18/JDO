# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences carry equal weight, and every surface has to work for both:

- **Bankers doing their day.** A retail banker (ReactRetail), a wealth advisor (ReactWealth), and a commercial relationship manager (ReactCommercial) at Cumulus Financial Services. Each opens their cockpit to see their own book: who to call, what's at risk, what moved overnight, and what to do next. They act on it without leaving the app. The cockpit has to hold up as a believable daily working tool, not a staged screen.
- **Demo audiences.** Bank prospects and executives watching the app driven live, usually on a shared screen. They need to understand quickly what they're looking at and why it couldn't be built on a standard Lightning home page or a generic BI dashboard.

The named book owners in the org are Justin Chen and Sarah Smith (~10.5K person accounts each) and Allen Carter and Jose Sifontes (~5K business accounts each). Every number is scoped to the signed-in user's book.

## Product Purpose

A three-persona banking cockpit suite (Retail, Wealth, Commercial) built as full custom React apps that run natively on Salesforce. Each cockpit turns the banker's book into a prioritized morning: AI brief, priority queue, recommended actions, KPI vitals, alerts, and a customer-360 drill-in. Each insight becomes a one-click CRM action.

Success: a banker could really run their day from it, and a demo audience leaves convinced the four claims under Positioning are true. They saw them happen live, not described on slides.

## Positioning

The cockpits prove four things together, and none of them may be faked:

1. **Zero-copy data, live.** Snowflake/Databricks data reaches the banker's flow through Data Cloud (`BT_*` DMOs via the `DcBridgeRest` Apex bridge) with no ETL. Every figure on screen is a real query result.
2. **AI into action.** Agentforce and Einstein briefs, next-best actions and AI chips become real CRM writes (tasks, meetings, emails, cases, goals, leads, life events) through `CrmWriteRest`.
3. **React on the platform.** The full custom React UX ships as a native Salesforce app (UI Bundle → `CustomApplication`, served at the App Domain). It runs inside the platform's security, identity and data access, and nothing is hosted outside it.
4. **Persona-specific craft.** Three distinct cockpits, each tuned to its role's day, built on one shared system (`_shared`) but never one generic dashboard reskinned three times.

## Operating Context

- Org: Cumulus Financial Services (`jdo-oe0sdd`, Enterprise Edition, API 67.0). The apps render at the Salesforce App Domain and are launched from LEX via Visualforce launch-card tabs.
- Data sources: Salesforce core via UI API GraphQL; Data Cloud via `ConnectApi.CdpQuery` (BT_ DMOs are monthly/weekly snapshots, so pin to `MAX(profile_*)`); Plans 14–16 third-party signals (Demandbase intent, Harmonic funding, UserGems job-change and liquidity events) feed the priority queues.
- Data is generated where needed: Snowflake generators (e.g. the daily trade and transaction generators) keep the book alive day to day.
- Each cockpit has a `/config` route where an admin picks the Agentforce model per AI action and sets brand themes (org-shared theme library, active theme per user, display size per user). Demos are often re-skinned per prospect.
- Live Agentforce chat is embedded via `@salesforce/agentforce-conversation-client`.

## Capabilities and Constraints

- **Nothing is mocked. This is binding.** Every value, name, count, date and AI output on every surface comes from real org or Data Cloud data. If a feature needs data that doesn't exist, the job is to source it from existing data or generate it into the org or Snowflake and query it for real, never to hardcode or fake it in the UI. Any remaining mock paths (`mockFn` fallbacks in `dataSource.ts`, composed-summary fallbacks, hardcoded sample content such as static schedule or "arc" items) are defects to be made real, not acceptable states.
- Current state (2026-11-05): all three cockpits run `core`, `dataCloud` and `agentforce` in `real` mode. Mock code paths still exist as fallbacks.
- When a real source is unavailable (e.g. the Models API isn't enabled), the UI shows an honest unavailable/empty state. It never substitutes invented content.
- Bundles can't import each other at runtime; shared code is inlined from `_shared` at build time. `dist/` is what deploys.
- The App Domain CSP blocks external font and CDN hosts, so assets must be self-hosted.
- There is no binding visual identity. The existing Aurora Glass system is the incumbent but can be replaced. Any visual system must survive arbitrary customer brand themes (accent, logo, light/dark) applied from `/config`.

## Brand Commitments

- Fictional bank: **Cumulus Financial Services**. Product surface names in use: "Command Center", "Priority Queue", "Recommended Actions", "Portfolio Pulse", "Daily brief".
- No visual brand commitments; the user explicitly released the current look.

## Evidence on Hand

- Live org data: person and business account books, Opportunities, Cases, Tasks, Events, FinancialGoals, Leads, life events.
- Data Cloud DMOs (see `docs/HOME_PAGE_DATA_OPPORTUNITIES.md` and `dc-inventory-output/`): e.g. `BT_Plaid_Held_Away__dlm` (Sarah Smith's book: 5,710 accounts / $3.21B held away), `BT_Financial_Trades__dlm`, CSAT, and the Plans 14–16 signal DMOs.
- Prior design explorations: `design-1-editorial.png` … `design-4-swiss.png`, `docs/Design Samples/`, `docs/home-redesign/home-command-center*.html`.
- Absent, and not to be fabricated: customer testimonials, real-bank logos or claims, performance benchmarks, or any metric not backed by a query.

## Product Principles

1. **Real or nothing.** If it's on screen, it was queried. Missing data is a data task, not a design shortcut.
2. **Insight ends in action.** Every signal shown should lead to a next step the banker can take in place.
3. **My book, my day.** Scope everything to the signed-in banker and the moment of their day; show their own numbers, not org-wide ones.
4. **Credible to both audiences.** It must work as a daily tool for a banker and land at a glance in a demo. Never trade one for the other.
5. **Three roles, one platform.** Share plumbing and primitives; keep each persona's content and priorities bespoke.
