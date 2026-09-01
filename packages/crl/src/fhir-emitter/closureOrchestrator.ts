/**
 * CRL → FHIR Definition emit — closure orchestrator (Todo 4 of #73).
 *
 * Drives all 4 per-library emit lanes (Todo 1 ValueSet, Todo 2a Library,
 * Todo 2b ActivityDef, Todo 3 Recommendation + Decision PlanDefs) across
 * the full import closure, then runs 3 closure-level invariants:
 *
 *   1. relativePath uniqueness (skip both colliders) — subsumes cross-
 *      kind PlanDef collisions (Recommendation id vs Decision id both
 *      write to PlanDefinition/<id>.json).
 *   2. Library-existence guarantee + Library.relatedArtifact integrity.
 *   3. Definition-target existence for PlanDef.action.definitionCanonical.
 *
 * Per plan v3.2 [068]:
 *   - Locked sequence: Aggregate → Inv 1 (drop colliders) → Inv 2+3 in
 *     parallel over post-Inv-1 set. Inv 2/3 error messages include
 *     "(downstream of collision on <relPath>)" context when applicable.
 *
 *   - Per-source-library resolvers: built ONCE per closure
 *     (AllLibrariesIndex), then specialized per-source-library inside the
 *     emit loop so bare refs scope to the source library and qualified
 *     refs route to the target library (or null for foreign-unsupported
 *     in v0).
 *
 *   - Closure-level Decision classification: orchestrator computes
 *     root/sub via a closure-wide qualified-key dependency graph
 *     (instead of per-library, which misses cross-library `use decision`
 *     incoming edges). Calls low-level emitDecisionPlanDefinition
 *     directly with the closure-computed isRoot.
 *
 *   - Cross-library concept/terminology refs are UNSUPPORTED in v0 —
 *     resolvers return null → Todo 3 cascade-suppression surfaces the
 *     gap via unresolved-* UnmatchedReference + appropriate cascade
 *     errors. Same-library qualified refs ("CurrentLib"."X") still
 *     resolve locally via normalizeLocalRef.
 */

import type { Activity, BranchBlock, Concept, Decision, ReferenceName, Terminology } from "../ast/types";
import { getRefLibrary, getRefName, isQualifiedRef, normalizeLocalRef } from "../ast/types";
import { buildCriterionTable } from "../ast/criterionExpansion";
import { buildCriterionIndex, guardConceptClosure } from "../ast/criterionIndex";
import { guardDefineNameCollisions } from "../ast/guardDefines";
import { resolveDispositionConfig } from "../dispositions";
import { computeFhirEmitClosure } from "../imports/computeEmitClosure";
import { safeOutputFilename } from "../imports/safeOutputFilename";
import { emitCQLImports, type SuppressedActivityBinding } from "../imports/emit";
import type { PerLibraryEmit } from "../imports/emit";
import { resolveImports } from "../imports/index";
import type { ImportDiagnostic, ResolvedGraph } from "../imports/types";
import type { CRLError } from "../types/errors";

import { catalogFhirLibraries } from "../cql-emitter/catalog/loadCatalog";
import { lowerLocalCodes, astHasConceptLocalCode, preLowerAge } from "../cql-emitter/lowerLocalCodes";
import type { LowerLocalCodesResult } from "../cql-emitter/lowerLocalCodes";
// #189 Slice-C boundary 1 — the decision guard-surface concept names (the SAME set the CQL Interface
// re-exports), used to loud-gate a decision that guards ON a reduction (single source of truth, no drift).
import { interfaceConceptNames } from "../cql-emitter/layeredEmit";
import { flattenDefinedAsBody } from "../ast/inferenceWalk";

import { emitActivityDefinitionsForLibrary, type TerminologyResolver } from "./activity";
import {
  collectCodeIsConceptsInInferenceOrder,
  type CollectedCodeIsConcept,
} from "./caseFeatureCollection";
import { caseFeatureCanonicalUrl, emitCaseFeatureStructureDefinition } from "./structureDefinition";
import { resolveCaseFeatureRecord, type CaseFeatureRecordResolution, resolveFeatureExpressionTarget } from "./caseFeatureRecord";
import { emitLocalCodeSystem } from "./codeSystem";
import {
  emitDecisionPlanDefinition,
  type ActivityResolver,
  type CaseFeatureInputResolver,
  type ConceptResolver,
  type DecisionResolver,
} from "./decision";
import { emitCatalogLibrary, emitLibrary, libraryCanonicalUrl } from "./library";
import { readPackageMetadata } from "./metadata";
import { resolveEmitClock } from "./reproDate";
import { emitRecommendationDefinitionsForLibrary } from "./recommendation";
import { CPG_FEATURE_EXPRESSION_EXT, isFhirDefError } from "./types";
import type { CpgMetadata, EmitOptions, EmittedResource, UnmatchedReference } from "./types";
import { emitValueSetsForLibrary } from "./valueSet";

/**
 * D2 (slice-4c review gpt55 [important] / Claude [critical]) — the CQL-lane hard
 * error kinds the FHIR lane must NOT fold (a DENYLIST). Previously an ALLOWLIST
 * of 3 structural split kinds was folded, which silently DROPPED any other CQL
 * hard error — notably `emit-codesystem-url-conflict` (a real `success:false`
 * from emitCQL.ts) — so MCP `emit_crl_fhir` (FHIR lane only) could report success
 * while the CQL lane failed. Inverting to a denylist folds EVERY CQL hard error
 * EXCEPT the two categories below, which would otherwise be mis-handled.
 *
 * Deliberately EXCLUDED (do NOT fold):
 *   - `emit-unmatched-narrative` (#79 sentinel) — tolerated by design; the FHIR
 *     lane DELIBERATELY emits its design-time forms regardless (cc-screening/cms
 *     rely on it). Folding it would block the FHIR corpus.
 *   - the `lowerLocalCodes` hard kinds — the FHIR orchestrator ALREADY runs
 *     `lowerLocalCodes` itself at the CodeSystem step and surfaces these, so
 *     folding them from the CQL lane too would DOUBLE-count.
 */
const CQL_FOLD_EXCLUDED_KINDS: ReadonlySet<string> = new Set([
  // #79 tolerated sentinel.
  "emit-unmatched-narrative",
  // lowerLocalCodes hard kinds — already surfaced by the FHIR lane's own
  // lowerLocalCodes pass (closureOrchestrator step 1b), so folding here too
  // would double-count.
  "emit-empty-local-code",
  "emit-mixed-code-and-definition",
  // NOTE: `emit-reduction-not-active` is DELIBERATELY not excluded (panel R1, #189 IMPL 3). Unlike the
  // other lowerLocalCodes hard kinds, it has TWO producers: (a) `code is` + reduction (surfaced by the
  // FHIR lane's own lowerLocalCodes) AND (b) a no-`code is` reduction reaching the deep emit throw, which
  // the FHIR lane's own pass NEVER sees (lowerLocalCodes only iterates code-bearing concepts). Excluding
  // it would let a pure-reduction library report a MISLEADING FHIR `success:true` — the D2 hole this
  // denylist exists to prevent. So it is folded (sinking success), and the case-(a) double-count is
  // de-duped against `closureResult.errors` at the fold site below.
  "emit-local-code-missing-type",
  "emit-duplicate-local-code",
  "emit-duplicate-local-concept",
  "emit-local-code-terminology-collision",
  "emit-local-codesystem-name-collision",
]);

export interface FhirDefClosureEmitResult {
  success: boolean;
  resources: EmittedResource[];
  errors: CRLError[];
  unmatched: UnmatchedReference[];
}

export interface FhirDefFromPathResult extends FhirDefClosureEmitResult {
  importDiagnostics: ImportDiagnostic[];
  metadataErrors: CRLError[];
}

/* ─── AllLibrariesIndex + qualifiedKey ─────────────────────────────── */

interface AllLibrariesIndex {
  /** Map<libraryName, Map<conceptName, Concept>>. */
  concepts: Map<string, Map<string, Concept>>;
  /** Map<libraryName, Map<activityName, Activity>>. */
  activities: Map<string, Map<string, Activity>>;
  /** Map<libraryName, Map<decisionName, Decision>>. */
  decisions: Map<string, Map<string, Decision>>;
  /** Map<libraryName, Map<terminologyName, Terminology>>. */
  terminologies: Map<string, Map<string, Terminology>>;
}

/** Tuple-safe qualified-key encoding (round-3 gpt55 nit). */
function qualifiedKey([libraryName, name]: [string, string]): string {
  return JSON.stringify([libraryName, name]);
}

function buildAllLibrariesIndex(
  libraries: ReadonlyArray<{ libraryName: string; ast: { statements: ReadonlyArray<unknown> } }>,
): AllLibrariesIndex {
  const concepts = new Map<string, Map<string, Concept>>();
  const activities = new Map<string, Map<string, Activity>>();
  const decisions = new Map<string, Map<string, Decision>>();
  const terminologies = new Map<string, Map<string, Terminology>>();
  for (const lib of libraries) {
    const conceptMap = new Map<string, Concept>();
    const activityMap = new Map<string, Activity>();
    const decisionMap = new Map<string, Decision>();
    const terminologyMap = new Map<string, Terminology>();
    for (const stmt of lib.ast.statements) {
      const s = stmt as { type: string; name?: string };
      if (s.type === "Concept" && s.name) conceptMap.set(s.name, stmt as Concept);
      else if (s.type === "Activity" && s.name) activityMap.set(s.name, stmt as Activity);
      else if (s.type === "Decision" && s.name) decisionMap.set(s.name, stmt as Decision);
      else if (s.type === "Terminology" && s.name) terminologyMap.set(s.name, stmt as Terminology);
    }
    concepts.set(lib.libraryName, conceptMap);
    activities.set(lib.libraryName, activityMap);
    decisions.set(lib.libraryName, decisionMap);
    terminologies.set(lib.libraryName, terminologyMap);
  }
  return { concepts, activities, decisions, terminologies };
}

/* ─── per-source-library resolvers ─────────────────────────────────── */

function makeResolversForSourceLibrary(
  sourceLibraryName: string,
  index: AllLibrariesIndex,
  cycleMemberKeys: Set<string>,
  metadata: CpgMetadata,
): {
  conceptResolver: ConceptResolver;
  activityResolver: ActivityResolver;
  decisionResolver: DecisionResolver;
  terminologyResolver: TerminologyResolver;
} {
  const conceptResolver: ConceptResolver = (ref) => {
    const normalized = normalizeLocalRef(ref, sourceLibraryName);
    if (isQualifiedRef(normalized)) return null; // cross-library concept unsupported in v0
    const name = getRefName(normalized);
    return index.concepts.get(sourceLibraryName)?.has(name) ? name : null;
  };

  const activityResolver: ActivityResolver = (ref) => {
    const normalized = normalizeLocalRef(ref, sourceLibraryName);
    if (isQualifiedRef(normalized)) {
      // #196 — cross-library activity: a decision may `recommend activity "OtherLib"."name"` (e.g. a shared
      // disposition library). Mirror the decision resolver: emit the recommendation URL only when the target
      // activity is in the closure. `recommendationIdForLib` is policy-id-scoped (not library-scoped), so this
      // matches the AD + recommendation PlanDefinition the TARGET library's closure pass emits. No cycle check —
      // activities don't recurse (unlike `use decision`).
      const targetLib = getRefLibrary(normalized)!;
      const targetName = getRefName(normalized);
      if (!index.activities.get(targetLib)?.has(targetName)) return null;
      return `${metadata.canonicalBase}/PlanDefinition/${recommendationIdForLib(metadata, targetName)}`;
    }
    const name = getRefName(normalized);
    if (!index.activities.get(sourceLibraryName)?.has(name)) return null;
    // Recommendation canonical URL for source library's activity (R1 — policy-id base)
    return `${metadata.canonicalBase}/PlanDefinition/${recommendationIdForLib(metadata, name)}`;
  };

  const decisionResolver: DecisionResolver = (ref) => {
    const normalized = normalizeLocalRef(ref, sourceLibraryName);
    if (isQualifiedRef(normalized)) {
      // cross-library — only emit a URL if target is in closure AND not cycle-skipped
      const targetLib = getRefLibrary(normalized)!;
      const targetName = getRefName(normalized);
      const key = qualifiedKey([targetLib, targetName]);
      if (cycleMemberKeys.has(key)) return null;
      if (!index.decisions.get(targetLib)?.has(targetName)) return null;
      // R1 — policy-id base (single per-closure policy id; cross-library decision
      // targets share it, matching the emitter's `decisionId`).
      return `${metadata.canonicalBase}/PlanDefinition/${decisionIdForLib(metadata, targetName)}`;
    }
    const name = getRefName(normalized);
    const key = qualifiedKey([sourceLibraryName, name]);
    if (cycleMemberKeys.has(key)) return null;
    if (!index.decisions.get(sourceLibraryName)?.has(name)) return null;
    return `${metadata.canonicalBase}/PlanDefinition/${decisionIdForLib(metadata, name)}`;
  };

  const terminologyResolver: TerminologyResolver = (ref) => {
    const normalized = normalizeLocalRef(ref, sourceLibraryName);
    if (isQualifiedRef(normalized)) return null; // cross-library terminology unsupported in v0
    const name = getRefName(normalized);
    if (!index.terminologies.get(sourceLibraryName)?.has(name)) return null;
    // Return the local CQL identifier (the terminology's quoted name in the source library's CQL).
    return name;
  };

  return { conceptResolver, activityResolver, decisionResolver, terminologyResolver };
}

/* ─── slug helpers (mirror per-emit-module slug rules) ──────────────── */

import { pascalCaseNameForId, policyIdBase, slugify } from "./slug";
import { createLocalDomainResolver } from "./localDomain";
import { decisionId } from "./decision";
import { recommendationId } from "./recommendation";
import { tarjanSCC } from "./tarjan";

// R1 — id BASE is the policy id, shared across the whole closure. #237/T1 — these
// DELEGATE to the per-emit-module exported id helpers (was a mirrored expression) so
// the resolver-produced `definitionCanonical` byte-equals the emitter-produced `url`
// by construction — a mirror can silently diverge; a delegation cannot.
function decisionIdForLib(metadata: CpgMetadata, decisionName: string): string {
  return decisionId(metadata, decisionName);
}

function recommendationIdForLib(metadata: CpgMetadata, activityName: string): string {
  return recommendationId(metadata, activityName);
}

/* ─── Closure-level Decision classification + cycle detection ───────── */

interface DecisionClassification {
  /** qualifiedKey set: classified as root */
  rootKeys: Set<string>;
  /** qualifiedKey set: in a cycle; emit skipped */
  cycleMemberKeys: Set<string>;
  /** errors generated by cycle detection */
  errors: CRLError[];
}

