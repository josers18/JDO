import { describe, expect, it } from "vitest";
import { apiPath, buildCatalog, queryError, tabulate } from "../server/query.ts";
import { addToSelect, completing, linkSearch, rootSearch, searchWithChunks, insertion, rankObjects, resolveRef, sqlParams, tablesIn } from "../shared/sqlAssist.ts";
import type { QueryObject } from "../shared/types.ts";

const objects = buildCatalog(
  [
    { name: "ssot__AccountContact__dlm", displayName: "Account Contact", category: "Profile", fields: [] },
    { name: "ssot__Account__dlm", displayName: "Account", category: "Profile", fields: [{ name: "ssot__Name__c", displayName: "Name", type: "TEXT" }], primaryKeys: [{ name: "ssot__Id__c" }] },
    { name: "UnifiedssotAccountAcc__dlm", displayName: "Unified Account", category: "Profile", fields: [] },
    { name: "ssot__PartyAccount__dlm", displayName: "Party Account Link", category: "Related", fields: [] },
  ],
  [{ name: "Account_Home__dll", displayName: "Account Home", category: "Profile", fields: [{ name: "Id__c", displayName: "Id", type: "Text" }] }],
  [{ name: "Spend__cio", displayName: "Spend", dimensions: [{ name: "customer__c", type: "STRING" }], measures: [{ name: "total__c", type: "NUMBER" }] }],
);

describe("buildCatalog", () => {
  it("types each object, splits out unified ones and gives calculated insights their dimensions and measures", () => {
    const byName = Object.fromEntries(objects.map((o) => [o.name, o]));
    expect(byName["ssot__Account__dlm"]).toMatchObject({ type: "DMO", label: "Account", fields: [{ name: "ssot__Name__c", label: "Name", type: "TEXT" }] });
    expect(byName["UnifiedssotAccountAcc__dlm"]?.type).toBe("Unified");
    expect(byName["Account_Home__dll"]?.type).toBe("DLO");
    expect(byName["Spend__cio"]).toMatchObject({ type: "CI", category: "Calculated Insight", measures: ["total__c"] });
    expect(byName["Spend__cio"]?.fields.map((f) => [f.name, f.label])).toEqual([["customer__c", "customer__c"], ["total__c", "total__c"]]);
  });

  it("gives a profile DMO with a primary key a root to find its records by", () => {
    const byName = Object.fromEntries(objects.map((o) => [o.name, o]));
    expect(byName["ssot__Account__dlm"]?.root).toEqual({ object: "ssot__Account__dlm", key: "ssot__Id__c", show: ["ssot__Name__c"] });
    expect(byName["ssot__PartyAccount__dlm"]?.root).toBeUndefined();
  });
});

describe("rankObjects", () => {
  it("puts the object a typed word names first", () => {
    expect(rankObjects(objects, "account").map((o) => o.name)).toEqual([
      "ssot__Account__dlm",
      "ssot__AccountContact__dlm",
      "Account_Home__dll",
      "ssot__PartyAccount__dlm",
      "UnifiedssotAccountAcc__dlm",
    ]);
  });

  it("matches on the API name too, and drops what doesn't match", () => {
    expect(rankObjects(objects, "ssot__acc").map((o) => o.name)).toEqual(["ssot__Account__dlm", "ssot__AccountContact__dlm"]);
    expect(rankObjects(objects, "zzz")).toEqual([]);
  });
});

describe("SQL context", () => {
  const sql = "SELECT a.ssot__Name__c FROM ssot__Account__dlm a JOIN Account_Home__dll AS h ON a.ssot__Id__c = h.Id__c WHERE";

  it("finds the objects a statement reads and their aliases", () => {
    expect(tablesIn(sql)).toEqual([
      { table: "ssot__Account__dlm", alias: "a" },
      { table: "Account_Home__dll", alias: "h" },
    ]);
    expect(tablesIn("select * from ssot__Account__dlm where x = 1")).toEqual([{ table: "ssot__Account__dlm", alias: undefined }]);
    expect(resolveRef(sql, "H")).toBe("Account_Home__dll");
    expect(resolveRef(sql, "ssot__Account__dlm")).toBe("ssot__Account__dlm");
  });

  it("knows what the cursor is completing", () => {
    expect(completing("select * from acc")).toEqual({ kind: "object", typed: "acc" });
    expect(completing("select * from ")).toEqual({ kind: "object", typed: "" });
    expect(completing("select a.ssot__N")).toEqual({ kind: "field", of: "a", typed: "ssot__N" });
    expect(completing("select ")).toEqual({ kind: "any", typed: "" });
    expect(completing("select * from x where na")).toEqual({ kind: "any", typed: "na" });
  });
});

