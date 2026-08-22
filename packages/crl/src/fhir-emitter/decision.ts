/**
 * CRL Decision → cpg-strategydefinition / crmi-publishableplandefinition
 * PlanDefinition emit (Todo 3, Decision lane).
 *
 * Per plan v3.2 [065] + #104 namespace fix:
 *   - Root CRL decision (no incoming `use decision` refs)
 *       → Strategy PlanDef: `[cpg-strategydefinition, …additive CRMI
 *         plandefinition profiles up to capability]`, type `workflow-definition`.
 *   - Sub CRL decision (referenced by ≥1 `use decision`)
 *       → Sub-decision PlanDef: the additive CRMI plandefinition profiles only
 *         (no CPG strategy profile), type `eca-rule`. Matches the demo-content-r4
 *         "decisiontree" pattern (renamed conceptually to "decision").
 *
 * DELIBERATE SPEC DEVIATION 2026-06-04:
 *   cpg-strategydefinition.action.definition[x] is constrained to
 *   `canonical(cpg-recommendationdefinition)` only per the published
 *   StructureDefinition. Operator decision (memory:
 *   `project_strategy-target-profile-spec-deviation`): emit per the
 *   cc-screening example pattern (Strategy → publishable-only
 *   Sub-decision → Recommendation → Activity), matching the
 *   reference toolchain's production practice. Operator is working
 *   to amend the spec. Remove this comment when the published
 *   constraint is corrected.
 *
 * `when "C" then` → `action.condition[applicability + text/cql-identifier
 * = "C"]`. The `text/cql-identifier` language code: FHIR R4
 * `Expression.language` is `code` typed against the `language`
 * value-set with EXTENSIBLE binding (NOT required). Any mime-type
 * is permitted; `text/cql-identifier` is the production CQF toolchain
 * convention for CQL identifier references (confirmed via
 * cc-screening example).
 *
 * #224 COMPOUND GUARDS (`when A and B`, `when (A or B) and C`): a `when` maps to
 * 1..N actions, NOT one. The decision boolean lowers to `action` STRUCTURE, NEVER
 * to a CQL expression. `and` → one action with N ANDed `condition[]`; `or` → DNF
 * arms placed context-sensitively (spliced under `first:`, or wrapped in one
 * `cqf-applicabilityBehavior` "any" grouping action under `all:`/flat). See
 * `emitCompoundWhenBlock`.
 *
 * #224 iii.3 NEGATION (`when not X`, `when A and not B`): `toNNF` pushes every `not` to the
 * ref LEAVES, so each DNF arm is a conjunction of SIGNED literals. A NEGATED literal lowers to
 * the per-atom `not Coalesce("<Lib>"."<C>", false)` carrier (`guardApplicabilityCondition`,
 * shared with iii.1's `unless`); a positive one to the bare `text/cql-identifier`. The
 * decision boolean STILL never lowers to one opaque CQL expression — negation stays per-literal.
 *
 * Recursive `when...then` nests as `action.action[]`. Leaves use
 * `action.definitionCanonical`: `recommend activity X` →
 * Recommendation PlanDef wrapping X; `use decision Y` → sub-decision Y.
 *
 * `first:` (an ordered branch-switch, top-level or nested) → the standard
 * `cqf-applicabilityBehavior` "any" extension on the grouping action (a synthetic
 * wrapper at the top level; the parent `when` action when nested). Menu `any:` (a
 * "pick one of these actions" selection) keeps the phase-1 `crl-logical-switch`
 * stand-in (URL derives from canonicalBase, valueBoolean=true) until its FHIR
 * selection semantics are settled (GitHub #184). `all:`/no qualifier → no extension.
 *
 * Cascade-suppression contract: a branch (when/otherwise) whose condition concept
 * (or whose leaf activity/decision) is unresolved suppresses the
 * entire WhenBlock. Parent actions with ALL children suppressed are
 * also suppressed (emit `unresolved-reference-cascade-suppression`
 * warning). If the root would emit with zero surviving actions,
 * emit `strategy-root-cascade-suppressed` error + skip the resource.
 * Mixed-children (some suppressed, some emitted) → emit parent with
 * surviving children, no aggregate diagnostic.
 *
 * v0 collision detection scope: this wrapper detects only intra-kind
 * (Decision-vs-Decision) collisions. Cross-kind PlanDef collisions
 * (Recommendation id vs Decision id) are deferred to Todo 4 closure
 * step per round-5 gpt55 C1.
 */

import type {
  Action,
  Activity,
  ActionStatement,
  BlockBody,
  BlockMember,
  BlockQualifier,
  BranchBlock,
  BranchConditionRef,
  BranchConditionCriterionRef,
  BranchConditionLiteral,
  Concept,
  Decision,
  OtherwiseBlock,
  ReferenceName,
  WhenBlock,
  WhenBlockBody,
} from "../ast/types";
import { getRefName, isQualifiedRef, normalizeLocalRef, refDisplay } from "../ast/types";
import {
  soleRef,
  describeBranchCondition,
  branchConditionDNF,
  branchConditionArmCount,
} from "../ast/branchCondition";
import { type CriterionTable } from "../ast/criterionExpansion";
import { buildCriterionIndex, type CriterionIndex } from "../ast/criterionIndex";
import { cqlQuotedIdentifier } from "../cql-emitter/cqlStrings";
import type { CRLError } from "../types/errors";
import { libraryCanonicalUrl, libraryId } from "./library";
import { recommendationDefinitionCanonicalUrl } from "./recommendation";
import { pascalCaseName, policyIdBase, rawSlug, slugify, uniqueCapSlug } from "./slug";
import { tarjanSCC } from "./tarjan";
import { crmiCapabilityProfiles, isPublishablePlus, knowledgeExtensions } from "./types";
import type {
  Capability,
  CpgMetadata,
  EmitOptions,
  EmittedResource,
  UnmatchedReference,
} from "./types";

const CPG_BASE = "http://hl7.org/fhir/uv/cpg/StructureDefinition";
// #104: publishable + shareable plan-definition lifecycle profiles moved
// from CPG STU1's uv/cpg namespace into the CRMI IG at uv/crmi in CPG 2.0.0.
// CPG 2.0.0 does NOT declare a CRMI dependency itself — consumers of these
// emitted resources should add hl7.fhir.uv.crmi to their IG deps alongside
// the CPG package (see USER_GUIDE §"Emitting FHIR Definition resources").
// knowledgeCapability + knowledgeRepresentationLevel are FHIR-core `cqf-`
// extensions, built by `knowledgeExtensions` in ./types.
const STRATEGY_CPG_PROFILE = `${CPG_BASE}/cpg-strategydefinition`;

// CRMI lifecycle profiles accumulate additively up to the capability level
// (shareable → +publishable for PlanDefinition); strategy roots prepend the
// CPG strategy profile.
function planDefProfiles(isRoot: boolean, level: Capability): string[] {
  return [
    ...(isRoot ? [STRATEGY_CPG_PROFILE] : []),
    ...crmiCapabilityProfiles("plandefinition", level),
  ];
}
const PLAN_DEFINITION_TYPE_CS = "http://terminology.hl7.org/CodeSystem/plan-definition-type";
const CPG_COMMON_PROCESS_CS = "http://hl7.org/fhir/uv/cpg/CodeSystem/cpg-common-process-cs";

/* ─── Resolver types (public for testability) ─────────────────────── */

export type ConceptResolver = (conceptName: ReferenceName) => string | null;
export type ActivityResolver = (activityName: ReferenceName) => string | null;
export type DecisionResolver = (decisionName: ReferenceName) => string | null;

/** One action-level case-feature input (DTR pattern). */
export interface CaseFeatureInput {
  /** the concept name (drives the `cpg-input-text`/`cpg-input-description` labels). */
  name: string;
  /** the canonical url of the concept's emitted case-feature StructureDefinition. */
  canonical: string;
  /**
   * REFACTOR:grounded (charter §4) — the case-feature's NATURAL FHIR resource type (`action.input.type`),
   * from the concept's effective-representation descriptor (Condition, MedicationRequest, Observation, …).
   * REQUIRED: the resolver only yields an input for a concept that resolved to a gatherable `record`, so this
   * is always present. There is NO `"Observation"` fallback — the forced-Observation `action.input.type` was
   * the hack #189 removes; an input never carries a type the case-feature lane can't stand behind.
   */
  resourceType: string;
}

