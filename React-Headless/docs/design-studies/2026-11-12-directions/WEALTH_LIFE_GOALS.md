# Atlas Wealth — life, plans and goals

The previous screen restricted its stories to a single calendar month. The owner-complete source audit returned 31 life events, but all are historical and the newest is September 1, 2026; a November view appeared empty. Provider plans lived only in Review Horizon, while the actual CRM goal capture has four records. This refresh makes those three sources visible together without creating additional events or goals.

## Experience

- Overview starts with compact, separately labeled counts and direct lenses for Life moments, Financial plans and Goal funding.
- A real month grid selects a date in its adjacent agenda. Historical focus is explicit; selecting a month or day never silently hides all-date milestone stories. Current November remains selectable, including its honest empty agenda.
- Calendar space also surfaces the next future provider review date and active CRM goal target, clearly labeled planning checkpoints rather than appointments.
- Three illustrated source moments appear initially. More reveals reach all 31 records, preserving exact record IDs, dates, Contact names and account associations. Category and household/event/goal search have visible reset controls.
- All 73 provider plans are reachable in a compact vertical finder, with Active/Stale/Draft filters and a selected planning diagram. Modeled success, provider goal count/exposure, retirement target, monthly income target, allocation, updated date and next review retain their own meanings. Drafts are visible but have no review-priority action.
- All four actual CRM goals remain visible: active goals first, the completed Estate Planning goal last. Purpose-specific illustrations include giving hands with a heart and a linked legacy tree. Funding uses actual and target amounts; provider model goal counts never become named CRM goals.
- Native exact-record actions remain intact for life-event review/proposals, goal review/proposals and household context. Goal creation still uses the two permitted CRM FinancialPlan records. A provider plan cannot substitute for that record.

## Source contract

`wealth-life-studio.js` exposes `enhanceWealthLifeStudio(api, base)` and overrides only the Wealth Atlas `journey` page. Other facade methods and persona pages delegate unchanged.

Preferred CRM evidence is `wealthLifeData.sources.lifeEvents`, `financialGoals`, and `financialPlans`, validated against the capture org, effective owner and book scope. A successful empty source stays empty; an unavailable source displays its state instead of resurrecting older data. Legacy capture arrays are used only when the entire supplement is absent. Provider planning evidence comes separately from `wealthCustomerEvidence.sources.customer_plans`, with the same explicit unavailable versus successful-empty behavior. Scope/status failures show an unavailable count and panel rather than a false zero.

The current verified owner-complete CRM query has 31 events, 4 goals and 2 FinancialPlans, with totals equal to returned rows and no next page. The provider plan capture contains 73 models (57 Active, 5 Stale, 11 Draft). Those are captured records, not all-book aggregate totals or live refreshes.

View state uses `lifeMode`, `lifeQuery`, `lifeCategory`, `lifeMonth`, `lifeDay`, `lifePlanStatus`, `lifePlan`, and `lifeLimit` URL parameters, so source return context and reload can restore selections. No production or org writes are introduced.

## Verification

Run from the repository root:

```sh
node docs/design-studies/2026-11-12-directions/tests/wealth-life-studio.browser.cjs
```

Passed on the actual integrated local page: source counts; all 31 moments reachable; all 73 provider models selectable; all four goals including completed; month/day agenda isolation; search and reset; Draft exclusion from review actions; exact selected plan restored on reload; native life/goal/creation forms; an exact PersonLifeEvent local update proposal; successful-empty versus unavailable source precedence for CRM and provider plans; 1512/1024/768/390 layouts with zero page overflow, readable checkpoint text widths, and no story/detail overflow. Browser errors and network writes were empty.

Screenshots and result JSON: `output/playwright/wealth-life-studio/`. Desktop and mobile screenshots were visually reviewed; a mobile checkpoint flex collision was fixed and guarded with a readability assertion. Calendar crops make the historical focus and next-plan/goal checkpoints easy to inspect.