describe("queryError", () => {
  it("unwraps the JSON a SQL error carries in its message", () => {
    const body = [
      {
        errorCode: "BAD_REQUEST",
        message: JSON.stringify({
          errorMessage: "INVALID_ARGUMENT: unknown column 'nope'",
          traceId: "048c",
          primaryMessage: "unknown column 'nope'",
          customerDetail: "\nline 1, column 8: SELECT nope FROM ssot__Account__dlm\n                         ^~~~",
          sqlState: "42703",
        }),
      },
    ];
    expect(queryError(body, "HTTP 400")).toEqual({
      message: "unknown column 'nope'",
      detail: "line 1, column 8: SELECT nope FROM ssot__Account__dlm\n                         ^~~~",
      sqlState: "42703",
      traceId: "048c",
    });
  });

  it("falls back to a plain message", () => {
    expect(queryError([{ errorCode: "X", message: "Permission denied" }], "HTTP 403")).toEqual({ message: "Permission denied" });
    expect(queryError(undefined, "Write a SQL statement first")).toEqual({ message: "Write a SQL statement first" });
  });
});

describe("insertion", () => {
  // Applies an insertion at the | in `sql`.
  const drop = (sql: string, name = "F") => {
    const at = sql.indexOf("|");
    const before = sql.slice(0, at);
    const after = sql.slice(at + 1);
    const i = insertion(before, after, name);
    return before.slice(0, before.length - i.back) + i.text + after.slice(i.fwd);
  };

  it("joins a SELECT list with a comma on the right side", () => {
    expect(drop("SELECT |a.x, b FROM t")).toBe("SELECT F, a.x, b FROM t");
    expect(drop("SELECT a.x|, b FROM t")).toBe("SELECT a.x, F, b FROM t");
    expect(drop("SELECT a.x, b |FROM t")).toBe("SELECT a.x, b, F FROM t");
    expect(drop("SELECT a.x,| b FROM t")).toBe("SELECT a.x, F, b FROM t");
    expect(drop("SELECT COUNT(*)|\nFROM t")).toBe("SELECT COUNT(*), F\nFROM t");
    expect(drop("SELECT |FROM t")).toBe("SELECT F FROM t");
  });

  it("does the same in GROUP BY and ORDER BY", () => {
    expect(drop("SELECT a FROM t GROUP BY a|")).toBe("SELECT a FROM t GROUP BY a, F");
    expect(drop("SELECT a FROM t ORDER BY |a DESC")).toBe("SELECT a FROM t ORDER BY F, a DESC");
  });

  it("only spaces it elsewhere", () => {
    expect(drop("SELECT * FROM |")).toBe("SELECT * FROM F");
    expect(drop("SELECT * FROM t WHERE |= 1")).toBe("SELECT * FROM t WHERE F= 1");
    expect(drop("SELECT * FROM t WHERE x|")).toBe("SELECT * FROM t WHERE x F");
    expect(drop("SELECT COUNT(|) FROM t")).toBe("SELECT COUNT(F) FROM t");
  });
});

