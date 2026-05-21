# Troubleshooting

Common failure modes and how to recover. If you hit something that
isn't here, check `output/run-<ts>/manifest.json` — it captures every
non-trivial error per object per phase.

## 1. Bulk job failures

Symptom: a Wave-D or Wave-E sObject reports `failed > 0` in the run
summary. The runner exits with code 2.

### Inspect the failure

The runner saves Bulk job output in `output/run-<ts>/<sobject>.csv` and
the failure report at `output/run-<ts>/bulkapi-failures-<sobject>.csv`.
For deeper diagnostics, query the Bulk job directly:

```bash
sf data bulk results \
    --target-org jdo-fw51xz \
    --job-id 750a000000XYZAB
```

The job-id is in the runner's stderr or in
`output/run-<ts>/manifest.json` under
`object_status.<SObject>.bulk_job_id`.

### Failure CSV format

Bulk API 2.0 writes a failure file with the original record fields plus
two added columns:

```csv
External_ID__c,Name,...,sf__Id,sf__Error
HYDRATE-FA-000123,Cumulus Brokerage - 4421,...,,FIELD_CUSTOM_VALIDATION_EXCEPTION:...
```

`sf__Error` carries the platform error code + message.

### Common record-level errors

| Error code | Likely cause | Fix |
|---|---|---|
| `FIELD_CUSTOM_VALIDATION_EXCEPTION` | A custom validation rule fired (most often the FA Role write-once rule) | Generator emitted a row that exists with different values; either reset or extend the External_ID__c upsert pattern |
| `INVALID_CROSS_REFERENCE_KEY` | Parent External-ID didn't exist when the child loaded | Earlier wave didn't load the parent; check Wave order; check that Phase 3 queryback found the parent |
| `FIELD_INTEGRITY_EXCEPTION` | Wrong Id type passed to a polymorphic field (e.g. Account Id where Contact Id was required) | This is the `want="contact"` vs `want="id"` resolver bug — check `IdResolver.resolve()` callsites |
| `STRING_TOO_LONG` | A generator emitted a value longer than the field's maxLength (e.g. very long Faker company name) | Truncate in the generator or extend the field |
| `INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST` | Picklist value not in the org's allowed set | Add to `fieldmap.py::_PICKLIST_VALUES` |
| `DUPLICATE_VALUE` | A unique field collision | Re-running without `--append`? The External_ID upsert path should make this impossible — investigate which field |

## 2. FSC version drift / silently dropped fields

Symptom: a row "loaded" in the run summary, but a Salesforce report
shows `null` in fields the generator should have populated. The dashboard
shows fewer values than expected.

### Diagnose

Check the manifest for the `dropped_fields` section:

```json
{
  "object_status": {
    "FinServ__FinancialAccount__c": {
      "loaded": 12000,
      "failed": 0,
      "dropped_fields": [
        "FinServ__OpenedDate__c",
        "FinServ__OwnershipType__c",
        "FinServ__APR__c"
      ]
    }
  }
}
```

If a field that *should* be in the org is in `dropped_fields`, Phase 0
describe didn't see it. That usually means the field name is wrong for
this org's FSC version — it was renamed.

### Fix

Add the rename to `customer_hydration/fieldmap.py::_FIELD_RENAMES`:

```python
"FinServ__FinancialAccount__c": {
    ...
    "FinServ__APR__c": "FinServ__InterestRate__c",  # Plan-N: org renamed
    ...
}
```

If the field doesn't exist at all in the org and there's no equivalent,
map it to `None` to drop it cleanly:

```python
"FinServ__FinancialAccount__c": {
    "FinServ__ProductCode__c": None,  # not in this org's FSC version
}
```

## 3. Group Builder API surface differences

Symptom: Phase 5 Apex script logs an error about
`FinServ.GroupAssignmentBatch` being unreachable.

### Background

The FSC Group Builder API has shifted between FSC managed-package
versions. The documented call (`FinServ.GroupAssignmentBatch.executeBatch`)
isn't always reachable.

### Workaround

The Apex script (`apex/post_load_wireup.apex`) tries the documented
call first, then falls back to a custom `FscGroupRollupBatch` class
shipped in `force-app/main/default/classes/`. The fallback is auto-deployed
by `customer_hydration/phase5/apex_wireup.py` before the script runs.

