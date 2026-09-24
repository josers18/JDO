---
name: provision-demo-user
description: >-
  Provision a new demo user in the finsdc3.demo Salesforce org (alias jdo-oe0sdd),
  cloning sarah.smith's full access (9 permission set groups, 49 permission-set
  licenses, Central Sales role, WebMessagingQueue, Demo_Users group) and setting a
  shared demo password. Use this whenever someone wants to create, provision, set up,
  onboard, or "spin up" a demo user / demo login / demo account for the finsdc3 (JDO)
  demo org — even if they only give a name and email and don't say the word "provision".
  ALSO use to bring an EXISTING org user up to the full demo baseline (align mode): "bring
  bob up to baseline", "give <existing user> full access", "uplift/fix/top-up <user>'s
  permissions", "make sure <user> has everything Sarah has". Triggers on things like
  "create a demo user for jdoe@salesforce.com", "I need a demo login for Jane Doe",
  "onboard a new person on the demo org", "set up a demo account with the same access as
  Sarah", "give <name> a demo user", or "bring an existing user up to the demo baseline".
  Do NOT use for creating real production users or for non-JDO orgs.
---

# Provision a demo user (finsdc3.demo)

This runs the repo's `DemoUserProvisioning/` tooling against the demo org. It has two modes:

- **create** (default) — create one demo user that is a full clone of
  `sarah.smith@finsdc3.demo`, so a whole team can each have their own login instead of
  sharing one user (which causes session collisions).
- **align** (`--existing`) — bring an **already-existing** org user (any username, e.g. an
  SSO teammate or an older non-standard login) up to the same full baseline. Additive
  only: it assigns the 49 PSLs, 9 PSGs, WebMessagingQueue, and Demo_Users group, and
  **never touches the target's profile, role, or password**. Use this when someone asks to
  "bring <user> up to baseline" or "give an existing user full access".

The heavy lifting lives in an idempotent Apex script; your job is to gather the inputs, run
it, confirm the result, and report the outcome. You can run either mode directly from the
conversation — the user does not have to run the script themselves.

## Prerequisites (check first, fail fast)

1. **Salesforce CLI authenticated to the demo org.** Verify:
   `sf org display -o jdo-oe0sdd` should succeed. If it fails, tell the user to run
   `sf org login web -o jdo-oe0sdd` (or authenticate the `jdo-oe0sdd` alias) and stop.
2. **Run from the repo root** so the relative script path resolves.

If a prerequisite is missing, say exactly what's wrong and what the user should run —
don't guess around it.

## Inputs

- **Email (required):** the person's real Salesforce email, e.g. `jdoe@salesforce.com`.
  The demo username becomes the local part + `@finsdc3.demo` (→ `jdoe@finsdc3.demo`), and
  `User.Email` is set to the real email. Extract this from the request.
- **First / last name (optional):** if the user gives a name, pass it — it sets the
  display name. If omitted, the script derives first/last from the email local part
  (splitting on `.`). Names may contain letters, spaces, hyphens, and dots only — the
  script rejects quotes/apostrophes (so an "O'Brien" would be refused; drop the
  apostrophe or omit the name).
- **Password (optional):** defaults to `salesforce1`. Override only if the user asks, via
  the `DEMO_USER_PASSWORD` environment variable.

## Steps

1. **Run the provisioning script** from the repo root.

   **Create a new demo user** (the person doesn't have a login yet):
   ```bash
   DemoUserProvisioning/scripts/provision_demo_user.sh <email> [First] [Last]
   ```
   Examples:
   - `DemoUserProvisioning/scripts/provision_demo_user.sh jdoe@salesforce.com Jane Doe`
   - `DemoUserProvisioning/scripts/provision_demo_user.sh jdoe@salesforce.com` (name derived)

   **Align an existing user** (already has a login; bring them up to baseline):
   ```bash
   DemoUserProvisioning/scripts/provision_demo_user.sh --existing <username|email|Id>
   ```
   Examples:
   - `DemoUserProvisioning/scripts/provision_demo_user.sh --existing bob.jones@finsdc3.demo`
   - `DemoUserProvisioning/scripts/provision_demo_user.sh --existing bjones@salesforce.com`
   - `DemoUserProvisioning/scripts/provision_demo_user.sh --existing 005XXXXXXXXXXXXXXX`

   The target is resolved by exact **Username OR Email OR Id**. If the identifier matches
   **no user**, the run aborts with `ALIGN FAIL: no user matches "<id>"`. If it matches
   **more than one**, the run lists each candidate as `ALIGN CANDIDATE: <username> / <id>`
   then aborts — re-run with the exact username or 18-char Id from that list.

   Both modes are idempotent — re-running just tops up any missing grants, so it's safe to
   run again if something looked off.

2. **Read the debug output.** Success looks like `PSL assigned this run: N/49` and
   `PSG assigned this run: N/9`, preceded by one of:
   - create mode: `USER CREATED: <username> / <id>` (new) or `USER EXISTS: <username>` (top-up).
   - align mode: `ALIGN TARGET: <username> / <id> (additive — profile/role/password left unchanged)`.
     An `ALIGN FAIL:` line means the identifier matched zero or many users — see step 1; nothing was changed.

   A fully-clean baseline is **9 PSGs and 49 licenses**. Lines like
   `PSL FAIL: All <X> permission set licenses are in use` mean that license is out of
   seats in the org — not a script error. Note which ones failed; a seat-exhausted license
   also blocks any permission set group that requires it.

3. **Verify the result** (don't just trust the log):
   ```bash
   sf data query -o jdo-oe0sdd -q "SELECT Assignee.Username usr, COUNT(Id) c FROM PermissionSetLicenseAssign WHERE Assignee.Username = '<username>' GROUP BY Assignee.Username"
   sf data query -o jdo-oe0sdd -q "SELECT Assignee.Username usr, COUNT(Id) c FROM PermissionSetAssignment WHERE PermissionSetGroupId != null AND Assignee.Username = '<username>' GROUP BY Assignee.Username"
   ```
   In align mode, use the resolved username from the `ALIGN TARGET:` line as `<username>`.
   Expect 49 licenses and 9 PSGs. If either is short, report the specific seat-exhausted
   licenses from step 2 — the fix is org capacity (free/expand seats), not the script. Once
   seats free up, `DemoUserProvisioning/scripts/sync_demo_users.sh` backfills all demo users.

4. **Report to the user**, concisely:
   - **create mode:** login username (`<localpart>@finsdc3.demo`) and password
     (`salesforce1` unless overridden).
   - **align mode:** the resolved target (`<username> / <id>`), and confirm you left their
     profile/role/password unchanged. No new login is issued — they keep their existing one.
   - Login URL: `https://storm-16a17dc388fbe6.demo.my.salesforce.com/`.
   - PSG/license counts, and any seat-blocked licenses if it wasn't a full 9/49 clone.

## Related commands (mention if relevant, don't run unprompted)

- Retire a demo user: `DemoUserProvisioning/scripts/deactivate_demo_user.sh <username@finsdc3.demo>`
- Backfill a newly-added license to every demo user: `DemoUserProvisioning/scripts/sync_demo_users.sh`
- Grant a new permission set to ALL demo users at once: add it to the
  `Demo_Standard_Access` permission set group (see `DemoUserProvisioning/README.md`) — it
  propagates automatically; no per-user step.

## Notes

- This only ever creates and assigns; it never deletes access. Deactivation is a separate,
  explicit command.
- Full design and rationale: `DemoUserProvisioning/README.md` and
  `docs/superpowers/specs/2026-09-24-demo-user-provisioning-design.md`.
