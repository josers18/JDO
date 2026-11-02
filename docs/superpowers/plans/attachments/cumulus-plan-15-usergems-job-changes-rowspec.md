# Plan 15 — UserGems Job Changes rowspec

> Per-dataset attachment for the dataset template. Authored 2026-11-02 from the vendor-gap assessment (Hunter B2B data list → "Job changes / champion tracking" category) plus live probes of:
> - `DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS`: 6,435-anchor employer audience, 3,920 Wealth Management PERSON anchors, `ACCOUNT_NAME` available for destination naming.
> - `BOARDEX_EXEC_INTEL.EXEC_TURNOVER_FLAG`: monthly TRUE rate ≈ 17.7% of the employer audience. The flag is iid per month, not sticky; see plan §2.
>   **Live data NOT yet sticky:** the live table still holds the iid flag (49,962 rises / 12,457 stays / 49,941 falls, re-checked 2026-11-02).
>   **Update 2026-11-02:** the Plan 10 fix landed in code. The flag is now trailing-12-month sticky (per-account C-suite timeline). The new SP is deployed, but the live 30-month in-place re-run has **not** run yet (it was blocked by a permission gate on 2026-11-02 and needs an operator). Projected post-re-run numbers from an offline replay over the live audience: 4,682 rises / 60,110 stays / 4,673 falls, monthly TRUE rate 19.85%-21.12%. See plan §2 "BoardEx fix landed".
>
> **First event-scoped dataset.** Every earlier plan emits ≥1 row per anchor per period. Plan 15 emits rows only when something happened. The row factory returns `[]` for ~96% of (anchor, month) pairs, and that is the correct output.

## Mimics

**UserGems job-change alerts + champion tracking** (with LinkedIn Sales Navigator / ZoomInfo "Contact moves" as secondary sources). Real UserGems watches a customer's contact list, detects when a tracked person changes employer or title, resolves the new employer against the CRM (customer / prospect / net-new), and flags whether the person was a champion. We mirror 22 fields for **finance-function and owner/operator contacts** at commercial clients, who are the people a bank RM or treasury officer actually relates to.

## Audience

- **Employers (`ACCOUNT_ID`, `NEW_ACCOUNT_ID`):** `ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'` → **6,435 anchors** (probed 2026-11-02). Same predicate and rationale as Plan 14.
- **Wealth pool (`PERSON_ACCOUNT_ID`):** `CLIENT_CATEGORY = 'Wealth Management'` → **3,920 PERSON anchors**. Sorted by `ACCOUNT_ID` ascending for a stable pick.
- **BoardEx gate:** `{(ACCOUNT_ID, PROFILE_MONTH): EXEC_TURNOVER_FLAG}` for the 4 candidate months of each run week.

