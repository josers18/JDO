# Workbench collections: tasks, meetings, cases, and drafts

The user wants the Workbench's four supporting views to match the richer persona-specific main workspaces. Replace the auxiliary lists and empty meeting message with visual working surfaces for Atlas/Panorama. Retain existing actions, captured records, and per-persona isolation.

| Collection | Retail | Wealth | Commercial |
|---|---|---|---|
| Tasks | Backlog/date trail with selectable commitments and local next-step planning | Household-grouped commitments with focused preparation | Business-execution board grouped by actual task subject, with local planning moves |
| Meetings | Week/day appointment planner with proposed time slots | Month-based household review planner and source review-date context | Company/deal discussion planner with agenda preparation |
| Cases | Priority-based service triage and response workspace | Household service context grouped by request topic | Company service map and selected-request follow-through |
| Drafts | Customer-action review shelf | Review-packet library | Commercial action outbox |

Meeting events were empty in the original capture. Do not invent booked appointments. Let the user select a planning date/time, prepare a real existing meeting-form draft, and show those saved local meeting drafts with explicit draft labeling. Dates from financial plans remain provider review dates, not booked events.

Task planning and draft review state are local metadata, distinct from recorded Task/Case status. Draft previews support local edits and Working/Review/Ready state; Ready is not approval, sending, or CRM publication. Positive empty states offer useful actions without fake example rows. Charts/counts use the bounded capture or the user's actual local drafts.

Use the existing Atlas/Panorama color and type system. Each persona keeps its own composition and context. Provide labeled controls, keyboard alternatives to any drag gesture, readable scrolling on narrow screens, source dates, and exact record links. Test all twelve collection/persona views in both styles, local draft editing/persistence, proposed meetings, selected-record context, and the existing workbench journeys.

## Implementation and visual choices

The existing Atlas palette (iris #5548AD, ink #2C2C52, mist #E9E7F8, white #FFFFFF) and Panorama cobalt #234BE8 remain the shell. System sans carries 24–30px working headings, 17–18px content, and 15–16px metadata. Calendar captions use smaller supporting text. Priority color supplements explicit labels. The dated trail, calendar, service portfolio, and paper preview encode their actual work; each collection avoids using a table as its main composition.

The Commercial task board groups captured subjects into Cards & credit, Payments enablement, and Treasury conversations. Local preparation stage remains an editable attribute on each selected task. This spreads the source work across meaningful workstreams without implying recorded status changes. Meetings have native date/time controls and previous/next period buttons. Wealth has a month grid; Retail and Commercial have week grids, with Commercial company selection. Draft libraries show actual saved content with an actionable empty state before anything has been saved.

Keyboard-accessible buttons and native inputs cover selection, preparation, calendar navigation, and edits. No drag gesture is required. Checklists and notes save immediately in session storage. Draft content/readiness uses the existing draft store; case response notes carry into the email form as internal notes.

## Verification

Verified all twelve persona/collection views in Atlas and Panorama at 1512px, 768px, and 390px (72 layout checks), with no document overflow or JavaScript errors. Exercised all three personas through exact task selection, local next-step planning, note persistence after reload, follow-up draft creation, title/notes editing, preparation readiness, selected meeting date/time prefill, calendar draft display, meeting draft rescheduling, service response forms, and draft isolation. Keyboard selection, focus retention on local planning changes, and focus restoration after draft editing were checked separately.

The earlier persona-workspace regression also passed: 54 layouts plus ten existing Growth/Intelligence/Workbench journeys. Screenshots and collection results are under `output/playwright/workbench-collections/`; earlier-flow results are under `output/playwright/persona-workspaces/`. These checks validate the standalone prototype; no production bundle or Salesforce write was involved.
