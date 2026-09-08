import { ANSWER_EXAMPLE_BASE, ANSWER_EXAMPLE_TERMS, ANSWER_EXAMPLE_CEL, answerExampleSource } from "./answerExample";
/**
 * `authoring_kit` — the self-contained authoring knowledge a fresh-context KE
 * agent needs to encode one Stage-1 (local-decision-support) artifact, served
 * over MCP (no filesystem access to this repo required).
 *
 * Design (see .vibe-tools/discussions/084): the type vocabularies are imported
 * from the generated grammar wrappers (source of truth — they can't drift); the
 * prose rules are anchored to docs/validator rule-names; every example and the
 * reference artifacts are validated by the unit test (no unverified CRL ships);
 * `contentHash` is derived so the kit's identity can't lie.
 */
import { createHash } from "node:crypto";

import { DISPOSITION_CATEGORIES } from "../dispositions/categories";
import { activityTypes } from "../grammar/activityTypes";
import { conceptTypes } from "../grammar/conceptTypes";
import { conceptValueTypes } from "../grammar/conceptValueTypes";
import { ENGINE_JAR_SOURCE } from "../results/spawn";

import {
  CRITERIA_DECISION_REFERENCE_CEL,
  CRITERIA_DECISION_REFERENCE_CRL,
  DECISION_REFERENCE_CEL,
  DECISION_REFERENCE_CRL,
  DISPOSITION_ARBITRATION_REFERENCE_CEL,
  DISPOSITION_ARBITRATION_REFERENCE_CRL,
  PA_DETERMINATION_REFERENCE_CEL,
  PA_DETERMINATION_REFERENCE_CRL,
  PATIENT_AGE_BOTH_REP_REFERENCE_CRL,
  REPRESENTATION_REFERENCE_CRL,
  SOURCE_DELEGATED_DECISION_REFERENCE_CEL,
  SOURCE_DELEGATED_DECISION_REFERENCE_CRL,
} from "./reference";
import type {
  AuthoringEdge,
  AuthoringKit,
  AuthoringStage,
  AuthoringUseCase,
  ConceptLayerEntry,
  DispositionModel,
  ForceModel,
  JudgeLens,
  KitExample,
  KitRule,
  ReferenceArtifact,
  TypeAllowlist,
  VerificationLegendEntry,
  VerifyLoop,
} from "./types";

export type {
  AuthoringEdge,
  AuthoringKit,
  AuthoringStage,
  AuthoringUseCase,
  KitFacet,
} from "./types";

// "1.0" → "1.1": additive shape change — the `judgeLens` field (the waiver-adjudication rubric) joins the kit.
// "1.1" → "1.2": SHAPE change for the KE decision-composition teaching package (§0–§4) — four additions:
//   (1) `forceModel` (the §0 force levels — read first); (2) per-rule `clauses` (the machine-readable
//   default/invariant/validator-enforced force breakdown, each invariant clause carrying a RESOLVABLE `test`);
//   (3) a SECOND judge-lens family `judgeLens.composition` (the §2/§3 source-fidelity checks with no
//   mechanical home — invented-determination-boundary / hollowed-criteria / dropped-or-added-criterion); and
//   (4) `verifyLoop.methodologyRequirements` (the §4 durable per-policy checks an invariant `test` anchors to
//   via `verifyLoop:<id>`). All four ship together as the single 1.1→1.2 shape change.
// "1.2" → "1.3": CONTENT change — adds the tightly-scoped patient-age both-representation exception (the one
//   `definition is` carve-out). A both-rep concept `code is <age-code>` + `definition is age today at least <N>
//   years` recency-merges a local age Observation with the live age computed over `Patient.birthDate`; earned
//   because Patient.birthDate is a genuine clinical record that can COMPUTE the age. Adds the CONCEPT_LAYER_MODEL
//   both-rep entry, the `patient-age-both-rep` rule, the carve-out wording in concept-form / boundary, the
//   verifyLoop `doesNotProve` recency-execution note, and the `patient-age-both-rep-reference.crl` exemplar.
//   AGE ONLY — the SOLE sanctioned `definition is` exception; do NOT generalize.
// "1.3" → "1.4": SHAPE + CONTENT change — the `useCase` specialization axis (#191 lattice). Additions:
//   (1) `useCase` + `chain` on the payload (the resolved edge chain, name-order); (2) every `KitRule`,
//   `ReferenceArtifact`, and `verifyLoop.methodologyRequirement` carries an `edge` (`cpg` | `prior-auth`);
//   (3) an advisory `facets?` channel present only on the `prior-auth` chain (non-selector, home-TBD).
//   The PA/CPG-FUSED `dispositions` rule is UN-FUSED: its CPG-base prose stands alone (plain activity / no
//   invented verbs / no rationale-at-site / disposition-type-follows-act) and its PA `communicated-not-ordered`
//   invariant RELOCATES to the `prior-auth` `pa-disposition-set` rule (it is NOT a dup of that rule's
//   shared-lib-membership clause — the two anchor DIFFERENT verifyLoop checks). PA boundary items + PA reference
//   artifacts move to the `prior-auth` edge. BEHAVIOR CHANGE: `getAuthoringKit(stage)` with no `useCase` now
//   returns the neutral `cpg` base, NOT PA — pass `useCase:"prior-auth"` for the PA kit (fail-loud, never
//   silent-PA). TWO distinct contentHashes now (one per useCase); the PA seat re-syncs on the bump.
// "1.4" → "1.5": SHAPE + CONTENT change — the configurable-PA-leaves determination model (T3a). The prior-auth
//   `pa-disposition-set` rule is rewritten config-driven (determinations are configured `<category>.<key>` plain
//   activities; certify/not-certify/pended = PAS review-actions; membership/communicated-not-ordered/finality-by-mode
//   are always-on invariants that are ALSO validator-enforced when the project configures `crl.dispositions`). Two
//   new prior-auth rules (`configure-dispositions`, `disposition-mode`). The verifyLoop `shared-lib-membership` →
//   `configured-membership` and `no-pend` → `finality-by-mode`. The three advisory `facets` are RETIRED (they became
//   concrete rules); a new prior-auth `dispositionModel` field surfaces the framework categories + config contract.
//   T3b (same schemaVersion, hash re-pinned): migrated the PA reference artifacts to the config-driven model
//   (local `<category>.<key>` activities; removed the shared `medical-policy-determination.crl`, 12→11 artifacts).
// "1.5" → "1.6": CONTENT change (KE #203 Todo 6) — adds the `review-flags` authoring rule (cpg/process; teaches all
//   four tags customer-confirmable / internal-inconsistency / open-fork / fidelity-defect{direction}) + 3 cross-scope
//   examples (open-fork on a concept, fidelity-defect on a decision, gap-filed the not-a-flag contrast), the LEAN
//   form (gist + fields in the `.crl`; rich detail in a tracker
//   issue filed at creation, linked via the new optional `; ref`), and the `@gap-filed` (not-a-flag pointer)
//   contrast. NO payload-shape change. BOTH useCase hashes re-pin (schemaVersion is in the hashed base AND the
//   cpg-edge rule/examples inherit into the prior-auth chain). Registry companion: metadata-registry.json v0.3.1
//   adds the optional `ref` field to the four flag tags (so the taught `; ref` is registry-grounded).
// "1.6" → "1.7": CONTENT change (KE #203 Piece 1) — the `review-flags` rule gains a phase-boundary + PRESERVATION
//   clause: the four flags are EXTRACTION concerns (CRL-vs-narrative fidelity); the new `category:validation`
//   `@validation-concern` (CRL-vs-CUSTOMER-INTENT) is authored by a HUMAN in MV — the extraction agent does NOT
//   author it but MUST preserve it across re-extraction. Registry companion: metadata-registry.json v0.3.2 adds the
//   `@validation-concern` tag + the reference-point category discriminator + the reRunReplaceRule preservation entry.
//   NO payload-shape change. BOTH useCase hashes re-pin.
// "1.7" → "1.8": CONTENT change (KE #207) — the `review-flags` rule gains an EMIT clause documenting Todo 5's shipped
//   status-aware CQL emit (already reviewed + shipped b21b8e5): an OPEN flag at `concept` scope renders as a CQL block
//   comment on the concept's `define`; `decision`/`library` scope is gate-only (no CQL — decision-scope emit reserved
//   for a FHIR `.meta` marker, #206); `resolved` emits nothing; no FHIR flag emit yet. Teaches the KE that the SCOPE
//   they pick is also the downstream surface. NO payload-shape change, NO registry change (the behavior is data-driven
//   from the existing registry `emit` block). BOTH useCase hashes re-pin (schemaVersion is in the hashed base).
// "1.8" → "1.9": CONTENT change (KE #205/#203) — the `review-flags` rule gains a WRITE-TOOLS clause (author flags via
//   the `create_flag`/`set_flag_status` MCP tools, not by hand-editing meta lines); registry companion metadata-registry
//   .json v0.3.3 adds `@validation-concern`'s optional `; kind` triage enum (the KE-delivered validation taxonomy) + the
//   GAP-3 occurrence-`key` note. NO payload-shape change. BOTH useCase hashes re-pin.
// "1.9" → "1.10": CONTENT change (#212 step 4c) — review FLAGS left `.crl` for the `.crl/flags/` store. The `review-flags`
//   rule is rewritten to the store model: a flag is NOT a `- meta is` line but a `.crl/flags/<id>.json` record authored via
//   `create_flag` (path-required, WRITES the store, does NOT return `.crl` source); the emit clause now states flags do NOT
//   emit to CQL/FHIR (they left the registry); `@fidelity-defect`'s `direction` is enforced by `create_flag` (not the `.crl`
//   validator); the 3 flag EXAMPLES became `text` tool-call illustrations (a `.crl` flag tag would now be `meta-unknown-tag`).
//   `@gap-filed` stays a `.crl` meta tag. Registry companion metadata-registry.json v0.3.4 removed the flag entries + flagModel.
//   NO payload-shape change. BOTH useCase hashes re-pin.
// "1.10" → "1.11": CONTENT change (KE #234) — the `decision-composition` invariant was UNFALSIFIABLE: nothing anchored
//   "one fact," so the composite's own NAME supplied it (name four diseases `Substantial Co Morbidity` → they become its
//   "representations" → every disjunction is rung-1 → the invariant can never fail). Adds a UNIT ANCHORING invariant clause
//   (the one fact must be nameable WITHOUT the composite's label; co-occurrence tell: SEPARATE independently-occurring
//   events are DISTINCT criteria, alternative records of the SAME underlying occurrence are one fact; mechanical corollary: an operand
//   that is also a guard atom is a distinct criterion), amends the rule `why` + the `hollowed-criteria` judge guidance/4th
//   checkpoint, and REPLACES the `Failed Conservative Therapy` `defined as` EXAMPLE (an EXPIRED pre-#224 workaround — a `when`
//   took a single concept ref, so `defined as ( A sem-or B )` was the only way to feed a disjunction into a branch) with the
//   guard-`or` `criterion` form + adds a genuine rung-1 example (viral suppression) and the vacuity-trap DON'T. PROPAGATION
//   (the payload MISSED this): the flagship `criteria-decision-reference` artifact committed the exact outlawed pattern —
//   `Failed Conservative Therapy` re-grounded to a `criterion` (truth-identical, CEL cases unchanged; the artifact now
//   executes ZERO `defined as` end-to-end — deliberate, the language layer covers inference execution); the `concept-form`
//   rule + conceptLayerModel `defined as` + model prose + `docs/decision-shapes.md` (cited-by-name) all re-worded off the
//   FCT-as-inference gloss. Examples-harness contract EXTENDED: `valid:false` + no `expectRule` = a JUDGE-lens violation that
//   is validator-clean (only `unresolved-reference`). NO payload-shape change. BOTH useCase hashes re-pin (schemaVersion is
//   hashed AND the cpg-edge rule/examples/judgeLens inherit into prior-auth; the prior-auth-edge artifact reinforces the PA move).
// "1.11" → "1.12": CONTENT change (KE #234 follow-ups on 1.11). Three fixes, no payload-shape change. (1) FINDING 4 —
//   the vacuity-trap EXAMPLE now DECLARES its four disease operands, so pasting it is fully validator-clean (ZERO
//   unresolved-reference noise); the judge-lens `hollowed-criteria` violation is its only blemish, which is the point.
//   (2) FINDING 2 — 1.11 left the sanctioned rung-1 `defined as` construct with NO end-to-end referenceArtifact (the
//   FCT conversion removed the last one). The `criteria-decision-reference` artifact regains a GENUINE rung-1 pair
//   ("Viral Suppression Documented" = a lab result OR a chart note of ONE occurrence) wired as a third nested `when`
//   node on the approve path — it EMITS (one opaque `condition[]`, the sem-or collapsed in CQL) AND RUNS (5 CEL cases:
//   approve via the lab arm, approve via the chart arm, deny when neither record is present, + the two prior deny
//   nodes). DELIBERATE reversal of the 1.11 "no `defined as` survives in the artifact" state — one genuine exemplar
//   returns. (3) FINDING 1 — a SIZE clause on `decision-composition`: a `when` gated by `or` lowers to the
//   PlanDefinition in DNF (K arms, the downstream subtree DEEP-CLONED under each — ~K×(S+1) actions, and a mixed
//   `and`-of-`or` guard multiplies the arm count cartesianly), the transparent-but-unbounded counterpart to `defined
//   as`'s ONE opaque bounded `condition[]`; flags #236 (which MEASURED a ~51× PlanDefinition blow-up on a real policy)
//   as load-bearing for the recommended distinct-criteria shape at scale. (Finding 3 — the
//   schemaVersion-vs-contentHash convention — was RESOLVED by the operator in favour of KEEPING the convention:
//   schemaVersion bumps on any content change and the change CLASS is read from this version-history tag; hence this
//   CONTENT bump moves schemaVersion.) BOTH useCase hashes re-pin (the cpg-edge decision-composition clause + examples
//   inherit into prior-auth; the artifact rides the prior-auth edge).
// "1.12" → "1.13": CONTENT change (#215 — the patient-age UPPER-bound predicate). The `patient-age-both-rep`
//   rule + its clauses, the `concept-form` carve-out mentions, the conceptLayerModel both-rep entry, and the
//   `patient-age-both-rep-reference.crl` exemplar all WIDEN from `at least <N>` to the full comparator set:
//   `at least` (≥) / `at most` (≤) / `under` / `younger than` (<). Teaches: the upper bounds are the engine-verified
//   alternative to the INCORRECT `sem-not "Age N Or Older"` complement (unknown age → FALSE/deny under closed world,
//   not TRUE — a measured wrong determination); the truncation equivalence `at most 21` ≡ `under 22`; the anchored
//   `age at start of <ref> <cmp> <N> years` form; and that `validate_crl` now REJECTS an unsupported comparator
//   (`less than`) / non-year unit at author time (#215). The reference exemplar gains an `Under Twenty One` (`under
//   21`) both-rep concept + pediatric decision (both concepts carry the do-not-persist marker; the shared activities
//   use NEUTRAL payload text so a pediatric approval does not read "adult"). The `value type is boolean` clause is
//   annotated: enforcement of a non-boolean declaration is tracked (#241). Also CORRECTS a pre-existing prose error the
//   panel caught: the recency merge keys on `Observation.effective` (DTR/SDC extraction populates it from
//   QuestionnaireResponse.authored), NOT `Observation.issued` — 5 kit sites fixed. The unknown-age teaching is qualified
//   to the EXACT closed-world cell (no usable birthDate AND no local assertion → FALSE; a session-fresh local TRUE still
//   wins), and the anchored `age at start of` form is marked engine-supported but a COMPUTE-ONLY inference OUTSIDE the
//   both-rep carve-out. NO payload-shape change. BOTH useCase hashes re-pin (schemaVersion is hashed AND the cpg-edge
//   rule/model/reference inherit into the prior-auth chain).
// "1.13" → "1.14": CONTENT change (#230) — the review-flag STORE moved from the untracked `<policy>/.crl/flags/` (artifact
//   root, outside every KELP entity → never captured by `kelp save`, dirtied the worktree, blocked `kelp lock`) into the
//   `medical-validation/flags/` subfolder of the tracked `medical-validation` entity. The `review-flags` rule + examples now
//   teach the new location, and a new clause documents the migration: `create_flag`/`set_flag_status` REFUSE with
//   `reason: legacy-flag-store-present` while records remain at the old `.crl/flags/` path (manual migration required). NO
//   payload-shape change beyond the one added clause. BOTH useCase hashes re-pin (schemaVersion is hashed AND the cpg-edge
//   review-flags rule inherits into the prior-auth chain).
// "1.14" → "1.15": CONTENT change (#250) — the PROVENANCE/PROMOTION verify-loop note now teaches the derivedFrom
//   carrier-relative portability gate: carrier/CLI producer output is conformant (a dest-less MCP generate saved elsewhere
//   needs normalizing), the gate bites legacy + hand-edited records, validate_provenance grades `derived-from-*`
//   warning-in-transition/error-at-delivery, and normalize_provenance (per-record write; exit 0 = every record
//   normalized+oracle-verified — then re-validate, since the D2 artifact↔sidecar cross-check runs only in validate; exit 2
//   = residue: a dead path → --search-root, else adjudicate) is the repair. NO payload-shape change. BOTH useCase hashes
//   re-pin (schemaVersion is hashed AND the base note inherits into both chains).
// #257 (schemaVersion 1.15→1.16): the concept-model redesign makes `value type` REQUIRED on EVERY concept
//   (A.10 — `missing-value-type` is now a validator ERROR). Every reference-artifact/example concept declares
//   its `value type` (the case-feature determinations are `value type is boolean`). NO doctrine change — the
//   examples gain the now-mandatory shape. BOTH useCase hashes re-pin (schemaVersion is hashed + the concept
//   declarations inherit into both chains).
// #257 (schemaVersion 1.16→1.17): the concept-model PROSE — teach what `value type` MEANS (1.16 added the shape
//   mechanically). New `value-type` rule (published-shape doctrine; the ROLE heuristic — boolean=determination
//   incl. any guard-consumed concept / Quantity=measurement / CodeableConcept=coded refinement / scalar; the
//   A.10b guard⇒boolean lesson; VALUE-PRESERVING inference taught to the SHIPPED rule-B composition-leaf /
//   bare-ref / posrep checks, not the design-doc's looser sentence; NORMATIVE-vs-SHIPPED so use-site typing is
//   not over-claimed — #266; the `defined as exists` LANE MATRIX as CAPABILITY-STATUS, NOT a usable Stage-1 form
//   — run_decision status:errors on it, #270). `concept-form` gains `value type is` + the composition
//   `concept = value type + (n primitives and/or ≤1 derived)` (framed via the existing scope tags so Stage-1's
//   producer boundary is unchanged); a leading `value type` conceptLayerModel entry; the stale posrep `form` fixed
//   to the fully-explicit self-describing shape; the patient-age `#241` annotation reconciled with rule-B.
//   Correlated resource-level temporal refinement is DEFERRED (boundary-OUT; a scope note only, no syntax). Design
//   round: disc 407 (both design arms; the C4 defer/teach split resolved on the verified run_decision status:error
//   fact). BOTH useCase hashes re-pin (schemaVersion is hashed + the cpg rule/model inherit into both chains).
// #257 (schemaVersion 1.17→1.18): SHAPE + CONTENT — the artifact `verification` taxonomy + the reachable v3
//   multi-representation exemplar. SHAPE: `ReferenceArtifact` gains a REQUIRED `verification` tier
//   (`cre-run` | `engine-run` | `validate-only`), and the payload gains a `verificationLegend` (the in-payload
//   meaning of each tier — a TS docstring never reaches the MCP consumer). CONTENT: all 11 existing artifacts get
//   a tier (the 5 decision `.crl`+`.cel` pairs `cre-run`; patient-age `engine-run` = construct verified at
//   `$r5.apply` POINT-IN-TIME, honestly NOT a per-build regression over the exact artifact); the mammogram
//   multi-source + BMI exemplar ships as `representation-reference.crl` (edge cpg, `validate-only`) — reachable so
//   a remote-MCP consumer can READ the value-preserving `sem-or` union (a missing worked `sem-or` regenerated the
//   "defined-as is boolean" misconception, disc 398). The kit `boundary` (posrep + `definition is` entries)
//   cross-references it as a forward-looking capability PREVIEW (proof axis) that is still OUT of scope to AUTHOR
//   (authoring-scope axis) — the two axes are orthogonal. The `reference.ts` "proven, not asserted" header +
//   `concept-form`/`value-type` dead-path refs are corrected. Design round: disc 408 (both design arms; two
//   criticals — patient-age engine-run overstatement resolved to point-in-time construct verification, and the
//   boundary contradiction resolved by the proof-vs-authoring-axis cross-refs). BOTH useCase hashes re-pin.
// #257 age slice (schemaVersion 1.18→1.19): T1 MECHANICAL kit migration for the patient-age →
//   posrep recency change. The `definition is age today` carve-out is RETIRED (replaced by a Patient
//   age `source representation` whose `value projection is age today …` recency-merges with a local
//   `code is` override); `patient-age-both-rep-reference.crl` is migrated to that form so it validates
//   clean. This is the mechanical/compat half only — the DEEPER kit re-teach (the CONCEPT_LAYER_MODEL
//   both-rep entry, the `patient-age-both-rep` rule prose, the boundary `definition is` carve-out
//   wording, the representation-reference exemplar) is T3, in the SAME pre-release work-set (no release
//   ships between). Design + impl rounds: disc 409. BOTH useCase hashes re-pin (the migrated exemplar
//   inherits into both; schemaVersion is hashed).
// #257 age slice (schemaVersion 1.19→1.20): T3 — the DEEPER kit RE-TEACH deferred by T1, in the SAME
//   pre-release work-set (no release ships between T2 and this). Patient age is now taught as a Patient
//   `source representation` with a `value projection` (NOT a `definition is` carve-out — the carve-out is
//   retired): the `patient-age-both-rep` rule is RENAMED `patient-age-projection` and reframed to teach
//   BOTH shapes (standalone / `code is`+projection recency); the CONCEPT_LAYER_MODEL entries, `concept-form`
//   rule, methodology, boundary, `doesNotProve`, the two ReferenceArtifact `purpose` strings, and the SUMMARY
//   are swept clean of the retired `definition is age today` doctrine (a serialized-payload anti-regression
//   test now guards it). UNITS widen to `years|months` (#257 T2). The `representation-reference` exemplar +
//   its byte-pinned fixture gain a STANDALONE months age `value projection` concept (`Patient Under Six
//   Months`) — validate-only, so the engine-run patient-age artifact keeps its honest years-recency
//   $r5.apply claim (transfers via T1 byte-identity); the retirement error repoints at the served exemplars
//   by name. The served artifact FILENAME `patient-age-both-rep-reference.crl` is kept as a stable identity.
//   Version-history comments above are HISTORICAL records — left untouched. Design + impl rounds: disc 411.
//   BOTH useCase hashes re-pin.
// #257 age slice (schemaVersion 1.20→1.21): T3 impl-panel follow-up (disc 411 impl round). Honesty fixes on
//   the T3 re-teach: (1) the `value projection` catalog-boundary claim is NARROWED — only the age-today family
//   is tool-ENFORCED; any other projection phrase parses+validates but is runtime-DEFERRED / OUT-by-rule, not
//   tool-rejected (a non-age projection like `convert to canonical units` validates clean; concept-model-t1
//   test). (2) `coded from` and `value projection` are INDEPENDENT slots (grammar permits both on one rep),
//   not an exclusive-or. (3) the RECENCY concept's `type is Observation` is EFFECTIVE/implicit (the exemplar
//   omits it), reworded so it no longer contradicts concept-form's "exemplars are explicit". (4) `validate-only`
//   legend + the representation-reference `purpose` reworded so "the age construct is runtime-shipped" ≠ "this
//   artifact is engine-run" (artifact tier vs construct status). Non-payload comments (reference.ts docstring)
//   + the serialized-payload guard (regex + semantic pins) also hardened — see tests. BOTH useCase hashes re-pin.
// #271 (schemaVersion 1.21→1.22): teach the project-config REQUIREMENT that landed with the canonicalBase
//   precursor slice — a content project's `package.json` must declare `crl.canonicalBase`; the emitted local
//   CodeSystem url is `<canonicalBase>/CodeSystem/<domain>-local`, so CQL/CEL emit now hard-errors
//   `missing-canonical-url-base` without it (the urn fallback is removed — the CQL lane now matches the FHIR
//   lane, which always required it). Added to VERIFY_LOOP_NOTE_BASE (the project-root/package.json note), incl.
//   the `emit_cql`-needs-a-`path` consequence. NO payload-shape change. BOTH useCase hashes re-pin (schemaVersion
//   is hashed AND the base note inherits into both chains).
// #189 grammar+validation slice IMPL 4 (schemaVersion 1.22→1.23): the concept-model `value type` requirement is
//   now SHAPE-CONDITIONAL. The #189 validation slice shipped the concept-level `- shape is Scalar | Record |
//   RecordSet.` cardinality line (A.10 relaxation: `missing-value-type` is a validator ERROR only for a Scalar
//   concept — the default; a `shape is Record | RecordSet` concept may omit `value type` and takes its result
//   type from `type is`). The kit's global "value type REQUIRED on EVERY concept / A.10 is an ERROR" claim was
//   FALSE against the shipped validator (a contradiction for a KE authoring a non-Scalar concept) — reworded to
//   shape-conditional in the `value-type` rule (+ its validator-enforced clause), `concept-form`, and the
//   CONCEPT_LAYER_MODEL `value type` entry. Added a MINIMAL `shape is` CONCEPT_LAYER_MODEL entry (scope `out`):
//   Scalar is the default + only Stage-1 shape; Record/RecordSet DECLARE cardinality intent, are validate-only
//   (NOT emit-active — a reduction on one trips `emit-reduction-not-active`; emit activates at the #189 flip),
//   and are OUT of Stage-1 authoring. Teach-what-works: the marker exists + parses + validates, so a KE reading a
//   validate-only capability artifact understands it; authoring Record/RecordSet stays deferred. NO other
//   payload-shape change. BOTH useCase hashes re-pin (the cpg concept-model rules/model inherit into prior-auth).
// #189 full-slice sanity panel follow-up (schemaVersion 1.23→1.24): KE-facing honesty fixes from the closing
//   two-arm panel (disc 415 R4). (1) The `code is` CONCEPT_LAYER_MODEL entry now names the `no-bare-scalar-code`
//   validate-only MIGRATION PROMPT (fires on every bare Scalar boolean leaf) and reconciles it with the
//   `definition is` OUT-of-stage rule — do NOT act on it in Stage-1 (the reduction is not emit-active; authoring
//   it fails `emit-reduction-not-active`). (2) The `value-type` shipped-checks clause narrows the guard warning:
//   `decision-guard-record-shaped` fires on a TYPED record-shaped operand only; a value-type-less Record/RecordSet
//   guard operand is silent in N (a residual flip hole). Paired VALIDATOR fix (reductionShapeValidator): the
//   sanctioned age-recency posrep (`code is` + `value projection`) is now EXEMPT from `no-bare-scalar-code` (it was
//   false-warning with a suggestion that breaks the recency merge). NO payload-shape change. BOTH useCase hashes re-pin.
// #236 criterion-as-reducer flip (schemaVersion 1.24→1.25): the #236 named-criterion-define lowering shipped
//   (commit 7f9aaf1), so the kit's pre-flip "a `criterion` inline-expands byte-identical / NOT an arm reducer"
//   framing is now false and is FLIPPED. A `criterion` lowers ONCE to a named boolean CQL define referenced BY
//   IDENTITY (one condition per ref — positive `text/cql-identifier` or `not Coalesce("Lib"."C", false)`; body
//   emitted once, a linear DAG); it IS an arm reducer — a ref is always ONE parent leaf, so naming reduces the
//   arm count exactly when the inlined-then-NNF body would have >1 DNF arm (impl-panel R2/R3, disc 422: not a
//   simple "carries an `or`" — a negated criterion ref is not inherently reducing). CRUX (both design-panel
//   arms, disc 422): the faithfulness DISCRIMINATOR is re-grounded from
//   "each criterion its own action-level `condition[]`" → "anonymous OPAQUE inference boolean (`defined as`/
//   `sem-*`) vs named TRANSPARENT decomposable define (`criterion`)". Per design §2a there is NO atom-visibility
//   loss: a named criterion's atoms stay visible in its define body + the use-site `input[]` (recursive atom
//   closure) + a cockpit ANY-OF node — the visibility is RELOCATED, not lost. Re-grounded the `decision-composition`
//   + `concept-form` invariants and the `hollowed-criteria`/`dropped-or-added-criterion` judge lenses accordingly;
//   swept every "each atom visible" prose surface to distinguish inline (action `condition[]`) from named criterion.
//   Retired the `criterion-expansion-overflow`/criterion-atom bound (the guard no longer materializes). `docs/
//   decision-shapes.md` folded into the same transaction (it was cited by the flipped rules' `ref` fields).
//   CONTENT bump; NO payload-shape change. BOTH useCase hashes re-pin.
// "1.27" → "1.28": CONTENT bump covering TWO things a KE must be told.
//
//   1. ⚠ THE REFERENCE ARTIFACTS ALREADY CHANGED UNDER 1.27, AND THIS IS THE ENTRY THAT EXPLAINS IT.
//      `reference.ts` was corrected in-tree (concepts retyped to their natural `type is`, explicit
//      `type is` added where a local `code is` had been relying on the removed implicit-Observation
//      default, and the negative facts those cases need) while SCHEMA_VERSION stayed 1.27. That was
//      correctness, not teaching — but the artifacts are IN the hashed payload, so BOTH contentHashes
//      moved with no version change and no changelog. MEASURED across releases:
//          cpg         28386d52… → ac231e05…
//          prior-auth  8f003cce… → 9792fad1…
//      A KE agent pinned to 1.27 + the old hash saw a mismatch it could not account for. Shipped that
//      way in 4.114.0–4.116.0. This bump gives the move a version and a reason.
//
//   2. NEW TOOL TAUGHT: `emit_results`. The kit had never mentioned it, so the tool that produces the
//      Questionnaire/QuestionnaireResponse a medical reviewer reads was invisible to the agent whose
//      job is to produce them. Adds the `produce-results` rule + the verifyLoop `note` clause: how to
//      enable it, where the engine jar comes from, where results land, and ⚠ that the results tree is
//      PRODUCER-OWNED and hand-authored Q/QR placed there WILL be deleted.
//
//   NO payload-shape change. BOTH useCase hashes re-pin.
// "1.28" → "1.29": CONTENT bump — the emitted trees became PRODUCER-OWNED and a KE must be told before
//   they lose something. `emit_cel` now WIPES `tests/data/fhir/patient/` and repopulates; `emit_results`
//   already deleted unclaimed Q/QR. Both now write a MANIFEST beside their tree so it can be audited
//   later by anyone, without the response that produced it. New `emitted-trees-are-ours` rule carries the
//   field measurement that motivated it (a 47→48 suite with 12 renames left 60 dirs / 964 stale files) AND
//   the non-obvious consequence: stale output defeats a downstream mirror-and-prune, which reports 0 pruned
//   and is correct, because the junk is in its source. NO payload-shape change. BOTH useCase hashes re-pin.
// Sibling KE agents pin schemaVersion + contentHash and re-sync; the bump signals the new content.
// schemaVersion 1.29 → "1.30": consolidated null/pause, representation, terminology and output-root teaching;
// verification is now a set, with test-bound fhir-emit evidence alongside CRE/historical engine proof.
// REFACTOR:grounded (#320): schemaVersion 1.30 → "1.31" teaches CEL pause assertions and native acceptance.
// REFACTOR:grounded (#320, plan583): schemaVersion 1.32 → "1.33" retires legacy age and adds explicit uncoded publication.
// REFACTOR:grounded (#320, plan595): schemaVersion 1.33 → "1.34": explicit BMI validity, legacy retirement and native verification limits.
// CONTENT 1.34 → "1.35": corrected complete engine acquisition; no clinical semantics change.
// CONTENT 1.35 → "1.36": complete engine includes applicability pause; acquisition identity changes.
// CONTENT 1.36 → 1.37: named answer ValueSets and independent presentation declarations.
// schemaVersion → "1.37": named answer ValueSets, explicit question presentation, and migrated worked references.
// "1.37" → "1.38": correct removed inline-answer teaching shipped in the prior-auth 1.37 kit,
// reconcile selected-publication scope, guards, CRE limits and shared-determination judging across channels.
const SCHEMA_VERSION = "1.38";
export const DEFAULT_STAGE: AuthoringStage = "local-decision-support";
export const STAGES: readonly AuthoringStage[] = [DEFAULT_STAGE];