## Table: `FINS.PUBLIC.USERGEMS_JOB_CHANGES`

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| `ORG_ID` | VARCHAR(18) | NOT NULL | DEFAULT `'JDO'` |
| `RECORD_ID` | VARCHAR(36) | NOT NULL | `record_id_for(ORG_ID, EVENT_ID)` |
| `EVENT_ID` | VARCHAR(36) | NOT NULL | `record_id_for(source_account_id, event_month, slot, kind)`; see "Event identity" below |
| `ACCOUNT_ID` | VARCHAR(16777216) | NOT NULL | The account the event is *about*: the old employer for Departed/Promoted, the new employer for Joined |
| `PROFILE_WEEK` | DATE | NOT NULL | Monday of the week containing `DETECTED_DATE` |
| `EVENT_TYPE` | VARCHAR(10) | NOT NULL | `Departed` / `Joined` / `Promoted` |
| `EVENT_DATE` | DATE | NOT NULL | Day the move happened: uniform within `event_month` |
| `DETECTED_DATE` | DATE | NOT NULL | `EVENT_DATE + randint(3, 45)` days. UserGems detection lag (LinkedIn profile update) |
| `CONTACT_NAME` | VARCHAR(80) | NOT NULL | Synthetic `First Last` from Plan 10's name banks, seeded by EVENT_ID (salt `usergems_person`) |
| `CONTACT_PERSONA` | VARCHAR(20) | NOT NULL | One of 9 personas (below) |
| `SENIORITY` | VARCHAR(10) | NOT NULL | `C-Suite` / `VP` / `Director` / `Manager`, fixed by persona (and bumped one level for Promoted) |
| `OLD_TITLE` | VARCHAR(80) | NULL | Title before the move. NULL for inbound `Joined` from an `Unknown` prior employer |
| `NEW_TITLE` | VARCHAR(80) | NULL | Title after the move. NULL for `Departed` + `Unknown` (person left, destination not yet resolved) |
| `NEW_EMPLOYER_NAME` | VARCHAR(120) | NULL | Departed: destination name (anchor `ACCOUNT_NAME` if Existing Client, synthetic company if Prospect). NULL if Unknown or Promoted. Joined: NULL (the employer *is* `ACCOUNT_ID`) |
| `NEW_ACCOUNT_ID` | VARCHAR(16777216) | NULL | Destination anchor, only when `NEW_EMPLOYER_STATUS='Existing Client'` on a Departed row |
| `NEW_EMPLOYER_STATUS` | VARCHAR(16) | NOT NULL | `Existing Client` / `Prospect` / `Unknown` on Departed; `Not Applicable` on Promoted and Joined |
| `PAIRED_EVENT_ID` | VARCHAR(36) | NULL | Cross-link between a Departed→Existing Client row and its mirrored Joined row (both directions) |
| `WAS_CHAMPION` | BOOLEAN | NOT NULL | Contact was flagged as a champion on the source account (Departed/Promoted) or the prior account (paired Joined) |
| `WAS_PRIMARY_CONTACT` | BOOLEAN | NOT NULL | Contact was the bank's primary relationship contact at `ACCOUNT_ID` (Departed/Promoted only; FALSE on Joined) |
| `OPPORTUNITY_SCORE` | NUMBER(3,0) | NOT NULL | [0, 100]. Value of the move as a *new-business* lead (`_opportunity_score`) |
| `RELATIONSHIP_RISK_SCORE` | NUMBER(3,0) | NOT NULL | [0, 100]. Risk the move poses to the *existing* relationship at `ACCOUNT_ID` (`_risk_score`) |
| `PERSON_ACCOUNT_ID` | VARCHAR(16777216) | NULL | Wealth Management PERSON anchor that *is* this contact. Only on C-Suite/VP Departed rows (~6%) |
| `LIQUIDITY_EVENT_FLAG` | BOOLEAN | NOT NULL | `PERSON_ACCOUNT_ID IS NOT NULL`: a Wealth client just left an executive role (equity vesting, 401(k) rollover, deferred comp) |
| `GENERATED_AT` | TIMESTAMP_NTZ(9) | NOT NULL | Week-bucketed (`week_start` of PROFILE_WEEK) for byte-identical re-runs |

That is 22 data columns plus ORG_ID and RECORD_ID: 16 NOT NULL and 6 NULLable (OLD_TITLE, NEW_TITLE, NEW_EMPLOYER_NAME, NEW_ACCOUNT_ID, PAIRED_EVENT_ID, PERSON_ACCOUNT_ID). There are 3 BOOLEAN columns.

## Primary key

`(ORG_ID, EVENT_ID)`. The DC PK is `RECORD_ID`. MERGE upsert; events never delete.

## Persona vocabulary

```python
_PERSONAS = {
    # persona               seniority   title bank (OLD/NEW drawn from here)                         finance?
    "CFO":                ("C-Suite",  ["Chief Financial Officer", "CFO"],                              True),
    "CEO-Owner":          ("C-Suite",  ["Owner", "Founder and CEO", "President", "Managing Partner"],    False),
    "COO":                ("C-Suite",  ["Chief Operating Officer", "COO"],                              False),
    "VP Finance":         ("VP",       ["VP of Finance", "VP Finance and Accounting"],                  True),
    "Controller":         ("Director", ["Controller", "Corporate Controller", "Director of Accounting"], True),
    "Treasurer":          ("Director", ["Treasurer", "Director of Treasury", "Assistant Treasurer"],    True),
    "AP Manager":         ("Manager",  ["Accounts Payable Manager", "AP Supervisor"],                   False),
    "Office Manager":     ("Manager",  ["Office Manager", "Bookkeeper and Office Manager"],             False),
    "Operations Manager": ("Manager",  ["Operations Manager", "General Manager"],                        False),
}
_CSUITE = ("CFO", "CEO-Owner", "COO")
```

