import * as path from "path";

import { describe, it, expect } from "vitest";

import {
  buildClosureIndex,
  makeClosureOperandResolver,
  reportClosureTotality,
  UNRESOLVED_LIBRARY,
  type LibraryLedger,
} from "../closeIndex";
import type { EmittedDefineEntry } from "../booleanTotality";
import { proveWholeBoundaryTotality } from "../booleanTotality";
import type { QualifiedReference } from "../../ast/types";
import { emitCQLImports } from "../../imports/emit";

// ── helpers ────────────────────────────────────────────────────────────────
const LOC = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
const qref = (libraryName: string, name: string): QualifiedReference => ({
  type: "QualifiedReference",
  libraryName,
  name,
  location: LOC,
});

/** A minimal valid boolean entry; overrides customize identity/visibility/obligation. */
function boolEntry(over: Partial<EmittedDefineEntry> & Pick<EmittedDefineEntry, "library" | "name">): EmittedDefineEntry {
  return {
    resultType: "Boolean",
    obligation: { kind: "intrinsically-total", form: "exists this", cell: "test" },
    discharge: { booleanEffect: "total", dischargedBy: "intrinsic-exists" },
    origin: "authored",
    cql: `define "${over.name}": exists([Observation: X])`,
    result: { shape: "Scalar", valueType: "boolean" },
    visibility: "public",
    ...over,
  };
}

const CATALOG = new Set(["CRLCommon", "CaseFeatureCommon", "FHIRHelpers"]);
const FIXTURES = path.resolve(__dirname, "../../imports/tests/fixtures");

function policyLedgers(result: ReturnType<typeof emitCQLImports>): LibraryLedger[] {
  return result.cqlByLibrary
    .filter((p) => !p.isSharedCatalog && !CATALOG.has(p.libraryName))
    .map((p) => ({
      libraryIdentity: p.libraryName,
      sourceLibraryName: p.sourceLibraryName,
      cql: p.cql,
      entries: p.ledgerEntries ?? [],
    }));
}

// ── §4.5 metadata index ──────────────────────────────────────────────────────
describe("closeIndex — metadata index (§4.5)", () => {
  it("keys by {libraryIdentity, defineName}, resolving same-named impl twin and public entry to DISTINCT entries", () => {
    const impl = boolEntry({
      library: "Pol-LocalSource",
      name: "Adult Patient",
      resultType: "non-Boolean(source-impl)",
      obligation: { kind: "not-applicable", nullable: false, reason: "impl twin" },
      discharge: { booleanEffect: "not-boolean" },
      cql: `define "Adult Patient": [Observation: LocalConcepts."Adult Patient"]`,
      result: { shape: "RecordSet", resourceType: "Observation" },
      visibility: "impl",
    });
    const pub = boolEntry({ library: "Pol-Inferred", name: "Adult Patient", visibility: "public" });
    const index = buildClosureIndex([
      { libraryIdentity: "Pol-LocalSource", sourceLibraryName: "Pol", cql: impl.cql, entries: [impl] },
      { libraryIdentity: "Pol-Inferred", sourceLibraryName: "Pol", cql: pub.cql, entries: [pub] },
    ]);
    const gotImpl = index.lookup({ library: "Pol-LocalSource", name: "Adult Patient" });
    const gotPub = index.lookup({ library: "Pol-Inferred", name: "Adult Patient" });
    expect(gotImpl).not.toBe(gotPub);
    expect(gotImpl?.result).toEqual({ shape: "RecordSet", resourceType: "Observation" });
    expect(gotImpl?.visibility).toBe("impl");
    expect(gotPub?.result).toEqual({ shape: "Scalar", valueType: "boolean" });
    expect(gotPub?.visibility).toBe("public");
  });
});

