# Wealth Atlas build handoff

November13,2026. Source-backed standalone mock. No production bundle/Apex change, authenticated write or deployment.

[Open Wealth Today](http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html?direction=atlas&persona=wealth&page=today) · [Relationships](http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html?direction=atlas&persona=wealth&page=relationships) · [Capital](http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html?direction=atlas&persona=wealth&page=growth) · [Review horizon](http://127.0.0.1:5187/docs/design-studies/2026-11-12-directions/workspace.html?direction=atlas&persona=wealth&page=health).

Load scripts in order: `wealth-capture-data.js`, `wealth-core.js`, `wealth-atlas.js`; include `wealth-atlas.css`. Root owns shared dispatch, HTML registration, shell and all final code/test fixes/checkpoints. Wealth code/tests transferred to root at the fresh-review gate. Retail is held and other styles retain their existing behavior.

## Evidence and documents

- [Build ledger / rulings / current gate](WEALTH_BUILD_LEDGER.md)
- [Fresh capture scope and exact bounds](WEALTH_CAPTURE_SCOPE.md)
- [W01–W15 re-audit](WEALTH_GAP_ANALYSIS.md#build-re-audit--november132026)
- [Household/product continuity](WEALTH_CONTEXT_MILESTONE.md)
- [Advisor agenda / planning](WEALTH_PLANNING_MILESTONE.md)
- [Capital / exposure / acquisition](WEALTH_CAPITAL_MILESTONE.md)
- [Intelligence / trading](WEALTH_INTELLIGENCE_MILESTONE.md)
- [Folio / execution](WEALTH_EXECUTION_MILESTONE.md)
- [Future migration contract](WEALTH_MIGRATION_CONTRACT.md), [action fields](WEALTH_ACTION_CONTRACT.md), [production acceptance](WEALTH_PRODUCTION_ACCEPTANCE.md), [unstarted production plan](../../superpowers/plans/2026-11-13-wealth-atlas-production-migration.md)

## Reproduce local checks

```sh
node --test docs/design-studies/2026-11-12-directions/tests/wealth-core.test.cjs docs/design-studies/2026-11-12-directions/tests/wealth-source.test.cjs
node docs/design-studies/2026-11-12-directions/tests/wealth-journeys.browser.cjs
```

Browser checks need the existing local preview on127.0.0.1:5187 and configured `PLAYWRIGHT_MODULE`/`CHROMIUM_PATH` when outside normal resolution. Source replay uses TypeScript already installed under ReactRetail. No org connection is used during these tests. Artifacts stay under `output/playwright/wealth-*`.

At child handoff,18 pure tests and the extended browser journey passed their documented scenarios, including1512/1280/1024/768/390px checks with no browser errors/writes/overflow. The coordinator’s final review/action-floor regressions are now green; final checkpoint/push evidence is maintained in ATLAS_BUILD_LOG.md. The re-audit names those concrete items. No production acceptance gate is marked passed from this mock evidence.

The final source supplement preserves the native broader active-asset summary separately from investable Brokerage/Robo opportunities: Anika has $62,417.26 across two distinct institutions; Julie’s matching aggregate has null SUM and zero qualifying rows, shown honestly instead of borrowing or manufacturing a balance. This is a dated two-household capture, not a full-book outside-assets total.
