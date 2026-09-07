/**
 * CRE — CRL Clinical Reasoning Engine (#115), v1.
 *
 * A headless, authoring-time interpreter: evaluate a CRL `decision` over a CEL
 * `case`'s facts, produce a recommendation set + trace, and check the case's
 * `result is` assertion (the oracle). It MIRRORS the FHIR/CQL engine at the
 * CRL/CEL level for fast authoring feedback — it is NOT the engine.
 *
 * REFACTOR:grounded (#320, review 570): explicit Record publications use selected
 * nullable values; missing answerable evidence pauses before a leaf. Their CRE
 * capability boundary is checked in runCel. The older presence/composition path
 * described below is legacy implementation, not the target publication semantics.
 *
 * LEGACY SCOPE (unmarked implementation remains presumed-wrong under #320):
 *  - Concept satisfaction is ASSERTED + COMPOSED (REFACTOR:grounded — #189 Piece 2 + (a), disc 508/510/511):
 *      • asserted — a concept with a REPRESENTATION (a local `code is`, or a `coded from`/`source representation`
 *        binding) is satisfied when ≥1 of the case's (non-subject) facts is `defined by` it. For a LOCAL concept the
 *        fact's CODE is the membership input: it populates the concept whose `{system, code}` set it belongs to
 *        (compartment-global, byte-matching the CQL retrieve — Piece 2), NOT merely the concept it names. A
 *        RESOURCELESS-DERIVED concept (no `code is` AND no source binding — a pure `defined as`, a code-less
 *        reduction, or null-forever) is READ-ONLY: it has no FHIR resource, so a fact CANNOT assert it and doing so
 *        is a per-case run error — `$apply` has no equivalent (#189 (a) removed the old asserted-by-name magic).
 *      • composed (#126) — a concept with a `defined as` body is satisfied when
 *        its boolean composition over operand concepts evaluates true:
 *        `sem-and` = all, `sem-or` = any, `sem-not` = not (closed-world: absence
 *        ⇒ operand false), bare alias = the aliased concept, nesting supported.
 *      A concept that is BOTH directly assertable (`code is`) AND `defined as` — a CODED composite — is satisfied if
 *      EITHER holds (asserted ∪ composed); the composition is still walked on the asserted path so its trace +
 *      diagnostics surface. This union survives ONLY for a coded composite; a resourceless composite has no asserted
 *      arm at all (read-only, above).
 *    Operand refs: a BARE operand resolves within the DEFINING concept's library
 *      (CRL's local-namespace rule); cross-library operands must be qualified. An
 *      operand resolving to neither a concept nor a fact emits a diagnostic
 *      (silent-false under `sem-not` would invert to a spurious `true`). Cyclic
 *      `defined as` (validator-rejected) terminates with a diagnostic and is not
 *      memoized. EVALUATED (#270 Slice 0a-cre): `defined as exists ("X")` and a named `definition is
 *      exists "X"` reduction — closed-world existence over X (`refTrace`). REFUSED loud (run marked error,
 *      never a fabricated presence answer): a `count ... at least N` / `most recent this` reduction. Still
 *      NOT evaluated (deferred): a NAMED `most recent "X"` / temporal / value `definition is` predicate
 *      (presence-evaluated under the general rule), `coded from` / external value sets.
 *  - Decision walk: `first:` (ordered, first match wins, short-circuit),
 *    `all:` (every matching branch fires), `any:`/`all:` over actions (members
 *    enter the produced set; qualifier recorded), `otherwise` (catch-all), and
 *    the per-action guards `unless "C"` / `only when "C"`.
 *  - Oracle: a decision-leaf `result is` passes iff the expected branch is in
 *    the produced set (membership — a case asserts one valid disposition).
 *  - `use decision` is EVALUATED transitively (#166 same-library; #172 cross-library):
 *    a RESOLVABLE target is recursed in place — the sub-decision's body is walked
 *    under the use-decision action's nodeId and its RecommendActivity determinations
 *    bubble into the SAME produced set (so the oracle sees the delegated disposition).
 *    A BARE target binds in the CURRENT frame's library; a QUALIFIED (cross-library)
 *    target binds in its explicit library and recurses in a NEW frame
 *    `{ currentLib: resolved.lib, currentFilePath: resolved.filePath }` — so the sub's
 *    OWN bare `when`/guard concepts resolve in ITS library (closed-world; the
 *    satisfying CEL fact must be `defined by "SubLib"."C"`) and its trace spans point
 *    at its file. The sub-decision NAME is NOT produced (a delegation is not a
 *    disposition — REPLACE semantics; the bubbled name is the sub's BARE activity
 *    name). An UNRESOLVED cross-library target (lib/sub not in the graph) → a distinct
 *    `unresolved-cross-lib` diagnostic; an unresolved same-library bare target → a
 *    distinct not-found diagnostic. Delegation is cycle-guarded keyed `(lib,name)` (a
 *    target already on the delegation path → a runtime-error status + a cycle
 *    diagnostic, no hang) so cross-library `A.Sub`/`B.Sub` can't false-collide.
 */
import { validateCEL } from "../cel/validator/validator";
import { childId, idOf, nameOf } from "../ast/decisionSpine";
import type {
  ActionGuard,
  ActionStatement,
  BlockBody,
  BlockMember,
  BlockQualifier,
  BranchBlock,
  CompositionExpression,
  Concept,
  CRL,
  Decision,
  DefinedAsBareRef,
  DefinedAsBooleanComposition,
  DefinedAsComposition,
  DefinedAsExists,
  Location,
  ReferenceName,
  WhenBlockBody,
} from "../ast/types";
import { getRefLibrary, getRefName } from "../ast/types";
import { soleRef, describeBranchCondition } from "../ast/branchCondition";
import { conceptRefsOfConcept } from "../ast/conceptDependencies";
import { buildCriterionIndex, guardConceptClosure } from "../ast/criterionIndex";
import { foreignCriterionMessage } from "../ast/criterionDiagnostics";
import type { BranchCondition } from "../ast/types";
// #236 — the CRE evaluates a decision's criterion-guard refs BY REFERENCE (memoized per case),
// never by up-front expansion. `runCel` runs NO semantic validation, so a cyclic/undefined
// criterion table can reach the evaluator directly; it degrades to closed-world false + a
// diagnostic (never a throw). The per-library criterion TABLES are the only shared wiring with the
// view-model (`buildCriterionTablesForGraph`), so run + render resolve criteria from the SAME
// source and their `op:"criterion"` traces/spines stay zip-consistent.
import type { CriterionTable } from "../ast/criterionExpansion";
import { buildCriterionTablesForGraph } from "./criterionTables";
import type {
  CELCase,
  CELCodeField,
  CELDefinedByField,
  CELFact,
  CELFactRefField,
  CELResultField,
  CELValueField,
} from "../cel/ast/types";
import { classifyCanonicalToken, parseCodedValueToken } from "../cel/canonicalToken";
// REFACTOR:grounded (#320, discussion 555): preserve authored per-reference temporal context.
import { celIdentityDiagnostics, celResourceId, emitCelToFhir } from "../cel/emitter/emitFhir";
import type { EmittedResource } from "../cel/emitter/types";
import {
  adaptPublicationCandidate, hasLocalPublicationContribution, prepareSingleLibraryPublication,
  isLocalBooleanPublication,
  type PublicationProgram,
} from "../emit/publicationProgram";
import { selectPublicationCandidate, type PublicationCandidate } from "../emit/publicationSelection";
import { interpretPublicationCodeableValue } from "../emit/publicationDomain";
import { produceMembershipCandidate } from "../emit/publicationProducer";
import { adaptServiceRequestPublicationCandidate, matchesPublicationSource, matchesCelPublicationPatient } from "../emit/publicationSource";
import { readPolicyId } from "../fhir-emitter/metadata";
import { resolveCaseFactDates } from "../cel/factDate";
import { resolveDefinedByTarget } from "../cel/definedByResolve";
import type { ResolvedCelGraph } from "../cel/imports/types";
import { createPublicationContext } from "../emit/publicationContext";
import { buildLibraryScopes, lookupKnownLibrary } from "../imports/scopes";
import type { RegistryEntry } from "../imports/types";
import { inlineAnswerSet } from "../fhir-emitter/inlineAnswerSet";
import { isValueReadingBooleanConcept, isPureQuestionConcept } from "../template-match/recencyValueConcept";
import { resolveConceptPipeline } from "../template-match/resolvePipeline";
import type { ResolvedStage } from "../template-match/resolvePipeline";
import { isResourcelessDerived } from "../emit/conceptDatumSignals";
import {
  makeLocalDomainContext,
  localMemberOfConcept,
  memberKey,
  type LocalConceptMember,
} from "../cel/localMembership";
import { sourceMembersOfConcept, terminologyMembersByName } from "../cel/sourceMembership";
import { compareFhirTemporal } from "../cel/temporal";
import type { LsLocation } from "../language-services/contracts";
import { toZeroBasedRange } from "../language-services/contracts";
// childId + idOf/nameOf are single-sourced in ast/ (natural layer direction); re-exported here for existing consumers
// (viewModel, etc.). idOf is the shared (lib,name) identity used by the global decision resolver and all 4 cycle keys;
// nameOf is its tested inverse, used to render the delegation-cycle chain by name (byte-identical to the pre-#172 text).

import {
  buildGlobalDecisionMap,
  makeResolveDecision,
  type ResolvedDecision,
} from "./decisionResolver";
export { childId };

type Id = string;
const labelOf = (lib: string, name: string): string => `"${lib}"."${name}"`;

export interface ProducedRec {
  recommendation: string;
  viaWhen: string | null;
  qualifier: BlockQualifier | null;
}

/** Sub-evaluation of a `defined as` composition — so the trace shows WHY a
 *  composite was (un)satisfied (which operand failed), for adversarial review.
 *  `sem-and`/`sem-or`/`sem-not` are the semantic-inference (record-space) ops; `and`/`or`/`not` are the
 *  #189 Slice 0b BOOLEAN-composition ops (over SEPARATE boolean facts) — same shape, distinct semantics. */
export interface CompositionTrace {
  op: "sem-and" | "sem-or" | "sem-not" | "and" | "or" | "not" | "ref";
  satisfied?: boolean;
  concept?: string; // op === "ref"
  operands?: CompositionTrace[]; // op === "sem-and" | "sem-or" | "and" | "or"
  operand?: CompositionTrace; // op === "sem-not" | "not"
  composition?: CompositionTrace; // op === "ref" to a composite — its own sub-evaluation
}

/** Sub-evaluation of a COMPOUND decision guard (`when A and (B or C)`) — the
 *  decision-layer analogue of `CompositionTrace` (do NOT conflate: `sem-*`
 *  inference vs decision `and`/`or`). Named `conditionTrace` on TraceNode to
 *  avoid colliding with `TraceNode.guard` (the action-guard). A ref leaf carries
 *  a STRUCTURED identity (cross-library same-name operands stay distinct), its
 *  own `defined as` `CompositionTrace` if it is a composite, and its own facts.
 *  Present ONLY for a compound guard; a single-ref `when` keeps the legacy
 *  `concept` + `composition` fields and omits this. */
export type BranchConditionTrace =
  | { op: "and" | "or"; satisfied?: boolean; operands: BranchConditionTrace[] }
  // Decision guard traces preserve Tri: omitted satisfied means unknown, including under not.
  | { op: "not"; satisfied?: boolean; operand: BranchConditionTrace }
  | {
      op: "ref";
      satisfied?: boolean;
      concept: { name: string; libraryName?: string };
      composition?: CompositionTrace;
      facts?: string[];
    }
  // #236: a decision-guard `criterion` ref — evaluated by REFERENCE to the criterion's boolean
  // body (memoized per case), NOT inline-expanded. THREE shapes: (1) the FIRST occurrence of a
  // given `(lib, name)` per case that RESOLVES carries the full `body` sub-trace; (2) a LATER
  // occurrence of that same criterion sets `reference: true` and omits `body`, so the serialized
  // trace stays LINEAR in DISTINCT criteria — the run_decision analog of the emit DAG (a criterion
  // referenced N times, or a doubling DAG, does not re-bloat the trace); (3) an UNDEFINED or CYCLIC
  // criterion (no body anywhere, closed-world false) carries NEITHER `body` nor `reference` — an
  // opaque/error node. So `reference: true` ALWAYS implies a `body` shown at an earlier occurrence.
  | {
      op: "criterion";
      satisfied?: boolean;
      criterion: { name: string; libraryName: string };
      body?: BranchConditionTrace;
      reference?: boolean;
      facts?: string[];
    };

export interface TraceNode {
  node: string;
  /** Decision-relative structural path id (e.g. "when[0]/action[1]", "otherwise", "when[1]/when[0]") —
   *  stable across re-runs of an unchanged decision; the key the scenario view-model aligns run-state
   *  onto the AST by. Single-sourced with the view-model walker via the same index-path scheme. */
  nodeId: string;
  kind: "when" | "otherwise" | "action";
  /** Source span of the originating CRL AST node, in the CURRENT frame's file (the covered/root file for same-library;
   *  the sub-decision's own file when a cross-library `use decision` recurses — sourced from `frame.currentFilePath`). */
  source: LsLocation;
  concept?: string;
  satisfied?: boolean;
  evaluated: boolean;
  /** REFACTOR:grounded (#320): attempted condition or action invalidated by a case-wide error. */
  invalidated?: boolean;
  /**
   * #189 null/pause — this ordered branch's guard evaluated UNKNOWN (nothing established it and nothing
   * could compute it), so the walk HALTED here: no later sibling was evaluated and no disposition was
   * reached. Distinct from `satisfied: false`, which means the guard was established as NOT holding and the
   * walk moved on. This flag records an ordered halt. `unknown` records any reached unknown
   * (including unordered conditions) and is used by pause assertions.
   */
  blockedUnknown?: boolean;
  /** REFACTOR:grounded (#320): reached unknown condition, ordered or unordered; not a fault. */
  unknown?: true;
  /** An evaluated publication failed. This condition cannot select its activity; independent
   * `all:` siblings may still run. Distinct from a false condition or an unknown-data pause. */
  publicationErrors?: PublicationEvaluationFailure[];
  guardedOut?: boolean;
  guard?: {
    polarity: "unless" | "only-when";
    concept: string;
    satisfied?: boolean;
    unknown?: true;
    composition?: CompositionTrace;
  };
  facts?: string[];
  /** Present when the `when`/guard concept is `defined as` a composition. */
  composition?: CompositionTrace;
  /** Present ONLY for a COMPOUND `when` guard (`and`/`or`); mutually exclusive
   *  with the single-ref `concept`/`composition` fields. Discriminator for a
   *  compound branch: `conditionTrace !== undefined`. */
  conditionTrace?: BranchConditionTrace;
  children?: TraceNode[];
}

/** A per-concept case answer (#187 Todo 2) — the case's truth for concept `(lib,name)`. `satisfied` is the concept's
 *  OVERALL evaluation (a direct fact OR its `defined as` composition), the SAME value whether the concept was on- or
 *  off-path. Fully qualified: same-name concepts in different libraries are distinct rows. Read-only + additive.
 *
 *  ⚠ ABSENT ⇒ UNKNOWN, and a row is only ever emitted for an ESTABLISHED answer. A concept the engine refuses to
 *  evaluate, and (since #189 null/pause) an UNANSWERED question, both OMIT their row rather than publish `false`.
 *  Consumers must render a missing row as blank/unknown — never as "not satisfied". */
export interface ConceptTruthRow {
  lib: string;
  name: string;
  satisfied: boolean;
}

export interface CaseRun {
  case: string;
  decision: string | null;
  status: "pass" | "fail" | "error";
  expected: ({ leaf: string; branch: string; pause?: never } | { leaf: string; pause: true; branch?: never }) | null;
  /** Publication condition errors may preserve independent all: activities with status:error.
   * Legacy case-global faults discard the produced set because evaluation is unreliable. */
  produced: ProducedRec[];
  trace: TraceNode[];
  diagnostics: string[];
  /** A reached legacy guard discarded unknown evidence; no supported pause can be established. */
  discardedUnknown?: true;
  /** The case's per-concept truth over the whole closure (#187 Todo 2). Lets the Medical-Validation panes show a
   *  case-derived answer for an OFF-path (preempted) concept that `:first` never evaluated. Empty on an error run.
   *  CONTRACT: an ABSENT `(lib,name)` (a concept outside this list) is UNKNOWN — render blank, never as `false`. */
  conceptTruth: ConceptTruthRow[];
}

export interface CelRunResult {
  /** First versioned raw CRE contract; distinct from the scenario-view schema. */
  schemaVersion: 1;
  success: boolean;
  runs: CaseRun[];
  errors: string[];
}

interface ConceptEntry {
  node: Concept;
  lib: string;
  // #189 Piece 2 (disc 508) — the owning-library identity the local-domain resolver needs to derive this concept's
  // local `{system, code}` set (byte-matching the emitter/CQL lane). `filePath` drives the primary-seed
  // disambiguation; `entryName` is the `RegistryEntry.name` the resolver keys on; `fallbackLib` is
  // `ast.library.name` (the metadata-less domain id).
  filePath: string;
  entryName: string | null;
  fallbackLib: string;
}

/** #189 Piece 2 (disc 508) — the CRE's local membership index. Population is CODE-DRIVEN / compartment-global (§4:
 *  "there is no selector — the code, and which sets it is a member of, is the whole story"): a fact's effective
 *  `(fhirType, {system,code})` is looked up in `reverse` to find WHICH local concept it populates (possibly not the
 *  one it names), exactly as `$apply` populates by `(type, coding)`. `forward` gives a named concept's own set (for
 *  the bare-fact degenerate default). `underivable` is set when a local concept's set could not be derived (missing
 *  `canonicalBase`) — a local fact then fails the run LOUD rather than fabricating a member/non-member verdict. */
interface LocalMembershipIndex {
  forward: Map<Id, LocalConceptMember>;
  /**
   * ⭐⭐ #189 — per-concept INLINE ANSWER OPTIONS, so a CEL fact may write a BARE option code and have its
   * system resolved from the concept's own answer CodeSystem.
   *
   * ⚠ Built here rather than at the fact site because this is where the local-domain context already lives.
   * Without it the CRE would need the minted system typed by hand in the `.cel`, and a typo would silently
   * make the value a NON-MEMBER — a confident deny in the lane whose job is catching confident denies.
   */
  answerSets: Map<Id, { system: string; codes: ReadonlySet<string> }>;
  reverse: Map<string, Id>;
  /** `(fhirType, system, code)` keys claimed by ≥2 DISTINCT concepts. `concepts` is built from the whole registry
   *  (broader than the emitted closure `emit-duplicate-local-code` guards), so an unrelated same-domain/type/code
   *  concept could otherwise silently steal a reverse entry. A fact resolving to a collided key fails the run LOUD
   *  rather than last-writer-wins. */
  collisions: Set<string>;
  /** Whether the graph is a real PROJECT (`projectRoot` set) — an emit/`$apply` lane exists, so an underivable
   *  local set is a MISCONFIGURATION (run error). An inline/projectless graph has no emit lane to diverge from, so
   *  membership can't be computed and the CRE falls back to name-based presence (pre-Piece-2 behavior). */
  hasProject: boolean;
}

interface ConceptEval {
  sat: Tri;
  composition?: CompositionTrace;
  /** REFACTOR:grounded (#320): preserve the selected opaque resource and its attribution. */
  publicationCandidate?: PublicationCandidate<Record<string, unknown>>;
  publicationResult?:
    | { state: "missing" }
    | { state: "selected"; candidate: PublicationCandidate<Record<string, unknown>> }
    | { state: "failed"; code: string; message: string };
}

interface PublicationEvaluationFailure {
  code: string;
  message: string;
}

