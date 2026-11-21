# Atlas V2 live parity audit · November 19, 2026

The comparison used the Atlas direction in the workspace study and the published Salesforce App Domain. The browser opened 28 top-level pages and 84 additional tab or view states across the three personas. The comparison used the same banker for each persona in both surfaces, at 1512px and 390px. Pipeline totals were also measured at 1024px and 768px.

## Release coverage

| App | States visited | Pages |
| --- | ---: | --- |
| Wealth V2 | 53 | Today, Relationships, Pipeline, Plans & Goals, Capital & Acquisition, Intelligence, Review Horizon, Workbench, Configuration |
| Retail V2 | 35 | Today, Relationships, Pipeline, Journey, Prospecting, Growth, Intelligence, Health, Workbench, Configuration |
| Commercial V2 | 24 | Today, Relationships, Pipeline, Activity & Plans, Growth, Intelligence, Health, Workbench, Configuration |

Additional states included the sampled 360 record tabs for all three personas, Wealth Finances and Engagement subviews, Wealth Capital and Intelligence subviews, and the Retail work and Intelligence views. Record-level checks used one representative 360 record per persona.

## Corrections published

| Area | Verified design target |
| --- | --- |
| Pipeline totals | Retail 76px desktop and 62px phone at weight 400. Wealth 53px desktop and 37px phone at weight 700. Commercial 35px at weight 650. |
| Wealth Plans & Goals | Moment cards use the study’s family, work, home and other palettes. Work and retirement use teal `#437f83`. |
| Wealth Capital paths | Coverage, Rising and Falling controls sit above the search and path. Seven product cards drive the selected-product evidence, rank, action history and proposal. Selecting Premier Checking updated the selected state and opened its evidence dialog in the live app. |
| Wealth White-space | The study’s heatmap treatments distinguish scored, owned and missing cells. The sampled book rendered 25 scored and 17 owned cells on both surfaces. Selecting a scored cell updated the detail panel. Unranked model scores are visible for review and remain ineligible for opportunity proposals. |
| Wealth Held-away | Balance bars, monthly activity, evidence actions and separate digital-platform cards. |
| Wealth Acquisition | Leads and introductions, business-owner handoffs, and Wealth upgrade prospects with propensity bars. |
| Wealth Intelligence | Observatory lenses, signal source tabs and selected record evidence, plan-health rows, concentration and liquidity layouts, and weekly trading. |
| Retail Intelligence | Recognized Visitors uses the study’s summary counts, customer list and product-page-load bars. |
| Retail Workbench and Prospecting | The Recorded Meetings and prospect source headings match the respective mock views. |

Salesforce deployments `0Afam00002W5kefCAB`, `0Afam00002W5kl7CAB` and `0Afam00002W5kunCAB` published the V2 bundles. The authenticated App Domain served the generated V2 assets, and the original three Salesforce apps still opened at their separate URLs. All 228 repository tests passed.

The reference contains frozen record observations and a study toolbar. Salesforce supplies the live session banner, current book selection, record availability and administrative controls. The browser audit compared representative records, rendered component structure and named typography and color values. Full pixel equality across every record and transient state remains unverified.
