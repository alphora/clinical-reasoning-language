/**
 * Pre-emit lowering pass for concept-level local source codes (`- code is `…`.`).
 *
 * SLICE 3 of the CRL CQL emit deliverable. A concept may carry its OWN local
 * source code (`Concept.code`, ast/types.ts:298) — the single implicit local
 * domain. Today `emitConcept` (emitCQL.ts) stubs such a definition-less concept
 * with a TODO comment, and slice-2 `classifyStatementLayer` rejects any
 * `code`-bearing concept. This pass LOWERS each `code is`-ONLY concept into the
 * EXISTING AST shapes so the whole unchanged downstream pipeline (indexNames /
 * detectCollisions / classify / requalify / include-collect / emit) handles it:
 *
 *   - A synthetic local `Terminology` named after the concept, carrying ONE
 *     `code` entry (the `code is` literal) from a deterministic local
 *     codesystem URN `urn:crl:codesystem:<slug>-local` (slug = lowercase-hyphen
 *     of the LIBRARY name — the single implicit local domain; every local code
 *     shares it). The CQL emitter stays FHIR-free: no canonicalBase, just a URN.
 *     `detectCollisions` (emitCQL.ts) sees the synthetic terminology collide
 *     with the same-named concept and suffixes its emit name to `"<Concept>
 *     Code"` (per-CRL path only — see the EMITTED IDENTIFIER NOTE below for why
 *     the layered path does NOT suffix), exactly mirroring the hand-split cms22
 *     `code "X Code"` shape on the per-CRL path.
 *
 *   - A synthetic `CodedFromDefinition` on the concept whose `terminologyName`
 *     is a BARE ref to that local code's name, so `emitCodedFrom` emits the
 *     retrieve `[<conceptType>: "<Concept> Code"]` and slice-2's re-qualifier /
 *     include-collector / collision detector all see the ref and handle it
 *     (layered: requalified to `"<Lib> Concepts"."<Concept> Code"` + include;
 *     per-CRL inline: bare same-library ref).
 *
 * IDEMPOTENCY. The transform CLEARS `Concept.code` once it installs the
 * synthetic definition. So a second run (the layered path's `emitLayered` calls
 * `emitCQLFromAST`, which lowers again) is a no-op: the lowered concept has no
 * `code` and a `CodedFromDefinition`, indistinguishable from a hand-authored
 * `coded from` concept. The pass is PURE — it does NOT mutate the input AST; it
 * shallow-copies rewritten concepts and constructs new synthetic statements
 * (the resolved-graph AST is shared
 * across emit paths; mutating it would leak synthetic statements). It does NOT
 * mutate the input AST: it shallow-copies the rewritten concepts
 * (`{ ...c, definition }`) and constructs new synthetic statements; untouched
 * statements pass through by reference.
 *
 * SCOPE (this slice). Lowers `code` + NO original top-level `definition` only.
 * A MIXED `code` + `definition` concept and an empty `code` value are HARD ERRORS
 * surfaced in `EmitResult.errors[]`; a `code is` concept with no `type is` (no
 * `conceptType`) is a hard error too (do NOT default to Observation — the
 * retrieve resource must be explicit). A `representations`-bearing `code`
 * concept is NOT an error and is NOT lowered: the external-source-representation
 * lane is out of scope, so its `code` is left intact and the existing layered
 * guard / per-CRL stub handles it (lowering it would silently drop the
 * representation side).
 *
 * EMITTED IDENTIFIER NOTE. The synthetic local CodeSystem/code identifiers are
 * an INTERNAL implementation detail of the emit and are NOT a stable public
 * surface. They can differ by emit PATH: in the per-CRL path the synthetic
 * terminology and its concept share one emitted library, so `detectCollisions`
 * suffixes the code name to `"<Concept> Code"`; in the layered path they land
 * in separate libraries (Concepts vs Asserted), so no suffix fires and the code
 * is named `"<Concept>"`. Each emitted library is self-consistent (its retrieve
 * references the exact name it declared), so this is benign — but downstream
 * consumers must reference the generated CONCEPT `define`s, never the synthetic
 * code declarations.
 *
 * SLICE-4 DEDUP CONSTRAINT. This pass emits N synthetic CQL `codesystem`
 * declarations (one per `code is` concept) that ALL SHARE ONE URN —
 * `urn:crl:codesystem:<slug>-local`, the single implicit local domain. When
 * slice 4 (FHIR `CodeSystem` emit) materializes these as FHIR resources it MUST
 * dedup them by URL into ONE FHIR `CodeSystem` resource (the shared URN)
 * carrying N `concept` entries — emitting N separate `CodeSystem` resources that
 * share the same canonical `url` is INVALID FHIR. This shared-URN shape is a
 * DELIBERATE choice (it lets us reuse `emitTerminologyLine` / `detectCollisions`
 * unchanged for the CQL side), not an accident; slice 4 owns the FHIR-side
 * collapse.
 */