/**
 * The selectable use cases (#191 lattice). Each resolves — BY NAME, never by index — to an ordered edge chain;
 * a `prior-auth` kit inherits all `cpg` content plus the PA narrowings. Measure is a RESERVED sibling edge:
 * documented here, deliberately NOT a shipped chain (so an unknown-useCase throw stays honest).
 */
export const DEFAULT_USE_CASE: AuthoringUseCase = "cpg";
export const USE_CASES: Record<
  AuthoringUseCase,
  { label: string; chain: readonly AuthoringEdge[] }
> = {
  cpg: {
    label:
      "CPG — base framework (FHIR CPG IG; ≈ full CRL). A stub edge, fleshed out with the CPG build.",
    chain: ["cpg"],
  },
  "prior-auth": {
    label: "Prior authorization / medical policy — the coverage-determination narrowing.",
    chain: ["cpg", "prior-auth"],
  },
};
export const USE_CASE_NAMES: readonly AuthoringUseCase[] = ["cpg", "prior-auth"];

/** Where KE agents file gap-issues — the repo where the kit + tools are maintained. */
const FEEDBACK_URL = "https://github.com/alphora/clinical-reasoning-language/issues/new";

const SUMMARY =
  "Local decision support: express clinical intent through coded answers, supported source representations and explicit computed publications. Author decision/criterion structure for distinct criteria, named terminology for coded answer choices, and presentations for question wording. Validate and compare CRE predictions with emitted CQL/FHIR and native $apply. Supported age, request, qualification, threshold and finite-code BMI forms are in scope; broader #320 limitations are listed separately.";

/**
 * The FORCE model — kit teaching §0. How an agent must APPLY the rules. Read first. Every rule carries a
 * force at CLAUSE granularity because an agent that mechanically enforces an authoring PREFERENCE will revert
 * a human KE's deliberate, faithful refactor — destroying intent.
 */
const FORCE_MODEL: ForceModel = {
  summary:
    "A rule whose force VARIES by clause carries explicit `clauses` (a single rule may carry both a default and " +
    "an invariant clause — do not collapse them); a rule without `clauses` is uniformly its stated force (the " +
    "validator-enforced grammar/mechanics rules). The force tells the agent how hard to bind. It exists so an " +
    "agent that mechanically enforces an authoring PREFERENCE does not revert a human KE's deliberate, " +
    "faithful refactor. The force is operator-governed content, not agent-editable.",
  levels: [
    {
      level: "validator-enforced",
      meaning:
        "The grammar/validator rejects it (e.g. qualifier-required, guard-on-single-action). The agent need " +
        "not police; the tool does.",
    },
    {
      level: "invariant",
      meaning:
        "A FIDELITY-TO-SOURCE constraint (an ADD or a HOLLOW vs the policy narrative). Always enforced, on ANY " +
        "author's output, human or agent. Every invariant carries a `test` that RESOLVES to a real check — never " +
        '"looks wrong," and never a dangling/typo\'d anchor (a `test` pointing at nothing IS the K4 fake-green ' +
        "this guards against; the force-model test asserts every invariant's `test` resolves). The anchor names " +
        "the adjudication MODE: a `judgeLens.composition:<check>` (a §2/§3 source-fidelity judge call with no " +
        "mechanical home), or a `verifyLoop:<id>` methodology requirement (a structural check the KE applies per policy, §4).",
    },
    {
      level: "default",
      meaning:
        "Blank-slate generative guidance. A FAITHFUL override STANDS. The review/judge gate checks " +
        "faithfulness-to-source, NEVER conformance-to-this-default; so a faithful structure is never reverted " +
        "toward the default, and the agent need not know whether a human or an agent authored it.",
    },
  ],
  governingPrinciple:
    "Do not prefer the agent's default over a faithful human structure; do not prefer the human's structure " +
    "over the source. A human refactor is protected ONLY when faithful — an unfaithful one (invents a " +
    "determination boundary, hides distinct criteria, drops a criterion, fakes green) is flagged even if " +
    "deliberate. Authoring agents editing an existing artifact must NOT re-normalize faithful surrounding " +
    "structure to their defaults.",
};

const CONCEPT_LAYER_MODEL: ConceptLayerEntry[] = [
  {
    form: "- value type is <shape>.",
    meaning:
      "value type describes the datum/value, while shape is distinguishes Scalar, Record and RecordSet cardinality and type is names the resource. Scalar requires value type (missing-value-type). The supported selected Observation publication also declares its value type explicitly. A value type alone supplies no data: author a local code, source representation or supported producer. Boolean guards read the selected Boolean value, not the mere presence of a record; derive a separate Boolean qualification/threshold when the selected datum is coded or numeric.",
    scope: "in",
  },
  {
    form: "- shape is Scalar | Record | RecordSet.",
    meaning:
      "Scalar publishes a value, Record one selected record, and RecordSet a collection. Scalar remains a language default, not the recommended replacement for age/BMI or the new coded-answer publication contract. For supported selected publications author shape is Record, type is Observation, value type is, and shape reduction is most recent. The final selector combines eligible local, sourced and inferred candidates independently of producer operations. RecordSet history assembly and arbitrary reductions are not covered by this contract. Legacy shape markers without an active reduction can still warn shape-marker-not-emit-active; do not interpret that legacy warning as rejection of supported shape reduction is publications.",
    scope: "in",
  },
  {
    form: "- code is `local-code`.",
    meaning:
      "The local code identifies the analytical Case Feature and its answer representation; it is not a chart diagnosis. New selected answers use Record / Observation / an explicit value type / shape reduction is most recent. A code requires type is (local-code-missing-type). Missing answers stay unknown; explicit false remains false. Bare Scalar Observation Boolean questions still have a supported legacy path, but adding definition is exists this changes value-reading to record presence and cannot repair a missing answer. Non-Observation records have their own meaning and are not automatically Boolean answer slots. code is also makes the concept eligible for a presentation; omission of presentation warns and falls back to the concept name with no description.",
    scope: "in",
  },
  {
    form: '- source representation: - type is <Resource>. - [ coded from "Value Set" ] - [ value projection is <phrase> ].',
    meaning:
      "A source representation declares its resource type, optional coded from membership and value projection. Model information supplies the datum carrier; do not author value element is or value type is on the representation. coded from retrieves matching source records; value from is binds offered answers. Supported publication forms include Patient age projection, matching ServiceRequest with value projection is exists this, and finite-code Observation Quantity sources. Source and local contributions join before the final authored selector. Patient age has its own daily recalculation/same-day assertion policy; no universal local-wins rule follows. Opaque ValueSet retrieval and arbitrary projection/producer combinations remain unsupported in this publication path; parsing a phrase is not proof of emission.",
    scope: "in",
  },
  {
    form: "- defined as ( ... sem-and / sem-or / sem-not ... ).",
    meaning:
      "INFERENCE / semantic normalization: combines the sub-representations or data-components of ONE concept into ONE clinical fact (a separate construct from the selected-publication producers). It is NOT decision composition and NEVER combines distinct decision criteria — that is the decision tree's job (#168). THE TELL (anchor the unit OUTSIDE the label): name the ONE clinical reality the operands each RECORD without using the concept's own name — alternative records of a SINGLE underlying occurrence (a viral-load lab result and/or a chart note attesting the SAME suppression — the records may themselves coexist, that is fine) are one fact. Operands that are SEPARATE underlying events, each independently occurring (a patient can fail drug therapy AND, separately, physical therapy), are DISTINCT criteria → decision layer, NOT `defined as`. The tell is SAME occurrence vs DIFFERENT occurrences, not whether the records coexist. run_decision evaluates it: sem-and = all, sem-or = any, sem-not = not. The MODEL requires unknown-preserving boolean composition. CRE preserves unknown through supported Boolean/sem composition: true OR unknown is true, false AND unknown is false, and a decisive unknown remains unknown. An explicit closed-world record-existence operation is total over its specified collection; CRE legacy value-reading existence can conflate unanswered values with absent records and is not certified for that case (#320). This prediction still requires independent native verification. Branch and criterion guards preserve unknown. Report lane disagreements and verify the engine result; do not encode around them. Bare operands resolve within the defining library; cross-library operands must be qualified. VALUE-PRESERVING: `sem-or`/`sem-and` and a bare-ref alias PRESERVE the concept's declared value type (the author declares it, the composition reconciles operands) — only a TOP-LEVEL `sem-not` and the `defined as exists (…)` sub-form are inherently boolean (see rule value-type). `defined as exists ( \"Concept\" )` tests record existence (present → true, absent → false). Legacy record-existence capability: standard CQL and the CRE support record-existence reach-through (#270); this does not prove arbitrary scalar reductions, recency arbitration, or questionnaire answerability. Use an instance-bearing operand: exists over a scalar boolean can become silently always true through CQL list promotion. Emit rejects recognized scalar-boolean operands (#269); validate and execute the actual project, including cross-library forms. #317/#318 remain unresolved for computed boolean questionnaire items; a green CRE run does not establish a working question. Selected publications cannot currently be operands of legacy sem composition, bare aliases or collection-existence reductions; use supported publication producers or decision/criterion Boolean composition. Absence of evidence does not establish a broader negative determination without an explicit completeness assumption.",
    scope: "in",
  },
  {
    form: "- definition is <predicate>.",
    meaning:
      "definition is contributes inferred candidates using a supported producer; it does not select the final combined collection. This kit teaches selected-answer in qualifying, a separate named-set membership predicate over a declared value domain, Quantity at least thresholds, and body mass index with an explicit validity operand. Each pattern owns its input, missing-value and validity behavior. shape reduction is most recent selects the final Record. Legacy count/temporal/collection forms and the validate-only representation preview do not establish support for arbitrary combinations. Patient age today is a source value projection; anchored age at start of is a separate measure-context form outside these worked examples.",
    scope: "in",
  },
  {
    form: "- shape is Record. - type is Observation. - value type is boolean. - code is `age-code`. - shape reduction is most recent. - source representation: - type is Patient. - value projection is age today <at least | at most | under | younger than> <N> years|months.",
    meaning: "Patient age calculation with local answer publication. The age pattern recalculates for today; same-day assertions take precedence. Missing input stays unknown. See patient-age-projection for temporal, method and migration rules. Other patterns own their own behavior.",
    scope: "in",
  },
];