Personas available per account scale with size: a 1–10-person shop has no Treasurer.

```python
def _roster_for(employee_count):
    """Tracked personas, in slot order. Slot index is part of EVENT_ID, so order is load-bearing."""
    n = employee_count or 0
    if n <= 10:   return ["CEO-Owner", "Office Manager"]
    if n <= 50:   return ["CEO-Owner", "Controller", "Office Manager"]
    if n <= 200:  return ["CEO-Owner", "CFO", "Controller", "AP Manager", "Operations Manager"]
    if n <= 1000: return ["CEO-Owner", "CFO", "COO", "VP Finance", "Controller", "Treasurer", "AP Manager", "Operations Manager"]
    return ["CEO-Owner", "CFO", "COO", "VP Finance", "Controller", "Treasurer", "AP Manager",
            "Operations Manager", "Office Manager", "VP Finance", "Controller", "AP Manager"]   # 12 slots
```

## Event identity

```python
def _event_id(source_account_id, event_month, slot, kind):
    # kind ∈ {"hazard", "csuite", "pair"}; event_month is a date (1st of month)
    return record_id_for(source_account_id, event_month.isoformat(), str(slot), kind)
```

A paired mirror uses the **source** account and slot with `kind="pair"`. So the mirror's ID is computable from the Departed event alone, and either side can be regenerated independently.

## Event generation — `_events_for` (load-bearing)

This is a pure function of `(anchor, event_month, boardex_flag, ctx)`, where `ctx` holds the sorted employer pool by INDUSTRY and the sorted Wealth pool. It returns **all** events with `EVENT_DATE` in `event_month`, including paired mirrors. The SP filters by detection week afterward.

```python
_HAZARD = 0.014          # per tracked non-C-suite slot per month
_CSUITE_P = 0.08         # per account-month, only when BoardEx flag is TRUE

def _events_for(anchor, event_month, boardex_flag, ctx):
    rng = Random(seed_for(anchor["ACCOUNT_ID"], "usergems", datetime.combine(event_month, time())))
    roster = _roster_for(anchor.get("EMPLOYEE_COUNT"))
    out = []
    # 1. Hazard events — never C-suite departures.
    for slot, persona in enumerate(roster):
        if rng.random() >= _HAZARD:
            continue
        kind_roll = rng.random()
        etype = "Departed" if kind_roll < 0.60 else ("Promoted" if kind_roll < 0.85 else "Joined")
        if persona in _CSUITE and etype == "Departed":
            etype = "Promoted" if persona != "CEO-Owner" else "Joined"   # C-suite exits go through the gate only
        out += _build(anchor, event_month, slot, "hazard", persona, etype, ctx)
    # 2. BoardEx-gated C-suite departure — at most one per account-month.
    if boardex_flag and rng.random() < _CSUITE_P:
        persona = rng.choice([p for p in roster if p in _CSUITE])        # every roster has CEO-Owner
        slot = roster.index(persona)
        out += _build(anchor, event_month, slot, "csuite", persona, "Departed", ctx)
    return out
```

`_build` returns a list of 1 row, or 2 rows when the event is a Departed resolving to an Existing Client: the source row plus the mirror on the destination. Draw order inside `_build` uses `Random(seed_for(event_id, "usergems_person", ...))`, so per-event attributes don't shift when an unrelated slot's hazard roll changes.

**Note on `rng.random()` draw order in step 1:** the hazard loop must consume **exactly one** `rng.random()` per slot when no event fires, and exactly two when one does (hazard + kind). Never draw conditionally in a way that depends on anything other than the slot's own rolls. Otherwise the C-suite roll in step 2 would depend on step-1 outcomes in a non-obvious way. That is still deterministic, but it makes L1 test 4c fragile.

## New-employer resolution (Departed only)

