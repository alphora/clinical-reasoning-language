import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";

import { writeTwoLane, EmitWriteError } from "../emit-writers";
import { writeEmitResult } from "../cel/emitter";
import type { EmitCrlTwoLaneResult } from "../emit-two-lane";
import type { EmitResult } from "../cel/emitter/types";

/**
 * T2 — the shared filesystem writer behind BOTH the `crl-emit --target fhir-def`
 * CLI and the `emit_crl`/`emit_cel` MCP `out` directory. These pin the layout,
 * the absolute-path manifest, the containment guard, and the partial-write
 * accounting that the MCP `out` mode and the CLI both rely on.
 */

// Minimal EmitCrlTwoLaneResult — writeTwoLane reads only `cqlLibraries` and
// `fhir.resources`; the rest of the envelope is irrelevant to the writer.
function makeTwo(
  cqlLibraries: Array<{ outputFilename: string; cql: string }>,
  fhirResources: Array<{ resourceType: string; relativePath: string; resource: Record<string, unknown> }>,
): EmitCrlTwoLaneResult {
  return {
    success: true,
    fhir: { resources: fhirResources } as unknown as EmitCrlTwoLaneResult["fhir"],
    cql: {} as unknown as EmitCrlTwoLaneResult["cql"],
    cqlLibraries,
    fhirHardErrors: [],
    hardErrors: [],
    warnings: [],
    filenameCollisions: [],
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "emit-writers-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("writeTwoLane", () => {
  it("writes CQL under <out>/cql and FHIR under <out>/fhir, returning ABSOLUTE paths in emit order", () => {
    const two = makeTwo(
      [
        { outputFilename: "Alpha.cql", cql: "library Alpha\n" },
        { outputFilename: "Beta.cql", cql: "library Beta\n" },
      ],
      [
        { resourceType: "Library", relativePath: join("Library", "alpha.json"), resource: { resourceType: "Library", id: "alpha" } },
      ],
    );
    const written = writeTwoLane(two, dir);

    expect(written.cql.every((p) => isAbsolute(p))).toBe(true);
    expect(written.fhir.every((p) => isAbsolute(p))).toBe(true);
    expect(written.cql).toEqual([join(dir, "cql", "Alpha.cql"), join(dir, "cql", "Beta.cql")]);
    expect(written.fhir).toEqual([join(dir, "fhir", "Library", "alpha.json")]);
    expect(readFileSync(written.cql[0], "utf-8")).toBe("library Alpha\n");
    // writeFhirResources pretty-prints + trailing newline.
    expect(readFileSync(written.fhir[0], "utf-8")).toBe(
      JSON.stringify({ resourceType: "Library", id: "alpha" }, null, 2) + "\n",
    );
  });

  it("throws EmitWriteError on a traversal-y CQL outputFilename, writing nothing", () => {
    const two = makeTwo([{ outputFilename: join("..", "escape.cql"), cql: "x" }], []);
    let err: unknown;
    try {
      writeTwoLane(two, dir);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(EmitWriteError);
    expect((err as Error).message).toMatch(/traversal/i);
    expect((err as EmitWriteError).partial.cql).toEqual([]);
    expect(existsSync(join(dir, "escape.cql"))).toBe(false);
  });

  it("on a mid-LOOP FHIR failure, EmitWriteError.partial enumerates BOTH lanes' files already written", () => {
    const two = makeTwo(
      [{ outputFilename: "Good.cql", cql: "library Good\n" }],
      [
        // This one lands first...
        { resourceType: "Library", relativePath: join("Library", "good.json"), resource: { resourceType: "Library", id: "good" } },
        // ...then this traversal-y one throws mid-loop.
        { resourceType: "Library", relativePath: join("..", "escape.json"), resource: { id: "evil" } },
      ],
    );
    let err: unknown;
    try {
      writeTwoLane(two, dir);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(EmitWriteError);
    const partial = (err as EmitWriteError).partial;
    expect(partial.cql).toEqual([join(dir, "cql", "Good.cql")]);
    // The FHIR file that DID land is enumerated — the accounting the fix restores
    // (a hardcoded `fhir: []` here was the round-2 [critical]).
    expect(partial.fhir).toEqual([join(dir, "fhir", "Library", "good.json")]);
    expect(existsSync(join(dir, "cql", "Good.cql"))).toBe(true);
    expect(existsSync(join(dir, "fhir", "Library", "good.json"))).toBe(true);
    expect(existsSync(join(dir, "escape.json"))).toBe(false);
  });
});

describe("writeEmitResult (CEL) — absolute manifest + containment", () => {
  function makeResult(outputPath: string, id: string): EmitResult {
    return {
      emittedCases: [
        {
          caseSlug: "case-a",
          librarySlug: "lib-a",
          resources: [{ resourceType: "Observation", id, outputPath, body: { resourceType: "Observation", id } }],
        },
      ],
      diagnostics: [],
    };
  }

  it("returns the ABSOLUTE paths written, in emit order", () => {
    const written = writeEmitResult(makeResult(join("patient", "lib-a", "case-a", "Observation"), "obs-1"), dir);
    expect(written).toHaveLength(1);
    expect(isAbsolute(written[0])).toBe(true);
    expect(written[0]).toBe(join(dir, "patient", "lib-a", "case-a", "Observation", "obs-1.json"));
    expect(existsSync(written[0])).toBe(true);
  });

  it("throws on a traversal-y outputPath, escaping outDir", () => {
    expect(() => writeEmitResult(makeResult(join("..", "escape"), "obs-1"), dir)).toThrow(/traversal/i);
    expect(existsSync(join(dir, "..", "escape"))).toBe(false);
  });

  it("creates <outDir> up front even for a zero-resource result", () => {
    const fresh = join(dir, "fresh");
    const written = writeEmitResult({ emittedCases: [], diagnostics: [] }, fresh);
    expect(written).toEqual([]);
    expect(existsSync(fresh)).toBe(true);
  });

  it("populates the caller's sink with the writes that landed before a mid-loop failure", () => {
    const result: EmitResult = {
      emittedCases: [
        {
          caseSlug: "c",
          librarySlug: "l",
          resources: [
            { resourceType: "Observation", id: "good", outputPath: join("patient", "l", "c", "Observation"), body: {} },
            { resourceType: "Observation", id: "evil", outputPath: join("..", "escape"), body: {} },
          ],
        },
      ],
      diagnostics: [],
    };
    const sink: string[] = [];
    expect(() => writeEmitResult(result, dir, sink)).toThrow(/traversal/i);
    expect(sink).toEqual([join(dir, "patient", "l", "c", "Observation", "good.json")]);
  });
});
