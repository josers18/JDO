# Real-Time Identity Resolution — Web Lead Capture
### End-to-End Process (Data Cloud)

**Purpose:** Document how a website form submission flows through Data Cloud in real time — from the moment a visitor submits, through real-time ingestion and identity resolution, to the point where the business can determine whether the person is an **existing customer** or a **net-new prospect**. This determination is the decision point that a downstream automation (e.g., lead creation) would act on. *(Downstream automation is intentionally out of scope for this document.)*

---

## 1. The scenario

A visitor fills out a web form (registration / lead form) on the customer's site and submits their details (name + email). Data Cloud must, in near real time:

1. Capture the submission as an event.
2. Resolve the person's identity against the existing customer base.
3. Classify them as **existing** (already known in CRM) or **net-new** (unknown).

The classification is done entirely inside Data Cloud's real-time layer — **before** any CRM record is created.

---

## 2. Architecture at a glance

```
  Web form submit
        │  (payload / streaming event)
        ▼
  Real-Time Data Stream  ──►  Data Lake Object (raw)
        │
        ▼
  Mapped to Data Model Objects
   • Individual            (name)
   • Contact Point Email   (email  ← the match key)
        │
        ▼
  Real-Time Identity Resolution (RTIDR)
   • Match rule: normalized email
   • Produces: Unified Individual + Unified Link
        │
        ├──► Real-Time Data Graph (RTDG)     ← live, millisecond lookup
        │       pre-joined 360 document
        │
        └──► Determination: existing vs net-new
                (based on the source composition
                 of the resolved unified record)
```

**Two identity layers to understand:**

| Layer | What it is | Freshness |
|---|---|---|
| **Real-Time Data Graph (RTDG)** | A pre-joined, materialized 360 document per unified individual, served by key lookup | **Live** — reflects the submission within seconds |
| **Queryable DMOs / link tables** | The analytical (SQL-queryable) copy of unified individuals and their links | **Lags** — materializes on a slightly slower cadence |

> **This distinction is critical:** operational decisions (is this person known?) read the **real-time graph**; the SQL tables are the analytical mirror and catch up moments later.

---

## 3. End-to-end stages (what happens, and what you can observe)

The submission propagates through Data Cloud in **stages**. Each stage becomes observable slightly after the previous one:

| # | Stage | What lands | How to confirm |
|---|---|---|---|
| 1 | **Ingestion** | The raw event enters via a real-time data stream | The submission's email appears as a **Contact Point Email** record tied to a **source record id** (the visitor's device/session id) and a web data source |
| 2 | **Attribute mapping** | Name lands on the **source Individual** record | The source individual (same id) shows the submitted first/last name |
| 3 | **Identity resolution** | RTIDR resolves the source record to a **Unified Individual**, recorded in the **Unified Link** table | A row appears in the Unified Link mapping `SourceRecordId → UnifiedRecordId` (the **unified id**) |
| 4 | **Graph materialization** | The **Real-Time Data Graph** exposes the full 360 document for that unified id | A key lookup on the unified id returns name, email, browsing history, and (for known customers) offers |
| 5 | **Determination** | The unified record's **source composition** reveals existing vs net-new | Count the data sources on the unified id in the link table (see §4) |

> **Observed timing (from live testing):** the Contact Point Email typically appears first (tens of seconds), followed by the source Individual name, then the Unified Link / unified id, then the graph. A genuinely new visitor can take a few minutes for the unified record to fully materialize in the queryable tables — while the real-time graph reflects it almost immediately.

---

## 4. How "existing vs net-new" is determined

Identity resolution turns **every** submission into a unified individual — so the question is *not* "does a unified record exist?" (one always will). The real question is:

> **Did this submission get consolidated with a pre-existing customer source, or is it standing alone as a web-only record?**

This is answered by the **source composition** of the resolved unified id:

