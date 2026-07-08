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
  BranchBlock,
  Concept,
  Decision,
  OtherwiseBlock,
  ReferenceName,
  WhenBlock,
  WhenBlockBody,
} from "../ast/types";
import { getRefName, isQualifiedRef, normalizeLocalRef, refDisplay } from "../ast/types";
import type { CRLError } from "../types/errors";
import { libraryCanonicalUrl } from "./library";
import { recommendationDefinitionCanonicalUrl } from "./recommendation";
import { capSlug, pascalCaseName, policyIdBase, slugify } from "./slug";
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
}

/**
 * Case-feature input resolver (action-level PlanDefinition `input`, DTR pattern).
 *
 * Maps a normalized (self-qualifier-stripped) `when`-condition concept name → the
 * ORDERED list of case-feature inputs for that condition — the recursive `code is`
 * closure of the condition in INFERENCE ORDER (the condition's own `code is` first,
 * then its `defined as` operands left-to-right; see `caseFeatureCollection.ts`).
 * Returns `[]` for a condition with no reachable `code is` concept (non-LocalSource,
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

// R1 — id BASE is the policy id (`policyIdBase(metadata)`); the decision-name
// slug is the suffix.
function decisionId(metadata: CpgMetadata, decisionName: string): string {
  return capSlug(`${policyIdBase(metadata)}-${slugify(decisionName)}`);
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

type EmitActionResult =
  | { kind: "emitted"; action: Record<string, unknown> }
  | { kind: "suppressed"; reason: "unresolved-ref" | "all-children-suppressed" };

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
  };
  const topLevelResults = decision.body.statements.map((branch) => emitBranch(branch, ctx));
  const topLevelActions = topLevelResults
    .filter((r): r is { kind: "emitted"; action: Record<string, unknown> } => r.kind === "emitted")
    .map((r) => r.action);

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
      message: `Decision "${decision.name}" would emit with zero surviving top-level actions due to cascade suppression. Skipping resource. Resolve the underlying unresolved-* references.`,
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
      const label = branch.type === "WhenBlock" ? `when ${getRefName(branch.conceptName)}` : "otherwise";
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
}

/** Dispatch a branch to its when/otherwise emit. */
function emitBranch(branch: BranchBlock, ctx: EmitCtx): EmitActionResult {
  return branch.type === "WhenBlock" ? emitWhenBlock(branch, ctx) : emitOtherwiseBlock(branch, ctx);
}

/**
 * Recursive WhenBlock → action emit. Returns the tri-state result.
 * Cascade rules per plan v3.2 §"Cascade-suppression behavior".
 */
