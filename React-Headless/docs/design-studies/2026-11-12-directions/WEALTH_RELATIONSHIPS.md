# Wealth relationship landscape and finder

Uses Retail's useful explore/find/inspect/compare pattern, composed for Wealth planning, outside capital, financial accounts, CRM goals and advisory preparation. Adds a six-household landscape with a selected-household brief, all-73-record searchable vertical finder, source-based lenses, sorting, recent households and up to three exact-record comparisons. The landscape initially mixes useful planning/capital/service contexts, rather than showing only the highest-risk plan rows.

Map spokes indicate membership in the advisor's captured book. They are not family edges; position/distance do not encode financial values. Plan probabilities are modeled source outcomes. Financial-account balances are not summed as AUM. Missing source rows and zeros within a bounded sample remain distinct from book-wide facts.

Selection drives the same native household 360, folio and exact follow-up actions. Known review-feed rows can open their exact Review Horizon. Finder mode removes the landscape when direct lookup is the job. There is no horizontal customer strip or multi-page directory. On narrow screens the map becomes a readable two-column selection board and selecting a household brings its inspector into view.

`tests/wealth-relationships.browser.cjs` exercises eight responsive scenes, node containment, all 73 records, search/no-match, exact 360/Back, source-bound review navigation, comparison, sorting, follow-up and phone selection. Screenshots/report: `output/playwright/wealth-relationships/`.

The full customer tabs and previously approved Growth/Intelligence/Pipeline/Life/Review/Workbench designs remain available. The new directory does not pretend every captured customer has Julie/Anika's deep-source coverage. Remaining gaps are documented in [WEALTH_REMAINING_GAPS.md](WEALTH_REMAINING_GAPS.md).
