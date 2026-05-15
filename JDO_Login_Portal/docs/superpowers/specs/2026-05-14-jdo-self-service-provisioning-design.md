# JDO Self-Service Provisioning & Usage Telemetry — Design

**Date:** 2026-05-14
**Status:** Draft, approved for implementation planning
**Owner:** Jose Sifontes
**Repo:** `JDO/JDO_Login_Portal`

---

## 1. Problem & Goals

### Problem

Jose's Demo Org (JDO) is a shared Salesforce demo org used by 100+ internal Salesforce employees (primarily AEs / SEs). Today, all of them share **a single login**, which means:

- No identity per actual user (no audit trail of who did what)
- No way to attribute usage to specific deals, accounts, or initiatives
- Login concurrency / collisions when two demos run at once
- No way to deactivate one user without affecting everyone

### Goals

1. Self-service path for any internal Salesforce employee to get their own login to JDO with minimal friction
2. Per-user attribution of demo activity (sessions, login counts, time-in-org) to the deal or context they're using JDO for
3. Reportable telemetry that lets Jose answer "how is JDO actually being used, and against which deals?"
4. No regression to existing OAuth integrations, agent flows, or admin login

### Non-goals (explicit)

- SSO-only enforcement via SAML/OIDC (would break existing OAuth integrations and Connected Apps that authenticate to JDO)
- Custom Slack app with slash commands (Slack workspace admin approval is presumed unavailable)
- Migration of historical shared-login usage data (everyone starts fresh)
- License-pool management / seat optimization (org has free internal seats)
- Customer-facing demo provisioning (this design is internal-only)
- Cross-org provisioning today (single-org now; schema includes `org_id` to allow multi-org later)

### Constraints

- **Slack:** designer is a channel manager, **not** a workspace admin. Custom-app installs assumed denied. We use Workflow Builder + Incoming Webhooks + URL-buttons.
- **External deal data:** designer has no access to internal Salesforce-on-Salesforce CRM (org62) or any other deal source of truth. Attribution input is free-text with format validation.
- **Existing JDO usage:** preserve all current OAuth integrations, agent flows, named credentials, and the admin's own login path.

---

## 2. High-Level Approach

A small Heroku app sits between Slack and JDO. It owns provisioning state and login telemetry in its own Postgres DB, and writes a slim aggregate summary back into JDO custom objects so Salesforce-native reports work.

**Identity is persistent. Attribution is per-session.** A user is provisioned once and exists indefinitely. Each "what they're working on" interval is a `jdo_session` with a deal/account/exploration label. Logins land within whichever session is active at login time, with retroactive tagging available for orphan logins.

**Login enforcement is "trust + telemetry":**
- Provisioning generates a 32-char random password the user never sees.
- The "JDO Demo User" profile has `PermissionsResetPassword` removed and password reset paths closed.
- The frictionless path is the Slack URL-button: `[Open JDO]` issues a frontdoor.jsp session via JWT-bearer and lands the user in the org with no login form.
- Direct `login.salesforce.com` attempts are detectable but not blocked. Detected orphan logins trigger a Slack DM nudge to tag.

---

## 3. System Architecture

```
┌──────────────────┐              ┌──────────────────────────────────┐             ┌────────────────────┐
│  Slack workspace │              │           Heroku App             │ Pub/Sub /   │   Salesforce JDO   │
│                  │ Workflow     │  ┌────────────────────────────┐  │ REST/JWT    │                    │
│ ┌──────────────┐ │ Builder      │  │ Web (Express)              │  │◄────────────┤  - Users (real)    │
│ │#jdo channel  │─┼──form POST──►│  │  /webhooks/wfb/*           │  │             │  - LoginHistory    │
│ │ shortcuts    │ │              │  │  /open  /switch  /end      │  │             │  - LoginEventStream│
│ │ url-buttons  │ │              │  │  /tag-retro  /web/*        │  │             │  - Connected App   │
│ └──────────────┘ │              │  └────────────────────────────┘  ├────────────►│    (JWT bearer)    │
│ ┌──────────────┐ │ Incoming     │  ┌────────────────────────────┐  │ frontdoor + │  - JDO_Usage_      │
│ │DM / channel  │◄┼──webhook─────┤  │ Worker                     │  │ nightly     │    Summary__c      │
│ │   posts      │ │              │  │  Pub/Sub or LoginHistory   │  │ summary     │  - JDO Demo User   │
│ └──────────────┘ │              │  │  poll, enrich, write       │  │ sync        │    profile         │
└──────────────────┘              │  └────────────────────────────┘  │             └────────────────────┘
                                  │  ┌────────────────────────────┐  │
                                  │  │ Scheduler (Heroku cron)    │  │
                                  │  │  digest, summary, cleanup  │  │
                                  │  └────────────────────────────┘  │
                                  │  ┌────────────────────────────┐  │
                                  │  │ Heroku Postgres            │  │
                                  │  └────────────────────────────┘  │
                                  └──────────────────────────────────┘
```