const RULES: KitRule[] = [
  {
    id: "concept-form",
    edge: "cpg",
    category: "concept-model",
    rule: "A concept declares its shape-appropriate type and at least one source of data. For new selected Case Features use shape is Record, type is Observation, value type is, code is, and shape reduction is most recent. Coded choices also use value domain is answer options and value from is \"Named Terminology\". Presentations separate question wording from clinical concept names. Sources and supported definition is producers are in scope: Patient age, ServiceRequest existence projections, finite-code Quantity sources, answer qualification, numeric thresholds and BMI with explicit validity. These are bounded supported forms, not a promise of arbitrary pipelines. Scalar remains supported in legacy examples; age/BMI retirement diagnostics require the explicit publication replacement. Distinct policy criteria belong in decision/criterion structure; defined as semantic composition may normalize ONE clinical fact in the legacy path, not fuse separate events or consume selected publications. See named-answer-options, bmi-publication, patient-age-projection and branch-guards for the precise contracts.",
    why: "Separate what supplies data, what computes a candidate, what selects the published record and what expresses the decision. A kit scope label must not forbid forms that the same kit teaches. Preserve distinct source criteria as auditable decision operands; do not infer one fact merely from a shared label.",
    ref: "concept-layer-model; the `representation-reference.crl` artifact (the reachable worked v3 exemplar)",
    clauses: [
      {
        text: "The supported selected-publication form explicitly declares shape is Record, type is Observation, value type is and shape reduction is most recent. code is supplies the local answer representation when needed. Supported source representation and definition is forms are in scope with their pattern-specific limits. Remaining legacy Scalar examples declare value type; RecordSet history and arbitrary pipelines require separate implementation evidence.",
        force: "default",
      },
      {
        text: "`defined as` at the CONCEPT level (this stage) is INFERENCE over the sub-representations/components of ONE concept (the §1 rung-1 unit). Joining a policy's DISTINCT criteria is a DECISION-level construct, not a concept-model one (see decision-composition): author it as decision STRUCTURE — a compound branch guard `when ( A and B )` (or a `criterion`) when the criteria share one consequence, sibling `when` branches when they route to different consequences — NEVER a `defined as`/`sem-*` composite, which ships ONE opaque `condition[]` (the distinct criteria vanish from the emitted artifact) and asserts a sameness distinct criteria do not have. Likewise the disposition-arbitration model carries precedence in the DECISION layer (`first:` branch ORDER over full-conjunction guards), not in the inference layer via `sem-not` FINAL-* concepts (see disposition-arbitration-reference). The violation is distinct criteria fused by opaque inference; the faithful form keeps each criterion a visible structural operand (an inline atom in the applicability expression and dependency `input[]`, or a named criterion as one identifier `condition[]` whose transparent define + use-site `input[]` expose its atoms).",
        force: "invariant",
        test: "judgeLens.composition:hollowed-criteria",
      },
    ],
  },
  {
    id: "value-type",
    edge: "cpg",
    category: "concept-model",
    rule: "`value type` names the datum/value type; shape is separately declares Scalar, Record or RecordSet. A selected Observation Record exposes its typed value to supported Boolean guards while its Case Feature expression returns the record. REQUIRED on every SCALAR concept — the remaining legacy default shape — where A.10 `missing-value-type` is a validator ERROR; the requirement is SHAPE-CONDITIONAL (a `shape is Record | RecordSet` concept may omit it, taking its result type from `type is`). The selected-publication contract explicitly requires a value type. A value type with NO producer is invalid (`x + n ≥ 1`, #202). CHOOSE BY ROLE — what the concept RESULTS IN, not its FHIR resource type: `boolean` = a determination/finding (present-or-not, met-or-not) — INCLUDING any concept a decision `when`, a `criterion` body, or an action guard (`unless`/`only when`) consumes (a guard REQUIRES boolean; rule-B `decision-guard-nonboolean`); `Quantity` = a measurement/value (a BMI, a BP, a lab value — most-recent-able); `CodeableConcept` = a coded refinement/classification; `dateTime`/`integer`/`string` = a scalar datum. THE A.10b LESSON: a determination whose UNDERLYING resource is coded is STILL `boolean` when it is consumed as a guard — the guard CONSUMPTION governs the value type, NOT the resource's codedness. And do NOT relabel a genuinely resource/value-shaped concept `boolean` merely to feed a guard: keep that concept at its real shape (it may also be needed as an instance stream, e.g. `most recent`) and DERIVE a SEPARATE boolean guard concept from it. LEGACY VALUE-PRESERVING INFERENCE (not selected-publication composition): `sem-or`/`sem-and` composition and a bare-ref alias PRESERVE the declared value type (the author declares the concept's value type, the composition reconciles operands — the validator makes a NON-boolean composition with a BOOLEAN leaf a hard ERROR, and WARNS on any other result-type disagreement it currently bridges — `composition-result-type-mismatch`, which becomes an ERROR at the #189 flip — though it does not check full datum-type equality among matching-shape non-boolean leaves); only a TOP-LEVEL `sem-not` and `defined as exists (…)` are inherently boolean — so a `defined as` concept is NOT boolean-by-default. NORMATIVE vs SHIPPED: the MODEL requires the value type checked at EVERY use site, but the validator ENFORCES a subset (the operand-constraint registry is seeded, not exhaustive — #266; the nested-call blind spot is the OUTER constrained position; and package-library resolution is a blind spot across ALL rule-B checks), so author to use-site typing as doctrine, not as a guarantee the tool catches every violation. Among the rule-B checks shipped THIS STAGE (NOT an exhaustive list): a guard operand must be boolean; a bare-ref alias must EQUAL its target's value type (FULL equality, not just boolean-ness); a NON-boolean composition requires every LEAF non-boolean (a boolean leaf under a non-boolean VALUE-TYPE parent is a hard ERROR `boolean-in-refinement-composition`; a boolean PARENT over a resource/record leaf is bridged today but WARNS `composition-result-type-mismatch` → ERROR at the flip, fixed with an explicit `defined as exists ( … )`; two differing non-booleans likewise warn); a RecordSet-shaped guard concept warns `decision-guard-record-shaped`; a no-projector posrep must EQUAL the concept value type; a TOP-LEVEL `sem-not` / `defined as exists` result must be boolean. `defined as exists ( \"Concept\" )` tests record existence (present → true, absent → false). Legacy record-existence capability: standard CQL and the CRE support record-existence reach-through (#270); this is not proof of arbitrary scalar reductions or questionnaire answerability. Use an instance-bearing operand: exists over a scalar boolean can become silently always true through CQL list promotion. Emit rejects recognized scalar-boolean operands (#269); validate and execute the actual project, including cross-library forms. #317/#318 remain unresolved for computed boolean questionnaire items. Selected publications are rejected in legacy aliases, sem composition, collection-existence reductions and per-action menu guards (publication-unsupported-context); branch/criterion guards read their Boolean values without an exists wrapper. For a selected-publication action guard, validation/CRE report publication-unsupported-context and FHIR emit reports publication-action-guard-unsupported.",
    why: "The published value type is what makes a concept's result legible AND checkable at every use site; DECLARING it (rather than inferring a return type — patterns have none) is what lets the producers disagree LOUDLY at validate time instead of silently at apply time (the #231 lane bug the redesign closes). The guard⇒boolean check is the specific rule that catches the A.10b masking — a coded-resource determination mis-typed `CodeableConcept` but consumed as a guard. Separating normative doctrine from shipped enforcement keeps the kit honest: it teaches the model to author to without claiming coverage the validator does not yet have.",
    ref: "the `representation-reference.crl` artifact (worked v3 exemplar); src/validator/useSiteTypeValidator.ts (rule-B); concept-layer-model; #202; #231; #265; #266; #269; #270; A.10 missing-value-type",
    clauses: [
      {
        text: "`value type` is REQUIRED on every SCALAR concept (the legacy default shape; A.10 `missing-value-type` ERROR for Scalar — SHAPE-CONDITIONAL, a `shape is Record | RecordSet` concept may omit it and takes its result type from `type is`) and needs at least one producer (`x + n ≥ 1`, #202). Selected-publication admission also requires an explicit value type.",
        force: "validator-enforced",
      },
      {
        text: "Choose the value type by ROLE — what the concept RESULTS IN, not its FHIR resource type: boolean = determination (incl. any guard-consumed concept); Quantity = measurement; CodeableConcept = coded refinement; dateTime/integer/string = scalar.",
        force: "default",
      },
      {
        text: "GUARD ⇒ BOOLEAN: any concept a decision `when`, a `criterion` body, or an action guard (`unless`/`only when`) consumes must be `value type is boolean` (rule-B `decision-guard-nonboolean`).",
        force: "validator-enforced",
      },
      {
        text: "A coded-resource determination consumed as a guard is boolean — the guard consumption governs, NOT the resource's codedness (the A.10b masking lesson). Do NOT relabel a genuinely resource/value-shaped concept boolean merely to feed a guard (the validator cannot SEE a relabel — the guard check then passes on the wrong shape); keep it at its real shape and DERIVE a separate boolean guard concept.",
        force: "default",
      },
      {
        text: "Legacy composition only; selected publications are not admitted to these aliases/sem operators. VALUE-PRESERVING inference (DOCTRINE, partially tool-checked): `sem-or`/`sem-and` and a bare-ref alias preserve the declared value type (author declares; composition reconciles). The validator hard-errors the boolean-leaf/non-boolean-value-type-parent cell and WARNS on other determinable RESULT-type disagreements (`composition-result-type-mismatch` → error at the #189 flip); it does NOT check full DATUM/element-level equality among matching-shape non-boolean leaves, and has documented resolution blind spots (unknown-resource, cross-library), so that finer drift is on the author. Only a TOP-LEVEL `sem-not` and `defined as exists (…)` are inherently boolean.",
        force: "default",
      },
      {
        text: "SHIPPED rule-B checks (NOT exhaustive): a bare-ref alias = FULL equality with its target; a non-boolean composition rejects any boolean LEAF (`boolean-in-refinement-composition`, value-type-keyed hard ERROR — fix by giving the leaf its resource value type or declaring the parent boolean, NOT an `exists` lift); any OTHER composition result-type disagreement the implicit-existence bridge permits (a boolean parent over a resource/record leaf; two differing non-booleans, incl. two Scalar leaves like Quantity-under-CodeableConcept; a differing record resource) is a `composition-result-type-mismatch` WARNING today that becomes an ERROR at the #189 flip (fix the boolean-parent+record-leaf cell with an explicit `defined as exists ( \"X\" )`); a TYPED RecordSet concept (a collection with a declared boolean datum value type) in a decision guard warns (`decision-guard-record-shaped`) — but a value-type-LESS RecordSet guard operand resolves untyped and is SILENT in N (a residual flip hole, not caught until the flip); a no-projector posrep = concept value type; a TOP-LEVEL `sem-not` / `defined as exists` result must be boolean; a guard operand must be boolean. A selected Boolean Record is a supported branch/criterion operand and does not receive decision-guard-record-shaped. Publication aliases and concept-space composition are refused separately.",
        force: "validator-enforced",
      },
      {
        text: "NORMATIVE vs SHIPPED: the model requires use-site type-checking EVERYWHERE, but the enforced set is a SUBSET (operand-constraint registry seeded not exhaustive, #266; nested-call / package-library blind spots) — author to the doctrine; do not assume the tool catches every use-site mismatch.",
        force: "default",
      },
      {
        text: "`defined as exists ( \"Concept\" )` tests record existence (present → true, absent → false). Legacy record-existence capability: standard CQL and the CRE support record-existence reach-through (#270); this does not prove arbitrary scalar reductions, recency arbitration, or questionnaire answerability. Use an instance-bearing operand: exists over a scalar boolean can become silently always true through CQL list promotion. Emit rejects recognized scalar-boolean operands (#269); validate and execute the actual project, including cross-library forms. #317/#318 remain unresolved for computed boolean questionnaire items; a green CRE run does not establish a working question. This is not the selected-publication path; presence is not an answer value, and an open-world nonmatch cannot establish a clinical negative.",
        force: "default",
      },
    ],
  },
  {
    "id": "named-answer-options",
    "edge": "cpg",
    "category": "concept-model",
    "rule": "Declare offered answers once in a named terminology and reference it with value from is \"<terminology>\". Inline value from: lists and per-option qualifying markers are removed. Each finite answer member needs an authored display. The concept lists only not qualifying is `<code>` exceptions beneath its value from is declaration. Recognized members other than these exceptions qualify. A missing answer remains unknown; an unrecognized or conflicting coded answer is an error, never a clinical negative.",
    "why": "The terminology owns answer identity and wording; the concept owns the classification. A KE should not duplicate a positive list or confuse an unrecognized code with a negative answer.",
    "ref": "docs/named-answer-valuesets-and-presentation.md; src/emit/answerDomain.ts; src/validator/answerOptionsValidator.ts",
    "clauses": [
      {
        "text": "Use the logical CRL library name plus concept name plus Answer Options for a concept-specific terminology. The local Answer Codes CodeSystem uses the same logical owner names and the existing capped/hash ID helper; never use a physical split CQL Library ID. External systems keep their authored canonical URLs. IDs and code/system comparisons do not depend on question wording.",
        "force": "default"
      },
      {
        "text": "Omitting not qualifying is is legal and always warns (answer-options-all-qualifying), even when no predicate consumes the question. Every member may be marked nonqualifying. Duplicate or unknown exceptions are errors; a bare exception shared by multiple systems is ambiguous and must be resolved in the authored answer domain.",
        "force": "validator-enforced"
      },
      {
        "text": "Use definition is \"Question\" in qualifying to classify the selected question answer. For the publication model, declare Record, Observation, CodeableConcept, value domain is answer options, and shape reduction is most recent on the question. The offered and interpreted domains must match. A separately named predicate, in \"Other Terminology\", remains a distinct operation and is not an alternative spelling of the question's exceptions.",
        "force": "default"
      },
      {
        "text": "An opaque external ValueSet can be bound as an offered set, but finite membership interpretation cannot guess its expansion. Referenced/mixed/unenumerated system segments are rejected wherever complete answer-domain classification is required.",
        "force": "validator-enforced"
      },
      {
        "text": "A CEL bare coded value resolves only when exactly one offered system/code member has that code. Use explicit <system>|<code> for disambiguation and invalid-input test cases. An explicit unrecognized coding does not become a determinate false in qualifying. Preserve complete clinical answer codes and authored displays when moving them into the terminology.",
        "force": "default"
      }
    ]
  },
  {
    "id": "concept-presentation",
    "edge": "cpg",
    "category": "concept-model",
    "rule": "Keep concept identity separate from human wording. Author presentation for \"Concept\": with required question text is and optional question description is double-quoted or backtick-delimited text fields. Question text must be nonempty. A base presentation supplies defaults. Optional repeatable in decision \"Name\" and in criterion \"Name\" entries are alternative contexts; a matching scoped presentation inherits omitted fields.",
    "why": "Concept names identify knowledge. Questionnaire text asks a question in context; changing wording must not change computation, codes, or canonicals.",
    "ref": "docs/named-answer-valuesets-and-presentation.md; src/emit/presentation.ts; src/fhir-emitter/decision.ts",
    "clauses": [
      {
        "text": "Explicit scopes for one target must not overlap, even if text is identical or different fields are supplied. There is no last-declaration, decision-vs-criterion, or file-order precedence. A profile cannot silently retain the first of conflicting presentations in one form.",
        "force": "validator-enforced"
      },
      {
        "text": "Question text maps to cpg-input-text, question description to cpg-input-description. The concept name remains the short label; presentation does not add a separate label field. Concept identity remains unchanged.",
        "force": "default"
      },
      {
        "text": "Presentation is optional for any concept declaring code is, across answer types; missing presentation warns even if the concept is not reached. Presentation on an uncoded concept errors. Without presentation, the emitted input has no question-text extension and the tested engine uses the concept name; description is absent, not a repeated name. Authored text maps to cpg-input-text. Authored description is preserved in cpg-input-description but the delivered CQFramework does not yet display it. Verify emitted description separately from native question text and pause/leaf behavior. Co-occurring occurrences of the same input profile must resolve compatible wording, including authored text versus concept-name fallback. A scoped presentation without a base can therefore conflict with an unpresented occurrence (presentation-overlap); identical effective text is compatible.",
        "force": "default"
      },
      {
        "text": "Imported questions inherit their owning library's presentation. Importing-library presentation overrides are deferred to issue #321; do not author unsupported overrides. The future rule is most local presentation wins by import hierarchy, not textual order.",
        "force": "default"
      }
    ]
  },
  {
    "id": "bmi-publication",
    "edge": "cpg",
    "category": "concept-model",
    "rule": "BMI uses explicit Record/Observation/Quantity publications for Weight, Height and BMI, each with shape reduction is most recent. Author definition is body mass index of \"Weight\" and \"Height\" using validity of \"Weight\". Choose either selected operand as the validity anchor; no timestamp is invented. Both measurements determine the value; only the named operand supplies validity. The separate final selector arbitrates local, sourced and calculated BMI. Add code is only for a local answer representation. Legacy BMI without this contract, including prefix or then-most-recent pipelines, is retired with emit-bmi-form-retired (validator rule bmi-form-retired). Those identifiers also report incomplete new BMI publications; use the message to distinguish missing contract fields from retired syntax. When touching existing content, migrate the relevant dependency closure and re-emit its CQL/FHIR together; unrelated policies need no bulk rewrite. CRLCommon is now version 0.3.0 and removes BodyMassIndex. Migrate touched CRL and regenerate the complete artifact set; do not retain or mix the old catalog to preserve the retired path. At deployment, check for previously generated policies sharing unversioned catalog names: replacing a catalog can break old callers, so regenerate affected deployed artifacts together.",
    "why": "The author must choose derived validity and final selection explicitly. A calculation must not silently replace answers or inherit an invented timestamp.",
    "ref": "#320; docs/CRL-NORTH-STAR.md; publicationBMI.ts",
    "clauses": [
      { "text": "Absent operands produce no candidate; selected unknown values produce an unknown candidate. Invalid measurements remain errors even when the other operand is missing. Positive kg/g and m/cm inputs are supported; output is kg/m2 truncated to eight decimals. Inputs admit magnitude at most 10^6 and eight decimal places; height in centimetres admits at most four decimal places; output magnitude is at most 10^6. These are implementation bounds, not clinical ranges.", "force": "default" },
      { "text": "Prepared imported publication operands are supported, including a threshold over calculated BMI. Foreign legacy expressions, delegated decisions and CEL-only publications outside emit closure are unsupported. Source coding currently requires finite explicit codes; an opaque ValueSet URL is not a supported source membership resolver for this publication path. This restriction applies to Weight, Height and BMI publication sources. Content depending on opaque ValueSets cannot yet migrate to this path; retain that as a migration blocker, never substitute arbitrary codes. Synthetic finite codes in the reference demonstrate syntax, not replacement membership for a clinical ValueSet.", "force": "default" },
      { "text": "CRE predicts outcomes; emitted native $apply is authoritative. Verify actual activities, values, null-condition witnesses and errors. Package/shadow CRE tests do not certify package artifact identity. Full generated QuestionnaireResponse resubmission for coded BMI remains open because untouched defaults can be extracted as new assertions; direct-data and edited-item session tests do not certify that flow or a renderer.", "force": "default" }
    ]
  },
  {
    "id": "patient-age-projection",
    "edge": "cpg",
    "category": "concept-model",
    "rule": "For an answerable age determination, declare shape is Record, type is Observation, value type is boolean, code is, shape reduction is most recent, and one Patient source representation with value projection is age today <comparison> <threshold> years or months. The age pattern owns daily recalculation: a determinate current calculation supersedes older assertions; a same-day assertion takes precedence. Patient record update time does not determine current age. Missing/insufficient birthDate leaves the calculation unknown, never false. A local answer can repair it. COMPARATORS: at least (>=), at most (<=), under / younger than (<); years use completed years and months use completed months (AgeInMonths in the pattern catalog). PROJECTION COVERAGE: this contract concerns age today, not arbitrary patterns or a universal arbitration default. Omit code is for a read-only age calculation: it publishes a record without a local answer slot or profile. Implicit/Scalar age-today and definition is age today are retired; migrate to this explicit Record form when touching content. Anchored age at start of remains separate. Use a criterion to negate the selected Boolean; publication aliases and concept-space composition remain unsupported.",
    "why": "Time changes age without any Patient update. Patterns must carry predictable temporal and selection semantics through CRL, CQL and CRE.",
    "ref": "#320; docs/CRL-NORTH-STAR.md; publicationAge.ts",
    "clauses": [
      {
        "text": "Each age family only contract is prepared from its exact supported pattern. This form admits one Patient age projection plus local answers; mixed producers require an implemented policy, not silent dropping.",
        "force": "invariant",
        "test": "verifyLoop:patient-age-projection"
      },
      {
        "text": "Generated age Observations carry an asserted or calculated determination method. CEL answers and submitted QuestionnaireResponse answers are asserted; this does not prove a human edited them. Same-day saved calculations can supply missing current computation, but cannot suppress an available fresh calculation. Yesterday's calculated age has expired; an older assertion can still supply the answer when no current calculation is available.",
        "force": "default"
      },
      {
        "text": "Unmarked legacy age data needs migration from known provenance; retrieval through the local arm does not prove assertion. Same-day unknown answers remain unknown. Multiple eligible assertions use the authored selector, including its ambiguity errors. A missing validity day cannot establish a same-day override.",
        "force": "invariant",
        "test": "verifyLoop:patient-age-projection"
      },
      {
        "text": "Test emitted $apply behavior separately from CRE, including missing input, repair, birthday recalculation, same-day false override, persisted calculation and full Q/QR answer/clear. Native operation evidence does not establish renderer visibility. Numeric age entry is a separate capability from this Boolean age-eligibility question.",
        "force": "default"
      }
    ]
  },
  {
    id: "interface-concept-naming",
    edge: "cpg",
    category: "concept-model",
    rule: "Name a concept as a clinical concept. Put the question's wording in a separate presentation declaration with required question text and optional question description. Presentation has no separate short label. Check generated questionnaires and population through emit_results; a green CRE run does not establish the questionnaire behavior.",
    why: "A prompt should name the determination the reviewer can answer. A computed condition and the records feeding it are different surfaces.",
    ref: "docs/CRL-NORTH-STAR.md §4; #317; #318",
  },
  {
    id: "decision-qualifiers",
    edge: "cpg",
    category: "decision-shape",
    rule: "A multi-branch decision must declare a qualifier: `first:` (ordered, first match wins — requires a trailing `otherwise`), `all:` (every matching branch fires), or `any:` (over actions only — offer alternatives). A `then:` body is closed by `end.`. A single-member block takes no qualifier. Every later branch of `first:`, including `otherwise`, receives null-propagating priority exclusions for prior guards. The author writes no condition on `otherwise`; the emitted action is guarded. Compound priors automatically get named CQL defines. `priority-exclusion-inexpressible` means an unresolved reference: correct its name/library qualification, not its guard shape. Earlier unknown prevents a later disposition; `all:` has no ordered exclusions.",
    ref: "docs/decision-shapes.md; validator rules qualifier-required / otherwise-required / any-over-branches / first-over-actions",
  },
  {
    id: "decision-composition",
    edge: "cpg",
    category: "decision-shape",
    rule: "The COMPOSITION LADDER (§1) — the primitive is decided by the UNIT you are combining: (rung 1) sub-representations of ONE criterion → `defined as` INFERENCE (sem-and/or/not; the model requires unknown propagation, supported Boolean composition preserves unknown; publication composition limits are in concept-form); (rung 2) DISTINCT criteria of ONE determination → decision STRUCTURE in all cases: a COMPOUND BRANCH GUARD `when ( A and B and C )` (or a named `criterion`, see branch-guards / criterion) when the criteria share ONE consequence and you want a single gate node; sibling `when` branches under `first:` when they route to DIFFERENT consequences (divergent dispositions / precedence / exclusion-first / per-criterion sub-tree). Distinct criteria are NEVER fused by `defined as`/`sem-*` — that inference collapses them to ONE opaque CQL boolean (the criteria vanish from the emitted PlanDefinition) and asserts a sameness that does not exist; `defined as` is rung-1 only. (rung 3) SEPARATE determinations the SOURCE delegates, OR a GENUINELY-SHARED determination reused across policies/pathways → chained `use decision` (see chaining-necessity — source-delegation OR genuine reuse, NOT fabricated coupling). The tree already expresses AND/OR/NOT, so \"I have boolean logic\" is NOT a chaining signal — almost all of it stays in ONE tree. (`any:` is over ACTIONS only — alternatives WITHIN one matched branch — NEVER an OR over `when` branches; see decision-qualifiers.) A `when` now takes an `and`/`or`/`not` boolean over concept/criterion refs (see branch-guards / criterion), not a single concept. A `defined as` composite over distinct criteria gated as a `when` is a VIOLATION regardless of consequence: the emitted PlanDefinition ships ONE opaque `condition[]` (the distinct criteria are invisible), and `sem-*` over distinct criteria asserts a sameness that does not exist. Each distinct criterion is a visible structural operand — an inline concept atom in the condition expression and dependency `input[]`, or its own `when` node, or a named `criterion` (itself one identifier `condition[]` whose transparent define + use-site `input[]` expose its atoms, post-#236) — NEVER fused into one opaque inference boolean (see criteria-decision-reference / criterion). Exposing ONE criterion's sub-representations AS `when` nodes (§3) is presumed-faithful: do NOT revert it. AT SCALE, when one determination has many OVERLAPPING pathways with outcome precedence + fall-through, gate each pathway on its FULL conjunction as a compound branch guard and let `first:` branch ORDER carry the precedence (see disposition-arbitration-reference) — every criterion stays a visible guard atom, a partial match falls through (no trap), and NO `sem-not` inference-layer arbitration is needed (that was the retired pre-#224 workaround for single-concept `when`).",
    why: "The test is SAME-FACT vs DISTINCT-CRITERIA (\"one fact\" is ANCHORED OUTSIDE the author's naming — it must be nameable without the composite's own label; see the UNIT ANCHORING clause. Without that anchor this test is unfalsifiable, because the author names the composite and thereby names the fact.) — are the `defined as`/`sem-*` operands alternative representations of ONE clinical fact, or a policy's distinct criteria? Two reasons a composite over DISTINCT criteria is unfaithful. (1) EMIT OPACITY: it lowers to ONE opaque CQL boolean, so the emitted PlanDefinition ships a SINGLE `condition[]` — the distinct criteria are INVISIBLE in the shipped artifact (a downstream reader, and any engine but the CRE, sees one true/false, not which criterion failed). A decision-layer branch guard keeps each criterion VISIBLE instead — an inline atom in the applicability expression and dependency `input[]`, a named criterion as one identifier `condition[]` resolving to a transparent define with its atoms in the use-site `input[]` (post-#236) — never fused into one opaque boolean. (2) SEMANTIC SAMENESS: `sem-*` asserts its operands are alternative REPRESENTATIONS of ONE fact; distinct criteria are not one fact, so the assertion is false — and now that the decision layer expresses conjunction (`and` guards) and precedence (`first:`) directly, there is a faithful STRUCTURAL home with no reason to reach for inference. So `defined as`/`sem-*` is rung-1 ONLY (one criterion's representations); distinct-criteria composition AND precedence live in the decision layer. (This retires the earlier 'a single-consequence composite is faithful' rule, which rested on the CRE's render-time operand truth-table — an affordance the SHIPPED artifact does not carry — and it lands the whole kit on one rule with no carve-out.)",
    ref: "docs/decision-shapes.md; criteria-decision-reference; disposition-arbitration-reference; chaining-necessity; #168",
    clauses: [
      {
        text: "Combine by the UNIT (§1 ladder): one criterion's representations → `defined as`; distinct criteria of one determination → decision STRUCTURE (a compound branch guard / `criterion` when they share one consequence; sibling `when` branches when they route to different consequences); separate source-delegated OR genuinely-shared/reused determinations → `use decision`. Distinct criteria are NEVER fused by `defined as`/`sem-*`. Boolean complexity alone is NOT a chaining signal.",
        force: "default",
      },
      {
        text: "A `defined as`/`sem-*` composite over a policy's DISTINCT criteria, gated as a `when`, is a VIOLATION regardless of shared consequence. Two reasons: the emitted PlanDefinition ships ONE opaque `condition[]` (the distinct criteria are INVISIBLE in the shipped artifact — the CRE's operand truth-table is a render-time affordance the artifact does not carry), and `sem-*` asserts a SAMENESS (alternative representations of ONE fact) that distinct criteria do not have. The faithful home is decision STRUCTURE: a COMPOUND BRANCH GUARD `when ( A and B and C )` (or a named `criterion`) when the criteria share one consequence — each criterion a distinct VISIBLE structural operand (an inline concept atom in the condition expression and dependency `input[]`; a named criterion as one identifier `condition[]` whose transparent decomposable define + use-site `input[]` expose its atoms — post-#236, NOT collapsed into the parent), never FUSED into one opaque inference boolean; sibling `when` branches when they route to DIFFERENT consequences (divergent dispositions / precedence / exclusion-first / per-criterion sub-tree). Flag and revert (even against a human) a distinct-criteria `defined as`/`sem-*` composite. (The REVERSE — exposing ONE criterion's sub-representations as `when` nodes — is faithful; do NOT revert it. `defined as`/`sem-*` over ONE criterion's representations is rung-1 and stands.)",
        force: "invariant",
        test: "judgeLens.composition:hollowed-criteria",
      },
      {
        text: "UNIT ANCHORING — the ONE fact must be identifiable WITHOUT the composite's own label. `sem-` is SEMANTIC: the operator ASSERTS its operands are the same underlying clinical reality RECORDED DIFFERENTLY (a lab value OR a chart note attesting one viral suppression; the local age Observation OR the computed `Patient.birthDate`). A composite's NAME must NEVER be accepted as the fact its operands represent: name seven distinct diseases `Substantial Co Morbidity` and they become 'representations' of it — at which point EVERY disjunction is rung-1 and the distinct-criteria invariant CANNOT BE VIOLATED. A test whose subject the author names is a test the author always passes. Adjudicate by asking: is this ONE clinical event/state that could be RECORDED in more than one place, or are these DIFFERENT states, any of which independently satisfies the rule? Different diseases, expense categories, programmes, diagnoses, clinician types, required plan components are DIFFERENT -> decision STRUCTURE. Source wording offering alternatives ('one or both of the following', 'either of the following', 'such as', 'including') marks ALTERNATIVES the policy presents; it is NOT a licence for `defined as`. Rung-1 inference is NARROW: on a real policy most candidate composites FAIL this test, and a review clearing most of them is itself evidence the label was allowed to stand in for the fact. MECHANICAL COROLLARY, decisive alone and needing no source read: if an operand ALSO appears as a guard atom anywhere in the decision, it is a distinct criterion — the author already had to name it as its own condition.",
        force: "invariant",
        test: "judgeLens.composition:hollowed-criteria",
      },
      {
        text: "OR-of-PATHWAYS: when a policy offers criteria as ALTERNATIVE multi-criterion pathways ('medically necessary for ANY ONE of the following indications'), give each pathway its OWN sibling `when` branch gated on its FULL conjunction as a COMPOUND BRANCH GUARD (`when ( c1 and c2 and c3 ) then …`), or name that conjunction a `criterion` and gate on the name. This is required for ACCURACY: under `first:` a matched branch COMMITS and `otherwise` is TERMINAL, so gating a pathway on a PARTIAL condition strands a patient who fails it but qualifies under the next pathway — the full-conjunction guard is what makes a partial match FALL THROUGH. Both keep every criterion visible — the inline compound guard as an auditable expression with dependency `input[]`, the named criterion as one identifier `condition[]` resolving to a transparent define with its atoms in the use-site `input[]` (post-#236) — so do NOT additionally re-expose them as nested `when` nodes (behaviour-neutral duplication). Do NOT gate the pathway on a `defined as` entry-gate composite — that hides the criteria in one opaque `condition[]` and asserts false sameness (per the invariant above).",
        force: "default",
      },
      {
        text: "Legacy DNF materialization only. SIZE / #236 (emit mechanics of the recommended shape — load-bearing): an INLINE compound `or`-guard (`when ( A or B )`, or a mixed `and`-of-`or`) lowers to the FHIR PlanDefinition in DISJUNCTIVE NORMAL FORM — the guard expands into K arms (K = the number of DNF terms, NOT necessarily the count of source disjuncts: a mixed `and`-of-`or` guard multiplies the arm count CARTESIANLY, ~2^N in the worst case), and each arm gets its own per-atom `condition[]` AND a DEEP-CLONED copy of the ENTIRE downstream subtree beneath the guard. So K arms over an S-action descendant subtree emit ~K×(S+1) actions. Placement: the arms splice as ordered SIBLINGS under `first:`; under other qualifiers they are wrapped in ONE synthesized `cqf-applicabilityBehavior \"any\"` grouping action. That duplication is the transparency win for an inline guard (every atom is a visible `condition[]`, no hidden disjunction), but it is MULTIPLICATIVE — an inline `or` high in the tree clones everything below it. A named `criterion` is the FACTORING remedy (post-#236): a criterion ref is ONE DNF leaf — its `or` lives inside the criterion's named define, emitted ONCE and referenced by identity, so it does NOT expand at the parent and does NOT clone the subtree (multiplication → addition; its atoms stay visible in the define body + use-site `input[]`). Contrast a rung-1 `defined as`, which lowers to ONE opaque `condition[]` — bounded but HIDING the disjunction (right for one-fact-attested-two-ways, wrong for distinct criteria). So for distinct criteria: an inline compound guard is transparent-but-multiplicative; a named criterion is transparent-AND-linear; a `defined as` is bounded-but-opaque and reserved for rung-1. #236 was MOTIVATED by a measurement on a real prior-auth policy — PRE-#236, inline-expanding a reused criterion grew one emitted PlanDefinition ~51× (130 KB → 6.7 MB, 2.5k → 122k lines) with no logic change; the named-define lowering (#236, resolved) retired that expansion. Publication-reachable branch guards, including references through a criterion, preserve the whole Boolean expression in one text/cql-expression applicability condition, with dependency input[] and null-propagating priority exclusions. Legacy guards use per-atom condition[] and DNF arms. Both retain source criteria in decision logic; the number of condition[] entries is not a source-fidelity test.",
        force: "default",
      },
      {
        text: "Exposing ONE criterion's sub-representations as `when` nodes (§3, inference→decision) remains presumed-faithful — do NOT revert it (caveat: flag only if it mis-casts what the source states as ONE criterion into several independent presented criteria).",
        force: "default",
      },
      {
        text: "The disposition-arbitration model (many OVERLAPPING pathways with outcome PRECEDENCE + fall-through) is expressed in the DECISION LAYER: each pathway a sibling `when` on its full-conjunction compound guard, the precedence carried by `first:` branch ORDER (highest-precedence outcome first), the residual by `otherwise` (see disposition-arbitration-reference). Every criterion stays a visible guard atom and a partial pathway match falls through (no overlap-pop). Do NOT compute the precedence in the inference layer via pairwise-disjoint `sem-not` FINAL-* concepts — that was the pre-#224 workaround for single-concept `when`; it reduces to the structural form with an IDENTICAL truth function and now reads as inference doing decision work.",
        force: "default",
      },
    ],
  },
  {
    id: "chaining-necessity",
    edge: "cpg",
    category: "decision-shape",
    rule: 'The chaining overlay (§2) — a `use decision` (bare same-library `use decision "Sub"`, or a QUALIFIED cross-library chain, #172) is the right primitive for TWO overlapping reasons: (a) the SOURCE delegates a SEPARATE determination BY NAME ("covered if the member meets the Eligibility Policy," "per the Step-Therapy Protocol"); and/or (b) REUSE of a GENUINELY SHARED determination — one determination that multiple policies or pathways genuinely reference, factored into a shared decision/library and chained. The SUR mandate-determination is exactly (b): one shared determination chained cross-library, which IS reuse. Reuse is a FIRST-CLASS reason to chain, not merely tolerated taste. One policy\'s own internal AND/OR/NOT logic still stays in ONE tree, however complex — the tree already expresses boolean composition, so "I have boolean logic" is not a chaining signal (see decision-composition). THE LINE IS NOT reuse-vs-no-reuse; it is GENUINELY-SHARED vs FABRICATED-SHARED: factor + reuse + chain a determination that is genuinely ONE shared thing; do NOT fabricate a shared sub-decision across INDEPENDENT policies whose criteria merely look alike — those are two sources that may diverge, so duplicate them inline (factoring lookalikes invents a false coupling that changes one when you change the other). (See source-delegated-decision-reference and disposition-arbitration-reference.)',
    why: "Two failure modes, opposite directions. (1) FABRICATING a determination boundary the structure does not genuinely share — casting one policy's internal pathways as separate sub-determinations, or coupling two independent lookalike policies — INVENTS structure the sources do not support and can change the disposition/provenance surface. (2) DUPLICATING a genuinely-shared determination instead of reusing it (a misapplied no-DRY instinct) loses the single source of truth the share represents (e.g. SUR's mandate determination). The boundary is a fact about what is genuinely shared — not an authoring convenience in either direction.",
    ref: "§2; source-delegated-decision-reference; disposition-arbitration-reference; #172",
    clauses: [
      {
        text: "Chain a `use decision` for EITHER source-delegation (the source names/delegates a separate determination) OR reuse of a GENUINELY shared determination (one determination multiple policies/pathways genuinely reference — incl. cross-library, #172). Reuse is a legitimate first-class driver, not merely tolerated taste. One policy's own internal boolean logic still stays in ONE tree.",
        force: "default",
      },
      {
        text: "Do not FABRICATE a determination boundary the structure does not genuinely share: casting one policy's internal pathways as separate chained sub-determinations the source never delegates AND that are not a genuinely-shared determination — an ADD that changes the disposition/provenance surface — is unfaithful; flag it even if a human did it deliberately. (A behavior-identical internal helper that does NOT change the surface is taste — leave it.)",
        force: "invariant",
        test: "judgeLens.composition:invented-determination-boundary",
      },
      {
        text: "Cross-policy: distinguish GENUINELY-SHARED from FABRICATED-SHARED. A determination multiple policies genuinely reference (one shared thing) → FACTOR into a shared decision/library and chain it (reuse, incl. cross-library) — correct. Two INDEPENDENT policies whose criteria merely coincide → DUPLICATE inline (two sources that may diverge); do NOT factor lookalikes into one shared sub-decision — that invents a false coupling.",
        force: "invariant",
        test: "judgeLens.composition:invented-determination-boundary",
      },
    ],
  },
  {
    id: "guards",
    edge: "cpg",
    category: "guards",
    rule: "Per-action guards (only when / unless) are available only on multi-action menu members and take a concept, not a criterion. Keep an unguarded option. This is a legacy capability: selected publications in action-guard positions are rejected by validation with publication-unsupported-context; FHIR emit reports publication-action-guard-unsupported. In CRE, an unanswered action guard in a closure with any prepared publication is an error, even when that publication is unused. Without publications the legacy path can discard unknown as false and cannot certify a pause assertion. Use supported ordered branch conditions for question-driven decisions requiring pause; do not teach legacy coercion as the intended missing-answer semantics. See branch-guards.",
    ref: "docs/decision-shapes.md; validator rule guard-on-single-action",
  },
  {
    id: "branch-guards",
    edge: "cpg",
    category: "guards",
    rule: "A when branch condition combines concept/criterion references with and, or, not and parentheses. A homogeneous chain may be bare; mixed and/or requires parentheses, as does not over a compound operand. Strong Kleene applies: not unknown is unknown. Publication-reachable branch guards, including references through a criterion, preserve the whole Boolean expression in one text/cql-expression applicability condition, with dependency input[] and null-propagating priority exclusions. Legacy guards use per-atom condition[] and DNF arms. Both retain source criteria in decision logic; the number of condition[] entries is not a source-fidelity test. Per-action only when / unless is a separate restricted menu construct (see guards). Publication-reachable means at least one operand in the guard dependency closure is an admitted selected publication: follow criterion references and imported operands too. This is an implementation choice, not a separate authored switch; migrating a dependency can change the lowering. Whole-expression evaluation prevents a true alternative from hiding an evaluated publication error (for example ambiguous selection or uninterpretable data). An evaluated error fails the case and cannot be bypassed by later first: branches; it is different from unknown and must not be treated as a pause. DNF arm-count relief is irrelevant for a guard already using whole-expression lowering.",
    why: "Distinct policy criteria belong in auditable decision/criterion expressions. Keep source operands and dependencies traceable while preserving unknown and authored precedence; do not assert that one applicability condition necessarily hides the decision.",
    ref: "docs/decision-shapes.md; #224",
    clauses: [
      {
        text: "A MIXED `and`/`or` branch condition MUST be parenthesized (a bare mixed chain is a builder error), and a `not` over a COMPOUND operand must parenthesize it (`not ( A or B )`); `not` over a single ref needs none (`not X`). `not` IS in the branch-condition grammar (#224 iii.3). The tool enforces the parenthesization, not the agent.",
        force: "validator-enforced",
      },
      {
        text: "Publication-reachable branch guards, including references through a criterion, preserve the whole Boolean expression in one text/cql-expression applicability condition, with dependency input[] and null-propagating priority exclusions. Legacy guards use per-atom condition[] and DNF arms. Both retain source criteria in decision logic; the number of condition[] entries is not a source-fidelity test. A single-determination first: exclusion uses branch not, not menu-only unless.",
        force: "default",
      },
      {
        text: "Legacy DNF materialization only; whole-expression publication guards do not use this expansion. OVER-ENVELOPE response: the emit MATERIALIZATION envelope (the finite bound on an INLINE compound guard's expanded DNF — an ARM cap only, owned + reported by the emitter as `compound-guard-expansion-overflow`; a guard's own `and`/`or` nesting is parser-bounded, not a separate emit cap) is a RESOURCE bound, NOT an authoring-complexity gate. Author to fidelity; a FAITHFUL model that approaches it is a capability-gap SIGNAL, not an error — raise it / consult the kit, do NOT blind-restructure to satisfy the bound. Two faithful ways to keep logic OUT of the parent DNF: (1) a `use decision` sub-decision ONLY for a genuinely-shared / source-delegated determination (never a fabricated one; see chaining-necessity); and (2) name a reused OR large-`or` sub-expression a `criterion` — post-#236 a criterion ref is ONE DNF leaf (its `or` lives inside its named define, emitted once), so it DOES provide arm-count relief (this is the emitter's own factoring path, not a fabricated boundary — the atoms stay visible in the define + use-site `input[]`). The retired `criterion-expansion-overflow`/criterion-atom bound is GONE — a criterion no longer materializes into the DNF at all.",
        force: "default",
      },
    ],
  },
  {
    id: "criterion",
    edge: "cpg",
    category: "decision-shape",
    rule: "A criterion names decision logic and retains its own CQL define and dependency inputs. A `criterion` is a NAMED, reusable branch-guard sub-expression: `criterion \"Name\": - when ( <and/or/not condition> ).` (outer parens REQUIRED on the declaration; a criterion body may use `not`/`and`/`or`, #224 iii.3 — emitted STRUCTURALLY into its define, with bare operands that preserve unknown, with NO De Morgan / DNF flattening of the body; only a LEGACY parent guard's own leaves lower to DNF, and a criterion ref is one such leaf). Reference it UNQUALIFIED in any `when` branch (bare or inside a compound). It LOWERS ONCE to a NAMED boolean CQL define and is referenced BY IDENTITY — a criterion ref is a single guard LITERAL (one positive `text/cql-identifier` `condition[]`, or `not \"Lib\".\"Name\"` when negated, #224 iii.3), NOT its inline-expanded body (this is the decision-layer twin of naming a `concept … defined as` — a named reference, not a materialized macro; #236). N references → the body is emitted ONCE (a DAG of named defines, linear in distinct criteria); criterion→criterion refs are define→define refs. BRANCH-CONDITION position ONLY; UN-ASSERTABLE (a CEL case cannot assert a criterion — it is not a first-class value; the named define is emitted LOGIC identity, NOT a concept identity or an assertable value); illegal inside `defined as`/`sem-*`, a narrative, or an action guard (`criterion-misuse`). LIBRARY-LOCAL: an unqualified or SELF-qualified (`\"ThisLib\".\"X\"`) ref resolves; a FOREIGN-qualified ref is rejected (`criterion-misuse: cannot be library-qualified` once the sibling lib is included; `external-library-not-included` before). A criterion is not cross-library exportable — to REUSE guard logic across libraries, share a CONCEPT only when it is ONE genuine clinical fact and its representations (NEVER as a container for distinct-criteria guard logic — that is the retired composite the invariant forbids), or a `use decision` for a genuinely-shared determination; otherwise duplicate inline, or report the missing cross-library structural capability. In the legacy DNF path it IS an emit-arm reducer: a criterion ref is ALWAYS one parent DNF leaf (positive → one `text/cql-identifier` `condition[]`; negated → one `not <ref>` `text/cql-expression` `condition[]`), so it never itself multiplies the parent arm count. Whether NAMING reduces the count vs inlining is a property of the BODY: naming reduces exactly when the inlined-then-NNF equivalent would have >1 DNF arm — the common cases are a positive ref to an effective-disjunction body (an `or` not under a `not`) and a negated ref to an effective-conjunction body (`not ( A and B )`). Any body whose inlined NNF is a pure conjunction is arm-neutral (a positive pure-`and`/single-ref body — and equally e.g. a negated `or`, `not ( X or Y )`). The criterion's atoms stay VISIBLE — in its own decomposable define body, in the use-site `input[]` (its recursive atom closure), and as an expandable named node in the cockpit view-model (`op:\"criterion\"`; the MV cockpit rendering of it trails, #274) — so naming does not hide them; it RELOCATES where they surface (§decision-composition). Publication-reachable branch guards, including references through a criterion, preserve the whole Boolean expression in one text/cql-expression applicability condition, with dependency input[] and null-propagating priority exclusions. Legacy guards use per-atom condition[] and DNF arms. Both retain source criteria in decision logic; the number of condition[] entries is not a source-fidelity test.",
    why: "A `criterion` is authoring DRY for a distinct-criteria guard sub-expression reused across branches/decisions — a readability aid AND (post-#236) an emit-tractability one: it lowers to a named define emitted once and referenced by identity, so a reused or large-`or` sub-expression collapses to a single guard leaf instead of cloning its body across DNF arms. Keeping it un-assertable + branch-only + library-local keeps it a pure guard name (emitted LOGIC identity, not a concept/value kind or a cross-library coupling). Its define is a TRANSPARENT decomposable boolean over named leaves (with the atom closure carried in the use-site `input[]`), which is exactly what distinguishes it from a `defined as`/`sem-*` inference composite (one opaque boolean asserting a sameness) — so naming a criterion is a faithful STRUCTURAL factoring, not a hiding of distinct criteria.",
    ref: "docs/decision-shapes.md; validator rules criterion-cycle / criterion-misuse; #224",
    clauses: [
      {
        text: "VALIDATOR-ENFORCED: a criterion in a concept-only slot (`defined as`/`sem-*`/narrative/action-guard) or a FOREIGN library-qualified ref is `criterion-misuse`; a cycle/self-reference is `criterion-cycle`; a CEL `defined by` a criterion is `criterion-not-a-defined-by-target`; a name is EITHER a concept or a criterion (`duplicate-name`). The tool rejects these — the agent need not police them.",
        force: "validator-enforced",
      },
      {
        text: "A `criterion` names a reusable `and`/`or`/`not` branch guard, referenced UNQUALIFIED (or self-qualified) in a branch condition; it lowers ONCE to a named boolean CQL define referenced BY IDENTITY (body emitted once) — a readability/DRY + emit-tractability aid: the criterion ref stays ONE parent leaf, and in the legacy DNF path naming reduces the arm count exactly when the inlined-then-NNF body would have >1 DNF arm (a positive effective disjunction, or a negated effective conjunction); a body whose inlined NNF is a pure conjunction is arm-neutral. Still NOT a cross-library export. Its atoms stay visible in the define body + use-site `input[]` + an expandable named cockpit view-model node. Publication-reachable guards preserve the full expression instead.",
        force: "default",
      },
      {
        text: "The named define is emitted LOGIC identity referenced by the FHIR applicability condition — NOT a concept identity, NOT a first-class assertable value, NOT a separate FHIR resource (it lives in the existing library). So a criterion stays UN-ASSERTABLE and branch-only even though it now has a name in the emitted CQL.",
        force: "default",
      },
    ],
  },
  {
    id: "guard-or-vs-sibling-or",
    edge: "cpg",
    category: "decision-shape",
    rule: "A combined when (A or B) expresses alternatives within one Boolean condition. Ordered sibling when A / when B branches express precedence, including when data is missing. With selected Boolean A unknown and B true, the combined condition is true but first: sibling branches pause at A. Do not split or merge them merely for presentation or DNF size. Use a compound guard when either alternative can establish the rule without resolving the other; use ordered siblings when the earlier determination must be resolved first or branches route differently. Under all:, two satisfied sibling branches can each fire, while one combined OR branch fires its body once. Preserve authored clinical intent and test missing-data cases as well as fully known inputs.",
    ref: "docs/decision-shapes.md §3; #224",
  },
  {
    id: "dispositions",
    edge: "cpg",
    category: "dispositions",
    rule: "Model dispositions as plain `activity` declarations. CRL has no approve/deny/pend verbs — do not invent them. Do not author rationale at the decision/recommend site; the reason a branch fired IS its triggering `when` concept, which the emitter can surface (from the concept's `meta is`). DISPOSITION TYPE follows the ACT: a CDS recommendation to ORDER a service uses `request CPGServiceRequest` (see decision-reference); a disposition that is COMMUNICATED rather than ordered uses `request CPGCommunicationRequest`. The emitter derives the request type from the act — do not over-specify it.",
    why: "CRL is general (cognitive support, CDS, prior-auth, quality measures), not tied to any one disposition vocabulary; keep the core minimal. The disposition's request type follows what the ACT is — an ORDER vs a COMMUNICATION — which the emitter derives; inventing approve/deny/pend verbs bakes one domain's taxonomy into the language.",
    ref: "crl-not-a-pa-language",
    clauses: [
      {
        text: "Model dispositions as plain `activity` declarations; CRL has no approve/deny/pend verbs — do not invent them.",
        force: "default",
      },
      {
        text: "Do not author rationale at the decision/recommend site; the reason a branch fired IS its triggering `when` concept (the emitter surfaces it from the concept's `meta is`).",
        force: "default",
      },
    ],
  },
  {
    id: "pa-answers-not-records",
    edge: "prior-auth",
    category: "concept-model",
    rule:
      "In a PA deployment where the submitter/reviewer supplies clinical criteria, model them as locally coded answers. Patient and ServiceRequest commonly supply source data; other clinical sources are appropriate where the deployment actually provides them. Declare coded answer choices in named terminology and bind them with value from is \"Named Terminology\". Policy-owned codes belong in that terminology with authored systems and displays; named terminology is not reserved for external service codes. code is identifies the analytical answer, value from is offers values, and source representation / coded from retrieves source records.",
    why:
      "Model the data the deployment can supply without replacing missing evidence with false. Local answers and source records may coexist; authored projections and selection determine the result.",
    ref: "concept-layer-model; named-answer-options; concept-presentation; docs/CRL-NORTH-STAR.md",
    clauses: [
      {
        text:
          "For submitter/reviewer-attested criteria, use a locally coded answer. Source Patient, ServiceRequest and other clinical data where the deployment provides them; do not fabricate a data source to make a test pass.",
        force: "default",
      },
      {
        text:
          "Use value from is \"Named Terminology\" for every coded answer vocabulary, including policy-owned options. Put optional not qualifying is exceptions under the binding; classify the selected answer with definition is \"Question\" in qualifying. The old inline value from: and value from \"Name\" spellings are removed. See named-answer-options.",
        force: "default",
      },
      {
        text:
          "A missing answer is unknown and pauses when needed on the reached decision path. Explicit negative answers or supported computations can establish false. Irrelevant unknowns do not block a determinate branch. Pause occurs before a leaf activity and does not require adding a pended disposition.",
        force: "default",
      },
    ],
  },
  {
    id: "pa-disposition-set",
    edge: "prior-auth",
    category: "dispositions",
    rule: "A PA / medical-policy coverage DETERMINATION is a CONFIGURED disposition (see `configure-dispositions`): a plain local `activity` named `\"<category>.<key>\"`, where the CATEGORY is a PAS review-action — `certify`, `not-certify`, or `pended` — and the KEY is a reason/flavor the deployment declares in `crl.dispositions` (e.g. two `not-certify` reasons — a medical-necessity vs an experimental/investigational/unproven — as distinct keyed leaves). The determination is constrained STRUCTURALLY (naming no deployment activities): (1) MEMBERSHIP — every recommended determination is a CONFIGURED `<category>.<key>` (or a bare single-option `<category>`); a determination not in the deployment's configured set is invalid. (2) COMMUNICATED, not ordered — a determination is `CPGCommunicationRequest`, never a `CPGServiceRequest` service order. (3) MUTUAL EXCLUSIVITY — each completed case fires EXACTLY ONE determination; a needed-unknown pause fires none, spanning the DELEGATED CLOSURE (parent + any chained `use decision` sub together): no reachable path may emit two in a single run (author ordered precedence with `first:` + `otherwise`; do not place two determinations under one `all:`/`any:`; a branch that both delegates and `recommend`s is the case an in-tree-only check misses). (4) FINALITY BY MODE — `standalone` (our decision IS the whole adjudication) requires FINAL leaves (certify/not-certify); a non-final `pended` (PAS A4) leaf is legitimate only in `embedded` mode (our decision feeds a larger cross-company adjudication). WHICH keyed flavors exist, and their labels/codes, are the deployment's config; whether a policy uses the RIGHT flavor where it draws a distinction is a reviewer/Judge fidelity call this rule INSTRUCTS but does not mechanically enforce. (Membership + communicated-not-ordered + finality-by-mode are ALSO validator-enforced when the project configures `crl.dispositions.options` — see `configure-dispositions`; they remain always-on per-policy invariants for unconfigured content.)",
    why: "The universal kit is customer-agnostic — it serves every deployment's content project, not one denial taxonomy. The determination vocabulary is per-deployment CONFIG (the closed set), so the kit constrains SHAPE (a communicated, mutually-exclusive, mode-appropriate-finality determination drawn from the configured set) without hard-coding any activity set; a distinct further not-certify flavor is legitimate content, not a defect (#167). The structural invariants catch the modeling defects #134 targeted — a determination modeled as a service order, an unconfigured/ad-hoc determination, a contradictory double-determination across a parent+sub.",
    ref: "#134; #167; §4; crl.dispositions",
    clauses: [
      {
        text: "COMMUNICATED, not ordered: a coverage determination is `CPGCommunicationRequest`, never a `CPGServiceRequest` service order — modeling a determination as a service order is a clinical-safety error (#134). ALSO validator-enforced (`disposition-request-type`) when `crl.dispositions.options` is configured; always-on per-policy check otherwise.",
        force: "invariant",
        test: "verifyLoop:communicated-not-ordered",
      },
      {
        text: "MEMBERSHIP: every recommended determination is a CONFIGURED `<category>.<key>` disposition (or a bare single-option `<category>`) from the deployment's `crl.dispositions` set — never an unconfigured/ad-hoc determination. ALSO validator-enforced (`disposition-not-configured`) when configured; always-on per-policy check otherwise.",
        force: "invariant",
        test: "verifyLoop:configured-membership",
      },
      {
        text: "MUTUAL EXCLUSIVITY spans the DELEGATED CLOSURE: exactly one determination on completion and none during a needed-unknown pause over parent + any chained sub together; no path may emit two (a branch that both delegates and `recommend`s is the case an in-tree-only check misses). Author ordered precedence with `first:` + `otherwise`.",
        force: "invariant",
        test: "verifyLoop:mutual-exclusivity-spans-closure",
      },
      {
        text: "FINALITY BY MODE: `standalone` requires FINAL determination leaves (certify/not-certify); a non-final `pended` (PAS A4) leaf is legitimate ONLY in `embedded` mode. ALSO validator-enforced (`disposition-non-final-leaf`) when configured; always-on per-policy check otherwise.",
        force: "invariant",
        test: "verifyLoop:finality-by-mode",
      },
      {
        text: "The categories are certify / not-certify / pended (PAS review-actions). A category may carry multiple keyed flavors (e.g. two `not-certify` reasons) — WHICH keys exist, and their labels/codes, are the deployment's config, not a defect (#167). Whether a policy picks the RIGHT flavor is a reviewer/Judge fidelity call.",
        force: "default",
      },
    ],
  },
  {
    id: "configure-dispositions",
    edge: "prior-auth",
    category: "dispositions",
    rule: "A medical-policy deployment MUST configure its disposition vocabulary in the content project's `package.json` under `crl.dispositions`: a `mode` (`standalone` | `embedded`) and `options` mapping each PAS category (`certify` / `not-certify` / `pended`) to keyed reasons/flavors — `{ label, code? }`. The activity name a policy recommends is `\"<category>.<key>\"` (e.g. `recommend activity \"not-certify.EIU\"`), authored as a plain local `activity` block (`request CPGCommunicationRequest`); the `code` on an option is a PAS review-decision-reason code in full-PAS (Approve/Deny) intent, or the larger system's own code in embedded (Met/Unmet) intent. Once `options` is configured it is the CLOSED valid set: the validator rejects any recommended activity not in it, any determination not `CPGCommunicationRequest`, and (per `disposition-mode`) a non-final leaf under `standalone`. Default vocabulary (if unconfigured): `certify.Approve` / `not-certify.Deny`.",
    why: "The determination vocabulary is per-deployment (one payer per content project) — Approve/Deny for a standalone full-PA deployment, Met/Unmet for one that is part of a larger adjudication. Making it CONFIG (not hard-coded in the language or the kit) is what lets a deployment relabel or add a flavor without re-authoring policies, and keeps the universal kit customer-agnostic. This rule is GUIDANCE — the validator does NOT error on a MISSING config (an unconfigured project keeps today's behavior); it is the nudge to configure so the closed-set + request-type + finality checks turn on.",
    ref: "crl.dispositions; #134",
  },
  {
    id: "disposition-mode",
    edge: "prior-auth",
    category: "dispositions",
    rule: "`crl.dispositions.mode` is first-class and gates FINALITY only. `standalone` — our decision IS the whole coverage adjudication; every determination leaf must be FINAL (certify / not-certify). `embedded` — our decision is a SUB-determination feeding a larger cross-company adjudication; a non-final `pended` (PAS A4) leaf is legitimate (a refer-up / need-info contribution). In BOTH modes our decision still issues EXACTLY ONE determination on completion; a needed-unknown pause emits none (mutual-exclusivity is not relaxed by mode — do NOT read `embedded` as permission to emit two determinations across a parent + sub).",
    why: "The customer described two operating modes: Smile as the whole PA (Approve/Deny final) vs Smile as part of a larger system (Met/Unmet contributions that the larger tree finalizes). Only finality differs — a contribution may be non-final; it is still one contribution per run. Making mode explicit lets the same policy CRL run either way per deployment, and lets the validator enforce standalone-finality without guessing.",
    ref: "crl.dispositions.mode",
  },
  {
    id: "minimalism",
    edge: "cpg",
    category: "minimalism",
    rule: "Declare the MINIMAL set that captures the clinical intent and let the emitter do the heavy lifting. Do not over-specify properties the emitter can derive. Minimalism is over EMITTER-DERIVABLE detail, NOT over FIDELITY: a branch guard that keeps each distinct criterion VISIBLE (an inline atom in the applicability expression and dependency `input[]`, or a named criterion as one identifier `condition[]` resolving to a transparent define with its atoms in `input[]`) is NOT 'over-specified' relative to a `defined as` composite that hides them in one opaque boolean — semantic fidelity (same-fact vs distinct-criteria; see decision-composition) governs over node-count.",
    ref: "declarative-not-implementation",
  },
  {
    id: "cel-cases",
    edge: "cpg",
    category: "cel",
    rule: "Author a companion `.cel`: `covers \"<CRL library>\"`; a Patient subject `fact` (`- defined by \"Patient\".`); one clinical `fact` per case-feature linked to its concept via `- defined by \"<library>\".\"<concept>\".`; and one `case` per path with `- subject is …`, the relevant `- fact is …`, and a `- result is \"<decision>\" is \"<branch>\".` oracle. For expected missing evidence before any activity, use `- result is \"<decision>\" is pause.` instead; a pause case must have exactly one result assertion. Quoted \"pause\" is an activity name. A passing pause assertion checks CRE's prediction only: native $apply is the source of truth, and each case requires independent error/activity/Questionnaire/QuestionnaireResponse answer-state checks. All-false empty results and partial `all:` activity production are not whole-decision pauses. CRE attribution currently identifies the decision condition, not an unknown compound operand. The CRE resolves concept-linked facts and checks code membership for supported representations; an explicit code must match the resolved representation set. CURRENT LIMIT: a local concept without a derivable local code set fails loudly. Some non-local forms still use name-based presence; this is not evidence of code membership. A bare concept-linked fact uses its declared local code. For a value-reading boolean question, write `value is true` or `value is false`; omission is UNKNOWN and pauses, not an implicit no. There is no absence code. Existence over records is different: no matching record gives false, and a value on a presence-only fact does not change its existence. A bare-type CEL fact without a code cannot match a coded retrieve; CEL validation emits warning `bare-type-fact-uncoded` for those resource types (#312). Patient is exempt because its retrieve is not code-scoped.",
    ref: "decision-reference.cel; src/cre/run.ts",
    clauses: [
      {
        text: "COMPOUND-GUARD operand LOAD-BEARING: every source-required conjunct of an `and` branch guard (or a `criterion` body) must be demonstrably load-bearing — a dropped conjunct is a DROPPED CRITERION (source infidelity), not a testing nicety. A compound-guard branch whose operands are not each shown load-bearing is flagged.",
        force: "invariant",
        test: "judgeLens.composition:dropped-or-added-criterion",
      },
      {
        text: "METHOD (default): for an N-way `and` guard, author a SATISFYING case PLUS one FAILING case per conjunct (that conjunct false, the rest true) — the DROP-ONE battery (a dropped conjunct still passes the satisfying case and fakes green); an equivalent proof is acceptable. For OR-of-pathways, add an OVERLAP/TRAP oracle: a case satisfying pathway-2 but only PARTIALLY pathway-1 must still reach the shared disposition — and assert the EXACT outcome/disposition (a precedence inversion produces a DIFFERENT disposition and fails; pathway identity, when it matters, needs a `conditionTrace`/`viaWhen` assertion — see assert-path), not merely that one fired.",
        force: "default",
      },
    ],
  },
  {
    id: "emit-output-root",
    edge: "cpg",
    category: "process",
    rule: "ONE OUTPUT ROOT for the writing emit tools. MCP `emit_cql` returns CQL inline and never writes. Normally omit MCP `out` / `outRoot`, CLI `--out-dir` (`--out` for crl-emit-results): the nearest package.json defines the project root. `emit_crl` (target fhir-def) writes `<root>/src/cql/` and `<root>/src/fhir/<ResourceType>/<id>.json`; target cql writes `<root>/src/cql/`. `emit_cel` writes `<root>/tests/data/fhir/patient/<compartmentId>/<lowercase-type>/<id>.json`; `emit_results` writes under `<root>/tests/results/fhir/patient/<compartmentId>/`. An explicit output argument replaces ROOT, retaining that entire layout. Never pass a leaf such as src or tests/data/fhir as the root: src would become src/src/cql. Omission WRITES for emit_crl and emit_cel; use an explicit scratch root for inspection. A scratch tree mirrors the project layout. For both-representation content use closure emit_crl, not the single-library emit_cql tool. Consume returned paths and manifests; tools own placement. `emit_cel` replaces its patient data tree and `emit_results` prunes its generated outputs; `emit_crl` does not prune stale files, so a renamed definition can leave an obsolete CQL/FHIR file. Inspect the definition tree before publishing it.",
    ref: "packages/crl/TOOLING.md — the ROOT",
  },
  {
    id: "written-equals-executed",
    edge: "cpg",
    category: "process",
    rule: "CRL owes you written == executed. It optimizes clarity, not fewer keystrokes. The emitter translates CRL into CQL/FHIR; it does not invent a CRL expression the author could and should have written. Report a mismatch when a determination behaves differently from its source, even if the tool reports success. Target-language plumbing that CRL cannot express, such as the FHIR structural floor, belongs to emit. It must not manufacture a determination value. An unanswered pure question pauses because nothing supplies its value; that behavior follows from its declaration and must agree in the CRE. Explicitness is useful where the form exists; do not replace a faithful model merely to obtain a green run.",
    ref: "docs/CRL-NORTH-STAR.md §0 and §4.0",
  },
  {
    id: "terminology-forms",
    edge: "cpg",
    category: "concept-model",
    rule: "A terminology has three forms. Pure `valueset is` is a reference: when its final path segment is a FHIR id (1-64 letters, digits, dot or hyphen), the emitted placeholder uses that declared canonical, and deployment supplies the real membership there. CURRENT LIMIT: a canonical without that id-legal tail, including a URN OID, falls back to a policy slug canonical. This does not satisfy the fixed-canonical deployment model; inspect emitted identity and report the mismatch rather than assuming the swap works. `system is` plus `code is` entries instantiates membership. Mixed `valueset is` plus codes emits ONE policy-owned ValueSet identity and includes the authored external canonical by reference alongside its explicit codes; CQL references that same policy-owned identity. Do not assume a named reference contains a usable dropdown: instantiate the offered codes or deploy the real terminology. `value from is` binds offered answer values, never source retrieves. With value domain is answer options and in qualifying, that offered finite set also supplies the interpreted domain and concept-local exceptions; representation-local `coded from` selects which source records participate. They may name the same terminology when those roles genuinely coincide. A terminology code may carry optional `display is`; each finite answer ValueSet member requires its display. Displays are authored, never inferred. Example instantiated terminology:\nterminology \"Example Choices\":\n- system is `http://example.org/CodeSystem/choices`.\n- code is `a` display is `Choice A`.\n- code is `b` display is `Choice B`.\nA coded question without `value from is` still warns `answer-options-missing`. #313 remains open: this release adds displays but does not fix the titled codeless-reference defect.",
    ref: "docs/CRL-NORTH-STAR.md; #313; #316",
  },
  {
    id: "verify-loop",
    edge: "cpg",
    category: "process",
    rule: "Verify with the MCP tools in order: validate_crl(path) clean → validate_cel(path) clean → run_decision(path) with every case's `result is` passing. validate_cel and run_decision need FILES under a project root (a package.json) — they do not accept inline code. For a COMPOUND-GUARD branch, cite the run_decision `conditionTrace` (the per-operand truth-table) as the audit surface, and confirm the DROP-ONE battery (see cel-cases) — a satisfying case alone does not prove each conjunct is load-bearing.",
    ref: "verifyLoop",
  },
  {
    id: "emitted-trees-are-ours",
    edge: "cpg",
    category: "process",
    rule: "Emitted trees are producer-owned. `emit_cel` wipes `<root>/tests/data/fhir/patient/` and repopulates it; one suite owns that project tree, with no sibling-suite protection. `emit_results` prunes unclaimed Questionnaire/QuestionnaireResponse files in its results tree by default (`prune: false` retains them). Keep authored files elsewhere. Symlinks and removal failures are reported. Each tool writes a manifest with case → compartmentDir → paths and hashes. Re-hashing listed files proves integrity, not completeness: compare the complete path set too. A renamed case otherwise leaves plausible stale data which a downstream mirror copies and certifies. Use each tool's manifest and returned paths.",
    ref: "verifyLoop",
  },
  {
    id: "produce-results",
    edge: "cpg",
    category: "process",
    rule: "Questionnaires are generated by `$apply`, never emitted from CRL: no Questionnaire appears in the CRL definition emit. After validation and CRE checks, call `emit_results(celPath, crlPath, useCase)`; it owns result placement, so never place `$apply` output yourself. Enable `crl.enableResults` in VS Code User settings and restart the MCP client. An absent setting preserves an existing opt-in; explicit false removes it. A JRE 17+ and the CRL-maintained complete CLI engine " + ENGINE_JAR_SOURCE.buildId + " are required. The tool gives the download command when missing, discovers <home>/" + ENGINE_JAR_SOURCE.cacheRelativePath + ", and verifies the pinned hash; normal use needs no manual hashing, extraction, or classpath. The original Maven jar is not the corrected default. `jarPath` and `jarSha256` are overrides. Read every case state: generated / no-questionnaire / populate-degraded / failed / timeout / not-run. An absent file alone is not evidence that the policy asked nothing. The results tree is producer-owned; use returned paths/manifests and keep hand-authored Q/QR elsewhere.",
    ref: "verifyLoop",
  },
  {
    id: "review-flags",
    edge: "cpg",
    category: "process",
    rule:
      "When extraction hits a problem you cannot cleanly resolve — a source ambiguity, a source self-contradiction, an " +
      "unsettled modeling fork, or a place your encoding does not match the source — author a REVIEW FLAG rather than " +
      "silently choosing. A flag is NOT `.crl` content: it is a structured STORE RECORD you create with the `create_flag` " +
      "MCP tool, which writes a `<policy>/src/medical-validation/flags/<id>.json` file — a per-flag record inside the tracked " +
      "`medical-validation` entity (so `kelp save medical-validation` captures it), NOT a `- meta is` line. Anchor it at the NARROWEST faithful scope — `concept`, `decision`, or `library` — by passing that node's name. " +
      "The four tags, by what went wrong: `@customer-confirmable` — an EXTERNAL-stakeholder ambiguity you resolved " +
      "provisionally (carry the reading you took as the `assumption` field); `@internal-inconsistency` — the SOURCE " +
      "contradicts itself (source-vs-source); `@open-fork` — an INTERNAL modeling fork you encoded one way but did not " +
      "settle (`chosen`/`alternatives` fields); `@fidelity-defect` — a known encoding≠source defect, with a REQUIRED " +
      "`direction` = `over-reach|criterion-drop` (over-reach = you ADDED logic the source doesn't support; criterion-drop = " +
      "you OMITTED a source-required criterion). Keep the flag LEAN — a one-line gist + those fields; the RICH detail (the " +
      "source quote, the options, the reasoning) goes in a tracker ISSUE you file AT THE SAME TIME, linked with the " +
      "optional `ref` field (e.g. `#207`). Author flags `status open` (the default). An open flag blocks Medical Validation " +
      "completion. Separately, `@gap-filed` IS still a `.crl` meta tag (NOT a flag) — a durable `- meta is `@gap-filed: …; " +
      "ref <issue>`.` pointer to an already-filed gap, REQUIRED `; ref`; it ships fine and does not gate. The four flag " +
      "tags above are EXTRACTION flags (your concern: does the CRL faithfully represent the POLICY NARRATIVE?). A separate " +
      "`@validation-concern` (category validation) is authored by a HUMAN during Medical Validation for a different " +
      "reference point — does the CRL represent the CUSTOMER'S INTENT? — which you cannot judge from the narrative alone: " +
      "you do NOT author it, but you MUST PRESERVE any that already exist (never delete a human's `@validation-concern` " +
      "store record on re-extraction).",
    why:
      "A silent guess buries a narrative→CRL problem inside a green-looking artifact; a flag surfaces it and prevents " +
      "Medical Validation completion while open — the review signal is the point. Flags live in the `medical-validation/flags/` store " +
      "(not `.crl` source) so an AI re-extraction that rewrites the `.crl` cannot clobber the human review trail.",
    ref: "spec/metadata-model.md (review flags → the `medical-validation/flags/` store); src/flags/flagVocab.ts (the flag vocabulary); the `create_flag`/`set_flag_status` MCP tools.",
    clauses: [
      {
        text:
          "When you cannot cleanly resolve a source/encoding problem during extraction, author a flag (via `create_flag`) " +
          "at the narrowest faithful scope rather than silently choosing; the flag record is LEAN (gist + fields + `status " +
          "open`), the rich detail in a tracker issue filed at creation and linked with the `ref` field. (`assumption`/" +
          "`chosen`/`alternatives` are the semantic fields to include when they apply — not required.)",
        force: "default",
      },
      {
        text:
          "`@fidelity-defect` REQUIRES a `direction` = `over-reach|criterion-drop` — `create_flag` rejects a missing " +
          "required field (`reason: missing-field`) rather than writing the record. Separately, the `.crl` meta tag " +
          "`@gap-filed` REQUIRES `; ref <issue>` — omitting it is a `meta-missing-field` validator error on the `.crl`.",
        force: "validator-enforced",
      },
      {
        text:
          "Do NOT author `@validation-concern` — a HUMAN authors it in Medical Validation (category validation: a " +
          "CRL-vs-CUSTOMER-INTENT concern). You MUST PRESERVE any that exist: never delete a human's `@validation-concern` " +
          "store record on re-extraction (the flag store is deliberately OUTSIDE `.crl` so an AI `.crl` rewrite can't " +
          "touch it).",
        force: "default",
      },
      {
        text:
          "Flags do NOT appear in generated CQL/FHIR — they left `.crl` for the `medical-validation/flags/` store, so nothing renders " +
          "into the compiled artifact. The store is their home; they surface in the Medical Validation cockpit (the flag " +
          "list + the mvComplete gate), not in the generated logic. Scope still matters for the ANCHOR (where the flag " +
          "points + how it's grouped in the cockpit), not for any emit surface.",
        force: "default",
      },
      {
        text:
          "How to WRITE flags — use the `crl` MCP tools; they write the store directly. `create_flag` authors a flag on a " +
          "concept, decision, or library (pass `kind`, `name`, the `tag`, a one-line `gist`, any required extra `fields` " +
          "like `direction`, and the optional issue link as `fields.ref`); `set_flag_status` flips one flag " +
          '`open`<->`resolved` by selector. Pass `tag` as the BARE tag id — `"open-fork"`, `"fidelity-defect"` (the `@` ' +
          'prefix is display-only prose; `tag: "@open-fork"` is an `unknown-tag`). Both REQUIRE a `path` to a `.crl` file ' +
          "in the policy (inline `code` is NOT accepted — a store can't be located without a filesystem path); `create_flag` " +
          "uses it to VALIDATE the anchor target exists AND to locate the store, while `set_flag_status` uses it ONLY to " +
          "locate the store (it does no `.crl` content read). They WRITE the `medical-validation/flags/<id>.json` record (they do NOT " +
          "return `.crl` source for you to apply, and they never edit `.crl` files). `create_flag` is idempotent while open " +
          "(a same-content retry returns the existing record). PRECONDITION: the store is located by walking up to the " +
          'policy\'s `src/` dir (the one holding `provenance/`); if the tool errors "not inside a discoverable policy", the ' +
          "policy layout isn't set up yet (run the provenance/promotion step first). (`@validation-concern`'s optional " +
          "`kind` triage enum + any occurrence `key` are carried as `fields` by the same tools.)",
        force: "default",
      },
      {
        text:
          "#230 MIGRATION: the flag store moved from the pre-#230 `<policy>/.crl/flags/` location (artifact root, untracked) " +
          "into the `medical-validation/flags/` subfolder of the tracked `medical-validation` entity. Do NOT hand-create or " +
          "hand-edit records at the old `.crl/flags/` path. If a policy STILL has records there (an old checkout / a legacy " +
          "store), BOTH `create_flag` and `set_flag_status` REFUSE with `reason: legacy-flag-store-present` — move those " +
          "`<id>.json` records to `medical-validation/flags/` and DELETE the old `.crl/flags/` dir before authoring (a manual " +
          "migration; the untracked residue also keeps dirtying the worktree, which blocks `kelp lock`).",
        force: "default",
      },
    ],
  },
];