// ── §4.5 public-reference routing map (winner rule) ──────────────────────────
describe("closeIndex — public-reference routing (§4.5)", () => {
  it("routes {source, name} to the UNIQUE public entry — the impl twin and façade are NOT candidates (Inferred-wins)", () => {
    const impl = boolEntry({ library: "Pol-LocalSource", name: "D", visibility: "impl", discharge: { booleanEffect: "not-boolean" }, resultType: "non-Boolean(source-impl)" });
    const pub = boolEntry({ library: "Pol-Inferred", name: "D", visibility: "public" });
    const facade = boolEntry({ library: "Pol-Interface", name: "D", visibility: "facade", origin: "interface-facade", discharge: { booleanEffect: "total", dischargedBy: "facade-satisfied" } });
    const index = buildClosureIndex([
      { libraryIdentity: "Pol-LocalSource", sourceLibraryName: "Pol", cql: impl.cql, entries: [impl] },
      { libraryIdentity: "Pol-Inferred", sourceLibraryName: "Pol", cql: pub.cql, entries: [pub] },
      { libraryIdentity: "Pol-Interface", sourceLibraryName: "Pol", cql: facade.cql, entries: [facade] },
    ]);
    expect(index.route("Pol", "D")).toEqual({ kind: "resolved", id: { library: "Pol-Inferred", name: "D" } });
  });

  it("returns MISSING for an unknown reference and AMBIGUOUS only when ≥2 PUBLIC entries remain after the winner rule", () => {
    const a = boolEntry({ library: "Lib-A", name: "X", visibility: "public" });
    const b = boolEntry({ library: "Lib-B", name: "X", visibility: "public" });
    const index = buildClosureIndex([
      { libraryIdentity: "Lib-A", sourceLibraryName: "Src", cql: a.cql, entries: [a] },
      { libraryIdentity: "Lib-B", sourceLibraryName: "Src", cql: b.cql, entries: [b] },
    ]);
    expect(index.route("Src", "nope").kind).toBe("missing");
    const amb = index.route("Src", "X");
    expect(amb.kind).toBe("ambiguous");
  });
});

// ── §4.5 resolver — three ref key-spaces + fail-closed ───────────────────────
describe("closeIndex — OperandResolver key-spaces (§4.5)", () => {
  const pub = boolEntry({ library: "Pol-Inferred", name: "D", visibility: "public" });
  const facade = boolEntry({
    library: "Pol-Interface",
    name: "D",
    visibility: "facade",
    origin: "interface-facade",
    obligation: { kind: "composite", operands: [qref("Pol-Inferred", "D")], cell: "façade" },
    discharge: { booleanEffect: "total", dischargedBy: "facade-delegated" },
    cql: `define "D": Pol-Inferred."D"`,
  });
  const index = buildClosureIndex([
    { libraryIdentity: "Pol-Inferred", sourceLibraryName: "Pol", cql: pub.cql, entries: [pub] },
    { libraryIdentity: "Pol-Interface", sourceLibraryName: "Pol", cql: facade.cql, entries: [facade] },
  ]);
  const resolve = makeClosureOperandResolver(index);

  it("(a) a RENDERED qualified façade operand resolves directly to the enrolled identity", () => {
    expect(resolve("Pol-Interface", qref("Pol-Inferred", "D"))).toEqual({ library: "Pol-Inferred", name: "D" });
  });

  it("(a) a bare ref into its OWN emitted library resolves directly", () => {
    expect(resolve("Pol-Inferred", "D")).toEqual({ library: "Pol-Inferred", name: "D" });
  });

  it("(b) a bare ref maps fromLibrary→source, then routes to the public identity", () => {
    // From the Interface library, a bare "D" is not in Pol-Interface's own defines (only the façade "D" is,
    // which IS there) — use a fromLibrary with no own "D" to force the source-route path.
    const idx2 = buildClosureIndex([
      { libraryIdentity: "Pol-Inferred", sourceLibraryName: "Pol", cql: pub.cql, entries: [pub] },
      { libraryIdentity: "Pol-Root", sourceLibraryName: "Pol", cql: "", entries: [] },
    ]);
    expect(makeClosureOperandResolver(idx2)("Pol-Root", "D")).toEqual({ library: "Pol-Inferred", name: "D" });
  });

  it("(c) a raw qualified ref routes via the injected scope resolver", () => {
    const raw = makeClosureOperandResolver(index, (_from, rawLib) => (rawLib === "PolAlias" ? "Pol" : undefined));
    expect(raw("Pol-Inferred", qref("PolAlias", "D"))).toEqual({ library: "Pol-Inferred", name: "D" });
  });

  it("FAIL-CLOSED: an unroutable operand returns a sentinel identity (never enrolled) — no throw", () => {
    const miss = resolve("Pol-Inferred", "does-not-exist");
    expect(miss.library).toBe(UNRESOLVED_LIBRARY);
    expect(index.lookup(miss)).toBeUndefined();
  });

  it("an UNRESOLVED composite operand yields a ProofFailure that NAMES the miss (fail-closed at proof time)", () => {
    const composite = boolEntry({
      library: "Pol-Inferred",
      name: "C",
      visibility: "public",
      obligation: { kind: "composite", operands: [qref("Pol-Inferred", "ghost")], cell: "test" },
      discharge: { booleanEffect: "total", dischargedBy: "composite-delegated" },
      cql: `define "C": Pol-Inferred."ghost"`,
    });
    const idx = buildClosureIndex([
      { libraryIdentity: "Pol-Inferred", sourceLibraryName: "Pol", cql: composite.cql, entries: [composite] },
    ]);
    const report = proveWholeBoundaryTotality(idx.entries(), undefined, makeClosureOperandResolver(idx));
    const f = report.failures.find((x) => x.name === "C");
    expect(f).toBeDefined();
    expect(f?.reason).toContain("did not resolve to an enrolled define");
  });
});