- **Existing customer** → the unified id carries at least one **known/CRM source** (Contact, Person Account, Lead, MDM, marketing platform). The email matched a customer already in the identity graph.
- **Net-new** → the unified id has **only web/anonymous sources** (the visitor's own submission). Nothing matched.

**The rule, in one line:**

> On the Unified Link object, for the resolved unified id, check whether **any** contributing data source belongs to the org's **known-source list**.
> **None → net-new.  One or more → existing.**

This same check doubles as **deduplication**: if the email already resolves to a Contact *or* an existing Lead, it counts as "known," so you never create a duplicate.

> **Note:** The "anonymous" flag on a profile is **not** the signal for this decision — a visitor who provides an email is flagged non-anonymous yet can still be net-new. **Source composition is the authoritative signal.**

---

## 5. Prerequisite: the customer base must already be in Data Cloud

Real-time resolution can only classify someone as an "existing customer" if the customer base (Contacts / Person Accounts) has **already been ingested and resolved** into the identity graph under the same ruleset. The web submission is a **probe against that pre-loaded graph** — it does not create identity, it tests against it.

---

## 6. Key considerations & gotchas

- **Match key quality.** Resolution matches on **normalized email**. If the form doesn't capture a valid, normalized email, real customers will not match and will fall to "net-new." Normalize email on capture.
- **The identity key is the source/device id.** Each distinct visitor's browser generates a **unique device id**, which becomes the source record id. Distinct visitors therefore create distinct source records (and distinct unified records unless their emails match an existing customer).
  - *Testing caveat:* if a test harness reuses a **fixed device id** across submissions, each new submission **overwrites the previous one** on the same source record (and stays on the same unified id) instead of creating a new record. To test a genuine new-visitor creation, use a fresh browser/incognito session (new device id) per test person.
- **Read the decision from the real-time (hot) layer — not cold-store SQL.** Identity resolution runs in a **hot layer** that serves the real-time data graph instantly; the SQL-queryable tables (unified individual, link, graph value store) are **cold-store copies that sync on a lag** (often minutes). A runtime decision must read the **hot layer**, keyed on the visitor's **source/device id** (which the form always has at submit time):
  - **Real-time read:** a **data graph lookup** on the real-time graph, using the lookup key `UnifiedLink…SourceRecordId = <deviceId>`. This returns the resolved **unified id + the full 360 document + the source composition** in milliseconds, with no dependency on the cold-store sync.
  - Do **not** resolve the identity by querying the unified/link tables synchronously, and **not** by a name lookup — those are the lagging analytical copies and will return "not found" for a person the hot layer has already resolved.
- **Eventual consistency.** A "net-new" verdict means "matched nothing *at this instant*." Feeding any subsequently created CRM record back into Data Cloud lets the next submission from that email resolve as "existing."

---

## 7. Worked example (live, concrete)

A real web-form submission — **Johnny Appleseed, `jappleseed@idrtest.demo`** — was run through the full pipeline on 2026-09-11 and observed at each stage. Actual values below.

### Stage 0 — Baseline (before submit)

A pre-check confirmed a clean slate — the email and name returned **zero** records anywhere in the identity graph.

### Stage 1 — Ingestion (raw event lands)

The submission arrived as a payload event and mapped to the contact-point and source-individual objects:

| Field | Value |
|---|---|
| Email (Contact Point Email) | `jappleseed@idrtest.demo` |
| **Source / device id** (`SourceRecordId`) | `a12cf22244cc5b22` — brand-new (fresh browser session) |
| Data source | `CumulusRTOM_identity_FFB426A2` (web) |
| Source Individual name | Johnny Appleseed |

### Stage 2 — Identity resolution (hot layer)

Real-Time Identity Resolution matched on normalized email, found **no existing customer**, and created a **new unified individual**:

| Field | Value |
|---|---|
| **Unified id** (`UnifiedRecordId`) | `b3e404e60a3c77e6637fb662998f4497` |
| Link | `SourceRecordId a12cf22244cc5b22 → UnifiedRecordId b3e404e60a3c77e6637fb662998f4497` |
| IsAnonymous | 0 |

### Stage 3 — Real-time data graph read (the runtime call)

Using **only the device id**, a real-time data-graph lookup returned the full resolved 360 in seconds — the exact call a runtime consumer would make:

```
Data Graph:  RTDG2
Lookup key:  UnifiedLinkssotIndividualRtir__dlm.SourceRecordId__c = a12cf22244cc5b22
```

Returned document (abridged):

```json
{
  "ssot__Id__c": "b3e404e60a3c77e6637fb662998f4497",
  "ssot__FirstName__c": "Johnny",
  "ssot__LastName__c": "Appleseed",
  "ssot__IsAnonymous__c": "0",
  "UnifiedLinkssotIndividualRtir__dlm": [{
    "SourceRecordId__c": "a12cf22244cc5b22",
    "UnifiedRecordId__c": "b3e404e60a3c77e6637fb662998f4497",
    "ssot__DataSourceId__c": "CumulusRTOM_identity_FFB426A2",
    "ssot__Individual__dlm": [{
      "ssot__ContactPointEmail__dlm": [{ "ssot__EmailAddress__c": "jappleseed@idrtest.demo" }],
      "ssot__ProductBrowseEngagement__dlm": [
        { "ssot__EngagementChannelActionId__c": "Registration Submitted", "ssot__EngagementDateTm__c": "2026-09-11T21:00:19Z" },
        { "ssot__EngagementChannelActionId__c": "Email Captured",        "ssot__EngagementDateTm__c": "2026-09-11T21:00:20Z" },
        { "ssot__EngagementChannelActionId__c": "Viewed Register Page",  "ssot__EngagementDateTm__c": "2026-09-11T20:58:56Z" }
      ]
    }]
  }]
}
```

Registration click-stream captured (20:58:56 → 21:00:20): Viewed Register Page → Email Field Captured → Registration Submitted → Email Captured → Registration Identity.

### Stage 4 — Determination (existing vs net-new)

Source composition of unified id `b3e404e60a3c77e6637fb662998f4497`:

| Metric | Value |
|---|---|
| Distinct data sources | 1 |
| Sources | `CumulusRTOM_identity_FFB426A2` (web) |
| Known / CRM sources | **0** |

**Verdict: NET-NEW** — one web source, no CRM contributor → the visitor exists nowhere in CRM → this is the decision point at which a lead-creation automation would engage. (An *existing customer* would instead show a CRM source — e.g. `Contact_Home`, `PersonAccount`, `Individual_MDM` — under the same unified id, and would be suppressed.)

### Timing observed

| Layer | When it reflected the submission |
|---|---|
| Raw event + **hot-layer data graph** | **seconds** |
| Cold-store unified / link SQL tables | several minutes (sync lag) |

The real-time decision was read from the **hot layer via the source-id graph lookup** — the cold-store SQL tables lagged and would have returned "not found" for a visitor already resolved in the hot layer. This is the core operational guidance for any production consumer.

### Identity-key behavior confirmed

A fresh browser session produced a **new device id** (`a12cf22244cc5b22`) and thus a genuine new source record. In contrast, re-submitting within the **same** session reuses the device id and **overwrites** the prior source record on the same unified id — so distinct visitors must arrive on distinct device ids (the normal production case) to create distinct records.

---

*Prepared from live Data Cloud real-time identity resolution testing, 2026-09-11.*