### Process model (three Heroku dynos)

- **`web` dyno (Eco):** Express service. Handles inbound Workflow Builder webhooks, URL-button click handlers (`/open`, `/switch`, `/end`, `/tag-retro`), the lightweight Heroku-hosted forms for richer interactions (`/web/*`), and an admin UI at `/admin/*`.
- **`worker` dyno (Basic):** Long-running login telemetry pipeline. Subscribes to Salesforce `LoginEventStream` via Pub/Sub gRPC, or polls `LoginHistory` as a fallback. Enriches each login with active session, writes to Postgres, fires real-time nudges.
- **`scheduler` (Heroku Scheduler add-on, free):** Cron jobs — Friday digest (16:00 user-local), nightly `JDO_Usage_Summary__c` sync, hourly stale-session cleanup, monthly deactivation review.

### Boundary contracts

- **Heroku ↔ Salesforce JDO:** single Connected App "JDO Bot Integration" using JWT-bearer flow. Pre-authorized via Permission Set. Scopes: `api`, `refresh_token`, `offline_access`, `web`.
- **Heroku ↔ Slack:** all integrations work without an installed Slack app. Inbound = Workflow Builder POSTs to Heroku webhook URLs (HMAC-validated). Outbound = Incoming Webhook URL Jose owns as channel manager. Interactive elements = URL-buttons (signed-token deep links) inside block-kit messages.
- **Heroku ↔ Postgres:** standard `DATABASE_URL`. Mini tier with daily auto-backup.

---

## 4. Data Model

### 4.1 Heroku Postgres (system of record for analytics)

