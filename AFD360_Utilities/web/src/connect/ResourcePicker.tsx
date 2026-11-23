import { useState } from "react";
import {
  buildConnectRequest,
  nextConnectPage,
  operationKey,
  type ConnectInput,
  type ConnectField,
} from "../../../shared/connect";
import { lookupOptions, type ConnectLookup } from "../../../shared/connectLookup";
import type { WireEntry } from "../../../shared/types";
import { callConnect } from "./resourceOptions";

interface Props {
  field: ConnectField;
  source: ConnectLookup;
  params: Record<string, string>;
  value: string;
  orgId: string;
  version: number;
  maxVersion: number;
  select: (id: string) => void;
  append: (wire: WireEntry[]) => void;
}

export function ResourcePicker({ field, source, params, value, orgId, version, maxVersion, select, append }: Props) {
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState<ConnectInput>();
  async function load(page?: ConnectInput) {
    setBusy(true);
    setMessage("");
    if (!page) {
      setOptions([]);
      setNext(undefined);
    }
    try {
      const input = page ?? { operation: operationKey(source.operation), version, values: params };
      buildConnectRequest(source.operation, input, maxVersion);
      const reply = await callConnect(input, orgId, false);
      append(reply.wire);
      if (reply.error) throw Error(reply.error);
      const entry = reply.wire.at(-1);
      const body: unknown = entry?.responseBody;
      const items = new Map(page ? options.map((o) => [o.id, o.label]) : []);
      for (const [id, label] of lookupOptions(source, field, body, entry?.url)) items.set(id, label);
      setNext(entry && nextConnectPage(source.operation, input, body, entry.url));
      setOptions([...items].map(([id, label]) => ({ id, label })));
      if (!items.size) setMessage("No identifiers in the returned page. Enter one above.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const missing =
    source.parentField && !params.entityName
      ? source.parentField
      : source.operation.parameters.find((p) => p.required && !params[p.name])?.name;
  if (missing) return <p className="mt-1 text-xs text-ink-3">Enter {missing} to load choices from the org.</p>;
  return (
    <div className="mt-1 space-y-1">
      <button
        className="text-xs font-medium text-ink-2 underline disabled:opacity-50"
        onClick={() => load()}
        disabled={busy}
      >
        {busy ? "Loading records…" : "Choose from org"}
      </button>
      {options.length > 0 && (
        <select
          aria-label={`Choose ${field.name} from org`}
          value={value}
          onChange={(e) => select(e.target.value)}
          className="block w-full rounded-lg border border-line bg-surface p-1.5 text-xs"
        >
          <option value="">Select a record…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
              {o.id !== o.label ? ` · ${o.id}` : ""}
            </option>
          ))}
        </select>
      )}
      {next && (
        <button className="block text-xs underline" disabled={busy} onClick={() => load(next)}>
          Load more choices
        </button>
      )}
      {message && (
        <p role="status" className="text-xs text-ink-3">
          {message}
        </p>
      )}
    </div>
  );
}
