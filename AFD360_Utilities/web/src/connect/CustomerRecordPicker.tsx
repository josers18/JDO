import { useCallback, useEffect, useState } from "react";
import type { QueryObject, WireEntry } from "../../../shared/types";
import { api, QueryCallError } from "../api";
import { RootPicker, type RootSearch } from "../query/ApiForm";

interface Props {
  orgId: string;
  dataspace: string;
  graph: boolean;
  objectName: string;
  searchKey?: string;
  lookup: boolean;
  select: (value: string) => void;
  append: (entries: WireEntry[]) => void;
}

export function CustomerRecordPicker({
  orgId,
  dataspace,
  graph,
  objectName,
  searchKey,
  lookup,
  select,
  append,
}: Props) {
  const [obj, setObject] = useState<QueryObject | null>();
  const [error, setError] = useState("");
  const hasObject = Boolean(objectName);
  useEffect(() => {
    if (!hasObject) return;
    let live = true;
    setError("");
    const timer = setTimeout(
      () =>
        api
          .recordObject(orgId, dataspace, objectName, graph)
          .then((reply) => {
            append(reply.wire);
            if (live) setObject(reply.object);
          })
          .catch((e) => {
            if (e instanceof QueryCallError) append(e.wire);
            if (live) setError(e.message);
          }),
      300,
    );
    return () => {
      clearTimeout(timer);
      live = false;
    };
  }, [orgId, dataspace, hasObject, graph, objectName, append]);
  const search = useCallback<RootSearch>(
    async (sql, sqlParameters) => {
      try {
        const r = await api.queryRun(orgId, sql, dataspace, 20, { sqlParameters });
        append(r.wire);
        return r.page.data ?? [];
      } catch (e) {
        if (e instanceof QueryCallError) append(e.wire);
        throw e;
      }
    },
    [orgId, dataspace, append],
  );

  const root = obj?.root;
  if (!hasObject || error || !root || (searchKey && !obj.fields.some((f) => f.name === searchKey))) {
    const message = !hasObject
      ? `Choose a ${graph ? "data graph" : "profile DMO"} to load records.`
      : error || (obj === undefined ? "Loading record metadata…" : "Record lookup is unavailable for this selection.");
    return (
      <p role="status" className="mt-1 text-xs text-ink-3">
        {message}
      </p>
    );
  }
  return (
    <RootPicker
      key={JSON.stringify([objectName, searchKey])}
      root={searchKey ? { ...root, key: searchKey } : root}
      search={search}
      onPick={lookup ? undefined : select}
      onLookup={lookup ? (id) => select(`[${root.object}.${root.key}=${id}]`) : undefined}
    />
  );
}
