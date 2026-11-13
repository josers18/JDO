# Retail workflow hierarchy and expressive life events

The user wants the earlier year/month grid calendar restored alongside a compressed moment counter; more distinctive milestone/goal design; a customer finder that works for a large book; recognized visitor interest in Intelligence; and leads/referrals treated as a primary retail business-development workflow.

Keep the Atlas palette/system type and the current pipeline/health changes. Life & goals combines a compact summary with a year grid (event families × months, real-day markers), richer milestone story cards and illustrated funding cards. On narrow screens the year grid becomes quarterly panels without horizontal scrolling. The relationship landscape remains, with an optional finder-first mode: text search, source-backed cohort filters, A–Z jumps and a vertically scrollable match list rather than dozens of pages. Use captured IDs and no invented 300-customer records.

Growth gets three primary workspaces: Leads & referrals (default), Customer opportunities (existing needs explorer, history and probability grid), and Life-stage opportunities. Leads are a selectable pipeline/inbox with source details and review/contact/follow-up actions, not a sidebar. Today highlights lead follow-up beside pipeline. Intelligence's recognized-visitor lens becomes the complete source-backed multi-customer browsing workspace. Growth links there instead of duplicating the gallery.

Data is the existing real captured records. Any new Lead fields come from an explicit read-only capture. No synthetic contact details, assignments, outcomes, confidence or appointment dates. Calendar illustrations indicate event categories; they are not actual photos, property depictions or model conclusions. Recommendations remain authored conversation prompts, not AI output.


## Implemented hierarchy

- **Life & goals:** the compact Moments counter sits beside an annual event-family × month grid. Real source day markers select customer stories. Narrow screens show one selectable quarter without sideways scrolling. The cards use event-specific line illustrations, a date badge, customer identity, authored conversation starters and source actions. Goal cards have matching visual themes, recorded status, funding rings/amounts, a funding path and target dates.
- **Relationships:** the original visual landscape remains. Customer finder mode removes the diagram when the RM wants to search directly. Both modes offer broad identity search, service/goal/milestone filters, an initial filter, recently opened relationships and direct record opening. All matching source records are in a vertically scrollable list; there are no eight-record pages. Finder mode and recent records persist in the browser session. The mock still contains only its captured records; full-book server-backed search remains a production integration task.
- **Today:** the primary lead/referral desk is now beside pipeline. Service/task follow-ups move into the next row. Selecting a prospect opens the full Growth lead context.
- **Growth:** Leads & referrals is the default full workspace. Source filters separate actual Web, Employee Referral and Existing Customer values; status/name/company/contact filtering and selected-prospect review/follow-up/email draft actions are available. Customer opportunities retains the needs explorer, history and probability heat map. Life-stage opportunities is a separate primary lens. No recognized-browsing gallery remains buried below these sections.
- **Intelligence:** Recognized visitors is now the complete six-customer browsing workspace, with product/customer filters, actual source page-load counts, per-product evidence and exact-Account follow-up. Existing property and service lenses remain accessible. Growth links explicitly to this view and resets the Intelligence lens to recognized visitors.

## Source and action integrity

A fresh read-only GraphQL query returned the seven existing captured Lead IDs with names, companies, statuses, source, optional contact fields, creation/activity dates and revenue. `hasNextPage=false`; Cumulus org ID was verified. Two records have Employee Referral source, four Web and one Existing Customer. These are selected Lead records, not an assertion that the whole book has seven leads. Empty source contact fields show no email/phone recorded; nothing was invented to fill them.

Lead follow-up drafts carry the actual Lead ID as `whoId`, rather than inventing an Account relationship. The final-action review recognizes an exact Lead/Contact link independently of Account ID. CRM writes and sends remain unimplemented in this mock. Source record review uses the richer captured Lead fields; no records were updated.

## Verification

Checked nine Retail workspace/view combinations at 1512px, 1024px, 768px and 390px (36 layouts), with no document overflow or JavaScript errors. Journeys covered finder search/initial/no-match/direct open, the restored annual/quarter calendar, source event review and goal cards, referral-source filtering and Lead-linked task drafts, preserved opportunity explorer/heat map and life-stage lens, recognized-visitor search and exact-Account follow-up, and Today-to-referral continuity.

Additional checks verified that the pipeline and primary lead desk remain in Today’s first desktop working area, Lead IDs survive into final-action review without a false missing-Account warning, the property lens remains reachable, Growth-to-Intelligence always opens recognized visitors, and mock workflows make no browser network writes. Evidence: `output/playwright/retail-workflows/`.
