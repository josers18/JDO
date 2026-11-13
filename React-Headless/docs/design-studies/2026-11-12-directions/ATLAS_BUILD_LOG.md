# Atlas Wealth and Commercial build log

November 13, 2026. Branch: `design/retail-atlas-gap-closure`.

## Scope and responsibilities

Retail implementation is on hold. Two persona workers own their respective Wealth/Commercial capture, selector, presentation, test and contract files. The coordinator owns shared dispatch, asset registration, cross-persona validation and commits/pushes. All authored actions remain local proposals; production bundles, Apex and release are outside this build.

## Shared foundation checkpoint

- Added optional Atlas-only Wealth/Commercial facade dispatch for pages, relationship panels, exact-account evidence, source-record lookup, forms and draft preparation/editing.
- Shared generic forms can be delegated through `openBaseForm` without recursive persona dispatch. Local save and edit both invoke the active persona’s provenance sanitizer.
- Source Event update/delete proposals are excluded from the new personas’ local meeting planner.
- Existing Retail behavior passes all 52 selector tests and five browser suites: context, priorities, business, customer and watch. Preview server responds HTTP 200 on port 5187.
- New persona factories are optional until their modules are registered. This checkpoint alone adds no Wealth/Commercial UI.

## Decisions

- Ruling: use two independent persona implementers as explicitly requested, with shared integration and a final fresh review coordinated centrally. Each implementer works through its own plan. This overrides the inline-only executor default; the cost is additional coordination, covered by scoped file ownership and integration tests.
- Ruling: retain the authorized existing design branch rather than create another parallel branch. This preserves the milestone history requested by the user; production migration stays separate.

## Pending

Wealth/Commercial source checkpoints, feature builds, browser journeys, final review, migration-readiness contracts and commit/push verification. Production acceptance remains pending.