```sql
-- One row per provisioned human (1:1 with a Salesforce User)
jdo_user (
  id                  uuid PRIMARY KEY,
  org_id              text NOT NULL DEFAULT 'jdo',     -- multi-org-ready
  slack_user_id       text UNIQUE NOT NULL,            -- e.g. U03ABCDEF
  slack_email         text NOT NULL,
  sf_user_id          text UNIQUE NOT NULL,            -- 005xxxxxxxxxxxxxxx (18-char)
  sf_username         text UNIQUE NOT NULL,            -- jose.sifontes@salesforce.com.jdo
  sf_email            text NOT NULL,                   -- real corporate email
  status              text NOT NULL,                   -- pending | active | deactivated
  created_at          timestamptz NOT NULL,
  last_login_at       timestamptz,
  deactivated_at      timestamptz,
  deactivated_reason  text
);

-- One row per "I'm working on opp X" period. Sticky-with-switch.
jdo_session (
  id                    uuid PRIMARY KEY,
  jdo_user_id           uuid NOT NULL REFERENCES jdo_user(id),
  reference_type        text NOT NULL,                  -- 'opportunity' | 'account' | 'account_name' | 'exploration' | 'other'
  reference_value       text,                           -- '006xxx' | '001xxx' | 'Acme Corp' | NULL
  reference_normalized  text,                           -- 18-char SF ID OR lowercased account name (for grouping)
  reference_display     text,                           -- best human label for UI
  context_label         text NOT NULL,                  -- 'deal' | 'exploration' | 'enablement' | 'other'
  notes                 text,
  started_at            timestamptz NOT NULL,
  ended_at              timestamptz,                    -- NULL = currently active
  ended_reason          text                            -- 'user_ended' | 'switched' | 'auto_timeout' | 'admin'
);
CREATE INDEX idx_session_active ON jdo_session(jdo_user_id) WHERE ended_at IS NULL;

-- Mirror of LoginHistory + Heroku enrichment
jdo_login (
  id                       uuid PRIMARY KEY,
  sf_login_history_id      text UNIQUE NOT NULL,         -- canonical cursor key, dedup guarantee
  jdo_user_id              uuid NOT NULL REFERENCES jdo_user(id),
  sf_user_id               text NOT NULL,                -- denormalized
  login_time               timestamptz NOT NULL,
  source_ip                text,
  application              text,                         -- e.g. 'Browser' | 'Connected App: JDO Bot Integration'
  browser                  text,
  status                   text NOT NULL,                -- 'Success' | 'Failed: ...'
  attribution_session_id   uuid REFERENCES jdo_session(id),
  was_via_frontdoor        boolean NOT NULL DEFAULT false,
  is_orphan                boolean NOT NULL DEFAULT false  -- TRUE if no session was active at login_time
);
CREATE INDEX idx_login_user_time ON jdo_login(jdo_user_id, login_time DESC);
CREATE INDEX idx_login_orphan ON jdo_login(is_orphan, login_time) WHERE is_orphan = true;

-- Audit log of attribution changes (e.g., retroactive tagging via Friday digest)
jdo_attribution_change (
  id                  uuid PRIMARY KEY,
  jdo_login_id        uuid NOT NULL REFERENCES jdo_login(id),
  from_session_id     uuid REFERENCES jdo_session(id),
  to_session_id       uuid REFERENCES jdo_session(id),
  changed_at          timestamptz NOT NULL,
  changed_by          text NOT NULL                    -- slack_user_id | 'system' | 'admin:<id>'
);

-- Crowd-sourced autocomplete cache for the WFB form dropdown
-- Populated organically from past session inputs; refreshed on each new submission
session_reference_cache (
  reference_normalized  text PRIMARY KEY,
  reference_type        text NOT NULL,
  reference_display     text NOT NULL,
  use_count             integer NOT NULL DEFAULT 1,
  first_seen_at         timestamptz NOT NULL,
  last_seen_at          timestamptz NOT NULL
);

-- Cursor for the worker (durable replay protection)
worker_cursor (
  name           text PRIMARY KEY,                       -- e.g. 'login_history'
  last_id        text,
  last_seen_at   timestamptz
);

-- Single-use JWT receipts to prevent token replay on URL-buttons
consumed_tokens (
  jti           text PRIMARY KEY,
  consumed_at   timestamptz NOT NULL
);

-- General audit log for all state-changing actions
audit_log (
  id              bigserial PRIMARY KEY,
  occurred_at     timestamptz NOT NULL,
  actor_type      text NOT NULL,                         -- 'user' | 'system' | 'admin'
  actor_id        text,
  action          text NOT NULL,
  target_type     text,
  target_id       text,
  metadata        jsonb,
  ip              inet
);
```

### 4.2 Salesforce JDO (system of record for users + thin summary)

**No new objects for raw telemetry** (lives in Postgres).

**One new custom object** for SF-native reports and demo-meta storytelling, refreshed nightly:

```
JDO_Usage_Summary__c
  Field                       Type             Notes
  ─────────────────────────────────────────────────────────────────────
  Reference_Type__c           Picklist         Opportunity | Account | Account Name | Internal | Other
  Reference_Value__c          Text(255)        Raw value as entered
  Reference_Normalized__c     Text(255)        18-char SF ID OR lowercased name; the grouping key
  Reference_Display__c        Text(255)        Best human label
  Total_Sessions__c           Number(8,0)
  Total_Logins__c             Number(8,0)
  Distinct_Users__c           Number(6,0)
  First_Session_At__c         DateTime
  Last_Session_At__c          DateTime
  Total_Active_Hours__c       Number(8,2)      Sum of session durations
  Last_Synced_At__c           DateTime
```

External ID: `Reference_Normalized__c` (so nightly upserts are idempotent).

---

## 5. Core Flows

### 5.1 Provisioning (one-time per human)

1. User opens `#jdo` channel, clicks "Get JDO Access" Workflow Builder shortcut.
2. Slack form pre-fills name + email from Slack profile, asks for first session context (`Customer deal` / `Internal exploration` / `Other` + reference type + reference value).
3. Workflow Builder POSTs JSON to `https://jdo-bot.herokuapp.com/webhooks/wfb/provision` with `slack_user_id`, `slack_email`, `name`, `ref_type`, `ref_value`, `notes`.
4. Heroku validates HMAC signature on inbound webhook, validates `slack_email` is in `ALLOWED_EMAIL_DOMAINS`, validates `ref_value` format (regex per `ref_type`).
5. Heroku checks `jdo_user`:
   - If `active` row for `slack_user_id` → skip create, jump to step 9.
   - If `deactivated` row → reactivate + jump to step 9.
   - Else continue.
