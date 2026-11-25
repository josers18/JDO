# Persona-specific Growth, Intelligence, and Workbench

The user wants continued creative work on the three sections that still feel like text in boxes, and emphasizes independent persona experiences. This pass replaces the shared compositions in those sections with nine independently composed views. Atlas and Panorama provide their visual shell; Focus retains the earlier composition.

| Persona | Growth | Intelligence | Workbench |
|---|---|---|---|
| Retail | Customer needs explorer: select a captured product opportunity, inspect its history, and plan the customer conversation | Customer signal desk: browsing intent, selected property/homeowner evidence, and service context have distinct visual lenses | Service/outreach desk: choose a case or captured task, prepare the response, and retain a local follow-through draft |
| Wealth | Capital paths: select a household and connect available outside-asset evidence to eligible advisory/product conversations | Advisory observatory: compare modeled plan success, inspect concentration, and review liquidity evidence without conflating their meanings | Household review studio: select review context, curate actual evidence, assemble a review packet, and prepare follow-up |
| Commercial | Treasury coverage: choose a company/product relationship, compare eligible product probabilities and expected values, and prepare a deal | Company intelligence: connect a company to independent credit, call, outlook, intent, or funding sources | Deal room: select a real opportunity, inspect its recorded economics/stage/date, build a local preparation checklist, and draft the next step |

## Visual and interaction principles

Keep the current Atlas lavender/iris and Panorama cobalt/white system, native type, readable body sizes, and source notes. Use open diagrams, selectable plots, evidence views, inline preparation, timelines, and working surfaces in different compositions. Selection must visibly change the associated content. Do not add charts merely to decorate a screen or silently treat model probability as approval, outside assets as transferable capital, service history as a risk score, or local planning as a CRM change.

Three persona entry points dispatch to separate render functions. Share only visual helpers and the existing record/action handlers. Persona selections, preparation checklists, and local workspace state are keyed by persona. Reuse existing read-only captures and real-row signal fixtures; no new fabricated metrics, appointments, or AI replies. Existing source-backed cross-sell grid, mover filters, leads, and record forms remain reachable through the new workspaces.

## Verification

Check all nine compositions in Atlas/Panorama at desktop/tablet/mobile widths, record their distinct identities, and exercise each persona's main selection-to-action flow. Verify source record links, persona isolation, draft persistence, keyboard controls, and the existing forms/dossier/visual journeys after integration. All work remains in the standalone design-study directory.

### Implemented behavior

- Retail Growth groups captured eligible offers into borrowing, saving, everyday banking, and investing. Selecting a category/product changes the customer, probability, expected value, score history, and existing opportunity action.
- Wealth Growth selects a household and product along an outside-assets → household → advisory-conversation diagram. David's saved Schwab balance remains distinct from modeled opportunity value. Julie has no captured outside balance and is labeled accordingly. The monthly scrubber updates the captured score without replacing the input during a drag.
- Commercial Growth selects among four captured companies and their eligible treasury/financing products. Operating, liquidity, and financing capabilities remain separate. No model row is fabricated for an empty capability family.
- Retail Intelligence has separate browsing, property, and service scenes; property is Kyle's real captured record, not a map. Service actions open the service desk or exact case records.
- Wealth Intelligence uses independent plan-success arcs, a proportional MSFT/other-holdings view, and a source-backed employer-transition scene. Plan success, holding weight, and liquidity evidence never become a combined invented score.
- Commercial Intelligence selects a company and opens its individual call, credit, outlook, model, intent, or funding source. PAYDEX, days beyond terms, ratings, intent, and funding values retain their native meanings.
- Retail Workbench follows a selected source case/task through Understand, Prepare, and Follow through; local preparation does not alter recorded status.
- Wealth Workbench retains the chosen household across review tabs, curates goals/milestones and evidence, previews a packet, and keeps a preparation draft. David's missing provider plan is not shown as zero modeled success.
- Commercial Workbench selects a captured opportunity, shows its company/product/stage/date context, and attaches local checklist/notes/drafts to that exact record.

### Supplementary source capture

The original Commercial offer sample covered Cameron-Olson only. A read-only Data Cloud query added 23 eligible offers for the existing Burgess, Schroeder, and Kennedy account IDs, and 84 monthly history rows for 12 selected account/code pairs. The responses were complete below their explicit 60- and 100-row limits. `workspace-dc.js` now has 52 eligible-offer and 182 history rows. The existing owner and persona product-code filters still apply; these are selected examples, not book counts.

### Browser results

All 18 style/persona/section combinations passed at 1512px, 768px, and 390px (54 layout checks), with no horizontal overflow or JavaScript errors. Tested needs selection, keyboard monthly scrubbing, household/offer context, leads, treasury next step, all intelligence lenses, provider drilldown, all three workbench preparation flows, household continuity, packet previews, persisted checklist/notes, and cross-persona isolation. The existing 72-section desktop and 24-section mobile checks and standard navigation/forms/notes/pins/assistant checks also passed. Dossier and eight action-form regressions were rerun. Screenshots and results are under `output/playwright/persona-workspaces/`.
