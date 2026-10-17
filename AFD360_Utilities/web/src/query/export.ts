import { strToU8, zipSync } from "fflate";

// Query results out of the browser: CSV, a real .xlsx (frozen bold header + autofilter), and the request as code.

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// With a BOM so Excel reads it as UTF-8.
export function toCsv(columns: string[], rows: unknown[][]): string {
  return "\uFEFF" + [columns, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const xml = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

// A1-style column letters: 0 -> A, 26 -> AA.
export function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function cell(ref: string, v: unknown, style = 0): string {
  const s = style ? ` s="${style}"` : "";
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  if (typeof v === "boolean") return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
  const text = typeof v === "object" ? JSON.stringify(v) : String(v);
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(text.slice(0, 32767))}</t></is></c>`;
}

export function toXlsx(columns: string[], rows: unknown[][], sheet = "Results"): Uint8Array {
  const last = colName(Math.max(0, columns.length - 1));
  const range = `A1:${last}${rows.length + 1}`;
  const body = [columns, ...rows]
    .map((r, i) => `<row r="${i + 1}">${r.map((v, j) => cell(`${colName(j)}${i + 1}`, v, i === 0 ? 1 : 0)).join("")}</row>`)
    .join("");
  const name = xml(sheet.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Results");
  const files: Record<string, string> = {
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      `<sheet name="${name}" sheetId="1" r:id="rId1"/></sheets><definedNames>` +
      `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${name.replace(/'/g, "''")}'!$A$1:$${last}$${rows.length + 1}</definedName>` +
      "</definedNames></workbook>",
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/></patternFill></fill></fills>' +
      '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>' +
      '<cellXfs count="2"><xf xfId="0"/><xf xfId="0" fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    "xl/worksheets/sheet1.xml":
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      `<sheetData>${body}</sheetData><autoFilter ref="${range}"/></worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}

export function download(name: string, data: string | Uint8Array, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export interface RequestShape {
  method: string;
  url: string;
  body?: unknown;
}

// The call as someone would run it themselves; the token stays a placeholder.
export function asCurl(r: RequestShape): string {
  const lines = [`curl -X ${r.method} '${r.url}'`, `  -H 'Authorization: Bearer $TOKEN'`];
  if (r.body !== undefined) {
    lines.push(`  -H 'Content-Type: application/json'`);
    lines.push(`  --data '${JSON.stringify(r.body).replace(/'/g, `'\\''`)}'`);
  }
  return lines.join(" \\\n");
}

export function asFetch(r: RequestShape): string {
  const opts = [`  method: "${r.method}",`, `  headers: { Authorization: \`Bearer \${token}\`${r.body !== undefined ? ', "Content-Type": "application/json"' : ""} },`];
  if (r.body !== undefined) opts.push(`  body: JSON.stringify(${JSON.stringify(r.body, null, 2).replace(/\n/g, "\n  ")}),`);
  return `const res = await fetch("${r.url}", {\n${opts.join("\n")}\n});\nconst result = await res.json();`;
}