/**
 * Case-feature input resolver (action-level PlanDefinition `input`, DTR pattern).
 *
 * Maps a normalized (self-qualifier-stripped) `when`-condition concept name → the
 * ORDERED list of case-feature inputs for that condition — the recursive `code is`
 * closure of the condition in INFERENCE ORDER (the condition's own `code is` first,
 * then its `defined as` operands left-to-right; see `caseFeatureCollection.ts`).
 * Returns `[]` for a condition with no reachable `code is` concept (non-LocalPrimitives,
 * genuinely cross-library, or a source whose case-feature emit was gated off).
 * Built ONCE per source in `closureOrchestrator` from the SAME per-condition
 * collection the case-feature SD emit consumes, so an `action.input` profile can
 * never address an SD that was not emitted.
 *
 * Queried at EVERY when-condition action, at ANY depth — each when-action carries
 * its OWN condition's inputs (the local-input model); there is no
 * ancestor/descendant aggregation. A nested `when` on an inferred condition gets
 * its own recursive inputs exactly like a top-level one.
 */
export type CaseFeatureInputResolver = (conceptName: string) => readonly CaseFeatureInput[];

// The CPG `cpg-input-text` / `cpg-input-description` extensions stamp a
// human-askable label + description onto an action input (DTR pattern). Verified
// URLs against the CPG IG + the truth-set example goldens.
const CPG_INPUT_TEXT_EXT = "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-text";
const CPG_INPUT_DESCRIPTION_EXT =
  "http://hl7.org/fhir/uv/cpg/StructureDefinition/cpg-input-description";

// The standard HL7 `cqf-applicabilityBehavior` extension. Placed on a grouping
// action, `valueString "any"` means: evaluate the ordered child actions and apply
// the FIRST applicable one (child order is significant — the trailing unconditional
// `otherwise` is a true fallthrough). Omitting it is the FHIR default: every
// applicable sibling fires. This is the correct lowering of a CRL `first:` decision
// switch — it REPLACES the phase-1 `crl-logical-switch` stand-in for the branch case.
// Value type is `valueString "any"` to byte-match the reference DTR content
// (alphora/dtr-content-r4); the extension also accepts valueCode. See FHIR-50150.
const CQF_APPLICABILITY_BEHAVIOR_EXT =
  "http://hl7.org/fhir/StructureDefinition/cqf-applicabilityBehavior";

/* ─── Canonical URL helper (exported; not re-exported at root) ───── */

export function planDefinitionCanonicalUrl(
  metadata: CpgMetadata,
  decisionName: string,
): string {
  return `${metadata.canonicalBase}/PlanDefinition/${decisionId(metadata, decisionName)}`;
}

// R1 — id BASE is the policy id (`policyIdBase(metadata)`); the decision-name slug
// is the suffix. #237/T1 — one exported id helper (the closure orchestrator imports
// THIS instead of mirroring the expression), collision-safe via `uniqueCapSlug` over
// the component-wise `rawSlug` composite (NOT a whole-composite `rawSlug`, which
// would collapse an empty-strip name's `"unnamed"` fallback).
export function decisionId(metadata: CpgMetadata, decisionName: string): string {
  return uniqueCapSlug(`${policyIdBase(metadata)}-${rawSlug(decisionName)}`);
}

/**
 * Build the 3 narrow resolvers from a closure (library's concepts +
 * activities + decisions). Closure-internal use; tests can stub the
 * narrow types directly.
 */
function makeResolversFromClosure(
  libraryName: string,
  metadata: CpgMetadata,
  concepts: ReadonlyArray<Concept>,
  activities: ReadonlyArray<Activity>,
  decisions: ReadonlyArray<Decision>,
  skippedDecisionNames: ReadonlySet<string>,
): {
  conceptResolver: ConceptResolver;
  activityResolver: ActivityResolver;
  decisionResolver: DecisionResolver;
} {
  const conceptByName = new Map(concepts.map((c) => [c.name, c]));
  const activityByName = new Map(activities.map((a) => [a.name, a]));
  const decisionByName = new Map(decisions.map((d) => [d.name, d]));

  const conceptResolver: ConceptResolver = (ref) => {
    const normalized = normalizeLocalRef(ref, libraryName);
    if (isQualifiedRef(normalized)) return null; // cross-library: defer to Todo 4
    return conceptByName.has(getRefName(normalized)) ? getRefName(normalized) : null;
  };

  const activityResolver: ActivityResolver = (ref) => {
    const normalized = normalizeLocalRef(ref, libraryName);
    if (isQualifiedRef(normalized)) return null;
    const name = getRefName(normalized);
    if (!activityByName.has(name)) return null;
    return recommendationDefinitionCanonicalUrl(metadata, name);
  };

  const decisionResolver: DecisionResolver = (ref) => {
    const normalized = normalizeLocalRef(ref, libraryName);
    if (isQualifiedRef(normalized)) return null;
    const name = getRefName(normalized);
    if (!decisionByName.has(name) || skippedDecisionNames.has(name)) return null;
    return planDefinitionCanonicalUrl(metadata, name);
  };

  return { conceptResolver, activityResolver, decisionResolver };
}

function crlLogicalSwitchExtensionUrl(canonicalBase: string): string {
  return `${canonicalBase}/StructureDefinition/crl-logical-switch`;
}

/**
 * Append (never clobber) the standard `cqf-applicabilityBehavior` "any" extension to
 * a grouping action so a FHIR engine applies the FIRST applicable child. Used for
 * both the top-level `first:` switch wrapper and a nested `first:` block's parent
 * action.
 */
function addApplicabilityBehaviorExtension(action: Record<string, unknown>): void {
  const ext = (action.extension as Array<Record<string, unknown>> | undefined) ?? [];
  ext.push({ url: CQF_APPLICABILITY_BEHAVIOR_EXT, valueString: "any" });
  action.extension = ext;
}

function defaultClock(): Date {
  return new Date();
}

/* ─── Cascade-suppression tri-state for action emit ──────────────── */

// A single authored branch (a `when`/`otherwise`) emits 1..N sibling actions. A
// single-ref `when`, a pure-`and` `when`, and an `otherwise` emit exactly one; a
// `when` whose guard contains `or` emits its DNF arms (spliced under `first:`, or
// wrapped in one `"any"` grouping action under `all:`/flat — see `emitWhenBlock`).
// The multiplicity lives INSIDE `actions`, so the caller stays 1:1 with source
// statements (the cascade-diagnostic index loops rely on that).
type EmitActionResult =
  | { kind: "emitted"; actions: Record<string, unknown>[] }
  | {
      kind: "suppressed";
      reason:
        | "unresolved-ref"
        | "all-children-suppressed"
        | "compound-guard-overflow";
    };

/* ─── Single-Decision emit ───────────────────────────────────────── */

/**
 * Emit one PlanDef for a CRL Decision. `isRoot=true` emits Strategy
 * (with `cpg-strategydefinition` profile + workflow-definition type);
 * `isRoot=false` emits Sub-decision (publishable-only + eca-rule).
 * Caller (`emitDecisionPlanDefinitionsForLibrary`) determines isRoot
 * via dependency-graph classification.
 *
 * INVARIANT SCOPE: the action-level `input` this emits (when a non-default
 * `caseFeatureInputResolver` is threaded) is validated against the surviving
 * emitted StructureDefinition set ONLY by the closure-level Inv 5
 * (`applyActionInputProfileInvariant`), which runs inside `emitFhirDefClosure`.
 * A low-level caller invoking this directly with a non-null resolver emits inputs
 * that are NOT closure-checked — the orchestrator builds the resolver from the
 * SAME `collectCaseFeatures` recursive `code is` collection the case-feature SDs
 * come from, so it cannot dangle on that path; an arbitrary direct caller is
 * responsible for its own profiles.
 *
 * EXPECTS A SHAPE-VALIDATED AST: the qualifier lowering trusts the decision-shape
 * validator to have run — `first:` is treated as an ordered branch-switch
 * (`cqf-applicabilityBehavior`) and `any:` as a menu (`crl-logical-switch`), which
 * is only sound because the validator rejects `any:`-over-branches and
 * `first:`-over-actions. A direct caller feeding an unvalidated AST (e.g. `first:`
 * over an action menu) would stamp the wrong extension; run the validator first.
 */