```python
def _resolve_destination(anchor, event_id, prng, ctx):
    roll = prng.random()
    if roll < 0.12:                                     # Existing Client
        pool = ctx.by_industry.get(anchor.get("INDUSTRY")) or ctx.all_employers
        if len(pool) < 2: pool = ctx.all_employers
        idx = int(hashlib.sha256((event_id + "_dest").encode()).hexdigest(), 16) % len(pool)
        dest = pool[idx] if pool[idx]["ACCOUNT_ID"] != anchor["ACCOUNT_ID"] else pool[(idx + 1) % len(pool)]
        return "Existing Client", dest
    if roll < 0.62:                                     # Prospect (50%)
        return "Prospect", None
    return "Unknown", None                              # 38%
```

- Same-INDUSTRY pool first: a Restaurant CFO usually lands at another restaurant group. NULL INDUSTRY falls back to the full pool.
- **Prospect** names come from `_company_name(prng)`: `{prefix} {noun} {suffix}` from 3 banks (e.g. `"Summit Ridge Logistics LLC"`). They're synthetic and never collide with a real anchor name.

## Paired mirror

For a Departed row `D` with `NEW_EMPLOYER_STATUS='Existing Client'` and destination `dest`:

| Mirror field | Value |
|---|---|
| `EVENT_ID` | `_event_id(D.source_account, event_month, slot, "pair")` |
| `ACCOUNT_ID` | `dest.ACCOUNT_ID` |
| `EVENT_TYPE` | `Joined` |
| `EVENT_DATE` | `D.EVENT_DATE` |
| `DETECTED_DATE` | `D.DETECTED_DATE + randint(0, 7)` (the arrival is noticed within a week of the departure) |
| `CONTACT_NAME` / `CONTACT_PERSONA` / `SENIORITY` | Same as D |
| `OLD_TITLE` / `NEW_TITLE` | Same as D |
| `NEW_EMPLOYER_NAME` / `NEW_ACCOUNT_ID` | NULL |
| `NEW_EMPLOYER_STATUS` | `Not Applicable` |
| `PAIRED_EVENT_ID` | `D.EVENT_ID` (and D's PAIRED_EVENT_ID = mirror's EVENT_ID) |
| `WAS_CHAMPION` | Same as D (they were *our* champion, now at another client) |
| `WAS_PRIMARY_CONTACT` | FALSE |
| `PERSON_ACCOUNT_ID` / `LIQUIDITY_EVENT_FLAG` | NULL / FALSE (the liquidity story lives on the Departed row only) |

The two rows may land in **different detection weeks**, and that's fine. Each run's week filter is applied to the combined list, so each row is written in its own week. The cross-link is resolvable once both weeks have run.

## Champion / primary contact

```python
def _flags(persona, prng):
    finance = _PERSONAS[persona][2]
    champion = prng.random() < (0.40 if finance else 0.10)
    primary = prng.random() < (0.30 if persona in _CSUITE else 0.08)
    return champion, primary
```

## Scores

```python
def _opportunity_score(etype, status, seniority, champion, prng):
    base = {"Departed": {"Existing Client": 55, "Prospect": 60, "Unknown": 20},
            "Joined": 45, "Promoted": 25}
    s = base[etype][status] if etype == "Departed" else base[etype]
    s += {"C-Suite": 20, "VP": 12, "Director": 6, "Manager": 0}[seniority]
    s += 15 if champion else 0
    return int(max(0, min(100, round(s + prng.gauss(0, 6)))))

def _risk_score(etype, seniority, champion, primary, prng):
    if etype == "Joined":
        return int(max(0, min(100, round(5 + prng.gauss(0, 3)))))
    s = 30 if etype == "Departed" else 10
    s += {"C-Suite": 25, "VP": 15, "Director": 10, "Manager": 3}[seniority]
    s += 20 if champion else 0
    s += 15 if primary else 0
    return int(max(0, min(100, round(s + prng.gauss(0, 6)))))
```

The intended narratives:
- **Champion CFO departs to a Prospect:** opportunity ≈ 95, risk ≈ 90. "Follow them, and shore up the old account."
- **Office Manager promoted in place:** opportunity ≈ 25, risk ≈ 13. Background noise.

