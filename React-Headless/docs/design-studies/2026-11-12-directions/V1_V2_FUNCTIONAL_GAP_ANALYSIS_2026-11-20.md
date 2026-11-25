# V1 to V2 banking workflow comparison

November 20, 2026 · Retail, Wealth and Commercial · Salesforce org `jdo-oe0sdd`

## Implementation status

The November 20 assessment identified eight distinct gaps. The original comparison follows the release summary. The subsequent V2 release added these workflows to the target org.

| App | Priority | Released workflow |
| --- | --- | --- |
| Wealth | High | Review an eligible product from the heat map or household, verify current ownership and eligibility, and submit a linked cross-sell opportunity. The action returns the Salesforce record and refreshes the grid. |
| Wealth | High | Save or submit goals, life events, leads, tasks and meetings from their proposal forms and Workbench. Activity edits, completions and cancellations act on the original record. |
| Wealth | Medium | Today combines due tasks, opportunities, relationship signals and qualifying liquidity events. The dated book briefing supports generation and read-aloud. |
| Retail | High | Review and send an addressed prospect email from Prospecting or its saved Workbench draft. Salesforce rechecks the lead, address, ownership and opt-out status. |
| Retail | Medium | Today supports a generated, spoken book briefing. Customer 360 opens the selected customer's tearsheet builder directly. |
| Commercial | Medium | Company 360 includes the Property tab with CoreLogic evidence and an explicit empty state. |
| All three | Medium | Recommendations support review, edit, submission and retry for tasks, completed calls, cases and emails. |

### Verification

The three V2 builds passed. Across the bundles, 253 frontend tests passed. Two Salesforce test classes passed 78 tests, including book isolation, retry handling and duplicate cross-sell prevention. Authenticated browser checks opened all four action types in each app, inspected Commercial Property, and generated a Retail tearsheet with a selected section present and a deselected section absent. Retail and Wealth both generated a daily brief. Retail reopened a saved prospect draft with its current lead address. Wealth showed eight ranked rows including tasks and opportunities, and carried the selected product value into the opportunity submission form. The inspected agenda had no visible liquidity row. Live checks used read-only agent questions and form previews. Write and email regression tests used isolated test data.

The page-aware Agentforce path now supplies permission-checked record facts, related records and the selected observation. A live answer identified the Seattle Patton Household by its selected account ID. Three accounts in the same book shared that name. A separate Commercial Today question identified the selected household and its displayed credit observation. In the final Patton test, the prefetched Salesforce summary appeared 36 ms after Send and the complete answer arrived in 13.5 seconds. The panel displays the submitted question and elapsed time during the request. The employee-agent action returns a complete reply. Salesforce documents progressive text delivery for the Agent API streaming endpoint. [Agent API session lifecycle](https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api-lifecycle.html)

## Original assessment

Wealth has the largest functional gap. An advisor can identify an eligible product, inspect the evidence and draft a proposal. The native Wealth workflow ends before it creates the opportunity in Salesforce. Retail and Commercial already have an explicit submission step for this workflow.

## Coverage

The authenticated comparison visited 70 routes and tabs under one banker login. The V1 pass opened each primary page and each relationship tab for one real customer per persona. The V2 pass visited every primary route. Some V2 routes were still loading when first inspected. The page and tab assessment from earlier the same day supplies additional evidence for those views. It covers 208 V2 states, including all 28 native relationship tabs. The two totals overlap. [V2 page and tab evidence](./ATLAS_V2_ACCENT_ASSESSMENT_2026-11-20.md)

| Application | V1 primary pages | V1 relationship tabs | V2 primary routes |
| --- | ---: | ---: | --- |
| Retail | 4 | 11 | Today, Relationships, Pipeline, Journey, Growth, Prospecting, Intelligence, Health, Workbench, Configuration |
| Wealth | 2 | 11 | Today, Relationships, Pipeline, Plans & goals, Capital & acquisition, Intelligence, Review horizon, Workbench, Configuration |
| Commercial | 2 | 12 | Today, Companies, Pipeline, Activity & plans, Treasury & origination, Company intelligence, Credit & coverage, Workbench, Configuration |

The comparison traced buttons to their handlers and checked whether the destination reads source records, saves a browser draft, opens a Salesforce record or calls the write bridge. The audit used read-only interactions. It did not create live CRM records, deliver an email or send a chat message.

## Planning priorities by app

Ranks run within each application. Shared findings appear in each affected app so each team can plan independently.

