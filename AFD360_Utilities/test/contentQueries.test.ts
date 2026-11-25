import { describe, expect, it } from "vitest";
import { contentKinds, contentQuery } from "../shared/contentQueries";
import type { QueryObject } from "../shared/types";

const object = (name: string, names: string[]): QueryObject => ({
  type: "DMO", name, category: "", label: name, fields: names.map(name => ({ name, label: name, type: "Text" })),
});
const doc = object("ssot__ContentDocument__dlm", ["ssot__Id__c", "ssot__Title__c", "ssot__FileType__c", "ssot__LatestPublishedVersionId__c", "KQ_LatestPublishedVersionId__c"]);
const version = object("ssot__ContentDocumentVersion__dlm", ["ssot__Id__c", "ssot__ContentDocumentId__c", "KQ_Id__c"]);
describe("Content shortcuts", () => {
  it("requires both document and version, and selects the published version", () => {
    for (const kind of contentKinds) {
      expect(contentQuery(kind, [doc])).toBeNull();
      const sql = contentQuery(kind, [doc, version]);
      expect(sql).toContain("v.ssot__Id__c = d.ssot__LatestPublishedVersionId__c");
      expect(sql).toContain("v.KQ_Id__c IS NOT DISTINCT FROM d.KQ_LatestPublishedVersionId__c");
      expect(sql).not.toContain("LEFT JOIN");
    }
  });
  it("reads notes from the version source and joins only account links", () => {
    const notes = object("ContentVersion__dll", ["Title__c", "FileType__c", "ContentDocumentId__c", "IsLatest__c", "TextPreview__c", "KQ_ContentDocumentId__c"]);
    const links = object("ContentDocumentLink__dll", ["ContentDocumentId__c", "LinkedEntityId__c", "KQ_ContentDocumentId__c"]);
    const sql = contentQuery("Notes", [notes, links]);
    expect(sql).toContain("v.ContentDocumentId__c AS note_id");
    expect(sql).toContain("l.LinkedEntityId__c AS account_id");
    expect(sql).toMatch(/LEFT JOIN ContentDocumentLink__dll[^]*AND l.LinkedEntityId__c LIKE '001%'\nWHERE/);
    expect(sql?.match(/JOIN/g)).toHaveLength(1);
    expect(contentQuery("Notes", [notes])).toContain("CAST(NULL AS VARCHAR) AS account_id");
  });
  it.each([["Images", "PNG"], ["HTML", "HTML"], ["Documents", "PDF"]] as const)(
    "reads %s directly from current versions with one optional account join", (kind, type) => {
      const source = object("ContentVersion__dll", ["Title__c", "FileType__c", "ContentDocumentId__c", "IsLatest__c", "Id__c", "VersionDataUrl__c"]);
      const relation = object("ssot__ContentDocumentRelationship__dlm", ["ssot__ContentDocumentId__c", "ssot__RelatedItemId__c"]);
      const sql = contentQuery(kind, [doc, version, source, relation]);
      expect(sql).toContain("FROM ContentVersion__dll v");
      expect(sql?.match(/JOIN/g)).toHaveLength(1);
      expect(sql).toContain("l.ssot__RelatedItemId__c AS account_id");
      expect(sql).toContain("AND l.ssot__RelatedItemId__c LIKE '001%'");
      expect(sql).toContain(`'${type}'`);
      expect(sql).toContain("v.ContentDocumentId__c AS content_document_id");
      expect(sql).toContain("v.VersionDataUrl__c AS version_url");
      expect(contentQuery(kind, [source])).not.toContain("JOIN");
    });
  it("retains current versions with missing parents when the source latest flag is available", () => {
    const mapped = object(version.name, [...version.fields.map(f => f.name), "ssot__Title__c", "ssot__FileType__c"]);
    const sql = contentQuery("HTML", [doc, mapped, object("ContentVersion__dll", ["Id__c", "IsLatest__c"])]);
    expect(sql).toContain("LEFT JOIN ssot__ContentDocument__dlm");
    expect(sql).toContain("d.ssot__Id__c IS NULL AND LOWER(CAST(p.IsLatest__c AS VARCHAR))");
    expect(sql).toContain("COALESCE(d.ssot__FileType__c, v.ssot__FileType__c)");
  });
  it("includes note previews and linked record ids only when mapped", () => {
    const objects = [doc, version, object("ContentVersion__dll", ["Id__c", "TextPreview__c"]), object("ssot__ContentDocumentRelationship__dlm", ["ssot__ContentDocumentId__c", "ssot__RelatedItemId__c"])];
    expect(contentQuery("Notes", objects)).toContain("p.TextPreview__c AS note_preview");
    expect(contentQuery("Images", objects)).not.toContain("note_preview");
    expect(contentQuery("Notes", objects)).toContain("LEFT JOIN ssot__ContentDocumentRelationship__dlm");
    expect(contentQuery("Notes", objects)).toContain("IN ('SNOTE')");
  });
});