const STAGE_RECOMMENDED_CONCEPT_TYPES = [
  "Condition",
  "Observation",
  "Procedure",
  "MedicationRequest",
  "MedicationStatement",
  "AllergyIntolerance",
  "Device",
  "DiagnosticReport",
  "Encounter",
];

const STAGE_RECOMMENDED_ACTIVITY_TYPES = [
  "CPGCommunicationRequest",
  "CPGServiceRequest",
  "CPGMedicationRequest",
  "CPGProposeDiagnosis",
  "CPGRecordDetectedIssue",
];

const TYPE_ALLOWLIST: TypeAllowlist = {
  conceptTypes: [...conceptTypes],
  conceptValueTypes: [...conceptValueTypes],
  activityTypes: [...activityTypes],
  stageRecommended: {
    conceptTypes: STAGE_RECOMMENDED_CONCEPT_TYPES,
    activityTypes: STAGE_RECOMMENDED_ACTIVITY_TYPES,
  },
  note:
    "conceptTypes / conceptValueTypes / activityTypes are the full grammar-legal " +
    "vocabularies (source of truth: the CRL grammar). `stageRecommended` is a " +
    "non-binding subset most common for local decision-support; any listed type is legal.",
};

const EXAMPLES: KitExample[] = [
  {
    title: "Instantiated terminology with authored displays",
    language: "crl",
    snippet:
      'terminology "Example Choices":\n- system is `http://example.org/CodeSystem/choices`.\n- code is `a` display is `Choice A`.\n- code is `b` display is `Choice B`.',
    valid: true,
    note: "The terminology contains the offered codes. A pure valueset reference instead needs deployment-provided membership; see terminology-forms.",
  },
  {
    title: "Local case-feature concept (asserted, in scope)",
    language: "crl",
    snippet:
      'concept "Documented Nonunion":\n- type is Observation.\n- value type is boolean.\n- code is `documented-nonunion`.',
    valid: true,
    note: "A locally attested question: the boolean answer lives in Observation.value; omission is unknown, and an explicit false answer is not absence.",
  },
  {
    title: "A policy's ALTERNATIVES are joined in the DECISION layer, not by `defined as`",
    language: "crl",
    snippet:
      'concept "Failed Drug Therapy":\n- type is Observation.\n- value type is boolean.\n- code is `failed-drug`.\nconcept "Failed Physical Therapy":\n- type is Observation.\n- value type is boolean.\n- code is `failed-pt`.\ncriterion "Failed Conservative Therapy":\n- when ( "Failed Drug Therapy" or "Failed Physical Therapy" ).',
    valid: true,
    note: 'TWO DISTINCT criteria the policy offers as ALTERNATIVES, joined in the DECISION layer by naming them a `criterion`. Post-#236 the criterion lowers to ONE named boolean CQL define referenced by identity — so a `when` on it emits ONE identifier `condition[]` naming the criterion, and the two modality atoms stay visible in the criterion\'s TRANSPARENT define body (`"Failed Drug Therapy" or "Failed Physical Therapy"`) + the use-site `input[]` (the recursive atom closure) + an expandable named node in the cockpit view-model (post-#236) — a downstream reader recovers WHICH modality failed from those, and the modalities do NOT clone the downstream subtree. This is faithful STRUCTURE, categorically distinct from a `defined as` sem-or composite (which fuses them into ONE opaque inference boolean asserting a false sameness). REPLACES the former `defined as` sem-or composite over these same two failures: pre-#224 a `when` took a SINGLE concept reference, so `defined as` was the ONLY way to get a disjunction into a guard — that constraint is gone. The old note (\'ONE criterion satisfiable by either representation\') was weaker than the rule and was read as licensing any disjunction sitting under a criterion label. #168.',
  },
  {
    title: "GENUINE rung-1 — ONE fact RECORDED two ways",
    language: "crl",
    snippet:
      'concept "Viral Load Below Threshold Lab Result":\n- type is Observation.\n- value type is boolean.\n- code is `viral-load-lab`.\nconcept "Viral Suppression Charted By Clinician":\n- type is Observation.\n- value type is boolean.\n- code is `viral-suppression-charted`.\nconcept "Viral Suppression Documented":\n- value type is boolean.\n- defined as ( "Viral Load Below Threshold Lab Result" sem-or "Viral Suppression Charted By Clinician" ).',
    valid: true,
    note: "ONE clinical reality — this patient's viral suppression — RECORDED in two places: a lab result or a clinician's chart note (the two records may themselves coexist; it is still ONE occurrence). The fact is nameable WITHOUT the concept's label, which IS the test. Contrast the criterion example above: failed drug therapy and failed physical therapy are two DIFFERENT events, not one occurrence recorded twice. This is rung-1 INFERENCE over ONE concept's representations. #168.",
  },
  {
    title: 'THE VACUITY TRAP — the label supplying "the one fact"',
    language: "crl",
    snippet:
      'concept "Life Threatening Cardiovascular Disease":\n- type is Condition.\n- value type is boolean.\n- code is `cv-disease`.\nconcept "Sleep Apnea":\n- type is Condition.\n- value type is boolean.\n- code is `sleep-apnea`.\nconcept "Uncontrolled Diabetes Mellitus":\n- type is Condition.\n- value type is boolean.\n- code is `uncontrolled-dm`.\nconcept "Severe Musculoskeletal Problem":\n- type is Condition.\n- value type is boolean.\n- code is `msk-problem`.\nconcept "Substantial Co Morbidity":\n- value type is boolean.\n- defined as ( "Life Threatening Cardiovascular Disease" sem-or "Sleep Apnea" sem-or "Uncontrolled Diabetes Mellitus" sem-or "Severe Musculoskeletal Problem" ).',
    valid: false,
    note: "Defended as rung-1 because the operands are 'representations of substantial co-morbidity' — but that fact is supplied by the concept's own NAME. Strip the label and there is no single clinical event: cardiovascular disease, sleep apnea, diabetes and a musculoskeletal problem are four DIFFERENT states, any of which independently satisfies the rule (they co-occur). The source's 'such as' marks alternatives, not representations. Faithful form: `criterion \"Substantial Co Morbidity\": - when ( A or B or C or D ).` The four operands are DECLARED, so the snippet is self-contained: pasting it produces ZERO validator output — no unresolved-reference noise to distract from the point. VALIDATOR-CLEAN — this is a JUDGE-lens (`hollowed-criteria`) violation, not a grammar/shape one (hence no `expectRule`); the grammar sees NOTHING wrong, which is exactly why UNIT ANCHORING exists.",
  },
  {
    title: "Matched branch with a guarded `any:` menu",
    language: "crl",
    snippet:
      'decision "Coverage":\nfirst:\n- when "Indication" then:\n  any:\n  - recommend activity "Order MRI".\n  - recommend activity "Order CT" unless "Contrast Allergy".\n  end.\n- otherwise then recommend activity "Deny".',
    valid: true,
    note: "Order MRI is always offered; CT is dropped when contraindicated.",
  },
  {
    title: "DON'T: a guard on a single menu-less action",
    language: "crl",
    snippet: 'decision "D":\n- when "A" then:\n  - recommend activity "X" unless "C".\n  end.',
    valid: false,
    expectRule: "guard-on-single-action",
    note: "Guards are only meaningful inside a multi-action menu. Put X in an `any:`/`all:` block, or gate the whole branch with a `when`.",
  },
  {
    title: "DON'T: `any:` over when-branches",
    language: "crl",
    snippet:
      'decision "D":\nany:\n- when "A" then recommend activity "X".\n- when "B" then recommend activity "Y".',
    valid: false,
    expectRule: "any-over-branches",
    note: 'Nondeterministic over branches. Give each condition its OWN sibling `when` under `first:` (each → the same disposition), or pack them into one branch guard `when ( "A" or "B" )`, or use `all:` if every match should fire. Do NOT fuse the distinct conditions into one `defined as`/`sem-or` concept (that hides which matched — #168).',
  },
  {
    title: "Compound branch guard — distinct criteria as `when ( A and B )` (#224)",
    language: "crl",
    snippet:
      'decision "Coverage":\nfirst:\n- when ( "Has Qualifying Diagnosis" and "Failed Conservative Therapy" ) then recommend activity "certify.Approve".\n- otherwise then recommend activity "not-certify.Deny".',
    valid: true,
    note: 'Distinct criteria conjoined in the DECISION layer — each conjunct is its OWN visible `condition[]` in the emitted PlanDefinition, NOT fused into a `defined as` composite. (A conjunct that is itself a named `criterion` — here `"Failed Conservative Therapy"` — resolves to ONE identifier `condition[]` naming that criterion, its own sub-atoms in its transparent define + use-site `input[]`, post-#236; it is not re-expanded.) A single ref needs no parens; a homogeneous chain may be bare; MIXED `and`/`or` must be parenthesized.',
  },
  {
    title: "`criterion` — a named, reusable branch guard (#224)",
    language: "crl",
    snippet:
      'criterion "Meets Coverage Preconditions":\n- when ( "Has Qualifying Diagnosis" and "Failed Conservative Therapy" ).\ndecision "Coverage":\nfirst:\n- when ( "Meets Coverage Preconditions" and "Imaging Not Recent" ) then recommend activity "certify.Approve".\n- otherwise then recommend activity "not-certify.Deny".',
    valid: true,
    note: "Names a reusable distinct-criteria guard; referenced unqualified in a `when` and lowered ONCE to a named boolean define referenced BY IDENTITY (a readability/DRY + emit-tractability aid: the ref is ONE parent leaf; naming reduces the arm count exactly when the inlined-then-NNF body would have >1 DNF arm — a positive effective disjunction, or a negated effective conjunction — and is arm-neutral when that NNF is a pure conjunction; atoms visible in the define + use-site `input[]`). Un-assertable, branch-only, library-local.",
  },
  {
    title:
      "Review flag: an @open-fork on the concept it concerns (via create_flag — LEAN, detail in the linked issue)",
    language: "text",
    snippet:
      'create_flag(\n  path: "<policy>/src/crl/coverage-policy.crl",\n  kind: "concept", name: "BMI Threshold",\n  tag: "open-fork",\n  gist: "eligibility threshold encoded as BMI-40-only, but the source also allows 35-plus-comorbidity",\n  fields: { chosen: "bmi-40-only", alternatives: "bmi-35-plus-comorbidity", ref: "#207" }\n)\n→ writes <policy>/src/medical-validation/flags/<id>.json  (status defaults to open)',
    valid: true,
    note: "The flag is a STORE record, not a `.crl` line: a one-line gist + `chosen`/`alternatives` (semantic, optional) + an optional `ref` to the tracker issue with the full reasoning. `create_flag` writes `medical-validation/flags/<id>.json`; it does NOT touch the `.crl`. An open flag blocks Medical Validation completion.",
  },
  {
    title: "Review flag: an @fidelity-defect on a DECISION (required `direction` field)",
    language: "text",
    snippet:
      'create_flag(\n  path: "<policy>/src/crl/coverage-decision.crl",\n  kind: "decision", name: "Coverage Decision",\n  tag: "fidelity-defect",\n  gist: "the encoding reads an axillary-only finding the source does not require",\n  fields: { direction: "over-reach", ref: "#207" }\n)',
    valid: true,
    note: 'Anchor at the narrowest faithful scope — here `kind: "decision"`. `@fidelity-defect` REQUIRES a `direction` = over-reach|criterion-drop; omitting it → `create_flag` returns `reason: missing-field` and writes nothing.',
  },
  {
    title:
      "@gap-filed is NOT a flag — it stays a `.crl` meta tag (required `; ref`), ships fine, does not gate",
    language: "crl",
    snippet:
      'concept "Renal Function":\n- type is Observation.\n- value type is boolean.\n- meta is `@gap-filed: eGFR unit normalization not yet expressible; ref #180`.\n- code is `renal-function`.',
    valid: true,
    note: "A durable pointer to already-tracked work — a REAL `.crl` meta tag (unlike flags, which left `.crl`), REQUIRED `; ref`, does not block mvComplete. Contrast with a review flag (a `medical-validation/flags/` store record authored via create_flag, blocks while open).",
  },
  {
    title:
      "Review flag at LIBRARY scope: an @internal-inconsistency spanning the whole policy (via create_flag)",
    language: "text",
    snippet:
      'create_flag(\n  path: "<policy>/src/crl/policy.crl",\n  kind: "library", name: "Coverage Policy",\n  tag: "internal-inconsistency",\n  gist: "the eligibility section requires prior imaging, but the exclusions section forbids it",\n  fields: { ref: "#207" }\n)',
    valid: true,
    note: 'Use `kind: "library"` (name = the library name) for a contradiction that isn\'t about one concept or decision. `@internal-inconsistency` = the SOURCE contradicts itself. The flag anchors to the library; nothing is written into the `.crl`.',
  },
];