| Application | Rank | Priority | Banker workflow to complete |
| --- | ---: | --- | --- |
| Wealth | 1 | High | Create the linked Salesforce opportunity from the selected eligible household and product. |
| Wealth | 2 | High | Submit planning and follow-up proposals to Salesforce and show the resulting record. |
| Wealth | 3 | Medium | Bring due tasks, opportunities and liquidity signals into the ranked Today queue. |
| Wealth | 4 | Medium | Restore the generated advisory book briefing and read-aloud action. |
| Wealth | 5 | Medium | Standardize recommendation review, execution and retry across entry points. |
| Retail | 1 | High | Send the selected prospect's addressed email from the draft workflow. |
| Retail | 2 | Medium | Restore the generated retail book briefing and read-aloud action. |
| Retail | 3 | Medium | Open the tearsheet builder directly for the selected customer. |
| Retail | 4 | Medium | Standardize recommendation review, execution and retry across entry points. |
| Commercial | 1 | Medium | Restore property evidence on the selected company's 360 page. |
| Commercial | 2 | Medium | Standardize recommendation review, execution and retry across entry points. |

## Open workflow gaps

| Priority | Where | What the banker encounters | Completion criterion |
| --- | --- | --- | --- |
| High | Wealth · Capital & acquisition → White-space heat map | The V1 grid creates an opportunity for the selected client and product. V2 preserves the evidence and saves the proposal in session storage. Workbench has no submission step for it. The generic New opportunity action in Pipeline loses the cell context. | Submit the reviewed proposal once with the selected household, owner, product, value and cross-sell attribution. Show the created record and refresh the grid counters after success. |
| High | Wealth · Plans & goals, Acquisition and Workbench | Goal, life event and follow-up forms on these paths save local proposals. The corresponding V1 creation modals can persist records. Some V2 Today and Pipeline actions already open working CRM modals, so the outcome depends on the entry point. | Show which actions are drafts, allow the banker to review and submit supported record types, and show the resulting CRM record or an actionable error. |
| High | Retail · Prospecting → Email → Workbench | V1 opens the email action with the selected lead's address. V2 captures the recipient and draft body. The banker can edit readiness and save the draft, but cannot send that prospect email from the workflow. | Review the actual recipient and send using the existing email action. Retain the draft on failure and show delivery status on success. |
| Medium | All three · Recommended actions | V1 lets a banker edit, dismiss or approve a prepared recommendation. Approval invokes the appropriate CRM action or opens the addressed email composer. V2 distributes those steps across priority queues, preparation panels and Workbench. Some paths support submission, while others only save a draft. | Trace a task, case, call and email from recommendation through review and execution in each persona. Show the outcome and keep failed actions available for retry. |
| Medium | Retail and Wealth · Today | Retail summarizes source counts and Wealth surfaces ranked outreach and upcoming reviews. V1 also offers a generated book narrative and a listen action. Those two capabilities have no equivalent on either native Today page. Commercial offers a generated brief. | Generate and read aloud a book-scoped briefing, with the evidence date, a usable loading state and a factual fallback. |
| Medium | Wealth · Today priority queue | V1 combines relationship signals with work due and opportunities, and reserves space for qualifying liquidity signals. V2's outreach list starts with the Who-to-Call ranking. The other source views exist, but a banker has to visit them separately. | Include due tasks, open opportunities and eligible liquidity signals in the ranked desk, with links to the respective records and reasons for priority. |
| Medium | Commercial · Company 360 → Property | V1 exposes a dedicated Property tab. The native V2 company detail has no corresponding panel. The book-level branch footprint answers a different question. Evidence availability depends on the selected account. | Open the company's sourced property evidence in native 360, including an explicit unavailable state for a company with no matching record. |
| Medium | Retail · Customer 360 → Tearsheet | V1 exposes a configurable builder and Generate action. The V2 tools handoff opens the original customer workspace. The banker must find the builder again. | Open the builder directly for the selected customer and confirm the chosen sections appear in the generated output. |

The Wealth proposal and Retail email findings follow the actual save and submit handlers. [V1 cross-sell action](../../../force-app/main/default/uiBundles/_shared/src/components/home/CrossSellWhitespaceLive.tsx) · [Wealth capital workflow](../../../force-app/main/default/uiBundles/ReactWealth/src/atlas/WealthCapital.tsx) · [Wealth draft storage](../../../force-app/main/default/uiBundles/ReactWealth/src/atlas/WealthAtlasWorkspace.tsx) · [Wealth proposal forms](../../../force-app/main/default/uiBundles/ReactWealth/src/atlas/WealthProposals.tsx) · [Retail prospect email](../../../force-app/main/default/uiBundles/ReactRetail/src/atlas/retailUi.tsx) · [Retail draft review](../../../force-app/main/default/uiBundles/ReactRetail/src/atlas/retailWorkbench.tsx)

