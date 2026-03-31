# Setup guide — DC Query to Table

## 1. Prerequisites

- **Salesforce org** with **Data Cloud** (or equivalent) in the **same** org as the deployment target.
- **API access** for `ConnectApi.CdpQuery` from Apex (see Salesforce Data Cloud + Apex documentation).
- Users who should see results need **Data Cloud query** permissions appropriate for your org (permission sets / Einstein / CDP roles).

## 2. Deploy

```bash
cd JDO/DC_Query_to_Table_LWC
sf project deploy start --source-dir force-app --target-org <alias> --wait 10
```

## 3. Apex access

Deploy includes permission set **DC Query to Table User** (`DC_Query_to_Table_User`), which grants **`DcQueryToTableController`**. Assign it to **standard users** who should see the table (or enable the same class under **Profile → Apex Class Access**). Without class access, users see *You do not have access to the Apex class* errors.

## 4. Add to a Lightning page

1. Open **Lightning App Builder** for an **app**, **home**, or **record** page.
2. Drag **DC Query to Table** onto the layout.
3. Set **Data Cloud SQL query** and options (see [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md)).
4. **Save** and **Activate** the page for the right apps and profiles.

### Record pages

Metadata currently allows **Account** record pages. To use another object, edit `dcQueryToTableLwc.js-meta.xml` → `<objects>` → add `<object>YourObject__c</object>` and redeploy.

## 5. SQL tips

- Prefer **SELECT** or **WITH … SELECT** only.
- Quote identifiers when needed: `"ssot__Individual__dlm"`.
- Test the same SQL in **Data Cloud Query Editor** or your org’s SQL tooling as the running user context.

## 6. Mobile

**Home** pages do not show custom components on **phone**. Use an **app** or **record** page for mobile users. See [../../docs/MOBILE_AND_FORM_FACTORS.md](../../docs/MOBILE_AND_FORM_FACTORS.md).

## 7. Security reminder

SQL is configured by admins in App Builder but executes as the **running user** subject to Data Cloud permissions. Restrict who can edit Lightning pages and who receives **Apex class** access.