6. Heroku does JWT-bearer auth into JDO as the integration user.
7. Heroku creates a Salesforce `User`:
   - `username = <slack_email>.jdo`
   - `email = <slack_email>`
   - `alias = <first 8 chars of slack handle, suffixed if collides>`
   - `profileId = JDO Demo User profile`
   - `password = <32-char random>` (set via Apex REST or `setPassword` SOAP call; never returned to anywhere)
   - `GeneratePasswordEmail = false`
8. Heroku writes `jdo_user` row, opens initial `jdo_session`, updates `session_reference_cache` if new reference.
9. Heroku posts a rich block-kit message via Incoming Webhook to the user's DM:

   > ✅ You're set up.
   > Active session: **Opp 006XYZ123ABC** (deal demo)
   > [Open JDO] [Switch deal] [End session] [How to use]

   Each button is a URL-button to `https://jdo-bot.herokuapp.com/<action>?t=<jwt>` with single-use JWT.

**Identity collision handling:** if `slack_email` already exists as `sf_username` (e.g., user was provisioned previously under a different Slack workspace), link the existing SF user to the new Slack ID rather than creating a duplicate.

**Failure modes:**

| Failure | User-visible message | System action |
|---|---|---|
| SF API 5xx | "Hiccup — try again in 30 seconds" | Heroku retries 3x with exponential backoff; alerts admin if still failing |
| Email not in allowlist | "JDO is for @salesforce.com Slack users" | No SF user created |
| `ref_value` malformed | "That doesn't look like an Opp ID. Try a different reference type." | Form re-presented |
| Username collision (rare) | None visible | Auto-suffix `<email>2.jdo`; logged for admin review |

### 5.2 Opening JDO (per-login)

1. User clicks `[Open JDO]` URL-button in any DM/message.
2. Heroku receives `GET /open?t=<jwt>`.
3. Validates JWT signature, `exp <= iat + 60s`, `act = 'open'`, `jti` not already in `consumed_tokens`. Marks `jti` consumed.
4. Looks up active `jdo_session` for the user.
   - If none active → opens auto-session with `reference_type='exploration'`, DMs the user: "FYI no active session, started one labeled 'exploration'. [Switch to deal]"
5. Heroku does JWT-bearer auth with `sub = sf_username` (i.e., a token for *that user*, not the integration user). Returns `access_token` + `instance_url`.
6. Heroku 302-redirects browser to:
   ```
   <instance_url>/secur/frontdoor.jsp?sid=<access_token>&retURL=/lightning/page/home
   ```
7. User lands in JDO logged in as themselves. Salesforce writes a `LoginHistory` row.
8. (Async) Worker sees the new `LoginHistory` row within 1–5 minutes (Pub/Sub) or ≤1 minute (polling), inserts `jdo_login` linked to active session with `was_via_frontdoor=true`. No nudge sent.

**Why JWT-bearer instead of stored passwords:** the demo user's reusable password never exists in any usable form anywhere. Heroku holds only the integration's signing key. Even on Heroku breach, an attacker would need both the JWT signing key and the Connected App's pre-authorization to mint tokens for users.

### 5.3 Switching deals

1. User clicks `[Switch deal]` URL-button. (For URL-button path: opens a Heroku-hosted minimal form; for Workflow Builder path: WFB form.)
2. Submission POSTs to `/webhooks/wfb/switch` (HMAC-validated) or `/web/switch` (JWT-validated).
3. Heroku ends the current `jdo_session` (`ended_reason='switched'`, `ended_at=now()`).
4. Opens a new `jdo_session` with the new reference; updates `session_reference_cache`.
5. DM back: "Switched to **<new ref>**. [Open JDO]"

### 5.4 Login telemetry pipeline

**Pub/Sub path (preferred — Phase 4):**