function emitWhenBlock(wb: WhenBlock, ctx: EmitCtx): EmitActionResult {
  // Normalize the condition ref ONCE (F5 — single computation): a SAME-library
  // qualified ref (`MyLib."X"` inside `MyLib`) is stripped to bare `X`; a genuine
  // cross-library ref (`OtherLib."X"`) is left qualified. This normalized ref + its
  // bare name (`refName`) drive the condition resolver, the action-level input
  // lookup, AND the displays, so the input path treats a self-qualified ref the
  // SAME way the condition path does (F2 — no self-qualified asymmetry).
  const normalizedRef = normalizeLocalRef(wb.conceptName, ctx.libraryName);
  const refName = getRefName(normalizedRef);

  // 1. Resolve the condition concept. Suppressed when unresolved.
  const conceptCqlId = ctx.conceptResolver(normalizedRef);
  if (conceptCqlId === null) {
    ctx.unmatched.push({
      kind: "unresolved-concept",
      text: refDisplay(wb.conceptName),
      line: wb.location?.start.line,
      column: wb.location?.start.column,
    });
    return { kind: "suppressed", reason: "unresolved-ref" };
  }

  // 2. Build action skeleton (with applicability condition). Title/description use
  // the NORMALIZED bare name — byte-identical to the raw `getRefName(wb.conceptName)`
  // for an unqualified ref, and consistent with the condition/input for a
  // self-qualified one.
  const action: Record<string, unknown> = {
    title: refName,
    description: refName,
    code: [
      {
        coding: [{ system: CPG_COMMON_PROCESS_CS, code: "guideline-based-care" }],
      },
    ],
    condition: [
      {
        kind: "applicability",
        expression: { language: "text/cql-identifier", expression: conceptCqlId },
      },
    ],
  };

  // Action-level `input[]` (DTR pattern). The `when` condition references a SINGLE
  // concept, but its case-feature inputs are the RECURSIVE `code is` closure of
  // that condition in INFERENCE ORDER (the condition's own `code is` first, then
  // its `defined as` operands left-to-right — see `caseFeatureCollection.ts`). F2 —
  // normalize the ref the SAME way the condition path does, THEN skip ONLY if the
  // NORMALIZED ref is still qualified (a genuine cross-library ref); a
  // self-qualified eligible `when` (`MyLib."X"` inside `MyLib`) gets its inputs,
  // consistent with the condition it already got. Each collected concept becomes
  // one `Observation` input profiled to that concept's case-feature SD, labelled +
  // described by the concept name. Dedup by canonical within THIS action (the
  // collection already dedups by name; canonical-dedup is a belt-and-suspenders
  // guard against two names slugging to the same SD).
  if (!isQualifiedRef(normalizedRef)) {
    const collected = ctx.caseFeatureInputResolver(refName);
    if (collected.length > 0) {
      const seenCanonicals = new Set<string>();
      const inputs: Array<Record<string, unknown>> = [];
      for (const { name, canonical } of collected) {
        if (seenCanonicals.has(canonical)) continue;
        seenCanonicals.add(canonical);
        inputs.push({
          extension: [
            { url: CPG_INPUT_TEXT_EXT, valueString: `${name}?` },
            { url: CPG_INPUT_DESCRIPTION_EXT, valueMarkdown: name },
          ],
          type: "Observation",
          profile: [canonical],
        });
      }
      if (inputs.length > 0) action.input = inputs;
    }
  }

  return fillBranchBody(action, wb.body, ctx);
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
    code: [
      {
        coding: [{ system: CPG_COMMON_PROCESS_CS, code: "guideline-based-care" }],
      },
    ],
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
    return { kind: "emitted", action };
  }

  // body is BlockBody — recurse into its children.
  const childResults = body.statements.map((stmt) => emitBlockStatement(stmt, ctx));
  const survivingChildren = childResults
    .filter((r): r is { kind: "emitted"; action: Record<string, unknown> } => r.kind === "emitted")
    .map((r) => r.action);

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
          ? `when ${getRefName(childStmt.conceptName)}`
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

  return { kind: "emitted", action };
}

/**
 * Emit a BlockStatement (a nested branch — when/otherwise — or a bare
 * ActionStatement). Wraps the recursion + action-statement leaf emission
 * paths uniformly.
 */
function emitBlockStatement(
  stmt: BlockMember,
  ctx: EmitCtx,
): EmitActionResult {
  if (stmt.type === "WhenBlock" || stmt.type === "OtherwiseBlock") return emitBranch(stmt, ctx);

  // ActionStatement at the body level (no enclosing WhenBlock condition).
  // Per CRL grammar this happens inside a BlockBody with no condition —
  // emit a bare action with definitionCanonical, no condition[].
  //
  // TODO (per-action guards — emit-lowering phase): a menu member may carry
  // `stmt.guard` (an `unless` / `only when` applicability guard). It must lower
  // to this action's `condition[kind=applicability]` (unless -> not, only when
  // -> identity), mirroring the `when`-branch condition path in emitBranch.
  // Guarded members currently emit WITHOUT their condition. See docs/decision-shapes.md.
  const leafResult = emitLeafAction(stmt.action, ctx);
  if (leafResult === null) return { kind: "suppressed", reason: "unresolved-ref" };

  const action: Record<string, unknown> = {
    title: actionTitle(stmt.action),
    description: actionTitle(stmt.action),
    code: [
      {
        coding: [{ system: CPG_COMMON_PROCESS_CS, code: "guideline-based-care" }],
      },
    ],
    definitionCanonical: leafResult,
  };
  return { kind: "emitted", action };
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
    );
    if (r.resource) resources.push(r.resource);
    errors.push(...r.errors);
    unmatched.push(...r.unmatched);
  }

  return { resources, errors, unmatched };
}