export function emitDecisionPlanDefinition(
  decision: Decision,
  libraryName: string,
  metadata: CpgMetadata,
  conceptResolver: ConceptResolver,
  activityResolver: ActivityResolver,
  decisionResolver: DecisionResolver,
  isRoot: boolean,
  opts: EmitOptions = {},
  // #186 — the `library[]` Library IDENTITY `S` (the conditional Interface
  // rewiring): the Interface re-export library's opaque hyphen-free PascalCase `S`
  // when the decision-bearing source emitted a `role:"interface"` library, else
  // `undefined` (the source-name-keeping Root / cms `none` path → resolves to
  // `policyIdBase`). The orchestrator computes it once per source and threads it
  // here so the `library[]` target stays a single source of truth. Passed straight
  // to `libraryCanonicalUrl`, which builds `<canonicalBase>/Library/<S>`.
  libraryReferenceSuffix: string | undefined = undefined,
  // Action-level `input` (DTR pattern): maps a normalized `when` concept name →
  // the ORDERED recursive `code is` closure of that condition (inference order).
  // Built ONCE per source by the orchestrator from the SAME per-condition
  // collection the case-feature SD emit consumes (so an input can only point at an
  // emitted SD). Queried at every when-condition action at any depth — each its own
  // condition's inputs, no ancestor/descendant aggregation. Defaults to an
  // empty-returning resolver → no input (keeps cms / unit-test callers unchanged).
  caseFeatureInputResolver: CaseFeatureInputResolver = () => [],
  // #224 ii.1c — the emitting library's criterion table (`name → Criterion`). Guards are
  // expanded gated-by-the-GLOBAL-envelope at `emitWhenBlock` entry. Defaults to empty so
  // cms / unit-test callers with no criteria are byte-unchanged (every guard fast-paths).
  criterionTable: CriterionTable = new Map(),
  // #224 iii.1 (A″) — the CQL library NAME (`library X` header) of the library the PD's
  // `library[]` references — the qualifier a negated `unless` guard uses (`not "<name>"."<C>"`,
  // resolved by cqf's synthetic expression include). The orchestrator threads the manifest
  // entry's `libraryName` (correct for interface AND name-keeping-Root shapes). A direct
  // caller/test that omits it falls back to `libraryId(metadata, libraryReferenceSuffix)` —
  // the pre-A″ value, correct whenever the CQL header == the FHIR id (layered policies).
  guardQualifierLibraryName: string | undefined = undefined,
): {
  resource: EmittedResource | null;
  errors: CRLError[];
  unmatched: UnmatchedReference[];
} {
  const errors: CRLError[] = [];
  const unmatched: UnmatchedReference[] = [];

  if (/[^\x00-\x7F]/.test(decision.name)) {
    errors.push({
      type: "Validation",
      kind: "non-ascii-slug-fallback",
      message: `Decision "${decision.name}" contains non-ASCII characters which are stripped from the FHIR id. Rename or transliterate.`,
      line: decision.location?.start.line,
      column: decision.location?.start.column,
    });
  }

  const id = decisionId(metadata, decision.name);
  const computableName = pascalCaseName(`${slugify(libraryName)} ${slugify(decision.name)}`);
  const title = decision.name;
  const description = decision.name;

  // Emit each top-level branch (when/otherwise); collect surviving actions.
  const ctx: EmitCtx = {
    libraryName,
    canonicalBase: metadata.canonicalBase,
    conceptResolver,
    activityResolver,
    decisionResolver,
    caseFeatureInputResolver,
    isStrategy: isRoot,
    errors,
    unmatched,
    criterionTable,
    // Built from the same criteria the table holds (a Criterion IS a Statement) — no extra
    // threading. Memoized/linear, so a doubling-DAG criterion table is bounded (#236 step A).
    criterionIndex: buildCriterionIndex([...criterionTable.values()]),
    guardQualifierLibraryName:
      guardQualifierLibraryName ?? libraryId(metadata, libraryReferenceSuffix),
  };
  const topLevelResults = decision.body.statements.map((branch) =>
    emitBranch(branch, ctx, decision.body.qualifier),
  );
  const topLevelActions = topLevelResults
    .filter((r): r is { kind: "emitted"; actions: Record<string, unknown>[] } => r.kind === "emitted")
    .flatMap((r) => r.actions);

  if (topLevelActions.length === 0) {
    // Rule 6: top-level all-suppressed → decision-cascade-suppressed
    // error + skip resource. (Round-6 gpt55 I1: name was previously
    // `strategy-root-cascade-suppressed` but the same disposition fires
    // for sub-decisions too; renamed for accuracy.) The
    // strategy-root-style failure subsumes any intermediate cascade
    // warnings — no additional cascade-suppression warning needed.
    errors.push({
      type: "Validation",
      kind: "decision-cascade-suppressed",
      message: `Decision "${decision.name}" would emit with zero surviving top-level actions due to cascade suppression. Skipping resource. See the accompanying diagnostics (unresolved references and/or an over-cap compound-guard expansion).`,
      line: decision.location?.start.line,
      column: decision.location?.start.column,
    });
    return { resource: null, errors, unmatched };
  }

  // Rule 4/7 at the top level: top-level branches that cascade-suppress
  // while OTHER top-level siblings survive get their cascade warning
  // emitted here (the enclosing resource is the non-cascading "parent").
  for (let i = 0; i < topLevelResults.length; i++) {
    const r = topLevelResults[i]!;
    if (r.kind === "suppressed" && r.reason === "all-children-suppressed") {
      const branch = decision.body.statements[i]!;
      const label =
        branch.type === "WhenBlock"
          ? `when ${describeBranchCondition(branch.condition, getRefName)}`
          : "otherwise";
      errors.push({
        type: "Validation",
        kind: "unresolved-reference-cascade-suppression",
        message: `Top-level "${label} then..." suppressed because all its children were suppressed.`,
        line: branch.location?.start.line,
        column: branch.location?.start.column,
      });
    }
  }

  // Top-level `first:` → wrap the ordered surviving branches in a single grouping
  // action carrying `cqf-applicabilityBehavior` "any", so a FHIR engine applies the
  // FIRST applicable branch (true if-elif-else) instead of firing every branch
  // (which is what happens today: the unconditional `otherwise` fires alongside the
  // matched branch). The extension's context is `PlanDefinition.action`, and the root
  // branches have no parent action to hang it on — hence the wrapper. It carries the
  // same `title`/`description`/`code` skeleton every action needs (the Strategy
  // property invariant requires them at all depths). `all:`/no-qualifier stay flat
  // sibling root actions (the FHIR default: every applicable sibling fires). Wrap
  // whenever the source said `first:`, even if cascade suppression left a single
  // survivor — preserves source intent and keeps the emitted shape predictable.
  let rootActions = topLevelActions;
  if (decision.body.qualifier === "first") {
    const switchGroup: Record<string, unknown> = {
      title,
      description,
      code: [{ coding: [{ system: CPG_COMMON_PROCESS_CS, code: "guideline-based-care" }] }],
    };
    addApplicabilityBehaviorExtension(switchGroup);
    switchGroup.action = topLevelActions;
    rootActions = [switchGroup];
  }

  const level = opts.capability ?? "publishable";
  const publishable = isPublishablePlus(level);
  const url = planDefinitionCanonicalUrl(metadata, decision.name);
  // #186 — `library[]` → the Interface re-export Library (its identity `S`) for a
  // decision-bearing split source, else the source-name-keeping Root (`undefined`).
  const libraryUrl = libraryCanonicalUrl(metadata, libraryReferenceSuffix);
  const planTypeCode = isRoot ? "workflow-definition" : "eca-rule";

  const resource: Record<string, unknown> = {
    resourceType: "PlanDefinition",
    id,
    meta: { profile: planDefProfiles(isRoot, level) },
    extension: knowledgeExtensions(level, "structured"),
    url,
    // version: CRMI requires `version` (1..1) at the shareable floor; from the
    // npm package (authoritative).
    version: metadata.version,
    name: computableName,
    title,
    status: metadata.status,
    experimental: metadata.experimental,
    ...(publishable ? { date: (opts.clock ?? defaultClock)().toISOString() } : {}),
    publisher: metadata.publisher,
    description,
    type: {
      coding: [{ system: PLAN_DEFINITION_TYPE_CS, code: planTypeCode }],
    },
    library: [libraryUrl],
    action: rootActions,
  };

  if (metadata.contact.length > 0) resource.contact = metadata.contact;
  if (metadata.jurisdiction.length > 0) resource.jurisdiction = metadata.jurisdiction;
  if (metadata.useContext.length > 0) resource.useContext = metadata.useContext;

  return {
    resource: {
      resourceType: "PlanDefinition",
      relativePath: `PlanDefinition/${id}.json`,
      resource,
      sourceKind: "Decision",
      sourceName: decision.name,
      ...(decision.location ? { location: decision.location } : {}),
    },
    errors,
    unmatched,
  };
}