function classifyClosureDecisions(
  libraries: ReadonlyArray<{ libraryName: string; decisions: ReadonlyArray<Decision> }>,
  index: AllLibrariesIndex,
): DecisionClassification {
  const errors: CRLError[] = [];

  // (1) collect all decision keys
  const allKeys = new Set<string>();
  for (const lib of libraries) {
    for (const dec of lib.decisions) {
      allKeys.add(qualifiedKey([lib.libraryName, dec.name]));
    }
  }

  // (2) build outgoing edges per decision via closure-aware ref walking
  const outgoing = new Map<string, Set<string>>();
  for (const lib of libraries) {
    for (const dec of lib.decisions) {
      const edges = new Set<string>();
      const visitBranch = (branch: BranchBlock): void => {
        const body = branch.body;
        const visitUseDec = (ref: ReferenceName): void => {
          const normalized = normalizeLocalRef(ref, lib.libraryName);
          if (isQualifiedRef(normalized)) {
            const targetLib = getRefLibrary(normalized)!;
            const targetName = getRefName(normalized);
            const key = qualifiedKey([targetLib, targetName]);
            if (allKeys.has(key)) edges.add(key);
          } else {
            const name = getRefName(normalized);
            const key = qualifiedKey([lib.libraryName, name]);
            if (allKeys.has(key)) edges.add(key);
          }
        };
        if (body.type === "ActionStatement") {
          if (body.action.type === "UseDecision") visitUseDec(body.action.decisionName);
          return;
        }
        for (const stmt of body.statements) {
          if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") visitBranch(stmt);
          else if (stmt.action.type === "UseDecision") visitUseDec(stmt.action.decisionName);
        }
      };
      for (const branch of dec.body.statements) visitBranch(branch);
      outgoing.set(qualifiedKey([lib.libraryName, dec.name]), edges);
    }
  }

  // (3) Tarjan SCC over qualified-key graph
  const nodes = Array.from(allKeys);
  const sccs = tarjanSCC(nodes, outgoing);
  const cycleMemberKeys = new Set<string>();
  for (const scc of sccs) {
    const isSelfLoop = scc.length === 1 && outgoing.get(scc[0]!)?.has(scc[0]!);
    if (scc.length > 1 || isSelfLoop) {
      for (const m of scc) cycleMemberKeys.add(m);
      const display = scc
        .map((k) => {
          const parsed = JSON.parse(k) as [string, string];
          return `"${parsed[1]}" (library "${parsed[0]}")`;
        })
        .join(", ");
      errors.push({
        type: "Validation",
        kind: "circular-decision-reference",
        message: `Circular decision reference among: ${display}. Skipping all members.`,
      });
    }
  }

  // (4) incoming computation → root classification
  const incoming = new Map<string, Set<string>>();
  for (const k of allKeys) incoming.set(k, new Set());
  for (const [from, tos] of outgoing) {
    for (const to of tos) incoming.get(to)?.add(from);
  }

  const rootKeys = new Set<string>();
  for (const k of allKeys) {
    if (cycleMemberKeys.has(k)) continue;
    if ((incoming.get(k)?.size ?? 0) === 0) rootKeys.add(k);
  }

  // (5) empty-strategy-entrypoint check (suppressed when cycle errors present)
  if (rootKeys.size === 0 && cycleMemberKeys.size === 0 && allKeys.size > 0) {
    errors.push({
      type: "Validation",
      kind: "empty-strategy-entrypoint",
      message:
        "Closure has no root decision. Every decision is referenced by another via 'use decision', and no cycles were detected. Modeling error?",
    });
  }

  // Silence unused warnings — index is structurally part of the API but
  // walked only via libraries here.
  void index;

  return { rootKeys, cycleMemberKeys, errors };
}

// tarjanSCC factored to ./tarjan for shared use between per-library
// (decision.ts) and closure-level (this file) cycle detection — v2.4.0
// round-5 Gemini disposition.

/**
 * Truth-set case-feature collection (the recursive `code is` lane).
 *
 * For each decision `when` condition C in a source's decisions, the case-feature
 * inputs + StructureDefinitions are the RECURSIVE `code is` (LocalPrimitives) closure
 * of C in INFERENCE ORDER — C's own `code is` first (if any), then C's `defined as`
 * operands left-to-right, recursing into nested inferences (see
 * `caseFeatureCollection.ts`). This REPLACES the prior library-wide
 * `interfaceSurface(lowered.ast)` LocalPrimitives scan: the SD set is now exactly the
 * union (deduped by name) over all decision conditions of their recursive
 * collections, and the per-condition ordered list drives the `action.input[]`.
 *
 * ⚠⚠ #189 2d IN PROGRESS — the "always boolean Observation" wording below is the HACK being REMOVED, NOT the
 * model. AUTHORITY: `docs/CRL-NORTH-STAR.md` §4 "Case-features are ANY resource". A case-feature is typed by the
 * concept's OWN natural resource (`type is`); a valueless record (Condition/…) has no boolean (truth = `exists`);
 * only NON-EPHEMERAL local `code is` records are case-features (derived/computed concepts are CQL only, their
 * case-features are the records they derive from). There is NO Observation-only fallback. 2d flips the collection
 * + SD emit to be descriptor-driven and gated to the proven resource subset (Condition+Observation+Patient; #290).
 *
 * (Historical, the hack:) LOCALSOURCE-ALWAYS-BOOLEAN RULE — a concept was a boolean case-feature iff it had a
 * lowered local `code is`, REGARDLESS of its declared `value type is`; there was no value-type gate (the old
 * `resolvesToBoolean` / `emit-casefeature-non-boolean` diagnostic is gone); `code is` ⟹ boolean Observation
 * case-feature.
 *
 * Both consumers (the action-level `input` resolver in step 5a and the
 * case-feature SD emit in step 6) run off the SAME `CaseFeatureCollection`, so the
 * input set and the SD set are the SAME set by construction — an `action.input`
 * profile can never address an SD that was not emitted.
 *
 * `definedAsByName` prefers the `DefinedAsDefinition`-bearing concept when a name
 * resolves to two lowered statements (a both-representation concept that
 * `lowerLocalCodes` split into a LocalPrimitives retrieve twin + an Inferences fold-in
 * twin — the Inferences twin carries the `defined as` to recurse).
 */
export interface CaseFeatureCollection {
  /** condition name → ordered recursive `code is` inputs (inference order). */
  inputsByCondition: Map<string, CollectedCodeIsConcept[]>;
  /** union of all collected concepts (deduped by name, first-seen order). */
  unionConcepts: CollectedCodeIsConcept[];
}

// Exported for the F2 unit test (foreign-qualified-condition clobber). Not part
// of the public emit API — internal helper surfaced for targeted coverage.
export function collectCaseFeatures(
  lowered: LowerLocalCodesResult,
  decisions: ReadonlyArray<Decision>,
  libraryName: string,
): CaseFeatureCollection {
  const codeByConcept = new Map<string, string>();
  for (const lc of lowered.localCodes) codeByConcept.set(lc.concept, lc.code);
  // Prefer the `DefinedAsDefinition`-bearing twin (the Inferences fold-in twin of a
  // both-rep concept is appended LAST by lowerLocalCodes, but select explicitly
  // rather than relying on last-wins).
  // ⚠ Prefer the twin carrying the AUTHORED definition — any form, not just `defined as`. The dependency
  // edge is now read from every definition form (`ast/conceptDependencies`), so a DefinedAs-only preference
  // would let first-wins select the synthesized RETRIEVE twin for a `definition is` both-rep, yield no
  // edges, and stop the walk at the first concept — reintroducing on the lowered path exactly the defect
  // this edge widening fixes.
  const definedAsByName = new Map<string, Concept>();
  for (const stmt of lowered.ast.statements) {
    if (stmt.type !== "Concept" || !stmt.name) continue;
    const existing = definedAsByName.get(stmt.name);
    // The AUTHORED definition is anything except the synthesized retrieve (`CodedFromDefinition`, which
    // `lowerLocalCodes` puts on the LocalPrimitives twin and which carries no concept edges).
    const carriesAuthored = stmt.definition !== undefined && stmt.definition.type !== "CodedFromDefinition";
    if (existing === undefined || carriesAuthored) definedAsByName.set(stmt.name, stmt);
  }

  // Collect every `when` condition ref across the source's decisions (any depth).
  // A compound guard contributes ALL its operand refs (each is a case-feature
  // input). NOTE (i.1): this is the full atom set for the decision; the
  // ARM-SPECIFIC input union per emitted DNF arm (G15) is decided at the emit
  // site (decision.ts) in i.3, not here.
  // #236 — a guard atom may reference a `criterion`; case-features must include the concepts a
  // criterion body references (they become action.input + case-feature SDs, and step-E puts the
  // criterion's atom closure into the emitted action.input[] — so these SDs MUST exist or the
  // input dangles). Collect via the criterion INDEX (memoized, LINEAR) — NOT the materializing
  // walk, which would atom-cap a doubling-DAG criterion and silently drop its atoms (post-flip
  // the decision is NOT suppressed, so that omission would ship). Criteria survive lowering.
  const criterionIndex = buildCriterionIndex(lowered.ast.statements);
  const conditionRefs: ReferenceName[] = [];
  const visitBranch = (branch: BranchBlock): void => {
    if (branch.type === "WhenBlock")
      for (const atom of guardConceptClosure(branch.condition, criterionIndex)) conditionRefs.push(atom.ref);
    const body = branch.body;
    if (body.type === "ActionStatement") return;
    for (const stmt of body.statements) {
      if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") visitBranch(stmt);
      // #224 iii.1 — a menu member's `unless`/`only when` guard concept is a case
      // feature too (its `code is` closure → an action `input` + case-feature SD).
      // Without this, a concept referenced ONLY by an action guard would never enter
      // `unionConcepts`, and the emit-site `action.input` would dangle (reference an
      // SD that was never emitted). Both polarities contribute the same case feature.
      else if (stmt.type === "ActionStatement" && stmt.guard)
        conditionRefs.push(stmt.guard.conceptName);
    }
  };
  for (const dec of decisions) for (const branch of dec.body.statements) visitBranch(branch);

  const inputsByCondition = new Map<string, CollectedCodeIsConcept[]>();
  const unionConcepts: CollectedCodeIsConcept[] = [];
  const unionSeen = new Set<string>();
  for (const ref of conditionRefs) {
    // Key the per-condition list by the NORMALIZED bare name (the same name
    // emitWhenBlock looks up).
    const normalized = normalizeLocalRef(ref, libraryName);
    // F2 (impl-review) — a genuinely FOREIGN condition (still qualified AFTER
    // same-library normalization, e.g. `OtherLib."X"`) must NOT insert an
    // `inputsByCondition` entry. `emitWhenBlock` only ever queries the resolver
    // with UNQUALIFIED (local) condition names, so a foreign entry is never
    // read — but keying it by its bare name (`getRefName`) would CLOBBER the
    // local condition of the same name: a decision with `when "X"` AND
    // `when OtherLib."X"` would overwrite the local `"X"`'s collected inputs with
    // the foreign `[]`. Skip foreign refs entirely (they get no case-features in
    // v0 anyway — the collector skips qualified leaves).
    if (isQualifiedRef(normalized)) continue;
    const condName = getRefName(normalized);
    const collected = collectCodeIsConceptsInInferenceOrder(
      ref,
      libraryName,
      definedAsByName,
      codeByConcept,
    );
    inputsByCondition.set(condName, collected);
    for (const c of collected) {
      if (unionSeen.has(c.name)) continue;
      unionSeen.add(c.name);
      unionConcepts.push(c);
    }
  }

  return { inputsByCondition, unionConcepts };
}

/* ─── Closure invariants ────────────────────────────────────────────── */

function isUnderCanonicalBase(url: string, base: string): boolean {
  return url === base || url.startsWith(base + "/");
}

/**
 * Inv 1 — relativePath uniqueness across the closure. Skip both colliders.
 * Returns the post-Inv-1 surviving resources + errors emitted.
 */
export function applyInvariant1(resources: ReadonlyArray<EmittedResource>): {
  surviving: EmittedResource[];
  errors: CRLError[];
  /** map of dropped relativePaths for "(downstream of collision on X)" annotations */
  droppedPaths: Set<string>;
} {
  const byPath = new Map<string, EmittedResource[]>();
  for (const r of resources) {
    const list = byPath.get(r.relativePath) ?? [];
    list.push(r);
    byPath.set(r.relativePath, list);
  }
  const errors: CRLError[] = [];
  const surviving: EmittedResource[] = [];
  const droppedPaths = new Set<string>();
  for (const [path, list] of byPath) {
    if (list.length === 1) {
      surviving.push(list[0]!);
      continue;
    }
    droppedPaths.add(path);
    const colliderDescriptions = list
      .map((r) => {
        const loc = r.location?.start;
        const locStr = loc ? ` (line ${loc.line})` : "";
        return `${r.sourceKind ?? "?"} "${r.sourceName ?? "?"}"${locStr}`;
      })
      .join(" vs ");
    errors.push({
      type: "Validation",
      kind: "closure-resource-collision",
      message: `Collision on ${path} between ${colliderDescriptions}. Skipping all colliders.`,
    });
  }
  return { surviving, errors, droppedPaths };
}

/**
 * Inv 0 (slice 4) — canonical `url` uniqueness across the closure. A cross-
 * library canonicalBase-slug collision would otherwise produce two resources
 * (e.g. two local CodeSystems) sharing the same canonical `url`, which is
 * invalid FHIR (a canonical url must resolve to ONE resource). The CQL lane's
 * slug-collision preflight catches the codesystem-slug case on its side; this is
 * the FHIR-side guard, and it covers ANY resource kind with a duplicated url.
 *
 * This only ERRORS — it does not drop. Inv 1 (relativePath uniqueness) handles
 * dropping the colliders when their ids also collide (the common case); when two
 * distinct relativePaths somehow carry the same url, this is the only signal.
 */
export function applyUrlUniquenessInvariant(resources: ReadonlyArray<EmittedResource>): CRLError[] {
  const byUrl = new Map<string, EmittedResource[]>();
  for (const r of resources) {
    const url = (r.resource as { url?: string }).url;
    if (typeof url !== "string" || url === "") continue;
    const list = byUrl.get(url) ?? [];
    list.push(r);
    byUrl.set(url, list);
  }
  const errors: CRLError[] = [];
  for (const [url, list] of byUrl) {
    if (list.length < 2) continue;
    const desc = list
      .map((r) => `${r.sourceKind ?? "?"} "${r.sourceName ?? "?"}" (${r.relativePath})`)
      .join(" vs ");
    errors.push({
      type: "Validation",
      kind: "closure-resource-url-collision",
      message: `Two or more emitted resources share the canonical url "${url}": ${desc}. A canonical url must resolve to a single resource — rename one of the colliding CRL libraries/declarations.`,
    });
  }
  return errors;
}

/**
 * Inv 2 — Library-existence guarantee + Library.relatedArtifact integrity.
 */