/**
 * One record contributed to a concept's collection by ONE arm.
 *
 * Per the operator's model: `code is` ADDS its records (`local`); each `source representation`'s projection
 * ADDS a candidate per retrieved record (`source`). `definition is` is not an arm — it WORKS ON what these
 * two put here.
 */
/** A CEL fact's `value is`, as a candidate needs it. */
interface FactValue {
  boolValue?: boolean;
  /** ⭐ #189 gap 3 — a CODED `value is`, parsed by the SHARED `parseCheckedCanonicalToken` (the same one the
   *  CEL FHIR writer uses to build `valueCodeableConcept`), so the two lanes cannot disagree about what a
   *  coded answer says. Absent for a non-coded or malformed value. */
  codedValue?: { system: string; code: string };
  /** ⭐ The fact's `date is`. ⚠ Until now the CRE read a fact date NOWHERE — `date is` reached only the FHIR
   *  writer — so there was nothing to order candidates by and disagreement could only be refused. */
  date?: string;
}

export interface OwnCandidate {
  arm: "local" | "source";
  /** The CEL fact that supplied it. */
  fact: string;
  /** The fact's `value is` when it is a boolean; absent for a bare fact or a non-boolean value. */
  boolValue?: boolean;
  /** ⭐ #189 gap 3 — the candidate's CODED datum: a local fact's coded `value is`, or a SOURCE fact's own
   *  code (a ServiceRequest's `code is` IS the service code, which is exactly what gap 1's constructed
   *  candidate carries as its VALUE — so both lanes read the same datum by construction). */
  codedValue?: { system: string; code: string };
  /** ⭐ #189 gap 3 — the candidate's claim date, for newest-wins selection. */
  date?: string;
  /**
   * For a SOURCE candidate: the matched pattern of the posrep's `value projection is`, or `undefined` when
   * that posrep has none. It decides what the candidate's boolean IS — see `candidateValue`.
   */
  projection?: string;
}

interface Ctx {
  publicationProgram?: PublicationProgram;
  publicationResources: readonly EmittedResource[];
  publicationFacts: ReadonlyMap<string, string>;
  publicationSubjectReference: string;
  /** Concepts directly satisfied by a case fact (`defined by`). */
  directFacts: Set<Id>;
  factsByConcept: Map<Id, string[]>;
  /** #189 Piece 3 (Option C, disc 512) — the ids of VALUE-READING boolean concepts (member-existence interfaces): the
   *  ones whose emitted CQL own-arm reads `.value as FHIR.boolean` rather than presence. For these, `evalConcept`
   *  reads the retained own boolean value instead of `directFacts` presence, so the CRE matches `$apply`. */
  valueReadingIds: Set<Id>;
  /** #189 null/pause — concepts that nothing can compute, so an absent answer record is UNKNOWN, not false. */
  pureQuestionIds: Set<Id>;
  /** #189 Piece 3 (Option C) — the BOOLEAN own values a value-reading concept was populated with (a fact carrying a
   *  boolean `value is`, code-driven onto whichever concept it is a member of). `evalConcept` reads the value: 0 → false
   *  (no own record), all-agree → that value; CONFLICTING true+false → refuse loud (the collision posture — the
   *  newest-wins pick would need the emitted date+id sort the CRE deliberately does not replicate). */
  ownBoolValues: Map<Id, boolean[]>;
  /**
   * ⭐ #189 P2 — every record a CEL fact contributed to a concept's collection, WITH THE ARM THAT PUT IT THERE.
   *
   * ⚠⚠ ARM PROVENANCE IS NOT COSMETIC. `populate` was arm-BLIND, so a `source representation` fact's boolean
   * `value is` landed in `ownBoolValues` indistinguishably from the concept's OWN answer. That is inert only
   * because `isMemberExistenceInterface` excludes rep-carrying concepts for exactly this reason
   * (`recencyValueConcept.ts:104-109`) — so no value-reading concept has a source arm TODAY. The canonical
   * `Obese` carries a Condition posrep, so the defect ACTIVATES the moment the value-reading classification
   * widens to pipeline concepts. Recorded now, while it is provably unreachable, rather than after.
   *
   * ⚠ A candidate's BOOLEAN is not uniformly its fact's `value is` — a source candidate is a PROJECTION
   * OUTPUT. `candidateValue` is the one place that decides, and `projection` is what lets it.
   *
   * ⚠ There is deliberately NO value-presence field. An earlier draft carried one, described it as
   * load-bearing for the emptiness proof, and never read it — the proof is conservative on candidate COUNT
   * alone (a record without a usable datum blocks the proof and refuses, rather than fabricating a
   * candidate). A field nothing reads cannot report its own falsehood; this comment is the honest version.
   */
  candidates: Map<Id, readonly OwnCandidate[]>;
  /** All concept definitions in the closure, by id, with their owning library. */
  concepts: Map<Id, ConceptEntry>;
  // NOTE: the covered-library identity + file moved off Ctx in the #172 frame migration — the library is now `rootLib`
  // and the per-node file is `frame.currentFilePath` (the root file for same-lib; the sub's file once todo-2 recurses).
  /** Per-case memo of concept satisfaction (composition can re-reference). */
  cache: Map<Id, ConceptEval>;
  /** Concepts currently on the evaluation stack — cycle guard. */
  stack: Set<Id>;
  /** Count of cycle-breaks; a node whose subtree hit a cycle is not memoized. */
  cycleHits: number;
  /** Operand ids already reported unresolvable (dedup diagnostics). */
  reportedUnresolved: Set<Id>;
  produced: ProducedRec[];
  trace: TraceNode[];
  diagnostics: string[];
  /** Shared `(callerLib, ref) → ResolvedDecision` resolver over the WHOLE graph (#172) — the ONLY decision lookup the
   *  recursion uses. A same-library lookup returns the identical Decision the old flat covered-library map did; a
   *  cross-library qualified ref resolves its sub in its own library. (The root-decision lookup in `runCase` reads its
   *  own `decisions` map BEFORE Ctx is built, so no per-library decision map is stored on Ctx.) */
  resolveDecision: (callerLib: string, ref: ReferenceName) => ResolvedDecision | undefined;
  /** ⭐ #189 gap 3 — the MECHANICAL member set of a named terminology, closed over the graph exactly as
   *  `resolveDecision` is. `undefined` ⇒ unresolved, which the caller must REFUSE rather than read as
   *  an empty set (empty would mean "not a member" — a determinate wrong answer). */
  terminologyMembers: (lib: string, name: string) => readonly { system: string; code: string }[] | undefined;
  /** ⭐ #189 — a concept's inline answer-option system + codes, keyed by concept id. Same descriptor the FHIR
   *  lane emits from, so the two lanes cannot disagree about who is a member of `qualifying`. */
  answerSets: Map<Id, { system: string; codes: ReadonlySet<string> }>;
  /** #236 — per-library criterion tables (`name → Criterion`), for reference-and-evaluate: a
   *  criterion guard resolves its body HERE instead of being inline-expanded up front. Keyed by library. */
  criterionTables: Map<string, CriterionTable>;
  /** Per-case memo of criterion satisfaction — a criterion referenced N times (or a doubling DAG)
   *  evaluates ONCE. Keyed `idOf(lib,name)`; mirrors `cache`. Carries the body sub-trace for
   *  first-occurrence tracing; not memoized through a cycle-break (mirrors `cache`). */
  // REFACTOR:grounded (#189 null/pause) — `sat` is `Tri`, NOT `boolean`. Storing `inner.sat === true`
  // here destroyed UNKNOWN after the FIRST reference: a criterion evaluating null returned null once and
  // cached `false`, so a second reference (or a `not <criterion>`) silently went two-valued (panel
  // finding, disc 517). A memo must be transparent — it may not change the value it replays.
  criterionCache: Map<Id, { sat: Tri; facts: string[]; body: BranchConditionTrace }>;
  /** Criteria currently on the evaluation stack — cycle guard (mirrors `stack`). */
  criterionStack: Set<Id>;
  /** `(lib,name)` of criteria already emitted with a FULL body sub-trace this case; later
   *  occurrences trace as references (`op:"criterion", reference:true`) to keep the trace linear. */
  tracedCriteria: Set<Id>;
  /** The ROOT (covered) library — the frame `currentLib` is seeded with it; a cross-library sub pushes its OWN lib. */
  rootLib: string;
  /** `(lib,name)` keys on the current delegation path (cycle guard; seeded with `idOf(rootLib, rootDecisionName)`).
   *  Re-keyed from bare names to `(lib,name)` so a future cross-library `A.Sub`/`B.Sub` can't false-collide (#172). */
  delegationStack: Set<Id>;
  /** Set when delegation hit a cycle — the case run reports `status: "error"` (no pass/fail) rather than a partial result. */
  runtimeError: boolean;
  /** Reached legacy evaluations that discarded unknown evidence; independent of the CEL oracle. */
  discardedUnknown: boolean;
  /** Typed publication failures invalidate the evaluated condition, not independent `all:`
   * siblings. The case still reports error. Legacy runtimeError remains case-global. */
  publicationErrors: PublicationEvaluationFailure[];
}

/**
 * Per-frame recursion state threaded through walkBranches/executeBody/emitAction (like `delegationStack`), NOT stored on
 * the shared `Ctx` singleton — so a cross-library sub-frame carries its OWN lib/file without leaking across sibling
 * branches. The root frame is `{ currentLib: rootLib, currentFilePath: <covered file> }`. A same-library recursion keeps
 * the frame unchanged (`resolved.lib === currentLib`) — the BARE same-lib form is byte-identical to pre-#172; a
 * SELF-qualified same-lib target (`"SQ"."Sub"` inside SQ) now RESOLVES + evaluates too (a deliberate new evaluation, was
 * deferred pre-#172), still in the same frame. A cross-library `use decision` pushes `{ currentLib: resolved.lib,
 * currentFilePath: resolved.filePath }` for the sub's body (#172).
 */