interface EmitCtx {
  libraryName: string;
  canonicalBase: string;
  conceptResolver: ConceptResolver;
  activityResolver: ActivityResolver;
  decisionResolver: DecisionResolver;
  caseFeatureInputResolver: CaseFeatureInputResolver;
  isStrategy: boolean;
  errors: CRLError[];
  unmatched: UnmatchedReference[];
  // #224 ii.1c / #236 — the emitting library's criterion table (`name → Criterion`). A criterion
  // ref is NOT inline-expanded: it is a first-class guard LITERAL resolved to its own boolean
  // define (`entry.defineId`), so `soleRef` / arm-cap / DNF see a criterion ref as ONE atom. The
  // table drives resolution (`criterionIndex`) + the recursive `input[]` atom closure. Empty for
  // callers with no criteria (cms / unit tests) → those guards carry no criterion leaves.
  criterionTable: CriterionTable;
  // #236 — the criterion INDEX (built from `criterionTable`). A criterion GUARD ref lowers to a
  // NAMED reference (`defineId` = bare name) to the criterion's emitted boolean define, NOT its
  // inline expansion; its `recursiveAtomClosure` supplies the use-site DTR `input[]`. Resolution
  // routes a criterion literal HERE (an `unresolved-criterion` on a name absent from the index),
  // never through `conceptResolver` (which would mis-report `unresolved-concept`).
  criterionIndex: CriterionIndex;
  // #224 iii.1 — the CQL library NAME the PlanDefinition's `library[]` targets (the
  // Interface re-export, or the name-keeping Root). A NEGATED `unless` guard's inline
  // `text/cql-expression` must LIBRARY-QUALIFY its concept (`not "<Lib>"."<C>"`) so
  // cqf-fhir-cr's synthetic expression library can resolve it (disc 310). = `libraryId(
  // metadata, libraryReferenceSuffix)`, matching the emitted Library.id / CQL `library X`.
  guardQualifierLibraryName: string;
}

/**
 * Dispatch a branch to its when/otherwise emit. `enclosingQualifier` is the
 * qualifier of the block this branch is a sibling in (`decision.body.qualifier`
 * at the top level, `body.qualifier` when nested). It decides `or`-arm placement
 * in `emitWhenBlock`: splice under `first:`, wrap under everything else.
 */
function emitBranch(
  branch: BranchBlock,
  ctx: EmitCtx,
  enclosingQualifier: BlockQualifier | undefined,
): EmitActionResult {
  return branch.type === "WhenBlock"
    ? emitWhenBlock(branch, ctx, enclosingQualifier)
    : emitOtherwiseBlock(branch, ctx);
}

/**
 * The emit MATERIALIZATION ENVELOPE — the most DNF disjunct-arms this emitter will
 * materialize for one compound guard (#224 i.3). This is a RESOURCE guard against a
 * pathological `and`-of-`or`s (2^N arms → OOM), NOT a FHIR limit (PlanDefinition holds
 * far more) and NOT an authoring-complexity limit. It sits far above any faithful
 * model (a product of small OR-widths — 4×4=16, 4×5=20, 4×4×4=64 all emit fine) and
 * far below OOM. The "how complex is too complex / how to factor" doctrine belongs to
 * the authoring kit + KE, not a baked-in emitter opinion (#224 KE feedback): the
 * emitter enforces the lowering contract (structural, never CQL) and REPORTS its
 * envelope; it does not gate authoring or prescribe a restructure.
 */
const COMPOUND_GUARD_ARM_CAP = 256;

/** A guideline-based-care `code[]` block — every emitted action carries it. */
function guidelineCareCode(): Array<Record<string, unknown>> {
  return [{ coding: [{ system: CPG_COMMON_PROCESS_CS, code: "guideline-based-care" }] }];
}

/**
 * Deep-clone a JSON-plain fragment. Used to give each DNF arm its OWN copy of the
 * shared body fields — the emitted payload is strings/booleans/arrays/objects only,
 * so the round-trip is lossless, and no arm aliases another's nested `action`.
 */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Action-level `input[]` (DTR pattern) for a set of condition concepts, in order,
 * deduped by canonical (first-seen wins, keeping its first-seen name). A single-ref
 * `when` passes `[refName]`; a DNF arm passes ITS atoms (arm-aware union, G15). Each
 * collected concept → one `Observation` input profiled to its case-feature SD. The
 * case-features are the RECURSIVE `code is` closure of each condition in INFERENCE
 * ORDER (see `caseFeatureCollection.ts`); pass only NON-qualified (local) names —
 * a genuinely-foreign atom has no case-features in v0. Returns `undefined` when empty.
 */
function buildActionInputs(
  conceptNames: string[],
  ctx: EmitCtx,
): Array<Record<string, unknown>> | undefined {
  const seenCanonicals = new Set<string>();
  const inputs: Array<Record<string, unknown>> = [];
  for (const conceptName of conceptNames) {
    for (const { name, canonical, resourceType } of ctx.caseFeatureInputResolver(conceptName)) {
      if (seenCanonicals.has(canonical)) continue;
      seenCanonicals.add(canonical);
      inputs.push({
        extension: [
          { url: CPG_INPUT_TEXT_EXT, valueString: `${name}?` },
          { url: CPG_INPUT_DESCRIPTION_EXT, valueMarkdown: name },
        ],
        // REFACTOR:grounded (charter §4) — the case-feature's NATURAL resource type (always present; the
        // resolver only yields an input for a resolved record). No `"Observation"` fallback — that was the hack.
        type: resourceType,
        profile: [canonical],
      });
    }
  }
  return inputs.length > 0 ? inputs : undefined;
}

/** Dedup key for a normalized atom (ReferenceName is string | QualifiedReference,
 *  so a Set on the raw node would key by object identity). */
function atomKey(normalized: ReferenceName): string {
  return isQualifiedRef(normalized)
    ? `q:${JSON.stringify([normalized.libraryName, normalized.name])}`
    : `b:${normalized}`;
}

/**
 * The `condition[kind="applicability"]` entry for a SINGLE guard atom (#224 iii.1).
 *
 * `"positive"` → the byte-identical `text/cql-identifier` form the `when` single-ref
 * path emits: a BARE define name that `$apply` resolves directly against the
 * PlanDefinition's `library[]`. `"negated"` (`unless`) → an inline `text/cql-expression`
 * `not "<Lib>"."<name>"`: the MINIMAL structural negation of ONE atom. The
 * compound-boolean invariant is untouched — there is no compound here.
 *
 * ⚠ WHY THE NEGATED FORM IS LIBRARY-QUALIFIED (empirically verified against cqf-fhir-cr
 * 4.7.0, disc 310). `$apply` compiles a `text/cql-expression` condition as an ISOLATED
 * synthetic library that INCLUDES the PlanDefinition's primary library under its NAME —
 * so a bare `not "<name>"` FAILS ("Could not resolve identifier … in the current
 * library"), while `not "<Lib>"."<name>"` resolves. (The positive `text/cql-identifier`
 * path resolves bare because that language is a direct define lookup, not a compiled
 * expression.) `<Lib>` is the PlanDefinition's `library[]` target — the Interface
 * re-export (or the name-keeping Root) that carries the concept define.
 *
 * ⚠ INVARIANT BOUNDARY — do NOT stretch this in iii.3. `text/cql-expression` is
 * permitted ONLY for `not <single-atom>`. ANY composition (`not (A and B)`, an `or`
 * of negated atoms, …) MUST De Morgan / DNF into arms FIRST — each arm then carries
 * positive/negated single-atom conditions. A decision boolean NEVER lowers to one
 * opaque CQL expression (the load-bearing #224 invariant).
 *
 * ⚠ NULL-SAFE by construction — `not Coalesce(<ref>, false)`. Most guard-reachable
 * Interface defines terminate in `.satisfied()` = `exists(...)` (CaseFeatureCommon.cql),
 * a TOTAL non-null Boolean. But the guard slot admits ANY concept (`CONCEPT_REF_KINDS`),
 * and the Interface layer has a "legacy plain re-export" define shape (layeredEmit.ts)
 * that is not `satisfied()`-wrapped and could be null. `not null` = null → `$apply`
 * would EXCLUDE the item, DIVERGING from the CRE `evalGuard` semantics (`unless:
 * excluded = sat`; a missing concept → sat=false → item INCLUDED). Wrapping in
 * `Coalesce(<ref>, false)` makes the negation two-valued for EVERY define shape and
 * provably matches CRE (missing/null → false → not → true → INCLUDED). The positive
 * `only when` form needs no coalesce (null → excluded already matches CRE's missing →
 * excluded).
 */