describe("buildCatalog: data graphs and search indexes", () => {
  const all = buildCatalog(
    [{ name: "Docs_index__dlm", displayName: "Docs index", fields: [{ name: "Chunk__c", type: "TEXT" }] }],
    [],
    [],
    [
      {
        developerName: "Account_DG",
        primaryObjectName: "ssot__Account__dlm",
        dgObject: {
          fields: [
            { developerName: "ssot__Id__c", dataType: "STRING", keyCol: "true" },
            { developerName: "KQ_Name__c", dataType: "STRING" },
            { developerName: "ssot__Name__c", dataType: "STRING" },
          ],
        },
      },
    ],
    [
      { developerName: "Docs", label: "Docs index", searchType: "VECTOR", runtimeStatus: "READY", vectorDmoDeveloperName: "Docs_index__dlm", chunkDmoDeveloperName: "Docs_chunk__dlm" },
      { developerName: "Kb", label: "KB", searchType: "HYBRID", runtimeStatus: "FAILED", vectorDmoDeveloperName: "Kb_index__dlm" },
    ],
  );
  const of = (type: string) => all.filter((o) => o.type === type);

  it("lists a data graph under its primary object with the primary object's fields", () => {
    expect(of("DG")).toMatchObject([{ name: "Account_DG", label: "Account_DG", type: "DG", category: "ssot__Account__dlm", fields: [{ name: "ssot__Id__c" }, { name: "KQ_Name__c" }, { name: "ssot__Name__c" }] }]);
  });

  it("gives a data graph its root: object, primary key and name fields, key qualifiers left out", () => {
    expect(of("DG")[0]!.root).toEqual({ object: "ssot__Account__dlm", key: "ssot__Id__c", show: ["ssot__Name__c"] });
  });

  it("names a search index by its index DMO, with that DMO's fields and the function that searches it", () => {
    const [docs, kb] = [...of("SI")].sort((a, b) => a.name.localeCompare(b.name));
    expect(docs).toMatchObject({ name: "Docs_index__dlm", category: "Vector search", searchFunction: "vector_search", chunk: "Docs_chunk__dlm", fields: [{ name: "Chunk__c" }] });
    expect(kb).toMatchObject({ label: "KB (failed)", category: "Hybrid search", searchFunction: "hybrid_search", fields: [] });
    expect(kb).not.toHaveProperty("chunk");
  });
});

describe("apiPath", () => {
  it("reads a data graph by ID, or by lookup keys with the brackets added", () => {
    expect(apiPath({ kind: "dataGraph", params: { graph: "Account_DG", id: "001x", live: "true" } }, "")).toBe("/ssot/data-graphs/data/Account_DG/001x?live=true");
    expect(apiPath({ kind: "dataGraph", params: { graph: "Account_DG", lookupKeys: "ssot__Account__dlm.ssot__Id__c=001x" } }, "sales")).toBe(
      "/ssot/data-graphs/data/Account_DG?lookupKeys=%5Bssot__Account__dlm.ssot__Id__c%3D001x%5D&dataspace=sales",
    );
    expect(() => apiPath({ kind: "dataGraph", params: { graph: "Account_DG" } }, "")).toThrow("lookupKeys");
  });

  it("passes only the insight parameters that are filled in", () => {
    expect(apiPath({ kind: "insight", params: { ci: "Spend__cio", measures: "total__c", orderby: "total__c DESC", filters: "[a__c=b]", offset: " " } }, "")).toBe(
      "/ssot/insight/calculated-insights/Spend__cio?measures=total__c&filters=%5Ba__c%3Db%5D&orderby=total__c%20DESC",
    );
  });

  it("builds each profile path and needs a filter without an ID", () => {
    expect(() => apiPath({ kind: "profile", params: { dmo: "ssot__Individual__dlm" } }, "")).toThrow("filter");
    expect(apiPath({ kind: "profile", params: { dmo: "ssot__Individual__dlm", filters: "ssot__FirstName__c=Sarah", batchSize: "5" } }, "")).toBe(
      "/ssot/profile/ssot__Individual__dlm?filters=%5Bssot__FirstName__c%3DSarah%5D&batchSize=5",
    );
    expect(apiPath({ kind: "profile", params: { dmo: "I__dlm", id: "1", child: "E__dlm", fields: "a__c,b__c" } }, "")).toBe("/ssot/profile/I__dlm/1/E__dlm?fields=a__c%2Cb__c");
    expect(apiPath({ kind: "profile", params: { dmo: "I__dlm", id: "1", child: "E__dlm", ci: "S__cio" } }, "")).toBe("/ssot/profile/I__dlm/1/calculated-insights/S__cio");
  });

  it("encodes every universal ID segment", () => {
    expect(apiPath({ kind: "universalId", params: { entity: "UnifiedLinkssotAccountAcc__dlm", dataSourceId: "Salesforce_X", dataSourceObjectId: "Account", sourceRecordId: "a/b" } }, "")).toBe(
      "/ssot/universalIdLookup/UnifiedLinkssotAccountAcc__dlm/Salesforce_X/Account/a%2Fb",
    );
    expect(() => apiPath({ kind: "universalId", params: { entity: "E" } }, "")).toThrow("dataSourceId");
  });
});

