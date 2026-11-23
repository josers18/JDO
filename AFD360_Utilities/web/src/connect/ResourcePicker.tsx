import { useState } from "react";
import { buildConnectRequest, operationKey, type ConnectOperation } from "../../../shared/connect";
import type { WireEntry } from "../../../shared/types";
import { callConnect, resourceId } from "./resourceOptions";

interface Props {
  parameter: string;
  source: ConnectOperation;
  orgId: string;
  version: number;
  maxVersion: number;
  values: Record<string, string>;
  select: (id: string) => void;
  append: (wire: WireEntry[]) => void;
}

export function ResourcePicker({ parameter, source, orgId, version, maxVersion, values, select, append }: Props) {
  const [options, setOptions] = useState<{ id: string; label: string }[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setMessage("");
    setOptions([]);
    try {
      const query = Object.fromEntries(
        source.parameters.filter((p) => values[p.name] !== undefined).map((p) => [p.name, values[p.name]]),
      );
      const input = { operation: operationKey(source), version, values: query };
      buildConnectRequest(source, input, maxVersion);
      const reply = await callConnect(input, orgId, false);
      append(reply.wire);
      if (reply.error) throw Error(reply.error);
      const entry = reply.wire.at(-1);
      const body: unknown = entry?.responseBody;
      const arrays: unknown[] = Array.isArray(body)
        ? [body]
        : body && typeof body === "object"
          ? Object.values(body)
          : [];
      const items = new Map<string, string>();
      for (const rows of arrays)
        if (Array.isArray(rows)) {
          for (const row of rows) {
            if (!row || typeof row !== "object" || Array.isArray(row)) continue;
            const id = resourceId(row, parameter, entry?.url);
            if (id) items.set(id, String(row.displayName ?? row.label ?? row.name ?? id));
          }
        }
      setOptions([...items].map(([id, label]) => ({ id, label })));
      if (!items.size) setMessage("No identifiers in the returned page. Enter one above.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-1 space-y-1">
      <button className="text-xs font-medium text-ink-2 underline disabled:opacity-50" onClick={load} disabled={busy}>
        {busy ? "Loading records…" : "Choose from org"}
      </button>
      {options.length > 0 && (
        <select
          aria-label={`Choose ${parameter} from org`}
          value={values[parameter] ?? ""}
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
      {message && (
        <p role="status" className="text-xs text-ink-3">
          {message}
        </p>
      )}
    </div>
  );
}