/** The verify-loop `note`, base (edge-invariant) segment. The PA closure paragraph is appended for prior-auth. */
const VERIFY_LOOP_NOTE_BASE =
  "Questionnaires are generated by `$apply`, never emitted from CRL. Use emit_results and its returned paths; do not place engine output yourself. For definition/data emission use emit-output-root: omitted output arguments write under the project root, and explicit arguments replace that root. " +
  "AFTER this loop is clean, `emit_results` produces the Questionnaire/QuestionnaireResponse a medical reviewer " +
  "reads (see the `produce-results` rule): it is DISABLED by default, needs an engine jar you supply, and it " +
  "DELETES any Q/QR under `tests/results/fhir/` that the run did not write — do not hand-author artifacts there. " +
  "validate_cel and run_decision require FILES under a project root (a package.json); they do not accept inline code. In a content project's artifact-package layout, author <artifact>.crl and <artifact>.cel under the artifact's package and pass absolute paths. " +
  "PROJECT CONFIG — the project's `package.json` MUST declare `crl.canonicalBase` (e.g. `\"crl\": { \"canonicalBase\": \"http://example.org/crl/<project>\" }`): the analytical local CodeSystem url is `<canonicalBase>/CodeSystem/<domain>-local`; owned answer vocabularies have separate logical-owner CodeSystem identities, so emit fails with `missing-canonical-url-base` without it (no urn fallback). Projects that emit FHIR already require it; `emit_cql` for local-`code is` content likewise needs a `path` (not inline `code`) so it can read the base from the nearest package.json. " +
  "PROVENANCE / PROMOTION (beyond the run_decision proof): generate the scaffold with `generate_provenance` " +
  'clusterBy:"disposition-path" — it clusters per RUN PATH (decision-node refs only) so it is correspondence-correct ' +
  "BY CONSTRUCTION, clearing the FINAL `validate_provenance` cockpit-correspondence gate AS GENERATED (before any " +
  'source attribution). The default clusterBy:"decision" is the per-decision concept-attribution VIEW (it cites ' +
  "concept refs that fan out / over-light the gate) — inspect with it, do NOT promote with it. " +
  "DERIVEDFROM PORTABILITY (#250): the anchorSource.derivedFrom back-pointer must be CARRIER-RELATIVE + POSIX — " +
  "relative to the directory of the file that carries it, `/` only, a leading `../` is legal. canonicalize_source and the " +
  "CLI crl-generate-provenance write the carrier file and are conformant; a DESTINATION-LESS generate_provenance (the MCP " +
  "path that returns the artifact inline, its derivedFrom relative to the producer-assumed carrier dir) must be NORMALIZED " +
  "if you save it to a different " +
  "directory. The gate otherwise bites LEGACY + hand-edited records. validate_provenance emits `derived-from-*` findings " +
  "(graded warning during the #250 transition window, error from the bundled delivery onward); when one fires, do NOT " +
  "hand-edit the path — run normalize_provenance (CLI crl-normalize-provenance) to rewrite it carrier-relative + stamp " +
  "the 1.1 marker, oracle-verified. It writes each VERIFIED record and leaves each WORKLISTED record byte-untouched " +
  "(per-record — a run can rewrite the artifact yet worklist its sidecar). Exit 0 = every record normalized; exit 2 = " +
  "residue remains (a dead upstream path → re-run with --search-root <dir>; a hash mismatch / cross-drive source / " +
  "marker-tell disagreement → adjudicate). ALWAYS re-run validate_provenance after — normalize checks each record's own " +
  "source trail, but the artifact↔sidecar oracle cross-check runs only in validate. normalize processes one artifact (+ " +
  "its discovered sidecar), or one standalone sidecar, per invocation; corpus enumeration is external. " +
  "PROOF STATUS IS ORTHOGONAL TO FAITHFULNESS (§4): faithfulness decides the model, provability decides whether run_decision can prove it yet. Encode the FAITHFUL model, test its actual supported paths, and record a proof gap only where execution is unsupported — never substitute a less-faithful provable model, and never assert a composite to fake green (K4). Read artifact proof from `verification` and `verificationLegend`; scope in/out describes this introductory kit's coverage, not a language legality check or an execution verdict. Validate and execute forms outside the worked examples rather than assuming all predicates are deferred. " +
  "DURABLE proof-methodology (independent of which constructs are evaluated): ASSERT THE PATH, not just the disposition. an activity `result is` checks disposition MEMBERSHIP only — two paths ending in the same disposition (a sub-decision's `otherwise` Deny and a parent's `otherwise` Deny) are indistinguishable, so a case short-circuiting to the WRONG `otherwise` still 'passes'. Fall-through / chained proof cases must assert the path via the run trace (`viaWhen` / nodeId) or use DISTINCT disposition activities per path.";