export function applyInvariant2(
  resources: ReadonlyArray<EmittedResource>,
  droppedPaths: Set<string>,
  metadata: CpgMetadata,
): CRLError[] {
  const errors: CRLError[] = [];
  const emittedUrls = new Set<string>();
  for (const r of resources) {
    const url = (r.resource as { url?: string }).url;
    if (typeof url === "string") emittedUrls.add(url);
  }

  // (a) library[] integrity
  for (const r of resources) {
    if (r.resourceType !== "ActivityDefinition" && r.resourceType !== "PlanDefinition") continue;
    const libArr = (r.resource as { library?: unknown }).library;
    if (!Array.isArray(libArr)) continue;
    for (const url of libArr) {
      if (typeof url !== "string") continue;
      if (!emittedUrls.has(url)) {
        const context = downstreamContext(url, droppedPaths);
        errors.push({
          type: "Validation",
          kind: "unresolved-library-reference",
          message: `${r.resourceType} "${r.sourceName ?? r.relativePath}" library[] references "${url}" which was not emitted${context}.`,
        });
      }
    }
  }

  // (b) Library.relatedArtifact[depends-on] integrity (under canonicalBase only)
  for (const r of resources) {
    if (r.resourceType !== "Library") continue;
    const ra = (r.resource as { relatedArtifact?: Array<{ type?: string; resource?: string }> }).relatedArtifact;
    if (!Array.isArray(ra)) continue;
    for (const entry of ra) {
      if (entry.type !== "depends-on") continue;
      const url = entry.resource;
      if (typeof url !== "string") continue;
      if (!isUnderCanonicalBase(url, metadata.canonicalBase)) continue; // external — exempt
      if (!emittedUrls.has(url)) {
        const context = downstreamContext(url, droppedPaths);
        errors.push({
          type: "Validation",
          kind: "unresolved-related-artifact",
          message: `Library "${r.sourceName ?? r.relativePath}" depends-on "${url}" which was not emitted${context}.`,
        });
      }
    }
  }

  // (c) StructureDefinition cpg-featureExpression reference integrity. Each
  // emitted case-feature StructureDefinition carries a
  // `extension[cpg-featureExpression].valueExpression.reference` pointing at the
  // policy's `<policyId>-LocalPrimitives` Library canonical (where the `code is`
  // define lives). That reference must resolve to an emitted Library — a dangling
  // case-feature reference (e.g. a malformed manifest with collected `code is`
  // concepts but no LocalPrimitives entry) is a closure-integrity failure, the same
  // class as a dangling `library[]`.
  for (const r of resources) {
    if (r.resourceType !== "StructureDefinition") continue;
    const ext = (r.resource as { extension?: Array<{ url?: string; valueExpression?: { reference?: unknown } }> }).extension;
    if (!Array.isArray(ext)) continue;
    for (const e of ext) {
      if (e.url !== CPG_FEATURE_EXPRESSION_EXT) continue;
      const ref = e.valueExpression?.reference;
      if (typeof ref !== "string") continue;
      if (!emittedUrls.has(ref)) {
        const context = downstreamContext(ref, droppedPaths);
        errors.push({
          type: "Validation",
          kind: "unresolved-feature-expression-reference",
          message: `StructureDefinition "${r.sourceName ?? r.relativePath}" cpg-featureExpression references "${ref}" which was not emitted${context}.`,
        });
      }
    }
  }

  return errors;
}

/**
 * Inv 2(d) — StructureDefinition cpg-featureExpression DEFINE integrity. The companion to Inv 2(c): (c)
 * checks the referenced LIBRARY exists; (d) checks the referenced DEFINE exists IN that library's emitted
 * CQL. A case-feature `valueExpression.expression` is a bare CQL define identifier (`"<X> Records"` for a
 * reduction, `"<X>"` for a RecordSet / age-both-rep) in the LocalPrimitives library. If it names a define that
 * was NOT emitted, the featureExpression DANGLES — it resolves at neither translator-load nor emit, failing
 * only at `$apply`. This is the general backstop for the #189 2d dangle class (both round-1 criticals were
 * green-over-a-broken-artifact precisely because nothing checked featureExpression targets). No-op when the
 * manifest carries no CQL (direct graph-only unit callers, `cqlByLibrary: []`) — like Inv 4.
 */
export function applyFeatureExpressionDefineInvariant(
  resources: ReadonlyArray<EmittedResource>,
  cqlByLibrary: ReadonlyArray<PerLibraryEmit>,
): CRLError[] {
  const errors: CRLError[] = [];
  if (cqlByLibrary.length === 0) return errors; // no emitted CQL to check against — no-op (Inv-4 pattern)

  // Per-library set of emitted define names (parsed from the CQL text). `define "<Name>":`, tolerating a
  // leading `private`/`function` qualifier (case-feature targets are plain defines, but be lenient). LIMITATION
  // (panel round 2, both arms — a nit): `[^"]+` truncates at an escaped `\"` inside a delimited identifier, so a
  // concept name literally containing a `"` could false-dangle. No such name exists in-repo; if one appears,
  // switch to a define-name list carried structurally on `PerLibraryEmit` rather than a regex over the text.
  const definesByLibrary = new Map<string, Set<string>>();
  for (const e of cqlByLibrary) {
    const names = new Set<string>();
    for (const m of e.cql.matchAll(/^\s*define\s+(?:private\s+|function\s+)?"([^"]+)"\s*[:(]/gm)) {
      names.add(m[1]!);
    }
    definesByLibrary.set(e.libraryName, names);
  }

  for (const r of resources) {
    if (r.resourceType !== "StructureDefinition") continue;
    const ext = (
      r.resource as {
        extension?: Array<{ url?: string; valueExpression?: { expression?: unknown; reference?: unknown } }>;
      }
    ).extension;
    if (!Array.isArray(ext)) continue;
    for (const e of ext) {
      if (e.url !== CPG_FEATURE_EXPRESSION_EXT) continue;
      const expr = e.valueExpression?.expression;
      const ref = e.valueExpression?.reference;
      if (typeof expr !== "string" || typeof ref !== "string") continue;
      // The referenced Library canonical's url-tail IS the CQL library name (Inv 6: id == name == url-tail).
      const libName = ref.split("/").pop() ?? ref;
      const defines = definesByLibrary.get(libName);
      // Only check when we HAVE this library's emitted defines; a missing library is Inv 2(c)'s concern.
      if (defines === undefined) continue;
      if (!defines.has(expr)) {
        errors.push({
          type: "Validation",
          kind: "dangling-feature-expression-define",
          message:
            `StructureDefinition "${r.sourceName ?? r.relativePath}" cpg-featureExpression targets define ` +
            `"${expr}", which is NOT emitted in library "${libName}". The featureExpression would resolve at ` +
            `neither translator-load nor emit, failing only at $apply — a dangling case-feature target.`,
        });
      }
    }
  }
  return errors;
}

/**
 * Inv 6 (#186) — LIBRARY IDENTITY AGREEMENT. cqf resolves a layered library by
 * matching `Library.name` to the id `VersionedIdentifiers.forUrl` derives from a
 * referrer's canonical url-TAIL (or the CQL `include` name). So for EVERY emitted
 * Library and every reference-to-a-library the following must hold as ONE
 * identical string `S`:
 *
 *   (a) SELF-agreement — each Library's `id` == `name` == its own url-tail.
 *       (Pre-#186 these were three disagreeing forms — the root defect.)
 *   (b) REFERENT-agreement — for every `PlanDefinition.library` /
 *       `ActivityDefinition.library` / `Library.relatedArtifact[depends-on]` /
 *       StructureDefinition `cpg-featureExpression.reference` whose url is under
 *       the policy canonicalBase, the referenced Library's `name` == that url's
 *       tail. (Inv 2 already checks the url RESOLVES to some emitted resource;
 *       this additionally checks the resolved Library's NAME matches the tail, so
 *       a name/url-tail drift that would still "resolve by url" but FAIL cqf's
 *       name-based `RepositoryFhirLibrarySourceProvider.getLibrary` is caught.)
 *
 * External refs (not under canonicalBase) are exempt — their target Library is
 * not in this closure. FHIRHelpers / CRLCommon / CaseFeatureCommon are simple
 * hyphen-free names already; they pass (a) trivially.
 */
function urlTail(url: string): string {
  const i = url.lastIndexOf("/");
  return i >= 0 ? url.slice(i + 1) : url;
}

export function applyLibraryIdentityInvariant(
  resources: ReadonlyArray<EmittedResource>,
  metadata: CpgMetadata,
  // #186 / #227 — the set of enforced library identities `S` this closure emitted
  // (from the manifest). Every manifest-backed policy Library is enrolled: layered
  // libraries by their per-layer `S`, and (since #227) the name-keeping Root by its
  // unified `S = pascalCaseNameForId(<raw name>)` — the fix that made the Root's FHIR
  // id agree with its CQL header so cqf can load the source. Only the SHARED catalog
  // libraries are excluded by the caller. An EMPTY set (graph-only) makes the
  // invariant a no-op.
  layeredIdentities: ReadonlySet<string>,
): CRLError[] {
  if (layeredIdentities.size === 0) return [];
  const errors: CRLError[] = [];
  // Map every emitted Library's url → its `name` (for referent-agreement).
  const libNameByUrl = new Map<string, string>();
  for (const r of resources) {
    if (r.resourceType !== "Library") continue;
    const res = r.resource as { id?: string; name?: string; url?: string };
    if (typeof res.url === "string" && typeof res.name === "string") {
      libNameByUrl.set(res.url, res.name);
    }
    // (a) self-agreement: id == name == url-tail — ONLY for a LAYERED library
    // (its id is one of the emitted `S`). The non-layered Root is skipped.
    const id = res.id;
    if (id === undefined || !layeredIdentities.has(id)) continue;
    const name = res.name;
    const tail = typeof res.url === "string" ? urlTail(res.url) : undefined;
    if (id !== name || id !== tail || name !== tail) {
      errors.push({
        type: "Validation",
        kind: "library-identity-disagreement",
        message:
          `Library "${r.sourceName ?? r.relativePath}" has disagreeing identifiers — ` +
          `id="${id}", name="${name}", url-tail="${tail}". cqf resolves a layered library by ` +
          `matching Library.name to the url-tail id, so all three MUST be one identical string.`,
      });
    }
  }

  // (b) referent-agreement: each in-closure reference to a LAYERED library must
  // have url-tail == the referenced Library's name. A reference to the non-layered
  // Root (its tail is not a layered `S`) is exempt (the deferred cms/Root case).
  const checkRef = (
    referrer: string,
    url: unknown,
    refKind: string,
  ): void => {
    if (typeof url !== "string") return;
    if (!isUnderCanonicalBase(url, metadata.canonicalBase)) return; // external — exempt
    if (!layeredIdentities.has(urlTail(url))) return; // non-layered Root ref — exempt
    const targetName = libNameByUrl.get(url);
    if (targetName === undefined) return; // Inv 2 reports the unresolved url; not our concern
    if (targetName !== urlTail(url)) {
      errors.push({
        type: "Validation",
        kind: "library-identity-disagreement",
        message:
          `${refKind} "${referrer}" references "${url}", whose target Library.name is ` +
          `"${targetName}" — it must equal the url-tail "${urlTail(url)}" for cqf to resolve it.`,
      });
    }
  };
  for (const r of resources) {
    const res = r.resource as {
      library?: unknown;
      relatedArtifact?: Array<{ type?: string; resource?: string }>;
      extension?: Array<{ url?: string; valueExpression?: { reference?: unknown } }>;
    };
    const referrer = r.sourceName ?? r.relativePath;
    if (r.resourceType === "PlanDefinition" || r.resourceType === "ActivityDefinition") {
      if (Array.isArray(res.library)) {
        for (const u of res.library) checkRef(referrer, u, `${r.resourceType} library[]`);
      }
    }
    if (r.resourceType === "Library" && Array.isArray(res.relatedArtifact)) {
      for (const e of res.relatedArtifact) {
        if (e.type === "depends-on") checkRef(referrer, e.resource, "Library depends-on");
      }
    }
    if (r.resourceType === "StructureDefinition" && Array.isArray(res.extension)) {
      for (const e of res.extension) {
        if (e.url === CPG_FEATURE_EXPRESSION_EXT) {
          checkRef(referrer, e.valueExpression?.reference, "StructureDefinition featureExpression");
        }
      }
    }
  }
  return errors;
}

/**
 * Inv 3 — definition-target existence for PlanDef.action.definitionCanonical.
 */
function applyInvariant3(resources: ReadonlyArray<EmittedResource>, droppedPaths: Set<string>): CRLError[] {
  const errors: CRLError[] = [];
  const emittedUrls = new Set<string>();
  for (const r of resources) {
    const url = (r.resource as { url?: string }).url;
    if (typeof url === "string") emittedUrls.add(url);
  }

  function walkActions(
    actions: ReadonlyArray<Record<string, unknown>>,
    source: EmittedResource,
  ): void {
    for (const a of actions) {
      const dc = a.definitionCanonical;
      if (typeof dc === "string" && !emittedUrls.has(dc)) {
        const context = downstreamContext(dc, droppedPaths);
        errors.push({
          type: "Validation",
          kind: "unresolved-definition-target",
          message: `${source.resourceType} "${source.sourceName ?? source.relativePath}" action references definitionCanonical "${dc}" which was not emitted${context}.`,
        });
      }
      const nested = a.action;
      if (Array.isArray(nested)) {
        walkActions(nested as ReadonlyArray<Record<string, unknown>>, source);
      }
    }
  }

  for (const r of resources) {
    if (r.resourceType !== "PlanDefinition") continue;
    const actions = (r.resource as { action?: ReadonlyArray<Record<string, unknown>> }).action;
    if (!Array.isArray(actions)) continue;
    walkActions(actions, r);
  }
  return errors;
}

/**
 * Inv 5 — action-input-profile referential integrity (action-level
 * PlanDefinition `input`, DTR pattern). Recursively walks every
 * `PlanDefinition.action[...].input[].profile[]` canonical and confirms it
 * resolves to a SURVIVING emitted StructureDefinition specifically (not merely
 * any emitted url) — a case-feature `input` profile must point at a real
 * case-feature SD. Runs over the post-Inv-1 surviving set, so an input pointing
 * at an Inv-1-dropped SD is flagged (with the `downstreamContext` annotation),
 * not silently passed.
 *
 * This is the input-side mirror of Inv 2(c)'s featureExpression-reference check
 * (StructureDefinition → Library) and Inv 3's definitionCanonical check
 * (PlanDef.action → PlanDef/ActivityDef): each is a distinct closure edge, so
 * this is a NEW invariant, NOT an overload of Inv 3's definition check.
 */
