# Requirements

What the org and users need for **DC AgentForce Output** to work.

**Reading order:** [INDEX.md](INDEX.md) → [DEPLOY.md](DEPLOY.md) → this page → [SETUP_GUIDE.md](SETUP_GUIDE.md).

---

## Salesforce edition and features

- **Lightning Experience** — LWC runs on Lightning record, app, and home pages.
- **Flows** — At least one **autolaunched** flow the component can start.
- **Einstein / Agentforce / Gen AI** (as applicable) — Your flow must include the prompt or orchestration steps your product uses. This package does not ship a production prompt; the sample flow is a stub.

---

## API version

Project targets **API 66.0** (`sfdx-project.json`). Deploy to an org that supports that API level (or adjust the project if your policy differs).

---

## Permissions

| Area | Requirement |
|------|-------------|
| **Flow** | Users need permission to **run** the autolaunched flow (via profile/permission set / flow access as your org configures). |
| **Record access** | If **Pass record to flow** is on, the running user must be able to read the record (Apex uses `WITH USER_MODE` for the Id query). |
| **Models API feedback** | Thumbs call `aiplatform.ModelsAPI.submitFeedback`. Users need the appropriate **Einstein / AI** permissions your org assigns for feedback (often bundled with Agentforce / Gen AI access). |

---

## Static resources

- **marked** — UMD bundle for Markdown. Included in this project. Required when **Output format** is **markdown** or **auto** detects Markdown.

---

## Browser / UX

- **Clipboard** — Copy uses modern clipboard APIs with fallbacks; some orgs restrict clipboard in nested modals; the **copy modal** path exists for that case.
- **Print** — Uses a hidden iframe; popup blockers can affect the blob-URL fallback window.

---

## Flow design rules

1. **Record input** API name must match **Flow input: record variable** in App Builder (default `recordID`).
2. **Record** object type in Flow must match the **record page** object (e.g. Account on Account pages).
3. **Text output** for display must match **Flow output: response variable** (default `promptResponse`).
4. Optional **Text output** for **generation Id** must match **Flow output: generation Id variable** if you want thumbs.

---

## See also

- [SETUP_GUIDE.md](SETUP_GUIDE.md) — deploy and App Builder steps
- [FLOW_GUIDE.md](FLOW_GUIDE.md) — variable contract in detail