function guardApplicabilityCondition(
  polarity: "positive" | "negated",
  conceptCqlId: string,
  qualifierLibraryName: string,
): Record<string, unknown> {
  const expression =
    polarity === "negated"
      ? {
          language: "text/cql-expression",
          expression: `not Coalesce(${cqlQuotedIdentifier(qualifierLibraryName)}.${cqlQuotedIdentifier(
            conceptCqlId,
          )}, false)`,
        }
      : { language: "text/cql-identifier", expression: conceptCqlId };
  return { kind: "applicability", expression };
}

/**
 * Recursive WhenBlock → action emit. Returns the tri-state result (1..N actions).
 * A SINGLE-ref guard takes the byte-identical pre-#224 path; a COMPOUND guard
 * (`and`/`or`) lowers structurally via `emitCompoundWhenBlock`. Cascade rules per
 * plan v3.2 §"Cascade-suppression behavior".
 */
function emitWhenBlock(
  wbRaw: WhenBlock,
  ctx: EmitCtx,
  enclosingQualifier: BlockQualifier | undefined,
): EmitActionResult {
  // #236 — NO criterion expansion. A criterion ref is a first-class guard LITERAL: it lowers to
  // a NAMED reference to the criterion's boolean define, never its inline expansion. So the guard
  // is used RAW — `soleRef` / arm-cap / DNF see criterion refs as atoms, and a criterion carries
  // ONE arm (not its expanded body — where the #236 exponential died, `branchConditionArmCount`).
  // A sole CONCEPT ref still takes the byte-identical single-ref path below; a sole CRITERION ref
  // returns null from `soleRef` (concept-ref-only) → the compound path → one condition. The old
  // criterion-expansion-overflow RESOURCE gate is RETIRED (the guard no longer materializes, §G).
  const wb = wbRaw;

  const sole = soleRef(wb.condition);
  if (!sole) return emitCompoundWhenBlock(wb, ctx, enclosingQualifier);

  // ── Single-ref path (byte-identical to pre-#224) ──
  // Normalize the condition ref ONCE (F5): a SAME-library qualified ref
  // (`MyLib."X"` inside `MyLib`) is stripped to bare `X`; a genuine cross-library
  // ref (`OtherLib."X"`) is left qualified. This normalized ref + its bare name
  // drive the condition resolver, the input lookup, AND the displays, so the input
  // path treats a self-qualified ref the SAME way the condition path does (F2).
  const guardRef = sole.ref;
  const normalizedRef = normalizeLocalRef(guardRef, ctx.libraryName);
  const refName = getRefName(normalizedRef);

  // 1. Resolve the condition concept. Suppressed when unresolved.
  const conceptCqlId = ctx.conceptResolver(normalizedRef);
  if (conceptCqlId === null) {
    ctx.unmatched.push({
      kind: "unresolved-concept",
      text: refDisplay(guardRef),
      line: wb.location?.start.line,
      column: wb.location?.start.column,
    });
    return { kind: "suppressed", reason: "unresolved-ref" };
  }

  // 2. Build action skeleton (with applicability condition). Title/description use
  // the NORMALIZED bare name — byte-identical to the raw `getRefName(guardRef)` for
  // an unqualified ref, and consistent with the condition/input for a self-qualified one.
  const action: Record<string, unknown> = {
    title: refName,
    description: refName,
    code: guidelineCareCode(),
    condition: [guardApplicabilityCondition("positive", conceptCqlId, ctx.guardQualifierLibraryName)],
  };

  // Action-level `input[]` — skip ONLY when the NORMALIZED ref is still qualified
  // (a genuine cross-library ref); a self-qualified eligible `when` gets its inputs.
  const inputs = buildActionInputs(isQualifiedRef(normalizedRef) ? [] : [refName], ctx);
  if (inputs) action.input = inputs;

  return fillBranchBody(action, wb.body, ctx);
}

/**
 * Compound WhenBlock (`and`/`or` guard) → structural FHIR emit (#224 i.3).
 *
 * The guard lowers to Disjunctive Normal Form — a list of ARMS, each a conjunction
 * of ref atoms → ONE action with N ANDed `condition[kind=applicability]` (cqf `$apply`
 * ANDs multiple conditions by default). The DECISION boolean NEVER lowers to CQL.
 *
 * Placement is CONTEXT-SENSITIVE (harness-proven, disc 286):
 *   - enclosing `first:` → SPLICE the arms as contiguous ordered siblings (an
 *     unconditional `"any"` wrapper under `first:` selects while empty and STARVES
 *     `otherwise`);
 *   - `all:`/flat/undefined → wrap the arms in ONE synthesized `cqf-applicabilityBehavior`
 *     `"any"` grouping action (exactly one arm fires).
 * A pure-`and` guard is a single arm → one action, no wrapper either way.
 */
