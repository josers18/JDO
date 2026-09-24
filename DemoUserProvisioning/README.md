# Demo User Provisioning (finsdc3.demo)

Central, repeatable provisioning of demo users cloned from `sarah.smith@finsdc3.demo`.
Org alias: `jdo-oe0sdd`. Spec: `../docs/superpowers/specs/2026-09-24-demo-user-provisioning-design.md`.

## Provision a user
    scripts/provision_demo_user.sh jdoe@salesforce.com            # name derived from email
    scripts/provision_demo_user.sh jdoe@salesforce.com Jane Doe   # explicit display name
Creates `jdoe@finsdc3.demo` (Standard User / Central Sales), assigns the 9 PSGs, 49
permission-set licenses, the WebMessagingQueue, and the Demo_Users group, and sets the
shared password. Idempotent — safe to re-run. Password defaults to `salesforce1`
(override with `DEMO_USER_PASSWORD=...`). Optional `[firstName] [lastName]` set the
display name (letters/spaces/hyphens/dots only — no quotes); omit to derive from the email.

## Bring an existing user up to baseline (align mode)
    scripts/provision_demo_user.sh --existing bob.jones@finsdc3.demo   # by username
    scripts/provision_demo_user.sh --existing bjones@salesforce.com    # by email
    scripts/provision_demo_user.sh --existing 005XXXXXXXXXXXXXXX        # by 15/18-char Id
Use this for a user who **already exists** in the org (any username — e.g. an SSO teammate
or an older non-standard login) and just needs the full access baseline. The target is
resolved by exact **Username OR Email OR Id**; if it matches zero or multiple users the run
aborts (multiple matches are listed as `ALIGN CANDIDATE:` lines — re-run with an exact one).
Additive only: assigns the 9 PSGs, 49 PSLs, WebMessagingQueue, and Demo_Users group, and
**never changes the target's profile, role, or password**. Idempotent — safe to re-run.

**Claude Code skill:** this repo ships a `provision-demo-user` skill
(`.claude/skills/provision-demo-user/`) — just ask Claude to "provision a demo user for
jdoe@salesforce.com" or "bring bob.jones up to baseline" and it runs and verifies the right
flow for you.

## Grant new access to ALL demo users
- **A permission set:** add it to the `Demo_Standard_Access` permission set group
  (edit `force-app/main/default/permissionsetgroups/Demo_Standard_Access.permissionsetgroup-meta.xml`,
  `sf project deploy start -d force-app/main/default/permissionsetgroups -o jdo-oe0sdd`).
  Propagates to every demo user automatically — no per-user step.
- **A permission-set license:** add its developer name to `template.json` **and** to the
  `PSL_NAMES` set in `apex/SyncDemoUsers.apex` and `apex/ProvisionDemoUser.apex`, then run
  `scripts/sync_demo_users.sh` to backfill existing users.

## Retire a user
    scripts/deactivate_demo_user.sh jdoe@finsdc3.demo

## List demo users
    sf data query -o jdo-oe0sdd -q "SELECT Name, Username, IsActive FROM User WHERE Id IN (SELECT UserOrGroupId FROM GroupMember WHERE Group.DeveloperName = 'Demo_Users')"

## Notes
- Login is username + password (not SSO). New users do not reuse Sarah's FederationIdentifier.
- The shared password is a low-sensitivity demo credential; override per run with `DEMO_USER_PASSWORD`.
- Base Salesforce license had 458 free seats as of 2026-09-24.
- `sync_demo_users.sh` assigns in a single Apex transaction; if the demo-user pool ever grows into the hundreds and a new license is added, chunk the sync (per-user or batched) to stay under the 10,000-row DML limit.
