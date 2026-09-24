# Demo User Provisioning — Operator Runbook

**Audience:** anyone who needs to give someone access to the JDO demo org
(`finsdc3.demo`, alias `jdo-oe0sdd`) — whether they need a brand-new login or already
have one that's missing access. No prior knowledge of this repo is required. Follow the
steps top to bottom.

- **Org:** `finsdc3.demo` — CLI alias `jdo-oe0sdd`
- **Login URL:** https://storm-16a17dc388fbe6.demo.my.salesforce.com/
- **Shared demo password:** `salesforce1` (low-sensitivity demo credential)
- **The baseline ("full access") is:** 9 permission set groups + 49 permission-set
  licenses + WebMessagingQueue + Demo_Users group — a clone of `sarah.smith@finsdc3.demo`.

> **Two modes — pick one:**
> | Situation | Mode | Command |
> |-----------|------|---------|
> | Person has **no login yet** | **create** | `provision_demo_user.sh <email> [First] [Last]` |
> | Person **already has a login** but is missing access | **align** | `provision_demo_user.sh --existing <username\|email\|Id>` |
>
> Both are **idempotent** — safe to re-run. Neither ever removes access.

---

## 0. One-time setup (do this once per machine)

1. **Install the Salesforce CLI** (`sf`). Check: `sf --version`. If missing, install from
   https://developer.salesforce.com/tools/salesforcecli.
2. **Get the repo** and `cd` into its root (the folder that contains `DemoUserProvisioning/`).
3. **Authenticate to the demo org** under the alias `jdo-oe0sdd`:
   ```bash
   sf org login web -o jdo-oe0sdd
   ```
   Log in as an **admin** of `finsdc3.demo` (you need Manage Users). Verify:
   ```bash
   sf org display -o jdo-oe0sdd      # should print org details, not an error
   ```

If `sf org display` errors, you are not authenticated — redo the login step. **All commands
below are run from the repo root.**

---

## 1. Create a NEW demo user

For someone who does not yet have a login. The demo username becomes the email's local part
+ `@finsdc3.demo` (so `jdoe@salesforce.com` → `jdoe@finsdc3.demo`).

```bash
DemoUserProvisioning/scripts/provision_demo_user.sh jdoe@salesforce.com Jane Doe
# name is optional — omit to derive it from the email:
DemoUserProvisioning/scripts/provision_demo_user.sh jdoe@salesforce.com
```

- First/last name: **letters, spaces, hyphens, dots only** — no apostrophes/quotes
  (an "O'Brien" is rejected; drop the apostrophe or omit the name).
- To use a non-default password for this one run: prefix `DEMO_USER_PASSWORD='...'`.

**Expected output** (in the debug log):
```
USER CREATED: jdoe@finsdc3.demo / 005...
PSL assigned this run: 49/49
PSG assigned this run: 9/9
```
(`USER EXISTS:` instead of `USER CREATED:` just means it already existed and was topped up.)