function emitCompoundWhenBlock(
  wb: WhenBlock,
  ctx: EmitCtx,
  enclosingQualifier: BlockQualifier | undefined,
): EmitActionResult {
  // Resource guard FIRST — before materializing DNF or resolving — via the SATURATING
  // count, so a pathological `and`-of-`or`s (2^N arms) can never allocate before we
  // catch it (this emitter ships in the crl-vscode bundle → must report, never OOM).
  // This is a MATERIALIZATION boundary, NOT an authoring gate: the message reports the
  // envelope and defers the "what to do" to the kit/KE (#224 feedback). It NEVER falls
  // back to a CQL expression (the load-bearing principle) — but note the invariant is
  // never actually threatened by arm count, since DNF always lowers structurally; this
  // is purely a resource bound.
  if (branchConditionArmCount(wb.condition, COMPOUND_GUARD_ARM_CAP) > COMPOUND_GUARD_ARM_CAP) {
    ctx.errors.push({
      type: "Validation",
      kind: "compound-guard-expansion-overflow",
      message: `Compound guard \`${describeBranchCondition(
        wb.condition,
        getRefName,
      )}\` expands to more than ${COMPOUND_GUARD_ARM_CAP} applicability arms, exceeding the emit materialization envelope. This is an emit-stage RESOURCE boundary — NOT a FHIR limit (PlanDefinition holds far more) and NOT an authoring-complexity limit. If the model is faithful, treat this as a capability gap (raise an issue) or consult the authoring kit for factoring guidance; do not restructure the decision solely to satisfy this bound.`,
      line: wb.location?.start.line,
      column: wb.location?.start.column,
    });
    return { kind: "suppressed", reason: "compound-guard-overflow" };
  }

  const arms = branchConditionDNF(wb.condition);

  // #224 iii.3 / #236 — each DNF arm is a conjunction of SIGNED literals: a positive/negated
  // CONCEPT ref, or a positive/negated CRITERION ref. `litRef` projects the located atom + its
  // KIND + polarity. KIND drives RESOLUTION (concept → `conceptResolver`; criterion → the index,
  // `defineId` = bare name) and INPUTS (a criterion contributes its recursive atom closure, not
  // itself); polarity drives the emitted condition form (`guardApplicabilityCondition`). The two
  // negated literals share `.type === "BranchConditionNot"`, so we discriminate on `operand.type`.
  type LitInfo =
    | { kind: "concept"; atom: BranchConditionRef; polarity: "positive" | "negated" }
    | { kind: "criterion"; atom: BranchConditionCriterionRef; polarity: "positive" | "negated" };
  const litRef = (a: BranchConditionLiteral): LitInfo => {
    if (a.type === "BranchConditionNot") {
      return a.operand.type === "BranchConditionCriterionRef"
        ? { kind: "criterion", atom: a.operand, polarity: "negated" }
        : { kind: "concept", atom: a.operand, polarity: "negated" };
    }
    return a.type === "BranchConditionCriterionRef"
      ? { kind: "criterion", atom: a, polarity: "positive" }
      : { kind: "concept", atom: a, polarity: "positive" };
  };
  // Kind-tagged keys: a criterion and a concept of the same name cannot coexist on VALID input
  // (the nameUniquenessValidator concept-XOR-criterion bucket), but runCel/provenance tolerate
  // unvalidated input, so tag anyway — a `k:`/`c:` prefix keeps them from ever aliasing.
  const conceptAtomKey = (r: ReferenceName): string => `c:${atomKey(r)}`;
  const criterionAtomKey = (name: string): string => `k:${name}`;

  // Resolve every DISTINCT atom once (first-seen order across arms). Collect ALL unresolved
  // atoms — each with its OWN location — so the author sees every bad ref, then suppress the
  // whole guard ONCE. A negated atom resolves + suppresses exactly like a positive one.
  const resolvedByKey = new Map<string, string>();
  const distinctSeen = new Set<string>();
  const unresolvedConcepts: BranchConditionRef[] = [];
  const unresolvedCriteria: BranchConditionCriterionRef[] = [];
  for (const arm of arms) {
    for (const lit of arm) {
      const info = litRef(lit);
      if (info.kind === "concept") {
        const normalized = normalizeLocalRef(info.atom.ref, ctx.libraryName);
        const key = conceptAtomKey(normalized);
        if (distinctSeen.has(key)) continue;
        distinctSeen.add(key);
        const cqlId = ctx.conceptResolver(normalized);
        if (cqlId === null) {
          unresolvedConcepts.push(info.atom);
          continue;
        }
        resolvedByKey.set(key, cqlId);
      } else {
        const name = getRefName(info.atom.ref);
        const key = criterionAtomKey(name);
        if (distinctSeen.has(key)) continue;
        distinctSeen.add(key);
        const entry = ctx.criterionIndex.get(name);
        if (!entry) {
          unresolvedCriteria.push(info.atom);
          continue;
        }
        resolvedByKey.set(key, entry.defineId);
      }
    }
  }
  if (unresolvedConcepts.length > 0 || unresolvedCriteria.length > 0) {
    for (const atom of unresolvedConcepts) {
      ctx.unmatched.push({
        kind: "unresolved-concept",
        text: refDisplay(atom.ref), // raw ref — parity with the single-ref path
        line: atom.location?.start.line,
        column: atom.location?.start.column,
      });
    }
    for (const atom of unresolvedCriteria) {
      ctx.unmatched.push({
        kind: "unresolved-criterion",
        text: refDisplay(atom.ref),
        line: atom.location?.start.line,
        column: atom.location?.start.column,
      });
    }
    return { kind: "suppressed", reason: "unresolved-ref" };
  }

  // Emit the shared body ONCE on a body-less skeleton — `fillBranchBody` may push
  // unresolved-leaf / cascade diagnostics into ctx, so calling it per-arm would
  // N-count them. A suppressed body suppresses the whole authored `when`.
  const bodySkeleton: Record<string, unknown> = {
    title: "",
    description: "",
    code: guidelineCareCode(),
  };
  const bodyResult = fillBranchBody(bodySkeleton, wb.body, ctx);
  if (bodyResult.kind === "suppressed") return bodyResult;
  const filled = bodyResult.actions[0]!; // body-less skeleton → exactly one action
  const bodyFields: Record<string, unknown> = {};
  for (const k of ["definitionCanonical", "action", "extension"] as const) {
    if (k in filled) bodyFields[k] = filled[k];
  }

  const armActions: Array<Record<string, unknown>> = arms.map((arm) => {
    // #224 iii.3 / #236 — carry each literal's KIND + polarity. Concept → `conceptResolver` id;
    // criterion → its `defineId` (both bare CQL identifiers → identical condition form). A negated
    // literal → the null-safe `not Coalesce(...)` carrier; a positive one → `text/cql-identifier`.
    const armLits = arm.map(litRef);
    const labelName = (info: LitInfo): string =>
      info.kind === "concept"
        ? getRefName(normalizeLocalRef(info.atom.ref, ctx.libraryName))
        : getRefName(info.atom.ref);
    const armLabel = armLits
      .map((info) => (info.polarity === "negated" ? `not ${labelName(info)}` : labelName(info)))
      .join(" and ");
    const conditions = armLits.map((info) => {
      const key =
        info.kind === "concept"
          ? conceptAtomKey(normalizeLocalRef(info.atom.ref, ctx.libraryName))
          : criterionAtomKey(getRefName(info.atom.ref));
      return guardApplicabilityCondition(info.polarity, resolvedByKey.get(key)!, ctx.guardQualifierLibraryName);
    });
    // Arm-aware `input`: a CONCEPT atom contributes itself (non-qualified only); a CRITERION atom
    // contributes its RECURSIVE ATOM CLOSURE (the concepts under it, #236 step E) — DTR surfaces
    // the criterion's case features at the use-site. BOTH polarities. Deduped downstream by canonical.
    const armInputNames: string[] = [];
    for (const info of armLits) {
      if (info.kind === "concept") {
        const normalized = normalizeLocalRef(info.atom.ref, ctx.libraryName);
        if (!isQualifiedRef(normalized)) armInputNames.push(getRefName(normalized));
      } else {
        const entry = ctx.criterionIndex.get(getRefName(info.atom.ref));
        if (entry) for (const ref of entry.recursiveAtomClosure) armInputNames.push(getRefName(ref.ref));
      }
    }
    const inputs = buildActionInputs(armInputNames, ctx);
    return {
      title: armLabel,
      description: armLabel,
      code: guidelineCareCode(),
      condition: conditions,
      ...(inputs ? { input: inputs } : {}),
      // Clone the shared body fields into EVERY arm (incl. arm 0) — anti-aliasing +
      // future-mutation hygiene. The body is emitted ONCE, so an unresolved LEAF
      // diagnoses once (not per arm); only a downstream closure check that walks each
      // arm's now-independent nested inputs (Inv-5 input profiles) can report per arm.
      ...cloneJson(bodyFields),
    };
  });

  // Placement. Single arm (pure-`and`) → the one action, no wrapper. >=2 arms:
  // splice under an enclosing `first:`, else one `"any"` grouping wrapper.
  if (armActions.length >= 2 && enclosingQualifier !== "first") {
    // #236: this label is the EMITTED arm-wrapper `title`/`description` (serialized FHIR bytes).
    // `describeBranchCondition` renders a criterion ref by its author name (it is not expanded), so
    // a criterion-guarded wrapper is titled by the criterion — consistent with the CQL-identifier
    // condition it carries and with the VM display label.
    const guardLabel = describeBranchCondition(wb.condition, getRefName);
    const wrapper: Record<string, unknown> = {
      title: guardLabel,
      description: guardLabel,
      code: guidelineCareCode(),
      action: armActions,
    };
    addApplicabilityBehaviorExtension(wrapper);
    return { kind: "emitted", actions: [wrapper] };
  }
  return { kind: "emitted", actions: armActions };
}

/**
 * `otherwise` (catch-all) → action emit.
 *
 * The catch-all emits a no-condition action; its LAST position under a `first:`
 * switch group is what makes it a true fallthrough (child order is significant
 * under `cqf-applicabilityBehavior` "any" — apply the first applicable child).
 * The `first:` selection semantics are now emitted (see the top-level wrapper in
 * `emitDecisionPlanDefinition` and the nested case in `fillBranchBody`).
 */
function emitOtherwiseBlock(ob: OtherwiseBlock, ctx: EmitCtx): EmitActionResult {
  const action: Record<string, unknown> = {
    title: "otherwise",
    description: "otherwise",
    code: guidelineCareCode(),
    // No `condition[]` — the catch-all is unconditional.
  };

  return fillBranchBody(action, ob.body, ctx);
}

/**
 * Fill a branch's action skeleton from its body — leaf (ActionStatement) or
 * branching (BlockBody) — and apply cascade rules. Shared by when/otherwise.
 */