/** The prior-auth-only closure paragraph appended to the verify-loop `note` (the coverage cardinality invariant). */
const VERIFY_LOOP_NOTE_PRIOR_AUTH =
  " MUTUAL-EXCLUSIVITY SPANS ALL EMISSION PATHS (coverage / PA — the consumer of this invariant). The 'exactly one determination on completion, none during a needed-unknown pause' invariant is evaluated over EVERY emission path — the DELEGATED CLOSURE (parent + any chained `use decision` sub together) AND `all:`/`any:` sibling FAN-OUT — not in-tree branches or delegation alone: a branch that both delegates and `recommend`s, or two determinations placed under one `all:`, each emit two determinations an in-tree-only check misses. Note BOTH `first:` and `all:` are legal branch qualifiers (validator: `first:` or `all:` over when-branches; `any:` is over ACTIONS only) — a determination authored `all:` fans out multiple outcomes and so HITS this invariant; author a determination's precedence with `first:` + `otherwise` so exactly one fires on completion and none during a needed-unknown pause.";

const VERIFY_LOOP_BASE: Omit<VerifyLoop, "note" | "methodologyRequirements"> = {
  steps: [
    "validate_crl(path) — clean (no errors)",
    "validate_cel(path) — clean (no errors)",
    "run_decision(path) — every supported case's activity or pause `result is` passes as a CRE prediction; unsupported evaluation is not acceptance",
    "Native acceptance — emit CRL and CEL, execute the emitted artifacts through $apply with each case's data, and check engine errors, activity identity/path and Q/QR answer states against independently specified expectations. A pause needs a named unanswered question and no activity; zero activities alone is insufficient. Record unexecuted cases as unverified.",
  ],
  proves:
    "After all steps, the validated decision and its emitted artifacts agree with the independently specified activity or pause expectations for the executed cases. CRE alone establishes only its supported prediction; native $apply supplies emitted-runtime evidence.",
  doesNotProve:
    "That a concept's `code is` is the clinically correct code, or that the concept-to-intent mapping is right. The CRE checks explicit code membership for supported local and source representations; a local concept without a derivable local code set fails loudly. Some non-local forms still use name-based presence, so a green run does not prove every code was checked. Passing these cases does not establish that the chosen codes match clinical intent. A green run means the wiring is right, NOT that the encoding is clinically complete or correct. " +
    "Age publication requires independent runtime evidence for its pattern-specific recalculation, same-day assertion and unknown-input behavior. A legacy age fixture is not proof of the new publication contract.",
};