1. Worker subscribes to `/event/LoginEventStream` via Salesforce Pub/Sub gRPC API.
2. Each event payload: `{UserId, EventDate, SourceIp, Application, Browser, LoginUrl, Status}`.
3. Worker enriches:
   - Look up `jdo_user` by `sf_user_id`. If not found → ignore (not one of our provisioned users).
   - Find active `jdo_session` at `EventDate`.
   - `was_via_frontdoor` = `Application = 'Connected App: JDO Bot Integration'`.
4. Insert `jdo_login` row with `attribution_session_id` set, `is_orphan = (no session active)`.
5. If `is_orphan AND NOT was_via_frontdoor` AND no nudge sent to this user in the last 4 hours → fire orphan nudge:

   > I see a login at 2:14pm but no session was active. Was this for…
   > [→ Acme Opp] [→ Internal exploration] [Skip]

6. Update `worker_cursor`.

**Polling fallback (Phase 1–3):**

1. Every 60s: SOQL `SELECT Id, UserId, LoginTime, SourceIp, Application, Browser, Status FROM LoginHistory WHERE Id > :last_id ORDER BY Id LIMIT 200`.
2. Same enrichment + insert + nudge logic.
3. Update `worker_cursor.last_id`.

`sf_login_history_id` UNIQUE constraint ensures both paths are idempotent on replay.

### 5.5 Friday digest + retroactive tagging

Heroku Scheduler runs Fridays at 16:00 user-local. Per-user timezone resolution: store `tz` on `jdo_user` at provisioning time (Workflow Builder can capture from Slack profile if exposed; otherwise default to `America/Los_Angeles` and let users update via a one-click `[Set my timezone]` button in the first DM). Open Question 6 covers cases where timezone capture is unavailable.

1. For each `jdo_user` with logins this week:
   - Group: `tagged_logins` by session, `untagged_logins` (where `is_orphan = true AND attribution_session_id IS NULL`).
2. DM:

   > 📊 Your week in JDO: 12 logins, 3 sessions (Acme Opp, Globex Opp, exploration).
   > You have 2 untagged logins from Tuesday — tag them?
   > [→ Acme] [→ Globex] [→ exploration] [Skip]

3. Each button is a URL-button → `/tag-retro?t=<jwt>` with `jwt.exp = iat + 24h` (longer because batch nudge), `jwt.ctx = { login_ids, session_id }`.
4. Heroku updates `jdo_login.attribution_session_id` and writes `jdo_attribution_change` row.

### 5.6 Stale session cleanup

Heroku Scheduler runs hourly:

1. Find `jdo_session` where `ended_at IS NULL AND last_login_in_session < now() - interval '24 hours'`.
2. End them with `ended_reason='auto_timeout'`.
3. DM the user (debounced — once per session, never twice): "Auto-ended your <ref> session after 24h idle. [Restart for same deal]"

### 5.7 Nightly summary sync to JDO

Heroku Scheduler runs nightly at 02:00 UTC:

1. Aggregate `jdo_session` + `jdo_login` grouped by `reference_normalized`:
   ```sql
   SELECT reference_normalized, reference_type, reference_display,
          COUNT(DISTINCT jdo_session.id) AS total_sessions,
          COUNT(jdo_login.id) AS total_logins,
          COUNT(DISTINCT jdo_session.jdo_user_id) AS distinct_users,
          MIN(jdo_session.started_at) AS first_session_at,
          MAX(jdo_session.started_at) AS last_session_at,
          SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at))/3600) AS total_active_hours
   FROM jdo_session
   LEFT JOIN jdo_login ON jdo_login.attribution_session_id = jdo_session.id
   GROUP BY reference_normalized, reference_type, reference_display;
   ```
2. Bulk upsert into `JDO_Usage_Summary__c` via REST `/composite/sobjects` with `Reference_Normalized__c` as the external ID.
3. Soft-delete summary rows whose `Reference_Normalized__c` no longer appears in source data (rare).

---

## 6. Security

### 6.1 Connected App "JDO Bot Integration" (in JDO)

- **Type:** server-to-server, JWT-bearer flow
- **Permitted Users:** "Admin approved users are pre-authorized" — assignment via Permission Set
- **OAuth scopes:** `api`, `refresh_token`, `offline_access`, `web`
- **Digital signature:** RS256. Private key stored as Heroku config var `SF_JWT_PRIVATE_KEY`; public cert uploaded to Connected App. Rotated quarterly.

### 6.2 Permission Sets

