# Wealth: restore approved Growth and Intelligence designs

The previous gap-closure pass preserved capabilities but replaced visual scenes the user explicitly wanted to keep. It also renamed Growth to Capital & acquisition, making the section appear removed. This correction restores those approved visual compositions and keeps all newer work.

## Restored designs

- Navigation is **Capital & Acquisition**, per the latest user preference. Its default **Capital paths** view combines the institution → household → advisory conversation graph with the former Capital paths controls: household search/select, product select, independent coverage/outcome counts, outside-cohort Rising/Falling lenses, recommendation rank and expected-value evidence, guarded Opportunity proposals and follow-ups, product tiles and the monthly history scrubber.
- **Intelligence** defaults to **Household observatory**, with the original three visual lenses: concentric plan-success orbits, proportional single-stock concentration sculpture and a two-stage liquidity transition.
- Current dated source records supply probabilities, amounts, dates, institutions, plans, holdings and transactions. Old hardcoded planning values and employer names are not promoted to current evidence. The career source currently has no qualifying rows; the retained transition design uses the actual observed refund/inflow instead.
- A household select replaces the old horizontal customer ribbon. Each household/product keeps its exact source IDs through evidence and proposal actions. Plan selection drives the exact source-bound Review Horizon.

## Newer work retained

Capital & Acquisition exposes the combined **Capital paths**, **White-space heat map**, **Held-away opportunities** and **Acquisition**, including Leads/introductions, Business owners and Wealth upgrade prospects.

Intelligence still exposes **Relationship signals**, **Plan health**, **Concentration**, **Liquidity & net flows** and **Trading pulse** as book-level analytical views beside the restored household observatory.

Pipeline, Plans & Goals, Review Horizon, Workbench, Commercial and Retail scenes, all administrative shell functions and production integration plumbing remain in place.

## Validation

`tests/wealth-retained-scenes.browser.cjs` screenshots all four restored scenes at 1512/1024/768/390. It verifies the capital graph/default, retained newer modes, selected household/product, actual score history, reload, exact follow-up draft and exact plan-review navigation. The dedicated `wealth-capital-hybrid.browser.cjs` verifies search/empty state, native mover lenses, exact proposals, ownership guards and selection persistence. The former `capitalView=coverage` route remains compatible with the original controls for existing links. Existing Wealth source journeys navigate explicitly to that route/Relationship signals when exercising those retained views; their source/date/zero assertions are unchanged.

Standalone captured-data demo only. Browser-local proposals remain distinct from live Salesforce writes.
