import { describe, it, expect } from "vitest";

import { buildEngineRepoBundle, cqlIndex } from "../repoBundle";

/**
 * ⭐⭐ PINS A MEASURED ENGINE REQUIREMENT.
 *
 * A repository bundle built from the emitted definitions ALONE fails at runtime with
 * `Cannot read the array length because "buf" is null` — an expression-level error that never mentions
 * the missing CQL. That is what an emitted `Library` looks like: `content[0]` carries
 * `contentType: text/cql` and a RELATIVE `url` into the other emit lane, with no `data`. Correct for an
 * IG on disk; unusable for an in-memory repository, which cannot follow the URL.
 */
const LIB = (id: string, withData = false) => ({
  resourceType: "Library",
  id,
  content: [
    withData
      ? { contentType: "text/cql", data: "cHJlLWV4aXN0aW5n" }
      : { contentType: "text/cql", url: `../../cql/${id}.cql` },
  ],
});

describe("the engine repository inlines CQL, because a URL is unresolvable in memory", () => {
  it("⭐ inlines as base64 and DROPS the now-misleading relative url", () => {
    const r = buildEngineRepoBundle({
      definitions: [LIB("Alpha"), { resourceType: "PlanDefinition", id: "pd" }],
      cqlByLibraryFile: cqlIndex([{ outputFilename: "Alpha.cql", cql: "library Alpha version '1'" }]),
      caseInput: { caseName: "c", resources: [] },
    });
    expect(r.inlined).toEqual(["Alpha"]);
    const lib = r.bundle.entry.map((e) => e.resource).find((x) => x.resourceType === "Library");
    const content = lib?.content?.[0];
    expect(content?.data).toBe(Buffer.from("library Alpha version '1'", "utf8").toString("base64"));
    // Leaving the url would invite the next reader to think the file is this bundle's source of truth.
    expect(content?.url).toBeUndefined();
  });

  it("⚠ a Library with NO available CQL is REPORTED, never silently passed through", () => {
    // The engine's failure for this case names the CQL expression and says nothing about missing bytes,
    // so a silent skip here becomes an unexplainable error there.
    const r = buildEngineRepoBundle({
      definitions: [LIB("Orphan")],
      cqlByLibraryFile: {},
      caseInput: { caseName: "c", resources: [] },
    });
    expect(r.missingCql).toEqual(["Orphan"]);
    expect(r.inlined).toEqual([]);
  });

  it("⭐ pre-existing content.data is left alone", () => {
    const r = buildEngineRepoBundle({
      definitions: [LIB("Already", true)],
      cqlByLibraryFile: cqlIndex([{ outputFilename: "Already.cql", cql: "should not overwrite" }]),
      caseInput: { caseName: "c", resources: [] },
    });
    expect(r.inlined).toEqual([]);
    const lib = r.bundle.entry.map((e) => e.resource).find((x) => x.resourceType === "Library");
    expect(lib?.content?.[0].data).toBe("cHJlLWV4aXN0aW5n");
  });

  it("⚠ the caller's definitions are NOT mutated — one emit serves many cases", () => {
    const defs = [LIB("Shared")];
    buildEngineRepoBundle({
      definitions: defs,
      cqlByLibraryFile: cqlIndex([{ outputFilename: "Shared.cql", cql: "x" }]),
      caseInput: { caseName: "c1", resources: [] },
    });
    // Inlining mutates `content`; without a deep copy the second case would see the first case's bundle.
    expect(defs[0].content[0].data).toBeUndefined();
    expect(defs[0].content[0].url).toBe("../../cql/Shared.cql");
  });

  it("⭐ carries ONE case's data — a shared repository lets cases satisfy each other's retrieves", () => {
    const r = buildEngineRepoBundle({
      definitions: [],
      cqlByLibraryFile: {},
      caseInput: {
        caseName: "c",
        resources: [
          { resourceType: "Patient", id: "p1", body: { resourceType: "Patient", id: "p1" } },
          { resourceType: "Observation", id: "o1", body: { resourceType: "Observation", id: "o1" } },
        ],
      },
    });
    expect(r.bundle.entry.length).toBe(2);
    expect(r.bundle.type).toBe("collection");
  });
});