**`JDO Bot Access`** (assigned to one Integration User):
- Object permissions: read `User`, read `LoginHistory`; CRUD on `JDO_Usage_Summary__c`; create/edit/deactivate `User`
- System permissions: API Enabled, Manage Internal Users, Reset User Passwords

**`JDO Demo User profile`** (assigned to every provisioned user):
- Profile baseline: minimal Standard User
- Permissions removed: `PermissionsResetPassword` (cannot reset own password)
- Password policy: never expires (random pwd unused, expiry just adds noise to LoginHistory); minimum complexity; "Cannot use Forgot Password link" if the org's SF version supports the option, otherwise secret-question-required with no question set
- `PasswordNeverExpires = TRUE`

### 6.3 Org settings (scoped — admin & integration users untouched)

- **Org-wide "Forgot Password" link** on the My Domain login page: **leave enabled.** This protects the admin's own login. The reset *path* is closed for JDO Demo User profile members at the *profile* level (see §6.2), not org-wide — admin and integration users keep their normal reset path.
- "Lock sessions to the IP from which they originated": **disabled** (frontdoor.jsp is initiated from Heroku IP but user browses from their own IP)
- Login IP ranges: leave permissive on JDO Demo User profile

### 6.4 Heroku config / secrets

| Var | Purpose |
|---|---|
| `SF_LOGIN_URL` | `https://login.salesforce.com` (or sandbox) |
| `SF_CLIENT_ID` | Connected App consumer key |
| `SF_JWT_PRIVATE_KEY` | RS256 private key, signs JWT assertions |
| `SF_JWT_USERNAME_INTEGRATION` | Integration user `sf_username` |
| `SLACK_WFB_WEBHOOK_SECRET` | HMAC secret for inbound Workflow Builder webhooks |
| `SLACK_INCOMING_WEBHOOK_URL` | Channel-scoped Incoming Webhook for outbound posts |
| `SLACK_USER_DM_WEBHOOK_URL_TEMPLATE` | Per-user DM webhook template (or fallback strategy if unsupported) |
| `JWT_TOKEN_SECRET` | HS256 secret for short-lived URL-button tokens |
| `DATABASE_URL` | Heroku Postgres |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated allowlist (e.g. `salesforce.com`) |
| `ADMIN_SLACK_USER_IDS` | Who receives ops alerts |
| `DD_API_KEY` | Datadog APM |

### 6.5 URL-button JWT model

```json
{
  "sub": "<jdo_user.id>",
  "act": "open|switch|end|tag-retro",
  "iat": <epoch>,
  "exp": <epoch + ttl>,
  "jti": "<uuid>",
  "ctx": { /* action-specific */ }
}
```

- HS256 signed with `JWT_TOKEN_SECRET`
- TTLs: `open` = 60s; `switch` / `end` / interactive = 5 min; `tag-retro` = 24h
- `jti` written to `consumed_tokens` on first use; second use rejected
- All buttons regenerate fresh tokens at message-send time

### 6.6 Endpoint authentication

| Endpoint | Auth |
|---|---|
| `/webhooks/wfb/*` | HMAC `X-Signature` over body, secret = `SLACK_WFB_WEBHOOK_SECRET` |
| `/open`, `/switch`, `/end`, `/tag-retro` | Short-lived JWT in `?t=` |
| `/web/*` | Stateless: each request signed via JWT; no cookies |
| `/admin/*` | HTTP Basic + IP allowlist + `slack_user_id ∈ ADMIN_SLACK_USER_IDS` |
| `/health` | Public, no auth |

### 6.7 Threat model & mitigations

| Threat | Mitigation |
|---|---|
| User shares Slack DM with `?t=…` URL | 60s TTL + single-use `jti` — dead by paste time |
| User forwards Friday digest with retro-tag URL | 24h expiry, single-use, scoped to `sub` claim — only tags that user's logins |
| Heroku app compromised, `SF_JWT_PRIVATE_KEY` exfiltrated | Rotate keypair in Connected App + Heroku, redeploy. Existing in-flight SF sessions continue until natural expiry |
| User figures out their `<email>.jdo` username and tries direct login | No usable password exists, `PermissionsResetPassword` removed, "Forgot Password" closed at profile level. Only path is Slack |
| Slack workspace compromised (attacker DMs malicious "Open JDO" link) | URLs go to real Heroku; attacker cannot forge JWT without secret |
| Replay of Pub/Sub events | `sf_login_history_id` UNIQUE constraint → idempotent inserts |
| Webhook replay | HMAC includes timestamp; reject signatures > 5 min old |