import type {
  CRL,
  Concept,
  CodedFromDefinition,
  Statement,
  Terminology,
  TerminologyBodyLine,
  Location,
} from "../ast/types";
import type { CRLError } from "../types/errors";

/** The result of a lowering pass: the (possibly transformed) AST + any hard errors. */
export interface LowerLocalCodesResult {
  ast: CRL;
  errors: CRLError[];
}

/**
 * Deterministic local-domain codesystem URN for a library. Slug = lowercase,
 * non-alphanumeric → hyphen, collapse/trim hyphens. Empty (e.g. a pure
 * non-ASCII library name) falls back to `unnamed` so the URN is always
 * well-formed. Kept FHIR-free (no canonicalBase) — this is a plain URN, the
 * single implicit local domain shared by every `code is` code in the library.
 */
export function localCodesystemUrn(libraryName: string): string {
  return `urn:crl:codesystem:${localSlug(libraryName)}-local`;
}

/** Lowercase-hyphen slug of a name; `unnamed` when empty after stripping. */
function localSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/(^-|-$)/g, "") || "unnamed"
  );
}

/**
 * A `code`-bearing concept this slice INSPECTS. This predicate deliberately does
 * NOT pre-exclude representations-bearing concepts: every `code`-bearing concept
 * must enter the loop so its diagnostics (empty `code`, mixed `code` +
 * top-level `definition`) fire BEFORE the representation lane is considered.
 * Pre-excluding representations here would let `code is \`\`` + representation
 * (empty) and `code is X` + `defined as` + representation (mixed) escape their
 * hard errors — and the mixed one would then emit only the definition, silently
 * dropping the code-source side. The representation SKIP (out of scope: keep
 * `code` intact, do not lower, no error) happens INSIDE the loop, AFTER the
 * empty + mixed checks — see `lowerLocalCodes`.
 */
function isLowerableConcept(stmt: Statement): stmt is Concept {
  return stmt.type === "Concept" && stmt.code !== undefined;
}

/**
 * Lower every `code is`-ONLY concept in `ast` into a synthetic local
 * `Terminology` + `CodedFromDefinition`, returning a NEW AST (input untouched).
 *
 * Hard errors (out of scope / malformed) are collected into `errors`; when any
 * are present the caller MUST short-circuit emit (the partially-lowered AST is
 * still returned but should not be emitted). Diagnostics:
 *   - empty `code is` value                          → `emit-empty-local-code`
 *   - `code` + top-level `definition` (mixed)        → `emit-mixed-code-and-definition`
 *   - `code is` with no `type is` (conceptType)      → `emit-local-code-missing-type`
 *   - two valid (lowerable) concepts with the SAME
 *     `code` value                                   → `emit-duplicate-local-code`
 *   - two valid (lowerable) concepts with the SAME
 *     NAME (would synthesize colliding terminologies) → `emit-duplicate-local-concept`
 *   - synthetic terminology name collides with an
 *     EXISTING terminology of the same name          → `emit-local-code-terminology-collision`
 *
 * Per `code`-bearing concept, in order: (1) empty `code` → empty error; (2)
 * `code` + top-level `definition` (mixed) → mixed error; (3) representation-
 * bearing (`code` + representation, no top-level definition, non-empty) → SKIP
 * (out of scope: no error, `code` left intact, NOT lowered); (4) else
 * (code-only) → missing-type / duplicate-value / duplicate-name / terminology-
 * collision checks + lower. The representation lane is checked AFTER empty +
 * mixed so a malformed representation-bearing concept still gets its hard error.
 */
