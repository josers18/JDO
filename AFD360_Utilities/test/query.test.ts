import { describe, expect, it } from "vitest";
import { buildCatalog, queryError } from "../server/query.ts";
import { completing, insertion, rankObjects, resolveRef, tablesIn } from "../shared/sqlAssist.ts";

const objects = buildCatalog(
  [
    { name: "ssot__AccountContact__dlm", displayName: "Account Contact", category: "Profile", fields: [] },
    { name: "ssot__Account__dlm", displayName: "Account", category: "Profile", fields: [{ name: "ssot__Name__c", displayName: "Name", type: "TEXT" }] },
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
    expect(byName["Spend__cio"]).toMatchObject({ type: "CI", category: "Calculated Insight" });
    expect(byName["Spend__cio"]?.fields.map((f) => [f.name, f.label])).toEqual([["customer__c", "customer__c"], ["total__c", "total__c"]]);
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