export function applyActionInputProfileInvariant(
  resources: ReadonlyArray<EmittedResource>,
  droppedPaths: Set<string>,
): CRLError[] {
  const errors: CRLError[] = [];
  // Restrict the resolvable set to StructureDefinition urls — an input profile
  // MUST address a StructureDefinition, not just any emitted resource.
  const emittedSdUrls = new Set<string>();
  for (const r of resources) {
    if (r.resourceType !== "StructureDefinition") continue;
    const url = (r.resource as { url?: string }).url;
    if (typeof url === "string") emittedSdUrls.add(url);
  }

  function walkActions(actions: ReadonlyArray<Record<string, unknown>>, source: EmittedResource): void {
    for (const a of actions) {
      const inputs = a.input;
      if (Array.isArray(inputs)) {
        for (const input of inputs) {
          const profiles = (input as { profile?: unknown }).profile;
          if (!Array.isArray(profiles)) continue;
          for (const p of profiles) {
            if (typeof p !== "string") continue;
            if (!emittedSdUrls.has(p)) {
              const context = downstreamContext(p, droppedPaths);
              errors.push({
                type: "Validation",
                kind: "unresolved-action-input-profile",
                message: `${source.resourceType} "${source.sourceName ?? source.relativePath}" action input references profile "${p}" which does not resolve to an emitted StructureDefinition${context}.`,
              });
            }
          }
        }
      }
      const nested = a.action;
      if (Array.isArray(nested)) {
        walkActions(nested as ReadonlyArray<Record<string, unknown>>, source);
      }
    }
  }

  for (const r of resources) {
    if (r.resourceType !== "PlanDefinition") continue;
    const actions = (r.resource as { action?: ReadonlyArray<Record<string, unknown>> }).action;
    if (!Array.isArray(actions)) continue;
    walkActions(actions, r);
  }
  return errors;
}

/**
 * Inv 4 (slice 4c / E) — Library content-url ↔ emitted-CQL-file integrity.
 *
 * Every emitted `Library.content[0].attachment.url` is a `../../cql/<file>.cql`
 * reference into the sibling CQL closure. The CQL split-manifest's
 * `outputFilename` set is the exact list of CQL files the split actually wrote.
 * This invariant asserts every Library content url is EXACTLY the shipped
 * `../../cql/<file>.cql` reference where `<file>.cql` is the SPECIFIC
 * `outputFilename` the manifest paired with THAT Library's identity — the
 * forcing function that (a) makes the manifest mandatory to the FHIR lane and
 * (b) catches latent drift where a Library points at a CQL file the split never
 * emitted (e.g. the not-yet-exercised full-split layer case), points at a
 * DIFFERENT source's CQL file, or points outside the shipped `../../cql/`
 * sibling layout (slice-4c review gpt55 [important] #4/#5 + Claude [important]:
 * a bare-basename match against a GLOBAL set would accept both a wrong directory
 * like `../wrong/Real.cql` AND a cross-wired url pointing at another source's
 * emitted file).
 *
 * Keying: `expectedFilenameByLibrary` maps each emitted CQL library's identity
 * (its `cqlLibraryName`, which the FHIR lane stamps as the Library's
 * `sourceName`) → that entry's `outputFilename`. A Library whose `sourceName`
 * isn't in the map (shouldn't happen once the manifest is non-empty) is flagged.
 *
 * No-op when the map is empty (the graph-only unit-test path), since there is no
 * authoritative manifest to check against — the single-entry fallback then
 * synthesizes its own source-derived content url.
 */
const CQL_SIBLING_PREFIX = "../../cql/";

export function applyContentUrlInvariant(
  resources: ReadonlyArray<EmittedResource>,
  expectedFilenameByLibrary: ReadonlyMap<string, string>,
): CRLError[] {
  if (expectedFilenameByLibrary.size === 0) return [];
  const errors: CRLError[] = [];
  for (const r of resources) {
    if (r.resourceType !== "Library") continue;
    const content = (r.resource as { content?: Array<{ url?: string }> }).content;
    if (!Array.isArray(content)) continue;
    // #227 — key on the Library's OWN emitted `id` (== the manifest `libraryName` ==
    // `S`), NOT the resource's `sourceName`. `sourceName` is public source-attribution
    // (echoed in the MCP resource manifest) and stays the raw CRL name for a
    // name-keeping-root; the id is the identity the manifest pairs with the filename.
    const libId = (r.resource as { id?: string }).id;
    const expected = libId !== undefined ? expectedFilenameByLibrary.get(libId) : undefined;
    for (const item of content) {
      const url = item.url;
      // A non-string/empty url is itself a broken content reference — fall through
      // to the error branch (slice-4c review Claude [nit]: don't silently skip a
      // hole in an integrity invariant). Coerce to "" so the prefix/expected
      // checks below fail and the error names the offending value.
      const urlStr = typeof url === "string" ? url : "";
      // The shipped layout is exactly `../../cql/<that library's outputFilename>`.
      // Require the sibling prefix AND an exact match to the per-identity
      // expected filename — a wrong directory, a cross-wired sibling, or a file
      // no source emitted all fail.
      const inSiblingLayout = urlStr.startsWith(CQL_SIBLING_PREFIX);
      const filename = urlStr.slice(CQL_SIBLING_PREFIX.length);
      if (!inSiblingLayout || expected === undefined || filename !== expected) {
        errors.push({
          type: "Validation",
          kind: "library-content-url-unresolved",
          message:
            `Library "${r.sourceName ?? r.relativePath}" content url "${urlStr}" does not resolve to the ` +
            `CQL file the split-manifest paired with it` +
            (expected !== undefined ? ` ("${CQL_SIBLING_PREFIX}${expected}")` : "") +
            `. Every emitted Library must reference its OWN sibling CQL file under the shipped ` +
            `\`${CQL_SIBLING_PREFIX}<file>.cql\` layout. This usually means the FHIR lane materialized a ` +
            `Library for a CQL library the split plan did not produce, cross-wired it to another source's ` +
            `CQL file, or pointed it outside the sibling \`cql/\` directory (manifest drift).`,
        });
      }
    }
  }
  return errors;
}

function downstreamContext(url: string, droppedPaths: Set<string>): string {
  // Tightened per round-5 Claude nit: require BOTH the resource-type
  // prefix AND the id stem to match, so a dropped `ValueSet/foo.json`
  // doesn't false-positive-annotate an unrelated PlanDefinition URL
  // that happens to end in `/foo`.
  for (const dropped of droppedPaths) {
    const [resourceType, idJson] = dropped.split("/");
    if (!resourceType || !idJson) continue;
    const id = idJson.replace(/\.json$/, "");
    if (url.includes(`/${resourceType}/${id}`)) {
      return ` (downstream of collision on ${dropped})`;
    }
  }
  return "";
}

/* ─── Public API ────────────────────────────────────────────────────── */

/**
 * Closure-level FHIR Definition emit. Takes a resolved import graph +
 * package metadata; returns the aggregated resource set + errors +
 * unmatched references.
 */