/** The methodology requirements, edge-tagged. Assembled by chain in buildBase; a prior-auth requirement is present exactly when its anchoring prior-auth clause is. */
const METHODOLOGY_REQUIREMENTS: VerifyLoop["methodologyRequirements"] = [
  {
    id: "assert-path",
    edge: "cpg",
    text: "§4-req1 — ASSERT THE PATH, not just the disposition: an activity `result is` checks disposition membership only, so two paths ending in the same disposition (a sub's `otherwise` Deny vs a parent's `otherwise` Deny) are indistinguishable; a fall-through / chained proof case must assert the path via the run trace (`viaWhen`/nodeId) or use DISTINCT disposition activities per path.",
  },
  {
    id: "patient-age-projection",
    edge: "cpg",
    text: "Patient age Record publication: validate the supported comparator/unit, explicit shape reduction and answer representation. Verify birthday recalculation, same-day overrides, missing-input repair and method-preserving extraction through native $apply. CRE is a separate prediction. See patient-age-projection for the pattern-owned contract.",
  },
  {
    id: "mutual-exclusivity-spans-closure",
    edge: "prior-auth",
    text: "§4-req2 — the coverage 'exactly one determination on completion, none during a needed-unknown pause' invariant is checked over ALL emission paths (the DELEGATED CLOSURE — parent + any chained `use decision` sub together — AND `all:`/`any:` sibling FAN-OUT): run_decision over the policy's cases must show no run producing >1 determination, INCLUDING a branch that both delegates and `recommend`s, or two determinations placed under one `all:`. (PA is a consumer of this coverage invariant.)",
  },
  {
    id: "communicated-not-ordered",
    edge: "prior-auth",
    text: "Every determination a PA/medical-policy decision recommends is `CPGCommunicationRequest` (communicated), never `CPGServiceRequest` (ordered) — inspect the recommended activities' request types per policy (#134). AUTO when the project configures `crl.dispositions.options` (validator `disposition-request-type`); a manual per-policy check otherwise.",
  },
  {
    id: "configured-membership",
    edge: "prior-auth",
    text: "Every recommended determination is a CONFIGURED `<category>.<key>` disposition (or a bare single-option `<category>`) from the deployment's `crl.dispositions` set — never an unconfigured/ad-hoc determination (#167). AUTO when configured (validator `disposition-not-configured`); a manual per-policy check otherwise.",
  },
  {
    id: "finality-by-mode",
    edge: "prior-auth",
    text: "FINALITY BY MODE: under `standalone` mode every determination leaf must be FINAL (certify/not-certify) — a non-final `pended` (PAS A4) leaf is legitimate ONLY under `embedded` mode. run_decision has no notion of mode/finality, so this is a MANUAL per-policy check UNLESS the project configures `crl.dispositions` (then the validator enforces it: `disposition-non-final-leaf`).",
  },
];

/**
 * The PA determination MODEL surfaced on the prior-auth edge (feature: configurable PA leaves) — customer-agnostic:
 * the framework category vocabulary + the `crl.dispositions` config contract. Replaces the retired advisory facets
 * (act-modality / determination-cardinality / outcome-finality), which became concrete rules (see pa-disposition-set,
 * configure-dispositions, disposition-mode). NOT a deployment's option labels — only the spec-anchored framework.
 */
const DISPOSITION_MODEL: DispositionModel = {
  activityNamePattern:
    '"<category>.<key>" — a plain local `activity` (the KEY elides for a single-option category)',
  localActivityRequired: true,
  categories: DISPOSITION_CATEGORIES.map((c) => ({
    name: c.name,
    reviewActionCode: c.reviewActionCode,
    finality: c.finality,
    meaning: c.meaning,
  })),
  config: {
    location: "the content project's package.json, under `crl.dispositions`",
    shape:
      "{ version, mode: standalone|embedded, options: { <category>: { <key>: { label, code? } } } }",
    modes: {
      standalone:
        "our decision IS the whole adjudication; determination leaves must be FINAL (certify/not-certify)",
      embedded:
        "our decision feeds a larger adjudication; a non-final (pended) leaf is legitimate; ONE determination on completion, none during a needed-unknown pause",
    },
    closedSet:
      "once `options` is configured it is the CLOSED valid set (validator-enforced); an unconfigured project keeps today's behavior (no enforcement)",
    optionCode:
      "an option's `code` is a PAS review-decision-reason code in full-PAS (Approve/Deny) intent, or the larger system's own code in embedded (Met/Unmet) intent",
  },
};

/**
 * The judge-lens rubric — TWO families, each carrying the source-fidelity weighting the uniform severity omits.
 * (1) `waivers` — one rule per provenance WAIVER kind (validators.ts `WAIVER_KINDS`): `validate_provenance`
 *     (FINAL mode) surfaces every escape hatch that suppresses a finding as a UNIFORM manual-review; this rubric
 *     carries the earned-ness weighting (axis, earned-vs-rubber-stamped guidance, checkpoints).
 * (2) `composition` — the decision-composition / chaining source-fidelity checks (§2/§3) with no mechanical home:
 *     the invented-determination-boundary / hollowed-criteria / dropped-or-added-criterion checks that a rule's
 *     `invariant` clause anchors its `test` to via `judgeLens.composition:<check>`.
 */
const JUDGE_LENS: JudgeLens = {
  summary:
    "Two judge-lens families carry the source-fidelity weighting the uniform severity deliberately omits. " +
    "(1) `waivers` — in FINAL mode validate_provenance surfaces every WAIVER (an escape hatch that suppresses a " +
    "finding) as a uniform manual-review; for each, rank scrutiny by its `weightedBy` axis, judge earned-ness " +
    "with `guidance`, and walk the `checkpoints` (the message names the loci — cluster, blast radius, span " +
    "preview, dispositionClass). (2) `composition` — the decision-composition / chaining source-fidelity checks " +
    "(§2/§3) that have NO mechanical (validator) home: whether a `use decision` chain, a `defined as` composite, " +
    "or a refactor INVENTS / HOLLOWS / DROPS a determination boundary or criterion vs the source. A rule's " +
    "invariant clause with a source-fidelity force points its `test` at a composition check via " +
    "`judgeLens.composition:<check>`. A FAITHFUL human refactor STANDS; an unfaithful one is flagged even if deliberate.",
  composition: [
    {
      check: "invented-determination-boundary",
      weightedBy:
        "whether the source delegates a separate determination, or several policies genuinely share one determination.",
      guidance:
        "A use decision is faithful for source-delegation OR a genuinely shared determination. Reuse alone does not establish shared clinical identity: independent policies with coincidentally similar criteria may diverge and must not be coupled. One policy's internal Boolean pathways do not justify inventing a separate determination. Check the source and ownership, not whether the author calls the change DRY.",
      checkpoints: ["Does the source delegate this determination, OR do multiple policies genuinely reference one shared determination?","Does the sub render its own meaningful disposition rather than merely naming a Boolean condition?","Would factoring independent lookalike policies create false coupling?"],
    },
    {
      check: "hollowed-criteria",
      weightedBy:
        "whether the `defined as`/`sem-*` operands are alternative REPRESENTATIONS of ONE clinical fact (faithful inference) or DISTINCT criteria (a decision-composition violation), and whether each distinct criterion surfaces as a distinct STRUCTURAL operand (an inline atom's own `condition[]`, a `when` node, or a named criterion's transparent define + use-site `input[]`) rather than being FUSED into ONE opaque inference `condition[]`.",
      guidance:
        "FAITHFUL: `defined as`/`sem-*` used ONLY over the alternative representations of ONE criterion (one clinical fact — the rung-1 unit). VIOLATION: distinct criteria fused by `defined as`/`sem-*`, REGARDLESS of shared consequence. The semantic distinction is that `sem-*` asserts its operands are one fact's representations, which distinct criteria are not. The faithful home is decision STRUCTURE: a compound branch guard (each source criterion retained in the authored expression and dependency `input[]`) or a named `criterion` (one identifier `condition[]` resolving to a TRANSPARENT decomposable define with its atoms in the use-site `input[]`, post-#236) when they share one consequence, sibling `when` branches when they route differently. Flag a distinct-criteria composite even if deliberate; a one-fact `defined as` STANDS even if deliberate. (The REVERSE — exposing one criterion's sub-representations as `when` nodes — is faithful; do NOT revert it.) NOT behaviour-based: re-grounding a composite to a guard is a zero-behaviour diff — 'it changed nothing' is expected (the truth function is preserved), not a defence. APPLY UNIT ANCHORING FIRST, OR THIS CHECKPOINT CANNOT FAIL: name the single clinical reality the operands each RECORD, WITHOUT using the composite's own label. If you cannot, they are distinct criteria and the faithful home is decision structure. 'The policy groups them under one heading' is evidence of nothing — a heading is a label, not a fact. MECHANICAL COROLLARY (no source read needed): an operand that ALSO appears as a guard atom anywhere in the decision is a distinct criterion; a floor, not a substitute — it catches only the subset the author re-used. EXPECT most composites in a real policy to FAIL; a pass clearing the majority must be re-run against UNIT ANCHORING before it is reported. Publication-reachable branch guards, including references through a criterion, preserve the whole Boolean expression in one text/cql-expression applicability condition, with dependency input[] and null-propagating priority exclusions. Legacy guards use per-atom condition[] and DNF arms. Both retain source criteria in decision logic; the number of condition[] entries is not a source-fidelity test.",
      checkpoints: [
        "Are the `defined as`/`sem-*` operands alternative REPRESENTATIONS of ONE clinical fact, or DISTINCT criteria of the policy? Operational test (from decision-shapes.md): would a policy reviewer expect to see this operand as its OWN criterion line (→ distinct criterion; use structure) or as one of several data forms of a single fact (→ representation; inference is faithful)?",
        "Are the distinct criteria carried by decision STRUCTURE — each an inline atom in the applicability expression and dependency `input[]`, a `when` node, or a named `criterion` (one identifier `condition[]` resolving to a TRANSPARENT decomposable define with its atoms in the use-site `input[]`, post-#236) — or are they FUSED inside ONE opaque `defined as`/`sem-*` inference `condition[]` (the violation)? The test is OPACITY-OF-INFERENCE, not action-level condition count: a named criterion is faithful even though its sub-atoms live in its define + `input[]` rather than as separate action conditions.",
        "Is precedence among outcomes computed by `first:` branch ORDER (faithful), or by `sem-not` FINAL-* concepts in the inference layer (the retired pre-#224 workaround)?",
        "Name the ONE clinical reality the operands each RECORD, without using the composite's label. Cannot? -> distinct criteria -> decision structure.",
      ],
    },
    {
      check: "dropped-or-added-criterion",
      weightedBy: "presence/absence of each source criterion in the encoding.",
      guidance:
        "The encoding must neither DROP a source criterion (HOLLOW) nor ADD a criterion / boundary the source " +
        "does not state. A FAITHFUL human refactor STANDS; an unfaithful one (invents / hollows / drops) is " +
        "flagged even if deliberate.",
      checkpoints: ["Is every source criterion a visible node/operand (an operand in the applicability expression and dependency `input[]`, a `when` node, a named criterion's transparent define + use-site `input[]`, or a rung-1 representation)?","Is any criterion or determination boundary present that the source does not state?"],
    },
  ],
  waivers: [
    {
      kind: "waiver-authored",
      weightedBy:
        "authoredKind — clinical-assumption / derived-glue (clinical logic with NO source span) = highest scrutiny; " +
        "implementation-artifact / modeling-rationale = routine (rubber-stamp).",
      guidance:
        "An authored item with `supports` suppresses the over-reach of every candidate CRL node in its cluster (the " +
        "BLAST RADIUS named in the message). Earned when the suppressed logic is genuine glue/implementation the source " +
        "implies; suspect when it invents a clinical decision the narrative never states.",
      checkpoints: [
        "Read the blast radius: is each suppressed node really implied by this cluster's source, or invented?",
        "Is the authoredKind honest — is a `clinical-assumption` truly assumption, not a dodged criterion?",
        "Would removing this authored support re-expose a real over-reach the KE should have linked instead?",
      ],
    },
    {
      kind: "waiver-ignored-span",
      weightedBy:
        "MN-keyword / clinical language in the span preview — a ⚠ MN-hard match means the ignored text likely IS a " +
        "coverage criterion (scrutinize hard); plain chrome (page numbers, headers) is routine.",
      guidance:
        "An ignoredRange suppresses an uncovered-span (Missed₂) — the span is deliberately not modeled. Earned for " +
        "true page chrome / boilerplate; a dodged coverage criterion is the failure mode this waiver exists to catch.",
      checkpoints: [
        "Read the span text preview: is it genuinely non-clinical chrome, or a criterion ignored away?",
        "If the message flags MN language, treat the ignore as suspect until proven boilerplate.",
        "Does the `reason` actually justify the omission, or is it a placeholder?",
      ],
    },
    {
      kind: "waiver-intentional-unlink",
      weightedBy:
        "the node's decision relation + the cluster's source context — an intentionally-unlinked decision-sub-node in a " +
        "clinically-loaded cluster is more suspect than one in a clearly out-of-scope branch.",
      guidance:
        "A LEGAL intentionally-unlinked ref (not a must-link-decision item's decision ref — that is the illegal-" +
        "intentional-unlink ERROR) suppresses an over-reach candidate. This is an OVER-REACH escape, NOT a Missed₁ gap. " +
        "Earned when the node truly is out of scope for this policy; suspect when it silences logic the policy needs.",
      checkpoints: [
        "Confirm the omission is deliberate and the node is genuinely out of this policy's decision scope.",
        "Check the cluster's source context — does the narrative actually exclude this node, or is it being dodged?",
      ],
    },
    {
      kind: "waiver-disposition-class",
      weightedBy:
        "dispositionClass — route-elsewhere / presumed-scope / pend assert 'not my decision' (scrutinize, esp. " +
        "presumed-scope on clinical language); no-operational-disposition is routine admin/definition.",
      guidance:
        "A source item tagged non-decision-role + dispositionClass acknowledges a span out of decision scope — the " +
        "laundering route a genuine criterion can take to evade missed-decision / V9 / over-reach. Earned for true " +
        "applicability/admin spans; a presumed-scope on a clinical criterion is the failure mode. If V8 mn-keyword also " +
        "fired on the item, the coverage language strengthens the concern.",
      checkpoints: [
        "Is the span genuinely out-of-decision-scope, or a criterion acknowledged away under a disposition tag?",
        "Be especially suspicious of presumed-scope / route-elsewhere on clinically-loaded text.",
        "If mn-keyword also fired here, reconcile the role before accepting the waiver.",
      ],
    },
  ],
};