## Wealth tie-in

```python
def _person_account(event_id, etype, seniority, prng, ctx):
    if etype != "Departed" or seniority not in ("C-Suite", "VP"):
        return None
    if prng.random() >= 0.06 or not ctx.wealth_pool:
        return None
    idx = int(hashlib.sha256((event_id + "_wealth").encode()).hexdigest(), 16) % len(ctx.wealth_pool)
    return ctx.wealth_pool[idx]
```

`CONTACT_NAME` is **not** rewritten to match the Wealth anchor's `ACCOUNT_NAME`. Name alignment is a follow-up, because it would make CONTACT_NAME depend on the Wealth pick, and the pick depends on pool membership. Demo scripts should key on `PERSON_ACCOUNT_ID`.

## Promoted rows

- `ACCOUNT_ID` = source.
- `OLD_TITLE` comes from the persona's bank. `NEW_TITLE` comes from the **next seniority up**: Manager→Director (Controller bank), Director→VP (VP Finance bank), VP→C-Suite (CFO bank), and C-Suite→a C-Suite title other than the old one.
- `SENIORITY` is the *new* level. `NEW_EMPLOYER_*` are NULL, with status `Not Applicable`.

## Inbound Joined (hazard, not a mirror)

- The contact arrives at `ACCOUNT_ID` from an outside company.
- `OLD_TITLE` is NULL 50% of the time (prior employer unknown); otherwise it comes from the persona's bank.
- `NEW_TITLE` comes from the persona's bank.
- `NEW_EMPLOYER_STATUS` is `Not Applicable` and `PAIRED_EVENT_ID` is NULL.

## Week filtering (SP side, not row factory)

```python
def _rows_for_week(anchors, week_start, run_ts, boardex, ctx):
    week_end = week_start + timedelta(days=6)
    months = {(week_end.replace(day=1) - relativedelta(months=k)) for k in (0, 1, 2, 3)}
    rows = []
    for a in anchors:
        for m in sorted(months):
            flag = boardex.get((a["ACCOUNT_ID"], m), False)       # missing BoardEx row = FALSE
            for ev in _events_for(a, m, flag, ctx):
                if week_start <= ev["DETECTED_DATE"] <= min(week_end, run_ts.date()):
                    rows.append(ev)
    return rows
```

The longest lag is 45 days, plus a 7-day mirror offset, which gives 52 days. The window is `month(week_end)` and the 3 prior months.
- An event detected in week W happened at most 52 days before `week_end`.
- That is at most 2 calendar months back from `month(week_end)`.
- The extra 4th month is slack for the boundary straddle.

L1 property #5 proves completeness rather than trusting this arithmetic.

## Bias logic summary

- `EMPLOYEE_COUNT` → roster size → event volume. Bigger firms have more tracked contacts, so more events.
- BoardEx `EXEC_TURNOVER_FLAG` gates C-suite departures (one-directional).
- INDUSTRY steers destination choice for Existing Client moves.
- Finance personas → champion rate 4× non-finance.
- Seniority + champion + primary drive both scores.

## Boring case (must still behave)

Take an anchor with `INDUSTRY=None`, `EMPLOYEE_COUNT=None` (roster = 2) and BoardEx flag FALSE.
- Over 24 months it emits **~0–2** events, all from the hazard path.
- It never emits a C-suite Departed and never raises.
- An Existing Client resolution falls back to the full employer pool.

An empty Wealth pool returns None (guarded).

## L1 property targets

1. **Determinism:** same `(anchor, event_month, flag, ctx)` gives an identical list. `_rows_for_week` gives identical rows for an event regardless of which week computes it; see plan §4 Task 3.
2. **Sparsity:** across the 10-anchor fixture × 24 months with BoardEx all-FALSE, the share of (anchor, month) pairs with ≥1 event is ≤10%.
3. **Gate:** see plan 4c.
4. **Invariants 4a–4e:** as listed in the plan §4 Task 3.
5. **Lag-window completeness:** for every event generated for months M-3 … M+1, the event is returned by exactly one `_rows_for_week` call across the weeks of that span.
6. **Boring case:** as above.