// ── closure-level REPORT proof over a REAL multi-library closure ──────────────
describe("closeIndex — closure REPORT proof over a real closure", () => {
  it("cms22-split: ledgerEntries surface on policy libs (absent on catalog); completeness is green over policy libs", () => {
    const result = emitCQLImports(path.join(FIXTURES, "cms22-split", "cms22.crl"));
    expect(result.success).toBe(true);
    // catalog libs carry NO ledger (outside the subject set); policy libs DO.
    for (const p of result.cqlByLibrary) {
      if (CATALOG.has(p.libraryName)) expect(p.ledgerEntries).toBeUndefined();
      else expect(p.ledgerEntries).toBeDefined();
    }
    const ledgers = policyLedgers(result);
    expect(ledgers.length).toBeGreaterThan(1); // a real multi-library layered closure
    const report = reportClosureTotality(ledgers);
    // Completeness (both directions) is the green property 2b.0 guarantees — every emitted policy define is
    // enrolled and vice versa, aggregated across the closure with the rendered library identity.
    expect(report.uncovered).toEqual([]);
    expect(report.orphanEntries).toEqual([]);
    // cms22-split's only boolean subject ("Initial Population") discharges total; the coded-from/catalog
    // reads are non-Boolean (skipped) → the closure REPORT is PROVEN (a re-pinned CLOSURE inventory, code
    // review #1 — a resolver false-fail on a boolean subject would flip this off `proven`).
    expect(report.status).toBe("proven");
  });

  it("CLOSURE inventory pin: a façade composite resolves CROSS-LAYER to its Inferred determination (proven)", () => {
    // decision-when-reduction emits a façade "Cov" = a COMPOSITE delegating to the sibling Inferred library's
    // "Cov" determination. The closure resolver must route that operand ACROSS libraries for the façade to
    // prove total — a per-library proof (or a resolver regression) would fail it. This is the pinned
    // cross-layer discharge the closure index exists for (code review #1).
    const result = emitCQLImports(path.join(FIXTURES, "decision-when-reduction", "root.crl"));
    expect(result.success).toBe(true);
    const report = reportClosureTotality(policyLedgers(result));
    expect(report.status).toBe("proven");
    expect(report.failures).toEqual([]);
  });

  it("CLOSURE inventory pin: bare-scalar `code is` forms report as `rejected` (bucket 3, retired at 2e)", () => {
    // code-is-decision has two bare Scalar boolean `code is` concepts (the `no-bare-scalar-code` pre-flip
    // form). The classifier obligation is `rejected`; the closure REPORT surfaces them as hard failures — the
    // pinned bucket-3 inventory that 2e retires. Pinning it here gives 2b.1's discharge + 2b.4's HARD gate a
    // closure-level burn-down baseline (code review #1).
    const result = emitCQLImports(path.join(FIXTURES, "code-is-decision", "root.crl"));
    expect(result.success).toBe(true);
    const report = reportClosureTotality(policyLedgers(result));
    expect(report.status).toBe("failed");
    expect(report.failures.map((f) => f.name).sort()).toEqual(["Active Crohns Disease", "Adult Patient"]);
    for (const f of report.failures) expect(f.reason).toContain("rejected form was emitted");
  });

  it("decision-when-reduction: the role→visibility mapping fires from real layered emit; routing applies the winner rule", () => {
    const result = emitCQLImports(path.join(FIXTURES, "decision-when-reduction", "root.crl"));
    expect(result.success).toBe(true);
    const ledgers = policyLedgers(result);
    const index = buildClosureIndex(ledgers);
    const all = index.entries();
    // The reduction twin-split emits a records IMPL twin (a RecordSet retrieve) — proves the
    // `records-impl`/`source-impl` role → `impl` visibility mapping fires in real layered emit, and that
    // `recordSetResultOf` populates a concrete resource (not opaque) for it.
    const impl = all.find((e) => e.visibility === "impl");
    expect(impl).toBeDefined();
    expect(impl?.result?.shape).toBe("RecordSet");
    // "Cov" (the public determination) also has an Interface façade — same NAME, distinct emitted identities
    // + distinct visibility; `{libraryIdentity, defineName}` keeps them apart (the disc-438 conflation).
    const cov = all.filter((e) => e.name === "Cov");
    expect(cov.map((e) => e.visibility).sort()).toEqual(["facade", "public"]);
    expect(new Set(cov.map((e) => e.library)).size).toBe(cov.length); // distinct libraries
    // Routing selects the UNIQUE public "Cov" (the façade is not a candidate — winner rule).
    const source = ledgers[0].sourceLibraryName;
    const routed = index.route(source, "Cov");
    expect(routed.kind).toBe("resolved");
    if (routed.kind === "resolved") expect(index.lookup(routed.id)?.visibility).toBe("public");
  });
});