describe("tabulate", () => {
  it("makes columns from every key seen, typed by the first value that isn't null", () => {
    const { page, done } = tabulate({ data: [{ a__c: "x", n__c: null }, { n__c: 2, b__c: true }], done: false });
    expect(page.metadata).toEqual([
      { name: "a__c", type: "Text" },
      { name: "n__c", type: "Number" },
      { name: "b__c", type: "Boolean" },
    ]);
    expect(page.data).toEqual([
      ["x", null, null],
      [null, 2, true],
    ]);
    expect(done).toBe(false);
  });

  it("unescapes and parses a data graph's json_blob__c", () => {
    const blob = '{&quot;ssot__Id__c&quot;:&quot;001&quot;,&quot;ssot__Opportunity__dlm&quot;:[{&quot;ssot__Name__c&quot;:&quot;A &amp; B&quot;}]}';
    const { page, done } = tabulate({ data: [{ json_blob__c: blob }], done: true });
    expect(page.metadata?.map((c) => [c.name, c.type])).toEqual([
      ["ssot__Id__c", "Text"],
      ["ssot__Opportunity__dlm", "Array"],
    ]);
    expect(page.data?.[0]?.[1]).toEqual([{ ssot__Name__c: "A & B" }]);
    expect(done).toBe(true);
  });
});

describe("sqlParams", () => {
  it("finds named parameters once each, skipping casts, strings and comments", () => {
    expect(sqlParams("SELECT x::text FROM t WHERE a = :acct AND b > :since AND c = ':no' -- :nor\n AND d = :acct")).toEqual(["acct", "since"]);
    expect(sqlParams("SELECT 1")).toEqual([]);
  });
});