function fillBranchBody(
  action: Record<string, unknown>,
  body: WhenBlockBody,
  ctx: EmitCtx,
): EmitActionResult {
  // Body: leaf (ActionStatement) or branching (BlockBody).
  if (body.type === "ActionStatement") {
    const leafResult = emitLeafAction(body.action, ctx);
    if (leafResult === null) {
      // Leaf ref unresolved → suppress the entire branch.
      return { kind: "suppressed", reason: "unresolved-ref" };
    }
    action.definitionCanonical = leafResult;
    return { kind: "emitted", actions: [action] };
  }

  // body is BlockBody — recurse into its children. Each child may itself emit 1..N
  // actions (a compound `or` child spliced under this block's `first:`), so flat-map;
  // the childResults stay 1:1 with statements for the cascade-diagnostic index loop.
  const childResults = body.statements.map((stmt) => emitBlockStatement(stmt, ctx, body.qualifier));
  const survivingChildren = childResults
    .filter((r): r is { kind: "emitted"; actions: Record<string, unknown>[] } => r.kind === "emitted")
    .flatMap((r) => r.actions);

  if (survivingChildren.length === 0) {
    // Round-6 Claude I-Rule7 fix: do NOT emit cascade-suppression warning
    // here. Pass cascade silently up the chain. Warning fires exactly ONCE
    // per cascade chain — at the suppressed child of the lowest non-
    // cascading ancestor (emitted in the mixed-children branch below), or
    // gets subsumed by `strategy-root-cascade-suppressed` if the cascade
    // reaches the top-level. Plan v3.2 rule 7: "1 diagnostic per cascade
    // root, not N."
    return { kind: "suppressed", reason: "all-children-suppressed" };
  }

  // Rule 3: mixed children → emit parent with survivors only, no aggregate
  // diagnostic for the survivors. Rule 4/7 (round-6 fix): for each cascade-
  // suppressed child, emit ONE `unresolved-reference-cascade-suppression`
  // warning at the CHILD's location — the child is THE cascade root for its
  // sub-chain, since this parent (emitting) terminates the upward cascade.
  for (let i = 0; i < childResults.length; i++) {
    const cr = childResults[i]!;
    if (cr.kind === "suppressed" && cr.reason === "all-children-suppressed") {
      const childStmt = body.statements[i]!;
      const childName =
        childStmt.type === "WhenBlock"
          ? `when ${describeBranchCondition(childStmt.condition, getRefName)}`
          : childStmt.type === "OtherwiseBlock"
          ? "otherwise"
          : actionTitle(childStmt.action);
      ctx.errors.push({
        type: "Validation",
        kind: "unresolved-reference-cascade-suppression",
        message: `Action under "${childName} then..." suppressed because all its children were suppressed.`,
        line: childStmt.location?.start.line,
        column: childStmt.location?.start.column,
      });
    }
  }
  action.action = survivingChildren;

  // Nested `first:` (an ordered branch-switch nested under a matched `when`) → the
  // standard `cqf-applicabilityBehavior` "any": apply the first applicable child.
  // The parent when/otherwise action is the grouping action, so no extra wrapper is
  // needed here (unlike the top-level case). Menu `any:` (a "pick one of these
  // actions" selection, NOT ordered evaluation) is a DIFFERENT construct — stamping
  // the applicability extension on it would assert the wrong operational meaning, so
  // it keeps the phase-1 `crl-logical-switch` stand-in until its FHIR selection
  // semantics are settled (GitHub #184). `all:`/no-qualifier → no extension.
  if (body.qualifier === "first") {
    addApplicabilityBehaviorExtension(action);
  } else if (body.qualifier === "any") {
    action.extension = [
      {
        url: crlLogicalSwitchExtensionUrl(ctx.canonicalBase),
        valueBoolean: true,
      },
    ];
  }

  return { kind: "emitted", actions: [action] };
}

/**
 * Emit a BlockStatement (a nested branch — when/otherwise — or a bare
 * ActionStatement). Wraps the recursion + action-statement leaf emission
 * paths uniformly.
 */
function emitBlockStatement(
  stmt: BlockMember,
  ctx: EmitCtx,
  enclosingQualifier: BlockQualifier | undefined,
): EmitActionResult {
  if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock")
    return emitBranch(stmt, ctx, enclosingQualifier);

  // ActionStatement at the body level (a BlockBody menu member). It may carry a
  // per-action guard (`unless` / `only when`, #224 iii.1) that lowers to this
  // action's `condition[kind=applicability]` — `only when` → the positive
  // `text/cql-identifier` (byte-identical to a `when` single-ref atom), `unless` →
  // the negated `text/cql-expression` `not "<name>"` (guardApplicabilityCondition).
  //
  // Resolve the GUARD first, then the leaf, collecting BOTH diagnostics before
  // suppressing once (report-everything, parity with the compound-guard path at
  // emitCompoundWhenBlock: an item with an unresolved guard AND an unresolved leaf
  // surfaces both). An unresolved guard must SUPPRESS the item — never silently
  // drop the exclusion by emitting the action unconditionally.
  let unresolved = false;

  let guardCondition: Record<string, unknown> | undefined;
  let guardInputName: string | undefined;
  if (stmt.guard) {
    // Self-qualified `MyLib."C"` inside `MyLib` → bare `C`. A genuinely FOREIGN ref
    // (still qualified after normalization) is cross-library-unsupported (v0) →
    // suppress EXPLICITLY rather than leaning on the resolver to null it: a direct
    // caller's resolver may resolve foreign refs (the activity resolver does), and an
    // un-suppressed foreign guard would emit a wrong-library qualifier + an F2 input
    // clobber. Parity with the when single-ref path's `isQualifiedRef` input defense.
    const normalized = normalizeLocalRef(stmt.guard.conceptName, ctx.libraryName);
    const cqlId = isQualifiedRef(normalized) ? null : ctx.conceptResolver(normalized);
    if (cqlId === null) {
      ctx.unmatched.push({
        kind: "unresolved-concept",
        text: refDisplay(stmt.guard.conceptName), // raw ref — parity with the when path
        line: stmt.guard.location?.start.line,
        column: stmt.guard.location?.start.column,
      });
      unresolved = true;
    } else {
      guardCondition = guardApplicabilityCondition(
        stmt.guard.polarity === "unless" ? "negated" : "positive",
        cqlId,
        ctx.guardQualifierLibraryName,
      );
      // The guard concept is a case feature (its `code is` closure → an SD + input).
      // A still-qualified ref never reaches here (it resolved to null above), so no
      // qualified-skip is needed — buildActionInputs receives a local name.
      guardInputName = getRefName(normalized);
    }
  }

  const leafResult = emitLeafAction(stmt.action, ctx); // pushes its own unresolved-* on null
  if (leafResult === null) unresolved = true;

  if (unresolved) return { kind: "suppressed", reason: "unresolved-ref" };

  // Field order mirrors the when path: title, description, code, condition?, input?,
  // definitionCanonical. An UNGUARDED action omits condition/input → byte-identical
  // to pre-iii.1.
  const action: Record<string, unknown> = {
    title: actionTitle(stmt.action),
    description: actionTitle(stmt.action),
    code: guidelineCareCode(),
  };
  if (guardCondition) action.condition = [guardCondition];
  if (guardInputName) {
    const inputs = buildActionInputs([guardInputName], ctx);
    if (inputs) action.input = inputs;
  }
  action.definitionCanonical = leafResult;
  return { kind: "emitted", actions: [action] };
}

/**
 * Resolve a CRL action leaf (recommend activity OR use decision)
 * to its definitionCanonical URL. Returns null when unresolved
 * (emits the matching `unresolved-*` UnmatchedReference as a
 * side-effect). The caller decides what to do with null.
 */
function emitLeafAction(action: Action, ctx: EmitCtx): string | null {
  if (action.type === "RecommendActivity") {
    const ref = normalizeLocalRef(action.activityName, ctx.libraryName);
    const url = ctx.activityResolver(ref);
    if (url === null) {
      ctx.unmatched.push({
        kind: "unresolved-activity",
        text: refDisplay(action.activityName),
        line: action.location?.start.line,
        column: action.location?.start.column,
      });
      return null;
    }
    return url;
  }

  // UseDecision
  const ref = normalizeLocalRef(action.decisionName, ctx.libraryName);
  const url = ctx.decisionResolver(ref);
  if (url === null) {
    ctx.unmatched.push({
      kind: "unresolved-decision",
      text: refDisplay(action.decisionName),
      line: action.location?.start.line,
      column: action.location?.start.column,
    });
    return null;
  }
  return url;
}

