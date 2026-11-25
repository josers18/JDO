# Atlas V2 accent assessment

On November 20, 2026, the accent update shipped to Retail V2, Wealth V2 and Commercial V2. The gold, blue and green persona themes still identify the workspace. Within each page, accent colors now help distinguish the information a banker is reading. [View six screenshots from the deployed apps](./atlas-v2-accent-examples.webp).

## What prompted the changes

| Finding | Update | Live check |
| --- | --- | --- |
| The gold Wealth theme gave many goals, milestones, account balances and text labels the same emphasis. | Life-event illustrations and goal categories have distinct accents. Held-away bars distinguish asset classes. Detail panels use restrained tints so names, amounts and actions remain legible. | Three distinct illustration fills appeared in Life moments. Two asset classes had different balance-bar fills in Held-away opportunities. |
| In the opportunity landscape, different probabilities looked alike and the selected cell was hard to locate. | The three apps use a shared probability scale, with stronger fills for higher scores. Ownership, missing scores and selection each retain a separate cue. | Selected scored cells opened evidence in all three apps. The live records checked produced three different probability fills in Retail and Wealth and two in Commercial. |
| Retail stress and deposit charts, and Commercial pulse measures and intelligence drivers, were hard to tell apart. | Stress uses clay. Deposits and growth use teal. Branch exposure uses blue and open cases use plum. Component accents distinguish signal families, while amounts, point values and labels carry the meaning. | Opened Retail's stress watchlist from Portfolio pulse. Commercial's pulse displayed Growth-tier mix, Branch exposure and Open service cases together, and the growth-tier drill-in opened Credit & coverage. |
| Workbench and relationship views often repeated the theme color for records with different purposes. | Evidence, conversations, work in progress and risk now have distinct treatments. Wealth service lanes derive their accent from the case status, so sorting the lanes preserves its meaning. | Opened the workbench tabs, configuration tabs and relationship detail tabs in all three deployed apps. Commercial tasks, meetings and service each displayed records for the tested book. |

## Page and tab coverage

Each column covers one application's own routes. The browser checks included the following pages and their tabbed views.

| Page or workflow | Retail V2 | Wealth V2 | Commercial V2 |
| --- | --- | --- | --- |
| Today | Portfolio pulse, priority queue and time filters | Advisory desk, upcoming reviews, plan rescue and refresh | Overview, Portfolio pulse, Agenda & pipeline, Action workspace and Offer opportunities |
| Relationships | Landscape, customer finder, goal, service, milestone and pinned cohorts | Household landscape, finder, planning, capital, service, goals and shortlist | Companies directory and company drill-in |
| Pipeline | Opportunity plot and planning board | Stage mix, opportunity plot and selected deal | Stage mix, deals and company handoff |
| Life, plans and activity | Life events, calendar, milestone stories, event categories and financial goals | Overview, life moments, category filters, provider plans and funded goals | Recorded agenda, tasks, meetings, calendar and local meeting proposals |
| Growth and origination | Needs explorer, probability map, book movers, home and investing needs | Capital paths, white-space heat map, held-away opportunities and acquisition, including owner and upgrade views | Treasury plays, coverage matrix, offer opportunities and leads and owner introductions. Rising, falling and eligible offers were checked in Today and Treasury. |
| Prospecting | Dedicated prospecting page, referral sources and warm introductions | Acquisition within Capital & acquisition | Leads and owner introductions within Treasury & origination |
| Intelligence | Signal inbox, signal families and recognized visitors | Observatory, signals, plan health, concentration, liquidity and trading | Company intelligence, signal list and selected company evidence |
| Health and coverage | Portfolio pulse, financial stress, property exposure, engagement and service watch | Review horizon, due, risk, critical, stale and all reviews | Credit & coverage, growth-tier mix, branch and market footprint |
| Workbench | Service desk, tasks, recorded meetings, meeting planner, service cases and local drafts | Tasks, meetings, cases and drafts | Tasks, recorded meetings, service and local proposals |
| Configuration | Themes, AI models and display size | Themes, AI models and display size | Themes, AI models and display size |
| Relationship 360 | Overview, profile, finances, journey, engagement, growth, tools, notebook and screening | The same nine household tabs, plus account groups, transaction and trade views, and the engagement evidence tabs | Overview, profile, finances, Company Intel, engagement, growth, journey, notebook, screening and tools |

## Verification

| Deployed application | Main navigation pages | Relationship tabs | Live browser views checked | Automated tests passed |
| --- | ---: | ---: | ---: | ---: |
| Retail | 10 | 9 | 83 | 100 |
| Wealth | 9 | 9 | 74 | 68 |
| Commercial | 9 | 10 | 51 | 62 |
| **Total** | **28** | **28** | **208** | **230** |

The browser pass opened routes, selected tabs and inspected rendered content using an authenticated book in each app. It recorded zero browser exceptions and zero page-level horizontal overflows at 390 pixels across the 208 checked views. A separate pass exercised 119 states in the local mock. Read-only interactions covered live drill-ins and selection. Record creation, proposal submission, theme persistence and every possible record or data value were outside this visual assessment.

Salesforce reported deployment **0Afam00002W6MjxCAF** successful with zero component errors.