describe("addToSelect", () => {
  it("adds the field as the last select item", () => {
    expect(addToSelect("SELECT a, b FROM t LIMIT 100", "c")).toBe("SELECT a, b, c FROM t LIMIT 100");
  });
  it("replaces a bare star", () => {
    expect(addToSelect("SELECT * FROM UnifiedssotAccountAcc__dlm LIMIT 100", "BillingState__c")).toBe("SELECT BillingState__c FROM UnifiedssotAccountAcc__dlm LIMIT 100");
  });
  it("keeps DISTINCT and fills an empty list", () => {
    expect(addToSelect("SELECT DISTINCT a FROM t", "b")).toBe("SELECT DISTINCT a, b FROM t");
    expect(addToSelect("SELECT FROM t", "b")).toBe("SELECT b FROM t");
  });
  it("leaves a field already selected alone", () => {
    expect(addToSelect("SELECT t.a, b FROM t", "a")).toBe("SELECT t.a, b FROM t");
  });
  it("ignores commas and FROM inside functions, strings and subqueries", () => {
    expect(addToSelect("SELECT coalesce(a, 'x, from y') AS z FROM t", "b")).toBe("SELECT coalesce(a, 'x, from y') AS z, b FROM t");
    expect(addToSelect("SELECT a FROM (SELECT a FROM t) s", "b")).toBe("SELECT a, b FROM (SELECT a FROM t) s");
  });
  it("adds to an existing GROUP BY, before HAVING and ORDER BY", () => {
    expect(addToSelect("SELECT a, SUM(x) AS s FROM t GROUP BY a ORDER BY s DESC LIMIT 10", "b")).toBe(
      "SELECT a, SUM(x) AS s, b FROM t GROUP BY a, b ORDER BY s DESC LIMIT 10",
    );
    expect(addToSelect("SELECT a, COUNT(*) FROM t GROUP BY a HAVING COUNT(*) > 1", "b")).toBe("SELECT a, COUNT(*), b FROM t GROUP BY a, b HAVING COUNT(*) > 1");
  });
  it("adds the next position when GROUP BY lists positions", () => {
    expect(addToSelect("SELECT a, COUNT(*) FROM t GROUP BY 1", "b")).toBe("SELECT a, COUNT(*), b FROM t GROUP BY 1, 3");
  });
  it("creates GROUP BY when the select aggregates", () => {
    expect(addToSelect("SELECT COUNT(*) FROM t WHERE y = 1 LIMIT 100", "b")).toBe("SELECT COUNT(*), b FROM t WHERE y = 1 GROUP BY b LIMIT 100");
    expect(addToSelect("SELECT SUM(x) FROM t;", "b")).toBe("SELECT SUM(x), b FROM t GROUP BY b;");
    expect(addToSelect("SELECT SUM(x)\nFROM t\nORDER BY 1", "b")).toBe("SELECT SUM(x), b\nFROM t\nGROUP BY b\nORDER BY 1");
  });
  it("does not group for window functions", () => {
    expect(addToSelect("SELECT a, SUM(x) OVER (PARTITION BY a) FROM t", "b")).toBe("SELECT a, SUM(x) OVER (PARTITION BY a), b FROM t");
  });
  it("qualifies the field when several objects are joined", () => {
    expect(addToSelect("SELECT a.x FROM acc a JOIN ind i ON a.id = i.id", "y", "ind")).toBe("SELECT a.x, i.y FROM acc a JOIN ind i ON a.id = i.id");
    expect(addToSelect("SELECT x FROM acc", "y", "acc")).toBe("SELECT x, y FROM acc");
  });
  it("returns null without SELECT ... FROM", () => {
    expect(addToSelect("WHERE a = 1", "b")).toBeNull();
  });
});

describe("rootSearch", () => {
  const root = { object: "ssot__Account__dlm", key: "ssot__Id__c", show: ["ssot__Name__c"] };
  it("lists the first records without text", () => {
    expect(rootSearch(root, " ")).toEqual({ sql: "SELECT DISTINCT ssot__Id__c, ssot__Name__c FROM ssot__Account__dlm WHERE TRIM(ssot__Name__c) <> '' ORDER BY ssot__Name__c LIMIT 20", sqlParameters: [] });
  });
  it("matches names or the exact key through parameters, wildcards escaped", () => {
    expect(rootSearch(root, "50% o'brien")).toEqual({
      sql: "SELECT DISTINCT ssot__Id__c, ssot__Name__c FROM ssot__Account__dlm WHERE ssot__Name__c ILIKE :q OR ssot__Id__c = :id ORDER BY ssot__Name__c LIMIT 20",
      sqlParameters: [
        { name: "q", type: "Varchar", value: "%50\\% o'brien%" },
        { name: "id", type: "Varchar", value: "50% o'brien" },
      ],
    });
  });
  it("searches the key when the root has no name field", () => {
    expect(rootSearch({ object: "ssot__Individual__dlm", key: "ssot__Id__c", show: [] }, "003").sql).toBe("SELECT DISTINCT ssot__Id__c FROM ssot__Individual__dlm WHERE ssot__Id__c ILIKE :q LIMIT 20");
  });
});