// ── count-bare runtime pin (2a hand-off (b)) ─────────────────────────────────
// The `count "X" at least N` reduction emits `Count([<retrieve>]) >= N` (emitCQL.ts:1636), enrolled
// `count-bare`/intrinsically-total with a †runtime empty/null pin. The pin is the CQL-semantics fact that a
// RETRIEVE yields an empty LIST (never null), `Count([])` is `0` (never null), and `0 >= N` (N ≥ 1) is a
// TOTAL Boolean `false` — so the bare form is total with no Coalesce. `at least 0` is rejected as an author
// error upstream, so N ≥ 1 always holds. Full $apply RUNTIME confirmation over the flipped output rides the
// §7 fixture matrix (`tmp/cqf-fhir-cr-cli-4.7.0.jar`), scheduled with the 2b.1 comparator flip; discharging it
// EARLY here (both arms) means a semantics surprise re-decides count lowering before any form flips.
describe("closeIndex — count-bare totality pin (documented; runtime in §7 matrix)", () => {
  it("a real `count … at least N` reduction enrolls dischargedBy `count-bare`, total Scalar<boolean>", () => {
    // decision-when-named-reduction: "Enough Trials" = `definition is count "Trial Records" at least 2` —
    // the ACTUAL count form (code review #3: the earlier exists-based fixture made this assertion vacuous).
    const result = emitCQLImports(path.join(FIXTURES, "decision-when-named-reduction", "root.crl"));
    expect(result.success).toBe(true);
    const enough = policyLedgers(result)
      .flatMap((l) => l.entries)
      .find((e) => e.name === "Enough Trials" && e.visibility === "public");
    expect(enough?.discharge).toEqual({ booleanEffect: "total", dischargedBy: "count-bare" });
    expect(enough?.result).toEqual({ shape: "Scalar", valueType: "boolean" });
    // The pin: `Count([<retrieve>]) >= N` is total by CQL semantics (a retrieve yields a list never null;
    // `Count([])` = 0; `0 >= N` total for N ≥ 1; `at least 0` rejected upstream). The $apply RUNTIME
    // confirmation is a BINDING sequencing constraint — it MUST land in the §7 matrix at or before 2b.4's
    // HARD-gate activation, so the gate never certifies `count-bare` over an open runtime pin (disc 442).
  });
});