**Then go to [§3 Verify](#3-verify-the-result) and [§4 Hand-off](#4-what-to-give-the-person).**

---

## 2. Bring an EXISTING user up to baseline (align)

For someone who **already has a login** (any username — e.g. an SSO teammate, or an older
account created outside this tool) and just needs full access. Identify them by **exact
Username, Email, or 15/18-char Id**:

```bash
DemoUserProvisioning/scripts/provision_demo_user.sh --existing bob.jones@finsdc3.demo   # username
DemoUserProvisioning/scripts/provision_demo_user.sh --existing bjones@salesforce.com    # email
DemoUserProvisioning/scripts/provision_demo_user.sh --existing 005am00001TAyBNAA1       # Id
```

**Additive only** — it assigns any missing PSLs/PSGs/group memberships and **never changes
the target's profile, role, or password.** The person keeps their existing login.

**Expected output:**
```
ALIGN TARGET: bob.jones@finsdc3.demo / 005... (additive — profile/role/password left unchanged)
PSL assigned this run: 12/12      # count varies — however many were missing
PSG assigned this run: 3/3
```

**If it aborts instead:**
- `ALIGN FAIL: no user matches "<x>"` — the identifier matched nobody. Check spelling, or
  look them up (see [§5](#5-troubleshooting)). Nothing was changed.
- `ALIGN CANDIDATE: <user> / <id>` lines followed by `ALIGN FAIL: N users match …` — the
  identifier is ambiguous (e.g. an email shared by two users). **Re-run with the exact
  Username or 18-char Id** shown in the candidate list. Nothing was changed.

**Then go to [§3 Verify](#3-verify-the-result).** (No new login to hand off — they keep theirs.)

---

## 3. Verify the result

Don't just trust the log — confirm the totals. Replace `<username>` with the real demo
username (for align, use the one printed on the `ALIGN TARGET:` line):

```bash
sf data query -o jdo-oe0sdd -q "SELECT COUNT(Id) FROM PermissionSetLicenseAssign WHERE Assignee.Username = '<username>'"
sf data query -o jdo-oe0sdd -q "SELECT COUNT(Id) FROM PermissionSetAssignment WHERE PermissionSetGroupId != null AND Assignee.Username = '<username>'"
```

**A full baseline is `49` licenses and `9` groups.** If either is short, see
[§5 Troubleshooting](#5-troubleshooting) — it is almost always license-seat exhaustion, not
a script failure.

---

## 4. What to give the person (create mode only)

- **Login URL:** https://storm-16a17dc388fbe6.demo.my.salesforce.com/
- **Username:** `<localpart>@finsdc3.demo`
- **Password:** `salesforce1` (unless you overrode it)
- Tell them: log in with username + password (**not** SSO / "Log in with Salesforce").

For **align** mode there's nothing to hand off — they use their existing login. If they had
a session open, have them **log out and back in** so the new permissions load.

---

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `sf org display` errors / "No authorization" | Not authenticated to the demo org | Re-run `sf org login web -o jdo-oe0sdd` as an admin ([§0](#0-one-time-setup-do-this-once-per-machine)) |
| `PSL FAIL: All <X> permission set licenses are in use` | That license is out of seats in the org (not a script bug) | Free seats (deactivate unused users) or expand the license, then run `DemoUserProvisioning/scripts/sync_demo_users.sh` to backfill everyone. Note: a seat-exhausted PSL also blocks any PSG that needs it, so the PSG count may fall short too. |
| Verify shows fewer than 49/9 | Seat exhaustion (above) | Same as above — it's org capacity, not the tool |
| `ALIGN FAIL: no user matches "<x>"` | Wrong/typo'd identifier | Look them up: `sf data query -o jdo-oe0sdd -q "SELECT Id, Username, Email FROM User WHERE Email = '<email>'"` then re-run with the exact Username or Id |
| `ALIGN FAIL: N users match …` (with candidates listed) | Identifier (usually an email) matches multiple users | Re-run `--existing` with the exact **Username** or **18-char Id** from the candidate list |
| `ERROR: invalid name …` | Name has quotes/apostrophes/odd chars | Use letters/spaces/hyphens/dots only, or omit the name |
| `ERROR: invalid identifier …` | `--existing` value has quotes/odd chars | Pass a clean Username, Email, or Id |
| `ERROR: invalid email …` | create-mode email is malformed | Provide a valid email like `jdoe@salesforce.com` |
| Person logs in but sees nothing new | Stale session | Have them log out and back in |
| `duplicate value found: <unknown>` on deploy | macOS case-insensitive path collision | Not part of provisioning; only relevant if deploying metadata — pass exact git casing |

---

## 6. Day-2 operations

- **Grant a new permission set to EVERY demo user at once:** add it to the
  `Demo_Standard_Access` permission set group and deploy it — it propagates to all demo
  users automatically, no per-user step. See [README](README.md#grant-new-access-to-all-demo-users).
- **Add a new permission-set *license* to everyone:** add its developer name to
  `template.json` **and** to the `PSL_NAMES` set in `apex/ProvisionDemoUser.apex` and
  `apex/SyncDemoUsers.apex`, then run `scripts/sync_demo_users.sh`.
- **Retire a user:** `DemoUserProvisioning/scripts/deactivate_demo_user.sh <username@finsdc3.demo>`
  (frees the base seat and PSL seats).
- **List all demo users:**
  ```bash
  sf data query -o jdo-oe0sdd -q "SELECT Name, Username, IsActive FROM User WHERE Id IN (SELECT UserOrGroupId FROM GroupMember WHERE Group.DeveloperName = 'Demo_Users')"
  ```

---

## 7. Using Claude Code instead (optional)

If you have Claude Code open in this repo, you can skip the commands and just ask — the
`provision-demo-user` skill runs and verifies the right flow for you:

- *"provision a demo user for jdoe@salesforce.com"* → create mode
- *"bring bob.jones@finsdc3.demo up to baseline"* → align mode

---

## 8. Reference

- **Quick reference:** [README.md](README.md)
- **Design & rationale** (footprint, seat math, security, the full 49-PSL list):
  [`docs/superpowers/specs/2026-09-24-demo-user-provisioning-design.md`](../docs/superpowers/specs/2026-09-24-demo-user-provisioning-design.md)
- **Who to contact:** Jose Sifontes (repo owner) for access, seat expansion, or anything
  this runbook doesn't cover.