### 6.8 Audit trail

`audit_log` row written for every: provision, deprovision, session start, session switch, session end, retro-tag, admin override, JWT failure, webhook signature failure.

---

## 7. Operations & Observability

### 7.1 Heroku resources

| Resource | Tier | Monthly |
|---|---|---|
| `web` dyno | Eco | ~$5 |
| `worker` dyno | Basic (always on) | ~$7 |
| Heroku Scheduler | Free | $0 |
| Heroku Postgres | Mini | ~$5 |
| **Total** | | **~$17** |

Datadog free tier ($0) provides APM + log aggregation + monitors below the 5-host threshold.

### 7.2 Datadog APM instrumentation

- Heroku buildpack on each dyno → `dd-trace` auto-instruments Express + Postgres + outbound HTTP
- Custom span tags: `slack.user_id`, `jdo.session_id`, `sf.operation`, `jwt.action`
- Logs forwarded with `inject_trace_id=true` for log↔trace linking
- Dashboards (one-time setup):
  - **JDO Bot Health** — request rate, error rate, p95/p99 per endpoint, Pub/Sub lag
  - **Provisioning Funnel** — WFB submit → SF user create → Slack DM, drop-off per step
  - **Attribution Quality** — % logins attributed, % via frontdoor, orphan rate
- Monitors → Slack DM admin on:
  - Endpoint error rate > 1% over 5 min
  - p95 latency on `/open` > 3s
  - Pub/Sub lag > 60s
  - JWT signature failures > 10/min
  - Worker cursor stuck > 15 min
  - SF JWT-bearer auth failures > 3 consecutive

### 7.3 Health endpoint

`GET /health` returns 200 only if: DB reachable, last successful Pub/Sub event < 5 min ago (or polling cycle < 2 min ago), last successful SF auth < 1 h ago, `worker_cursor` advanced in last 15 min. Pingdom or UptimeRobot pings every 5 min, DMs admin on flap.

### 7.4 Routine ops

| Task | Frequency | How |
|---|---|---|
| JWT keypair rotation | Quarterly | Per the runbook (to be authored at `JDO_Login_Portal/docs/RUNBOOKS.md` during Phase 1) |
| Inactive user review | Monthly | Scheduler job: list users with no logins in 90 days; admin DM `[Deactivate all] [Keep]` buttons |
| Postgres backup verification | Quarterly | Spot-check restore from auto-backup |
| `audit_log` retention | Annual | Archive rows > 1 year to S3 |

### 7.5 Capacity envelope (1-year projection)

- 100 active users × 5 logins/day × 365 = **~182K `jdo_login` rows/year** (Mini Postgres holds 10M rows)
- ~2,000 SF API calls/day total (limit comfortably 15K+)
- Heroku Postgres connection budget: web pool 10 + worker 1 + scheduler bursts ≤ 2 = 13 (Mini ceiling 20)

### 7.6 Disaster scenarios

| Scenario | Recovery |
|---|---|
| Heroku app deleted | Redeploy from git; Postgres add-on persists separately. Reset `worker_cursor.last_id` to backfill since latest LoginHistory |
| Postgres lost | Restore from auto-backup (24h max data loss). Replay LoginHistory since `last_id` to backfill recent logins. Sessions reconstruct partially from S3-archived `audit_log`. Mitigation at scale: enable continuous protection (paid) when active users > 50 |
| Connected App revoked | All frontdoor flows fail. Re-create CA, upload pub key, update Heroku `SF_CLIENT_ID`. Detected via JWT auth failure monitor within minutes |
| Slack workspace bans Workflow Builder webhooks | Manual workaround: every Slack-fronted flow has an equivalent Heroku-hosted web page (`/web/provision`, `/web/switch`, `/web/end`, `/web/tag-retro`) reachable by direct URL. Admin shares the URL via whatever channel still works (email, in-person, alternative chat). This is a degraded mode, not zero-touch — see Open Question 1 |

---

## 8. User Experience

### 8.1 First-time provisioning (~60 seconds)

