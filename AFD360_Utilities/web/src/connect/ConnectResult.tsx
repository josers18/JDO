import { useState } from "react";
import { ResponseValue, ViewSwitch, fieldLabel } from "./ResponseValue";
import { resourceId } from "./resourceOptions";
import type { WireEntry } from "../../../shared/types";

type Row = Record<string, unknown>;
const record = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const json = (v: unknown) => JSON.stringify(v, null, 2);
const scalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);
const priority = ["displayName", "label", "name", "developerName", "id", "status", "type"];
const familyColumns: Record<string, string[]> = {
  "Machine Learning": ["label", "modelType", "connectorType", "sourceType", "status", "type", "queryType"],
  "Data Streams": ["label", "status", "lastRunStatus", "lastRefreshDate", "totalRecords"],
  "Data Spaces": ["label", "name", "prefix", "status"],
  Segments: ["displayName", "segmentStatus", "lastSegmentMemberCount", "publishStatus", "dataSpace"],
  "Search Index": ["label", "searchType", "sourceDmoDeveloperName", "chunkDmoName", "indexRefreshedOn"],
  "Identity Resolutions": ["label", "lastJobStatus", "sourceProfiles", "totalUnifiedProfiles", "consolidationRate"],
  "Data Model Objects": ["label", "name", "category", "type", "status"],
  "Data Lake Objects": ["label", "name", "category", "status"],
  Connections: ["label", "name", "connectorType", "status"],
};

function cellText(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return `${value.length} items`;
  if (record(value)) return `${Object.keys(value).length} fields`;
  return String(value);
}

export function ConnectResult({
  entry,
  detail,
  family,
  next,
  firstPage,
}: {
  entry: WireEntry;
  family: string;
  next?: () => void;
  firstPage?: () => void;
  detail?: { key: string; open: (id: string) => void };
}) {
  const parameters = new URL(entry.url).searchParams.toString();
  const [raw, setRaw] = useState(false);
  const [limit, setLimit] = useState(25);
  const [recordRaw, setRecordRaw] = useState(false);
  const [selected, setSelected] = useState<Row>();
  const body = entry.responseBody;
  const collections = record(body) ? Object.entries(body).filter(([, v]) => Array.isArray(v)) : [];
  const [chosen, setChosen] = useState("");
  const collection = collections.find(([k]) => k === chosen) ?? collections[0];
  const rows: unknown[] = Array.isArray(body) ? body : ((collection?.[1] as unknown[]) ?? []);
  const records = rows.filter(record);
  const keys = new Set(records.slice(0, 25).flatMap((r) => Object.keys(r).filter((k) => scalar(r[k]))));
  const columns = [
    ...new Set([
      ...(familyColumns[family] ?? []).filter((k) => keys.has(k)),
      ...priority.filter((k) => keys.has(k)),
      ...keys,
    ]),
  ].slice(0, 5);
  const code = "max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-tint p-3 font-mono text-xs";
  const namedRecord =
    record(body) &&
    ["id", "label", "name", "developerName", "apiName", "displayName"].some((k) => typeof body[k] === "string");
  const isCollection = Array.isArray(body) || (!!collection && !namedRecord);
  const envelope =
    record(body) && isCollection ? Object.fromEntries(Object.entries(body).filter(([, v]) => !Array.isArray(v))) : {};

  const selectedId = detail && selected && resourceId(selected, detail.key, entry.url);
  return (
    <section aria-label="API response" className="min-w-0 space-y-3 rounded-xl border border-line bg-surface p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold">Response</h2>
        <span className={`font-mono text-xs ${(entry.status ?? 500) < 400 ? "text-ok" : "text-err"}`}>
          HTTP {entry.status ?? "—"} · {entry.durationMs ?? 0} ms
        </span>
        {body !== undefined && <ViewSwitch scope="Response" raw={raw} setRaw={setRaw} />}
      </header>
      {parameters && (
        <div aria-label="Submitted parameters" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
          <span>Sent</span>
          {Array.from(new URLSearchParams(parameters)).map(([name, value], i) => (
            <code key={i} className="max-w-full break-all rounded-full bg-sent px-2 py-0.5 text-sent-ink">
              {name}={value}
            </code>
          ))}
        </div>
      )}
      {body === undefined ? (
        <p className="text-sm text-ink-3">No response body.</p>
      ) : raw ? (
        <pre className={code}>{json(body)}</pre>
      ) : isCollection ? (
        <>
          {collections.length > 1 && (
            <select
              aria-label="Response collection"
              className="rounded border border-line bg-surface p-1 text-sm"
              value={collection?.[0]}
              onChange={(e) => {
                setChosen(e.target.value);
                setSelected(undefined);
                setLimit(25);
              }}
            >
              {collections.map(([key]) => (
                <option key={key}>{key}</option>
              ))}
            </select>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
            <span>
              {rows.length} {collection ? fieldLabel(collection[0]) : "items"} in this response
              {!firstPage &&
                !new URL(entry.url).pathname.endsWith("/machine-learning/configured-models") &&
                record(body) &&
                typeof body.totalSize === "number" &&
                ` · ${body.totalSize.toLocaleString()} total`}
            </span>
            {next && (
              <button className="rounded border border-line px-2 py-1 font-semibold text-ink" onClick={next}>
                Next page
              </button>
            )}
          </div>
          {rows.length === 0 && firstPage && (
            <div className="rounded-lg bg-tint p-3 text-sm">
              This offset skipped {new URLSearchParams(parameters).get("offset")} records. Salesforce returned an empty
              page.{" "}
              <button onClick={firstPage} className="font-semibold underline">
                Show first page with these filters
              </button>
            </div>
          )}
          {records.length === rows.length && columns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th className="border-b border-line px-2 py-2 font-medium text-ink-3" key={c}>
                        {fieldLabel(c)}
                      </th>
                    ))}
                    <th>
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, limit).map((row, i) => (
                    <tr key={i} className="border-b border-line">
                      {columns.map((c) => (
                        <td key={c} className="max-w-48 truncate px-2 py-2" title={cellText(row[c])}>
                          {cellText(row[c])}
                        </td>
                      ))}
                      <td>
                        <button
                          className="rounded px-2 py-1 font-medium underline"
                          aria-label={`Inspect row ${i + 1}`}
                          onClick={() => {
                            setSelected(row);
                            setRecordRaw(false);
                          }}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ResponseValue value={rows} />
          )}
          {records.length === rows.length && columns.length > 0 && rows.length > limit && (
            <button className="text-sm underline" onClick={() => setLimit(limit + 50)}>
              Show more rows
            </button>
          )}
          {Object.keys(envelope).length > 0 && (
            <details className="rounded-lg border border-line p-2">
              <summary className="cursor-pointer text-sm font-medium">Response metadata</summary>
              <ResponseValue value={envelope} />
            </details>
          )}
          {selected && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="mr-auto text-sm font-semibold">Record detail</h3>
                <ViewSwitch scope="Record" raw={recordRaw} setRaw={setRecordRaw} />
                {detail && selectedId && (
                  <button className="text-xs underline" onClick={() => detail.open(selectedId)}>
                    Open detail request
                  </button>
                )}
                <button className="text-xs underline" onClick={() => setSelected(undefined)}>
                  Close detail
                </button>
              </div>
              {recordRaw ? <pre className={code}>{json(selected)}</pre> : <ResponseValue value={selected} />}
            </div>
          )}
        </>
      ) : (
        <ResponseValue value={body} />
      )}
    </section>
  );
}