export function lowerLocalCodes(ast: CRL): LowerLocalCodesResult {
  const errors: CRLError[] = [];

  // Fast path: nothing to lower → return the input untouched (no clone churn).
  if (!ast.statements.some(isLowerableConcept)) {
    return { ast, errors };
  }

  // Existing terminology names (so a synthetic name can't silently collide with
  // a hand-authored terminology — a legal cross-kind same-name, since name
  // uniqueness is per-kind). If the names match the emitter's two terminologies
  // would collapse in its name-keyed maps; diagnose instead of emit broken CQL.
  const existingTerminologyNames = new Set<string>();
  for (const stmt of ast.statements) {
    if (stmt.type === "Terminology" && stmt.name) existingTerminologyNames.add(stmt.name);
  }

  // De-dup local code VALUES across all lowered concepts (a duplicate local code
  // is ambiguous: two concepts asserting the same local domain code).
  const codeValueToConcept = new Map<string, string>();

  // De-dup synthetic terminology NAMES across lowered concepts. Two `code is`
  // concepts with the SAME name would each synthesize a same-named terminology
  // and collapse in the emitter's name-keyed maps (and in `loweredByName`
  // below). Concept-name uniqueness is normally a validator concern, but the
  // direct `emitCQL` / `emitCQLFromAST` entrypoints don't run the validator, so
  // diagnose it here rather than emit silently-clobbered CQL.
  const seenSyntheticNames = new Set<string>();

  const loweredConcepts: Concept[] = [];
  const syntheticTerminologies: Terminology[] = [];
  // The local-domain URN follows the SOURCE policy library identity
  // (`ast.library.name`), NOT the emitted-layer library name. `emitCQLFromAST`
  // may emit under a different `options.libraryName` (e.g. the layered
  // "<Lib> Concepts"), but the local domain belongs to the source CRL, so the
  // URN won't follow `options.libraryName` — a direct caller passing it should
  // expect the URN to slug from `ast.library.name`.
  const urn = localCodesystemUrn(ast.library.name);

  for (const stmt of ast.statements) {
    if (!isLowerableConcept(stmt)) continue;
    const c = stmt;
    const codeValue = c.code as string;
    const loc = c.location;

    // (1) EMPTY `code is` value. Checked FIRST: an empty local code is malformed
    //     regardless of whatever else the concept carries (so an empty code +
    //     definition reports the empty-code error, not the mixed error).
    if (codeValue === "") {
      errors.push(mkError(
        "emit-empty-local-code",
        `Concept "${c.name}" has an empty \`code is\` value. A local source code ` +
          `must be a non-empty literal.`,
        loc,
      ));
      continue;
    }

    // (2) MIXED `code` + top-level `definition` — out of scope this slice.
    if (c.definition !== undefined) {
      errors.push(mkError(
        "emit-mixed-code-and-definition",
        `Concept "${c.name}" carries BOTH a local \`code is\` and a top-level ` +
          `definition (\`${c.definition.type}\`). Mixed local-code + definition ` +
          `concepts are out of scope for this emit slice; emit nothing rather than ` +
          `silently drop the local-code source side.`,
        loc,
      ));
      continue;
    }

    // (3) REPRESENTATION-bearing (`code` + representation, no top-level
    //     definition, non-empty code) — out of scope this slice. SKIP: leave
    //     `code` intact, do NOT lower, no error. Checked AFTER empty + mixed so
    //     a malformed representation-bearing concept still gets its hard error;
    //     lowering it would silently drop the external-source-representation side
    //     (the existing layered guard / per-CRL stub handles it).
    if (c.representations && c.representations.length > 0) {
      continue;
    }

    // (4) Missing `type is` (no FHIR resource for the retrieve). Do NOT default
    //     to Observation — the resource must be explicit.
    if (c.conceptType === undefined) {
      errors.push(mkError(
        "emit-local-code-missing-type",
        `Concept "${c.name}" has a local \`code is\` but no \`type is\`. A locally ` +
          `coded concept needs an explicit FHIR resource type for its retrieve ` +
          `(it is NOT defaulted to Observation).`,
        loc,
      ));
      continue;
    }

    // (5) Duplicate local code VALUE across valid (lowerable) concepts. The
    //     value is recorded only AFTER the earlier validity checks pass, so this
    //     compares two valid concepts asserting the same local domain code.
    const prior = codeValueToConcept.get(codeValue);
    if (prior !== undefined) {
      errors.push(mkError(
        "emit-duplicate-local-code",
        `Local code \`${codeValue}\` is declared by both "${prior}" and "${c.name}". ` +
          `Each local source code must be unique within the library.`,
        loc,
      ));
      continue;
    }

    // (6) Duplicate synthetic-terminology NAME across valid (lowerable)
    //     concepts. Two `code is` concepts sharing a name would synthesize two
    //     same-named terminologies that collapse in the emitter's name-keyed
    //     maps (and in `loweredByName` below), silently dropping one. Diagnose.
    if (seenSyntheticNames.has(c.name)) {
      errors.push(mkError(
        "emit-duplicate-local-concept",
        `Two local-coded concepts named "${c.name}" would each synthesize a ` +
          `terminology of that name, colliding in the emitted CQL. Concept names ` +
          `must be unique within the library.`,
        loc,
      ));
      continue;
    }

    // (7) Synthetic-terminology name collides with a hand-authored terminology.
    if (existingTerminologyNames.has(c.name)) {
      errors.push(mkError(
        "emit-local-code-terminology-collision",
        `Lowering local-coded concept "${c.name}" would synthesize a terminology ` +
          `of the same name, but a terminology "${c.name}" already exists in this ` +
          `library. Rename one so the synthesized local code does not collide.`,
        loc,
      ));
      continue;
    }

    codeValueToConcept.set(codeValue, c.name);
    seenSyntheticNames.add(c.name);

    // Build the synthetic local Terminology (codesystem + single code) named
    // after the concept. On the PER-CRL path detectCollisions in the emitter
    // suffixes its emit name to "<Concept> Code" (concept of the same name
    // co-resides), so the emitted CQL is `codesystem "<Concept> Code System":
    // '<urn>'` + `code "<Concept> Code": '<value>' from "<Concept> Code
    // System"`. On the LAYERED path the terminology and concept split into
    // separate libraries, so no collision fires and the code is named bare
    // "<Concept>" (see the EMITTED IDENTIFIER NOTE in the file header).
    syntheticTerminologies.push(buildSyntheticTerminology(c.name, codeValue, urn, loc));

    // Replace the concept's `code` with a CodedFromDefinition bare-ref'ing the
    // synthetic code's NAME. Clearing `code` makes the transform idempotent.
    const codedFrom: CodedFromDefinition = {
      type: "CodedFromDefinition",
      terminologyName: c.name,
      location: loc,
    };
    const lowered: Concept = { ...c, definition: codedFrom };
    delete lowered.code;
    loweredConcepts.push(lowered);
  }

  // Re-thread statements: replace each lowered concept in place, and append the
  // synthetic terminologies at the FRONT of the statement list (Concepts-layer
  // terminologies). Ordering among synthetic terminologies follows source
  // concept order (stable). The emitter sorts/sections terminologies vs concepts
  // itself, so absolute position only affects intra-terminology ordering.
  const loweredByName = new Map<string, Concept>();
  for (const c of loweredConcepts) loweredByName.set(c.name, c);

  // Nothing actually lowered — every `code`-bearing concept was either skipped
  // (representation lane) or errored. Return the input AST UNTOUCHED (===) so
  // callers that key off identity to detect "did this library synthesize a
  // local codesystem?" (e.g. `imports/emit.ts`'s `didLower = lowered.ast !==
  // entry.ast`) don't get a false positive from a same-content clone.
  if (loweredConcepts.length === 0) {
    return { ast, errors };
  }

  const rewritten: Statement[] = ast.statements.map((stmt) => {
    if (stmt.type === "Concept" && loweredByName.has(stmt.name)) {
      return loweredByName.get(stmt.name) as Concept;
    }
    return stmt;
  });

  const outAst: CRL = {
    ...ast,
    statements: [...syntheticTerminologies, ...rewritten],
  };

  return { ast: outAst, errors };
}

/** Build a synthetic Terminology node: one codesystem (URN) + one code line. */
function buildSyntheticTerminology(
  name: string,
  codeValue: string,
  urn: string,
  loc: Location,
): Terminology {
  const systemLine: TerminologyBodyLine = {
    type: "TerminologySystem",
    system: urn,
    location: loc,
  };
  const codeLine: TerminologyBodyLine = {
    type: "TerminologyCode",
    code: codeValue,
    location: loc,
  };
  return {
    type: "Terminology",
    name,
    body: [systemLine, codeLine],
    location: loc,
  };
}

function mkError(kind: string, message: string, loc: Location): CRLError {
  return {
    type: "Validation",
    kind,
    line: loc.start.line,
    column: loc.start.column,
    message,
  };
}
