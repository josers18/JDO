#!/usr/bin/env python3
"""Data Cloud inventory generator.

Pulls every Data Cloud data stream in an org and enriches it with its DLO
(Data Lake Object) and mapped DMO(s), then writes two filterable artifacts:

  * data_stream_inventory.xlsx  -- multi-sheet workbook, each sheet with a
    frozen header row and column autofilter dropdowns.
  * data_stream_inventory.html  -- one self-contained page with live search,
    per-column filters, and sortable columns (no dependencies).

Auth is borrowed from the Salesforce CLI (`sf`); no secrets live in this file.
Run it yourself anytime:

    python generate_inventory.py --org jdo-oe0sdd

See README.md for the column guide and method caveats.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import html
import json
import re
import subprocess
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

# ---------------------------------------------------------------------------
# Salesforce CLI auth
# ---------------------------------------------------------------------------

_TOKEN_RE = re.compile(r"00D[A-Za-z0-9!._-]{20,}")


def _run(cmd: list[str]) -> str:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit(
            f"command failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr.strip()}"
        )
    return proc.stdout


def get_session(org: str) -> tuple[str, str]:
    """Return (instance_url, access_token) for the org alias via the sf CLI."""
    disp = json.loads(_run(["sf", "org", "display", "-o", org, "--json"]))
    instance = disp["result"]["instanceUrl"].rstrip("/")
    # `sf org display` redacts the token on modern CLIs; ask for it explicitly.
    raw = _run(["sf", "org", "auth", "show-access-token", "-o", org, "--no-prompt"])
    m = _TOKEN_RE.search(raw)
    if not m:
        raise SystemExit(
            "could not parse an access token from `sf org auth show-access-token`.\n"
            f"raw output:\n{raw}"
        )
    return instance, m.group(0)


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


class Client:
    def __init__(self, instance: str, token: str, api: str):
        self.base = f"{instance}/services/data/v{api}"
        self.headers = {"Authorization": f"Bearer {token}"}

    def get(self, path: str, params: dict | None = None, retries: int = 2,
            timeout: int = 25):
        url = self.base + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        last = None
        for attempt in range(retries):
            req = urllib.request.Request(url, headers=self.headers)
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    body = resp.read().decode().strip()
                    return json.loads(body) if body else {}  # empty 200 == no results
            except urllib.error.HTTPError as e:
                body = e.read().decode(errors="replace")
                last = f"HTTP {e.code}: {body[:300]}"
                if e.code in (401, 403):
                    raise SystemExit(f"{url}\n{last}")
                if e.code in (400, 404):  # bad/unknown lookup key -> no results
                    return {}
            except Exception as e:  # noqa: BLE001 - network flakiness, retry once
                last = str(e)
        raise SystemExit(f"GET failed after {retries} tries: {url}\n{last}")


# ---------------------------------------------------------------------------
# Fetchers
# ---------------------------------------------------------------------------


def fetch_streams(client: Client, page: int = 50) -> list[dict]:
    out: list[dict] = []
    offset = 1
    while True:
        # Each stream embeds its full DLO + source field lists, so this payload
        # is heavy -- keep pages small and give the call extra time.
        d = client.get("/ssot/data-streams", {"limit": page, "offset": offset},
                       retries=3, timeout=90)
        batch = d.get("dataStreams") or []
        out.extend(batch)
        total = d.get("totalSize", len(out))
        print(f"  streams {len(out)}/{total}", file=sys.stderr)
        if len(out) >= total or not batch:
            break
        offset += len(batch)
    return out


def fetch_dmos(client: Client) -> dict[str, dict]:
    """name -> {category, fieldCount, primaryKeys, displayName}."""
    d = client.get("/ssot/metadata", {"entityType": "DataModelObject"},
                   retries=3, timeout=120)
    out: dict[str, dict] = {}
    for it in d.get("metadata") or []:
        name = it.get("name")
        if not name:
            continue
        out[name] = {
            "category": it.get("category"),
            "displayName": it.get("displayName"),
            "fieldCount": len(it.get("fields") or []),
            "primaryKeys": [p.get("name") if isinstance(p, dict) else p
                            for p in (it.get("primaryKeys") or [])],
        }
    return out


def fetch_dlos(client: Client) -> dict[str, dict]:
    """All Data Lake Objects, so we can flag orphans. Best-effort.

    name -> {category, status, fieldCount}. Returns {} if the entity type is
    unavailable on this org/API version.
    """
    try:
        d = client.get("/ssot/metadata", {"entityType": "DataLakeObject"},
                       retries=3, timeout=120)
    except SystemExit as e:
        print(f"  (DLO list unavailable, skipping orphan detection: {e})", file=sys.stderr)
        return {}
    out: dict[str, dict] = {}
    for it in d.get("metadata") or []:
        name = it.get("name")
        if not name:
            continue
        out[name] = {
            "category": it.get("category"),
            "status": it.get("status"),
            "fieldCount": len(it.get("fields") or []),
        }
    return out


def fetch_mappings(client: Client, dmos: dict[str, dict], workers: int) -> list[dict]:
    """Resolve DLO->DMO mappings by querying each DMO (reverse lookup).

    We enumerate by DMO rather than by source object on purpose: the
    source-object (forward) query on large CRM objects returns multi-megabyte
    payloads that time out / reset the connection, whereas the per-DMO query
    returns only that DMO's maps and is fast. Reverse still covers CRM streams
    (e.g. dmoDeveloperName=ssot__Individual__dlm surfaces Contact_Home_map_…).
    Maps are deduped by their developerName.
    """
    maps: dict[str, dict] = {}
    lock = threading.Lock()

    def pull(name: str):
        d = client.get("/ssot/data-model-object-mappings", {"dmoDeveloperName": name})
        rows = d.get("objectSourceTargetMaps") if isinstance(d, dict) else None
        if not rows:
            return
        with lock:
            for r in rows:
                dev = r.get("developerName")
                if dev:
                    maps[dev] = r

    names = list(dmos)
    done = 0
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(pull, n) for n in names]
        for _ in cf.as_completed(futs):
            done += 1
            if done % 100 == 0 or done == len(futs):
                print(f"  mappings {done}/{len(futs)} DMOs queried", file=sys.stderr)
    return list(maps.values())


# ---------------------------------------------------------------------------
# Join
# ---------------------------------------------------------------------------


def map_prefix(dev_name: str) -> str | None:
    """`Account_Home_map_Account_1736..` -> `Account_Home` (the stream/DLO base)."""
    if "_map_" not in dev_name:
        return None
    return dev_name.rsplit("_map_", 1)[0]


def build_stream_dmos(streams: list[dict], maps: list[dict]) -> dict[str, set[str]]:
    """stream name -> set of mapped DMO developer names."""
    # Match a map's prefix to a stream via the stream name or its DLO base name.
    by_key: dict[str, str] = {}
    for s in streams:
        name = s.get("name")
        by_key[name] = name
        dlo = (s.get("dataLakeObjectInfo") or {}).get("name")  # e.g. Foo__dll
        if dlo:
            by_key[dlo] = name
            by_key[dlo.removesuffix("__dll")] = name

    result: dict[str, set[str]] = defaultdict(set)
    for m in maps:
        dmo = m.get("targetEntityDeveloperName")
        prefix = map_prefix(m.get("developerName") or "")
        if not dmo or not prefix:
            continue
        stream = by_key.get(prefix)
        if stream is None:
            # longest-prefix fallback (handles rare suffix drift)
            cand = [k for k in by_key if prefix.startswith(k)]
            if cand:
                stream = by_key[max(cand, key=len)]
        if stream is not None:
            result[stream].add(dmo)
    return result


ATTENTION_RUN = {"FAILURE", "FAILED", "WARNING", "ERROR", "PARTIAL_SUCCESS"}


def build_rows(streams: list[dict], stream_dmos: dict[str, set[str]],
               dmos: dict[str, dict]) -> list[dict]:
    rows = []
    for s in streams:
        conn = (s.get("connectorInfo") or {})
        cd = conn.get("connectorDetails", {}) or {}
        dlo = s.get("dataLakeObjectInfo") or {}
        ds = dlo.get("dataSpaceInfo")
        if isinstance(ds, list):
            spaces = "; ".join(sorted({(d.get("name") or d.get("label")) for d in ds
                                       if isinstance(d, dict)} - {None}))
        elif isinstance(ds, dict):
            spaces = ds.get("name") or ds.get("label")
        else:
            spaces = None
        mapped = sorted(stream_dmos.get(s.get("name"), set()))
        # field count across mapped DMOs (max, they usually share the target)
        dmo_fields = max((dmos.get(d, {}).get("fieldCount", 0) for d in mapped),
                         default=None)
        run = (s.get("lastRunStatus") or "").upper()
        status = (s.get("status") or "").upper()
        enabled = s.get("isEnabled")
        needs_attn = (run in ATTENTION_RUN) or (status and status != "ACTIVE") or (enabled is False)
        rows.append({
            "Data Stream Name": s.get("name"),
            "Data Stream Label": s.get("label"),
            "Stream Status": s.get("status"),
            "Enabled": enabled,
            "Last Run Status": s.get("lastRunStatus"),
            "Last Refresh Date": s.get("lastRefreshDate"),
            "Total Records": s.get("totalRecords"),
            "Last Added Records": s.get("lastAddedRecords"),
            "Connector Type": conn.get("connectorType") or cd.get("type"),
            "Connector Name": cd.get("name"),
            "Data Source": s.get("dataSource"),
            "Data Stream Type": s.get("dataStreamType"),
            "Source Object": cd.get("sourceObject"),
            "Refresh Mode": (s.get("refreshConfig") or {}).get("refreshMode"),
            "Frequency Type": ((s.get("refreshConfig") or {}).get("frequency") or {}).get("frequencyType"),
            "DLO Name": dlo.get("name"),
            "DLO Category": dlo.get("category"),
            "DLO Status": dlo.get("status"),
            "DLO Field Count": len(dlo.get("dataLakeFieldInfoRepresentation") or []),
            "Data Space": spaces,
            "Mapped DMO(s)": "; ".join(mapped),
            "Mapping Count": len(mapped),
            "DMO Field Count": dmo_fields,
            "Is Mapped": bool(mapped),
            "Needs Attention": needs_attn,
            "Record ID": s.get("recordId"),
        })
    rows.sort(key=lambda r: (r["Data Stream Name"] or "").lower())
    return rows


# ---------------------------------------------------------------------------
# Breakdowns
# ---------------------------------------------------------------------------


def build_breakdowns(rows: list[dict], streams: list[dict], dlos: dict[str, dict],
                     stream_dmos: dict[str, set[str]]):
    unmapped = [r for r in rows if not r["Is Mapped"]]
    attention = [r for r in rows if r["Needs Attention"]]

    # Orphaned DLOs: exist in the org but no visible stream feeds them.
    orphaned = []
    if dlos:
        stream_dlo_names = {(s.get("dataLakeObjectInfo") or {}).get("name") for s in streams}
        for name, meta in sorted(dlos.items()):
            if name not in stream_dlo_names:
                orphaned.append({
                    "DLO Name": name,
                    "DLO Category": meta.get("category"),
                    "DLO Status": meta.get("status"),
                    "Field Count": meta.get("fieldCount"),
                })

    # Summaries.
    def summarize(key: str):
        agg = defaultdict(lambda: {"Streams": 0, "Mapped": 0, "Needs Attention": 0,
                                   "Total Records": 0})
        for r in rows:
            k = r.get(key) or "(none)"
            a = agg[k]
            a["Streams"] += 1
            a["Mapped"] += 1 if r["Is Mapped"] else 0
            a["Needs Attention"] += 1 if r["Needs Attention"] else 0
            a["Total Records"] += r.get("Total Records") or 0
        return [{key: k, **v} for k, v in sorted(agg.items(),
                key=lambda kv: -kv[1]["Streams"])]

    return {
        "Unmapped Streams": unmapped,
        "Needs Attention": attention,
        "Orphaned DLOs": orphaned,
        "Summary by Connector": summarize("Connector Type"),
        "Summary by Category": summarize("DLO Category"),
        "Summary by Source Object": summarize("Source Object"),
    }


def build_connectors(streams: list[dict]) -> list[dict]:
    agg: dict[str, dict] = {}
    for s in streams:
        conn = s.get("connectorInfo") or {}
        cd = conn.get("connectorDetails", {}) or {}
        name = cd.get("name") or "(none)"
        a = agg.setdefault(name, {"Connector Name": name,
                                  "Connector Type": conn.get("connectorType") or cd.get("type"),
                                  "Stream Count": 0, "_objs": set()})
        a["Stream Count"] += 1
        if cd.get("sourceObject"):
            a["_objs"].add(cd["sourceObject"])
    out = []
    for a in sorted(agg.values(), key=lambda x: -x["Stream Count"]):
        objs = sorted(a.pop("_objs"))
        a["Source Object Count"] = len(objs)
        a["Source Objects"] = "; ".join(objs)
        out.append(a)
    return out


# ---------------------------------------------------------------------------
# Writers
# ---------------------------------------------------------------------------


def write_xlsx(path: str, sheets: dict[str, list[dict]]):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    wb.remove(wb.active)
    head_font = Font(bold=True, color="FFFFFF")
    head_fill = PatternFill("solid", fgColor="1F4E78")

    for title, rows in sheets.items():
        ws = wb.create_sheet(title[:31])
        if not rows:
            ws.append(["(no rows)"])
            continue
        cols = list(rows[0].keys())
        ws.append(cols)
        for r in rows:
            ws.append([_cell(r.get(c)) for c in cols])
        for ci, _ in enumerate(cols, 1):
            c = ws.cell(row=1, column=ci)
            c.font = head_font
            c.fill = head_fill
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{len(rows) + 1}"
        for ci, col in enumerate(cols, 1):
            width = max(len(str(col)),
                        *(len(str(_cell(r.get(col)))) for r in rows[:200])) + 2
            ws.column_dimensions[get_column_letter(ci)].width = min(width, 55)
    wb.save(path)


def _cell(v):
    if isinstance(v, (list, set)):
        return "; ".join(map(str, v))
    return v


def write_html(path: str, title: str, rows: list[dict], org: str, generated: str):
    cols = list(rows[0].keys()) if rows else []
    data_json = json.dumps([[_cell(r.get(c)) for c in cols] for r in rows])
    cols_json = json.dumps(cols)
    tmpl = _HTML.replace("__TITLE__", html.escape(title))
    tmpl = tmpl.replace("__ORG__", html.escape(org))
    tmpl = tmpl.replace("__GEN__", html.escape(generated))
    tmpl = tmpl.replace("__COUNT__", str(len(rows)))
    tmpl = tmpl.replace("__COLS__", cols_json)
    tmpl = tmpl.replace("__DATA__", data_json)
    with open(path, "w", encoding="utf-8") as f:
        f.write(tmpl)


_HTML = r"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<style>
  :root{--bd:#d0d7de;--hd:#1F4E78;--zebra:#f6f8fa;--accent:#0969da}
  *{box-sizing:border-box}
  body{font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:0;color:#1f2328;background:#fff}
  header{padding:14px 18px;border-bottom:1px solid var(--bd);position:sticky;top:0;background:#fff;z-index:5}
  h1{font-size:16px;margin:0 0 4px}
  .meta{color:#57606a;font-size:12px}
  .bar{margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  #q{flex:1;min-width:220px;padding:7px 10px;border:1px solid var(--bd);border-radius:6px;font-size:13px}
  button{padding:7px 12px;border:1px solid var(--bd);background:#f6f8fa;border-radius:6px;cursor:pointer;font-size:12px}
  #count{color:#57606a;font-size:12px}
  .wrap{overflow:auto;max-height:calc(100vh - 120px)}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid var(--bd);padding:5px 8px;text-align:left;white-space:nowrap;max-width:420px;overflow:hidden;text-overflow:ellipsis}
  thead th{position:sticky;top:0;background:var(--hd);color:#fff;cursor:pointer;z-index:2}
  thead tr.filters th{position:sticky;top:29px;background:#eef2f6;z-index:1}
  thead tr.filters input{width:100%;box-sizing:border-box;border:1px solid var(--bd);border-radius:4px;padding:3px 5px;font-size:11px}
  tbody tr:nth-child(even){background:var(--zebra)}
  tbody tr:hover{background:#fff8c5}
  th .arrow{font-size:10px;opacity:.7;margin-left:4px}
  td.bool-true{color:#1a7f37;font-weight:600}
  td.bool-false{color:#cf222e}
</style></head><body>
<header>
  <h1>__TITLE__</h1>
  <div class="meta">Org <b>__ORG__</b> &middot; generated __GEN__ &middot; <span id="count">__COUNT__</span> rows</div>
  <div class="bar">
    <input id="q" placeholder="Search all columns&hellip;" autofocus>
    <button id="cols">Toggle filters</button>
    <button id="reset">Reset</button>
  </div>
</header>
<div class="wrap"><table id="t"><thead></thead><tbody></tbody></table></div>
<script>
const COLS=__COLS__, DATA=__DATA__;
let sortCol=-1, sortDir=1, showFilters=true;
const colFilters=COLS.map(()=>"");
const thead=document.querySelector("thead"), tbody=document.querySelector("tbody");
const q=document.getElementById("q"), count=document.getElementById("count");
function buildHead(){
  thead.innerHTML="";
  const h=document.createElement("tr");
  COLS.forEach((c,i)=>{const th=document.createElement("th");
    th.innerHTML=c+'<span class="arrow"></span>';
    th.onclick=()=>{sortDir=(sortCol===i)?-sortDir:1;sortCol=i;render();};
    h.appendChild(th);});
  thead.appendChild(h);
  const f=document.createElement("tr");f.className="filters";
  COLS.forEach((c,i)=>{const th=document.createElement("th");
    const inp=document.createElement("input");inp.placeholder="filter";
    inp.value=colFilters[i];
    inp.oninput=e=>{colFilters[i]=e.target.value.toLowerCase();render();};
    th.appendChild(inp);f.appendChild(th);});
  f.style.display=showFilters?"":"none";
  thead.appendChild(f);
}
function filtered(){
  const g=q.value.toLowerCase();
  return DATA.filter(row=>{
    if(g && !row.some(v=>String(v==null?"":v).toLowerCase().includes(g)))return false;
    for(let i=0;i<COLS.length;i++){
      if(colFilters[i] && !String(row[i]==null?"":row[i]).toLowerCase().includes(colFilters[i]))return false;
    }
    return true;
  });
}
function render(){
  let rows=filtered();
  if(sortCol>=0){rows=rows.slice().sort((a,b)=>{
    let x=a[sortCol],y=b[sortCol];
    const nx=parseFloat(x),ny=parseFloat(y);
    if(!isNaN(nx)&&!isNaN(ny)){return (nx-ny)*sortDir;}
    return String(x==null?"":x).localeCompare(String(y==null?"":y))*sortDir;
  });}
  tbody.innerHTML="";
  const frag=document.createDocumentFragment();
  for(const row of rows){const tr=document.createElement("tr");
    row.forEach(v=>{const td=document.createElement("td");
      const s=v==null?"":String(v);td.textContent=s;td.title=s;
      if(s==="true")td.className="bool-true";else if(s==="false")td.className="bool-false";
      tr.appendChild(td);});
    frag.appendChild(tr);}
  tbody.appendChild(frag);
  count.textContent=rows.length+(rows.length!==DATA.length?" / "+DATA.length:"");
  thead.querySelectorAll("th .arrow").forEach((el,i)=>el.textContent=(i===sortCol)?(sortDir>0?"▲":"▼"):"");
}
q.oninput=render;
document.getElementById("cols").onclick=()=>{showFilters=!showFilters;buildHead();render();};
document.getElementById("reset").onclick=()=>{q.value="";colFilters.fill("");sortCol=-1;buildHead();render();};
buildHead();render();
</script></body></html>"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser(description="Generate a Data Cloud stream/DLO/DMO inventory.")
    ap.add_argument("--org", default="jdo-oe0sdd", help="sf org alias (default: jdo-oe0sdd)")
    ap.add_argument("--out", default="output", help="output directory (default: ./output)")
    ap.add_argument("--api-version", default="67.0", help="Salesforce API version (default: 67.0)")
    ap.add_argument("--workers", type=int, default=16, help="parallel mapping queries (default: 16)")
    args = ap.parse_args()

    import os
    from datetime import datetime, timezone
    os.makedirs(args.out, exist_ok=True)
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    print(f"Auth via sf CLI for org '{args.org}'...", file=sys.stderr)
    instance, token = get_session(args.org)
    client = Client(instance, token, args.api_version)
    print(f"  {instance}", file=sys.stderr)

    print("Fetching data streams...", file=sys.stderr)
    streams = fetch_streams(client)
    print("Fetching DMOs...", file=sys.stderr)
    dmos = fetch_dmos(client)
    print(f"  {len(dmos)} DMOs", file=sys.stderr)
    print("Fetching DLOs (for orphan detection)...", file=sys.stderr)
    dlos = fetch_dlos(client)
    print(f"  {len(dlos)} DLOs", file=sys.stderr)
    print("Resolving DLO->DMO mappings (reverse, per DMO)...", file=sys.stderr)
    maps = fetch_mappings(client, dmos, args.workers)
    print(f"  {len(maps)} unique mappings", file=sys.stderr)

    stream_dmos = build_stream_dmos(streams, maps)
    rows = build_rows(streams, stream_dmos, dmos)
    breakdowns = build_breakdowns(rows, streams, dlos, stream_dmos)
    connectors = build_connectors(streams)

    sheets = {
        "Inventory": rows,
        "Unmapped Streams": breakdowns["Unmapped Streams"],
        "Needs Attention": breakdowns["Needs Attention"],
        "Orphaned DLOs": breakdowns["Orphaned DLOs"],
        "Summary by Connector": breakdowns["Summary by Connector"],
        "Summary by Category": breakdowns["Summary by Category"],
        "Summary by Source Object": breakdowns["Summary by Source Object"],
        "Connectors": connectors,
    }

    xlsx_path = os.path.join(args.out, "data_stream_inventory.xlsx")
    html_path = os.path.join(args.out, "data_stream_inventory.html")
    write_xlsx(xlsx_path, sheets)
    write_html(html_path, f"Data Cloud Inventory — {args.org}", rows, args.org, generated)

    mapped = sum(1 for r in rows if r["Is Mapped"])
    attn = len(breakdowns["Needs Attention"])
    print(
        f"\nDone. {len(rows)} streams | {mapped} mapped | {len(rows) - mapped} unmapped | "
        f"{attn} need attention | {len(breakdowns['Orphaned DLOs'])} orphaned DLOs",
        file=sys.stderr,
    )
    print(f"  {xlsx_path}", file=sys.stderr)
    print(f"  {html_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