1. Sarah (SE) joins `#jdo` channel.
2. Sees pinned message: "👋 New here? Click [Get Access]".
3. Click → Workflow Builder form opens (auto-filled name/email + first session context).
4. Submit → ~5 seconds later, DM from JDO Bot:

   > ✅ You're set up.
   > Active session: **Opp 006XYZ123ABC** (deal demo)
   > [Open JDO] [Switch deal] [End session] [How to use]

5. Click `[Open JDO]` → browser opens → JDO loads, logged in as Sarah, no login form.

### 8.2 Daily / repeat use

- Sarah revisits her DM with JDO Bot → same buttons, click `[Open JDO]`.
- For switching deals: `[Switch deal]` → form → fresh DM with updated active session.
- Pinned `#jdo` channel `[Get Access]` button serves as a recovery path if she loses the DM.

### 8.3 Friday digest

> 📊 Sarah, your week in JDO:
> • 3 sessions: Acme (006XYZ), Globex (006ABC), exploration
> • 14 logins total
> • 2 untagged logins from Tuesday afternoon
> Tag the untagged?
> [→ Acme] [→ Globex] [→ exploration] [Skip]

### 8.4 Admin (Jose) experience

- Datadog dashboards (Health, Provisioning Funnel, Attribution Quality)
- Heroku-hosted `/admin` page: list active users, current sessions, raw login feed, force-end, manual deactivate
- Slack DMs for ops alerts
- Inside JDO: standard SF reports on `JDO_Usage_Summary__c`:
  - "Sessions by Account / Reference"
  - "Top deals by demo hours"
  - "User leaderboard"
- `/jdo password help` Workflow Builder shortcut to redirect users who try to log in directly

---

## 9. Rollout Sequencing

```
Phase 1 — Foundations (week 1–2)
  • Connected App + JWT keypair + integration user + JDO Demo User profile
  • Heroku app skeleton: web + worker + Postgres + Datadog
  • JWT-bearer auth working end-to-end (manual test: provision yourself)
  • LoginHistory polling (defer Pub/Sub to Phase 4)

Phase 2 — Provisioning + Open (week 3)
  • Workflow Builder form for /webhooks/wfb/provision
  • Slack incoming webhook for DMs
  • URL-buttons for [Open JDO] (frontdoor flow)
  • Pilot with 2–3 friendly users

Phase 3 — Sessions + Switching (week 4)
  • Switch / End / sticky-session logic
  • Friday digest + retroactive tagging
  • JDO_Usage_Summary__c sync job
  • Onboard wider 10-user cohort

Phase 4 — Polish (week 5)
  • Migrate from LoginHistory polling to LoginEventStream Pub/Sub
  • Stale session cleanup, monthly deactivation review
  • Admin /admin page hardening
  • Wider rollout to 100 users
```

---

## 10. Open Questions

1. **Slack Workflow Builder external-webhook policy** — confirm with Slack admin in week 1 that WFB → Heroku URLs are allowed in this workspace. **Highest-risk dependency.** If denied, Pattern B fails and we fall back to Heroku-hosted web forms only.
2. **Demo data sensitivity** — does JDO contain any data that should not be visible to all 100+ provisioned users? If so, the JDO Demo User profile must be tightened beyond the baseline in §6.2.
3. **Slack DM mechanism** — Incoming Webhooks technically post to channels, not DMs. To DM a user without a custom Slack app, this design assumes Workflow Builder's "Send a direct message" step (or a per-user DM channel created in advance). **Validate this works in your Slack workspace in week 1** — if neither path is available, fall back to channel-thread mentions for nudges/digests.
4. **Real opportunity validation** — accept that we cannot validate Opp IDs against any source of truth (no org62 access). Users could type fake IDs. Document this as a known limitation; revisit if/when org62 access becomes available.
5. **Deactivation policy threshold** — proposed: 90 days with no logins → DM "we'll deactivate in 7 days unless you click [Keep me]". Confirm cadence before Phase 4.
6. **User timezone for Friday digest** — proposed: capture timezone at provisioning time (or default to UTC); deliver digest at 16:00 user-local. Confirm acceptable.

---

## 11. Out of Scope (explicit)

- SSO via SAML/OIDC
- Custom Slack app with slash commands
- Migration of historical shared-credentials usage
- Cross-org provisioning today (`org_id` column included for forward-compat)
- Customer-facing demo provisioning
- License-pool / seat optimization
- Replacing existing OAuth integrations or agent flows that authenticate to JDO