export function emitFhirDefClosure(
  graph: ResolvedGraph,
  metadata: CpgMetadata,
  opts: EmitOptions = {},
  // Slice 4c (E) — the A→E split-manifest (`emitCQLImports(path).cqlByLibrary`).
  // The CQL lane is the SINGLE source of the split decision; the FHIR lane
  // CONSUMES it (it does NOT re-run the split gate). Each `PerLibraryEmit` is
  // annotated with `sourceLibraryName` / `role` / `includes` / `outputFilename`
  // so this lane can materialize one FHIR Library per emitted CQL library and
  // route the per-entry depends-on edges. `emitFhirDefFromPath` always threads
  // it; callers that synthesize a graph directly (the closure unit test) pass
  // `[]` → every source falls back to the single-entry (per-CRL) path, which is
  // byte-identical to pre-slice-4c behavior.
  cqlByLibrary: ReadonlyArray<PerLibraryEmit> = [],
  // #186 follow-up — the CQL lane's suppression decisions (activities-only libraries
  // whose empty CQL was dropped, each paired with its consumer decision library).
  // CONSUMED verbatim: the FHIR lane skips the hollow Library for a suppressed source
  // and rebinds its ADs/recommendation-PDs onto the consumer's Interface. NEVER
  // recomputed here (the FHIR closure is a strict superset and could disagree).
  suppressedActivityBindings: ReadonlyArray<SuppressedActivityBinding> = [],
): FhirDefClosureEmitResult {
  const errors: CRLError[] = [];
  const unmatched: UnmatchedReference[] = [];
  const resources: EmittedResource[] = [];

  // Group the manifest by SOURCE library name so each source can emit one FHIR
  // Library per manifest entry. A source absent from the manifest (e.g. the
  // graph-only unit-test path with `cqlByLibrary: []`) takes the single-entry
  // fallback below.
  const manifestBySource = new Map<string, PerLibraryEmit[]>();
  for (const entry of cqlByLibrary) {
    const list = manifestBySource.get(entry.sourceLibraryName) ?? [];
    list.push(entry);
    manifestBySource.set(entry.sourceLibraryName, list);
  }
  // #186 follow-up — suppressed activities-only source → its consumer decision
  // library (the CQL lane's decision, consumed verbatim). A source named here emits
  // NO Library and rebinds its ADs/recommendation-PDs onto the consumer's Interface.
  const suppressedConsumerByLib = new Map<string, string>(
    suppressedActivityBindings.map((b) => [b.suppressedLibraryName, b.consumerLibraryName] as const),
  );
  // Per-Library expected CQL filename — input to the content-url closure
  // invariant (Inv 4). Keyed by each emitted CQL library's identity
  // (`cqlLibraryName`, which the FHIR lane stamps as the Library `sourceName`) so
  // the invariant checks each Library against ITS OWN file, not a global set
  // (slice-4c review: a global set would accept a Library cross-wired to another
  // source's emitted CQL file). Empty manifest → invariant is a no-op.
  const expectedFilenameByLibrary = new Map<string, string>(
    cqlByLibrary.map((e) => [e.libraryName, e.outputFilename] as const),
  );

  // `executable` is not supported: emit produces design-time forms (text/cql
  // Library content, value-set `compose`), not the run-time forms `executable`
  // requires (compiled ELM, value-set `expansion`). Max capability = publishable.
  // Tracked in #113.
  if ((opts.capability ?? "publishable") === "executable") {
    return {
      success: false,
      resources: [],
      errors: [
        {
          type: "Validation",
          kind: "executable-capability-unsupported",
          message:
            "`--capability executable` is not supported: CRL→FHIR emit produces design-time forms (text/cql Library content, value-set `compose`), not the run-time forms `executable` requires (compiled ELM for Library, an `expansion` for ValueSet). Max capability is `publishable`. Track: alphora/clinical-reasoning-language#113.",
        },
      ],
      unmatched: [],
    };
  }

  // Reproducible emit: resolve the publication date ONCE (opts.date →
  // SOURCE_DATE_EPOCH → crl.date → clock → wall clock) and inject it as a fixed
  // clock so every per-resource emitter stamps the identical timestamp with no
  // intra-emit drift. Invalid explicit/env inputs surface as hard errors.
  const { clock, errors: dateErrors } = resolveEmitClock(opts, metadata);
  errors.push(...dateErrors);
  const resolvedOpts: EmitOptions = { ...opts, clock };

  const expandedClosure = computeFhirEmitClosure(graph);

  // #198 (Option B) — the PRIMARY (closure-seed) source libraries are those reached
  // by include-walking from the entry `.crl` (`graph.resolvedLibraries`); any source
  // pulled in via a cross-library ref (from `graph.localLibraries`) is a SIBLING.
  // A sibling `code is` library is disambiguated to `<policyId>-<librarySlug>` for
  // its local CodeSystem + case-feature system url — matching the CQL lane, which
  // makes the SAME determination from the SAME graph, so the two lanes' urls agree.
  const primarySeedPaths = new Set(graph.resolvedLibraries.map((e) => e.filePath));

  // #189 CEL-writer T3b (disc 490) — the ONE shared local-domain resolver, replacing the inline
  // `disambiguateDomain`/`localDomainIdFor` pair below. `localCodePaths` is captured HERE at the RAW boundary:
  // `lowerLocalCodes` runs later per-library (and is pure — `entry.ast` stays raw), but capturing the `code is`
  // predicate up front keeps this lane byte-identical to the CQL lane, which reads its equivalent set from the
  // raw pre-lowering closure. `metadata.name` is always present on the FHIR lane, so `domainIdFor` never falls
  // to the metadata-less `undefined` arm here.
  const localCodePaths = new Set(
    expandedClosure.filter((e) => astHasConceptLocalCode(e.ast)).map((e) => e.filePath),
  );
  const localDomainResolver = createLocalDomainResolver({
    primarySeedPaths,
    localCodePaths,
    policyId: metadata.name,
  });

  // Filter out parse-error placeholders (null/empty names — parse-failure
  // diagnostic is the real signal).
  const libraries = expandedClosure
    .filter((entry) => entry.name !== null && entry.name !== "")
    .map((entry) => {
      const libraryName = entry.name as string;
      const filePath = entry.filePath;
      const isPrimarySeed = primarySeedPaths.has(entry.filePath);
      const statements = entry.ast.statements;
      const activities = statements.filter((s): s is Activity => s.type === "Activity");
      const concepts = statements.filter((s): s is Concept => s.type === "Concept");
      const decisions = statements.filter((s): s is Decision => s.type === "Decision");
      const terminologies = statements.filter((s): s is Terminology => s.type === "Terminology");
      let cqlFileName: string;
      try {
        cqlFileName = `../../cql/${safeOutputFilename(libraryName)}`;
      } catch (e) {
        // Round-5 Claude [important]: unsafe library names can throw out
        // of safeOutputFilename. Surface as a structured CRLError instead
        // of crashing the orchestrator boundary.
        errors.push({
          type: "Validation",
          kind: "unsafe-library-filename",
          message: `Library "${libraryName}" cannot be safely written as a CQL filename: ${(e as Error).message}`,
        });
        cqlFileName = `../../cql/${libraryName}.cql`; // best-effort placeholder; the error already flagged
      }
      return { libraryName, filePath, isPrimarySeed, ast: entry.ast, activities, concepts, decisions, terminologies, cqlFileName };
    });

  // Build the index ONCE (O(N) over closure).
  const index = buildAllLibrariesIndex(libraries);

  // Closure-level Decision classification + cycle detection.
  const classification = classifyClosureDecisions(libraries, index);
  errors.push(...classification.errors);

  // Per-library emit (1-4) + per-decision emit with closure-aware resolvers.
  for (const lib of libraries) {
    // Build per-source-library resolvers.
    const sourceLibResolvers = makeResolversForSourceLibrary(
      lib.libraryName,
      index,
      classification.cycleMemberKeys,
      metadata,
    );

    // (1) ValueSets. The author ValueSets are emitted ONCE per source (their
    // slug + url are keyed on the SOURCE name, unchanged). They are the
    // terminology that, under a partial split, RELOCATES into the `<source>
    // Concepts` CQL library — so in the multi-entry branch their depends-on edge
    // is routed onto the Concepts FHIR Library (alongside the CodeSystem).
    const vsResult = emitValueSetsForLibrary(lib.terminologies, lib.libraryName, metadata, resolvedOpts);
    resources.push(...vsResult.resources);
    errors.push(...vsResult.errors);
    unmatched.push(...vsResult.unmatched);
    const vsCanonicals: string[] = vsResult.resources
      .map((r) => (r.resource as { url?: string }).url)
      .filter((u): u is string => typeof u === "string");

    // (1b) Local CodeSystem for concept-level `code is` codes (slice 4).
    //
    // FIRST run `lowerLocalCodes` for its DIAGNOSTICS — the slice-3 hard errors
    // (mixed code+definition, empty code, missing type, duplicate code) would
    // otherwise be skipped on the FHIR-only path (MCP `emit_crl_fhir`), which
    // never goes through the CQL lane. We use the SAME pass's `localCodes` to
    // select which codes to materialize, so the CodeSystem carries EXACTLY the
    // codes the CQL emits (one source of truth, no second predicate to drift).
    // The lowering kinds are already hard errors (not in FHIR_DEF_WARNING_KINDS),
    // so push them as-is — re-keying would only lose the actionable subtype. On
    // a lowering error, surface it and emit NO CodeSystem for this library.
    //
    // The CodeSystem url + slug stay keyed on the SOURCE name (4a byte-equality
    // pin) — ONE CodeSystem per source as today. Only its depends-FROM edge
    // moves: in the multi-entry branch it is owned by the `<source> Concepts`
    // Library (where the local codes now live), not the source-wide Root.
    let csUrl: string | undefined;
    // #198 (Option B) — the per-source-library local-domain base. Primary (seed)
    // keeps the bare policy id (`metadata.name`, byte-identical to pre-#198); a
    // SIBLING that ALSO declares concept-level `code is` is disambiguated to
    // `<policyId>-<librarySlug>` (a non-`code is` sibling synthesizes no CodeSystem,
    // so it keeps the bare base). Both lanes compute this from the SAME (policyId,
    // libraryName, isPrimary, hasCodeIs) inputs, so the lowering's synthetic
    // `codesystem '<url>'`, this FHIR `CodeSystem.url/id`, and the case-feature
    // `patternCodeableConcept.coding.system` all byte-agree.
    // #189 T3b (disc 490) — via the shared resolver; byte-identical to the prior inline
    // `!isPrimarySeed && astHasConceptLocalCode` disambiguation. `metadata.name` is always present, so the
    // resolver never returns the metadata-less `undefined` arm here.
    const entryLocalDomainId = localDomainResolver.domainIdFor({
      filePath: lib.filePath,
      name: lib.libraryName,
    }) as string;
    // #257 (age slice) T1 — the shared AGE pre-pipeline (retirement scan + standalone posrep
    // synthesis) BEFORE `lowerLocalCodes`, so the retirement fires on the FHIR-only path too (MCP
    // `emit_crl_fhir` never runs the Validator). The standalone transform adds no local code, so the
    // case-feature `localCodes` selection is unchanged.
    const preAge = preLowerAge(lib.ast);
    const lowered = lowerLocalCodes(preAge.ast, {
      canonicalBase: metadata.canonicalBase,
      localDomainId: entryLocalDomainId,
      // ⭐ #189 — the policy id a PRODUCER stage needs for its candidate's `meta.profile`. Threaded on BOTH
      // lanes: a lane that omitted it would refuse concepts the other lane emits, which is precisely the
      // divergence this refactor removes.
      policyId: metadata.name,
    });
    if (preAge.errors.length > 0 || lowered.errors.length > 0) {
      errors.push(...preAge.errors, ...lowered.errors);
    } else {
      const codeConcepts = lowered.localCodes;
      if (codeConcepts.length > 0) {
        const csResult = emitLocalCodeSystem(
          lib.libraryName,
          codeConcepts,
          metadata,
          resolvedOpts,
          entryLocalDomainId,
        );
        if (csResult.resource) {
          resources.push(csResult.resource);
          const u = (csResult.resource.resource as { url?: string }).url;
          if (typeof u === "string") csUrl = u;
        }
        errors.push(...csResult.errors);
        unmatched.push(...csResult.unmatched);
      }
    }

    // (2) Library — one FHIR Library per MANIFEST ENTRY for this source.
    //
    // Single-entry / no-manifest sources (cms22/cms69, per-CRL, hand-split) take
    // the UNCHANGED path: ONE Library named `<source>`, source-wide depends-on
    // (author ValueSets + the local CodeSystem), content url = `lib.cqlFileName`.
    // This keeps every committed FHIR golden byte-identical.
    //
    // Multi-entry sources (partial/full split) emit one Library per entry with
    // PER-ENTRY derived depends-on:
    //   - role:"root"     → depends-on the canonicals of its `includes` that are
    //                       themselves emitted CQL libraries in this source's
    //                       manifest (e.g. `<source> Concepts`). NO CodeSystem /
    //                       author-VS edge here — those moved to Concepts.
    //   - role:"concepts" → depends-on the local CodeSystem + the author
    //                       ValueSets (the relocated terminology).
    //   - role:"layer"    → (full split, no committed golden) depends-on the
    //                       Concepts-layer canonical when it `include`s it; the
    //                       Concepts layer owns the CodeSystem/VS edges. See the
    //                       FOLLOW-UP below re: cms inter-layer deps.
    const manifestEntries = manifestBySource.get(lib.libraryName) ?? [];
    // #186 — the UNIFIED FHIR Library identity `S` for an emitted CQL library,
    // taken DIRECTLY from the manifest (NOT by string-parsing the CQL name).
    //
    // The CQL lane already produced the hyphen-free `S` as the split library's
    // name (`layerLibraryName(policyId, layer)`, e.g. `ExampleSemandInterface`)
    // and stamped it as the manifest entry's `libraryName`. The FHIR lane uses
    // that string VERBATIM as the Library id == url-tail == `name`, so cqf's
    // `Library.name`/url-tail/`include` resolution all agree. The pre-#186
    // `idSuffixFor` string-stripped the policy-id prefix and re-slugified to a
    // lowercase layer token — that BROKE once `S` went hyphen-free (no
    // `<policyBase>-` prefix to strip), which is exactly the #186 defect.
    //
    // A `root` entry that keeps the SOURCE name (the cms / per-CRL non-layered
    // library) has NO layer identity → `undefined`, so `emitLibrary` falls back to
    // the pre-#186 `policyIdBase` id (keeps those goldens byte-identical).
    // A ROOT entry — the per-CRL (`none`-path) source library that emits directly
    // (no `code is` layer split). #227 stamped its manifest `libraryName` with the
    // unified `S = pascalCaseNameForId(<raw name>)`, so this is now role-based (the
    // pre-#227 `libraryName === sourceLibraryName` test no longer holds — `S ≠ raw`).
    // Catalog libraries also carry role "root" but their `sourceLibraryName` is never
    // a closure source, so `manifestBySource` never surfaces them into these finds.
    const isRootEntry = (entry: PerLibraryEmit): boolean => entry.role === "root";
    // #227 — every manifest-backed Library takes its manifest `libraryName` VERBATIM
    // as the FHIR id == name == url-tail. Layered libraries carry their per-layer `S`;
    // a name-keeping ROOT now carries the unified `S = pascalCaseNameForId(<raw name>)`
    // the CQL lane stamped, so its CQL header/id/name/url-tail all agree and cqf can
    // load its source. The pre-#227 `undefined` branch (root → bare `policyIdBase`) is
    // retired here; the no-manifest / graph-only callers (the single-entry site's
    // `only` undefined) still reach `libraryId`'s `policyIdBase` fallback directly.
    const identityForEntry = (entry: PerLibraryEmit): string => entry.libraryName;
    // Reference targets are found by the RAW partition value (`entry.layer`), the
    // one source of truth the CQL split stamps alongside `S` — never by slugging.
    const entryByLayer = (layer: string): PerLibraryEmit | undefined =>
      manifestEntries.find((e) => e.layer === layer);
    // #186 follow-up — the `library[]` identity ANY source's decision/activity/
    // recommendation surface resolves to: its Interface re-export if it split, else
    // its name-keeping Root base (#198-disambiguated when a `none` sibling), else
    // `undefined` (bare `policyIdBase`). Factored so the SAME ladder serves both a
    // library binding to ITSELF and a suppressed activities-only library binding to
    // its consumer decision library — no drift between the two paths.
    const suffixForSource = (sourceName: string): string | undefined => {
      const entries = manifestBySource.get(sourceName) ?? [];
      const iface = entries.find((e) => e.role === "interface");
      if (iface) return identityForEntry(iface);
      const nameRoot = entries.find(isRootEntry);
      return nameRoot ? identityForEntry(nameRoot) : undefined;
    };
    const sourceHasInterface = (sourceName: string): boolean =>
      (manifestBySource.get(sourceName) ?? []).some((e) => e.role === "interface");
    // #186 follow-up — is THIS source a suppressed activities-only library? If so it
    // emits NO Library, and its ADs/recommendation-PDs rebind onto `suppressConsumer`
    // (the CQL lane's chosen decision library), NOT its own (empty) manifest.
    const suppressConsumer = suppressedConsumerByLib.get(lib.libraryName);
    const isSuppressed = suppressConsumer !== undefined;
    // Defensive (belt-and-suspenders): a healthy decision library always emits a
    // rebind target — an `interface` entry OR a name-keeping Root. Check the ACTUAL
    // ladder `suffixForSource` resolves (not merely a non-empty manifest): a
    // malformed manifest with entries but neither an interface nor a name-keeping
    // root would leave `suffixForSource` → undefined and bind the AD to a bare policy
    // root that may not be emitted. Surface a structured error so a would-be silent
    // dangling `library[]` becomes a fail-closed emit. Unreachable on the integrated
    // `emitFhirDefFromPath` path (the same `emitCQLImports` result feeds both the
    // manifest and the bindings, so they cannot disagree); it guards the exported
    // `emitFhirDefClosure` against a hand-built mismatched (manifest, bindings) pair.
    if (isSuppressed) {
      const consumerEntries = manifestBySource.get(suppressConsumer) ?? [];
      const hasRebindTarget = consumerEntries.some((e) => e.role === "interface" || isRootEntry(e));
      if (!hasRebindTarget) {
        errors.push({
          type: "Validation",
          kind: "emit-activities-suppress-target-unresolved",
          message:
            `Activities-only library "${lib.libraryName}" was suppressed to rebind onto consumer ` +
            `"${suppressConsumer}", but that decision library emitted no Interface or name-keeping Root ` +
            `Library, so the rebound ActivityDefinition/Recommendation library[] would dangle.`,
        });
      }
    }
    const emitOneLibrary = (
      libraryName: string,
      libraryIdentity: string | undefined,
      dependsOn: ReadonlyArray<string>,
      cqlFileName: string,
    ): void => {
      const libResult = emitLibrary(
        libraryName,
        metadata,
        dependsOn,
        cqlFileName,
        resolvedOpts,
        libraryIdentity,
      );
      if (libResult.resource) {
        // Plan v3.2 §"emitLibrary post-decorate"
        libResult.resource.sourceKind = "Library";
        // #227 — `sourceName` stays SOURCE ATTRIBUTION (the `libraryName` arg — the raw
        // CRL name for a name-keeping-root), which the MCP resource manifest echoes.
        // Inv 4 keys on the Library's emitted `id` instead, so the identity check does
        // not depend on repurposing this public-output field.
        libResult.resource.sourceName = libraryName;
        if (lib.ast.library?.location) libResult.resource.location = lib.ast.library.location;
        resources.push(libResult.resource);
      }
      errors.push(...libResult.errors);
      unmatched.push(...libResult.unmatched);
    };

    if (isSuppressed) {
      // #186 follow-up — a suppressed activities-only library emits NO FHIR Library.
      // Its ADs/recommendation-PDs rebind onto the consumer decision library's
      // Interface (below). Its manifest is empty and its `.cql` was never written, so
      // emitting a Library here would dangle at Inv 4 (content-url-unresolved).
    } else if (manifestEntries.length <= 1) {
      // Single-entry / no-manifest fallback (byte-identical to pre-slice-4c). Use
      // the manifest entry's outputFilename when present (it equals the source
      // filename for a single-entry source) so a split that wrote a differently-
      // named file still resolves; otherwise the source-derived `lib.cqlFileName`.
      const only = manifestEntries[0];
      // Single-entry sanity (slice-4c review gpt55 [important] #6): a one-entry
      // source from a well-formed manifest is the `none`/per-CRL Root FOR this source.
      // #227 — `only.sourceLibraryName === lib.libraryName` is a TAUTOLOGY here
      // (`manifestBySource` is keyed by `sourceLibraryName`, so every entry it returns
      // matches `lib.libraryName`), which would have neutered this guard. The identity
      // that must hold for a well-formed Root is `libraryName === pascalCaseNameForId(source)`
      // (the SAME `S` the CQL lane stamps). A hand-built manifest (exported
      // `emitFhirDefClosure`) stamping a wrong-but-self-consistent `S`, or a single
      // `concepts` entry, would emit a Library inconsistent with the source while Inv 4
      // (which keys off that same `S`) still passed — surface it as a structured error.
      if (only && (only.role !== "root" || only.libraryName !== pascalCaseNameForId(lib.libraryName))) {
        errors.push({
          type: "Validation",
          kind: "library-content-url-unresolved",
          message:
            `Source library "${lib.libraryName}" has a single manifest entry that is not its Root ` +
            `(role="${only.role}", libraryName="${only.libraryName}", expected ` +
            `"${pascalCaseNameForId(lib.libraryName)}"). A single-entry source must be the per-CRL ` +
            `Root whose identity is pascalCaseNameForId(sourceName); this manifest is malformed.`,
        });
      }
      const cqlFileName = only ? `../../cql/${only.outputFilename}` : lib.cqlFileName;
      const dependsOn = [...vsCanonicals, ...(csUrl ? [csUrl] : [])];
      // #227 — a single-entry source is the per-CRL Root; its id/url/name are the
      // unified `S` the CQL lane stamped as `only.libraryName` (`identityForEntry`).
      // This subsumes the #198 `code is` sibling case: each sibling now carries its
      // OWN `S = pascalCaseNameForId(<raw name>)`, so distinct raw names get distinct
      // identities structurally (its local CodeSystem keeps its `localDomainId` base
      // independently). No-manifest callers (`only` undefined) keep the `policyIdBase`
      // fallback via `libraryId`.
      emitOneLibrary(lib.libraryName, only ? identityForEntry(only) : undefined, dependsOn, cqlFileName);
    } else {
      // Multi-entry (split). The canonicals of THIS source's emitted CQL
      // libraries, keyed by cqlLibraryName, so a root's `includes` can be
      // resolved to a sibling Library canonical (only siblings emitted by THIS
      // source count — a foreign `include` is an external dep, not threaded here).
      const siblingCanonicals = new Map<string, string>();
      for (const e of manifestEntries) {
        // #186 — each sibling's Library canonical is keyed on its unified identity
        // `S` (`identityForEntry` → the manifest `libraryName`), so a
        // depends-on/include edge byte-equals that sibling Library's `url` (which
        // is `libraryCanonicalUrl(metadata, S)`). The include key is the CQL
        // library name `e.libraryName` (what `entry.includes` carries).
        siblingCanonicals.set(
          e.libraryName,
          libraryCanonicalUrl(metadata, identityForEntry(e)),
        );
      }
      for (const entry of manifestEntries) {
        const cqlFileName = `../../cql/${entry.outputFilename}`;
        let dependsOn: string[];
        if (entry.role === "concepts") {
          // R2 — the terminology that relocated into the concepts layer is routed
          // by SOURCE FAMILY: the local CodeSystem (synthetic, from `code is`)
          // lives in `LocalConcepts`; the hand-authored author ValueSets (from
          // `coded from "<valueset>"`) live in `ExternalConcepts`. Under R2 there can
          // be TWO concepts-role entries (LocalConcepts + ExternalConcepts); routing
          // both edges onto BOTH would duplicate/cross-wire them. The RAW partition
          // value (`entry.layer`) discriminates: `LocalConcepts` owns the
          // CodeSystem, `ExternalConcepts` owns the author ValueSets.
          if (entry.layer === "LocalConcepts") {
            dependsOn = [...(csUrl ? [csUrl] : [])];
          } else if (entry.layer === "ExternalConcepts") {
            dependsOn = [...vsCanonicals];
          } else {
            // The pre-R2 partial `Concepts` sibling (single concepts entry, layer
            // token "concepts") still owns BOTH — correct-but-unreached on the
            // deliverable path now, kept so a partial-partition caller stays sound.
            dependsOn = [...vsCanonicals, ...(csUrl ? [csUrl] : [])];
          }
        } else {
          // root / layer: depend on the emitted-CQL-library siblings it includes.
          dependsOn = entry.includes
            .map((inc) => siblingCanonicals.get(inc))
            .filter((u): u is string => typeof u === "string");
          // Partial-split Root must pick up its Concepts sibling (slice-4c review
          // Claude [important]): a partial Root that has `includes` (it always
          // includes its `<lib> Concepts`) yet resolved ZERO sibling canonicals
          // means the manifest/closure disagree and the Root→Concepts depends-on
          // would silently vanish (empty relatedArtifact omitted by emitLibrary).
          // Flag it rather than ship a Root with no Concepts edge. (Full-split
          // `layer` entries legitimately may have foreign-only includes; this
          // guard targets the partial Root, which by construction has a sibling.)
          if (entry.role === "root" && entry.includes.length > 0 && dependsOn.length === 0) {
            errors.push({
              type: "Validation",
              kind: "library-content-url-unresolved",
              message:
                `Partial-split Root Library "${entry.libraryName}" includes ${entry.includes
                  .map((i) => `"${i}"`)
                  .join(", ")} but none resolved to an emitted sibling CQL library in this source's ` +
                `manifest — its Root→Concepts depends-on edge would be lost. The manifest's split entries ` +
                `disagree with the Root's includes.`,
            });
          }
          // D1: under the FULL split the Concepts LAYER is now `role:"concepts"`
          // (it owns the CodeSystem/author-VS depends-on edge, restoring the
          // pre-4c terminology edge that was orphaned when the Concepts layer was
          // mis-classified as a plain `"layer"`). The Asserted/Inferences consuming
          // `layer` entries reach that terminology TRANSITIVELY by depending-on
          // their Concepts sibling here (via `includes`), exactly as the CQL
          // include chain does — no direct CodeSystem edge on the consuming layers
          // is needed. The content-url invariant below still flags any Library
          // pointing at an unwritten CQL file.
        }
        emitOneLibrary(entry.libraryName, identityForEntry(entry), dependsOn, cqlFileName);
      }
    }

    // #186 — the `library[]` IDENTITY the decision/activity/recommendation
    // emitters reference (they resolve it via `libraryCanonicalUrl(metadata,
    // identity)`). Decision-bearing sources FULL source-typed split (the
    // `interface` kind), so their decision surface resolves to the synthesized
    // `<policyId>-Interface` re-export library — the unified `S` of the
    // `role:"interface"` manifest entry (`identityForEntry` → its `libraryName`).
    // ELSE (cms `none`/per-CRL, no Interface) it resolves to the ROOT entry's
    // identity, which is now the unified `S = pascalCaseNameForId(<raw name>)`
    // (#227 — was the bare `policyIdBase`, but that made the FHIR id disagree with
    // the CQL header and cqf could not load the source).
    const interfaceEntry = manifestEntries.find((e) => e.role === "interface");
    // #227 — for a NONE-kind source (no Interface entry) the decision/activity/
    // recommendation `library[]` resolves to the source's ROOT base Library, whose
    // id/name/url-tail are all the unified `S` the CQL lane stamped. Route through the
    // ROOT entry so primary and #198-disambiguated `code is` siblings alike agree with
    // their emitted base Library (each sibling now carries its own `S`).
    const rootEntry = manifestEntries.find(isRootEntry);
    const libraryReferenceSuffix = interfaceEntry
      ? identityForEntry(interfaceEntry)
      : rootEntry
        ? identityForEntry(rootEntry)
        : undefined;
    // #224 iii.1 (A″) — the CQL library NAME (`library X` header) of the library the PD's
    // `library[]` references. A negated `unless` guard emits an inline `text/cql-expression`
    // `not "<name>"."<C>"`, and cqf compiles that against a synthetic library that includes
    // the PD's library UNDER THIS NAME — so the qualifier must be the CQL header. It is the
    // entry's `libraryName` for BOTH an interface re-export AND a name-keeping ROOT: #227
    // unified the ROOT's `libraryName` to the same `S` the CQL header now renders, so this
    // qualifier and the header agree. Falls back to the source library name on the
    // degenerate no-manifest-entry path.
    const guardQualifierLibraryName =
      (interfaceEntry ?? rootEntry)?.libraryName ?? lib.libraryName;

    // #186 follow-up — the `library[]` + interface-scope the ActivityDefinitions and
    // recommendation PlanDefinitions bind to. A SUPPRESSED activities-only library
    // rebinds onto the CONSUMER decision library (its own manifest is empty); a normal
    // library binds to itself (byte-identical to before). `interfaceScoped` MUST track
    // the SAME target — otherwise the activity.ts terminology-interface guard fires
    // (or fails to fire) against the wrong scope, letting a terminology-bound `with`
    // emit a `text/cql-identifier` dynamicValue that dangles in the consumer Interface.
    const activityLibrarySuffix =
      suppressConsumer !== undefined ? suffixForSource(suppressConsumer) : libraryReferenceSuffix;
    const activityInterfaceScoped =
      suppressConsumer !== undefined ? sourceHasInterface(suppressConsumer) : interfaceEntry !== undefined;

    // The LocalPrimitives Library identity — where each `code is` define lives, the
    // target of the case-feature `cpg-featureExpression.reference`. `LocalPrimitives`
    // is a `role:"layer"` manifest entry (imports/emit.ts maps LocalPrimitives →
    // "layer", NOT a distinct role), so it is identified by its RAW partition
    // value (`entry.layer === "LocalPrimitives"`), not by role. A decision-bearing
    // code-is policy ALWAYS emits a LocalPrimitives layer under the full source-typed
    // split; absence here gates the case-feature emit off below (no dangling
    // featureExpression).
    const localSourceEntry = entryByLayer("LocalPrimitives");
    const localSourceReferenceSuffix = localSourceEntry
      ? identityForEntry(localSourceEntry)
      : undefined;

    // (3) ActivityDefinitions
    const actResult = emitActivityDefinitionsForLibrary(
      lib.activities,
      lib.libraryName,
      metadata,
      sourceLibResolvers.terminologyResolver,
      resolvedOpts,
      activityLibrarySuffix,
      activityInterfaceScoped,
    );
    resources.push(...actResult.resources);
    errors.push(...actResult.errors);
    unmatched.push(...actResult.unmatched);

    // (4) Recommendation PlanDefs
    const recResult = emitRecommendationDefinitionsForLibrary(
      lib.activities,
      lib.libraryName,
      metadata,
      resolvedOpts,
      activityLibrarySuffix,
    );
    resources.push(...recResult.resources);
    errors.push(...recResult.errors);
    unmatched.push(...recResult.unmatched);

    // (5) Decision PlanDefs — closure-aware via low-level emitDecisionPlanDefinition.
    //
    // R2 — re-keyed Decision `library[]` contract. The Decision/Activity/
    // Recommendation `library[]` (= `libraryCanonicalUrl(base, libraryReferenceSuffix)`)
    // must resolve to an EMITTED Library. Two cases:
    //   - INTERFACE-KIND (decision-bearing WITH local code → full source-typed
    //     split + Interface): require EXACTLY ONE `role:"interface"` entry. Its
    //     canonical IS the `library[]` target (Inv-2(a) then confirms it resolves).
    //   - NONE-KIND (cms / per-CRL, decision-bearing with NO local code): the old
    //     source/root contract holds — a `role:"root"` entry keeping the source name
    //     (or the no-manifest unit-test path).
    // If a decision-bearing source has NEITHER (a malformed/regressed manifest), the
    // `library[]` would dangle — surface a structured error (NOT a throw; no
    // try/catch on the MCP path) and SKIP this source's decision emit.
    const hasInterfaceEntry = interfaceEntry !== undefined;
    // #227 — a ROOT entry exists for this source. Every entry in `manifestEntries` is
    // already keyed to this source (`manifestBySource` groups by `sourceLibraryName`),
    // so `role === "root"` alone is the post-#227 condition (the pre-#227 predicate keyed
    // on `libraryName === lib.libraryName`, which no longer holds now the Root's name is
    // `S`). `manifestEntries.length === 0` is the no-manifest direct-caller path.
    const hasRootForSource =
      manifestEntries.length === 0 || manifestEntries.some((e) => e.role === "root");
    const hasDecisionLibraryTarget = hasInterfaceEntry || hasRootForSource;
    if (lib.decisions.length > 0 && !hasDecisionLibraryTarget) {
      errors.push({
        type: "Validation",
        kind: "decision-root-library-missing",
        message:
          `Decision-bearing source "${lib.libraryName}" has no manifest entry its Decision/Activity ` +
          `\`library[]\` can reference: neither a \`role:"interface"\` entry (the full source-typed ` +
          `split's re-export surface) nor a \`role:"root"\` entry keeping the source name (the ` +
          `per-CRL/cms path). Its \`library[]\` reference would dangle — this manifest is malformed. ` +
          `Skipping this source's decision emit.`,
      });
    }
    // (5a) Case-feature collection (action-level PlanDefinition `input` + the SD
    // emit below, step 6). The recursive `code is` closure per `when` condition in
    // INFERENCE ORDER drives BOTH consumers off ONE `CaseFeatureCollection`, so the
    // input set and the SD set are the SAME set by construction. Gated on the SAME
    // structural condition as step 6: a decision-bearing source with clean lowering
    // AND a LocalPrimitives layer (the featureExpression target). The resolver maps a
    // normalized condition name → its ordered recursive inputs (each entry's
    // canonical is `caseFeatureCanonicalUrl`, so the `action.input` profile
    // byte-equals the emitted SD `url`).
    const caseFeatureGateOpen =
      lib.decisions.length > 0 && lowered.errors.length === 0 && localSourceEntry !== undefined;
    const caseFeatures: CaseFeatureCollection = caseFeatureGateOpen
      ? collectCaseFeatures(lowered, lib.decisions, lib.libraryName)
      : { inputsByCondition: new Map(), unionConcepts: [] };

    // #189 Slice-C boundary 1 — LOUD GATE on a decision that GUARDS ON a reduction. Detection keys on the
    // decision GUARD SURFACE (`interfaceConceptNames` — the when/action-guard/criterion atoms, the SAME set
    // the CQL Interface re-exports), NOT on case-feature collection. Emitting a reduction case-feature is
    // unsupported for TWO distinct reasons, and a collection-based gate misses one of them:
    //   • CODE-BEARING reduction ("X" = `code is` + `exists this`): its `code is` still registers under "X",
    //     so it IS collected — but the case-feature SD's `cpg-featureExpression` targets `LocalPrimitives."X"`,
    //     which does NOT exist there (LocalPrimitives holds `define "X Records"`; the boolean determination is
    //     in Inferences/Interface). The featureExpression DANGLES: it resolves at neither translator-load nor
    //     emit, failing only at `$apply` — a broken artifact under success:true.
    //   • NAMED/code-less reduction ("Enough Trials" = `count "Trial Records" at least 2`, no own `code is`):
    //     `collectCaseFeatures` never returns it (no code → not collected, and the collector does not descend
    //     `ReductionConceptRef` targets), so a `unionConcepts` filter is SILENT and the decision would emit
    //     an empty-input / no-SD VACUOUS guard under success:true — the plan's original "silent demotion"
    //     (impl-panel round 1, both arms — critical A; the earlier collection-based gate missed this form).
    // Descending a code-LESS reduction to its code-bearing operand records so THEY become the gathered
    // case-features is genuine unconverged design (§4.6 / G1, operator decision A). Until then, fail LOUD and
    // suppress this source's decision + case-feature emit rather than ship an incomplete guard. NOTE: a
    // code-less reduction reached only as a `defined as` OPERAND (not a direct guard atom) is NOT caught by any
    // CQL-lane backstop — the 2b.3b.1ii boolean pivot (`emitCQL.ts`) flips a `Scalar<boolean>` `defined as`
    // composition over total operands to the boolean lane and emits SUCCESSFULLY (no `emit-reduction-in-
    // composition` folds in). So the loud gate below (which walks the guard's `defined as` closure to any
    // code-less reduction) is the ONLY thing catching the mixed/operand form (panel round 2, both arms).
    const reductionNames = new Set<string>(
      lowered.ast.statements
        .filter(
          (s): s is Concept =>
            s.type === "Concept" && s.name !== undefined && s.definition?.type === "ReductionDefinition",
        )
        .map((s) => s.name as string),
    );
    // #189 Slice C 2b.2 — WIDEN to the guard atom's same-lib `defined as` TRANSITIVE operand closure (disc 444
    // #1/#4). Pre-2b.2 a `defined as "R"` alias guard was blocked TRANSITIVELY by the CQL truth-set throw
    // (`assertNotReductionTruthSetOperand` → `emit-reduction-in-composition` folded into this result); 2b.2 FLIPS
    // that alias so it emits successfully, and the transitive loudness DISAPPEARS — so re-erect it here. A guard
    // atom whose `defined as` closure REACHES a reduction is blocked (the reduction case-feature SD is still
    // unconverged). Do NOT follow `definition is` COMPARATOR operands (a comparator is a leaf, not a reduction —
    // an alias-to-comparator is a valid case-feature, disc 444 #4): the walk only descends `defined as` edges.
    const conceptByNameForGate = new Map<string, Concept>();
    for (const s of lowered.ast.statements) {
      if (s.type === "Concept" && s.name !== undefined) conceptByNameForGate.set(s.name, s);
    }
    // REFACTOR:grounded (panel round 2, both arms) — the concepts that HAVE a local `code is` record (raw AST;
    // lowering CLEARS `Concept.code`, so read `lib.ast`). A reduction WITH a code (`code is` + `exists this` — the
    // 2d flagship) is gatherable via its own record; a code-LESS reduction (`count`/`exists`/`most recent` over a
    // NAMED ref, no own code) is NOT — the collector does not descend a `ReductionDefinition` target, so the
    // operand records (e.g. `count "Trial Records"` → the "Trial Records" Procedure) are never gathered.
    const codeBearingConcepts = new Set<string>(
      lib.ast.statements
        .filter((s): s is Concept => s.type === "Concept" && s.name !== undefined && s.code !== undefined)
        .map((s) => s.name as string),
    );
    // Walk a guard atom's same-lib `defined as` closure and collect every CODE-LESS reduction it reaches. Blocking
    // keys on THIS (not on "the condition collected zero inputs" — the old proxy that MISSED the mixed case: a
    // guard `defined as ( CodeBearing and CodelessCount )` collects the code-bearing leaf, so its input set is
    // non-empty, yet the code-less reduction's operand is silently dropped → a partial guard that can never fire at
    // $apply). A reduction is a leaf for this walk (only `defined as` edges are descended). Descending code-less
    // reductions to their code-bearing operands is a later boundary (operator decision A) — until then, fail LOUD.
    const codelessReductionsReached = (start: string): string[] => {
      const found = new Set<string>();
      const visiting = new Set<string>();
      const dfs = (n: string): void => {
        if (visiting.has(n)) return; // cycle/diamond guard
        visiting.add(n);
        if (reductionNames.has(n)) {
          if (!codeBearingConcepts.has(n)) found.add(n); // a code-BEARING reduction is gatherable via its record
          return; // a reduction is a leaf for the gate walk
        }
        const c = conceptByNameForGate.get(n);
        if (c?.definition?.type !== "DefinedAsDefinition") return; // only `defined as` edges are followed
        for (const ref of flattenDefinedAsBody(c.definition.body)) {
          const local = normalizeLocalRef(ref, lib.libraryName);
          if (isQualifiedRef(local)) continue; // genuinely-foreign operand — unsupported/deferred (§4.5)
          dfs(getRefName(local));
        }
      };
      dfs(start);
      return [...found];
    };
    const blockedGuards = interfaceConceptNames(lowered.ast).flatMap((guard) =>
      codelessReductionsReached(guard).map((reduction) => ({ guard, reduction })),
    );
    const reductionCaseFeatureBlocked = blockedGuards.length > 0;
    if (reductionCaseFeatureBlocked) {
      errors.push({
        type: "Validation",
        kind: "unsupported-casefeature-reduction",
        message:
          `Decision-bearing source "${lib.libraryName}" guards on concept(s) that reach a CODE-LESS reduction ` +
          `whose operand records the case-feature collector does not gather: ` +
          `${blockedGuards.map((b) => `"${b.guard}" → "${b.reduction}"`).join(", ")} (e.g. ` +
          `\`count "X Records" at least N\` with no own \`code is\`). The collector does not yet descend into a ` +
          `reduction's operands, so the guard would emit an incomplete case-feature set that can never be ` +
          `satisfied at $apply. Descending to the code-bearing operands is a later #189 boundary (operator ` +
          `decision A); this source's decision + case-feature emit is suppressed rather than ship an incomplete guard.`,
      });
    }

    // #189 2d — resolve each collected (code-bearing) concept to its NATURAL resource + records-define via the
    // descriptor deriver (P2 `resolveCaseFeatureRecord`), keyed by concept name. Both the case-feature SD emit
    // (step 6) and the `action.input` resolver consume this map, so the SD `type` and `action.input.type` agree by
    // construction. The deriver reads the RAW concept (`lib.ast`, pre-lowering — lowering CLEARS `Concept.code`).
    const owningLibMeta = {
      libraryName: lib.libraryName,
      canonicalBase: metadata.canonicalBase,
      localDomainId: entryLocalDomainId,
    };
    const rawConceptByName = new Map<string, Concept>();
    for (const s of lib.ast.statements) {
      if (s.type === "Concept" && s.name !== undefined) rawConceptByName.set(s.name, s);
    }
    // REFACTOR:grounded (charter §4) — store the FULL resolution, not just records. Step 6 and the input
    // resolver both switch on it: `record` → SD + gathered natural-resource input; `supplied-patient` (the
    // uncoded Patient arm, charter §2) → no SD, no input, NO error; a genuine reject (`unsupported-resource` /
    // `not-a-record`) → LOUD at step 6 with the skip's OWN kind + detail (so a bare-scalar / unmodeled-resource /
    // hybrid each get their correct migration prompt, not a generic message).
    const resolutionByName = new Map<string, CaseFeatureRecordResolution>();
    for (const { name } of caseFeatures.unionConcepts) {
      const raw = rawConceptByName.get(name);
      if (raw === undefined) continue;
      resolutionByName.set(name, resolveCaseFeatureRecord(raw, owningLibMeta));
    }

    // F3 (impl-review) — direct-caller trap. The deliverable always threads a
    // manifest (`emitFhirDefFromPath`), so a decision-bearing code-is policy
    // ALWAYS carries a LocalPrimitives layer and the gate opens. But a direct caller
    // (e.g. the closure unit test) can synthesize a graph with `cqlByLibrary: []`
    // → no `localSourceEntry`, so the gate stays CLOSED even when the source has
    // would-be case-features (decision `when` conditions over valid `code is`
    // concepts). Without this guard that caller would SUCCEED while silently
    // emitting ZERO inputs/SDs — a missing-lane that the closure invariants can't
    // catch (there is nothing to dangle). Detect it: clean lowering + decisions +
    // NO LocalPrimitives entry, yet the recursive collection WOULD have produced
    // case-features → hard-error rather than silently skip the case-feature lane.
    if (lib.decisions.length > 0 && lowered.errors.length === 0 && localSourceEntry === undefined) {
      const wouldCollect = collectCaseFeatures(lowered, lib.decisions, lib.libraryName);
      if (wouldCollect.unionConcepts.length > 0) {
        errors.push({
          type: "Validation",
          kind: "decision-root-library-missing",
          message:
            `Decision-bearing source "${lib.libraryName}" has decision conditions whose recursive ` +
            `\`code is\` closure would emit case-features (${wouldCollect.unionConcepts
              .map((c) => `"${c.name}"`)
              .join(", ")}), but the manifest has no LocalPrimitives layer entry (the case-feature ` +
            `\`cpg-featureExpression\` target). The case-feature lane would be silently skipped. A ` +
            `decision-bearing code-is policy must emit a LocalPrimitives layer; thread the split-manifest ` +
            `(\`emitFhirDefFromPath\`) instead of a bare graph.`,
        });
      }
    }
    // REFACTOR:grounded (charter §4) — a decision `action.input` is emitted ONLY for a concept that resolves to
    // a gatherable `record`, carrying its NATURAL resource type (so `action.input.type` == the emitted SD `type`
    // by construction). A `supplied-patient` concept (the uncoded Patient arm, READ not gathered) contributes NO
    // input; an unsupported/not-a-record concept contributes no input either (step 6 raises the loud diagnostic).
    // There is NO Observation fallback — an input never carries a resource type the case-feature lane can't stand behind.
    const caseFeatureInputResolver: CaseFeatureInputResolver = (name) =>
      (caseFeatures.inputsByCondition.get(name) ?? []).flatMap((c) => {
        const res = resolutionByName.get(c.name);
        if (res?.kind !== "record") return [];
        return [
          {
            name: c.name,
            canonical: caseFeatureCanonicalUrl(metadata, c.name),
            resourceType: res.descriptor.resourceType,
          },
        ];
      });

    // When the contract is violated we skip THIS source's decision emit (handled by
    // the loop guard below); there are no later per-lib steps, so a plain guarded
    // loop suffices.
    // #224 ii.1c — the source library's criterion table (from the RAW `lib.ast`; criteria
    // survive lowering unchanged, so it matches the lowered-AST table `collectCaseFeatures`
    // builds). Threaded to the decision emit so a guard referencing a criterion is expanded
    // at `emitWhenBlock` entry (sole-ref collapse + the overflow diagnostic live there).
    const libCriterionTable = buildCriterionTable(lib.ast.statements);
    // ⚠ #189 — the guard-define name check runs in THIS lane too, not only in the CQL lane where the
    // duplicate `define` would materialize. A FHIR-only emit writes `not "<Lib>"."Guard L…C…"` just the
    // same, and if an author declared that name the condition silently negates THEIR declaration.
    errors.push(...guardDefineNameCollisions(lib.ast));
    for (const decision of hasDecisionLibraryTarget && !reductionCaseFeatureBlocked ? lib.decisions : []) {
      const decKey = qualifiedKey([lib.libraryName, decision.name]);
      if (classification.cycleMemberKeys.has(decKey)) continue;
      const isRoot = classification.rootKeys.has(decKey);
      const decResult = emitDecisionPlanDefinition(
        decision,
        lib.libraryName,
        metadata,
        sourceLibResolvers.conceptResolver,
        sourceLibResolvers.activityResolver,
        sourceLibResolvers.decisionResolver,
        isRoot,
        resolvedOpts,
        libraryReferenceSuffix,
        caseFeatureInputResolver,
        libCriterionTable,
        guardQualifierLibraryName,
      );
      if (decResult.resource) resources.push(decResult.resource);
      errors.push(...decResult.errors);
      unmatched.push(...decResult.unmatched);
    }

    // (6) Case-feature StructureDefinitions — one per recursively-collected
    // `code is` concept (the union over the source's decision conditions, deduped
    // by name — the SAME `caseFeatures.unionConcepts` the input resolver above
    // consumes, so an SD is emitted for EXACTLY the concepts an input addresses).
    //
    // STRUCTURAL gate: only a decision-bearing source with clean lowering AND a
    // LocalPrimitives layer (the featureExpression target) emits case-features. cms22/
    // cms69 carry NO decisions → structural no-op, keeping their goldens
    // byte-identical. (`caseFeatureGateOpen` is the SAME gate used for step 5a.)
    //
    // REFACTOR:grounded (charter §4) — each collected concept emits its case-feature by its resolution:
    //   - `record`          → a StructureDefinition typed by the concept's NATURAL resource (Condition/
    //                         MedicationRequest/Observation/…), coding on that resource's own element, valueless
    //                         unless a value READ (`most recent this`) supplies a datum; featureExpression → the
    //                         records-retrieve define (the `"<X> Records"` twin for a reduction, else the concept
    //                         name `"<X>"`). (The old forced-Observation-boolean rule is DELETED.)
    //   - `supplied-patient` → NO SD and NO error — the determination is READ from the supplied Patient, not
    //                         gathered via a questionnaire case-feature (charter §2; the uncoded Patient arm).
    //   - reject            → LOUD, carrying the skip's OWN kind + detail (bare-scalar → author `exists this`;
    //                         unmodeled resource → model it; hybrid → park) — never a silent Observation fallback.
    //
    // The `cpg-featureExpression.reference` resolves to the `<policyId>-LocalPrimitives`
    // Library (where the records-retrieve define lives) via `localSourceReferenceSuffix`.
    if (caseFeatureGateOpen && !reductionCaseFeatureBlocked) {
      for (const { name, code } of caseFeatures.unionConcepts) {
        const resolution = resolutionByName.get(name);
        if (resolution === undefined) {
          // A collected case-feature concept with NO resolution means the collection index and `resolutionByName`
          // (both built from `caseFeatures.unionConcepts` / `lib.ast`) disagreed — an internal inconsistency, not a
          // legitimate supplied/read. Fail LOUD rather than silently drop the case-feature (gpt56 round-2 refine).
          errors.push({
            type: "Validation",
            kind: "internal-casefeature-resolution-missing",
            message:
              `Internal: collected case-feature concept "${name}" in source "${lib.libraryName}" has no ` +
              `resolution entry (the case-feature collection and the record-resolution index disagree). This is ` +
              `an emitter invariant violation, not an authoring error.`,
          });
          continue;
        }
        if (resolution.kind === "supplied-patient") {
          // Supplied/read (the uncoded Patient arm — charter §2) — no gathered SD, NOT an error.
          continue;
        }
        if (resolution.kind !== "record") {
          // A genuine reject (`unsupported-resource` / `deferred-sourced` / `not-a-record`). Fail LOUD with the
          // skip's OWN kind + detail — never fall back to a forced Observation (charter §4).
          const detail =
            resolution.kind === "unsupported-resource"
              ? `natural resource "${resolution.resourceType}" is not in the case-feature emit registry: ${resolution.detail}`
              : resolution.kind === "deferred-sourced"
                ? `a purely-sourced concept (no local \`code is\`) is deferred (E1/#257)`
                : resolution.detail;
          errors.push({
            type: "Validation",
            kind: "unsupported-casefeature-resource",
            message:
              `Case-feature concept "${name}" in source "${lib.libraryName}" is not a gatherable ` +
              `natural-resource record; no case-feature StructureDefinition emitted. ${detail}`,
          });
          continue;
        }
        const record = resolution;
        // ⭐⭐ #189 — THE ANSWER SLOT. Two sources, and the second is why four questions were offered with
        // nothing to answer:
        //   · a value-READING concept (Scalar) already carries its carrier in the read fields;
        //   · a RECORD-publishing concept reads no value on this arm, but its RECORD STILL CARRIES ONE —
        //     `answerCarrier`, from the shared resolver the Interface guard also calls.
        //
        // ⚠ MEASURED before this existed: the SD emitted no `value[x]`, so `$apply` generated four
        // Questionnaire items that were GROUPS WITH ZERO CHILDREN. The tree paused correctly, asked four
        // questions, and none of them could be answered — the pause was a DEAD END.
        const readDatum =
          record.descriptor.valueElement !== undefined && record.descriptor.datumValueType !== undefined
            ? { valueElement: record.descriptor.valueElement, datumValueType: record.descriptor.datumValueType }
            : undefined;
        const answerCarrier =
          record.descriptor.arm === "local-exact" ? record.descriptor.answerCarrier : undefined;
        const valueDatum =
          readDatum ??
          (answerCarrier !== undefined
            ? { valueElement: answerCarrier.element, datumValueType: answerCarrier.valueType }
            : undefined);

        // ⚠⚠ NO DIAGNOSTIC HERE YET, AND THE FIRST ATTEMPT AT ONE WAS INSTRUCTIVE. Round 4 asked for a loud
        // author-facing warning when a locally-coded concept declares a value type its resource cannot carry
        // — because that concept IS the measured dead end (a question offered with nothing to answer),
        // arriving one concept at a time.
        //
        // ⚠ I built it keyed on "declares a value type + no carrier" and it fired on 22 tests, because that
        // predicate is WRONG: a `code is` + `defined as exists` boolean (`Adult Patient`, `Cov`) declares
        // `value type is boolean` and its record is VALUELESS BY DESIGN — its truth is the record's PRESENCE,
        // not a stored value. That is the legal valueless class the B2b panel explicitly protected, and
        // warning on it is the deferral-dressed-as-rejection §0a bans. Worse, `CRLError` carries no severity,
        // so "a warning" pushed into `errors` FAILS THE CLOSURE — a deriver error by another name, which is
        // precisely what round 4 said fail-closed must NOT mean.
        //
        // The honest scope needs a predicate this lane does not have yet: "the answer is a STORED VALUE"
        // (Record-publishing, value-reading) vs "the answer is the RECORD'S PRESENCE" (existence-derived,
        // answered through the coding/binding form — NOTES §3.2, explicitly out of scope this slice). Until
        // that predicate exists, an unanswerable case feature is SILENT here and recorded as build debt on
        // the state file, rather than shipping a warning that cries on correct content.
        const cfResult = emitCaseFeatureStructureDefinition(
          name,
          code,
          metadata,
          resolvedOpts,
          // #189 2d — the concept's NATURAL resource (from the descriptor); the SD `type` follows it,
          // replacing the forced-Observation hack.
          record.descriptor.resourceType,
          // ⭐ RESOLVE THE LAYER ROLE HERE — this is the only place that holds the manifest, and the pair
          // travels on as ONE object from here down (disc 532: a pair split across parameters is a pair
          // nobody maintains together, which is how the library came to be hard-wired).
          //
          // ⚠ NO `?? ""` FALLBACK ANY MORE. That spelling leaned on the emitter's empty-suffix throw as a
          // backstop, i.e. it turned "the manifest entry is missing" into a generic internal-invariant throw
          // one call deeper. Refuse HERE, naming the layer and the concept.
          resolveFeatureExpressionTarget(record.target, name, { "local-primitives": localSourceReferenceSuffix }),
          valueDatum,
          // #198 — the sibling's disambiguated local domain, so the case-feature
          // `patternCodeableConcept.coding.system` matches THIS library's CodeSystem.
          entryLocalDomainId,
        );
        if (cfResult.resource) resources.push(cfResult.resource);
        errors.push(...cfResult.errors);
      }
    }
  }

  // #187 — ALWAYS emit the shared catalog Library resources (CRLCommon +
  // CaseFeatureCommon) ONCE per policy package. The engine resolves the policy
  // layers' `include CRLCommon` / `include CaseFeatureCommon` by these fixed
  // `Library.name`s (it auto-provides FHIRHelpers, so NO FHIRHelpers Library is
  // emitted — see `catalogFhirLibraries`). Their content urls point at the
  // sibling `../../cql/<name>.cql` the CQL lane always writes. Skip a catalog
  // Library whose canonical url a REAL emitted resource already claims (an author
  // library literally named `CRLCommon`) — Inv 0 would otherwise flag the
  // duplicate url; skipping defers to the policy's own resource.
  //
  // Gated on a NON-EMPTY closure: an empty closure is not a policy package, so it
  // ships nothing (preserves the "0-resources gracefully" contract and avoids
  // orphan catalog Libraries pointing at CQL files no policy emits).
  const emittedUrlsSoFar = new Set<string>();
  for (const r of resources) {
    const u = (r.resource as { url?: string }).url;
    if (typeof u === "string") emittedUrlsSoFar.add(u);
  }
  for (const cat of libraries.length === 0 ? [] : catalogFhirLibraries()) {
    const catResource = emitCatalogLibrary(cat.libraryName, cat.version, metadata, resolvedOpts);
    const catUrl = (catResource.resource as { url?: string }).url;
    if (typeof catUrl === "string" && emittedUrlsSoFar.has(catUrl)) continue;
    if (typeof catUrl === "string") emittedUrlsSoFar.add(catUrl);
    resources.push(catResource);
  }

  // Closure invariants — locked sequence per plan v3.2 (+ slice 4 Inv 0).
  // Inv 0: url uniqueness across the FULL emitted set (before Inv 1 drops on
  // relativePath) so a same-url collision is reported even if the two colliders'
  // relativePaths somehow differ.
  errors.push(...applyUrlUniquenessInvariant(resources));
  const inv1 = applyInvariant1(resources);
  errors.push(...inv1.errors);
  const inv2errors = applyInvariant2(inv1.surviving, inv1.droppedPaths, metadata);
  const inv3errors = applyInvariant3(inv1.surviving, inv1.droppedPaths);
  // Inv 4 (slice 4c) — Library content-url ↔ emitted-CQL-file integrity. Runs
  // over the post-Inv-1 surviving set, consuming the manifest's outputFilename
  // set (no-op when the manifest is empty).
  const inv4errors = applyContentUrlInvariant(inv1.surviving, expectedFilenameByLibrary);
  // Inv 5 — action-level `input[].profile[]` referential integrity (DTR pattern).
  // Runs over the post-Inv-1 surviving set like Inv 2/3.
  const inv5errors = applyActionInputProfileInvariant(inv1.surviving, inv1.droppedPaths);
  // Inv 6 (#186 / #227) — Library identity agreement (id == name == url-tail;
  // referent url-tail == target Library.name), enforced for EVERY manifest-backed
  // policy Library `S`. Pre-#227 the name-keeping Root was exempt (its id was the
  // bare `policyIdBase` ≠ name); #227 unified the Root onto its own `S`, so it is now
  // enrolled too — INCLUDING a root whose raw name is already a PascalCase fixpoint
  // (`library "Sib"`), which the old `libraryName === sourceLibraryName` exemption
  // wrongly dropped (panel catch). Only the SHARED catalog assets are exempt, keyed on
  // the EXPLICIT `isSharedCatalog` flag — their id/name/header already agree and they
  // are not manifest-identity-controlled.
  const enforcedIdentities = new Set<string>(
    cqlByLibrary.filter((e) => !e.isSharedCatalog).map((e) => e.libraryName),
  );
  const inv6errors = applyLibraryIdentityInvariant(inv1.surviving, metadata, enforcedIdentities);
  // Inv 2(d) — case-feature cpg-featureExpression DEFINE integrity: the referenced define must exist in the
  // referenced library's emitted CQL (the general backstop for the #189 2d dangle class). No-op when the
  // manifest carries no CQL (`cqlByLibrary: []`, graph-only unit callers), like Inv 4.
  const inv2dErrors = applyFeatureExpressionDefineInvariant(inv1.surviving, cqlByLibrary);
  errors.push(...inv2errors, ...inv2dErrors, ...inv3errors, ...inv4errors, ...inv5errors, ...inv6errors);

  // Round-5 gpt55 [important]: severity-aware success (warnings don't sink
  // success). Hard errors (non-warning CRLErrors) + any unmatched still flip
  // success to false; warning-kind errors do not.
  const success = errors.filter(isFhirDefError).length === 0 && unmatched.length === 0;

  return {
    success,
    resources: inv1.surviving,
    errors,
    unmatched,
  };
}

