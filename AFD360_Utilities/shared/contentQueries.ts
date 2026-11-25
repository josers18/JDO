import type { QueryObject } from "./types.ts";

const fileTypes = {
  Notes: ["SNOTE"],
  Images: ["BMP", "GIF", "JPEG", "JPG", "PNG", "SVG", "TIFF", "WEBP", "HEIC"],
  HTML: ["HTML", "HTM", "XHTML"],
  Documents: ["PDF", "WORD", "WORD_X", "EXCEL", "EXCEL_X", "POWER_POINT", "POWER_POINT_X", "TEXT", "TXT", "RTF", "CSV", "ODT", "ODS", "ODP"],
};
export const contentKinds = Object.keys(fileTypes) as (keyof typeof fileTypes)[];
export type ContentKind = keyof typeof fileTypes;

export function contentQuery(kind: ContentKind, objects: QueryObject[]): string | null {
  const has = (name: string, fields: string[]) => {
    const object = objects.find(o => o.name === name);
    return fields.every(field => object?.fields.some(f => f.name === field));
  };
  const doc = "ssot__ContentDocument__dlm";
  const version = "ssot__ContentDocumentVersion__dlm";
  const link = "ssot__ContentDocumentRelationship__dlm";
  const source = "ContentVersion__dll";
  const sourceLink = "ContentDocumentLink__dll";
  if (has(source, ["Title__c", "ContentDocumentId__c", "FileType__c", "IsLatest__c"])) {
    const fields = ["v.Title__c AS title"];
    const joins = [];
    const relation = [
      { table: sourceLink, document: "ContentDocumentId__c", record: "LinkedEntityId__c" },
      { table: link, document: "ssot__ContentDocumentId__c", record: "ssot__RelatedItemId__c" },
    ].find(r => has(r.table, [r.document, r.record]));
    if (relation) {
      fields.push(`l.${relation.record} AS account_id`);
      joins.push(`LEFT JOIN ${relation.table} l ON l.${relation.document} = v.ContentDocumentId__c`);
      if (has(relation.table, ["KQ_ContentDocumentId__c"]) && has(source, ["KQ_ContentDocumentId__c"]))
        joins.push(" AND l.KQ_ContentDocumentId__c IS NOT DISTINCT FROM v.KQ_ContentDocumentId__c");
      joins.push(` AND l.${relation.record} LIKE '001%'`);
    } else fields.push("CAST(NULL AS VARCHAR) AS account_id");
    const isNote = kind === "Notes";
    const documentId = isNote ? "note_id" : "content_document_id";
    if (isNote && has(source, ["TextPreview__c"])) fields.push("v.TextPreview__c AS note_preview");
    if (!isNote) fields.push("v.FileType__c AS file_type");
    fields.push(`v.ContentDocumentId__c AS ${documentId}`);
    if (!isNote && has(source, ["Id__c"])) fields.push("v.Id__c AS content_version_id");
    if (!isNote && has(source, ["VersionDataUrl__c"])) fields.push("v.VersionDataUrl__c AS version_url");
    const filter = isNote ? "= 'SNOTE'" : `IN (${fileTypes[kind].map(type => `'${type}'`).join(", ")})`;
    return [`SELECT ${fields.join(",\n       ")}`, `FROM ${source} v`, ...joins,
      `WHERE v.FileType__c ${filter}`, "  AND LOWER(CAST(v.IsLatest__c AS VARCHAR)) IN ('true', '1')",
      `ORDER BY account_id NULLS LAST, title, ${documentId}`, "LIMIT 100"].join("\n");
  }
  if (!has(doc, ["ssot__Id__c", "ssot__LatestPublishedVersionId__c", "ssot__Title__c", "ssot__FileType__c"]) ||
      !has(version, ["ssot__Id__c", "ssot__ContentDocumentId__c"])) return null;

  const qualifier = (left: string, leftField: string, right: string, rightField: string, a: string, b: string) =>
    has(left, [leftField]) && has(right, [rightField]) ? `\n AND ${a}.${leftField} IS NOT DISTINCT FROM ${b}.${rightField}` : "";
  const sourceLatest = has(source, ["Id__c", "IsLatest__c"]);
  const retainOrphans = has(version, ["ssot__Title__c", "ssot__FileType__c"]) &&
    (sourceLatest || has(version, ["ssot__IsLatest__c"]));
  const title = retainOrphans ? "COALESCE(d.ssot__Title__c, v.ssot__Title__c)" : "d.ssot__Title__c";
  const fileType = retainOrphans ? "COALESCE(d.ssot__FileType__c, v.ssot__FileType__c)" : "d.ssot__FileType__c";
  const select = [`${title} AS title`, `${fileType} AS file_type`];
  const joins = [
    `FROM ${version} v`,
    `${retainOrphans ? "LEFT JOIN" : "JOIN"} ${doc} d ON v.ssot__ContentDocumentId__c = d.ssot__Id__c` +
      qualifier(version, "KQ_ContentDocumentId__c", doc, "KQ_Id__c", "v", "d"),
  ];
  const preview = kind === "Notes" && has(source, ["Id__c", "TextPreview__c"]);
  if (preview) select.push("p.TextPreview__c AS note_preview");
  if (preview || (retainOrphans && sourceLatest)) {
    joins.push(`LEFT JOIN ${source} p ON p.Id__c = v.ssot__Id__c` +
      qualifier(source, "KQ_Id__c", version, "KQ_Id__c", "p", "v"));
  }
  if (has(link, ["ssot__ContentDocumentId__c", "ssot__RelatedItemId__c"])) {
    select.push("l.ssot__RelatedItemId__c AS account_id");
    joins.push(`LEFT JOIN ${link} l ON l.ssot__ContentDocumentId__c = v.ssot__ContentDocumentId__c` +
      qualifier(link, "KQ_ContentDocumentId__c", version, "KQ_ContentDocumentId__c", "l", "v") +
      "\n AND l.ssot__RelatedItemId__c LIKE '001%'");
  }
  if (!select.some(field => field.endsWith(" AS account_id"))) select.push("CAST(NULL AS VARCHAR) AS account_id");
  select.push("v.ssot__ContentDocumentId__c AS content_document_id", "v.ssot__Id__c AS content_version_id");
  if (has(version, ["ssot__VersionDataText__c"])) select.push("v.ssot__VersionDataText__c AS version_data");
  if (has(version, ["ssot__VersionDataUrl__c"])) select.push("v.ssot__VersionDataUrl__c AS version_url");
  const published = "v.ssot__Id__c = d.ssot__LatestPublishedVersionId__c" +
    qualifier(version, "KQ_Id__c", doc, "KQ_LatestPublishedVersionId__c", "v", "d");
  const latest = sourceLatest ? "p.IsLatest__c" : "v.ssot__IsLatest__c";
  const current = retainOrphans ? `((${published}) OR (d.ssot__Id__c IS NULL AND LOWER(CAST(${latest} AS VARCHAR)) IN ('true', '1')))` : published;
  return [`SELECT ${select.join(",\n       ")}`, ...joins,
    `WHERE ${fileType} IN (${fileTypes[kind].map(type => `'${type}'`).join(", ")})`,
    `  AND ${current}`, "ORDER BY title, content_document_id", "LIMIT 100"].join("\n");
}