## Relationship and book-level coverage

| V1 workflow | V2 destination and finding |
| --- | --- |
| Overview, Details, Money | All three provide native overview, profile and financial views. Presence of these views establishes navigation coverage. Exact field parity still depends on the source record and permissions. |
| Property, Company Intel | Retail and Wealth expose property evidence within their household views. Commercial has a native Company Intel tab and a book-level intelligence page. Company-level property remains open as listed above. |
| Journey, Engagement, Cases | All three have relationship journey and engagement views, plus book-level activity, planning or service workbenches. Wealth's local proposal paths have the write gap above. |
| Opportunities, Campaigns | Relationship growth and engagement views and the book pipeline retain access to deal and campaign evidence. Wealth grid-to-opportunity submission and Retail prospect email remain open. |
| Notes, Tearsheet | Native notebook and tools sections are present. Wealth offers a configurable local folio with print output. Commercial offers a company report. Generated document contents were not compared field by field. |
| Commercial Portfolio pulse | The Today overview includes Growth-tier mix, Branch exposure and Open service cases. Its pulse tab leads into more detail. Treasury also exposes coverage, offer opportunities and lead introductions. [Commercial comparison](./COMMERCIAL_MAIN_V1_V2_ASSESSMENT_2026-11-20.md) |
| Appearance and navigation | All three V2 apps have Themes, AI models and Display size. V1's stacked/cockpit layout switch is specific to the original experience. Original cockpit routes remain available where a native workflow is incomplete. |

Commercial Workbench reads bounded result sets for some lists and filters the loaded records. A visible total can exceed the rows available to inspect. V1 also bounds some of its home lists, so full-result equivalence remains unverified. Validate against a book exceeding the first page before treating either list as exhaustive.

## Changes shipped with this review

All three V2s use operational headings on the revised pages and a header launcher beside Notifications for the Agentforce side panel. Commercial Today greets the signed-in banker above the hero. Its brief uses the same formatted source amounts as its portfolio metrics, addressing the screenshot's thousand-versus-million discrepancy.

Configuration now refreshes the Salesforce Models API catalog, polls the status of the background check and shows when the org last verified its selections. The org returned 47 supported generation identifiers after the update, versus 17 cached entries before it. The action model picker and the embedded Agentforce conversation client are separate integrations. Temperature and max-token settings remain stored preferences in the existing Apex binding. The shared catalog also serves the original apps.

The published documentation and the supplied quickstart were the references for the model and agent review. [Agentforce developer guide](https://developer.salesforce.com/docs/ai/agentforce/guide/get-started.html) · [Supported model identifiers](https://developer.salesforce.com/docs/ai/agentforce/guide/supported-models.html) · [Einstein generative AI quickstart, local PDF](</Users/jsifontes/Downloads/quickstart_your_einstein_generative_ai_solution_11-20-2026.pdf>)

The current V2 release docks Agentforce beside the page. Each app reserved 418 pixels at a 1,440-pixel desktop viewport. At a 390-by-844 mobile viewport, the drawer occupied the lower half. Each Configuration → Agents picker showed 13 active employee agents and three default selections. The action model and employee-agent selections are independent.

The org's native embedded client opened but did not expose the Salesforce context bridge. The V2 drawer therefore includes the current page, section, viewed book and selected record in each page-aware employee-agent request and reuses the returned Salesforce session ID. The native interactive client can still be opened separately. In live testing, Cumulus Assistant returned the selected pipeline opportunity ID in all three apps. After navigating to Configuration, all three apps sent an empty record context in the same conversation. Retail and Wealth confirmed the new page and cleared record on the first follow-up. Commercial initially returned general assistance and confirmed both on a repeated check. Frontend suites passed 103 Retail, 68 Wealth and 65 Commercial tests. All 21 configuration and agent-action Apex tests passed in the org.

The first acceptance test should follow a Wealth advisor from an eligible cell through submission to a linked opportunity visible after reload. That single workflow exercises household and product context, ownership, amount, attribution, persistence and duplicate-submit handling.
