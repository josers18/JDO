import { useCallback, useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowRight, Asterisk, BookOpen, CircleDashed, GitBranch, RotateCcw, Search, Send } from "lucide-react";
import {
  buildConnectRequest,
  editConnectParameter,
  nextConnectPage,
  fieldValue,
  operationKey,
  type ConnectCatalog,
  type ConnectField,
  type ConnectInput,
  type ConnectOperation,
} from "../../../shared/connect";
import type { OrgSummary, OrgsResponse, WireEntry } from "../../../shared/types";
import { maskBody, maskUrl } from "../../../shared/redaction";
import { WirePanel } from "../chat/WirePanel";
import { connectLookup, lookupParameters } from "../../../shared/connectLookup";
import { CustomerRecordPicker } from "./CustomerRecordPicker";
import { ResourcePicker } from "./ResourcePicker";
import { callConnect } from "./resourceOptions";
import { ConnectResult } from "./ConnectResult";

const docs = "https://developer.salesforce.com/docs/data/connectapi/references/spec";
const inputClass = "w-full min-w-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink";
const actionClass =
  "inline-flex items-center gap-2 rounded-lg bg-action px-3 py-2 text-sm font-semibold text-action-ink disabled:opacity-50";
const quietClass = "rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-tint";
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function HelpText({ text }: { text: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <span>{children}</span>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="underline">
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function Requirement({ field }: { field: Pick<ConnectField, "required" | "conditional"> }) {
  const label = field.required ? "Required" : field.conditional ? "Conditional" : "Optional";
  const Icon = field.required ? Asterisk : field.conditional ? GitBranch : CircleDashed;
  const tone = field.required
    ? "border-err/45 bg-err/15"
    : field.conditional
      ? "border-recv-line bg-recv text-recv-ink"
      : "border-sent-line bg-sent text-sent-ink";
  return (
    <span
      className={`ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 align-middle font-sans text-[11px] font-semibold leading-tight ${tone}`}
    >
      <Icon aria-hidden size={12} strokeWidth={2.25} className={field.required ? "text-err" : undefined} />
      {label}
    </span>
  );
}

function InputGroups<T extends ConnectField>({
  fields,
  render,
  values,
}: {
  fields: T[];
  render: (field: T) => React.ReactNode;
  values: Record<string, string>;
}) {
  const prominent = fields
    .filter((f) => f.required || f.conditional)
    .sort((a, b) => Number(!!b.required) - Number(!!a.required));
  const optional = fields.filter((f) => !f.required && !f.conditional);
  const used = optional.filter((f) => !!values[f.name]).length;
  return (
    <>
      {prominent.length > 0 && <div className="grid gap-3 2xl:grid-cols-2">{prominent.map(render)}</div>}
      {optional.length > 0 && (
        <details open={!prominent.length && optional.length <= 6} className="rounded-lg border border-line">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-ink-2">
            Optional inputs ({optional.length}){used > 0 && <span className="ml-2 font-normal">{used} filled</span>}
          </summary>
          <div className="grid gap-3 border-t border-line p-3 2xl:grid-cols-2">{optional.map(render)}</div>
        </details>
      )}
    </>
  );
}

function Field({
  field,
  value,
  change,
}: {
  field: ConnectField & { location?: string };
  value: string;
  change: (v: string) => void;
}) {
  const id = useId();
  const options = field.type === "boolean" ? ["true", "false"] : field.enum;
  const [custom, setCustom] = useState(false);
  const customValue = !!field.presets && (custom || (!!value && !field.presets.includes(value)));
  if (field.itemEnum) {
    const items: (string | number)[] = value ? JSON.parse(value) : [];
    function update(index: number, next: string) {
      const selected = items.slice();
      if (next === "") selected.splice(index, 1);
      else selected[index] = field.itemEnum!.find((item) => String(item) === next)!;
      change(selected.length ? JSON.stringify(selected) : "");
    }
    return (
      <fieldset className="min-w-0 space-y-1">
        <legend className="font-mono text-xs font-semibold">
          {field.name}
          <Requirement field={field} />
          {field.location && (
            <span className="ml-1 font-sans text-[11px] font-normal text-ink-3">{field.location}</span>
          )}
        </legend>
        {[...items, ""].map((item, i) => (
          <select
            key={i}
            className={inputClass}
            aria-required={!!field.required && i === 0}
            aria-label={`${field.name} value ${i + 1}`}
            value={String(item)}
            onChange={(e) => update(i, e.target.value)}
          >
            <option value="">
              {i < items.length ? "Remove value" : items.length ? "Add another value…" : "Choose…"}
            </option>
            {field.itemEnum!.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ))}
        <div className="text-xs text-ink-3">
          <HelpText text={field.description} />
        </div>
      </fieldset>
    );
  }
  const json = field.type === "array" || field.type === "object";
  const sql = field.name.toLowerCase() === "sql";
  return (
    <div className="block min-w-0 space-y-1">
      <label htmlFor={id} className="block break-words font-mono text-xs font-semibold">
        {field.name}
        <Requirement field={field} />
        {field.location && <span className="ml-1 font-sans text-[11px] font-normal text-ink-3">{field.location}</span>}
      </label>
      {field.presets ? (
        <select
          id={id}
          aria-required={!!field.required}
          aria-label={field.name}
          className={inputClass}
          value={customValue ? "__custom__" : value}
          onChange={(e) => {
            const other = e.target.value === "__custom__";
            setCustom(other);
            change(other ? "" : e.target.value);
          }}
        >
          <option value="">Choose…</option>
          {field.presets.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value="__custom__">Custom value…</option>
        </select>
      ) : options ? (
        <select
          id={id}
          aria-required={!!field.required}
          aria-label={field.name}
          className={inputClass}
          value={value}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">Choose…</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : json || sql ? (
        <textarea
          id={id}
          aria-required={!!field.required}
          rows={sql ? 5 : 2}
          spellCheck={false}
          className={inputClass + " font-mono"}
          value={value}
          placeholder={sql ? "SELECT …" : field.type === "array" ? '["value"]' : "{}"}
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <input
          id={id}
          aria-required={!!field.required}
          className={inputClass}
          value={value}
          autoComplete="off"
          type={
            /secret|password|apiKey/i.test(field.name)
              ? "password"
              : ["integer", "number"].includes(field.type)
                ? "number"
                : "text"
          }
          step={field.type === "integer" ? 1 : "any"}
          placeholder={field.default == null ? undefined : String(field.default)}
          onChange={(e) => change(e.target.value)}
        />
      )}
      {customValue && (
        <input
          aria-required={!!field.required}
          aria-label={`Custom ${field.name}`}
          className={inputClass}
          value={value}
          onChange={(e) => change(e.target.value)}
        />
      )}
      {field.description && (
        <span className="block break-words text-xs text-ink-3">
          <HelpText text={field.description} />
        </span>
      )}
    </div>
  );
}

function OperationForm({
  op,
  org,
  maxVersion,
  append,
  initial,
  reset,
  detail,
  operations,
}: {
  operations: ConnectOperation[];
  initial: Record<string, string>;
  reset: () => void;
  detail?: { key: string; open: (id: string) => void };
  op: ConnectOperation;
  org: OrgSummary | undefined;
  maxVersion: number;
  append: (wire: WireEntry[]) => void;
}) {
  const [version, setVersion] = useState(Math.max(op.since, Math.min(67, maxVersion)));
  const [values, setValues] = useState(initial);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [raw, setRaw] = useState("");
  const [useJson, setUseJson] = useState(!op.body?.fields.length);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<ConnectInput | null>(null);
  const [running, setRunning] = useState(false);
  const sending = useRef(false);
  const [result, setResult] = useState<WireEntry>();
  const [lastInput, setLastInput] = useState<ConnectInput>();
  const [sample, setSample] = useState("");
  const guidedBody = () => {
    const entries = (op.body?.fields ?? [])
      .filter((f) => fields[f.name] !== undefined && fields[f.name] !== "")
      .map((f) => [f.name, fieldValue(f, fields[f.name])]);
    return entries.length ? Object.fromEntries(entries) : undefined;
  };
  const bodyFields = op.body?.fields ?? [];
  function renderField(field: ConnectField & { location?: string }, value: string, change: (v: string) => void) {
    const graph = op.path.startsWith("/ssot/data-graphs/data/");
    const records =
      field.location &&
      ((graph && ["lookupKeys", "id"].includes(field.name)) ||
        (op.path.startsWith("/ssot/profile/{dataModelName}/{id}") && field.name === "id"));
    const source = !records && org && connectLookup(op, field, operations, version);
    const params = source && lookupParameters(source, { ...fields, ...values });
    return (
      <div key={field.name}>
        <Field field={field} value={value} change={change} />
        {org && records && (
          <CustomerRecordPicker
            key={JSON.stringify([org.id, values.dataspace, graph ? values.dataGraphEntityName : values.dataModelName])}
            orgId={org.id}
            dataspace={values.dataspace || ""}
            graph={graph}
            objectName={(graph ? values.dataGraphEntityName : values.dataModelName) || ""}
            searchKey={graph ? undefined : values.searchKey}
            lookup={field.name === "lookupKeys"}
            select={change}
            append={append}
          />
        )}
        {org && source && params && (
          <ResourcePicker
            key={JSON.stringify([version, params])}
            field={field}
            source={source}
            params={params}
            value={value}
            orgId={org.id}
            version={version}
            maxVersion={maxVersion}
            select={change}
            append={append}
          />
        )}
      </div>
    );
  }
  const editField = (f: ConnectField) =>
    renderField(f, fields[f.name] ?? "", (v) => {
      setSample("");
      setFields((old) => ({ ...old, [f.name]: v }));
    });
  const requestBody = () => (useJson ? (raw.trim() ? JSON.parse(raw) : undefined) : guidedBody());
  function toggleEditor() {
    try {
      if (useJson) {
        const obj = requestBody() ?? {};
        if (
          !isObject(obj) ||
          Object.keys(obj).some((k) => !op.body?.fields.some((f) => f.name === k)) ||
          Object.values(obj).some((v) => v === null || v === "") ||
          bodyFields.some(
            (f) =>
              f.itemEnum &&
              f.name in obj &&
              (!Array.isArray(obj[f.name]) ||
                !(obj[f.name] as unknown[]).every((v) => f.itemEnum!.some((choice) => choice === v))),
          )
        )
          throw Error("This payload contains values that require the JSON editor.");
        setFields(
          Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])),
        );
      } else setRaw(JSON.stringify(guidedBody(), null, 2) ?? "");
      setUseJson(!useJson);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function send(input: ConnectInput, approved: boolean) {
    if (!org || sending.current) return;
    sending.current = true;
    setRunning(true);
    setPending(null);
    setError("");
    setResult(undefined);
    try {
      const reply = await callConnect(input, org.id, approved);
      append(reply.wire);
      setResult(reply.wire.at(-1));
      setLastInput(input);
      if (reply.error) throw Error(reply.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sending.current = false;
      setRunning(false);
    }
  }
  function prepare() {
    try {
      const input = { operation: operationKey(op), version, values, body: requestBody() };
      buildConnectRequest(op, input, maxVersion);
      setError("");
      if (op.method === "GET") void send(input, false);
      else setPending(input);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const preview = pending && buildConnectRequest(op, pending, maxVersion);
  const next =
    org && result?.status === 200 && lastInput && nextConnectPage(op, lastInput, result.responseBody, org.myDomain);
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-5 xl:px-7">
      <div className="flex items-center justify-between gap-2 text-xs text-ink-3">
        <span className="mr-auto">{op.families.join(" · ")}</span>
        <button
          type="button"
          onClick={reset}
          disabled={running}
          className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 font-medium text-ink-2 hover:bg-tint disabled:opacity-50"
        >
          <RotateCcw size={13} /> Reset form
        </button>
        <a href={docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
          <BookOpen size={13} /> Reference
        </a>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{op.title}</h1>
        <div className="mt-1 text-sm text-ink-2">
          <HelpText text={op.description} />
        </div>
      </div>
      <fieldset
        disabled={running || !!pending}
        className="min-w-0 space-y-4 rounded-xl border border-line bg-surface p-4 shadow-card"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <b className="rounded bg-sent px-1.5 py-0.5 font-mono text-xs text-sent-ink">{op.method}</b>
          <code className="min-w-0 flex-1 break-all text-xs">{op.path}</code>
          <select
            aria-label="API version"
            value={version}
            className="rounded border border-line bg-surface px-1 text-xs"
            onChange={(e) => setVersion(Number(e.target.value))}
          >
            {Array.from({ length: maxVersion - op.since + 1 }, (_, i) => maxVersion - i).map((v) => (
              <option key={v} value={v}>
                v{v}.0
              </option>
            ))}
          </select>
        </div>
        {!op.parameters.length && !op.body && <p className="text-sm text-ink-3">No inputs required.</p>}
        {op.parameters.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Request parameters</h3>
            <InputGroups
              fields={op.parameters}
              values={values}
              render={(p) =>
                renderField(p, values[p.name] ?? "", (v) =>
                  setValues((old) => editConnectParameter(op, old, p.name, v)),
                )
              }
            />
          </section>
        )}
        {op.body && (
          <div className="space-y-3 border-t border-line pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Request body
                <Requirement field={op.body} />
              </h3>
              {op.body.fields.length > 0 && (
                <button onClick={toggleEditor} className={quietClass}>
                  {useJson ? "Edit fields" : "Edit JSON"}
                </button>
              )}
            </div>
            {Object.keys(op.body.examples).length > 0 && (
              <label className="block text-xs text-ink-3">
                Salesforce example
                <select
                  className={inputClass}
                  value={sample}
                  onChange={(e) => {
                    setSample(e.target.value);
                    setRaw(JSON.stringify(op.body!.examples[e.target.value], null, 2) ?? "");
                    setUseJson(true);
                    setFields({});
                    setError("");
                  }}
                >
                  <option value="">Select an example…</option>
                  {Object.keys(op.body.examples).map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            )}
            {!op.body.required && bodyFields.some((f) => f.required) && (
              <p className="text-xs text-ink-3">Required body fields apply when you include a request body.</p>
            )}
            {useJson ? (
              <div className="space-y-2">
                {bodyFields.some((f) => f.required) && (
                  <p className="break-words text-xs text-ink-2">
                    Required body fields ·{" "}
                    {bodyFields
                      .filter((f) => f.required)
                      .map((f) => f.name)
                      .join(", ")}
                  </p>
                )}
                <textarea
                  aria-required={op.body.required}
                  aria-label="JSON request body"
                  value={raw}
                  rows={9}
                  spellCheck={false}
                  placeholder="{}"
                  className={inputClass + " font-mono text-xs"}
                  onChange={(e) => {
                    setRaw(e.target.value);
                    setSample("");
                  }}
                />
              </div>
            ) : (
              <InputGroups fields={bodyFields} values={fields} render={editField} />
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-3">{org?.name ?? "Configure an org in Admin to send requests."}</span>
          <button className={actionClass} disabled={!org} onClick={prepare}>
            {op.method === "GET" ? <Send size={14} /> : <ArrowRight size={14} />}
            {running ? "Sending…" : op.method === "GET" ? "Send request" : "Review request"}
          </button>
        </div>
      </fieldset>
      {pending && preview && (
        <section aria-label="Request approval" className="space-y-3 rounded-xl border border-action bg-surface p-4">
          <h2 className="font-semibold">Approve {op.title}?</h2>
          <p className="text-sm">{org?.name}</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-sent p-3 text-xs text-sent-ink">
            {op.method} {org?.myDomain}
            {maskUrl(preview.path)}
            {Object.keys(preview.headers).length > 0 && "\n" + JSON.stringify(preview.headers, null, 2)}
            {preview.body !== undefined && "\n" + JSON.stringify(maskBody(preview.body), null, 2)}
          </pre>
          <div className="flex gap-2">
            <button className={actionClass} onClick={() => void send(pending, true)}>
              Approve and send
            </button>
            <button className={quietClass} onClick={() => setPending(null)}>
              Back to editing
            </button>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-err/40 p-3 text-sm text-err">
          {error}
        </p>
      )}
      {result && (
        <ConnectResult
          key={result.id}
          entry={result}
          detail={detail}
          family={op.families[0]}
          firstPage={
            lastInput && op.method === "GET" && result.status === 200 && Number(lastInput.values.offset) > 0
              ? () => {
                  const values = { ...lastInput.values, offset: "0" };
                  setValues((draft) => (draft.offset === lastInput.values.offset ? { ...draft, offset: "" } : draft));
                  void send({ ...lastInput, values }, false);
                }
              : undefined
          }
          next={next ? () => void send(next, false) : undefined}
        />
      )}
    </div>
  );
}

export function ConnectModule({ orgs }: { orgs: OrgsResponse }) {
  const [catalog, setCatalog] = useState<ConnectCatalog>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [family, setFamily] = useState("Data Spaces");
  const [search, setSearch] = useState("");
  const [selected, select] = useState("GET /ssot/data-spaces");
  const [revision, setRevision] = useState(0);
  const [initial, setInitial] = useState<Record<string, string>>({});
  function setSelected(key: string, values: Record<string, string> = {}) {
    setInitial(values);
    select(key);
  }
  const [wire, setWire] = useState<WireEntry[]>([]);
  const appendWire = useCallback((entries: WireEntry[]) => setWire((old) => [...old, ...entries]), []);
  const org = orgs.orgs.find((o) => o.id === orgs.activeOrgId);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/connect/catalog", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error(`Catalog returned HTTP ${r.status}.`);
        return r.json();
      })
      .then(setCatalog)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [retry]);
  if (!catalog)
    return (
      <div className="p-6">
        {error || "Loading the API catalog…"}{" "}
        {error && (
          <button
            className={quietClass}
            onClick={() => {
              setError("");
              setRetry((n) => n + 1);
            }}
          >
            Retry
          </button>
        )}
      </div>
    );
  const families = [...new Set(catalog.operations.flatMap((o) => o.families))].sort();
  const term = search.trim().toLowerCase();
  const matches = catalog.operations.filter((o) =>
    term
      ? (o.families.join(" ") + " " + o.title + " " + operationKey(o)).toLowerCase().includes(term)
      : o.families.includes(family),
  );
  const op = catalog.operations.find((o) => operationKey(o) === selected)!;
  const child =
    op.method === "GET" &&
    !op.path.includes("{") &&
    catalog.operations.find(
      (o) =>
        o.method === "GET" && o.path.startsWith(op.path + "/{") && /^\{[^}]+\}$/.test(o.path.slice(op.path.length + 1)),
    );
  const childKey = child && child.parameters.find((p) => p.location === "path")?.name;
  return (
    <div className="grid h-full min-w-0 grid-cols-[13rem_minmax(0,1fr)] grid-rows-[minmax(0,2fr)_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_21rem] xl:grid-rows-1 2xl:grid-cols-[17rem_minmax(0,1fr)_24rem]">
      <aside className="row-span-2 flex min-h-0 flex-col bg-side text-side-ink xl:row-span-1">
        <div className="space-y-3 border-b border-side-line p-3">
          <h2 className="font-semibold">Data 360 Connect API</h2>
          <label className="flex items-center gap-2 rounded-lg bg-side-2 px-2">
            <Search size={14} />
            <input
              aria-label="Search all operations"
              placeholder="Search all operations"
              className="min-w-0 flex-1 bg-transparent py-2 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="API family"
            value={family}
            onChange={(e) => {
              const next =
                catalog.operations.find((o) => o.families.includes(e.target.value) && o.method === "GET") ??
                catalog.operations.find((o) => o.families.includes(e.target.value))!;
              setFamily(e.target.value);
              setSearch("");
              setSelected(operationKey(next));
            }}
            className="w-full rounded-lg border border-side-line bg-side-2 p-2 text-sm"
          >
            {families.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {!matches.length && <p className="p-2 text-xs">No matching operations.</p>}
          {matches.map((o) => (
            <button
              key={operationKey(o)}
              aria-label={o.method + " " + o.title}
              aria-current={op === o ? "page" : undefined}
              onClick={() => {
                setSelected(operationKey(o));
                if (!o.families.includes(family)) setFamily(o.families[0]);
              }}
              className={`block w-full rounded-lg px-2 py-2 text-left hover:bg-side-2 ${op === o ? "bg-side-2 ring-1 ring-side-line" : ""}`}
            >
              <span className="mr-2 font-mono text-[10px] font-semibold text-side-ink-2">{o.method}</span>
              <span className="text-sm">{o.title}</span>
            </button>
          ))}
        </div>
      </aside>
      <div className="min-w-0 flex-1 overflow-auto">
        <OperationForm
          key={JSON.stringify([selected, orgs.activeOrgId, revision])}
          op={op}
          org={org}
          maxVersion={Number(catalog.version)}
          operations={catalog.operations}
          initial={initial}
          reset={() => {
            setInitial({});
            setRevision((n) => n + 1);
          }}
          detail={
            child && childKey
              ? { key: childKey, open: (id) => setSelected(operationKey(child), { [childKey]: id }) }
              : undefined
          }
          append={appendWire}
        />
      </div>
      <aside
        aria-label="Connect API wire"
        className="flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-line bg-surface xl:border-l xl:border-t-0"
      >
        <h2 className="px-4 pt-4 font-semibold">Wire</h2>
        <div className="min-h-0 flex-1">
          <WirePanel wire={wire} highlightTurn={null} title="data360_connect_api" />
        </div>
      </aside>
    </div>
  );
}