const BOUNDARY_ENTRIES: { text: string; edge: AuthoringEdge }[] = [
  {
    text: "Supported definition is producers include selected-answer qualification, named-set membership over a declared domain, Quantity at least thresholds and BMI with explicit validity. These are in scope. General count/temporal/collection refinements, anchored age at start of and arbitrary pipelines are outside these worked examples; consult the current catalog and establish validation, emit and native evidence before relying on them. The representation-reference artifact remains a validate-only preview of its particular unimplemented combinations. This kit does not yet serve a complete executable BMI/threshold/ServiceRequest example: BMI and thresholds occur in a broader validate-only preview. These supported forms still require project-specific validation, emission and native execution; that example-coverage gap is not a language prohibition.",
    edge: "cpg",
  },
  {
    text: "External `source representation` + `coded from` forms are legal and have implemented paths, including request records and rep-local `exists this` projections. They extend beyond the introductory local-question examples. This kit's representation-reference artifact remains validate-only because its particular local-code + top-level definition forms are not lowered; that stamp is not a ban on external representations or a claim that #257/#270 are wholly unbuilt. Preserve a faithful model and establish its actual emit/engine proof.",
    edge: "cpg",
  },
  {
    text: "PA Pended (HCR01 A4) is a configured non-final leaf allowed only in embedded mode; standalone requires final leaves. A needed-unknown pause is before any leaf, produces no determination, and never requires adding a pended activity.",
    edge: "prior-auth",
  },
  {
    text: "the numeric legacy emit MATERIALIZATION cap (an INLINE compound guard's expanded-DNF ARM bound) — owned by the EMITTER as a resource bound and REPORTED by it (`compound-guard-expansion-overflow`); the kit reasons about PROXIMITY qualitatively (see branch-guards over-envelope doctrine) and defers the cap's VALUE to the emitter, never copying it into the kit (drift). (A `criterion` no longer has an expansion cap — post-#236 it is one referenced define, not materialized into the DNF; the old `criterion-expansion-overflow` + criterion-atom bound are retired.)",
    edge: "cpg",
  },
  {
    text: "Engine and FHIR round-trip proof beyond the specific checks named by verificationLegend.",
    edge: "cpg",
  },
];

/**
 * The reference artifacts, edge-tagged (#191): the PA determination exemplars (criteria / pa-determination /
 * source-delegated / disposition-arbitration) ride the `prior-auth` edge because they ARE PA coverage-determination
 * content — they recommend configured `<category>.<key>` determinations (certify/not-certify/pended) and carry their
 * own local determination `activity` blocks (validated against `crl.dispositions`; the shared vendored library was
 * retired in the configurable-PA-leaves work). The `cpg` base keeps the pure-CDS `decision-reference` (service
 * ORDERS), the `patient-age` projection exemplar, and the `representation-reference` capability preview (validate-only — the
 * v3 multi-representation concept model). (A cpg-general criteria/delegation exemplar is deferred to the CPG-edge
 * build; the `cpg` decision RULES still teach the composition surface.)
 *
 * KNOWN GAP (deferred to the CPG-edge build): a few `cpg` RULES point by name at exemplars that ride the
 * `prior-auth` edge — `decision-composition`/`concept-form` → `criteria-decision-reference` +
 * `disposition-arbitration-reference`, `chaining-necessity` → `source-delegated-decision-reference`. For a
 * `prior-auth` author these resolve (the artifacts are in their chain); for a PURE-`cpg` author they are dead
 * prose pointers (soft doc-refs only — NOT resolvable activity refs, so closure + the hash are unaffected). The
 * fix is to author cpg-general (plain-activity) versions of those exemplars when the CPG seat is built; until
 * then the sole real consumer is the PA seat (`prior-auth`), for whom the refs resolve.
 */
/**
 * The in-payload legend for `ReferenceArtifact.verification` (a TS docstring never reaches the remote-MCP
 * consumer). The independent tiers are different KINDS of proof, NOT an ordered rank. It states the PROOF axis
 * (is it runtime-proven, and by what?) — ORTHOGONAL to the AUTHORING-SCOPE axis (`boundary` / `conceptLayerModel`
 * `scope`): a `validate-only` artifact can demonstrate a construct that is OUT of scope to AUTHOR at this stage.
 */
const VERIFICATION_LEGEND: VerificationLegendEntry[] = [
  {
    tier: "fhir-emit",
    means:
      "This exact CRL artifact and its declared dependency/configuration context emit successfully in the kit suite with no hard errors. Decision examples must produce case-feature StructureDefinitions; the named terminology dependency must produce its ValueSet.",
    doesNotProve:
      "CQL translation, engine execution, questionnaire population/extraction, clinical correctness, or emission of its CEL companion.",
  },
  {
    tier: "cre-run",
    means:
      "The artifact — a `.crl` + `.cel` PAIR — is executed through the CRE (the engine behind `run_decision`) by the kit's OWN test suite every build (a `.cel`'s tier names the pair it proves). For each supplied case, checks activity membership or the asserted whole-decision pause prediction, according to its CEL result assertion.",
    doesNotProve:
      "Activity assertions prove membership, not exact output, absence of other guarded items, or path identity. Pause assertions prove the CRE prediction, not native `$apply` pausing. Neither proves clinical `code is` correctness, engine retrieval, FHIR emit, or `$apply`. CRE code-membership execution is not a clinical terminology review.",
  },
  {
    tier: "engine-run",
    means:
      "Validated by the kit suite, AND the artifact's CONSTRUCT was verified at `PlanDefinition/<id>/$r5.apply` POINT-IN-TIME by a separate engine harness (used for the patient-age recency merge, which this kit's CRE cases cannot prove).",
    doesNotProve:
      "That THIS exact artifact is re-run by the kit suite — the `$r5.apply` verification is a historical, point-in-time claim over the construct, not a per-build regression. There is no CEL companion.",
  },
  {
    tier: "validate-only",
    means:
      "Validated by the kit suite (build + validator-clean) only. A capability PREVIEW of the concept model — reachable so the worked form (e.g. the value-preserving `sem-or` union) can be learned.",
    doesNotProve:
      "Any runtime behavior OF THIS ARTIFACT: the suite does not execute its constructs. Individual constructs have shipped since this exemplar was written; its verification stamp makes no claim about those other fixtures. An artifact MAY embed a construct that IS runtime-shipped in production (e.g. the patient-age `value projection`) — `validate-only` only says THIS artifact was not runtime-proven here (not re-verified at `$r5.apply`), never that every construct in it is deferred. It is NOT a runtime-proven template, and NOT a Stage-1 authoring license (see `boundary`).",
  },
];

const REFERENCE_ARTIFACTS: ReferenceArtifact[] = [
  { name: "named-answer-reference.crl", language: "crl", edge: "cpg", verification: ["cre-run", "fhir-emit"], purpose: "Selected coded answers, explicit negative exceptions and question presentation. Use with named-answer-terms.crl and named-answer-reference.cel; package.json crl.canonicalBase = " + ANSWER_EXAMPLE_BASE + ". The owning test also checks CQL emission and emitted presentation extensions; it does not execute native $apply.", source: answerExampleSource() },
  { name: "named-answer-terms.crl", language: "crl", edge: "cpg", verification: ["fhir-emit"], purpose: "Imported answer vocabulary for named-answer-reference.crl. Validated and emitted as a terminology module (ValueSet, no Case Feature profile), and used by the tested CRL/CEL closure. Use the same canonicalBase as the named-answer reference; this module defines no standalone decision.", source: `library "Shared".\n${ANSWER_EXAMPLE_TERMS}` },
  { name: "named-answer-reference.cel", language: "cel", edge: "cpg", verification: ["cre-run"], purpose: "Actual positive and explicit-negative CEL cases consumed by the named-answer closure test; bare answer codes resolve to their unique offered systems.", source: ANSWER_EXAMPLE_CEL },
  {
    name: "decision-reference.crl",
    language: "crl",
    edge: "cpg",
    purpose:
      "Legacy menu example with explicitly answered action guards and no selected publications in its original case context. It is not a missing-answer pause template; mixing unanswered action guards with publications is unsupported (see guards). Canonical Stage-1 decision: first:/otherwise ordered precedence + a matched branch opening an `any:` menu with `unless`/`only when` guards and an always-offered item; local `code is` concepts; plain activity dispositions.",
    verification: ["cre-run", "fhir-emit"],
    source: DECISION_REFERENCE_CRL,
  },
  {
    name: "decision-reference.cel",
    language: "cel",
    edge: "cpg",
    purpose:
      "Companion cases for decision-reference.crl: Patient subject, concept-linked facts, and one `result is` oracle per path (the unless drop, the only-when enable, ordered exclusion, a plain offer).",
    verification: ["cre-run"],
    source: DECISION_REFERENCE_CEL,
  },
  {
    name: "criteria-decision-reference.crl",
    language: "crl",
    edge: "prior-auth",
    purpose:
      "The model for #168: a policy's DISTINCT criteria as decision STRUCTURE (each criterion visible/auditable) — nested `when` nodes or a COMPOUND BRANCH GUARD `when ( A and B )` (nesting/`and` = AND): a legacy inline atom is its own action `condition[]`; a publication guard preserves the whole expression with dependency `input[]`; a named `criterion` is one identifier `condition[]` whose TRANSPARENT decomposable define + use-site `input[]` expose its atoms (post-#236, NOT collapsed into the parent). \"Failed Conservative Therapy\" (failed drug therapy OR failed physical therapy) is a named `criterion` — lowered ONCE to a boolean define referenced by identity, NOT a `defined as`: failed drug therapy and failed physical therapy are two SEPARATE events joined in the DECISION layer. Its CONTRAST — \"Viral Suppression Documented\" (ONE clinical state attested two ways: a lab result OR a chart note) — IS a `defined as ( ... sem-or ... )`, riding the tree as a single-concept `when` node: the artifact's end-to-end proof that the sanctioned rung-1 construct emits + runs. THE TELL — alternative records of a SINGLE underlying occurrence (their records may coexist) are one fact → `defined as`; SEPARATE independently-occurring events are distinct criteria → decision structure. Criteria that route to DIFFERENT consequences MUST be separate `when` nodes; a conjunction sharing ONE consequence is a compound branch guard (or a `criterion`). Distinct criteria are NEVER fused into a `defined as`/`sem-*` composite (see decision-composition). `defined as` at the concept level normalizes ONE concept's representations.",
    verification: ["cre-run", "fhir-emit"],
    source: CRITERIA_DECISION_REFERENCE_CRL,
  },
  {
    name: "criteria-decision-reference.cel",
    language: "cel",
    edge: "prior-auth",
    purpose:
      "Companion cases exercising each decision NODE: criterion-1 node (Has Qualifying Diagnosis), the nested criterion-2 node (the failed-conservative-therapy guard-`or`, resolving on EITHER distinct criterion — drug OR physical therapy), the criterion-3 node (the viral-suppression `defined as`, resolving on EITHER record — lab OR chart note — of the one occurrence, and denying at its `otherwise` when both evidence predicates are explicitly false), and the top-level otherwise.",
    verification: ["cre-run"],
    source: CRITERIA_DECISION_REFERENCE_CEL,
  },
  {
    name: "pa-determination-reference.crl",
    language: "crl",
    edge: "prior-auth",
    purpose:
      "Canonical PRIOR-AUTHORIZATION exemplar (#134) — distinct from the CDS decision-reference (which ORDERs a service). The payer COMMUNICATES the determination via configured `<category>.<key>` local activities (certify.Approve / not-certify.Deny), validated against crl.dispositions; Pended (A4) is a non-final leaf, legitimate only in embedded mode.",
    verification: ["cre-run", "fhir-emit"],
    source: PA_DETERMINATION_REFERENCE_CRL,
  },
  {
    name: "pa-determination-reference.cel",
    language: "cel",
    edge: "prior-auth",
    purpose:
      "Companion cases for the PA exemplar: qualifying diagnosis → certify.Approve; otherwise → not-certify.Deny. The determination activities are local (config-driven, no shared library).",
    verification: ["cre-run"],
    source: PA_DETERMINATION_REFERENCE_CEL,
  },
  {
    name: "source-delegated-decision-reference.crl",
    language: "crl",
    edge: "prior-auth",
    purpose:
      "Exemplar B — SOURCE-REQUIRED delegation (§2/§5-B): the source NAMES a separate determination, so the policy chains to it with a BARE same-library `use decision`. NOT DRY/reuse factoring — chaining is faithful only because the source draws the boundary. The bare same-library delegation IS evaluated (recursed; the sub determination bubbles up), so the oracle names the DELEGATED disposition, not the sub-decision name. One parent + one delegated sub.",
    verification: ["cre-run", "fhir-emit"],
    source: SOURCE_DELEGATED_DECISION_REFERENCE_CRL,
  },
  {
    name: "source-delegated-decision-reference.cel",
    language: "cel",
    edge: "prior-auth",
    purpose:
      "Companion cases for exemplar B: the two delegated-path cases (continuation → the sub's Approve/Deny bubbles up) + the two parent-resolved cases. The kit's unit test asserts the continuation→Deny case's PATH goes through the delegated sub (not the parent `otherwise`) — §4-req1.",
    verification: ["cre-run"],
    source: SOURCE_DELEGATED_DECISION_REFERENCE_CEL,
  },
  {
    name: "disposition-arbitration-reference.crl",
    language: "crl",
    edge: "prior-auth",
    purpose:
      "Exemplar C — DISPOSITION-ARBITRATION (§5-C / §6). The TEMPTING-but-DON'T-chain case: ONE determination with MANY OVERLAPPING pathways + outcome PRECEDENCE + fall-through, which a KE is tempted to factor into chained sub-decisions — but the source draws no boundary, so it is ONE determination. Faithful form (CRL #224): each pathway a sibling `when` gated on its FULL conjunction as a COMPOUND BRANCH GUARD, the precedence carried by `first:` branch ORDER, the residual by `otherwise` — every criterion a visible guard atom, partial matches fall through (no trap), NO `use decision` and NO `sem-not` inference-layer arbitration. Two denies use DISTINCT activities (Deny vs Deny EIU) so `result is` distinguishes them.",
    verification: ["cre-run", "fhir-emit"],
    source: DISPOSITION_ARBITRATION_REFERENCE_CRL,
  },
  {
    name: "disposition-arbitration-reference.cel",
    language: "cel",
    edge: "prior-auth",
    purpose:
      "Companion cases for exemplar C (verified 6/6): each pathway alone (approve), BOTH load-bearing overlap cases (a both-indication patient who fails one pathway still approves via the other — no overlap-pop), within-indication failure (Deny), off-indication (Deny EIU).",
    verification: ["cre-run"],
    source: DISPOSITION_ARBITRATION_REFERENCE_CEL,
  },
  {
    name: "patient-age-both-rep-reference.crl",
    language: "crl",
    edge: "cpg",
    purpose:
      "Synthetic age Record publication with Patient calculation and local answers. The age pattern recalculates daily and admits same-day asserted overrides; missing input remains unknown. Execute the emitted artifact and its full Q/QR interaction. See patient-age-projection for method metadata and temporal rules.",
    verification: ["engine-run", "fhir-emit"],
    source: PATIENT_AGE_BOTH_REP_REFERENCE_CRL,
  },
  {
    name: "representation-reference.crl",
    language: "crl",
    edge: "cpg",
    purpose:
      "The v3 concept-model multi-representation exemplar (Mammogram multi-source + BMI cascade + a standalone patient-age projection) — reachable in the payload so a remote-MCP consumer can READ the worked form (a `ref:` path string can't be followed; disc 398 measured a MISSING worked `sem-or` REGENERATING the 'defined-as is boolean' misconception). Teaches: the value-preserving `sem-or` union of two dateTime concepts into a dateTime `Mammogram` (NOT boolean — only `defined as exists` / a top-level `sem-not` are boolean); addressability-split discipline (split a concept into named sub-concepts only when a downstream query must NAME the subset — NOT by provenance alone; contrast `Height`, one posrep, no split); source representations with model-provided datum carriers; the STANDALONE patient-age `value projection` (`age today under 6 months` over `Patient.birthDate` — the worked Patient projection, `months` unit #257 T2, no local `code is` so no answer arm; explicit Record publication with shape reduction; see rule patient-age-projection); and `defined as exists` / `definition is` selection/count/within forms. CAPABILITY PREVIEW, `verification: validate-only` (the ARTIFACT tier — the suite builds + validates it, but does NOT execute it). It PARSES + VALIDATES clean; This exact artifact has no runtime proof. External representation (#257) and record-existence (#270) support elsewhere does not make this exemplar executable. ONE construct — the patient-age `value projection` — is by contrast runtime-SHIPPED in production (the #257 age slice; construct- + executed-CQL-verified) and IS in-stage authorable; but THIS artifact stays `validate-only` (that projection is not re-verified at `$r5.apply` here). This is a PROOF-axis status: do NOT copy it as a run_decision-complete Stage-1 artifact. Its forms must be checked individually; the stamp is not a language legality ban.",
    verification: ["validate-only"],
    source: REPRESENTATION_REFERENCE_CRL,
  },
];

/**
 * Assemble the fully edge-FILTERED kit payload for a (stage, useCase). Filtering happens HERE, before the hash
 * is taken in getAuthoringKit — so each useCase yields a distinct, stable `contentHash` over its own content.
 * `useCase` resolves to an edge chain by NAME; a unit of content is included iff its `edge` is in the chain.
 */
function buildBase(
  stage: AuthoringStage,
  useCase: AuthoringUseCase,
): Omit<AuthoringKit, "contentHash"> {
  const chain = USE_CASES[useCase].chain;
  const inChain = (edge: AuthoringEdge): boolean => chain.includes(edge);
  const includesPriorAuth = inChain("prior-auth");

  const verifyLoop: VerifyLoop = {
    ...VERIFY_LOOP_BASE,
    note: VERIFY_LOOP_NOTE_BASE + (includesPriorAuth ? VERIFY_LOOP_NOTE_PRIOR_AUTH : ""),
    methodologyRequirements: METHODOLOGY_REQUIREMENTS.filter((m) => inChain(m.edge)),
  };

  const base: Omit<AuthoringKit, "contentHash"> = {
    schemaVersion: SCHEMA_VERSION,
    stage,
    useCase,
    chain: [...chain],
    summary: SUMMARY,
    forceModel: FORCE_MODEL,
    conceptLayerModel: CONCEPT_LAYER_MODEL,
    rules: RULES.filter((r) => inChain(r.edge)),
    typeAllowlist: TYPE_ALLOWLIST,
    referenceArtifacts: REFERENCE_ARTIFACTS.filter((a) => inChain(a.edge)),
    verificationLegend: VERIFICATION_LEGEND,
    examples: EXAMPLES,
    verifyLoop,
    judgeLens: JUDGE_LENS,
    feedbackUrl: FEEDBACK_URL,
    boundary: BOUNDARY_ENTRIES.filter((b) => inChain(b.edge)).map((b) => b.text),
  };
  if (includesPriorAuth) {
    base.dispositionModel = DISPOSITION_MODEL;
  }
  return base;
}

function isStage(stage: string): stage is AuthoringStage {
  return (STAGES as readonly string[]).includes(stage);
}

function isUseCase(useCase: string): useCase is AuthoringUseCase {
  return (USE_CASE_NAMES as readonly string[]).includes(useCase);
}

/**
 * Assemble the authoring kit for a (stage, useCase). Throws on an unknown stage or useCase (the MCP tool catches
 * it and returns a tool error listing the valid values). An OMITTED `useCase` resolves to the neutral `cpg` base
 * — NOT PA. A PA author must pass `useCase:"prior-auth"` explicitly (fail-loud; never silent-PA). Omitted and
 * explicit `"cpg"` return the byte-identical payload and the same `contentHash` (the default-note is out-of-band,
 * in the MCP tool description — never a hashed payload delta).
 */
export function getAuthoringKit(
  stage: string = DEFAULT_STAGE,
  useCase: string = DEFAULT_USE_CASE,
): AuthoringKit {
  if (!isStage(stage)) {
    throw new Error(`Unknown authoring stage "${stage}". Valid stages: ${STAGES.join(", ")}.`);
  }
  if (!isUseCase(useCase)) {
    throw new Error(
      `Unknown authoring useCase "${useCase}". Valid useCases: ${USE_CASE_NAMES.join(", ")}.`,
    );
  }
  const base = buildBase(stage, useCase);
  const contentHash = createHash("sha256").update(JSON.stringify(base)).digest("hex");
  return { ...base, contentHash };
}