If both fail in your org, comment out the Group Builder kickoff and
rely on the standard FSC declarative rollup logic, which fires on
record changes anyway.

## 4. Data Cloud auth issues

Symptom: Phase 5.5 fails with HTTP 401 from the Data Cloud REST API.

### Diagnose

```bash
sf org display --target-org jdo-fw51xz --verbose --json | jq .result.accessToken
```

If this returns `null` or a 401-causing token, the session expired.

### Fix

Re-authenticate:

```bash
sf org login web --alias jdo-fw51xz
```

Then re-run with `--data-cloud-only`:

```bash
python hydrate.py hydrate \
    --target-org jdo-fw51xz \
    --data-cloud-only \
    --allow-production
```

`--data-cloud-only` skips Phases 0-5 and runs Phase 5.5 in isolation.
If that also fails, the org may not have any Data Streams configured —
which is not an error, the manifest will record `streams_discovered: 0`
and the runner exits 0.

## 5. Network timeouts during bulk waves

Symptom: a Wave-D or Wave-E job hangs at `InProgress` for >30 min, then
the runner aborts that job.

### Mitigation

Reduce parallelism so each job has more bandwidth and fewer competing
sf-CLI subprocesses:

```bash
python hydrate.py hydrate --target-org jdo-fw51xz --parallel 1 ...
```

This serializes the wave's CSVs. Slower wall-clock but more reliable
when the network is flaky.

You can also extend the per-job wait time. The `bulk_upsert` wrapper
in `customer_hydration/loader/_legacy.py` passes `--wait 30` to
`sf data import bulk`. Bump that constant if needed.

## 6. Manifest field meanings

`output/run-<ts>/manifest.json` is the forensic trail. Key fields:

```json
{
  "run_id": "run-2026-05-21T1430",
  "seed": 42,
  "exit_code": 0,
  "completed_waves": ["A", "B", "C", "D", "E", "F", "G"],
  "in_progress_wave": null,
  "object_status": {
    "Account": {
      "loaded": 14012,
      "failed": 0,
      "duration_s": 252,
      "bulk_job_id": "750a000000XYZAB",
      "dropped_fields": []
    },
    "FinServ__FinancialAccount__c": { ... },
    "DataCloud_Stream_Refresh": {
      "started_at": "2026-05-21T15:18:42Z",
      "streams_discovered": 14,
      "streams_matched_to_hydrated_objects": 11,
      "streams_triggered": 11,
      "stream_runs": [
        {"stream_api_name": "Account_DataStream", "source_object": "Account",
         "run_id": "0lN...", "status": "InProgress", "triggered_at": "..."}
      ],
      "stream_trigger_failures": []
    }
  },
  "data_cloud_stream_failures": []
}
```

| Key | Meaning |
|---|---|
| `run_id` | `run-<ISO-timestamp>` — unique per `hydrate` invocation |
| `seed` | The RNG seed used for this run |
| `exit_code` | 0 = success, 2 = >=1 wave had failures |
| `completed_waves` | Ordered list of waves that finished cleanly |
| `in_progress_wave` | `null` if exited cleanly; otherwise the wave at crash |
| `object_status.<X>.loaded` | Records the Bulk job reported as processed |
| `object_status.<X>.failed` | Records the Bulk job reported as failed |
| `object_status.<X>.dropped_fields` | Logical fields the generator emitted that Phase 0 dropped |
| `data_cloud_stream_failures` | Phase 5.5 trigger failures (don't cause non-zero exit) |

## 7. Apex script compile errors

Symptom: Phase 5 fails with `sf apex run` error about a missing field.

### Diagnose

The script (`apex/post_load_wireup.apex`) references FSC fields like
`FinServ__AUM__c` and `FinServ__TotalLiabilities__c`. If your org's FSC
version has renamed or removed those fields, anonymous-Apex compilation
fails before any code runs.

### Fix

Use describe to confirm the field exists:

```bash
sf sobject describe --target-org jdo-fw51xz --sobject Account \
    | jq '.fields[].name' | grep -i AUM
```

Edit `apex/post_load_wireup.apex` to use the existing field name (or
remove the reference if the field has been collapsed into another).

Plan 5 / Wart 1 noted that this org makes several rollup fields
read-only / declaratively-rolled-up, so the manual write loop was
removed entirely — the Group Builder kickoff alone triggers the
standard rollup. If your fork needs writable rollups, restore the loop
from `git show 7602756^:apex/post_load_wireup.apex`.

## 8. Resume re-runs already-completed waves

Symptom: `hydrate.py resume` re-attempts every wave, not just the
crashed one. RTT is wasted but the data isn't broken.

### Background

Plan 3's `resume` reads `in_progress_wave` from `checkpoint.json` and
restarts from there, but it also re-runs *prior* waves. The
`External_ID__c` upsert makes those re-runs no-ops at the platform
level — but the `sf data import bulk` subprocess still runs.

### Workaround

Manually edit `output/run-<ts>/checkpoint.json`:

```json
{
  "run_id": "run-2026-05-21T1430",
  "completed_waves": ["A", "B", "C", "D"],
  "in_progress_wave": "E",
  ...
}
```

Move waves you don't want re-run into `completed_waves`. The runner's
resume logic skips them.

The proper fix is in a future plan — pass `completed_waves` through to
the wave executor so it skips at the wave-engine level, not the
manifest level.

## 9. Account RT discovery

Symptom: Wave A fails because `Account.RecordType` lookup returned no
match.

### Background

Different FSC versions use different DeveloperName for the business
Account record type. Both `Business_Account` and `IndustriesBusiness`
exist in different orgs.

### Fix

The runner's Phase 0 describe step prefers `IndustriesBusiness` (verified
in `jdo-fw51xz`) and falls back to `Business_Account`. If neither
exists, it raises a clear error.

