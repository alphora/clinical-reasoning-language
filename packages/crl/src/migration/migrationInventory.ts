// #189 emit-flip · T4 — the flip-safety migration inventory scanner (design of record:
// docs/emit-consistency-189-design.md §9 step 3; plan tmp/PLAN-T4-migration-inventory.md v2).
//
// WHY THIS LIVES IN src/ (not scripts/): the §9-step-4 flip turns a family of validation
// WARNINGS into hard ERRORS. Before that flips, every site the flip breaks must be enumerated so
// nothing breaks silently. This scanner IS that enumeration. It imports internal APIs
// (`validateCRLImports`, the AST types, the reference walk); under the package tsconfig
// (`src/**/*.ts`) it type-checks in CI and breaks LOUDLY when those APIs change, and its colocated
// vitest suite (`src/migration/tests/`) exercises it against real fixtures — the two signals the
// T7 staleness gate depends on. The runner that writes the doc is the thin, uncompiled
// `scripts/run-migration-inventory.ts`; this module is pure (no process/argv/cwd, no doc I/O beyond
// the fs census it is handed a root for).
//
// TWO SIGNALS + RECONCILE (design-R1 crit, both arms): the validator OWNS the model of
// "bare/invalid" — the script must not re-derive it as the authority. But a warning HARVEST alone
// can silently miss a site (a collision-rejected library, a future validator regression). So we run
// BOTH: a direct AST predicate ORACLE (resolution-free, collision-immune) AND the typed validator
// warnings, and FAIL on a divergence the validator should have caught. The oracle is the completeness
// floor; the validator is the authority we reconcile against.

import { readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";

import type {
  CRL,
  Concept,
  ConceptValueType,
  Decision,
  Criterion,
  Activity,
  Statement,
  BranchBlock,
  WhenBlockBody,
  BlockBody,
  ActionStatement,
  CompositionExpression,
  NarrativeClause,
  NarrativeElement,
  ArgValue,
  ReferenceName,
} from "../ast/types";
import { getRefName, getRefLibrary, isQualifiedRef } from "../ast/types";
import { branchConditionRefs } from "../ast/branchCondition";
import { buildCRL } from "../index";
import { validateCRLImports } from "../imports/validate";
import { canonicalizeFsPath } from "../imports/paths";
import { findProjectRoot } from "../imports/registry";
import { Validator } from "../validator/validator";
import type { ValidationError } from "../validator/validator";
import { valueReadValueTypes } from "../fhir-model/fhirValueModel";
import { relativeElementPath } from "../fhir-model/elementPath";

// Key separator — a control char that never appears in a path, library name, or concept
// name, so composite keys are unambiguous AND splittable back into their parts.
const KSEP = "\u0001";

// ---------------------------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------------------------

/** A physical declaration identity — one row's anchor. */
export interface DeclIdentity {
  filePath: string;
  libraryName: string | undefined;
  conceptName: string;
  line: number;
  valueTypes: ConceptValueType[];
}

/** The reference-graph edge kinds a CONCEPT target can be consumed through. Derived from the
 *  `checkRef` slots in `referenceResolver.ts` (the closed set of concept-accepting positions).
 *  `criterion-body` and `when-guard` share the resolver's `"when-guard"` slot; we split them by the
 *  CONTAINER statement kind (Criterion vs Decision), because their migration pressure is identical
 *  but their provenance differs. */
export type EdgeKind =
  | "when-guard"
  | "action-guard"
  | "criterion-body"
  | "composition-operand"
  | "defined-as-target"
  | "structural-reduction-target"
  | "narrative-operand";

export const ALL_EDGE_KINDS: readonly EdgeKind[] = [
  "when-guard",
  "action-guard",
  "criterion-body",
  "composition-operand",
  "defined-as-target",
  "structural-reduction-target",
  "narrative-operand",
] as const;

/** One consumption site of a concept (per-referrer evidence). */
export interface EdgeEvidence {
  edgeKind: EdgeKind;
  ownerKind: "Concept" | "Decision" | "Criterion" | "Activity";
  ownerName: string;
  filePath: string;
  libraryName: string | undefined;
  line: number;
  /** The referent as written at the site (bare or `"Lib"."Name"`), for the evidence trail. */
  referentRef: string;
}

/** The migration action for a bare-scalar-code target. The first three mirror the rule's own
 *  three-arm suggested action (design §2/§3). `value-type-unresolved` is T4's own charter-grounded
 *  classification for the 0-or->1-value-type case (North Star §3: the declared value type decides the
 *  reduction), which DELIBERATELY differs from the current validator message (which suggests
 *  `exists this` when `vt === undefined`, treating it as boolean). That validator-message divergence
 *  is a flip consideration, recorded in the inventory doc — NOT a claim that we replicate the action.
 *  Panel R1 gpt56 #3 / Claude #1. */
export type MigrationClass =
  | "boolean-presence" // vt boolean → `definition is exists this`
  | "value-read" // scalar non-boolean, single rep → `definition is most recent this`
  | "promote-recordset" // multi-rep → promote a rep to a named RecordSet + reduce it
  | "value-type-unresolved"; // no SINGLE value type (0 or >1) → author must declare one first

/** A migration target: a bare-scalar-`code is` concept the flip turns from a silent warning into a
 *  hard error. */
export interface MigrationTarget {
  decl: DeclIdentity;
  rule: "no-bare-scalar-code";
  migrationClass: MigrationClass;
  migrationStep: string;
  roles: EdgeEvidence[];
  /** Non-fatal validation ERRORS attached to this concept's file/library (design-R1 crit2 — a file
   *  that builds but has other errors is STILL enumerated, its errors ride along as blockers), PLUS
   *  a value-path viability blocker when a `value-read` migration is not mechanically applicable
   *  (no `type is`, or the value element does not admit the value type — design §8). */
  blockers: string[];
}

/** A migration target found INSIDE an excluded (intentional-error) fixture family. The flip will add
 *  a `no-bare-scalar-code` error here too, changing that fixture's expected validation output — so it
 *  is enumerated (honest accounting), but NOT reconciled (its cluster fails validation for its own
 *  intentional reason). Panel R1 gpt56 #1 / Claude #8. */
export interface ExcludedTarget {
  decl: DeclIdentity;
  migrationClass: MigrationClass;
  /** The exclusion reason of the family it sits in. */
  familyReason: string;
}

/** A local-coded concept that is NOT a migration target — recorded so exemptions are VISIBLE
 *  (design-R1 imp6), never silently absent. */
export interface NonTargetEntry {
  decl: DeclIdentity;
  reason:
    | "explicit-reduction-or-derivation"
    | "value-projection-reduction-exempt"
    | "legal-recordset-publication"
    | "both-rep-churn"
    | "other";
  note: string;
}

export type FileCategory =
  | "canonical-content"
  | "example-harness"
  | "golden-source"
  | "clean-fixture"
  | "corpus"
  | "excluded"
  | "build-failed";

export interface CensusEntry {
  filePath: string;
  category: FileCategory;
  /** For `excluded`: the manifest reason. For `build-failed`: the parser message. */
  reason?: string;
  libraryName?: string;
  clusterRoot?: string;
}

export interface ReconcileDivergence {
  filePath: string;
  conceptName: string;
  kind: "oracle-only" | "warning-only";
  detail: string;
}

export interface InventoryReport {
  /** Absolute canonical directory the census walked. */
  root: string;
  census: CensusEntry[];
  /** Closed-set accounting (design-R1): discovered = included ∪ excluded ∪ build-failed. */
  counts: {
    discovered: number;
    included: number;
    excluded: number;
    buildFailed: number;
    byCategory: Record<FileCategory, number>;
  };
  targets: MigrationTarget[];
  /** Bare-scalar targets that sit inside EXCLUDED (intentional-error) fixture families — enumerated
   *  for honest accounting (the flip changes their fixtures' expected output too), not reconciled. */
  excludedTargets: ExcludedTarget[];
  nonTargets: NonTargetEntry[];
  /** Secondary section — other flip-enforced warning→error kinds, keyed by rule (best-effort, from
   *  the per-cluster validation runs). NOT reconciled (only `no-bare-scalar-code` is). The set is an
   *  EXPLICIT closed enumeration (see `isFlipEnforcedSecondary`); rules deleted at the flip
   *  (`shape-marker-not-emit-active`) or owned by a different milestone (`use-site-operand-untyped`,
   *  #257) are excluded. */
  secondaryWarnings: { rule: string; decl: Partial<DeclIdentity> & { conceptName: string }; message: string }[];
  /** Reconciliation result. `ok: false` ⇒ a cleanly-validated file where oracle and validator
   *  disagree on `no-bare-scalar-code` — the ONE failure that matters. */
  reconcile: { ok: boolean; divergences: ReconcileDivergence[] };
  /** Hard scan-integrity failures (unmatched census file, duplicate classification, unreadable file,
   *  dead exclusion rule, cleanly-validated reconcile divergence). Non-empty ⇒ the scan is INVALID. */
  failures: string[];
}

// ---------------------------------------------------------------------------------------------
// The oracle — the exact `no-bare-scalar-code` predicate, replicated from
// reductionShapeValidator.ts:381 (+ its local derivations at :142-159). Resolution-free.
// ---------------------------------------------------------------------------------------------

/** The count of a concept's OWN representation records: the local `code is` arm + every posrep. */
function repCountOf(concept: Concept): number {
  const reps = concept.representations?.length ?? 0;
  return (concept.code !== undefined ? 1 : 0) + reps;
}

/** A `source representation` carrying a `value projection` is an effective reduction (the age-recency
 *  posrep), so it is EXEMPT from `no-bare-scalar-code`. Mirrors :153. */
function hasValueProjectionRep(concept: Concept): boolean {
  return concept.representations?.some((r) => r.valueProjection !== undefined) ?? false;
}

/** THE ORACLE. `shape === "Scalar" && hasCodeIs && def === undefined && !hasValueProjectionRep`
 *  (reductionShapeValidator.ts:381). */
export function isBareScalarCodeTarget(concept: Concept): boolean {
  return (
    concept.shape === "Scalar" &&
    concept.code !== undefined &&
    concept.definition === undefined &&
    !hasValueProjectionRep(concept)
  );
}

/** The single resolved value type, or undefined when 0 or >1 are declared (mirrors :159). */
function singleValueType(concept: Concept): ConceptValueType | undefined {
  const vts = concept.valueTypes ?? [];
  return vts.length === 1 ? vts[0] : undefined;
}

/** The migration class + author-facing step for a bare-scalar-code target, conditioned on value
 *  type FIRST then representation count — the exact branch order of the rule's suggested action
 *  (reductionShapeValidator.ts:388-396). */
export function migrationClassFor(concept: Concept): { migrationClass: MigrationClass; migrationStep: string } {
  const vt = singleValueType(concept);
  const repCount = repCountOf(concept);
  if (vt === "boolean") {
    return {
      migrationClass: "boolean-presence",
      migrationStep: "add `- definition is exists this.` (a boolean presence determination)",
    };
  }
  if (vt === undefined) {
    // §3 requires a declared value type; a copied `exists this` would be a guess. Author decision.
    return {
      migrationClass: "value-type-unresolved",
      migrationStep:
        "declare a single `value type is <T>.` first, THEN the reduction the type implies " +
        "(boolean → `exists this`; a value type → `most recent this`)",
    };
  }
  if (repCount > 1) {
    return {
      migrationClass: "promote-recordset",
      migrationStep:
        `promote a single representation to a named \`- shape is RecordSet.\` concept and reduce ` +
        `THAT (a \`most recent this\` here would span ${repCount} representations — reduction-multi-rep)`,
    };
  }
  return {
    migrationClass: "value-read",
    migrationStep: `add \`- definition is most recent this.\` (to publish the most recent record's \`${vt}\` value)`,
  };
}

// ---------------------------------------------------------------------------------------------
// Value-read viability — a `value-read` migration (`most recent this`) is only mechanically
// applicable when the concept has a resource whose value element admits the value type. Cross-checks
// the T3a FHIR value-read model (design §8). Without this, the inventory recommends an impossible
// `most recent this` for a valueless / typeless target (panel R1 gpt56 #4).
// ---------------------------------------------------------------------------------------------

// Only meaningful for a SINGLE-representation `value-read` (`most recent this`); the caller gates on
// `migrationClass === "value-read"`. A missing `type is` is NOT a blocker — the emitter defaults the
// local resource to Observation (effectiveRepresentation.ts:273, charter §3), so we check against that
// default. A multi-rep `promote-recordset` target is deliberately NOT checked here: which representation
// the KE promotes (and thus which value element feeds the reduction) is the KE's choice — a concept-level
// check would false-flag a viable posrep (panel R2 both arms: Height/Weight).
export function valueReadPathBlocker(concept: Concept): string | null {
  const vt = singleValueType(concept);
  if (vt === undefined || vt === "boolean") return null; // not a value-read migration
  const rt = concept.conceptType ?? "Observation"; // implicit-standard local resource (charter §3)
  const raw = concept.valueElement?.path;
  const relPath = raw ? relativeElementPath(raw, rt) : "value"; // implicit-standard value element
  const admitted = valueReadValueTypes(rt, relPath);
  if (admitted === undefined) {
    return "value-read not applicable: " + rt + "." + relPath + " is not in the FHIR value-read model (unmodeled — design §8)";
  }
  if (admitted.size === 0) {
    return "value-read not applicable: " + rt + "." + relPath + " is modeled-valueless — nothing for `most recent this` to read (design §8)";
  }
  if (!admitted.has(vt)) {
    return "value-read type mismatch: " + rt + "." + relPath + " does not admit value type " + vt + " (design §8)";
  }
  return null;
}

function makeDecl(filePath: string, lib: string | undefined, concept: Concept): DeclIdentity {
  return {
    filePath,
    libraryName: lib,
    conceptName: concept.name,
    line: lineOf(concept.location),
    valueTypes: concept.valueTypes ?? [],
  };
}

// The AUTHORITATIVE no-bare-scalar-code warning set — the raw single-file Validator per included file.
// For this local rule the single-file Validator is resolution-free and collision-IMMUNE (it never
// touches the registry), so every included file gets a real cross-check with no "unavailable" escape
// (panel R1 gpt56 #5 / Claude #4). Keyed by (filePath, conceptName).
function authoritativeNbscKeys(included: ParsedFile[]): Set<string> {
  const keys = new Set<string>();
  for (const { filePath, ast } of included) {
    const result = new Validator().validate(ast); // single-file mode (no sources)
    for (const w of result.warnings) {
      const rule = "rule" in w ? (w as { rule?: string }).rule : undefined;
      const cn = attributedConcept(w);
      if (w.kind === "reduction-shape" && rule === "no-bare-scalar-code" && cn) {
        keys.add(fileConceptKey(filePath, cn));
      }
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------------------------
// Census — a closed coverage equation over a repo-wide `**/*.crl` walk.
// ---------------------------------------------------------------------------------------------

const CENSUS_SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", "tmp", "coverage"]);

/** Recursively collect every `.crl` under `dir`, skipping the named vendor/generated/scratch dirs
 *  (`CENSUS_SKIP_DIRS`) AND every dot-prefixed directory. Sorted for determinism. An UNREADABLE
 *  directory is pushed to `problems` (a scan-integrity failure) rather than silently treated as empty
 *  — an I/O error must not masquerade as a clean census (panel R2 gpt56 #d). */
export function listCrlFilesDeep(dir: string, problems: string[] = []): string[] {
  const out: string[] = [];
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    problems.push(`unreadable directory (census incomplete): ${dir} — ${err instanceof Error ? err.message : String(err)}`);
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (CENSUS_SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listCrlFilesDeep(full, problems));
    } else if (entry.isFile() && entry.name.endsWith(".crl")) {
      out.push(canonicalizeFsPath(full));
    }
  }
  return out;
}

/** An exclusion rule: a path-substring (POSIX `/` separators) that names an intentional-error or
 *  non-content family, plus WHY. Matched against canonicalized (forward-slash) paths. Every rule
 *  MUST match ≥1 discovered file (a dead rule fails the scan — design-R1). */
export interface ExclusionRule {
  contains: string;
  reason: string;
}

/** Category assignment for an INCLUDED (buildable, non-excluded) file, by path convention. */
function includedCategoryFor(posixPath: string): FileCategory {
  if (posixPath.includes("/tests/fixtures/corpus/")) return "corpus";
  // `/harness/` = the engine-proof harness projects; grouped with examples (not "canonical-content",
  // whose blurb says production is external — panel R2 Claude nit).
  if (posixPath.includes("/examples/") || posixPath.includes("/harness/")) return "example-harness";
  if (posixPath.includes("/tests/golden/")) return "golden-source";
  if (posixPath.includes("/tests/fixtures/") || posixPath.includes("/tests/regression/")) return "clean-fixture";
  return "canonical-content";
}

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

// ---------------------------------------------------------------------------------------------
// Per-file parse (oracle + role walk both consume the raw AST; resolution-free).
// ---------------------------------------------------------------------------------------------

interface ParsedFile {
  filePath: string;
  ast: CRL;
}

function parseFile(filePath: string): ParsedFile | { filePath: string; buildError: string } {
  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch (err) {
    return { filePath, buildError: err instanceof Error ? err.message : String(err) };
  }
  const parsed = buildCRL(source);
  if (!parsed.success || !parsed.result) {
    const first = parsed.errors?.[0];
    return { filePath, buildError: first ? `${first.type}: ${first.message}` : "parse failure" };
  }
  return { filePath, ast: parsed.result };
}

function conceptsOf(ast: CRL): Concept[] {
  return ast.statements.filter((s): s is Concept => s.type === "Concept");
}

// ---------------------------------------------------------------------------------------------
// Role walk — replicate referenceResolver's concept-ref edge set, but RECORD edges (referrer →
// referent) instead of checking resolution. Referents keyed by (resolved library, name); the
// library is resolved by the resolver's own rule: bare/self-qualified → referrer's library,
// qualified → the named library.
// ---------------------------------------------------------------------------------------------

function referentKey(ref: ReferenceName, referrerLibrary: string | undefined): string {
  const name = getRefName(ref);
  const lib = isQualifiedRef(ref) ? (getRefLibrary(ref) ?? "") : (referrerLibrary ?? "");
  return `${lib}${KSEP}${name}`;
}

export function declKey(libraryName: string | undefined, conceptName: string): string {
  return `${libraryName ?? ""}${KSEP}${conceptName}`;
}

/** Build the referrer→referent edge index across every parsed file. Keyed by referent declKey. */
export function buildEdgeIndex(files: ParsedFile[]): Map<string, EdgeEvidence[]> {
  const index = new Map<string, EdgeEvidence[]>();

  const add = (
    ref: ReferenceName,
    referrerLibrary: string | undefined,
    ev: Omit<EdgeEvidence, "referentRef">,
  ): void => {
    const key = referentKey(ref, referrerLibrary);
    const list = index.get(key) ?? [];
    list.push({ ...ev, referentRef: refText(ref) });
    index.set(key, list);
  };

  for (const { filePath, ast } of files) {
    const lib = ast.library?.name;
    for (const stmt of ast.statements) {
      switch (stmt.type) {
        case "Concept":
          walkConceptEdges(stmt, filePath, lib, add);
          break;
        case "Decision":
          walkDecisionEdges(stmt, filePath, lib, add);
          break;
        case "Criterion":
          walkCriterionEdges(stmt, filePath, lib, add);
          break;
        case "Activity":
          // Activities reference terminologies (`with "T"`), never concepts — no concept edges.
          void (stmt as Activity);
          break;
      }
    }
  }
  return index;
}

type EdgeAdder = (
  ref: ReferenceName,
  referrerLibrary: string | undefined,
  ev: Omit<EdgeEvidence, "referentRef">,
) => void;

function refText(ref: ReferenceName): string {
  return isQualifiedRef(ref) ? `"${getRefLibrary(ref)}"."${getRefName(ref)}"` : `"${getRefName(ref)}"`;
}

function walkConceptEdges(concept: Concept, filePath: string, lib: string | undefined, add: EdgeAdder): void {
  const owner = { ownerKind: "Concept" as const, ownerName: concept.name, filePath, libraryName: lib };
  const def = concept.definition;
  if (def) {
    switch (def.type) {
      case "DefinedAsDefinition": {
        const body = def.body;
        if (body.type === "DefinedAsBareRef" || body.type === "DefinedAsExists") {
          add(body.ref, lib, { ...owner, edgeKind: "defined-as-target", line: lineOf(body.location) });
        } else if (body.type === "DefinedAsComposition") {
          walkCompositionEdges(body.expression, filePath, lib, concept.name, add);
        }
        break;
      }
      case "DefinitionIsDefinition":
        walkNarrativeEdges(def.body, filePath, lib, concept.name, add);
        break;
      case "ReductionDefinition": {
        const target = def.reduction.target;
        if (target.type === "ReductionConceptRef") {
          add(target.ref, lib, {
            ...owner,
            edgeKind: "structural-reduction-target",
            line: lineOf(target.location),
          });
        }
        break;
      }
      // CodedFromDefinition references a terminology, not a concept — no concept edge.
    }
  }
  // A rep's `value projection` narrative can carry concept refs (walked by the resolver too).
  for (const rep of concept.representations ?? []) {
    if (rep.valueProjection) {
      walkNarrativeEdges(rep.valueProjection.body, filePath, lib, concept.name, add);
    }
  }
}

function walkCompositionEdges(
  expr: CompositionExpression,
  filePath: string,
  lib: string | undefined,
  ownerName: string,
  add: EdgeAdder,
): void {
  switch (expr.type) {
    case "SemOrExpression":
    case "SemAndExpression":
      for (const term of expr.terms) walkCompositionEdges(term, filePath, lib, ownerName, add);
      return;
    case "SemNotExpression":
      walkCompositionEdges(expr.expression, filePath, lib, ownerName, add);
      return;
    case "CompositionGroup":
      walkCompositionEdges(expr.expression, filePath, lib, ownerName, add);
      return;
    case "CompositionRef":
      add(expr.ref, lib, {
        edgeKind: "composition-operand",
        ownerKind: "Concept",
        ownerName,
        filePath,
        libraryName: lib,
        line: lineOf(expr.location),
      });
      return;
  }
}

function walkNarrativeEdges(
  clause: NarrativeClause,
  filePath: string,
  lib: string | undefined,
  ownerName: string,
  add: EdgeAdder,
): void {
  for (const el of clause.elements) walkNarrativeElementEdges(el, filePath, lib, ownerName, add);
}

function walkNarrativeElementEdges(
  el: NarrativeElement,
  filePath: string,
  lib: string | undefined,
  ownerName: string,
  add: EdgeAdder,
): void {
  switch (el.type) {
    case "NConceptRef":
      add(el.value, lib, {
        edgeKind: "narrative-operand",
        ownerKind: "Concept",
        ownerName,
        filePath,
        libraryName: lib,
        line: lineOf(el.location),
      });
      return;
    case "NDisjunction":
      for (const av of el.disjuncts) walkArgValueEdges(av, filePath, lib, ownerName, add);
      return;
    case "NConjunction":
      for (const av of el.conjuncts) walkArgValueEdges(av, filePath, lib, ownerName, add);
      return;
  }
}

function walkArgValueEdges(
  av: ArgValue,
  filePath: string,
  lib: string | undefined,
  ownerName: string,
  add: EdgeAdder,
): void {
  switch (av.type) {
    case "NConceptRef":
      add(av.value, lib, {
        edgeKind: "narrative-operand",
        ownerKind: "Concept",
        ownerName,
        filePath,
        libraryName: lib,
        line: lineOf(av.location),
      });
      return;
    case "NDisjunction":
      for (const inner of av.disjuncts) walkArgValueEdges(inner, filePath, lib, ownerName, add);
      return;
    case "NConjunction":
      for (const inner of av.conjuncts) walkArgValueEdges(inner, filePath, lib, ownerName, add);
      return;
  }
}

function walkDecisionEdges(decision: Decision, filePath: string, lib: string | undefined, add: EdgeAdder): void {
  for (const branch of decision.body.statements) {
    walkBranchEdges(branch, decision.name, filePath, lib, add);
  }
}

function walkBranchEdges(
  branch: BranchBlock,
  decisionName: string,
  filePath: string,
  lib: string | undefined,
  add: EdgeAdder,
): void {
  if (branch.type === "WhenBlock") {
    for (const atom of branchConditionRefs(branch.condition)) {
      add(atom.ref, lib, {
        edgeKind: "when-guard",
        ownerKind: "Decision",
        ownerName: decisionName,
        filePath,
        libraryName: lib,
        line: lineOf(atom.location),
      });
    }
  }
  walkWhenBlockBodyEdges(branch.body, decisionName, filePath, lib, add);
}

function walkWhenBlockBodyEdges(
  body: WhenBlockBody,
  decisionName: string,
  filePath: string,
  lib: string | undefined,
  add: EdgeAdder,
): void {
  if (body.type === "BlockBody") {
    walkBlockBodyEdges(body, decisionName, filePath, lib, add);
  } else {
    walkActionEdges(body, decisionName, filePath, lib, add);
  }
}

function walkBlockBodyEdges(
  block: BlockBody,
  decisionName: string,
  filePath: string,
  lib: string | undefined,
  add: EdgeAdder,
): void {
  for (const stmt of block.statements) {
    if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") {
      walkBranchEdges(stmt, decisionName, filePath, lib, add);
    } else {
      walkActionEdges(stmt, decisionName, filePath, lib, add);
    }
  }
}

function walkActionEdges(
  stmt: ActionStatement,
  decisionName: string,
  filePath: string,
  lib: string | undefined,
  add: EdgeAdder,
): void {
  // A per-action guard references a concept (`unless "C"` / `only when "C"`).
  if (stmt.guard) {
    add(stmt.guard.conceptName, lib, {
      edgeKind: "action-guard",
      ownerKind: "Decision",
      ownerName: decisionName,
      filePath,
      libraryName: lib,
      line: lineOf(stmt.guard.location),
    });
  }
  // RecommendActivity / UseDecision reference activities / decisions, not concepts — no concept edge.
}

function walkCriterionEdges(criterion: Criterion, filePath: string, lib: string | undefined, add: EdgeAdder): void {
  for (const atom of branchConditionRefs(criterion.condition)) {
    add(atom.ref, lib, {
      edgeKind: "criterion-body",
      ownerKind: "Criterion",
      ownerName: criterion.name,
      filePath,
      libraryName: lib,
      line: lineOf(atom.location),
    });
  }
}

function lineOf(loc: { start: { line: number } } | undefined): number {
  return loc?.start.line ?? 0;
}

// ---------------------------------------------------------------------------------------------
// Non-target census — every local-coded concept that is NOT a migration target, classified so
// exemptions are VISIBLE.
// ---------------------------------------------------------------------------------------------

function classifyNonTarget(concept: Concept): NonTargetEntry["reason"] | null {
  // Only concepts with a LOCAL code participate (a `code is`). No local code ⇒ not in this census.
  if (concept.code === undefined) return null;
  if (isBareScalarCodeTarget(concept)) return null; // it's a target, not a non-target
  if (hasValueProjectionRep(concept)) return "value-projection-reduction-exempt";
  const def = concept.definition;
  if (def?.type === "DefinedAsDefinition") return "both-rep-churn"; // code is + defined as
  if (def?.type === "ReductionDefinition" || def?.type === "DefinitionIsDefinition") {
    return "explicit-reduction-or-derivation";
  }
  if (concept.shape === "RecordSet") return "legal-recordset-publication"; // canonical base retrieve
  return "other";
}

const NON_TARGET_NOTE: Record<NonTargetEntry["reason"], string> = {
  "explicit-reduction-or-derivation": "already states its reduction/derivation — no migration owed",
  "value-projection-reduction-exempt":
    "none — a `value projection` posrep supplies the reduction; adding `exists this` would break recency",
  "legal-recordset-publication": "none — a RecordSet publishes its records (canonical retrieve, North Star §3)",
  "both-rep-churn": "none for the rule; emit changes at the flip (asTruths/satisfied removal) — golden churn only",
  other: "not a recognized migration or exempt shape — inspect",
};

// ---------------------------------------------------------------------------------------------
// Driver — cluster the included files by project root and run validateCRLImports once per cluster.
// ---------------------------------------------------------------------------------------------

/** A validated cluster: the warnings/errors harvested from one `validateCRLImports` run. Used for the
 *  SECONDARY warning census + per-concept blockers (both want cross-file scope). The AUTHORITATIVE
 *  `no-bare-scalar-code` reconciliation does NOT use this — it runs the raw single-file Validator per
 *  file (collision-immune), so there is no "cross-check unavailable" escape (panel R1 gpt56 #5 /
 *  Claude #4). */
interface ClusterResult {
  clusterRoot: string;
  success: boolean;
  warnings: ValidationError[];
  errors: ValidationError[];
}

/** Group included files by `findProjectRoot`, then validate each cluster once (any member as the
 *  root file — validateCRLImports validates every local sibling in the cluster's registry, so the
 *  choice of root only affects the include-closure, not which libraries are validated). */
function validateClusters(includedFiles: string[]): Map<string, ClusterResult> {
  const byRoot = new Map<string, string[]>();
  for (const f of includedFiles) {
    const root = projectRootOf(f);
    if (root === null) continue; // no project root ⇒ cannot cluster-validate (oracle still covers it)
    const list = byRoot.get(root) ?? [];
    list.push(f);
    byRoot.set(root, list);
  }

  const results = new Map<string, ClusterResult>();
  for (const [root, files] of byRoot) {
    const rootFile = files[0]; // deterministic (census is sorted)
    const res = validateCRLImports(rootFile);
    results.set(root, {
      clusterRoot: root,
      success: res.success,
      warnings: res.validationWarnings,
      errors: res.validationErrors,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------------------------

export interface InventoryOptions {
  /** The directory to census (walked recursively). Absolute. */
  root: string;
  /** Intentional-error / non-content families to exclude, each with a reason. Every rule must match
   *  ≥1 discovered file. */
  exclusions: ExclusionRule[];
}

export function runInventory(opts: InventoryOptions): InventoryReport {
  const root = canonicalizeFsPath(opts.root);
  const failures: string[] = [];
  const discovered = listCrlFilesDeep(root, failures);

  // -- Census: classify every discovered file into exactly one category. --------------------------
  const census: CensusEntry[] = [];
  const seen = new Set<string>();
  const exclusionHits = new Map<string, number>();
  for (const rule of opts.exclusions) exclusionHits.set(rule.contains, 0);

  // Parse every file once; the oracle + role walk consume the AST, the census consumes build success.
  const parsedOk: ParsedFile[] = [];
  const excludedTargets: ExcludedTarget[] = [];

  for (const filePath of discovered) {
    if (seen.has(filePath)) {
      failures.push(`duplicate census entry: ${filePath}`);
      continue;
    }
    seen.add(filePath);
    const posix = toPosix(filePath);

    // Exclusion (manifest) takes precedence over build state — an intentional broken.crl in an
    // excluded family is EXCLUDED (named), not build-failed. First-match-wins for the hit tally, so a
    // rule fully SHADOWED by an earlier, broader rule reads as "dead" and fails the scan — the loud
    // direction (a redundant rule is surfaced, never silently ignored). Keep rules non-overlapping.
    const rule = opts.exclusions.find((r) => posix.includes(r.contains));
    if (rule) {
      exclusionHits.set(rule.contains, (exclusionHits.get(rule.contains) ?? 0) + 1);
      census.push({ filePath, category: "excluded", reason: rule.reason });
      // Still enumerate any bare-scalar targets INSIDE the excluded family — the flip changes that
      // fixture's expected validation output too, so it must not be hidden (panel R1 gpt56 #1 /
      // Claude #8). Not reconciled (the cluster fails validation for its own intentional reason).
      const exParsed = parseFile(filePath);
      if (!("buildError" in exParsed)) {
        const exLib = exParsed.ast.library?.name;
        for (const concept of conceptsOf(exParsed.ast)) {
          if (isBareScalarCodeTarget(concept)) {
            excludedTargets.push({
              decl: makeDecl(filePath, exLib, concept),
              migrationClass: migrationClassFor(concept).migrationClass,
              familyReason: rule.reason,
            });
          }
        }
      }
      continue;
    }

    const parsed = parseFile(filePath);
    if ("buildError" in parsed) {
      census.push({ filePath, category: "build-failed", reason: parsed.buildError });
      continue;
    }
    parsedOk.push(parsed);
    census.push({
      filePath,
      category: includedCategoryFor(posix),
      libraryName: parsed.ast.library?.name,
      clusterRoot: projectRootOf(filePath) ?? undefined,
    });
  }

  // Dead exclusion rule ⇒ the manifest has drifted from the tree — a hard failure (design-R1).
  for (const [contains, n] of exclusionHits) {
    if (n === 0) failures.push(`dead exclusion rule (matched 0 files): "${contains}"`);
  }

  const includedEntries = census.filter(
    (c) => c.category !== "excluded" && c.category !== "build-failed",
  );
  const includedFiles = includedEntries.map((c) => c.filePath);

  // -- Driver: validate each cluster once. --------------------------------------------------------
  const clusters = validateClusters(includedFiles);

  // -- Oracle: every included concept, the target set + the non-target census. --------------------
  const edgeIndex = buildEdgeIndex(parsedOk.filter((p) => includedFiles.includes(p.filePath)));

  const targets: MigrationTarget[] = [];
  const nonTargets: NonTargetEntry[] = [];
  // oracle target set keyed by (filePath, conceptName) for reconciliation (structured, not split).
  const oracleTargetKeys = new Set<string>();

  for (const parsed of parsedOk) {
    if (!includedFiles.includes(parsed.filePath)) continue;
    const lib = parsed.ast.library?.name;
    const cluster = clusterFor(parsed.filePath, clusters);
    for (const concept of conceptsOf(parsed.ast)) {
      if (isBareScalarCodeTarget(concept)) {
        const decl = makeDecl(parsed.filePath, lib, concept);
        oracleTargetKeys.add(fileConceptKey(parsed.filePath, concept.name));
        const { migrationClass, migrationStep } = migrationClassFor(concept);
        // Cluster-scope the role attribution: a bare/self-qualified ref resolves in the referrer's own
        // library, and a qualified LOCAL ref resolves within the same project (the registry is
        // project-root-scoped; package-origin refs resolve into node_modules, which the census skips).
        // So a referrer sharing this target's project root is the correct set. This can only drop
        // consumer EVIDENCE for a name that collides across projects, never a target (targets come from
        // the oracle) — panel R1 gpt56 #6 / Claude cluster-scoping note.
        const targetRoot = projectRootOf(parsed.filePath);
        const roles = (edgeIndex.get(declKey(lib, concept.name)) ?? []).filter(
          (r) => projectRootOf(r.filePath) === targetRoot,
        );
        // Blockers: cross-file validation errors on this concept + a value-read viability check
        // (a `most recent this` needs a real value element — design §8). Only for a single-rep
        // value-read; a promote-recordset target's viability depends on which rep the KE promotes.
        const blockers = cluster ? errorsForConcept(cluster, lib, concept.name) : [];
        if (migrationClass === "value-read") {
          const pathBlocker = valueReadPathBlocker(concept);
          if (pathBlocker) blockers.push(pathBlocker);
        }
        targets.push({
          decl,
          rule: "no-bare-scalar-code",
          migrationClass,
          migrationStep,
          roles,
          blockers,
        });
      } else {
        const reason = classifyNonTarget(concept);
        if (reason) {
          nonTargets.push({ decl: makeDecl(parsed.filePath, lib, concept), reason, note: NON_TARGET_NOTE[reason] });
        }
      }
    }
  }

  // -- Reconcile: oracle set vs the AUTHORITATIVE per-file validator `no-bare-scalar-code` set. -----
  const authoritativeKeys = authoritativeNbscKeys(parsedOk);
  const { secondaryWarnings, reconcile } = reconcileWarnings(
    clusters,
    includedEntries,
    oracleTargetKeys,
    authoritativeKeys,
  );
  if (!reconcile.ok) {
    for (const d of reconcile.divergences) {
      failures.push(`reconcile divergence (${d.kind}) ${d.filePath} :: ${d.conceptName} — ${d.detail}`);
    }
  }

  // -- Counts. ------------------------------------------------------------------------------------
  const byCategory = emptyCategoryCounts();
  for (const c of census) byCategory[c.category] += 1;
  const counts = {
    discovered: discovered.length,
    included: includedEntries.length,
    excluded: byCategory.excluded,
    buildFailed: byCategory["build-failed"],
    byCategory,
  };

  // Closed-set equation check.
  if (counts.included + counts.excluded + counts.buildFailed !== counts.discovered) {
    failures.push(
      `closed-set equation violated: included(${counts.included}) + excluded(${counts.excluded}) + ` +
        `buildFailed(${counts.buildFailed}) != discovered(${counts.discovered})`,
    );
  }

  return {
    root,
    census,
    counts,
    targets: targets.sort(byDecl),
    excludedTargets: excludedTargets.sort(byDecl),
    nonTargets: nonTargets.sort(byDecl),
    secondaryWarnings,
    reconcile,
    failures,
  };
}

function byDecl(a: { decl: DeclIdentity }, b: { decl: DeclIdentity }): number {
  return (
    a.decl.filePath.localeCompare(b.decl.filePath) ||
    a.decl.conceptName.localeCompare(b.decl.conceptName)
  );
}

function emptyCategoryCounts(): Record<FileCategory, number> {
  return {
    "canonical-content": 0,
    "example-harness": 0,
    "golden-source": 0,
    "clean-fixture": 0,
    corpus: 0,
    excluded: 0,
    "build-failed": 0,
  };
}

function fileConceptKey(filePath: string, conceptName: string): string {
  return `${filePath}${KSEP}${conceptName}`;
}

// Memoized project-root lookup — `findProjectRoot` walks the filesystem, and we ask per file MANY
// times (census, clustering, and the per-edge cluster filter). Same input → same answer within a run.
const projectRootCache = new Map<string, string | null>();
function projectRootOf(filePath: string): string | null {
  const hit = projectRootCache.get(filePath);
  if (hit !== undefined) return hit;
  const root = findProjectRoot(filePath);
  projectRootCache.set(filePath, root);
  return root;
}

function clusterFor(filePath: string, clusters: Map<string, ClusterResult>): ClusterResult | undefined {
  const root = projectRootOf(filePath);
  return root ? clusters.get(root) : undefined;
}

/** Error-severity validation findings attributed to this concept (by conceptName + libraryName),
 *  rendered as blocker strings. */
function errorsForConcept(cluster: ClusterResult, lib: string | undefined, conceptName: string): string[] {
  return cluster.errors
    .filter((e) => attributedConcept(e) === conceptName && (e.libraryName ?? undefined) === (lib ?? undefined))
    .map((e) => `${errKind(e)}: ${e.message}`);
}

/** The concept a structured finding names, when it carries `conceptName` (reduction-shape /
 *  representation-shape / age / use-site families). */
function attributedConcept(e: ValidationError): string | undefined {
  return "conceptName" in e ? (e as { conceptName?: string }).conceptName : undefined;
}

function errKind(e: ValidationError): string {
  const base = e.kind;
  const rule = "rule" in e ? (e as { rule?: string }).rule : undefined;
  return rule ? `${base}/${rule}` : base;
}

/** Reconcile the oracle target set against the AUTHORITATIVE per-file `no-bare-scalar-code` set, and
 *  collect the secondary (other-rule) warnings from the per-cluster runs in the same pass. Both
 *  divergence directions are HARD failures — there is no "unavailable" escape now that the
 *  authoritative set is collision-immune (panel R1 gpt56 #5 / Claude #4). */
function reconcileWarnings(
  clusters: Map<string, ClusterResult>,
  included: CensusEntry[],
  oracleTargetKeys: Set<string>,
  authoritativeNbsc: Set<string>,
): {
  secondaryWarnings: InventoryReport["secondaryWarnings"];
  reconcile: InventoryReport["reconcile"];
} {
  const includedFileSet = new Set(included.map((c) => c.filePath));
  const secondaryWarnings: InventoryReport["secondaryWarnings"] = [];

  // Secondary (other flip-enforced) warnings come from the project-aware per-cluster runs.
  for (const cluster of clusters.values()) {
    for (const w of cluster.warnings) {
      const fp = w.filePath ? canonicalizeFsPath(w.filePath) : undefined;
      if (!fp || !includedFileSet.has(fp)) continue; // only over included files
      const rule = "rule" in w ? (w as { rule?: string }).rule : undefined;
      if (isFlipEnforcedSecondary(w.kind, rule)) {
        secondaryWarnings.push({
          rule: errKind(w),
          decl: { filePath: fp, libraryName: w.libraryName, conceptName: attributedConcept(w) ?? "<unattributed>" },
          message: w.message,
        });
      }
    }
  }

  return { secondaryWarnings, reconcile: diffOracleAgainstValidator(oracleTargetKeys, authoritativeNbsc) };
}

/** Pure set-diff for reconciliation: oracle (AST-predicate) keys vs authoritative validator keys. A
 *  key in one but not the other is a HARD divergence (the oracle is meant to be EXACTLY the rule) —
 *  either direction signals oracle/validator drift. Exported for tests. */
export function diffOracleAgainstValidator(
  oracleKeys: Set<string>,
  validatorKeys: Set<string>,
): { ok: boolean; divergences: ReconcileDivergence[] } {
  const divergences: ReconcileDivergence[] = [];
  for (const key of oracleKeys) {
    if (!validatorKeys.has(key)) {
      const [fp, cn] = key.split(KSEP);
      divergences.push({
        filePath: fp,
        conceptName: cn ?? key,
        kind: "oracle-only",
        detail: "oracle flags a bare-scalar-code target the single-file validator did not warn on (predicate drift)",
      });
    }
  }
  for (const key of validatorKeys) {
    if (!oracleKeys.has(key)) {
      const [fp, cn] = key.split(KSEP);
      divergences.push({
        filePath: fp,
        conceptName: cn ?? key,
        kind: "warning-only",
        detail: "validator warns no-bare-scalar-code but the oracle predicate did not flag it (predicate drift)",
      });
    }
  }
  return { ok: divergences.length === 0, divergences };
}

// The EXPLICIT closed set of OTHER warning→error kinds the §9-step-4 flip hardens (design §2/§7).
// Best-effort census — NOT reconciled (only no-bare-scalar-code has an oracle). Per-rule disposition
// (panel R1 gpt56 #7 / Claude #6):
//   reduction-shape — the shape-coherence WARNINGS that become errors. DELIBERATELY EXCLUDED:
//     · shape-marker-not-emit-active  — DELETED at the flip (reductionShapeValidator.ts:44-46), not hardened.
//     · count-threshold-trivial       — an authoring nit; design §8 does NOT flip it.
//     · no-bare-scalar-code           — the PRIMARY (reconciled) rule, reported in its own section.
//   use-site — `use-site-type-mismatch` findings that route as WARNINGS today harden at the flip
//     (§7 composition-result-type-mismatch; #240/#228 decision-guard-*). DELIBERATELY EXCLUDED:
//     · use-site-operand-untyped      — owned by the #257 value-types-required migration, not §9-step-4
//                                       (validator.ts:93-96).
const SECONDARY_REDUCTION_SHAPE_RULES = new Set([
  "recordset-operand-required",
  "reduction-result-nonboolean",
  "reduction-this-no-representation",
  "reduction-multi-rep",
  "recordset-scalar-reduction",
  "record-shape-invariant",
  "non-scalar-missing-type",
]);
// The use-site-type rules the flip hardens (§7 composition-result-type; #240/#228 decision guards; the
// result/operand type-coherence family). Enumerated EXPLICITLY (not a blanket `kind` match) so a future
// warning-severity use-site rule that is NOT flip-hardened cannot silently enter the census
// (panel R2 Claude). Every current UseSiteTypeRule hardens, so this lists all ten by name.
const SECONDARY_USE_SITE_RULES = new Set([
  "operand-shape",
  "boolean-at-refinement-position",
  "boolean-in-refinement-composition",
  "composition-result-type-mismatch",
  "bare-ref-value-type-mismatch",
  "exists-result-nonboolean",
  "negation-result-nonboolean",
  "posrep-value-type-mismatch",
  "decision-guard-nonboolean",
  "decision-guard-record-shaped",
]);
function isFlipEnforcedSecondary(kind: string, rule: string | undefined): boolean {
  if (kind === "reduction-shape") return rule !== undefined && SECONDARY_REDUCTION_SHAPE_RULES.has(rule);
  if (kind === "use-site-type-mismatch") return rule !== undefined && SECONDARY_USE_SITE_RULES.has(rule);
  return false;
}