/**
 * High-level entry point for CLI + MCP. Walks imports from the given root
 * path, loads package metadata, and runs the closure emit pipeline.
 */
export function emitFhirDefFromPath(
  rootPath: string,
  opts: EmitOptions = {},
): FhirDefFromPathResult {
  // D6 — DOUBLE resolveImports coupling (deferred). This resolves the graph ONCE
  // here for the FHIR closure (which keys the FHIR Library identities), and the
  // `emitCQLImports(rootPath)` call below resolves the SAME path AGAIN internally
  // to produce the split-manifest. Resolution is filesystem-deterministic, so the
  // two resolutions agree today — but the FHIR Library keying (resolution #1) and
  // the manifest (resolution #2) are coupled through that determinism rather than
  // a shared graph. Threading the single resolved graph into emitCQLImports would
  // remove the coupling; that refactor is DEFERRED (it would change the
  // emitCQLImports signature and is out of slice-4c scope).
  const graph = resolveImports(rootPath);

  // Try to load metadata; metadataErrors surface separately for CLI/MCP exit code computation.
  const metadataErrors: CRLError[] = [];
  let metadata: CpgMetadata | null = null;
  if (graph.projectRoot) {
    const metaResult = readPackageMetadata(graph.projectRoot);
    if (metaResult.metadata) {
      metadata = metaResult.metadata;
    }
    metadataErrors.push(...metaResult.errors);
  }

  if (!metadata) {
    return {
      success: false,
      resources: [],
      errors: [],
      unmatched: [],
      importDiagnostics: graph.diagnostics,
      metadataErrors,
    };
  }

  // Slice 4c (E) — run the CQL lane FIRST to obtain the split-manifest, then
  // thread it into the FHIR closure so the FHIR lane materializes one Library
  // per emitted CQL library (consuming the split decision, never re-deriving the
  // gate).
  //
  // CQL-lane hard failures (D2, slice-4c review gpt55 [important] / Claude
  // [critical]): the CQL split/structural errors fire AFTER import resolution and
  // return an EMPTY manifest (`cqlByLibrary: []`) with a clean `graph.diagnostics`
  // — `emit-local-codesystem-urn-collision`, `layered-name-collision`,
  // `emit-cross-library-ref-into-split-library`, `emit-codesystem-url-conflict`,
  // and the `lowerLocalCodes` hard errors. If we only threaded the (empty)
  // manifest the FHIR lane would silently fall back to the single-entry path, Inv
  // 4 would no-op, and MCP/`emit_crl_fhir` could report a misleading FHIR success.
  // So fold EVERY CQL hard error into the FHIR result and sink `success`.
  //
  // D2 — this is a DENYLIST, not an allowlist: fold every CQL hard error EXCEPT
  // the `CQL_FOLD_EXCLUDED_KINDS` set (the #79 `emit-unmatched-narrative` sentinel
  // — which empties the manifest but where the FHIR lane DELIBERATELY emits its
  // design-time forms, the cc-screening + cms corpus relies on this — and the
  // `lowerLocalCodes` hard kinds the FHIR lane already surfaces itself). The prior
  // allowlist of 3 split kinds silently DROPPED `emit-codesystem-url-conflict`, so
  // MCP `emit_crl_fhir` could report success while the CQL lane failed.
  // (The CLI re-runs `emitCQLImports` for the CQL-write side; this is the
  // public/MCP path's guard.)
  const cqlImports = emitCQLImports(rootPath);
  // Fold kind-LESS `type:"Exception"` throws too (panel R2 Fable [important]): this predicate exists to
  // skip EXCLUDED KINDS (the FHIR lane surfaces those itself), NOT to skip Exceptions. A kind-less throw
  // — its original concrete vehicle, `definedAsExistsNotLowered`, was retired when #270 lowered existence
  // on every lane, but ANY future untyped emit throw — is a genuine CQL-lane hard failure. The old `e.kind !== undefined`
  // guard dropped it, so `cqlManifestFailed` stayed false and `emitFhirDefFromPath` could report a
  // MISLEADING `success:true` off the empty-manifest fallback — the exact D2 class this file exists to
  // guard. Keeping kind-less errors folds them so `success` sinks; only truly-EXCLUDED kinds are dropped.
  const cqlErrors = (cqlImports.success ? [] : cqlImports.errors ?? []).filter(
    (e) => e.kind === undefined || !CQL_FOLD_EXCLUDED_KINDS.has(e.kind),
  );
  const cqlManifestFailed = cqlErrors.length > 0;
  // Feature: configurable PA leaves — resolve the project's disposition config (emit is project-aware) and thread
  // it via opts so a determination activity emits the coded PAS reviewAction outcome. Absent config → no change.
  // Impl-review C2: a MALFORMED config must NOT silently degrade to configured:false (which would drop all PA emit
  // while reporting success). Mirror validateCRLImports: on any error-severity config problem, WITHHOLD the config
  // and fold the errors into the emit result so `success` sinks (handled in the errors/success assembly below).
  const dispositionResolution = graph.projectRoot ? resolveDispositionConfig(graph.projectRoot) : undefined;
  const dispositionConfigErrors = (dispositionResolution?.errors ?? []).filter((e) => e.severity === "error");
  const dispositionConfig = dispositionConfigErrors.length > 0 ? undefined : dispositionResolution?.config;
  const closureResult = emitFhirDefClosure(
    graph,
    metadata,
    { ...opts, dispositionConfig },
    cqlImports.cqlByLibrary,
    cqlImports.suppressedActivityBindings ?? [],
  );
  // Round-5 gpt55 [important]: fold importDiagnostics + metadataErrors
  // into success. Otherwise MCP can return success:true with fatal
  // import-time errors.
  const importErrors = graph.diagnostics.filter((d) => d.severity === "error");
  // Impl-review C2: error-severity disposition-config problems become blocking emit errors (package.json-anchored).
  const dispositionEmitErrors: CRLError[] = dispositionConfigErrors.map((e) => ({
    type: "Validation",
    kind: "disposition-config",
    message: `crl.dispositions${e.path.length ? "." + e.path.join(".") : ""}: ${e.message}`,
  }));
  // #189 IMPL 3 — de-dup `emit-reduction-not-active`: for a `code is` + reduction (case a) the FHIR
  // lane's own lowerLocalCodes already put the same (kind, line, column) into `closureResult.errors`,
  // so drop the folded CQL copy to avoid a double-listing. A no-`code is` reduction (case b) is absent
  // from `closureResult.errors`, so it is kept — it is the only surfacing of the deep-emit sentinel on
  // the FHIR lane, and `cqlManifestFailed` (above) already sank `success` for it.
  // Key includes `message` (panel R2 gpt56 #2): `CRLError` carries no source-file identity and
  // `closureResult.errors` aggregates the whole import closure, so a (kind,line,column)-only key could
  // suppress a DISTINCT pure-reduction diagnostic in one library because a `code is` + reduction in
  // another happens to share the coordinate. The two producers use different prose (site (a)'s
  // lowerLocalCodes message vs the deep `reductionNotActiveMessage`), so `message` disambiguates them.
  const reductionKey = (e: CRLError): string =>
    `${e.kind}|${e.line ?? ""}|${e.column ?? ""}|${e.message ?? ""}`;
  const closureErrorKeys = new Set(closureResult.errors.map(reductionKey));
  const cqlErrorsDeduped = cqlErrors.filter(
    (e) => e.kind !== "emit-reduction-not-active" || !closureErrorKeys.has(reductionKey(e)),
  );
  const errors = [...closureResult.errors, ...cqlErrorsDeduped, ...dispositionEmitErrors];
  const success =
    closureResult.success &&
    !cqlManifestFailed &&
    metadataErrors.length === 0 &&
    importErrors.length === 0 &&
    dispositionEmitErrors.length === 0;
  return {
    ...closureResult,
    errors,
    success,
    importDiagnostics: graph.diagnostics,
    metadataErrors,
  };
}