interface Frame {
  /** Resolves a BARE `when`/guard concept ref (run.ts conceptSatisfied) — the current sub-decision's library. */
  currentLib: string;
  /** The file a node's source span points at (spanOf) — the current sub-decision's file. */
  currentFilePath: string;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// #189 P2 — THE PIPELINE FAMILY: a one-sided emptiness PROOF, and the collection algebra it enables
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
//
// REFACTOR:grounded — re-derived from the operator's collection model and the charter, not from the code it
// replaces. The code it replaces keyed on an AST NODE KIND (`def.type === "ReductionDefinition"`), so the
// narrative spelling of the same operation walked past the refusal and presence-evaluated: MEASURED at 13
// in-tree concepts, 9 of them the goal's own fixtures. Do not read the node-kind arms below as intent.
//
// ⚠⚠ WHY THIS IS NOT A RECORD-EXISTENCE EVALUATOR, AND MUST NOT BECOME ONE. A general
// "does this concept's pipeline produce at least one record" query cannot be answered from presence:
// `BodyMassIndex(W, H)` needs usable DATA, not records named W and H; a filter can take a non-empty space
// and return empty; a source projection's candidate is its projection OUTPUT, not the retrieved resource.
// Answering it anyway would be the partial/completeness model the CRE is forbidden to grow
// (`feedback_cre-is-mechanical-not-runtime`).
//
// ⭐ THE IN-BOUNDS QUESTION IS ONE-SIDED: *can we PROVE this contributor cannot be invoked at all?* Zero
// invocations contribute NOTHING (charter §3), so a contributor proved empty may be skipped and one that
// cannot be proved empty is REFUSED. It never claims a record exists and never claims completeness — the
// only new answer is "provably nothing", read off the case's own facts.
//
// ⚠ AND IT NEEDS VALUE-PRESENCE, NOT RECORD-PRESENCE. A Weight record carrying no `value is` yields no BMI
// candidate under `$apply` (the CQL computes from values; null in, no candidate out). Proving emptiness from
// record presence alone would fabricate a candidate that `$apply` never produces — the same family of
// fabrication this whole slice removes.

/** Whether a concept can be PROVED to contribute no candidate at all in this case. One-sided: `false` means
 *  "not proved", never "contributes something". */
function provablyContributesNothing(id: Id, ctx: Ctx, seen: Set<Id>): boolean {
  // ⚠ ITS OWN CYCLE GUARD. `ctx.stack` belongs to `evalConcept`'s recursion; sharing it would make an
  // emptiness walk look like a determination cycle and vice versa. A cycle here cannot be proved empty.
  if (seen.has(id)) return false;
  seen.add(id);
  try {
    // Any fact put a record in the collection — local or source arm alike.
    if ((ctx.candidates.get(id)?.length ?? 0) > 0) return false;

    const entry = ctx.concepts.get(id);
    if (entry === undefined) return false; // unknown concept: prove nothing

    const program = resolveConceptPipeline(entry.node);
    // No derivation, or one this resolver does not model: the arms are all that could have filled the
    // collection, and they are empty.
    if (program.kind === "no-program") return true;
    // ⚠ `not-a-pipeline-program` is a `defined as` composition or a `coded from` — a real derivation with its
    // own machinery. NOT provable here, and calling it empty would be exactly the "different and wrong claim"
    // its own resolver arm exists to avoid.
    if (program.kind !== "resolved") return false;

    // A stage can only ADD to an empty collection by CONSTRUCTING a candidate — i.e. a producer, and only if
    // its named operands yield data. Selections and filters over an empty space stay empty.
    return program.stages.every((stage) => stageAddsNothing(stage, entry.lib, ctx, seen));
  } finally {
    seen.delete(id);
  }
}

/** Whether one resolved stage can be proved to add nothing to an EMPTY collection. */
function stageAddsNothing(stage: ResolvedStage, lib: string, ctx: Ctx, seen: Set<Id>): boolean {
  // ⚠⚠ A FLOW-READING `direct` PUBLISHES AN ESTABLISHED VALUE OVER AN EMPTY SPACE — it does NOT contribute
  // nothing. `exists this` over no records is a closed-world `false` (charter: a records-read answers from an
  // empty set), and it takes zero canonical args, so folding it in with the operand-readers below made
  // `args.every(...)` VACUOUSLY TRUE and the proof ASSERTED emptiness of a non-empty publication. That is the
  // one way this walk stopped being one-sided, and both review arms found it independently.
  if (stage.reads !== "operands" && (stage.effect === "direct" || stage.effect === "producer")) return false;

  switch (stage.effect) {
    case "selection":
    case "filter":
      // Nothing to select from, nothing to narrow — but a NAMED operand widens the space being reduced
      // (charter: a reduction over a named set reduces `this` ∪ that set), so it must be proved empty too.
      return namedOperandsEmpty(stage, lib, ctx, seen);
    case "producer":
    case "direct":
      // Constructs from NAMED operands. It adds nothing exactly when every operand it reads provably
      // contributes nothing — an operand with no candidate has no datum to compute from.
      return namedOperandsEmpty(stage, lib, ctx, seen);
  }
}

/**
 * Whether every operand a stage names provably contributes nothing.
 *
 * ⚠ AN ARGUMENT THAT IS NOT A PLAIN LITERAL IS NOT PROVED EMPTY. A `NestedPatternArg` carries a whole
 * computation (and usually a concept reference inside it); treating anything non-`ConceptRefArg` as "adds no
 * records" would let the walk report emptiness without ever looking at it.
 */
function namedOperandsEmpty(stage: ResolvedStage, lib: string, ctx: Ctx, seen: Set<Id>): boolean {
  return stage.call.args.every((arg) => {
    switch (arg.type) {
      case "ConceptRefArg":
        return provablyContributesNothing(idOf(arg.library ?? lib, arg.value), ctx, seen);
      case "QuantityArg":
      case "EnumArg":
      // ⭐ A TERMINOLOGY operand is a literal SET, not a record source — it contributes no records of its own,
      // exactly as a quantity does. ⚠ Leaving it to the `default` arm below would answer "not proved empty",
      // which is conservative in the WRONG direction here: it would make the CRE refuse a membership stage
      // whose only non-concept operand is a value set.
      case "TerminologyRefArg":
        return true; // a literal contributes no records of its own
      default:
        return false; // nested / disjunction / conjunction — not inspected, so not proved
    }
  });
}

/**
 * ⭐ THE COLLECTION ALGEBRA for a concept whose `definition is` resolves to a pipeline program.
 *
 * Returns the determination, or `undefined` when this concept is not in the family (the caller keeps its
 * existing arms). ⚠ It may set `ctx.runtimeError` — a refusal is a verdict about OUR ability, not the case's.
 *
 * ⭐ THE MODEL IT IMPLEMENTS (operator): two arms ADD to a collection; `definition is` WORKS ON it. So the
 * determination is read off the COLLECTION, not OR'd across arms:
 *
 *   · zero candidates, nothing incomputable  -> `null`  (UNKNOWN — nothing established it; the gate pauses)
 *   · candidates that all AGREE              -> that value (order-independent, so recency cannot change it)
 *   · candidates that DISAGREE               -> refuse (newest-wins needs the emitted date+id sort)
 *   · any contributor we cannot prove empty  -> refuse (it might contribute, and we cannot say what)
 *
 * ⚠ The agree/disagree posture is not new: `evalConcept`'s value-reading arm already refuses a decisive
 * conflict for exactly this reason. This generalizes it from one arm to the whole collection.
 */
function pipelineVerdict(entry: ConceptEntry, ctx: Ctx): Tri | undefined {
  const id = idOf(entry.lib, entry.node.name);
  const program = resolveConceptPipeline(entry.node);

  // ⚠ SCOPE FIRST, and the order matters. Only a BOOLEAN determination is a guard question — a `when` operand
  // must be boolean — so a Quantity/CodeableConcept concept with a program (`Height`, `BMI`) is an OPERAND,
  // read through `provablyContributesNothing` and never asked for a truth value. Refusing THOSE would turn
  // our own catalog gaps into failed runs for concepts nothing was going to ask a verdict of.
  if (!(entry.node.valueTypes?.length === 1 && entry.node.valueTypes[0] === "boolean")) return undefined;

  if (program.kind === "invalid") {
    // ⚠ REASON-SPECIFIC, never one behaviour. `invalid` mixes author errors (which the validator should have
    // rejected upstream) with OUR build debt — `stage-ungrounded` (a pattern whose stage behaviour is not
    // verified), `reduction-unrepresentable` (`count`'s threshold has no canonical arg yet),
    // `shape-required-to-classify`. None may presence-evaluate, because presence-evaluating a program we
    // cannot read IS fabrication — but they are different messages, and collapsing them would report our gap
    // as the author's mistake.
    // Carry the resolver's own DETAIL, not just the diagnostic kind — for `count` it names the construct and
    // the missing piece, which is what a reader needs and what a kind alone throws away.
    const why = program.diagnostics
      .map((d) => ("detail" in d ? `${d.kind}: ${d.detail}` : d.kind))
      .join("; ");
    ctx.runtimeError = true;
    ctx.diagnostics.push(
      `\`definition is\` reduction concept ${labelOf(entry.lib, entry.node.name)} is not evaluated by ` +
        `run_decision — its program cannot be classified (${why}), so it would need record-level evaluation ` +
        `the engine's presence model does not provide; run marked error rather than fabricate a ` +
        `presence-based answer.`,
    );
    return false;
  }
  if (program.kind !== "resolved") return undefined; // no program, or a `defined as`/`coded from` family

  // ── A LONE CONCEPT-LEVEL EXISTENCE REDUCTION stays exactly where it was. ─────────────────────────────
  //
  // Over `this` it is SOUND as presence: the concept's own records ARE the space it reduces, and absence is
  // a closed-world established false (charter — a records-read answers from an empty set).
  //
  // ⚠ Over a NAMED target it is NOT this family's business either, and routing it here was a REGRESSION I
  // caught in the suite: the collection algebra reads THIS concept's candidates, while `exists "X"` asks
  // about X's — so a case asserting X's records refused instead of answering. It keeps the existing
  // `refTrace` arm.
  //
  // ⚠⚠ THAT ARM IS KNOWN-UNSOUND IN A DIFFERENT WAY, and this slice does NOT fix it: `refTrace` yields the
  // target's DETERMINATION, not "has at least one record", so a RecordSet target holding a computed
  // candidate with no direct fact can read false. Named-existence soundness is its own change with its own
  // blast radius; it is NOT made worse here, and it is recorded rather than silently inherited.
  const stages = program.stages;
  if (stages.length === 1 && stages[0].call.pattern === "ExistsOverSpace") return undefined;

  // ── Every contributor we cannot compute must be PROVED to contribute nothing. ────────────────────────
  //
  // ⚠⚠ EVERY STAGE, INCLUDING A SELECTION. `most recent "X"` reduces `this` ∪ X (charter §3), and an earlier
  // version checked named operands on producers ONLY — so a selection's named space was DROPPED and the
  // verdict came from the own arm alone. On validator-clean input that is a silent wrong answer: X populated
  // with the own arm empty read as a pause, and an own `true` beat a newer X record of `false`. The resolver
  // already carries the fact (`reads: "flow-and-operands"` exists so a consumer cannot drop an arm); nothing
  // was reading it.
  for (const stage of stages) {
    // ⭐⭐ #189 gap 3 — MEMBERSHIP IS EVALUATED, not refused. It must be intercepted BEFORE the named-operand
    // guard below: its subject is deliberately NOT provably empty (that is the whole point — there is a datum
    // to read), so the generic arm would refuse every membership case before reaching it.
    if (stage.call.pattern === "Membership") {
      const verdict = evaluateMembership(stage, entry, ctx);
      if (verdict !== "not-evaluated") return verdict;
      // `not-evaluated` ⇒ fall through to the generic refusal, which names the stage. A cell this evaluator
      // does not cover must still REFUSE rather than reach the own-collection read below — the predicate is
      // ephemeral, so its own candidate list is always empty and the `[] → null` arm would silently turn an
      // unevaluated membership into a pause.
    }
    const seen = new Set<Id>();
    if (!namedOperandsEmpty(stage, entry.lib, ctx, seen)) {
      return refusePipeline(
        entry,
        ctx,
        `stage \`${stage.call.pattern}\` reduces or computes over a NAMED set this engine does not evaluate, ` +
          `and that set is not provably absent in this case`,
      );
    }
    if (stage.effect === "filter" && (ctx.candidates.get(id)?.length ?? 0) > 0) {
      // A filter reads record FIELDS (dates, statuses) of a space that is NOT empty here.
      return refusePipeline(entry, ctx, `a \`${stage.call.pattern}\` filter stage needs record fields`);
    }
  }

  // ── The collection: what the two arms actually put there. ────────────────────────────────────────────
  const cands = ctx.candidates.get(id) ?? [];
  if (cands.length === 0) {
    // ⭐ NOTHING ESTABLISHED IT. Not `false` — absence is never established, and a Deny requires an
    // ESTABLISHED false. This is the row the whole slice exists for: the gate pauses and asks.
    return null;
  }

  const values: (boolean | undefined | "unknown-projection")[] = cands.map((c) => candidateValue(c));
  if (values.includes("unknown-projection")) {
    return refusePipeline(
      entry,
      ctx,
      `a source candidate comes from a posrep whose \`value projection is\` this engine does not interpret`,
    );
  }
  const known = values.filter((v): v is boolean => typeof v === "boolean");
  if (known.length === 0) {
    // ⭐ EVERY candidate is valueless, so WHICHEVER is newest the read is null — order-independent, no sort
    // needed. The charter states the runtime contract directly: "a valueless value-reading record reads NULL
    // in both lanes — NOT false … and both PAUSE." Refusing here would diverge from `$apply` on a verdict we
    // can actually establish. ⚠ A MIX still refuses: there the newest genuinely decides.
    return null;
  }
  if (known.length !== values.length) {
    return refusePipeline(
      entry,
      ctx,
      `some candidate records carry a boolean \`value is\` and some do not, so the newest record decides and ` +
        `that needs the emitted date+id sort`,
    );
  }
  const first = known[0];
  if (known.every((v) => v === first)) return first; // order-independent: recency cannot change it
  return refusePipeline(
    entry,
    ctx,
    `candidate records disagree (${known.join(", ")}) and picking the newest needs the emitted date+id sort`,
  );
}

/**
 * ⭐ WHAT ONE CANDIDATE'S BOOLEAN ACTUALLY IS — and it is NOT uniformly the fact's `value is`.
 *
 *   · a LOCAL candidate is an answer on the concept's own code: its `value is` IS the value.
 *   · a SOURCE candidate is a PROJECTION OUTPUT. `exists this` yields `true` for every record it is invoked
 *     on. (`matches this` was the sibling projection and is RETIRED — membership moved to a concept-level
 *     predicate, which the CRE evaluates separately.)
 *   · a SOURCE candidate from a posrep with NO projection is read as the concept's VALUE (charter §3), so its
 *     `value is` is the value — the case an earlier version got wrong by assuming `true` for every source
 *     member.
 *   · any other projection is one this engine has not been taught; say so rather than guess.
 */
function candidateValue(c: OwnCandidate): boolean | undefined | "unknown-projection" {
  if (c.arm === "local" || c.projection === undefined) return c.boolValue;
  if (c.projection === "Exists") return true;
  return "unknown-projection";
}

/**
 * ⭐⭐ #189 gap 3 — EVALUATE `"<subject>" in "<terminology>"` in the CRE.
 *
 * Returns a `Tri` when it can decide, or `"not-evaluated"` to fall through to the generic refusal. It must
 * never return a verdict it did not compute: this lane's whole job is to check the other one.
 *
 * ⭐ NEWEST WINS, BY DATE (operator, 2026-09-02). The CRE previously read a fact date NOWHERE and could only
 * accept order-independent agreement or refuse — which left the goal's "request covered but newer answer says
 * no" row permanently owed. A strictly-ordered date comparison is as MECHANICAL as the membership check
 * itself (no runtime, no resolution), so it is in bounds; the emitted `id` tie-break is NOT replicated, so an
 * exact date TIE between disagreeing candidates still refuses rather than picking by insertion order.
 *
 * ⚠⚠ THE WINNER'S DATUM DECIDES, not "is there a coded datum anywhere". An older coded candidate beside a
 * newer valueless one is UNKNOWN — because `$apply` selects the newest record and reads its null value. A
 * naive "use whatever code we have" would approve where the emitted lane pauses.
 *
 * ⚠ Membership is MECHANICAL — against the EMITTED member set only, never a real value-set expansion. A pure
 * reference VS contributes its single stub coding and nothing else. If a case's datum is a real code and the
 * comparand is a reference VS, "not a member" is the honest answer, not "go look it up".
 */
function evaluateMembership(stage: ResolvedStage, entry: ConceptEntry, ctx: Ctx): Tri | "not-evaluated" {
  const args = stage.call.args;
  const subjectArg = args.find((a) => a.type === "ConceptRefArg");
  const setArg = args.find((a) => a.type === "TerminologyRefArg");
  // ⭐⭐ #189 — an INLINE-OPTIONS subset comparand (`"X" in qualifying`).
  const subsetArg = args.find((a) => a.type === "SubsetRefArg");
  if (!subjectArg || (!setArg && !subsetArg)) return "not-evaluated";
  // ⚠ Cross-library operands are not resolved here — a same-named terminology in another library would bind
  // wrongly. Refuse by falling through rather than guessing which one the lowering picked.
  if (subjectArg.library !== undefined || setArg?.library !== undefined) return "not-evaluated";

  let members: readonly { system: string; code: string }[] | undefined;
  if (subsetArg) {
    // ⚠ THE SUBSET RESOLVES AGAINST THE SUBJECT, never a global table — two different concepts may each
    // declare a `qualifying` subset and they are DIFFERENT sets. The member set is the subject's options
    // marked `qualifying`, read from the SAME descriptor the FHIR lane emits its ValueSet from, so the two
    // lanes cannot disagree about who is a member.
    //
    // ⚠ `qualifying === true` ONLY. An UNMARKED option is not a member: absence is not "no". The validator
    // requires a marker exactly when a concept is predicated on, so an unmarked option reaching here means
    // validation was skipped — and counting it either way would manufacture a verdict nobody authored.
    const subjEntry = ctx.concepts.get(idOf(entry.lib, subjectArg.value));
    const opts = subjEntry?.node.valueFrom?.kind === "inline" ? subjEntry.node.valueFrom.options : undefined;
    const answerSet = ctx.answerSets.get(idOf(entry.lib, subjectArg.value));
    if (opts === undefined || answerSet === undefined) return "not-evaluated";
    members = opts
      .filter((o) => o.qualifying === true)
      .map((o) => ({ system: answerSet.system, code: o.code }));
  } else {
    members = ctx.terminologyMembers(entry.lib, setArg!.value);
  }
  if (members === undefined) return "not-evaluated"; // unresolved comparand — the validator already says so

  const subjectId = idOf(entry.lib, subjectArg.value);
  const cands = ctx.candidates.get(subjectId) ?? [];
  if (cands.length === 0) return null; // nothing asserted, nothing retrieved → unknown → PAUSE

  // Newest wins. ⚠ An undated candidate cannot be ordered against a dated one, so a mix refuses rather than
  // treating "no date" as oldest — a silent assumption that would decide real cases.
  if (cands.some((c) => c.date === undefined) && cands.length > 1) {
    return refusePipeline(
      entry,
      ctx,
      `subject "${subjectArg.value}" has candidates with and without dates, so newest-wins cannot be ordered`,
    );
  }
  // REFACTOR:grounded (#320, review 556): compare instants by their actual time, preserving authored
  // offsets and precision in the emitted data. A missing timezone/calendar field is never invented.
  // One candidate needs no ordering; uncertain or unsupported comparisons refuse without a verdict.
  let newest = cands[0];
  let tied = [newest];
  for (const candidate of cands.slice(1)) {
    const order = compareFhirTemporal(candidate.date!, newest.date!);
    if (order === "after") {
      newest = candidate;
      tied = [candidate];
    } else if (order === "equal") {
      tied.push(candidate);
    } else if (order !== "before") {
      return refusePipeline(
        entry,
        ctx,
        `subject "${subjectArg.value}" needs temporal comparison of "${candidate.date}" and "${newest.date}" that is ${order} for this evaluator; no winner was selected. Supply comparable known dates or supported full timestamps with explicit time zones; missing precision is not inferred`,
      );
    }
  }
  if (tied.length > 1) {
    const distinct = new Set(
      tied.map((c) => (c.codedValue ? `${c.codedValue.system}|${c.codedValue.code}` : "")),
    );
    if (distinct.size > 1) {
      // ⚠ Exactly the cell the emitted `id` sort would decide and we deliberately do not replicate.
      return refusePipeline(
        entry,
        ctx,
        `subject "${subjectArg.value}" has disagreeing candidates on the same date, and the tie-break is the emitted record id`,
      );
    }
  }

  const datum = newest.codedValue;
  if (datum === undefined) return null; // the winner carries no code to test → unknown → PAUSE

  const hit = members.some((m) => m.system === datum.system && m.code === datum.code);
  // ⭐ EVIDENCE. The predicate is EPHEMERAL, so it has no facts of its own — the guard trace reads
  // `factsByConcept` for the PREDICATE's id and would show nothing. Attribute the winning SUBJECT fact, so a
  // determinate verdict carries the record that produced it (the goal pins exactly this on its wrong-code row).
  const id = idOf(entry.lib, entry.node.name);
  const facts = ctx.factsByConcept.get(id) ?? [];
  if (!facts.includes(newest.fact)) ctx.factsByConcept.set(id, [...facts, newest.fact]);
  return hit;
}

function refusePipeline(entry: ConceptEntry, ctx: Ctx, why: string): Tri {
  ctx.runtimeError = true;
  ctx.diagnostics.push(
    `concept ${labelOf(entry.lib, entry.node.name)} is not evaluated by run_decision — ${why}; run marked ` +
      `error rather than fabricate a presence-based answer.`,
  );
  return false;
}

/**
 * Satisfaction of a concept by id: directly asserted (a fact `defined by` it) OR
 * its `defined as` composition evaluates true. Memoized per case; cycle-guarded
 * (the validator forbids cyclic concept refs, but guard defensively so an
 * un-revalidated input can't infinite-loop — and don't memoize a result computed
 * through a cycle-break, so it can't poison a node satisfiable on another path).
 */
/**
 * #189 null/pause — the CRE's THIRD VALUE.
 *
 * `null` means UNKNOWN: nothing has established the determination and nothing can compute it, so the gate
 * must PAUSE and ask rather than deny. It is NOT an epistemic hedge — unansweredness is read straight off
 * the case file, deterministically. The CRE gains a third VALUE, not a third BEHAVIOR: no partial state, no
 * completeness claim, nothing asserted about the outside world (`feedback_cre-is-mechanical-not-runtime`).
 *
 * STRONG KLEENE, byte-matching what CQL does natively — which is how the two lanes agree by construction
 * rather than by hope. `null or true = true` and `null and false = false` are the DON'T-OVER-ASK half: the
 * arm's outcome is already settled, so the unknown is not decisive and must never be asked about.
 */
type Tri = boolean | null;

function reportPublicationFailure(ctx: Ctx, failure: PublicationEvaluationFailure): void {
  // Every replay must mark its current branch failed, even when the human diagnostic was
  // already rendered. Deduplicating this event stream would let cached failures select leaves.
  ctx.publicationErrors.push({ code: failure.code, message: failure.message });
  const rendered = `${failure.code}: ${failure.message}`;
  if (!ctx.diagnostics.includes(rendered)) ctx.diagnostics.push(rendered);
}

// REFACTOR:grounded (#320, review 560): selection precedes value reading and retains actual CEL FHIR
// resources. A newer unknown displaces an older answer, and a selector error cannot reach a leaf.
function evaluatePublication(entry: ConceptEntry, ctx: Ctx): ConceptEval {
  const fail = (code: string, message: string): ConceptEval => {
    // Preserve the originating publication through cache/producer propagation. Two concepts
    // can fail with the same generic adapter message and must remain separately actionable.
    const locatedMessage = `${labelOf(entry.lib, entry.node.name)}: ${message}`;
    reportPublicationFailure(ctx, { code, message: locatedMessage });
    return { sat: null, publicationResult: { state: "failed", code, message: locatedMessage } };
  };
  const lookup = ctx.publicationProgram?.lookup(entry.filePath, entry.node.name, entry.node.location);
  if (lookup?.kind !== "publication") {
    return lookup?.kind === "error" ? fail(lookup.diagnostic.kind ?? "publication-invalid", lookup.diagnostic.message)
      : fail("publication-unsupported-scope", "No prepared publication authority is available.");
  }
  const descriptor = lookup.descriptor;
  const candidates: PublicationCandidate<Record<string, unknown>>[] = [];
  const factsByCandidate = new Map<string, string[]>();
  if (hasLocalPublicationContribution(descriptor)) for (const emitted of ctx.publicationResources) {
    const resource = emitted.body;
    if (resource.resourceType !== descriptor.resourceType) continue;
    const coding = (resource.code as { coding?: { system?: string; code?: string }[] } | undefined)?.coding;
    if (!coding?.some((c) => c.system === descriptor.localCode.system && c.code === descriptor.localCode.code)) continue;
    const adapted = adaptPublicationCandidate(descriptor, resource);
    if (adapted.kind === "error") {
      return fail(adapted.code, adapted.message);
    }
    candidates.push(adapted.candidate);
    const fact = ctx.publicationFacts.get(String(resource.id));
    factsByCandidate.set(adapted.candidate.key, fact === undefined ? [] : [fact]);
  }
  // REFACTOR:grounded (#320, review 564): evaluate actual CEL-emitted source resources.
  for (const source of descriptor.sources ?? []) for (const emitted of ctx.publicationResources) {
    const resource = emitted.body;
    if (!matchesPublicationSource(source, resource)) continue;
    // Match the CEL/pinned repository compartment before projection, including unresolved subjects.
    if (!matchesCelPublicationPatient(resource, ctx.publicationSubjectReference)) continue;
    const adapted = adaptServiceRequestPublicationCandidate(descriptor, source, resource, ctx.publicationSubjectReference);
    if (adapted.kind === "error") return fail(adapted.code, adapted.message);
    candidates.push(adapted.candidate);
    const fact = ctx.publicationFacts.get(String(resource.id));
    factsByCandidate.set(adapted.candidate.key, fact === undefined ? [] : [fact]);
  }
  if (descriptor.producer !== undefined) {
    const operandId = idOf(descriptor.producer.operand.libraryName, descriptor.producer.operand.conceptName);
    const operandEntry = ctx.concepts.get(operandId);
    if (operandEntry === undefined || operandEntry.filePath !== entry.filePath)
      return fail("publication-unsupported-scope", "CRE foreign publication producers are not implemented.");
    const operand = evalConcept(operandId, ctx).publicationResult;
    if (operand === undefined) return fail("publication-missing-envelope", "Membership operand has no publication result.");
    if (operand.state === "failed") return { sat: null, publicationResult: operand };
    const produced = produceMembershipCandidate(descriptor, operand.state === "selected" ? operand.candidate : undefined, ctx.publicationSubjectReference);
    if (produced.kind === "error") return fail(produced.code, produced.message);
    if (produced.kind === "candidate") {
      candidates.push(produced.candidate);
      factsByCandidate.set(produced.candidate.key, ctx.factsByConcept.get(operandId) ?? []);
    }
  }
  const selected = selectPublicationCandidate(candidates, { conceptId: descriptor.conceptId, equalTime: descriptor.selector.equalTime });
  if (selected.state === "failed") {
    return fail(selected.diagnostic.code, JSON.stringify(selected.diagnostic));
  }
  const id = idOf(entry.lib, entry.node.name);
  if (selected.state === "missing") {
    ctx.factsByConcept.set(id, []);
    return { sat: null, publicationResult: selected };
  }
  if (descriptor.valueDomain !== undefined) {
    const interpreted = interpretPublicationCodeableValue(descriptor.valueDomain, selected.candidate.resource);
    if (interpreted.kind === "error") return fail(interpreted.code, interpreted.message);
  }
  ctx.factsByConcept.set(id, factsByCandidate.get(selected.candidate.key) ?? []);
  const value = selected.candidate.resource.valueBoolean;
  return { sat: typeof value === "boolean" ? value : null, publicationCandidate: selected.candidate, publicationResult: selected };
}

const kNot = (a: Tri): Tri => (a === null ? null : !a);
const kAnd = (xs: readonly Tri[]): Tri =>
  xs.some((x) => x === false) ? false : xs.some((x) => x === null) ? null : true;
const kOr = (xs: readonly Tri[]): Tri =>
  xs.some((x) => x === true) ? true : xs.some((x) => x === null) ? null : false;

// REFACTOR:grounded (#320): all dependent definitions share one refusal boundary until result
// typing is integrated. Inspect raw reference nodes, including unmatched narrative operands.
function definitionUsesPublication(node: unknown, lib: string, ctx: Ctx): boolean {
  if (node === null || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((item) => definitionUsesPublication(item, lib, ctx));
  const item = node as Record<string, unknown>;
  const ref = item.type === "NConceptRef" ? item.value : item.ref;
  if (typeof ref === "string" || (ref && typeof ref === "object" && (ref as { type?: string }).type === "QualifiedReference")) {
    const reference = ref as ReferenceName;
    if (ctx.concepts.get(idOf(getRefLibrary(reference) ?? lib, getRefName(reference)))?.node.shapeReduction !== undefined) return true;
  }
  return Object.values(item).some((child) => definitionUsesPublication(child, lib, ctx));
}

function evalConcept(id: Id, ctx: Ctx): ConceptEval {
  const cached = ctx.cache.get(id);
  if (cached) {
    if (cached.publicationResult?.state === "failed") {
      reportPublicationFailure(ctx, cached.publicationResult);
    }
    return cached;
  }
  if (ctx.stack.has(id)) {
    const e = ctx.concepts.get(id);
    ctx.diagnostics.push(
      `composition cycle detected at concept ${e ? labelOf(e.lib, e.node.name) : id} — treated as unsatisfied`,
    );
    ctx.cycleHits++;
    return { sat: false };
  }
  ctx.stack.add(id);
  const cyclesBefore = ctx.cycleHits;
  const entry = ctx.concepts.get(id);
  if (entry?.node.shapeReduction !== undefined) {
    const result = evaluatePublication(entry, ctx);
    ctx.stack.delete(id);
    ctx.cache.set(id, result);
    return result;
  }
  if (entry && definitionUsesPublication(entry.node.definition, entry.lib, ctx)) {
    ctx.stack.delete(id);
    ctx.runtimeError = true;
    ctx.diagnostics.push(`publication-unsupported-context: concept "${entry.node.name}" consumes a selected publication in a dependent definition; shared dependent result typing is not implemented yet.`);
    return { sat: null };
  }
  // `runtimeErrorBefore` is captured at the TOP, before BOTH error-capable arms (the composition/reduction refuse and
  // the value-reading direct-arm conflict refuse below), so an error raised while evaluating THIS node (directly or via
  // a consumed operand) excludes it from memoization. ⚠ It is a monotonic boolean, not a per-eval counter: if a PRIOR
  // sibling eval already set `ctx.runtimeError`, this eval's own refuse is masked (`erroredThisEval` false) and the
  // result can memoize — harmless in the main run (the case is already `error`), a pre-existing limitation for the
  // `truthOf` scratch-cache path (a robust event/counter is a separate follow-up). (disc 513, both arms.)
  const runtimeErrorBefore = ctx.runtimeError;
  let composition: CompositionTrace | undefined;
  let composed: Tri = false;
  /** Set by the pipeline-family arm's guard so the body reads the verdict it already computed. */
  let pipelineEval: Tri | undefined;
  const def = entry?.node.definition;
  if (def && def.type === "DefinedAsDefinition") {
    composition = walkDefinedAs(def.body, entry!.lib, ctx);
    composed = composition.satisfied ?? null;
  } else if (entry !== undefined && (pipelineEval = pipelineVerdict(entry, ctx)) !== undefined) {
    // ⭐⭐ THE PIPELINE FAMILY — keyed on the RESOLVED PROGRAM, not on an AST node kind.
    //
    // ⚠⚠ THE NODE KIND WAS THE BUG. The refusal below used to test `def.type === "ReductionDefinition"`, so
    // the NARRATIVE spelling of the same operation walked past it and presence-evaluated — silently false.
    // MEASURED at 13 in-tree concepts, 9 of them the goal's own fixtures including `policy.crl::Obese`.
    //
    // ⚠ It also does NOT go through `kOr([direct, composed])` below, and that is the point. `kOr` is right for
    // the `defined as exists` family because its emitted CQL literally IS an `or`. This family's emitted
    // target is newest-over-union — a SELECTION over a collection — and OR approximates it in neither
    // direction: an empty own arm would read `false` and Deny (the very defect), while mapping empty to
    // `null` inside `kOr` would swallow an established false from another arm.
    ctx.stack.delete(id);
    // ⚠ ONE CALL. `pipelineVerdict` REFUSES by side effect (it sets `ctx.runtimeError` and pushes a
    // diagnostic), so calling it once to test the arm and again to read the answer would double-report every
    // refusal and, worse, make the arm's guard condition itself mutate the run.
    const pipelineResult: ConceptEval = { sat: pipelineEval! };
    if (!ctx.runtimeError && ctx.cycleHits === cyclesBefore) ctx.cache.set(id, pipelineResult);
    return pipelineResult;
  } else if (def && def.type === "ReductionDefinition") {
    const red = def.reduction;
    if (red.kind === "exists" && red.target.type === "ReductionConceptRef") {
      // #270 Slice 0a-cre (disc 462 code review, both arms) — a NAMED `definition is exists "X"` reduction IS
      // existence of X: identical to `defined as exists ("X")` and to its CQL lowering `exists(<X>)`. Evaluate
      // the TARGET (via `refTrace`), NOT `directFacts.has(self)` — the case asserts X's records, not this
      // derived concept, so a presence answer here is always-false: a silent Deny of every eligible case, the
      // exact fabrication the count/most-recent arm below refuses. (`exists this` — a `ThisRecords` target — is
      // the concept's OWN records, sound as `directFacts` presence, so it needs no arm and falls through.)
      composition = refTrace(red.target.ref, entry!.lib, ctx);
      composition = { ...composition, satisfied: composition.satisfied === true };
      composed = composition.satisfied ?? false;
    } else if (red.kind === "count" || red.kind === "mostRecent") {
      // A `count ... at least N` / `most recent this` reduction CANNOT be soundly evaluated by the presence
      // model (count needs record COUNTS — present/absent would pass a sub-threshold case; `most recent` needs
      // record-level value/recency). Mark the run ERROR rather than FABRICATE a presence answer (charter
      // no-fabricated-authority), mirroring the boolean-composition precedent below.
      // ⚠ SPELLING ASYMMETRY (disc 462, both arms): a NAMED `most recent "X"` deliberately stays a
      // `DefinitionIsDefinition` (`types.ts:979`), NOT a `ReductionDefinition`, so it does NOT reach this arm —
      // it presence-evaluates under the general "`definition is` predicates deferred" rule (file header) and is
      // silently false. Distinguishing a value-read `most recent "X"` from a sound list-pattern records concept
      // needs the narrative matcher + pattern-return-shape classification (the emit-side machinery); a full CRE
      // value-read/reduction evaluation is a deferred effort. Documented here rather than half-built.
      ctx.runtimeError = true;
      ctx.diagnostics.push(
        `\`definition is ${red.kind === "count" ? "count" : "most recent"}\` reduction concept ` +
          `${labelOf(entry!.lib, entry!.node.name)} is not evaluated by run_decision — a count/most-recent ` +
          `reduction needs record-level evaluation the engine's presence model does not provide; run marked ` +
          `error rather than fabricate a presence-based answer.`,
      );
    }
    // `exists this` (ThisRecords) → no arm; for a CODED concept (`code is` + `definition is exists this`)
    // `directFacts` presence (the case asserting the concept's own records) IS its existence, so it is sound.
    // A code-LESS `exists this` (no `code is`, no source) is resourceless-derived: #189 (a) refuses a direct
    // name-assertion of it (the directFacts loop errors before it can populate), so its presence is always empty
    // and it computes false — the null-forever (#291) case, no longer a silent presence fabrication.
  }

  // #189 Piece 3 (Option C, disc 512) — the DIRECT-arm contribution, computed AFTER `composed` so the OR union is
  // honored. For a value-reading boolean concept (a member-existence interface) the emitted CQL own-arm reads the
  // newest own record's VALUE (not presence); the CRE mirrors that from the retained own boolean value. Every other
  // concept keeps PRESENCE (`directFacts.has`) — a valueless record (Condition/`exists this`) has no value to read;
  // existence IS its truth.
  let direct: Tri;
  if (ctx.valueReadingIds.has(id)) {
    const vals = ctx.ownBoolValues.get(id) ?? [];
    if (vals.length === 0) {
      // ⭐ #189 null/pause — no own boolean record. For a PURE QUESTION that is UNKNOWN, not false: nothing
      // else can compute it, so the gate must pause and ask. Matches the emitted `answeredValue()`, which is
      // deliberately un-`Coalesce`d and yields null on an empty answer set. For every OTHER value-reading
      // concept a composed arm CAN decide, so the own arm reads false and the composition takes over
      // (`kOr([false, composed])`).
      direct = ctx.pureQuestionIds.has(id) ? null : false;
    } else if (vals.every((v) => v === vals[0])) {
      direct = vals[0]; // agreeing own values → unambiguous; matches `$apply`'s newest-wins under ANY ordering
    } else if (composed) {
      // Conflicting own values, BUT the composed `exists` arm is already satisfied → the OR union is true regardless
      // of which own value `$apply` picks; the conflict is NOT decisive, so no refuse (`sat = direct || composed`).
      direct = false;
    } else {
      // DECISIVE conflict: composed is false, so the own-arm alone decides — and `$apply` would pick the newest by
      // (effective, id), a sort the CRE does not replicate (charter §4 no-magic — the id is an emitter hash). Refuse
      // loud, the same posture as a local-membership collision — a LOUD non-decision, never a silent wrong verdict.
      ctx.runtimeError = true;
      ctx.diagnostics.push(
        `value-reading concept ${entry ? labelOf(entry.lib, entry.node.name) : id} was directly asserted with ` +
          `CONFLICTING own values (both \`value is true\` and \`value is false\`) and no composed evidence; the ` +
          `newest-wins determination cannot be resolved without the emitted record dating — run marked error rather ` +
          `than fabricate a verdict.`,
      );
      direct = false;
    }
  } else {
    direct = ctx.directFacts.has(id);
  }
  ctx.stack.delete(id);
  const result: ConceptEval = { sat: kOr([direct, composed]), ...(composition ? { composition } : {}) };
  // Memoize only cycle-free AND non-runtimeError-tainted evals (disc 462 Claude #2). A cached tainted result
  // would mask the per-concept unevaluable signal `truthOf`/`collectConceptTruth` read off the scratch
  // `runtimeError` to OMIT the row (never publish a fabricated presence answer). `runtimeErrorBefore` scopes
  // this to errors raised DURING this eval (directly or via a consumed operand — transitive), mirroring the
  // existing cycle-taint exclusion; a tainted eval is on the error path and never trusted, so not caching it
  // costs only a re-eval.
  const erroredThisEval = ctx.runtimeError && !runtimeErrorBefore;
  if (ctx.cycleHits === cyclesBefore && !erroredThisEval) ctx.cache.set(id, result);
  return result;
}

function walkDefinedAs(
  body: DefinedAsBareRef | DefinedAsExists | DefinedAsComposition | DefinedAsBooleanComposition,
  lib: string,
  ctx: Ctx,
): CompositionTrace {
  // #270 (Slice 0a-cre) — `defined as exists ("X")` is CLOSED-WORLD existence over X's records: X exists
  // iff it is directly asserted by a case fact OR its own definition evaluates satisfied (`evalConcept`,
  // via `refTrace`). In the closed-world fact model, existence of a records concept IS its satisfaction —
  // exactly the CQL bare `exists(<X>)` the emitter lowers (`emitExistsBridge`), which is total (never
  // null). So NO `runtimeError`: an existence determination is now authoritative, matching the emit lane.
  // It traces as `op:"ref"` ("X is present") — the trace op union has no distinct `exists` node; a
  // dedicated one can ride 0b's viewModel schema bump. (The emit refuses `exists` over a scalar boolean /
  // reduction operand — `emitExistsBridge` guard (2) — so a well-formed exists target is a records/refinement
  // concept, for which `refTrace`'s satisfaction is the presence answer.)
  //
  // ⚠ REFINEMENT-TARGET DIVERGENCE (disc 462, gpt56 G1 / Claude): when X is a `defined as (A sem-and B)` /
  // `sem-not` refinement, CRE approximates record INTERSECTION/COMPLEMENT by boolean presence conjunction
  // (`walkExpr`), so `exists(X)` can read true where the emitted CQL `exists(A intersect B)` is empty
  // (disjoint records). This is a PRE-EXISTING systemic model coarseness — it applies to EVERY consumer of a
  // refinement concept's satisfaction (a plain `when "X"` guard over a refinement already approximates), not
  // to `exists` specifically — so `exists` inheriting it consistently is correct; loud-erroring only the
  // `exists` cell would be incoherent. Record-level refinement evaluation is a deferred CRE effort.
  if (body.type === "DefinedAsExists") {
    // #189 Piece 3 (v7 §3) — via `existsTrace`, so `exists` over a `most recent this` / `count` value concept reads
    // record EXISTENCE instead of erroring on the value reduction (the `Covered Device` both-rep coverage gate).
    return existsTrace(body.ref, lib, ctx);
  }
  if (body.type === "DefinedAsBooleanComposition") {
    // #189 Slice 0b — CLOSED-WORLD eval of a `defined as` BOOLEAN composition (`("A" and "B")`): `and`/`or`/
    // `not` over the evaluated operand booleans (each operand a concept ref → `refTrace`). REPLACES the T1 loud
    // sentinel. ⚠ SCOPE (disc 464, both arms — it matches the emitted CQL for VALIDATOR-CLEAN, same-lib content
    // over EVALUABLE operands, NOT unconditionally):
    //   - a `runtimeError`-writing operand (a `count`/`most recent` reduction, or the criterion arm in
    //     `walkBoolExpr`) DOES propagate → run status "error";
    //   - an UNRESOLVED or CYCLIC operand degrades CLOSED-WORLD-FALSE (`refTrace`/`evalConcept` set no
    //     `runtimeError`) — the SAME posture as a decision guard / `sem-*` composition; the validator owns them
    //     (a composition over an unresolved operand is T2-rejected);
    //   - a boolean COMPARATOR / value-read operand inherits the presence-model approximation (backlog #283),
    //     IDENTICAL to a plain `when "X"` guard over the same operand — not worsened here. Documented, not loud,
    //     consistent with the operator-affirmed G1 stance (single-cell loud-erroring would contradict the rest
    //     of the CRE). Full record/value-level CRE eval is the deferred #283 effort.
    return walkBoolExpr(body.expression, lib, ctx);
  }
  return body.type === "DefinedAsBareRef"
    ? refTrace(body.ref, lib, ctx)
    : walkExpr(body.expression, lib, ctx);
}

/**
 * Off-path case truth for a concept (#187 Todo 2). Evaluates `id` through the SAME `evalConcept` the run uses, but in
 * an ISOLATED scratch ctx — fresh `diagnostics`/`stack`/`cycleHits` and a COPIED `reportedUnresolved` — so computing a
 * preempted concept's answer cannot change the case's status/produced/trace/diagnostics. ONLY `cache` is intentionally
 * shared, and that is safe: `evalConcept` is MONOTONIC (early-returns on any existing entry; only ever ADDS a cycle-free
 * result; never overwrites) and the main run already completed, so added cache entries cannot alter produced/trace.
 * LOAD-BEARING INVARIANT: this routes ONLY through `evalConcept`. `walkBranches`/`emitAction`/`executeBody` are the
 * writers of `produced`/`trace`/`delegationStack`; `runtimeError` has additional writers reachable from `evalConcept`
 * — `walkBoolExpr`'s criterion-operand arm sets it for a criterion inside a `defined as` boolean composition (#189
 * Slice 0b), and `evalConcept` itself sets it for a `count`/`most recent` reduction concept (#270 Slice 0a-cre).
 * (`defined as exists`, a named `exists "X"` reduction, and a boolean composition over EVALUABLE operands now
 * EVALUATE, so they no longer write it.) Isolation still holds: the scratch ctx
 * below RESETS `runtimeError` to a fresh `false`, so an off-path unevaluable node marks the SCRATCH errored and never
 * the real run. Any NEW `runtimeError` writer reachable from `evalConcept` inherits this isolation — keep it that way.
 *
 * The reset also makes the scratch `runtimeError` a per-concept "this off-path answer is NON-AUTHORITATIVE" signal:
 * `collectConceptTruth` reads it to OMIT the row (the `ConceptTruthRow` "absent ⇒ unknown" contract) rather than
 * publish a fabricated presence `false` for a concept the engine refuses to evaluate (disc 462 Claude #2 / gpt56 G4).
 */
function truthOf(id: Id, ctx: Ctx): { eval: ConceptEval; authoritative: boolean } {
  const scratch: Ctx = {
    ...ctx,
    diagnostics: [],
    stack: new Set(),
    cycleHits: 0,
    reportedUnresolved: new Set(ctx.reportedUnresolved),
    runtimeError: false, // fresh — detect ONLY this off-path eval's unevaluable verdict
    publicationErrors: [],
  };
  const ev = evalConcept(id, scratch);
  return { eval: ev, authoritative: !scratch.runtimeError && scratch.publicationErrors.length === 0 };
}

/**
 * The case's per-concept truth over the WHOLE closure (#187 Todo 2) — eval-all-closure. Every DECLARED concept in
 * `ctx.concepts` (root + local + package libs; the whole cross-lib closure) gets its overall satisfaction, so a
 * preempted/off-path concept that `:first` never evaluated still has a case answer for the panes — no frame-aware
 * structure walk needed (`ctx.concepts` already spans delegated sub-decisions). Records the RETURNED `sat` (NOT a cache
 * snapshot: a cycle-tainted eval is deliberately not memoized, so a snapshot would omit exactly the abnormal false cases).
 *
 * COVERAGE = declared Concepts. This is exactly the set the panes can DISPLAY (their `ConceptShapeIndex` is built from
 * the same `Concept` declarations), so a fact-only name asserted via `defined by` but with NO `Concept` declaration —
 * satisfiable-true but absent from `ctx.concepts` — is intentionally absent here AND never a displayed concept, so the
 * "absent ⇒ unknown" contract cannot mislead a pane. PRECEDENCE: `ctx.concepts` is keyed by `(lib,name)`, and a same-name
 * local+package collision resolves to the local/covered concept (added last in `runCel`) — the shape model resolves the
 * same way, so the row matches what the pane shows.
 *
 * BOUND: O(all declared concepts in the closure) rows, per case, and this array is JSON-serialized by `run_decision`. At
 * authoring scale (a policy + a few shared libs) that is small; a covered lib importing a very large shared package
 * library is the pathological case — if it ever bites, scope collection to the covered decision's reachable concept set
 * (deferred; the frame-aware reachability walk was the option disc 191 rejected in favor of this simpler closure form).
 *
 * Rows are sorted by `(lib, name)` for deterministic output (so a future `run_decision` golden can't accidentally encode
 * the registry iteration order). Order is NOT part of the contract — consumers join by `(lib,name)`, never by position.
 */
function collectConceptTruth(ctx: Ctx): ConceptTruthRow[] {
  const rows: ConceptTruthRow[] = [];
  for (const [id, entry] of ctx.concepts) {
    const { eval: ev, authoritative } = truthOf(id, ctx);
    // OMIT a non-authoritative concept (a `count`/`most recent` reduction, or a boolean composition over a
    // criterion operand, that the engine refuses to evaluate) — an ABSENT row is UNKNOWN (render blank), never a fabricated `false`
    // (disc 462 Claude #2 / gpt56 G4). Publishing false would tell a pane a `count≥2` determination is
    // authoritatively unmet on a case that may satisfy it.
    if (!authoritative) continue;
    // ⭐ REFACTOR:grounded (#189 null/pause, panel disc 517) — OMIT an UNKNOWN too, for exactly the reason
    // above. `satisfied: sat === true` would publish an unanswered QUESTION to the panes as an authoritative
    // "not satisfied" row — the unanswered≡answered-no conflation this whole change exists to kill,
    // reintroduced at the surface KE tooling actually reads. The row contract already says ABSENT ⇒ UNKNOWN,
    // so a question with no answer belongs in the same bucket as a determination the engine won't evaluate.
    // Reached unknown trace nodes also omit `satisfied` and carry `unknown`; ordered halts additionally
    // carry `blockedUnknown`. Truth rows omit unknowns rather than coerce them.
    if (ev.sat === null) continue;
    rows.push({ lib: entry.lib, name: entry.node.name, satisfied: ev.sat === true });
  }
  rows.sort((a, b) => a.lib.localeCompare(b.lib) || a.name.localeCompare(b.name));
  return rows;
}

/** A composition operand reference resolves against the DEFINING concept's
 *  library when unqualified (`lib`), or its explicit qualifier when present. */
// REFACTOR:grounded (#320): preserve unknown in composition traces as well as branch traces.
function traceTruth(sat: Tri): { satisfied?: boolean } {
  return sat === null ? {} : { satisfied: sat };
}

function refTrace(ref: ReferenceName, lib: string, ctx: Ctx): CompositionTrace {
  const refLib = getRefLibrary(ref) ?? lib;
  const name = getRefName(ref);
  const id = idOf(refLib, name);
  if (!ctx.concepts.has(id) && !ctx.directFacts.has(id) && !ctx.reportedUnresolved.has(id)) {
    // Resolves to neither a concept nor a fact — unresolvable. Flag it: a silent
    // false under `sem-not` would invert to a spurious `true`. (A bare operand is
    // LOCAL to the defining library; cross-library operands must be qualified.)
    ctx.reportedUnresolved.add(id);
    ctx.diagnostics.push(
      `composition operand ${labelOf(refLib, name)} resolves to no concept or fact`,
    );
  }
  const ev = evalConcept(id, ctx);
  return {
    op: "ref",
    concept: name,
    ...traceTruth(ev.sat),
    ...(ev.composition ? { composition: ev.composition } : {}),
  };
}

/** #189 Piece 3 (v7 §3) — the existence reach-through for `defined as exists ("X")`. `exists(X)` = "does a member
 *  record of X exist". When X is a VALUE concept whose datum is a `most recent this` / `count` reduction (the
 *  both-rep `Covered Device` shape), the reduction selects/aggregates a VALUE over X's OWN records — it does NOT
 *  gate their EXISTENCE. `evalConcept` marks such a reduction a `runtimeError` (it cannot evaluate the value), which
 *  would poison an existence read that never needed the value. So here existence is X's `directFacts` presence
 *  (a local- or source-member fact populated it), computed WITHOUT evaluating the reduction — matching the emitted
 *  CQL `exists(<X records>)`, which is total. Every OTHER target (plain records, `exists this`, `exists "Y"`, a
 *  `defined as` composition) does not error in `evalConcept`, so it keeps the existing `refTrace` presence answer. */
function existsTrace(ref: ReferenceName, lib: string, ctx: Ctx): CompositionTrace {
  const refLib = getRefLibrary(ref) ?? lib;
  const name = getRefName(ref);
  const id = idOf(refLib, name);
  const def = ctx.concepts.get(id)?.node.definition;
  if (def?.type === "ReductionDefinition" && (def.reduction.kind === "count" || def.reduction.kind === "mostRecent")) {
    return { op: "ref", concept: name, satisfied: ctx.directFacts.has(id) };
  }
  const trace = refTrace(ref, lib, ctx);
  return { ...trace, satisfied: trace.satisfied === true }; // explicit existence remains total
}

function walkExpr(expr: CompositionExpression, lib: string, ctx: Ctx): CompositionTrace {
  switch (expr.type) {
    case "SemAndExpression": {
      const operands = expr.terms.map((t) => walkExpr(t, lib, ctx));
      return { op: "sem-and", operands, ...traceTruth(kAnd(operands.map((o) => o.satisfied ?? null))) };
    }
    case "SemOrExpression": {
      const operands = expr.terms.map((t) => walkExpr(t, lib, ctx));
      return { op: "sem-or", operands, ...traceTruth(kOr(operands.map((o) => o.satisfied ?? null))) };
    }
    case "SemNotExpression": {
      const operand = walkExpr(expr.expression, lib, ctx);
      return { op: "sem-not", operand, ...traceTruth(kNot(operand.satisfied ?? null)) };
    }
    case "CompositionGroup":
      return walkExpr(expr.expression, lib, ctx); // parentheses are transparent
    case "CompositionRef":
      return refTrace(expr.ref, lib, ctx);
  }
}

/** #189 Slice 0b — three-valued evaluation of a `defined as` BOOLEAN composition's `BranchCondition` tree:
 *  `and`/`or`/`not` over evaluated operand booleans, mirroring the emitted CQL `and`/`or`/`not`. The
 *  decision-guard analogue is `evalBranchCondition` (which also handles criteria + the decision frame); this
 *  is the `defined as` (concept) analogue, producing a `CompositionTrace` so `conceptTruth` / the cockpit
 *  renders the operands. Operand truth comes from refTrace; missing question answers remain unknown. */
function walkBoolExpr(expr: BranchCondition, lib: string, ctx: Ctx): CompositionTrace {
  switch (expr.type) {
    case "BranchConditionAnd": {
      const operands = expr.operands.map((t) => walkBoolExpr(t, lib, ctx));
      return { op: "and", operands, ...traceTruth(kAnd(operands.map((o) => o.satisfied ?? null))) };
    }
    case "BranchConditionOr": {
      const operands = expr.operands.map((t) => walkBoolExpr(t, lib, ctx));
      return { op: "or", operands, ...traceTruth(kOr(operands.map((o) => o.satisfied ?? null))) };
    }
    case "BranchConditionNot": {
      const operand = walkBoolExpr(expr.operand, lib, ctx);
      return { op: "not", operand, ...traceTruth(kNot(operand.satisfied ?? null)) };
    }
    case "BranchConditionRef":
      // #189 Slice 0c — a boolean-composition operand may be a CROSS-LIBRARY qualified ref (`"Sib"."Sib Flag"`).
      // `refTrace` resolves it against its explicit qualifier over the loaded closure (the registry-built concept
      // map, ~line 1155) and evaluates it CLOSED-WORLD. POSTURE (operator-affirmed G1 "document, not loud"): the
      // EMIT lane proves the operand total from the WHOLE-closure `DeclaredResultIndex`, so emit succeeds; a
      // `run_decision` invoked WITHOUT the foreign library in scope cannot resolve the operand and `refTrace`
      // pushes an UNRESOLVED DIAGNOSTIC. Two honest caveats on that diagnosed-unresolved verdict (disc 466, both
      // arms) — both PRE-EXISTING closed-world limits (backlog #283), NOT 0c regressions, and identical to a bare
      // unresolved operand: (1) the operand still evaluates to closed-world FALSE, so under `not` it INVERTS to a
      // diagnosed `true` that can drive a recommendation — a diagnosed false, not a prevented one; (2) `refTrace`
      // resolves the qualifier by RAW token (`idOf(refLib, name)`), NOT scope-first like emit, so under
      // `local-package-same-name` the CRE can evaluate a DIFFERENT library's concept than emit. The CRE is a
      // presence-model approximation, not the shipped artifact — these are documented, not loud-gated.
      return refTrace(expr.ref, lib, ctx);
    case "BranchConditionCriterionRef":
      // A criterion is NOT a boolean-composition operand (emit's `branchConditionConceptRefsStrict` rejects it);
      // the closed-world evaluator cannot treat a decision-guard construct as a boolean fact. Mark the run error
      // rather than fabricate a presence answer (charter no-fabricated-authority), mirroring the emit refusal.
      ctx.runtimeError = true;
      ctx.diagnostics.push(
        `\`defined as\` boolean composition references criterion "${getRefName(expr.ref)}" — a criterion is a ` +
          "decision-guard construct, not a boolean fact; run marked error rather than fabricate a boolean.",
      );
      return { op: "ref", concept: getRefName(expr.ref), satisfied: false };
  }
}

function conceptSatisfied(
  ref: ReferenceName,
  ctx: Ctx,
  frame: Frame,
): { sat: Tri; facts: string[]; composition?: CompositionTrace } {
  // A bare `when`/guard ref resolves against the CURRENT decision's library (the frame). Same-library is the degenerate
  // case `frame.currentLib === ctx.rootLib`; a cross-library sub carries its own lib so its bare refs bind there (#172).
  const id = idOf(getRefLibrary(ref) ?? frame.currentLib, getRefName(ref));
  const target = ctx.concepts.get(id)?.node;
  if (!target) {
    ctx.runtimeError = true;
    const lib = getRefLibrary(ref) ?? frame.currentLib;
    const name = getRefName(ref);
    ctx.diagnostics.push(lib !== frame.currentLib && ctx.criterionTables?.get(lib)?.has(name)
      ? `criterion-guard-unavailable: ${foreignCriterionMessage(labelOf(lib, name))}`
      : `unsupported-reference: unresolved guard "${name}" in library "${lib}".`);
    return { sat: null, facts: [] };
  }
  if (target?.shapeReduction !== undefined && target.valueTypes[0] !== "boolean") {
    ctx.runtimeError = true;
    ctx.diagnostics.push(`publication-unsupported-context: guard "${getRefName(ref)}" requires a Boolean publication.`);
    return { sat: null, facts: [] };
  }
  const ev = evalConcept(id, ctx);
  return {
    sat: ev.sat,
    facts: ctx.factsByConcept.get(id) ?? [],
    ...(ev.composition ? { composition: ev.composition } : {}),
  };
}

/** Evaluate a COMPOUND `when` guard (`and`/`or` over concept refs). FULL-evaluate
 *  every operand (NO short-circuit) so the trace shows which conjunct failed:
 *  `and` = all satisfied, `or` = any. Facts = ordered first-occurrence union over
 *  the evaluated ref leaves. A single-ref guard does NOT come here — walkBranches
 *  keeps its legacy `concept`+`composition` trace path (no golden drift). Note:
 *  full evaluation may surface DIAGNOSTICS from a non-decisive operand (e.g. the
 *  second operand of a satisfied `or`); intentional, for a complete trace. */
function evalBranchCondition(
  cond: BranchCondition,
  ctx: Ctx,
  frame: Frame,
): { sat: Tri; facts: string[]; trace: BranchConditionTrace } {
  if (cond.type === "BranchConditionRef") {
    const { sat, facts, composition } = conceptSatisfied(cond.ref, ctx, frame);
    // Structured RESOLVED identity: a bare ref resolves against the current frame
    // (a delegated cross-library decision → the sub's lib), so two same-named
    // bare leaves in different frames stay distinguishable in the trace.
    const lib = getRefLibrary(cond.ref) ?? frame.currentLib;
    return {
      sat,
      facts,
      trace: {
        op: "ref",
        ...(sat === null ? {} : { satisfied: sat }),
        concept: { name: getRefName(cond.ref), libraryName: lib },
        ...(composition ? { composition } : {}),
        ...(facts.length > 0 ? { facts } : {}),
      },
    };
  }
  if (cond.type === "BranchConditionCriterionRef") {
    // #236: evaluate a criterion by REFERENCE to its boolean body (memoized per case), NOT by
    // inline expansion. REFACTOR:grounded (#320, review 563 r4): this public entry does
    // not run validation, so enforce the library-local criterion boundary before lookup.
    const name = getRefName(cond.ref);
    const lib = getRefLibrary(cond.ref) ?? frame.currentLib;
    const cid = idOf(lib, name);
    const critTrace = (
      sat: Tri,
      facts: string[],
      body?: BranchConditionTrace,
    ): { sat: Tri; facts: string[]; trace: BranchConditionTrace } => {
      // FIRST occurrence per (lib,name) with a RESOLVED body carries the body sub-trace; a LATER
      // occurrence of that same (already-bodied) criterion is a `reference` (body shown once — the
      // linearity that keeps the serialized trace linear in DISTINCT criteria). An UNDEFINED or
      // CYCLIC criterion has NO body anywhere, so it emits NEITHER body nor reference — an
      // opaque/error node — NOT a spurious `reference` (which would promise a first-occurrence body
      // that never exists, breaking the contract MCP/schema consumers code against). disc 419: both
      // review arms (gpt-5.6 #10 / Fable N1) flagged the no-body `reference:true`.
      const bodied = ctx.tracedCriteria.has(cid);
      const first = body !== undefined && !bodied;
      if (body !== undefined) ctx.tracedCriteria.add(cid);
      return {
        sat,
        facts,
        trace: {
          op: "criterion",
          ...(sat === null ? {} : { satisfied: sat }),
          criterion: { name, libraryName: lib },
          ...(first ? { body } : bodied ? { reference: true } : {}),
          ...(facts.length > 0 ? { facts } : {}),
        },
      };
    };
    if (lib !== frame.currentLib) {
      ctx.runtimeError = true;
      if (!ctx.reportedUnresolved.has(cid)) {
        ctx.reportedUnresolved.add(cid);
        ctx.diagnostics.push(
          `criterion-guard-unavailable: ${foreignCriterionMessage(labelOf(lib, name))}`,
        );
      }
      return critTrace(false, []);
    }
    const crit = ctx.criterionTables?.get(lib)?.get(name);
    if (!crit) {
      // A malformed guard is an execution error, not a false determination or a null pause.
      // Keep the existing global structural-error channel so negation/fallback cannot produce a leaf.
      ctx.runtimeError = true;
      if (!ctx.reportedUnresolved.has(cid)) {
        ctx.reportedUnresolved.add(cid);
        ctx.diagnostics.push(`criterion-guard-unavailable: criterion "${name}" resolves to no definition in ${lib}.`);
      }
      return critTrace(false, []);
    }
    const cached = ctx.criterionCache.get(cid);
    if (cached) return critTrace(cached.sat, cached.facts, cached.body);
    if (ctx.criterionStack.has(cid)) {
      // Break the cycle as a structural error; no dependent value may be cached as a determination.
      ctx.runtimeError = true;
      ctx.diagnostics.push(`criterion-guard-unavailable: criterion cycle detected at "${name}" (${lib}).`);
      ctx.cycleHits++;
      return critTrace(false, []);
    }
    ctx.criterionStack.add(cid);
    const cyclesBefore = ctx.cycleHits;
    const publicationErrorsBefore = ctx.publicationErrors.length;
    // REFACTOR:grounded (#320, review 563): isolate this synchronous evaluation's
    // fault flag for caching, then restore every prior case fault. A repeated fault
    // still marks this evaluation even when its diagnostic has already been deduplicated.
    const runtimeErrorBefore = ctx.runtimeError;
    ctx.runtimeError = false;
    let inner: ReturnType<typeof evalBranchCondition>;
    let evaluationFailed = true;
    try {
      inner = evalBranchCondition(crit.condition, ctx, { ...frame, currentLib: lib });
      evaluationFailed = ctx.runtimeError;
    } finally {
      ctx.runtimeError = runtimeErrorBefore || ctx.runtimeError;
      ctx.criterionStack.delete(cid);
    }
    if (!evaluationFailed && ctx.cycleHits === cyclesBefore && ctx.publicationErrors.length === publicationErrorsBefore) {
      ctx.criterionCache.set(cid, { sat: inner.sat, facts: inner.facts, body: inner.trace });
    }
    return critTrace(inner.sat, inner.facts, inner.trace);
  }
  if (cond.type === "BranchConditionNot") {
    // REFACTOR:grounded (#189 null/pause) — STRONG KLEENE negation: `not unknown = unknown`.
    // ⚠ NOT closed-world, and NOT two-valued. The emit side's BRANCH-guard carrier is `not <ref>` with no
    // `Coalesce`, matching this. (The ACTION-guard carrier DOES coalesce and is evaluated two-valued by
    // `evalGuard` — a different path, deliberately: an action guard must never pause.)
    // A determination that is absent but DERIVABLE still reads `false` closed-world; only one that
    // nothing can compute is unknown, so `not X` on ordinary shapes is unchanged.
    // Facts of the operand ARE the evidence consulted, so they propagate (the reason it holds).
    const inner = evalBranchCondition(cond.operand, ctx, frame);
    return {
      sat: kNot(inner.sat),
      facts: inner.facts,
      trace: { op: "not", ...(inner.sat === null ? {} : { satisfied: kNot(inner.sat) as boolean }), operand: inner.trace },
    };
  }
  const op: "and" | "or" = cond.type === "BranchConditionAnd" ? "and" : "or";
  const results = cond.operands.map((o) => evalBranchCondition(o, ctx, frame));
  const sat = op === "and" ? kAnd(results.map((r) => r.sat)) : kOr(results.map((r) => r.sat));
  const seen = new Set<string>();
  const facts: string[] = [];
  for (const r of results) {
    for (const f of r.facts) {
      if (!seen.has(f)) {
        seen.add(f);
        facts.push(f);
      }
    }
  }
  return { sat, facts, trace: { op, ...(sat === null ? {} : { satisfied: sat }), operands: results.map((r) => r.trace) } };
}


export function recName(action: ActionStatement["action"]): string {
  return action.type === "RecommendActivity"
    ? getRefName(action.activityName)
    : getRefName(action.decisionName);
}

/** A guard EXCLUDES an item when `unless C` and C holds, or `only when C` and C does not hold. */
function evalGuard(
  guard: ActionGuard | undefined,
  ctx: Ctx,
  frame: Frame,
): { excluded: boolean; info?: TraceNode["guard"] } {
  if (!guard) return { excluded: false };
  // REFACTOR:grounded (#320, review 560 E8): menu-wide null/pause behavior is not integrated
  // with FHIR apply yet. No CRE-only halt or false coercion may claim parity for this context.
  const publicationOperand = ctx.concepts.get(idOf(getRefLibrary(guard.conceptName) ?? frame.currentLib,
    getRefName(guard.conceptName)))?.node.shapeReduction !== undefined;
  if (publicationOperand) {
    ctx.runtimeError = true;
    ctx.diagnostics.push("publication-unsupported-context: action guards over selected publications require integrated menu pause behavior, not available in this slice.");
    return { excluded: true };
  }
  const { sat, composition } = conceptSatisfied(guard.conceptName, ctx, frame);
  if (ctx.runtimeError) return { excluded: true }; // retain the actual dependent-context diagnostic
  // REFACTOR:grounded (#320, review 571): an unknown legacy guard must not
  // acquire a disposition through this newly admitted publication/menu path.
  // Integrated menu pause remains unsupported; report that limit, not false.
  // Admission is library-wide: even an unused first publication activates it.
  // runtimeError is intentional for an unsupported context: the entire case is
  // invalid, unlike per-condition publicationErrors from individual bad data.
  if (ctx.publicationProgram !== undefined && sat === null) {
    ctx.runtimeError = true;
    ctx.diagnostics.push("publication-unsupported-context: an unanswered action guard requires integrated menu pause behavior, not available in this slice.");
    return { excluded: true };
  }
  // Selected-publication operands are refused before evaluation, so this guard lane
  // cannot currently receive per-datum publicationErrors. Revisit that boundary if
  // publication guard support expands. A pre-existing context fault also stays invalid.
  // REFACTOR:suspect (#320): legacy non-publication guards still coerce unknown to false.
  // The emitter also retains this coercion; this CRE capability refusal does not fix
  // emitted menu behavior. Integrated menu pause remains CRL developer work under #320.
  if (sat === null) {
    ctx.discardedUnknown = true;
    ctx.diagnostics.push("legacy-discarded-unknown: unanswered action guard; integrated menu pause is unsupported. A pause assertion cannot certify this execution.");
  }
  const satTotal = sat === true;
  const excluded = guard.polarity === "unless" ? satTotal : !satTotal;
  return {
    excluded,
    info: {
      polarity: guard.polarity,
      concept: getRefName(guard.conceptName),
      ...(sat === null ? { unknown: true as const } : { satisfied: satTotal }),
      ...(composition ? { composition } : {}),
    },
  };
}

/** Source span of an AST node in the CURRENT frame's library file (the covered file at root; the sub's file when a
 *  cross-library `use decision` recurses). Carried per-frame, not from the shared Ctx, so a sub's spans point at ITS file. */
const spanOf = (loc: Location, frame: Frame): LsLocation => ({
  filePath: frame.currentFilePath,
  range: toZeroBasedRange(loc),
});

/**
 * Emit one action node (already past its guard) at `nodeId`. A `recommend activity` is a leaf disposition: its name
 * enters `produced`. A `use decision` DELEGATES (#166 same-library, #172 cross-library):
 *  - RESOLVABLE target (BARE in the current frame's lib, or QUALIFIED in its explicit lib), not on the delegation path →
 *    recurse the sub-decision's body UNDER this action's nodeId (children), pushing a NEW frame
 *    `{ currentLib: resolved.lib, currentFilePath: resolved.filePath }` so the sub's bare when/guard resolve in ITS
 *    library and its trace spans point at its file. The `(resolved.lib, name)` key is pushed on the delegation stack.
 *    The sub's RecommendActivity names bubble into the SAME `ctx.produced` (the oracle sees the delegated disposition).
 *    The sub-name itself is NOT produced (REPLACE).
 *  - target on the delegation path (cycle) → set `ctx.runtimeError` + a cycle diagnostic; not recursed.
 *  - UNRESOLVED: a QUALIFIED target whose lib/sub is not in the graph → an `unresolved-cross-lib` diagnostic; a BARE
 *    target not found in the current library → a distinct not-found diagnostic. Leaf; not produced.
 * Returns whether this action contributed at least one production to `ctx.produced` (for the all-guarded-out diagnostic).
 */
function emitAction(
  stmt: ActionStatement,
  viaWhen: string | null,
  qualifier: BlockQualifier | null,
  ctx: Ctx,
  frame: Frame,
  into: TraceNode[],
  nodeId: string,
  guardInfo?: TraceNode["guard"],
): boolean {
  const source = spanOf(stmt.location, frame);
  if (stmt.action.type === "RecommendActivity") {
    const name = recName(stmt.action);
    ctx.produced.push({ recommendation: name, viaWhen, qualifier });
    into.push({
      node: name,
      nodeId,
      kind: "action",
      source,
      evaluated: true,
      ...(guardInfo ? { guard: guardInfo } : {}),
    });
    return true;
  }
  // UseDecision.
  const name = recName(stmt.action);
  const node: TraceNode = {
    node: name,
    nodeId,
    kind: "action",
    source,
    evaluated: true,
    ...(guardInfo ? { guard: guardInfo } : {}),
    children: [],
  };
  into.push(node);
  // Resolve via the shared global resolver (#172). A BARE target resolves against `frame.currentLib`; a QUALIFIED one
  // against its explicit library, over the whole graph. For same-library this returns the byte-identical Decision the
  // old flat covered-library map did.
  const refLib = getRefLibrary(stmt.action.decisionName);
  const resolved = ctx.resolveDecision(frame.currentLib, stmt.action.decisionName);
  if (!resolved) {
    // #236 — no expansion-overflow disposition to distinguish any more (criteria are referenced,
    // not materialized, so a `use decision` target's guard can never "breach the envelope"); an
    // unresolved target is simply not-found.
    // Leaf + diagnostic (don't crash, don't produce a phantom disposition). THREE distinct messages:
    //  - a QUALIFIED target whose library/sub is not in the resolved graph → unresolved-cross-lib;
    //  - a BARE target not found in the CURRENT frame's library → not-found-in-current-lib. Naming `frame.currentLib`
    //    (not "the covered library") is load-bearing: a bare `use decision "Missing"` INSIDE a cross-library sub must
    //    blame the SUB's library, not the covered policy (FIX 2).
    if (refLib) {
      ctx.diagnostics.push(
        `cross-library \`use decision\` ${labelOf(refLib, name)}: target library or decision not found in the resolved graph`,
      );
    } else {
      ctx.diagnostics.push(
        `\`use decision "${name}"\` target not found in library \`${frame.currentLib}\``,
      );
    }
    return false;
  }
  // Cycle guard keyed `(lib,name)` of the RESOLVED owning library (#172) so cross-library `A.Sub`/`B.Sub` can't
  // false-collide. For same-library `resolved.lib === frame.currentLib`, a 1:1 rename of the old bare-name key.
  const subId = idOf(resolved.lib, resolved.decision.name);
  if (ctx.delegationStack.has(subId)) {
    ctx.runtimeError = true;
    // Render the chain by NAME (not the (lib,name) key) so the message is byte-identical to the pre-#172 same-lib text.
    ctx.diagnostics.push(
      `decision delegation cycle: ${[...ctx.delegationStack, subId].map(nameOf).join(" → ")}`,
    );
    return false;
  }
  // Recurse the sub-decision under this action's nodeId; its determinations bubble into ctx.produced. REPLACE: the
  // sub-name itself is NOT produced (a delegation is not a disposition). Push a NEW frame in the SUB'S library + file so
  // its own bare when/guard resolve there (closed-world; the satisfying fact must be qualified `defined by "SubLib"."C"`)
  // and its trace spans point at its file. For same-library the frame is unchanged → byte-identical. try/finally so a
  // throw in the recursion can't poison the delegation stack for sibling branches.
  const subFrame: Frame = { currentLib: resolved.lib, currentFilePath: resolved.filePath };
  const beforeCount = ctx.produced.length;
  ctx.delegationStack.add(subId);
  try {
    walkBranches(
      resolved.decision.body.qualifier,
      resolved.decision.body.statements,
      ctx,
      subFrame,
      node.children!,
      nodeId,
    );
  } finally {
    ctx.delegationStack.delete(subId);
  }
  return ctx.produced.length > beforeCount;
}

function executeBody(
  body: WhenBlockBody,
  viaWhen: string | null,
  ctx: Ctx,
  frame: Frame,
  into: TraceNode[],
  parentId: string,
): void {
  if (ctx.runtimeError) return; // a delegation cycle short-circuits the rest of the walk — no further productions/trace
  if (body.type === "ActionStatement") {
    // Inline single action — the grammar forbids a guard here.
    emitAction(body, viaWhen, null, ctx, frame, into, childId(parentId, "action[0]"));
    return;
  }
  const block: BlockBody = body;
  const isBranch = block.statements.some(
    (m) => m.type === "WhenBlock" || m.type === "OtherwiseBlock",
  );
  if (isBranch) {
    walkBranches(block.qualifier, block.statements as BranchBlock[], ctx, frame, into, parentId);
    return;
  }
  // Action menu (`any:` / `all:` / single).
  let produced = 0;
  let guardExcluded = 0;
  const items = block.statements as ActionStatement[];
  for (let j = 0; j < items.length; j++) {
    if (ctx.runtimeError) return; // a cycle in an earlier menu item short-circuits the rest (no further trace/diagnostic)
    const stmt = items[j];
    const name = recName(stmt.action);
    const nodeId = childId(parentId, `action[${j}]`);
    const g = evalGuard(stmt.guard, ctx, frame);
    if (g.excluded) {
      guardExcluded++;
      into.push({
        node: name,
        nodeId,
        kind: "action",
        source: spanOf(stmt.location, frame),
        // REFACTOR:grounded (#320, review 571): refusal is not a true/false guard result.
        evaluated: true,
        ...(g.info ? { guardedOut: true, guard: g.info } : {}),
      });
      continue;
    }
    if (emitAction(stmt, viaWhen, block.qualifier ?? null, ctx, frame, into, nodeId, g.info))
      produced++;
  }
  // Distinguish "every member was GUARD-EXCLUDED" (a real guarding outcome) from "the menu determined no recommendation"
  // (e.g. a cyclic / unresolved `use decision`, or a sub that itself produced nothing). Only the former is a guarding claim.
  if (block.statements.length > 0 && produced === 0 && !ctx.runtimeError) {
    if (guardExcluded === block.statements.length) {
      ctx.diagnostics.push(
        `every option in the menu under "${viaWhen ?? "otherwise"}" was guarded out — branch produced nothing`,
      );
    } else {
      ctx.diagnostics.push(
        `no option in the menu under "${viaWhen ?? "otherwise"}" determined a recommendation`,
      );
    }
  }
}

function walkBranches(
  qualifier: BlockQualifier | undefined,
  branches: BranchBlock[],
  ctx: Ctx,
  frame: Frame,
  into: TraceNode[],
  parentId: string,
): void {
  if (ctx.runtimeError) return; // a delegation cycle short-circuits the rest of the walk — no further productions/trace
  // `all:` = every matching branch fires; `first:` (or a single-member block) = ordered, first match wins.
  const ordered = qualifier !== "all";
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    if (b.type === "OtherwiseBlock") {
      const nodeId = childId(parentId, "otherwise");
      const node: TraceNode = {
        node: "otherwise",
        nodeId,
        kind: "otherwise",
        source: spanOf(b.location, frame),
        evaluated: true,
        children: [],
      };
      into.push(node);
      executeBody(b.body, null, ctx, frame, node.children!, nodeId);
      if (ordered) return;
      continue;
    }
    // #224 i.2: a single-ref guard keeps the LEGACY trace (`concept` +
    // `composition`) — byte-identical, no golden drift. A COMPOUND guard is
    // full-evaluated into a `conditionTrace` and OMITS `concept` (its label lives
    // in `node`). `label`/`viaWhen` = the rendered guard (bare name for a single
    // ref = legacy-identical).
    const nodeId = childId(parentId, `when[${i}]`);
    // #236: `describeBranchCondition` renders a criterion ref by its author NAME (it is not
    // expanded), so this `label` — which flows to `ProducedRec.viaWhen`, the EVAL-output path KEs
    // assert execution against — names the criterion (`Eligible`), consistent with the VM display
    // label. A criterion is a named unit end-to-end (eval trace + VM), never an inlined body.
    const label = describeBranchCondition(b.condition, getRefName);
    const publicationErrorsBefore = ctx.publicationErrors.length;
    const soleR = soleRef(b.condition);
    let sat: Tri;
    let node: TraceNode;
    if (soleR) {
      const r = conceptSatisfied(soleR.ref, ctx, frame);
      sat = r.sat;
      node = {
        node: `when ${label}`,
        nodeId,
        kind: "when",
        source: spanOf(b.location, frame),
        concept: getRefName(soleR.ref),
        satisfied: sat === true,
        evaluated: true,
        facts: r.facts,
        ...(r.composition ? { composition: r.composition } : {}),
        children: [],
      };
    } else {
      const r = evalBranchCondition(b.condition, ctx, frame);
      sat = r.sat;
      node = {
        node: `when ${label}`,
        nodeId,
        kind: "when",
        source: spanOf(b.location, frame),
        satisfied: sat === true,
        evaluated: true,
        facts: r.facts,
        conditionTrace: r.trace,
        children: [],
      };
    }
    if (ctx.runtimeError) {
      node.satisfied = false;
      // REFACTOR:grounded (#320, review 571): this is a fault, not established false.
      node.invalidated = true;
      into.push(node);
      return;
    }
    if (ctx.publicationErrors.length !== publicationErrorsBefore) {
      node.satisfied = false;
      if (node.conditionTrace) node.conditionTrace.satisfied = false;
      node.publicationErrors = ctx.publicationErrors.slice(publicationErrorsBefore);
      into.push(node);
      // An error is neither false nor unknown: never execute this condition's activity or
      // cross a failed ordered prerequisite. Native $apply retains independent all: siblings.
      if (ordered) return;
      continue;
    }
    // REFACTOR:grounded (#320): retain unknown without changing decision traversal.
    if (sat === null) {
      node.unknown = true;
      delete node.satisfied;
    }
    into.push(node);
    if (sat === true) {
      executeBody(b.body, label, ctx, frame, node.children!, nodeId);
      if (ordered) return; // first match wins — remaining branches are not evaluated.
    } else if (sat === null && ordered) {
      // ⭐ #189 null/pause — an UNKNOWN guard in an ordered `first:` block HALTS the walk. No later branch
      // may fire, because an ordered block means THIS branch outranks them: answering it could change which
      // disposition is reached, so choosing one now would be guessing. The result is no recommendation —
      // the PAUSE — which is exactly what `$apply` produces once the emitted later branches carry this
      // branch's null-propagating negation (decision.ts `priorityExclusions`). The two lanes halt on the
      // same condition BY CONSTRUCTION rather than by coincidence.
      //
      // Falling through instead would reproduce the V4 wrong-arm defect in the CRE: a later definite branch
      // firing past a decisive unknown (`tmp/NOTES-apply-null-behavior.md` §8).
      node.blockedUnknown = true;
      return;
    }
  }
}

/** #189 Piece 2 (disc 508) — derive the local `{fhirType, system, code}` set for every LOCAL concept in the closure
 *  and index it forward (by concept id) and reverse (by `(fhirType, system, code)`). A concept whose base is
 *  underivable flips `underivable` (a local fact then fails the run loud, never a fabricated verdict). */
function buildLocalMembershipIndex(
  concepts: Map<Id, ConceptEntry>,
  graph: ResolvedCelGraph,
): LocalMembershipIndex {
  const ctx = makeLocalDomainContext(graph);
  const forward = new Map<Id, LocalConceptMember>();
  const reverse = new Map<string, Id>();
  const collisions = new Set<string>();
  const answerSets = new Map<Id, { system: string; codes: ReadonlySet<string> }>();
  for (const [id, entry] of concepts) {
    // ⚠ The domain id comes from the SAME resolver the emitted CodeSystem url uses, so the CRE and the FHIR
    // lane cannot disagree about which system a bare option code resolves to.
    const domainId = ctx.resolver?.domainIdFor({ filePath: entry.filePath, name: entry.entryName });
    if (ctx.base !== undefined && domainId !== undefined) {
      const set = inlineAnswerSet(entry.node, domainId, ctx.base);
      if (set) {
        answerSets.set(id, {
          system: set.codeSystem.url,
          codes: new Set(set.options.map((o: { code: string }) => o.code)),
        });
      }
    }
    const res = localMemberOfConcept(
      entry.node,
      { filePath: entry.filePath, entryName: entry.entryName, fallbackLib: entry.fallbackLib },
      ctx,
    );
    if ("notLocal" in res) continue;
    // An underivable concept (missing base) is simply absent from `forward` — a local fact naming it then hits the
    // per-fact "no derivable local code set" guard below (real project → error; inline → presence fallback).
    if ("error" in res) continue;
    forward.set(id, res.member);
    const key = memberKey(res.member.fhirType, res.member.system, res.member.code);
    const prior = reverse.get(key);
    if (prior !== undefined && prior !== id) collisions.add(key); // two DISTINCT concepts claim one set → ambiguous
    else reverse.set(key, id);
  }
  return { forward, reverse, answerSets, collisions, hasProject: graph.projectRoot !== undefined };
}

/** #189 Piece 3 — the SOURCE-membership reverse index: `(fhirType, system, code)` → the concept id(s) whose source
 *  set contains it, derived from the SAME mechanical set the FHIR/CQL lane emits (`sourceMembersOfConcept`). A
 *  MULTIMAP (not single-owner like the local index): two concepts may legitimately `coded from` the same reference
 *  VS and share its stub coding — BOTH populate, matching `$apply`'s two independent retrieves (charter §4 "the code
 *  populates whichever rep(s) it is a member of"; the local-local collision refuse does NOT extend to source overlap,
 *  which is well-formed). The fhirType in the key is the POSREP's `type is` (e.g. ServiceRequest). */
function buildSourceMembershipIndex(
  concepts: Map<Id, ConceptEntry>,
  graph: ResolvedCelGraph,
): Map<string, SourceOwner[]> {
  const base = makeLocalDomainContext(graph).base;
  const registry = graph.crlRegistry;
  const reverse = new Map<string, SourceOwner[]>();
  for (const [id, entry] of concepts) {
    for (const m of sourceMembersOfConcept(entry.node, base, registry)) {
      const key = memberKey(m.fhirType, m.system, m.code);
      const arr = reverse.get(key) ?? [];
      // The PROJECTION travels with the owner: which posrep matched decides what the candidate's value IS,
      // and the fact loop cannot re-derive that from the code alone.
      arr.push({ id, ...(m.projection !== undefined ? { projection: m.projection } : {}) });
      reverse.set(key, arr);
    }
  }
  return reverse;
}

/** A concept whose SOURCE set contains a code, plus the projection of the posrep that put it there. */
interface SourceOwner {
  id: Id;
  projection?: string;
}

function runCase(
  c: CELCase,
  decisions: Map<string, Decision>,
  facts: Map<string, CELFact>,
  coveredLib: string,
  filePath: string,
  concepts: Map<Id, ConceptEntry>,
  localIndex: LocalMembershipIndex,
  sourceIndex: Map<string, SourceOwner[]>,
  resolveDecision: (callerLib: string, ref: ReferenceName) => ResolvedDecision | undefined,
  // #236 — per-library criterion tables for reference-and-evaluate (threaded onto Ctx; a criterion
  // guard resolves its body here at eval time instead of being inline-expanded up front).
  criterionTables: Map<string, CriterionTable>,
  // ⭐ #189 gap 3 — the mechanical member set of a named terminology, threaded exactly as `resolveDecision`
  // is (this function has no graph of its own).
  terminologyMembers: (lib: string, name: string) => readonly { system: string; code: string }[] | undefined,
  // REFACTOR:grounded (#320): shared invocation clock and exact emitted-identity collision finding.
  now: Date,
  collisionDiagnostic?: string,
  pauseValidationErrors: readonly string[] = [],
  publication?: { program?: PublicationProgram; resources?: readonly EmittedResource[]; error?: string; celLibrary: string },
): CaseRun {
  const diagnostics: string[] = [];
  let subjectFact: string | undefined;
  // REFACTOR:grounded (#320): clauses belong to each reference, never a last-wins fact-name map.
  const factRefs: CELFactRefField[] = [];
  let result: CELResultField | undefined;
  for (const b of c.body) {
    if (b.type === "CELSubjectField") subjectFact = b.factName;
    else if (b.type === "CELFactRefField") factRefs.push(b);
    else if (b.type === "CELResultField") result = b; // Existing single-result evaluator contract.
  }
  const parsedExpected: CaseRun["expected"] = c.body.filter((b) => b.type === "CELResultField").length === 1
    ? result?.value.type === "CELPauseResult" ? { leaf: result.leafName, pause: true }
      : result?.value.type === "CELBranchResult" ? { leaf: result.leafName, branch: result.value.branchName } : null
    : null;
  const caseDates = resolveCaseFactDates(c, facts, now);
  const inputErrors = caseDates.diagnostics.map((d) => `${d.kind}: ${d.message}`);
  if (c.body.some((b) => b.type === "CELResultField" && b.value.type === "CELPauseResult")) {
    inputErrors.push(...pauseValidationErrors.filter((d) => !collisionDiagnostic || !d.endsWith(collisionDiagnostic)));
  }
  if (publication?.error) inputErrors.push(publication.error);
  if (collisionDiagnostic) inputErrors.push(collisionDiagnostic);
  if (inputErrors.length > 0) {
    return {
      case: c.name,
      decision: null,
      status: "error",
      expected: parsedExpected,
      produced: [],
      trace: [],
      diagnostics: inputErrors,
      conceptTruth: [],
    };
  }

  // #189 Piece 2 (disc 508) — build the directly-populated concept set by CODE-DRIVEN membership (compartment-global,
  // §4). A fact's `code` — not its `defined by` NAME — decides which local concept it populates (possibly a DIFFERENT
  // one than it names), exactly as `$apply` populates by `(type, coding)`. The name serves only to (a) default a bare
  // fact's code and (b) fix the fact's resource type. `directFacts`/`factsByConcept` are derived from the SAME
  // accepted result, so a dropped non-member never shows in the trace as concept evidence.
  const directFacts = new Set<Id>();
  const factsByConcept = new Map<Id, string[]>();
  // #189 Piece 3 (Option C, disc 512) — the value-reading boolean concepts (member-existence interfaces) in the
  // closure, and the boolean own values facts populate them with. Classification is the SHARED
  // `isValueReadingBooleanConcept` over each concept's OWN-LIBRARY siblings (the member-existence referent is
  // same-library), so the CRE agrees with the emitter/validator on which concepts read their value.
  const conceptsByLib = new Map<string, Concept[]>();
  for (const e of concepts.values()) {
    const arr = conceptsByLib.get(e.lib) ?? [];
    arr.push(e.node);
    conceptsByLib.set(e.lib, arr);
  }
  const valueReadingIds = new Set<Id>();
  const pureQuestionIds = new Set<Id>();
  for (const [cid, e] of concepts) {
    if (isValueReadingBooleanConcept(e.node, conceptsByLib.get(e.lib) ?? [])) valueReadingIds.add(cid);
    if (isPureQuestionConcept(e.node)) pureQuestionIds.add(cid);
  }
  const ownBoolValues = new Map<Id, boolean[]>();
  const candidates = new Map<Id, OwnCandidate[]>();
  const populate = (
    id: Id,
    fn: string,
    arm: OwnCandidate["arm"],
    value: FactValue,
    projection?: string,
  ): void => {
    const boolVal = value.boolValue;
    const cs = candidates.get(id) ?? [];
    cs.push({
      arm,
      fact: fn,
      ...(boolVal !== undefined ? { boolValue: boolVal } : {}),
      // ⭐ #189 gap 3 — the coded datum and the claim date ride the candidate now. Both were previously
      // computed and DROPPED: the code was used to find the owning concept and discarded, and `date is` was
      // never read here at all.
      ...(value.codedValue !== undefined ? { codedValue: value.codedValue } : {}),
      ...(value.date !== undefined ? { date: value.date } : {}),
      ...(projection !== undefined ? { projection } : {}),
    });
    candidates.set(id, cs);
    directFacts.add(id);
    const arr = factsByConcept.get(id) ?? [];
    arr.push(fn);
    factsByConcept.set(id, arr);
    // #189 Piece 3 (Option C, disc 512/513) — a value-reading concept's own-arm reads the fact's boolean value. Record
    // a boolean; a VALUELESS populate (bare fact, or a non-boolean `value is`) records nothing → the own-arm reads it
    // false (0 own values), exactly as `$apply`'s `Last(where O.value is FHIR.boolean)` = null → false, so both lanes
    // AGREE (Deny). It is an AUTHORING error, gated LOUD by the validator (+ emitter diagnostic) at author time — NOT a
    // runtime refusal here (that would diverge from `$apply`'s verdict). Surface a non-fatal debuggability diagnostic.
    // ⚠ THE OWN ARM IS THE **LOCAL** ARM. A source representation's fact is a candidate in the collection, not
    // the concept's own answer, so its boolean must never be read as one. Inert today (no value-reading concept
    // has a posrep), and fixed here so it stays right when the classification widens — see `Ctx.candidates`.
    if (valueReadingIds.has(id) && arm === "local" && !isLocalBooleanPublication(concepts.get(id)?.node)) {
      if (boolVal !== undefined) {
        const vs = ownBoolValues.get(id) ?? [];
        vs.push(boolVal);
        ownBoolValues.set(id, vs);
      } else {
        const e = concepts.get(id);
        // REFACTOR:grounded (#189 null/pause) — the outcome differs by SHAPE, and the old single wording
        // ("reads false (matching `$apply`)") stated the very runtime-agreement claim the charter
        // correction deletes. A PURE QUESTION with no stated value is UNKNOWN in both lanes and PAUSES;
        // any other value-reading cell still reads false. Both lanes agree either way — the point is that
        // they now agree on `unknown` for a question.
        const pausesHere = pureQuestionIds.has(id);
        diagnostics.push(
          `fact "${fn}" populates value-reading concept ${e ? labelOf(e.lib, e.node.name) : id} with no boolean ` +
            (pausesHere
              ? `value — it is an unanswered QUESTION, so its own-arm reads UNKNOWN and the decision PAUSES ` +
                `there (matching \`$apply\`). `
              : `value — its own-arm reads false (matching \`$apply\`). `) +
            `State \`value is true\` / \`value is false\` to ` +
            `assert its determination (the validator errors on a bare/non-boolean direct assertion).`,
        );
      }
    }
  };
  let membershipError: string | undefined;
  // REFACTOR:grounded (#320): date and intent stay scoped to the same authored reference.
  for (const ref of factRefs) {
    const fn = ref.factName;
    if (fn === subjectFact) continue;
    const fact = facts.get(fn);
    if (!fact) {
      diagnostics.push(`unknown fact "${fn}"`);
      continue;
    }
    const db = fact.body.find((x): x is CELDefinedByField => x.type === "CELDefinedByField");
    if (!db) continue; // a fact with no `defined by` satisfies no concept
    const name = getRefName(db.ref);
    if (name === "Patient") continue; // subject-type fact never satisfies a clinical concept
    const namedId = idOf(getRefLibrary(db.ref) ?? coveredLib, name);
    const namedEntry = concepts.get(namedId);
    const isLocalShape =
      !!namedEntry &&
      typeof namedEntry.node.code === "string" &&
      namedEntry.node.code.trim() !== "" &&
      typeof namedEntry.node.conceptType === "string";
    const codeField = fact.body.find((x): x is CELCodeField => x.type === "CELCodeField");
    // #189 Piece 3 (Option C, disc 512) — the fact's boolean `value is`, if any (non-boolean → undefined). A
    // value-reading concept's own-arm reads this; a fact carrying it is recorded per populated concept in `populate`.
    const valueField = fact.body.find((x): x is CELValueField => x.type === "CELValueField");
    // ⚠ Switched on the DISCRIMINANT, not `typeof`. `typeof valueField?.value === "boolean"` compiles
    // against the union — it narrows to `never` and reads as always-false — so this silently stopped
    // recording every boolean fact value while `tsc` stayed green. Caught by 25 failing CRE tests, which is
    // a far better outcome than the writer's version of the same mistake (which nothing would have caught
    // but the goldens).
    // ⭐ #189 gap 3 — a CODED `value is` and the fact's `date is` now survive onto the candidate.
    //
    // ⚠ The coded value is parsed by the SHARED `parseCheckedCanonicalToken` — the SAME function the CEL FHIR
    // writer uses to build `valueCodeableConcept`. Mirroring it by hand here would be two chances to disagree
    // about what a coded answer says, on the system axis where a mismatch is silent.
    //
    // ⚠⚠ A MALFORMED token yields NO coded value, never a wrong one. That matters because "no datum" is
    // UNKNOWN (pause) while a mis-parsed datum would be a determinate non-member — turning bad authoring into
    // a confident denial. The writer already errors loudly on the same token, so the author is told there.
    const codedFromValue =
      valueField?.value.kind === "string"
        ? parseCodedValueToken(valueField.value.value, localIndex.answerSets.get(namedId))
        : undefined;
    // REFACTOR:grounded (#320): both local and source candidates use the case-resolved date.
    const date = caseDates.dates.get(ref);
    const factValue: FactValue = {
      ...(valueField?.value.kind === "boolean" ? { boolValue: valueField.value.value } : {}),
      ...(codedFromValue !== undefined && "parts" in codedFromValue
        ? { codedValue: { system: codedFromValue.parts.system ?? "", code: codedFromValue.parts.code } }
        : {}),
      ...(date !== undefined ? { date } : {}),
    };

    // D5(3) backstop: an `absent`/`negative` intent modifier on a LOCAL determination fact inverts its clinical
    // meaning, but membership sees only the code → the concept would compute PRESENT (the opposite). Refuse loud
    // (negation semantics = #257); mirrors the validator error for a direct `run_decision` caller that skips it.
    // REFACTOR:grounded (#320): a modifier on another reference cannot taint this one.
    if (isLocalShape && ref.intent !== undefined) {
      membershipError =
        `fact "${fn}" names a local determination concept but is referenced with an intent modifier — a negated/` +
        `absent local fact would compute its concept PRESENT (the opposite); rejected (negation semantics = #257).`;
      break;
    }

    // #189 (a) (disc 510) backstop — a fact naming a RESOURCELESS DERIVED concept (no `code is`, no source binding)
    // is REJECTED: such a concept has no FHIR resource, so a direct name-assertion has no `$apply` equivalent (the
    // `asserted ∪ composed` magic this slice removes). The validator is the primary gate; the CRE backstops a direct
    // `run_decision` caller that skips it. The composite is still satisfiable via its COMPOSITION (assert its
    // operands) — only the direct name-assertion is refused. Loud (not silent don't-populate): a dropped assertion
    // would confuse.
    if (namedEntry && isResourcelessDerived(namedEntry.node)) {
      membershipError =
        `fact "${fn}" names concept "${name}", which is read-only — it has no representation (no \`code is\` and ` +
        `no source binding) and thus no FHIR resource, so it cannot be directly asserted; \`$apply\` has no ` +
        `equivalent. Assert its operands instead, or give it a \`code is\` + \`type is\` (asserted ∪ composed ` +
        `removed — #189).`;
      break;
    }

    // Remaining non-local facts — name-based population is preserved (Piece 2 does not change these). Three cells
    // reach here (panel disc 511, Claude #3): (1) a REMOTE fact (`coded from`/`source representation`, no `code is`)
    // — the Piece-3 lane, where a fact SUPPLIES a source record; (2) a BARE-TYPE fact (`defined by <FhirType>`,
    // `namedEntry` undefined); (3) a MALFORMED-LOCAL cell — a `code is` that is PRESENT-but-empty, or present with NO
    // `type is` (implicitly Observation per `IMPLICIT_LOCAL_TYPE`, which this CEL lane does not yet honor). Cells (1)
    // and (2) are correct. Cell (3) is a RESIDUAL CRE-vs-`$apply` divergence (the CRE satisfies it by name; the
    // emitter warns `unsupported-yet` / errors on empty-code and emits nothing) — pre-existing, NOT (a)'s scope (a
    // `code is` concept is assertable per charter §3; the fix is honoring the implicit type / rejecting empty code,
    // its own slice #299). Do NOT read this as "resource-bearing": cell (3) has a representation but no resource yet.
    if (!isLocalShape) {
      // #189 Piece 3 — SOURCE membership (compartment-global, the code decides): a fact carrying a coded token —
      // typically a bare `defined by "<FhirType>"` + `code is <member>`, whose fhirType is `name` — populates EVERY
      // concept whose SOURCE set contains `(name, system, code)`, the SAME mechanical set the FHIR ValueSet + CQL
      // retrieve use (a covered ServiceRequest → the `Covered Device` source rep). ADDITIVE: a fact that matches a
      // source set is intercepted here; anything else (a non-member code, or a top-level `coded from` concept whose
      // source membership is a later slice) falls through UNCHANGED to the existing name-population below — so a
      // non-covered ServiceRequest still leaves `Covered Device` unpopulated (name-populates a concept-less type id
      // that nothing reads → not covered), matching `$apply`, without regressing the pre-Piece-3 cells.
      if (codeField) {
        const scls = classifyCanonicalToken(codeField.value);
        if (scls.kind === "coded") {
          const owners = sourceIndex.get(memberKey(name, scls.parts.system ?? "", scls.parts.code));
          if (owners && owners.length > 0) {
            // ⭐⭐ A SOURCE CANDIDATE'S VALUE COMES FROM ITS POSREP'S PROJECTION — carried on the owner,
            // because the fact loop cannot re-derive it from the code.
            //
            // ⚠⚠ AN EARLIER VERSION HARD-CODED `true` HERE AND THAT WAS A SILENT WRONG VERDICT. It is right
            // for the surviving projection (`exists this` yields true per retrieved record; the retired
            // true for a member, and reaching this branch IS membership) — but `sourceMembersOfConcept`
            // indexes EVERY posrep carrying a `coded from`, projection or not, and a posrep with NO
            // projection is read as the concept's VALUE (charter §3). So a member fact carrying
            // `value is false` was contributing `true`, and a stated denial read as an approval — on a shape
            // that had REFUSED LOUD before this slice. `candidateValue` now decides, per projection.
            // ⭐⭐ #189 gap 3 — THE SOURCE CANDIDATE'S CODED DATUM IS THE FACT'S OWN CODE.
            //
            // For a resource whose retrieve coding IS its datum (`ServiceRequest.code` — which service was
            // requested), the code that made this fact a member is ALSO the value a membership predicate
            // reads. That is not a coincidence to exploit: it is the same coincidence gap 1's construction
            // relies on, where the emitted candidate carries `S.code` as its VALUE. Both lanes therefore read
            // the same datum BY CONSTRUCTION rather than by two derivations agreeing.
            const sourceValue: FactValue = {
              ...factValue,
              codedValue: { system: scls.parts.system ?? "", code: scls.parts.code },
            };
            for (const o of owners) populate(o.id, fn, "source", sourceValue, o.projection);
            continue;
          }
        }
      }
      populate(namedId, fn, "source", factValue);
      continue;
    }

    // LOCAL concept (bare OR coded): its `{system, code}` set must be DERIVABLE. `canonicalBase` is REQUIRED
    // (charter §4 — no exception, no name-presence fallback): a real PROJECT reads `crl.canonicalBase`; an INLINE/
    // projectless harness graph declares one (`graph.canonicalBase`) or gets the default `INLINE_HARNESS_BASE`, so
    // membership runs the SAME way everywhere. A concept whose member still cannot be derived (e.g. an empty
    // `code is`) fails the run LOUD — never a fabricated presence verdict.
    const namedMember = localIndex.forward.get(namedId);
    if (!namedMember) {
      membershipError =
        `local concept "${name}" has no derivable local code set (missing \`crl.canonicalBase\`, or empty ` +
        `\`code is\`); cannot evaluate fact "${fn}" — refusing to fabricate a verdict (canonicalBase is required, ` +
        `charter §4).`;
      break;
    }
    // BARE local fact (derivable base) — the DEGENERATE case: a member of the named concept by construction.
    if (!codeField) {
      populate(namedId, fn, "local", factValue);
      continue;
    }
    // AUTHORED code on a LOCAL fact = the membership/data input (code-driven, compartment-global lookup below).
    // PIECE-3: for a both-representation concept (`code is` + `source representation`) this checks the LOCAL-exact
    // set only; a source-set code is a non-member here (dropped). That is deferred-correct today (general source-rep
    // emit is deferred), but Piece 3 must add source-set membership so such a code populates via the source arm.
    const cls = classifyCanonicalToken(codeField.value);
    if (cls.kind !== "coded") {
      // Malformed (the emitter skips it → no resource → `$apply` false) or system-less (never matches a
      // system-qualified retrieve) → NON-member. The concept goes false (closed-world), matching `$apply`.
      diagnostics.push(
        `fact "${fn}" authors a ${cls.kind} code \`${codeField.value}\` — not a member of any local concept set; ` +
          `it populates nothing (closed-world → the named concept is false unless another fact populates it).`,
      );
      continue;
    }
    // Reverse-lookup by the EMITTED resource's `(type, system, code)` — type from the named concept (the fact is
    // emitted as that resource type), code the authored token. The owner may differ from the named concept.
    const key = memberKey(namedMember.fhirType, cls.parts.system ?? "", cls.parts.code);
    if (localIndex.collisions.has(key)) {
      // Two distinct concepts claim this set (a broader-than-closure registry ambiguity) — refuse rather than
      // last-writer-wins pick one arbitrarily.
      membershipError =
        `fact "${fn}" code \`${cls.parts.system}|${cls.parts.code}\` (type ${namedMember.fhirType}) is claimed by ` +
        `more than one local concept — ambiguous membership; refusing to fabricate a verdict.`;
      break;
    }
    const ownerId = localIndex.reverse.get(key);
    if (ownerId) {
      populate(ownerId, fn, "local", factValue);
    } else {
      diagnostics.push(
        `fact "${fn}" code \`${cls.parts.system}|${cls.parts.code}\` is not a member of any local concept set ` +
          `(named "${name}"); it populates nothing (closed-world → the named concept is false).`,
      );
    }
  }

  if (membershipError) {
    return {
      case: c.name,
      decision: null,
      status: "error",
      expected: parsedExpected,
      produced: [],
      trace: [],
      diagnostics: [...diagnostics, membershipError],
      conceptTruth: [],
    };
  }

  if (!result || (result.value.type !== "CELBranchResult" && result.value.type !== "CELPauseResult")) {
    return {
      case: c.name,
      decision: null,
      status: "error",
      expected: null,
      produced: [],
      trace: [],
      diagnostics: [...diagnostics, "CRE supports an activity or pause `result is` on a Decision"],
      conceptTruth: [],
    };
  }
  const decisionName = result.leafName;
  const expected: NonNullable<CaseRun["expected"]> = result.value.type === "CELPauseResult"
    ? { leaf: decisionName, pause: true }
    : { leaf: decisionName, branch: result.value.branchName };
  // #236 — no criterion-expansion-overflow disposition any more: a criterion guard is evaluated by
  // reference (memoized), never materialized, so a decision can never "exceed the envelope".
  const decision = decisions.get(decisionName);
  if (!decision) {
    return {
      case: c.name,
      decision: decisionName,
      status: "error",
      expected,
      produced: [],
      trace: [],
      diagnostics: [...diagnostics, `decision "${decisionName}" not found in the covered library`],
      conceptTruth: [],
    };
  }

  const ctx: Ctx = {
    discardedUnknown: false,
    publicationProgram: publication?.program,
    publicationResources: publication?.resources ?? [],
    publicationFacts: new Map(factRefs.map((ref) => [celResourceId(publication?.celLibrary ?? "", c.name, ref.factName), ref.factName])),
    publicationSubjectReference: subjectFact === undefined ? "" : `Patient/${celResourceId(publication?.celLibrary ?? "", c.name, subjectFact)}`,
    directFacts,
    factsByConcept,
    // ⭐ #189 gap 3 — closed over the graph, exactly as `resolveDecision` is, so the membership predicate reads
    // the SAME mechanical set the FHIR ValueSet and the CQL retrieve use.
    terminologyMembers,
    // ⭐ #189 — from the SAME index the local-code membership uses, so both lanes read one descriptor.
    answerSets: localIndex.answerSets,
    valueReadingIds,
    pureQuestionIds,
    ownBoolValues,
    candidates,
    concepts,
    cache: new Map(),
    stack: new Set(),
    cycleHits: 0,
    reportedUnresolved: new Set(),
    produced: [],
    trace: [],
    diagnostics,
    resolveDecision,
    criterionTables,
    criterionCache: new Map(),
    criterionStack: new Set(),
    tracedCriteria: new Set(),
    rootLib: coveredLib,
    // Seed the delegation cycle guard with `(rootLib, rootDecisionName)` — the `(lib,name)` re-key (#172). For the
    // same-library recursion this is a 1:1 rename of the old bare-name seed.
    delegationStack: new Set([idOf(coveredLib, decisionName)]),
    runtimeError: false,
    publicationErrors: [],
  };
  // Root frame: the covered library + its file. A same-library recursion keeps this frame; a cross-library `use
  // decision` pushes the sub's `{ currentLib, currentFilePath }` for its body (#172).
  const rootFrame: Frame = { currentLib: coveredLib, currentFilePath: filePath };
  walkBranches(decision.body.qualifier, decision.body.statements, ctx, rootFrame, ctx.trace, "");

  if (ctx.runtimeError) {
    // A delegation cycle (or other runtime fault) makes the produced set unreliable — report `error`, not pass/fail,
    // and DISCARD produced (a partial set would otherwise leak into the view-model's scenario summary).
    // REFACTOR:grounded (#320, review 571): consumers reconstruct produced actions
    // from the trace. Preserve what was reached, but explicitly invalidate its result.
    const invalidateActions = (nodes: TraceNode[]): void => {
      for (const node of nodes) {
        if (node.kind === "action" && node.evaluated) node.invalidated = true;
        if (node.children) invalidateActions(node.children);
      }
    };
    invalidateActions(ctx.trace);
    return {
      case: c.name,
      decision: decisionName,
      status: "error",
      expected,
      produced: [],
      trace: ctx.trace,
      diagnostics: ctx.diagnostics,
      conceptTruth: [], // a partial/unreliable state — a truth map off it would mislead
    };
  }

  if (ctx.publicationErrors.length > 0) {
    // A failed condition suppresses only its dependent activity. Independently satisfied all:
    // siblings remain meaningful (as measured in native $apply), while status stays error.
    // This is deliberately separate from the legacy unreliable-case discard above.
    return {
      case: c.name,
      decision: decisionName,
      status: "error",
      expected,
      produced: ctx.produced,
      trace: ctx.trace,
      diagnostics: ctx.diagnostics,
      conceptTruth: [],
    };
  }

  const producedNames = new Set(ctx.produced.map((p) => p.recommendation));
  // REFACTOR:grounded (#320): this asserts CRE's prediction. Native $apply remains authoritative.
  const hasUnknown = (nodes: TraceNode[]): boolean => nodes.some((n) => n.unknown || hasUnknown(n.children ?? []));
  const matches = expected.pause ? ctx.produced.length === 0 && hasUnknown(ctx.trace) && !ctx.discardedUnknown : producedNames.has(expected.branch);
  const status: CaseRun["status"] = expected.pause && ctx.discardedUnknown ? "error" : matches ? "pass" : "fail";
  if (expected.pause && !matches) {
    const activitySites = (nodes: TraceNode[]): string[] => nodes.flatMap((n) => [
      ...(n.kind === "action" && !n.children && !n.guardedOut && producedNames.has(n.node)
        ? [`${n.node} at ${n.nodeId}`] : []),
      ...activitySites(n.children ?? []),
    ]);
    diagnostics.push(ctx.discardedUnknown
      ? "Expected pause cannot be established: a legacy action guard discarded unknown evidence."
      : ctx.produced.length > 0
      ? `Expected pause before any activity; CRE produced ${activitySites(ctx.trace).join(", ")}.`
      : "Expected pause; CRE reached no unknown condition and produced no activity (an empty result is not a pause).");
  }
  // #187 Todo 2: per-concept case truth. Computed AFTER the runtimeError check (produced/trace are complete + status
  // reads only ctx.produced) and via the isolated `truthOf`, so it cannot change any existing output.
  return {
    case: c.name,
    decision: decisionName,
    status,
    expected,
    produced: ctx.produced,
    trace: ctx.trace,
    diagnostics: ctx.diagnostics,
    ...(ctx.discardedUnknown ? { discardedUnknown: true as const } : {}),
    conceptTruth: collectConceptTruth(ctx),
  };
}

/** Run every case in a resolved CEL graph against its covered CRL decision(s). */
export function runCel(graph: ResolvedCelGraph, opts?: { now?: Date }): CelRunResult {
  return { schemaVersion: 1, ...runCelInternal(graph, opts) };
}

function runCelInternal(graph: ResolvedCelGraph, opts?: { now?: Date }): Omit<CelRunResult, "schemaVersion"> {
  // REFACTOR:grounded (#320): one invocation clock, used only by explicit now anchors.
  const now = opts?.now ?? new Date();
  const errors: string[] = [];
  if (!graph.cel) return { success: false, runs: [], errors: ["CEL did not parse"] };
  if (!graph.coversTarget)
    return { success: false, runs: [], errors: ["`covers` target unresolved"] };

  // REFACTOR:grounded (#320): validation errors anywhere in this CEL graph prevent pause success.
  // This conservative authoring gate avoids interpreting discarded malformed input as missing evidence.
  // Warnings remain usable test data; legacy activity assertions retain their existing behavior.
  const hasPause = graph.cel.statements.some((s) => s.type === "CELCase" &&
    s.body.some((b) => b.type === "CELResultField" && b.value.type === "CELPauseResult"));
  let pauseValidationErrors: string[] = [];
  if (hasPause) {
    try {
      pauseValidationErrors = validateCEL(graph, { now }).errors.map((d) => `pause-graph-validation: ${d.filePath ?? graph.filePath}:${d.location?.start.line ?? "?"}: ${d.kind}: ${d.message}`);
    } catch (error) {
      return { success: false, runs: [], errors: [`pause-input-validation-error: ${String(error)}`] };
    }
  }
  const coveredLib = graph.coversTarget.name;
  if (coveredLib === null) {
    return { success: false, runs: [], errors: ["covered library has no name"] };
  }
  const rawDecisions: Decision[] = [];
  for (const s of graph.coversTarget.ast.statements) {
    if (s.type === "Decision") rawDecisions.push(s);
  }

  // #236 — per-library criterion tables for REFERENCE-and-evaluate. NO up-front expansion: the
  // decisions are walked RAW (a criterion guard resolves its body via `ctx.criterionTables` at eval
  // time, memoized), so a doubling-DAG criterion no longer materializes the CRE walk tree. Threaded
  // into Ctx below; the view-model shares the same tables (expandDecisions.ts).
  const criterionTablesByLib = buildCriterionTablesForGraph(graph);
  // REFACTOR:grounded (#320, review 563): a reached case can pass despite an
  // off-path invalid declaration. Surface that static emission limit without
  // changing the reached activity or converting it into a runtime failure.
  const staticCriterionDiagnostics = buildCriterionIndex(graph.coversTarget.ast.statements).entries
    .filter((entry) => entry.status === "cycle" || entry.status === "undefined-dependency")
    .map((entry) => `criterion-guard-unavailable: Static covered-library analysis: criterion ${labelOf(coveredLib, entry.name)} has ${entry.status}; a passing case does not establish that this library can be emitted.`);
  // name → decision (RAW; no expansion). Mirrors the map the old `expandCoveredDecisions` returned,
  // minus the materialization — first-write-wins (a duplicate decision name is a validation error).
  const decisions = new Map<string, Decision>();
  for (const d of rawDecisions) if (!decisions.has(d.name)) decisions.set(d.name, d);

  // Global `(lib,name)` decision map + the shared resolver over the WHOLE graph (#172). LOCAL-FIRST precedence matches
  // the provenance indexer (indexer.ts:11-13). The covered library's own decisions are added last → authoritative for
  // its name (and the only source on the inline-graph path where crlRegistry is absent). The map holds RAW decisions;
  // `wrapResolveWithExpansion` expands each resolved sub-decision against its target library's table — so a same-library
  // `use decision` yields a STRUCTURALLY-identical guard to the top-level `decisions` map (fresh nodes; the trace zip is
  // structural, not identity-based, per disc 303 Q3), and a cross-library one binds in its own lib.
  const globalDecisionMap = buildGlobalDecisionMap({
    crlRegistry: graph.crlRegistry,
    coveredLib,
    coveredFilePath: graph.coversTarget.filePath,
    coveredStatements: rawDecisions,
  });
  // #236 — no expansion wrapper: sub-decisions resolve RAW; their criterion guards evaluate by
  // reference in the sub-frame (same as the root). `criterionTablesByLib` covers every library.
  const resolveDecision = makeResolveDecision(globalDecisionMap);

  // Concept definitions across the resolved closure — needed to evaluate
  // `defined as` operands (bare = local to the defining library; qualified =
  // an explicit library). Built from the covered library (covers the inline-
  // graph path where crlRegistry is absent) plus every registry entry when
  // present. Precedence: package first, then local, then the covered library
  // last — so a local/covered concept wins over a same-named package library.
  const concepts = new Map<Id, ConceptEntry>();
  const addConcepts = (libName: string, ast: CRL, filePath: string, entryName: string | null): void => {
    for (const s of ast.statements) {
      if (s.type === "Concept")
        concepts.set(idOf(libName, s.name), {
          node: s,
          lib: libName,
          filePath,
          entryName,
          fallbackLib: ast.library.name,
        });
    }
  };
  if (graph.crlRegistry) {
    for (const e of graph.crlRegistry.byNamePackage.values())
      if (e.name) addConcepts(e.name, e.ast, e.filePath, e.name);
    for (const e of graph.crlRegistry.byNameLocal.values())
      if (e.name) addConcepts(e.name, e.ast, e.filePath, e.name);
  }
  addConcepts(coveredLib, graph.coversTarget.ast, graph.coversTarget.filePath, graph.coversTarget.name);

  // #189 Piece 2 (disc 508) — build the local membership index ONCE: derive each local concept's `{system, code}`
  // set via the SAME resolver the emitter/CQL lane uses, so the tree lane and `$apply` agree by construction.
  const localIndex = buildLocalMembershipIndex(concepts, graph);
  const sourceIndex = buildSourceMembershipIndex(concepts, graph);

  const facts = new Map<string, CELFact>();
  for (const s of graph.cel.statements) {
    if (s.type === "CELFact") facts.set(s.name, s);
  }

  const filePath = graph.coversTarget.filePath;
  const runs: CaseRun[] = [];
  // REFACTOR:grounded (#320, review 561 N1/E4): availability and include membership do not
  // establish consumption. Follow referenced declarations, not every concept in a dependency.
  // Covered publications still share single-library preparation; imported evaluation is not added here.
  const rawEntries = [...(graph.crlRegistry?.byNameLocal.values() ?? []),
    ...(graph.crlRegistry?.byNamePackage.values() ?? []), graph.coversTarget];
  const registry = graph.crlRegistry ?? { byNameLocal: new Map<string, RegistryEntry>(), byNamePackage: new Map<string, RegistryEntry>() };
  const entriesByPath = new Map(rawEntries.map((entry) => [entry.filePath, entry]));
  const scopes = buildLibraryScopes([...entriesByPath.values()], [], registry);
  // REFACTOR:grounded (#320, review 570): a leaf in a local sibling does not
  // evaluate a foreign publication. Resolve its actual declaration before allowing
  // that typed slot; all other foreign references retain the preparation boundary.
  // Delegated decisions evaluate their own guards, so they retain that boundary.
  // Same-library delegation and menu leaves use this same activity admission;
  // action guards retain their separate publication/foreign-expression checks.
  // This is a one-hop activity-label check, not full FHIR closure validation.
  // Transitive and other-resource identity collisions remain the emitter's checks;
  // sharing its complete preflight with CRE is separate work (state file, #320).
  // This admission check applies only to publications; the legacy emitAction path
  // still reports unchecked leaf labels (separate legacy-lane correction).
  const coveredScope = scopes.get(filePath);
  const activityIdentities = new Map<string, string>();
  const activityErrors = new Set<string>();
  const registerActivityLibrary = (source: string, names: ReadonlySet<string>): void => {
    // FHIR emits every activity in a participating library, including unused ones.
    // Those declarations must not collide merely because CRE reaches one leaf.
    for (const name of names) {
      const previous = activityIdentities.get(name);
      if (previous !== undefined && previous !== source) {
        activityErrors.add(`publication-ambiguous-activity: activities named "${name}" in "${previous}" and "${source}" share a result label. Rename one declaration to keep activity labels and emitted identities distinct.`);
      }
      activityIdentities.set(name, source);
    }
  };
  if (coveredScope !== undefined) registerActivityLibrary(filePath, coveredScope.localNames.activities);
  const qualifiedLibraries = (node: unknown, allowLeafActivities: boolean, names = new Set<string>()): Set<string> => {
    if (node === null || typeof node !== "object") return names;
    if (Array.isArray(node)) {
      for (const child of node) qualifiedLibraries(child, allowLeafActivities, names);
    } else {
      const value = node as Record<string, unknown>;
      let resolvedActivity = false;
      if (allowLeafActivities && value.type === "RecommendActivity" && coveredScope !== undefined) {
        const ref = value.activityName as ReferenceName;
        const name = getRefName(ref);
        const qualifier = getRefLibrary(ref);
        const target = !qualifier || qualifier === coveredLib
          ? { filePath, origin: coveredScope.origin, names: coveredScope.localNames }
          : lookupKnownLibrary(coveredScope, qualifier);
        if (target !== undefined && (!qualifier || qualifier === coveredLib || target.origin !== "package") && target.names.activities.has(name)) {
          resolvedActivity = true;
          registerActivityLibrary(target.filePath, target.names.activities);
        } else {
          activityErrors.add(qualifier && qualifier !== coveredLib && target?.origin === "package" && target.names.activities.has(name)
            ? `publication-unsupported-activity: package activity "${qualifier}"."${name}" is outside the local sibling evaluation scope.`
            : `publication-unresolved-activity: activity "${qualifier ?? coveredLib}"."${name}" does not resolve: ${target === undefined ? "target library is not available" : "target library does not declare this activity"}.`);
        }
      }
      if (value.type === "QualifiedReference" && typeof value.libraryName === "string") names.add(value.libraryName);
      for (const [key, child] of Object.entries(value)) {
        if (resolvedActivity && key === "activityName") continue;
        qualifiedLibraries(child, allowLeafActivities, names);
      }
    }
    return names;
  };
  const declarations = createPublicationContext({
    libraries: [...entriesByPath.values()].map((entry) => ({ sourceIdentity: entry.filePath, ast: entry.ast, artifact: {} })),
    resolveLibrary(from, qualifier) {
      const scope = scopes.get(from);
      const target = scope === undefined ? undefined : lookupKnownLibrary(scope, qualifier);
      return target === undefined ? { kind: "missing" } : { kind: "resolved", sourceIdentity: target.filePath };
    },
  });
  const pendingConcepts: { from: string; ref: ReferenceName }[] = [];
  const visitedDecisions = new Set<string>();
  const visitDecision = (entry: RegistryEntry, decision: Decision): void => {
    const key = JSON.stringify([entry.filePath, decision.name]);
    if (visitedDecisions.has(key)) return;
    visitedDecisions.add(key);
    const criteria = buildCriterionIndex(entry.ast.statements);
    const visitAction = (action: ActionStatement): void => {
      if (action.guard) pendingConcepts.push({ from: entry.filePath, ref: action.guard.conceptName });
      if (action.action.type === "UseDecision") {
        const resolved = resolveDecision(entry.ast.library.name, action.action.decisionName);
        const owner = resolved === undefined ? undefined : entriesByPath.get(resolved.filePath);
        if (resolved !== undefined && owner !== undefined) visitDecision(owner, resolved.decision);
      }
    };
    const visitBranch = (branch: BranchBlock): void => {
      if (branch.type === "WhenBlock") {
        for (const atom of guardConceptClosure(branch.condition, criteria)) pendingConcepts.push({ from: entry.filePath, ref: atom.ref });
      }
      if (branch.body.type === "ActionStatement") visitAction(branch.body);
      else for (const child of branch.body.statements) {
        if (child.type === "ActionStatement") visitAction(child);
        else visitBranch(child);
      }
    };
    decision.body.statements.forEach(visitBranch);
  };
  for (const decision of rawDecisions) visitDecision(graph.coversTarget, decision);
  // Preserve the covered-library preparation boundary even for an unused authored publication.
  for (const statement of graph.coversTarget.ast.statements) {
    if (statement.type === "Concept" && statement.shapeReduction !== undefined) pendingConcepts.push({ from: filePath, ref: statement.name });
  }
  // CEL's existing target resolver owns local-first precedence and the concept/activity distinction.
  for (const fact of facts.values()) {
    for (const field of fact.body) {
      if (field.type !== "CELDefinedByField") continue;
      const target = resolveDefinedByTarget(field.ref, graph);
      if (target?.kind !== "concept") continue;
      const owner = target.lib === coveredLib ? graph.coversTarget : registry.byNameLocal.get(target.lib) ?? registry.byNamePackage.get(target.lib);
      if (owner !== undefined) pendingConcepts.push({ from: owner.filePath, ref: target.name });
    }
  }
  const visitedConcepts = new Set<string>();
  const publicationPaths = new Set<string>();
  while (pendingConcepts.length > 0) {
    const pending = pendingConcepts.pop()!;
    const hit = declarations.lookupConcept(pending.from, pending.ref);
    if (hit.kind !== "hit" || visitedConcepts.has(hit.identity.key)) continue;
    visitedConcepts.add(hit.identity.key);
    if (hit.node.shapeReduction !== undefined) publicationPaths.add(hit.identity.sourceIdentity);
    for (const ref of conceptRefsOfConcept(hit.node)) pendingConcepts.push({ from: hit.identity.sourceIdentity, ref });
  }
  const hasPublication = publicationPaths.size > 0;
  let publicationProgram: PublicationProgram | undefined;
  let publicationError: string | undefined;
  let publicationEmission: ReturnType<typeof emitCelToFhir> | undefined;
  if (hasPublication) {
    const hasForeignReference = (node: unknown, allowLeafActivities: boolean): boolean =>
      [...qualifiedLibraries(node, allowLeafActivities)].some((name) => name !== coveredLib);
    const foreignCrlReference = hasForeignReference(graph.coversTarget.ast, true);
    const unsupportedScope = graph.coversTarget.ast.includes.length > 0 ||
      foreignCrlReference || hasForeignReference(graph.cel, false) ||
      [...publicationPaths].some((source) => source !== filePath);
    // Declaration admission is file-wide, not conditional on which case path runs.
    if (graph.coversTarget.ast.includes.length > 0) {
      publicationError = "publication-unsupported-scope: run_decision does not yet evaluate covered publication libraries with includes. Use emitted artifacts for this scope.";
    } else if (activityErrors.size > 0) {
      publicationError = [...activityErrors].join("\n");
    } else if (unsupportedScope) {
      publicationError = "publication-unsupported-scope: run_decision evaluates selected publications in the covered library without imports. Foreign references are supported only for resolved local sibling activities with distinct result labels. Use emitted artifacts for other scopes.";
    } else {
      try {
        const domain = makeLocalDomainContext(graph);
        publicationProgram = prepareSingleLibraryPublication(graph.coversTarget.ast, {
          canonicalBase: domain.base,
          localDomainId: domain.resolver?.domainIdFor(graph.coversTarget) ?? coveredLib,
          policyId: graph.projectRoot ? readPolicyId(graph.projectRoot) : undefined,
        }, filePath, graph.coversTarget.packageIdentity);
        if (publicationProgram.diagnostics.length > 0) {
          publicationError = publicationProgram.diagnostics.map((d) => `${d.kind}: ${d.message}`).join("\n");
        } else {
          publicationEmission = emitCelToFhir(graph, { now });
        }
      } catch (error) {
        publicationError = `publication-preparation-failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  }
  // REFACTOR:grounded (#320, review 556): share actual output identity diagnostics with authoring.
  const collisions = celIdentityDiagnostics(graph, { now });
  for (const s of graph.cel.statements) {
    if (s.type !== "CELCase") continue;
    const collision = collisions.find(
      (d) =>
        d.location?.start.line === s.location.start.line &&
        d.location?.start.column === s.location.start.column,
    );
    const collisionDiagnostic = collision ? `id-collision: ${collision.message}` : undefined;
    const emittedPublicationCase = publicationEmission?.emittedCases.find((emitted) => emitted.caseName === s.name);
    // The writer can diagnose an omitted fact while retaining the case. If any input failed,
    // localize diagnostics by re-emitting this exact case AST; never join errors on lossy case slugs
    // or allow one malformed case to poison another. Original cross-case identity errors remain above.
    const scopedEmission = publicationEmission?.diagnostics.some((d) => d.severity === "error" || d.kind === "unsupported-yet")
      ? emitCelToFhir({ ...graph, cel: { ...graph.cel, statements: graph.cel.statements.filter((statement) => statement.type !== "CELCase" || statement === s) } }, { now })
      : undefined;
    const omittedInputs = scopedEmission?.diagnostics.filter((d) => d.severity === "error" || d.kind === "unsupported-yet") ?? [];
    const casePublicationError = publicationError ?? (omittedInputs.length > 0
      ? "publication-input-emission-failed: " + omittedInputs.map((d) => `${d.kind}: ${d.message}`).join("; ")
      : hasPublication && !emittedPublicationCase
      ? "publication-input-emission-failed: " + (publicationEmission?.diagnostics.map((d) => `${d.kind}: ${d.message}`).join("; ") ?? "No case resources were emitted.")
      : undefined);
    runs.push(
      runCase(
        s,
        decisions,
        facts,
        coveredLib,
        filePath,
        concepts,
        localIndex,
        sourceIndex,
        resolveDecision,
        criterionTablesByLib,
        (_lib, name) =>
          terminologyMembersByName(name, makeLocalDomainContext(graph).base, graph.crlRegistry),
        now,
        collisionDiagnostic,
        pauseValidationErrors,
        hasPublication ? { program: publicationProgram, resources: emittedPublicationCase?.resources, error: casePublicationError, celLibrary: graph.cel.library.name } : undefined,
      ),
    );
  }
  for (const run of runs) run.diagnostics.push(...staticCriterionDiagnostics);
  return { success: true, runs, errors };
}
