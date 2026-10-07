import { useState } from "react";
import { CheckCircle2, Loader2, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { api } from "../api";
import type { OrgInput, OrgSummary, OrgTestResult, OrgsResponse } from "../../../shared/types";

const EMPTY: OrgInput = { name: "", myDomain: "", clientId: "", clientSecret: "" };

export function OrgsPage({ orgs, onChange }: { orgs: OrgsResponse; onChange: () => Promise<void> }) {
  const [editing, setEditing] = useState<{ id: string | null; form: OrgInput } | null>(null);
  const [tests, setTests] = useState<Record<string, OrgTestResult | "running">>({});
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      if (editing.id) await api.updateOrg(editing.id, editing.form);
      else await api.createOrg(editing.form);
      setEditing(null);
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const test = async (id: string) => {
    setTests((t) => ({ ...t, [id]: "running" }));
    const result = await api.testOrg(id).catch((e) => ({ ok: false, error: (e as Error).message }));
    setTests((t) => ({ ...t, [id]: result }));
  };

  const remove = async (o: OrgSummary) => {
    if (!confirm(`Delete org "${o.name}"? Its saved secret is removed.`)) return;
    await api.deleteOrg(o.id);
    await onChange();
  };

  return (
    <div className="mx-auto w-full max-w-[88rem] p-6 lg:p-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Admin</p>
          <h1 className="text-2xl font-semibold">Orgs</h1>
          <p className="mt-1 text-sm text-slate-500">
            Each org needs an External Client App with the client credentials flow. Secrets are encrypted at rest and never
            sent back to the browser.
          </p>
        </div>
        <button
          onClick={() => setEditing({ id: null, form: { ...EMPTY } })}
          className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          <Plus size={16} /> Add org
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">My Domain</th>
              <th className="px-4 py-3">Consumer key</th>
              <th className="px-4 py-3">Secret</th>
              <th className="px-4 py-3">Connection</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orgs.orgs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No orgs yet. Add one to start chatting with its agents.
                </td>
              </tr>
            )}
            {orgs.orgs.map((o) => {
              const t = tests[o.id];
              return (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-medium">
                    {o.name}
                    {orgs.activeOrgId === o.id ? (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">active</span>
                    ) : (
                      <button
                        onClick={() => api.activateOrg(o.id).then(onChange)}
                        className="ml-2 text-xs text-sky-600 hover:underline"
                      >
                        set active
                      </button>
                    )}
                  </td>
                  <td className="break-all px-4 py-3 font-mono text-xs text-slate-600">
                    {o.myDomain.replace(/^https:\/\//, "")}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600" title={o.clientId}>{o.clientId.slice(0, 14)}…{o.clientId.slice(-4)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">••••{o.secretLast4}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => test(o.id)} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                      Test
                    </button>
                    {t === "running" && <Loader2 size={14} className="ml-2 inline animate-spin text-slate-400" />}
                    {t && t !== "running" && t.ok && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-700">
                        <CheckCircle2 size={14} /> {t.username}
                      </span>
                    )}
                    {t && t !== "running" && !t.ok && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-red-600" title={t.error}>
                        <XCircle size={14} /> {t.error?.slice(0, 60)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditing({ id: o.id, form: { name: o.name, myDomain: o.myDomain, clientId: o.clientId, clientSecret: "" } })}
                      className="p-1 text-slate-400 hover:text-slate-700"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => remove(o)} className="p-1 text-slate-400 hover:text-red-600" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{editing.id ? "Edit org" : "Add org"}</h2>
            <div className="space-y-3">
              <Field label="Name" value={editing.form.name} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, name: v } })} placeholder="finsdc3 (JDO demo)" />
              <Field
                label="My Domain URL"
                value={editing.form.myDomain}
                onChange={(v) => setEditing({ ...editing, form: { ...editing.form, myDomain: v } })}
                placeholder="https://yourorg.my.salesforce.com"
                hint="The my.salesforce.com URL, not lightning.force.com"
              />
              <Field label="Consumer key" value={editing.form.clientId} onChange={(v) => setEditing({ ...editing, form: { ...editing.form, clientId: v } })} mono />
              <Field
                label="Consumer secret"
                value={editing.form.clientSecret ?? ""}
                onChange={(v) => setEditing({ ...editing, form: { ...editing.form, clientSecret: v } })}
                type="password"
                mono
                hint={editing.id ? "Leave blank to keep the saved secret" : undefined}
              />
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100">
                Cancel
              </button>
              <button onClick={save} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{props.label}</span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete="off"
        className={`mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none ${props.mono ? "font-mono" : ""}`}
      />
      {props.hint && <span className="mt-1 block text-xs text-slate-500">{props.hint}</span>}
    </label>
  );
}