function actionTitle(action: Action): string {
  if (action.type === "RecommendActivity") return getRefName(action.activityName);
  return getRefName(action.decisionName);
}

/* ─── Dependency-graph walker + cycle detection ───────────────────── */

/**
 * Build incoming-reference set per decision name + detect SCC cycles.
 * Returns (rootNames, suppressed cycle members + errors).
 */
function classifyAndDetectCycles(
  decisions: ReadonlyArray<Decision>,
  libraryName: string,
): {
  rootNames: Set<string>;
  cycleMembers: Set<string>;
  errors: CRLError[];
} {
  const errors: CRLError[] = [];
  const decisionNames = new Set(decisions.map((d) => d.name));
  const outgoing = new Map<string, Set<string>>(); // d -> set of decisions d uses
  const incoming = new Map<string, Set<string>>();
  for (const d of decisions) {
    outgoing.set(d.name, collectUseDecisions(d, decisionNames, libraryName));
    incoming.set(d.name, new Set());
  }
  for (const [from, tos] of outgoing) {
    for (const to of tos) {
      const set = incoming.get(to);
      if (set) set.add(from);
    }
  }

  // Tarjan's SCC.
  const sccs = tarjanSCC(decisions.map((d) => d.name), outgoing);
  const cycleMembers = new Set<string>();
  for (const scc of sccs) {
    // SCC of size > 1 is a true cycle; size-1 SCC with a self-loop also a cycle.
    const isSelfLoop = scc.length === 1 && outgoing.get(scc[0]!)?.has(scc[0]!);
    if (scc.length > 1 || isSelfLoop) {
      for (const m of scc) cycleMembers.add(m);
      errors.push({
        type: "Validation",
        kind: "circular-decision-reference",
        message: `Circular decision reference among: ${scc.map((n) => `"${n}"`).join(", ")}. Skipping all members.`,
      });
    }
  }

  // Roots: decisions NOT in any cycle AND with no incoming refs.
  const rootNames = new Set<string>();
  for (const d of decisions) {
    if (cycleMembers.has(d.name)) continue;
    if ((incoming.get(d.name)?.size ?? 0) === 0) rootNames.add(d.name);
  }

  return { rootNames, cycleMembers, errors };
}

/**
 * Walk a Decision's body collecting `use decision` refs that ARE local
 * to `libraryName`. Foreign cross-library refs (e.g. `"OtherLib"."X"`)
 * are skipped — they do NOT contribute to the local dependency graph
 * (round-6 gpt55 C1 + Claude sub-agent confirmed: prior impl stripped
 * qualifiers via getRefName without checking library context, causing
 * phantom self-loops + root/sub misclassification).
 */
function collectUseDecisions(
  d: Decision,
  knownDecisionNames: Set<string>,
  libraryName: string,
): Set<string> {
  const refs = new Set<string>();
  function tryAddDecisionRef(ref: ReferenceName): void {
    const normalized = normalizeLocalRef(ref, libraryName);
    if (isQualifiedRef(normalized)) return; // foreign — not a local edge
    const name = getRefName(normalized);
    if (knownDecisionNames.has(name)) refs.add(name);
  }
  function visitBranch(branch: BranchBlock): void {
    // `when`/`otherwise` both walk their body for `use decision` edges; an
    // `otherwise` body's delegation is a real edge.
    const body = branch.body;
    if (body.type === "ActionStatement") {
      if (body.action.type === "UseDecision") {
        tryAddDecisionRef(body.action.decisionName);
      }
      return;
    }
    // BlockBody
    for (const stmt of body.statements) {
      if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") visitBranch(stmt);
      else if (stmt.action.type === "UseDecision") {
        tryAddDecisionRef(stmt.action.decisionName);
      }
    }
  }
  for (const branch of d.body.statements) visitBranch(branch);
  return refs;
}

// Tarjan SCC factored to ./tarjan for shared use between per-library
// (this file) and closure-level (closureOrchestrator.ts) cycle detection
// — v2.4.0 round-5 Gemini disposition.

/* ─── Closure-level wrapper ──────────────────────────────────────── */

/**
 * Closure-level emit. Walks the dependency graph to classify root vs
 * sub-decisions, detects cycles, builds resolvers from the closure,
 * and emits one PlanDef per non-skipped decision. Detects
 * intra-Decision slug collisions (skip both colliders).
 *
 * Cross-kind PlanDef collisions (Recommendation id vs Decision id)
 * are deferred to Todo 4 per plan v3.2.
 *
 * `libraryName` MUST be `ast.library.name` byte-for-byte.
 */
export function emitDecisionPlanDefinitionsForLibrary(
  decisions: ReadonlyArray<Decision>,
  activities: ReadonlyArray<Activity>,
  concepts: ReadonlyArray<Concept>,
  libraryName: string,
  metadata: CpgMetadata,
  opts: EmitOptions = {},
  // #224 ii.1c / #236 — the library's criterion table (`name → Criterion`), so a guard that
  // references a criterion resolves it to its own boolean define (NOT inline-expanded). Defaults
  // to empty for callers with no criteria. Build via `buildCriterionTable(<library statements>)`.
  criterionTable: CriterionTable = new Map(),
): {
  resources: EmittedResource[];
  errors: CRLError[];
  unmatched: UnmatchedReference[];
} {
  const resources: EmittedResource[] = [];
  const errors: CRLError[] = [];
  const unmatched: UnmatchedReference[] = [];

  // 1. Dependency-graph classification + cycle detection.
  const classification = classifyAndDetectCycles(decisions, libraryName);
  errors.push(...classification.errors);

  // 2. `empty-strategy-entrypoint` — only when acyclic with no root.
  //    Per round-5 gpt55 I1: suppress when cycle errors already
  //    surface the cause.
  const liveDecisions = decisions.filter((d) => !classification.cycleMembers.has(d.name));
  if (liveDecisions.length > 0 && classification.rootNames.size === 0 && classification.cycleMembers.size === 0) {
    errors.push({
      type: "Validation",
      kind: "empty-strategy-entrypoint",
      message: `Closure has no root decision. Every decision is referenced by another via 'use decision', and no cycles were detected. Modeling error?`,
    });
    return { resources, errors, unmatched };
  }

  // 3. Build resolvers. Skipped cycle members go in the skip set so
  //    the decisionResolver returns null for cross-references to
  //    them (cascade rule 2 then suppresses the referring WhenBlock).
  const { conceptResolver, activityResolver, decisionResolver } = makeResolversFromClosure(
    libraryName,
    metadata,
    concepts,
    activities,
    decisions,
    classification.cycleMembers,
  );

  // 4. Intra-Decision slug collision detection.
  const slugMap = new Map<string, Decision[]>();
  for (const d of liveDecisions) {
    const id = decisionId(metadata, d.name);
    const existing = slugMap.get(id) ?? [];
    existing.push(d);
    slugMap.set(id, existing);
  }
  for (const [id, list] of slugMap) {
    if (list.length > 1) {
      errors.push({
        type: "Validation",
        kind: "slug-collision",
        message: `Slug collision on Decision PlanDef id "${id}" between decisions: ${list.map((d) => `"${d.name}"`).join(", ")}. Rename one of the CRL decisions.`,
        line: list[0]?.location?.start.line,
        column: list[0]?.location?.start.column,
      });
    }
  }

  // 5. Emit one PlanDef per non-skipped, non-colliding decision.
  for (const d of liveDecisions) {
    const id = decisionId(metadata, d.name);
    if ((slugMap.get(id)?.length ?? 0) > 1) continue;
    const isRoot = classification.rootNames.has(d.name);
    const r = emitDecisionPlanDefinition(
      d,
      libraryName,
      metadata,
      conceptResolver,
      activityResolver,
      decisionResolver,
      isRoot,
      opts,
      undefined, // libraryReferenceSuffix (per-library path: source-name-keeping)
      undefined, // caseFeatureInputResolver (default → no action.input)
      criterionTable,
    );
    if (r.resource) resources.push(r.resource);
    errors.push(...r.errors);
    unmatched.push(...r.unmatched);
  }

  return { resources, errors, unmatched };
}