To check what's available in a target org:

```bash
sf data query --target-org $TARGET \
    --query "SELECT DeveloperName, SobjectType FROM RecordType WHERE SobjectType = 'Account'"
```

Add the new DeveloperName to the runner's discovery list in
`customer_hydration/runner_p5.py` (search for `_resolve_business_rt`).

## 10. CampaignMember requires ContactId

Symptom: Wave E `CampaignMember` rows fail with
`FIELD_INTEGRITY_EXCEPTION` mentioning `ContactId` or `LeadId`.

### Background

`CampaignMember` requires either `ContactId` or `LeadId`. The generator
emits `ContactId` for HYDRATE-* customers, but the value at generation
time is just the parent Account's External-ID — the auto-Contact under
a Person Account doesn't have a deterministic external-id we can write.

### How it's resolved

After Wave A loads, `IdResolver._populate_person_account_contacts()`
runs:

```sql
SELECT Id, AccountId, Account.External_ID__c FROM Contact
WHERE Account.External_ID__c LIKE 'HYDRATE-%'
  AND Account.IsPersonAccount = true
```

That populates `IdResolver.contact_id_by_account_external_id`. Wave-E's
CampaignMember CSV uses `RESOLVE:HYDRATE-RT-NNN` markers; the resolver
rewrites them to `003*` Contact Ids via `resolve(..., want="contact")`.

### If it still fails

- Verify Wave A actually loaded (`status` subcommand or SOQL count).
- Verify the resolver populated the map — check the runner's Wave-A
  query-back log line. If the count is 0, the SOQL query may have been
  blocked by FLS / sharing.
- Verify the resolver was called with `want="contact"`. The
  `want="id"` default returns Account Ids and breaks ContactId fields
  with `FIELD_INTEGRITY_EXCEPTION`.

## 11. sf CLI "update available" stderr warning

Symptom: a Wave-D or Wave-E job reports `failed > 0` in the runner
summary, but `sf data bulk results` says the job succeeded with 0
failures.

### Background

Plan 3's `bulk_upsert` wrapper interpreted any non-empty stderr as a
job failure. Newer `sf` CLI versions print a "@salesforce/cli update
available" message to stderr on every invocation.

### Fix

Plan 5 fixed this by parsing the JSON payload's `result.numberRecordsFailed`
as the authoritative success signal, and ignoring stderr unless the
exit code is non-zero. If you see this on `runner_p3.py` directly (rare
— the CLI dispatches to `runner_p5.py`), upgrade or run the work via
the `runner_p5` entry point.

## Cross-references

- [ARCHITECTURE.md](ARCHITECTURE.md) — pipeline phases + ID resolver
- [DATA_MODEL.md](DATA_MODEL.md) — every object's fields
- [IDEMPOTENCY.md](IDEMPOTENCY.md) — idempotency guarantees + reset semantics
- [HOW_TO.md](HOW_TO.md) — CLI cookbook
- README §Plan-N status — known warts each plan deferred to the next