describe("linkSearch", () => {
  const unified = { object: "UnifiedssotAccountAcc__dlm", key: "ssot__Id__c", show: ["ssot__Name__c"] };
  const scope = [
    { name: "src", type: "Varchar", value: "Salesforce_Home" },
    { name: "obj", type: "Varchar", value: "Account" },
  ];
  it("lists one source's records named by their unified profile", () => {
    expect(linkSearch("UnifiedLinkssotAccountAcc__dlm", unified, "Salesforce_Home", "Account", "")).toEqual({
      sql: "SELECT DISTINCT l.SourceRecordId__c, u.ssot__Name__c FROM UnifiedLinkssotAccountAcc__dlm l LEFT JOIN UnifiedssotAccountAcc__dlm u ON u.ssot__Id__c = l.UnifiedRecordId__c WHERE l.ssot__DataSourceId__c = :src AND l.ssot__DataSourceObjectId__c = :obj ORDER BY u.ssot__Name__c LIMIT 20",
      sqlParameters: scope,
    });
  });
  it("matches a name or the source record ID, and without a known profile just the ID", () => {
    expect(linkSearch("UnifiedLinkssotAccountAcc__dlm", unified, "Salesforce_Home", "Account", "acme").sql).toContain("AND (u.ssot__Name__c ILIKE :q OR l.SourceRecordId__c ILIKE :q) ORDER BY");
    expect(linkSearch("UnifiedLinkX__dlm", undefined, "Salesforce_Home", "Account", "001")).toEqual({
      sql: "SELECT DISTINCT l.SourceRecordId__c FROM UnifiedLinkX__dlm l WHERE l.ssot__DataSourceId__c = :src AND l.ssot__DataSourceObjectId__c = :obj AND (l.SourceRecordId__c ILIKE :q) LIMIT 20",
      sqlParameters: [...scope, { name: "q", type: "Varchar", value: "%001%" }],
    });
  });
});

describe("searchWithChunks", () => {
  const objects = [
    { name: "CSAT_index__dlm", label: "CSAT", type: "SI", category: "Vector search", fields: [], searchFunction: "vector_search", chunk: "CSAT_chunk__dlm" },
    { name: "Kb_index__dlm", label: "KB", type: "SI", category: "Hybrid search", fields: [], searchFunction: "hybrid_search", chunk: "Kb_chunk__dlm" },
    { name: "Bare_index__dlm", label: "Bare", type: "SI", category: "Vector search", fields: [], searchFunction: "vector_search" },
  ] as QueryObject[];
  it("joins a vector search to its chunk text, best match first", () => {
    expect(searchWithChunks("SELECT * FROM vector_search(TABLE(CSAT_index__dlm), 'upset, (very)', '', 10)", objects)).toBe(
      [
        "SELECT c.Chunk__c, v.score__c, v.SourceRecordId__c, c.DataSourceObject__c, c.ChunkSequenceNumber__c, v.RecordId__c",
        "FROM vector_search(TABLE(CSAT_index__dlm), 'upset, (very)', '', 10) v",
        "JOIN CSAT_chunk__dlm c ON c.RecordId__c = v.RecordId__c",
        "ORDER BY v.score__c DESC",
      ].join("\n"),
    );
  });
  it("orders a hybrid search by its hybrid score and keeps a LIMIT", () => {
    const sql = searchWithChunks("select * from hybrid_search(table(kb_index__dlm), 'it''s', 'Country__c=''US''', 5) limit 3;", objects)!;
    expect(sql).toContain("SELECT c.Chunk__c, v.hybrid_score__c, v.vector_score__c, v.keyword_score__c,");
    expect(sql).toContain("JOIN Kb_chunk__dlm c ON");
    expect(sql.endsWith("ORDER BY v.hybrid_score__c DESC\nLIMIT 3")).toBe(true);
  });
  it("leaves other shapes, and indexes without a chunk DMO, alone", () => {
    expect(searchWithChunks("SELECT v.* FROM vector_search(TABLE(CSAT_index__dlm), 'x', '', 10) v", objects)).toBeNull();
    expect(searchWithChunks("SELECT * FROM vector_search(TABLE(CSAT_index__dlm), 'x', '', 10) WHERE score__c > 0.5", objects)).toBeNull();
    expect(searchWithChunks("SELECT * FROM vector_search(TABLE(Bare_index__dlm), 'x', '', 10)", objects)).toBeNull();
    expect(searchWithChunks("SELECT * FROM CSAT_index__dlm", objects)).toBeNull();
  });
});
