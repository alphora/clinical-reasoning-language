// REFACTOR:grounded (review642): one kit; applicability never filters teaching.
import { ANSWER_EXAMPLE_BASE, ANSWER_EXAMPLE_TERMS, ANSWER_EXAMPLE_CEL, answerExampleSource } from "./answerExample";
import { SELECTION_REFERENCE_CRL, SELECTION_REFERENCE_CEL } from "./selectionExample";
import { QUANTITY_EXAMPLE_DECLARATION, QUANTITY_EXAMPLE_FACT } from "./quantityExample";
import { SOURCE_ORDER_EXAMPLE } from "./sourceOrderExample";
/**
 * `authoring_kit` — the self-contained authoring knowledge a fresh-context KE
 * agent needs to encode an artifact, served
 * over MCP (no filesystem access to this repo required).
 *
 * Design (see .vibe-tools/discussions/084): the type vocabularies are imported
 * from the generated grammar wrappers (source of truth — they can't drift); the
 * prose rules are anchored to docs/validator rule-names; every example and the
 * reference artifacts are validated by the unit test (no unverified CRL ships);
 * `contentHash` is derived so the kit's identity can't lie.
 */
import audit from "./audit.json";
import { buildKitIndex } from "./navigation";
import { artifactRequirements } from "./requirements";
import { createHash } from "node:crypto";

import { DISPOSITION_CATEGORIES } from "../dispositions/categories";
import { activityTypes } from "../grammar/activityTypes";
import { conceptTypes } from "../grammar/conceptTypes";
import { conceptValueTypes } from "../grammar/conceptValueTypes";
import { ENGINE_JAR_SOURCE } from "../results/spawn";

import {
  DISPOSITION_ARBITRATION_REFERENCE_CEL,
  DISPOSITION_ARBITRATION_REFERENCE_CRL,
  PA_DETERMINATION_REFERENCE_CEL,
  PA_DETERMINATION_REFERENCE_CRL,
  PATIENT_AGE_BOTH_REP_REFERENCE_CRL,
  PUBLICATION_REFERENCE_CRL,
  SOURCE_DELEGATED_DECISION_REFERENCE_CEL,
  SOURCE_DELEGATED_DECISION_REFERENCE_CRL,
} from "./reference";
import type {
  AuthoringKit,
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
  AuthoringKit,
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
//   `concept = value type + (n source contributions and/or ≤1 derived)` (framed via the existing scope tags so Stage-1's
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
// 1.38 (released in CRL 5.0.0): retire Scalar teaching and legacy templates; selected answers
// gain pause cases; the supported BMI subset becomes an emitting reference.
// Broad audit: teach final selection from the owning CRE inputs and scope answer
// interpretation to the selected record. Audit coverage is recorded separately.
// "1.38" → "2.0": one complete kit with task/topic retrieval, executable prerequisites,
// explicit applicability and separate repository audit identity. No kit use-case selector.
// "2.0" → "2.1" (SHAPE + CONTENT): every rule has explicit force clauses; no implicit classification.
const SCHEMA_VERSION = "2.1";
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
    "Every rule carries nonempty explicit `clauses`; each clause states its force. A rule may mix forces: " +
    "do not collapse them into a rule-wide default. Read clauses with their rule prose and applicability. " +
    "Prose still describes language semantics and tool behavior; a force level does not make those facts " +
    "overridable. Use the explicit clauses to determine force. If prose appears to introduce a different obligation, report the ambiguity instead of guessing its force. " +
    "Invariant anchors identify manual source or verification obligations; resolving an anchor does not prove " +
    "the obligation was performed. The force tells the agent how hard to bind. It exists so an " +
    "agent that mechanically enforces an authoring PREFERENCE does not revert a human KE's deliberate, " +
    "faithful refactor. The force is operator-governed content, not agent-editable.",
  levels: [
    {
      level: "validator-enforced",
      meaning:
        "The grammar/validator reports the stated condition within its documented scope and preconditions. " +
        "An error rejects the input; an explicitly described warning leaves it legal. A warning is not a " +
        "rejection; absence of a diagnostic outside the checked scope is not proof of correctness.",
    },
    {
      level: "invariant",
      meaning:
        "An obligation that applies regardless of author: either source fidelity (avoid an ADD or HOLLOW " +
        "against the source) or per-policy verification and artifact integrity. Every invariant carries a `test` that RESOLVES to a real check — never " +
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
      "Declare value type explicitly on selected Observation publications: boolean for a finding used as a guard, Quantity for a measurement, CodeableConcept for a coded answer. The Case Feature expression returns the selected record; supported guards read its Boolean value. Do not relabel coded or numeric data as boolean to satisfy a guard: derive a separate qualification or threshold publication. Missing answers remain unknown; record presence does not establish a true answer. Selected publications are rejected in legacy aliases, sem composition, collection-existence reductions and per-action menu guards (publication-unsupported-context). Use supported publication producers and branch/criterion guards. Validation checks do not replace emitted CQL and native execution.",
    scope: "in",
  },
  {
    form: "- shape is Record.",
    meaning:
      "A selected publication returns one Observation record. Declare its value type and shape reduction is most recent explicitly. Eligible local, sourced and inferred candidates enter the final selection after each producer's own operations. RecordSet history and arbitrary reductions are outside this supported contract.",
    scope: "in",
  },
  {
    form: "- code is `local-code`.",
    meaning:
      "The local code identifies the analytical Case Feature and its answer representation, not a chart diagnosis. Use the explicit selected Observation publication contract. A missing answer is unknown; false is an answer value. A presentation is optional: absence warns and uses the concept name as question text with no description.",
    scope: "in",
  },
  {
    form: '- source representation: - type is <Resource>. - [ coded from "Value Set" ] - [ value projection is <phrase> ].',
    meaning:
      "Write every concept-level field before the first source representation; source representations come last, and indentation does not close them. A source representation declares its resource type, optional coded from membership and value projection. Model information supplies the datum carrier; do not author value element is or value type is on the representation. coded from retrieves matching source records; value from is binds offered answers. Supported publication forms include Patient age projection, matching ServiceRequest with value projection is exists this, and finite-code Observation Quantity sources. Source and local contributions join before the final authored selector. Patient age has its own daily recalculation/same-day assertion policy; no universal local-wins rule follows. Opaque ValueSet retrieval and arbitrary projection/producer combinations remain unsupported in this publication path; parsing a phrase is not proof of emission.",
    scope: "in",
  },
  {
    form: "- definition is <predicate>.",
    meaning:
      "definition is contributes inferred candidates using a supported producer; it does not select the final combined collection. This kit teaches selected-answer in qualifying, a separate named-set membership predicate over a declared value domain, Quantity at least thresholds, and body mass index with an explicit validity operand. Each pattern owns its input, missing-value and validity behavior. shape reduction is most recent selects the final Record. General count/temporal/collection refinements do not have a complete publication replacement. Patient age today is a source value projection; anchored age at start of is a separate measure-context form outside these worked examples.",
    scope: "in",
  },
  {
    form: "- shape is Record. - type is Observation. - value type is boolean. - code is `age-code`. - shape reduction is most recent. - source representation: - type is Patient. - value projection is age today <at least | at most | under | younger than> <N> years|months.",
    meaning: "The age pattern recalculates from Patient birthDate each day. A same-day assertion can override; a determinate fresh calculation supersedes older assertions. Missing birthDate remains unknown.",
    scope: "in",
  },
];

const RULES: KitRule[] = [
  {
    id: "concept-form",
    applicability: "All CRL authoring",
    category: "concept-model",
    rule: "For selected concepts declare shape is Record, type is Observation, value type is and shape reduction is most recent. Supply data with code is, a supported source representation or a supported definition is producer. code is provides the local answer representation; an uncoded calculation has no local answer slot. Coded answers use value domain is answer options and value from is \"Named Terminology\". Presentations separate questions from concept names. Supported patterns include Patient age, ServiceRequest existence, finite-code Quantity sources, answer qualification, thresholds and BMI with explicit validity. These are bounded contracts; unsupported composition is a capability gap, not a reason to copy legacy Scalar content. Missing evidence for an answerable determination stays unknown; false needs an explicit negative or a computation establishing it. For selected-datum membership, an interpretable known non-member yields false; no selected datum or value leaves it unknown. Membership of one selected datum is not existence of any matching record: a selected non-repair request cannot establish that no repair was requested elsewhere. Inferring a broader negative from absent records requires an explicit completeness assumption for subject, scope and time. The completeness language/enforcement remains #320 design work; neither code is nor receipt of a data bundle supplies that contract.",
    why: "Separate what supplies data, what computes a candidate, what selects the published record and what expresses the decision. A kit scope label must not forbid forms that the same kit teaches. Preserve distinct source criteria as auditable decision operands; do not infer one fact merely from a shared label.",
    ref: "concept-layer-model; publication-reference.crl; named-answer-options",
    clauses: [
  {
    "text": "For selected concepts declare shape is Record, type is Observation, value type is and shape reduction is most recent. Supply data with code is, a supported source representation or a supported definition is producer. code is provides the local answer representation; an uncoded calculation has no local answer slot. Coded answers use value domain is answer options and value from is \"Named Terminology\". Presentations separate questions from concept names. Supported patterns include Patient age, ServiceRequest existence, finite-code Quantity sources, answer qualification, thresholds and BMI with explicit validity. These are bounded contracts; unsupported composition is a capability gap, not a reason to copy legacy Scalar content. Missing evidence for an answerable determination stays unknown; false needs an explicit negative or a computation establishing it. For selected-datum membership, an interpretable known non-member yields false; no selected datum or value leaves it unknown. Membership of one selected datum is not existence of any matching record: a selected non-repair request cannot establish that no repair was requested elsewhere. Inferring a broader negative from absent records requires an explicit completeness assumption for subject, scope and time. The completeness language/enforcement remains #320 design work; neither code is nor receipt of a data bundle supplies that contract.",
    "force": "default"
  },
  {
    "text": "Keep distinct criteria in decision STRUCTURE, with their source meaning visible in the applicability expression and dependency input[] or in a named criterion's transparent define. A shared label does not turn separate events into one fact. Do not fuse distinct criteria into a defined as composite.",
    "force": "invariant",
    "test": "judgeLens.composition:hollowed-criteria"
  }
],
  },
  {
    id: "value-type",
    applicability: "All CRL authoring",
    category: "concept-model",
    rule: "Declare value type explicitly on selected Observation publications: boolean for a finding used as a guard, Quantity for a measurement, CodeableConcept for a coded answer. The Case Feature expression returns the selected record; supported guards read its Boolean value. Do not relabel coded or numeric data as boolean to satisfy a guard: derive a separate qualification or threshold publication. Missing answers remain unknown; record presence does not establish a true answer. Selected publications are rejected in legacy aliases, sem composition, collection-existence reductions and per-action menu guards (publication-unsupported-context). Use supported publication producers and branch/criterion guards. Validation checks do not replace emitted CQL and native execution.",
    why: "The published value type is what makes a concept's result legible AND checkable at every use site; Declaring it explicitly and checking it against the supported producer output contract catches disagreements at validation rather than at apply time (the #231 lane bug the redesign closes). The guard⇒boolean check is the specific rule that catches the A.10b masking — a coded-resource determination mis-typed `CodeableConcept` but consumed as a guard. Separating normative doctrine from shipped enforcement keeps the kit honest: it teaches the model to author to without claiming coverage the validator does not yet have.",
    ref: "src/emit/publicationProgram.ts; src/validator/useSiteTypeValidator.ts; named-answer-options",
    clauses: [
  {
    "text": "Selected-publication admission requires an explicit value type, Record shape, Observation type and supported shape reduction.",
    "force": "validator-enforced"
  },
  {
    "text": "Guard operands must expose Boolean values. Preserve the real type of coded/numeric data and derive a separate guard.",
    "force": "default"
  }
],
  },
  {
    "id": "publication-selection",
    "applicability": "All CRL authoring",
    "category": "concept-model",
    "rule": "shape reduction is most recent selects one record from the candidates admitted by the concept's producers. It preserves that record's value: a newer false or unknown answer replaces an older true answer. A selected unknown can pause a decision; selection failure is an error, not a negative answer. Each producer owns its candidate and validity rules first, including Patient age's daily calculation and same-day assertion rule. See selection-reference.crl and its CEL companion for a newer false answer.",
    "clauses": [
      { "text": "The final selector requires demonstrable recency. Equally recent competing records error by default, even if their values agree. Author shape reduction is most recent, on equal time prefer local only when that tie policy is intended. It selects a unique local candidate at the latest equal time; it does not override a newer source or resolve two equally recent local candidates.", "force": "default" },
      { "text": "One undated candidate can be selected. With multiple candidates, missing or overlapping validity that prevents identifying a unique latest record is an error. Malformed validity and repeated retrieved identities within one contributor are errors even on losing candidates. Do not invent dates or discard unknown answers to force a result; correct the input or report the unsupported case.", "force": "default" }
    ],
    "ref": "src/emit/tests/publicationSelection.test.ts; src/cre/tests/publication.test.ts; selection-reference.crl"
  },
  {
    "id": "named-answer-options",
    "applicability": "All CRL authoring",
    "category": "concept-model",
    "rule": "Declare offered answers once in a named terminology and reference it with value from is \"<terminology>\". Inline value from: lists and per-option qualifying markers are removed. Each finite answer member needs an authored display. The concept lists only not qualifying is `<code>` exceptions beneath its value from is declaration. Recognized members other than these exceptions qualify. Classify the selected record, not every historical answer: a missing answer remains unknown; a selected answer with no interpretable domain coding or conflicting domain codings is an error, never a clinical negative. A foreign translation alongside a recognized domain coding does not change its classification; code identity uses system and code, not display or version.",
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
    "applicability": "All CRL authoring",
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
    "applicability": "All CRL authoring",
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
    "applicability": "All CRL authoring",
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
    applicability: "All CRL authoring",
    category: "concept-model",
    rule: "Name a concept as a clinical concept. Put the question's wording in a separate presentation declaration with required question text and optional question description. Presentation has no separate short label. Check generated questionnaires and population through emit_results; a green CRE run does not establish the questionnaire behavior.",
    why: "A prompt should name the determination the reviewer can answer. A computed condition and the records feeding it are different surfaces.",
    ref: "docs/CRL-NORTH-STAR.md §4; #317; #318",
    clauses: [
      {
        "text": "Name concepts for the clinical determinations they represent; put question wording in a presentation rather than turning the concept name into a question.",
        "force": "default"
      },
      {
        "text": "The concept-presentation rule defines presentation validation: only concepts declaring code is may have a presentation; its question text must be nonempty, description is optional, and label/short fields are rejected. Missing presentation on a coded concept is legal and warns even if unreached; the question fallback is the concept name with no description.",
        "force": "validator-enforced"
      },
      {
        "text": "Check generated question text and populated answers against the intended determination. CRE success alone does not verify Questionnaire behavior.",
        "force": "invariant",
        "test": "verifyLoop:native-outcome-verification"
      }
    ],
  },
  {
    id: "decision-qualifiers",
    applicability: "All CRL authoring",
    category: "decision-shape",
    rule: "A multi-branch decision must declare a qualifier: `first:` (ordered, first match wins — top-level requires trailing `otherwise`; nested may omit it), `all:` (every matching branch fires), or `any:` (over actions only — offer alternatives). A `then:` body is closed by `end.`. A single-member block takes no qualifier. Every later branch of `first:`, including `otherwise`, receives null-propagating priority exclusions for prior guards. The author writes no condition on `otherwise`; the emitted action is guarded. Compound priors automatically get named CQL defines. `priority-exclusion-inexpressible` means an unresolved reference: correct its name/library qualification, not its guard shape. Earlier unknown prevents a later disposition; `all:` has no ordered exclusions.",
    ref: "docs/decision-shapes.md; validator rules qualifier-required / otherwise-required / any-over-branches / first-over-actions",
    clauses: [
      {
        "text": "Multi-member blocks require a qualifier: first/all over branches, any/all over actions. A top-level first requires trailing otherwise; nested first may omit it. A singleton takes no qualifier. A then block closes with end. Otherwise is unconditioned, last, restricted to first, and cannot be the only branch.",
        "force": "validator-enforced"
      },
      {
        "text": "Verify the authored ordering: first priority exclusions preserve an earlier unknown instead of reaching a later disposition; all has no ordered exclusions. Inspect emitted conditions and executed paths rather than treating successful parsing as proof of precedence. Resolve priority-exclusion-inexpressible by correcting the referenced name/library qualification; do not change guard meaning to hide an unresolved reference.",
        "force": "invariant",
        "test": "verifyLoop:native-outcome-verification"
      }
    ],
  },
  {
    id: "decision-composition",
    applicability: "All CRL authoring",
    category: "decision-shape",
    rule: "Choose structure from the source meaning. Alternative records of ONE clinical fact belong to that concept's supported source representations or producers; separate independently occurring facts used as policy criteria belong to decision logic. Do not invent a composition syntax when the required producer is unsupported: report the gap. DISTINCT criteria sharing a consequence can use a compound branch guard or a named criterion. Criteria routing to different consequences use separate when branches. Under first:, a false guard skips its branch, a true guard selects it, and a decisive unknown pauses; ordered siblings are not interchangeable with Boolean OR when an earlier operand is unknown. Full-conjunction guards permit later qualifying pathways when the earlier conjunction is false. A matched branch's descendants remain within that branch. Separate source-delegated or genuinely shared determinations may use use decision. Do not manufacture inference concepts merely to hide a policy's Boolean logic.",
    why: "Source fidelity depends on the meaning and dependencies of each criterion, not the number of emitted condition entries.",
    ref: "branch-guards; criterion; chaining-necessity; disposition-arbitration-reference",
    clauses: [
  {
    "text": "Keep distinct criteria in decision STRUCTURE, with their source meaning visible in the applicability expression and dependency input[] or in a named criterion's transparent define. A shared label does not turn separate events into one fact. Do not fuse distinct criteria into a defined as composite.",
    "force": "invariant",
    "test": "judgeLens.composition:hollowed-criteria"
  },
  {
    "text": "UNIT ANCHORING — identify ONE underlying event/state without using the composite's label. A lab result and a clinician note may record the same suppression; drug-therapy failure and physical-therapy failure are separate events. Different diseases do not become representations of one event merely by naming their collection \"Substantial Co Morbidity\". This distinction remains essential even where the replacement producer is not implemented.",
    "force": "invariant",
    "test": "judgeLens.composition:hollowed-criteria"
  },
  {
    "text": "OR-of-PATHWAYS: put each alternative pathway's FULL conjunction in its branch guard, or reference a named criterion for that conjunction. A false earlier conjunction can fall through; an unknown one cannot be treated as false to reach an activity.",
    "force": "default"
  },
  {
    "text": "Publication-reachable branch guards preserve the whole Boolean expression in one text/cql-expression applicability condition, including references through criteria, with dependency input[]. Naming a criterion supports reuse and readability; the number of condition entries is not a source-fidelity test.",
    "force": "default"
  }
],
  },
  {
    id: "chaining-necessity",
    applicability: "All CRL authoring",
    category: "decision-shape",
    rule: 'The chaining overlay (§2) — a `use decision` (bare same-library `use decision "Sub"`, or a QUALIFIED cross-library chain, #172) is the right primitive for TWO overlapping reasons: (a) the SOURCE delegates a SEPARATE determination BY NAME ("covered if the member meets the Eligibility Policy," "per the Step-Therapy Protocol"); and/or (b) REUSE of a GENUINELY SHARED determination — one determination that multiple policies or pathways genuinely reference, factored into a shared decision/library and chained. The SUR mandate-determination is exactly (b): one shared determination chained cross-library, which IS reuse. Reuse is a FIRST-CLASS reason to chain, not merely tolerated taste. One policy\'s own internal AND/OR/NOT logic still stays in ONE tree, however complex — the tree already expresses boolean composition, so "I have boolean logic" is not a chaining signal (see decision-composition). THE LINE IS NOT reuse-vs-no-reuse; it is GENUINELY-SHARED vs FABRICATED-SHARED: factor + reuse + chain a determination that is genuinely ONE shared thing; do NOT fabricate a shared sub-decision across INDEPENDENT policies whose criteria merely look alike — those are two sources that may diverge, so duplicate them inline (factoring lookalikes invents a false coupling that changes one when you change the other). Current CRE publication preparation refuses foreign delegated decisions with publication-unsupported-scope; legacy cross-library success does not certify this path. Same-library delegation and imported publication operands are separate supported cases. Report that capability gap when the source requires foreign delegation. (See source-delegated-decision-reference and disposition-arbitration-reference.)',
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
    applicability: "All CRL authoring",
    category: "guards",
    rule: "Per-action only when / unless guards are unsupported for selected publications: validation reports publication-unsupported-context and FHIR emit reports publication-action-guard-unsupported. Use branch conditions when that expresses the source intent. If the source requires a guarded action menu, report the missing publication capability; do not fall back to legacy Scalar answers. CRE legacy unknown coercion is not an intended pause contract.",
    ref: "docs/decision-shapes.md; validator rule guard-on-single-action",
    clauses: [
      {
        "text": "A per-action guard on a single action is always rejected as guard-on-single-action. For an admitted selected publication resolved in the prepared source context, per-action only when/unless guards report publication-unsupported-context. FHIR emission separately reports publication-action-guard-unsupported. This does not certify legacy/unadmitted operands or unresolved package references.",
        "force": "validator-enforced"
      },
      {
        "text": "Use branch conditions only when they preserve source intent. If a guarded action menu is required, report the missing capability instead of substituting a legacy Scalar answer or accepting its unknown coercion.",
        "force": "invariant",
        "test": "judgeLens.composition:hollowed-criteria"
      }
    ],
  },
  {
    id: "branch-guards",
    applicability: "All CRL authoring",
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
    applicability: "All CRL authoring",
    category: "decision-shape",
    rule: "A criterion names a reusable and/or/not branch condition: criterion \"Name\": - when ( <condition> ). Parenthesize its declaration body. It lowers once to a named Boolean CQL define, preserving its expression and unknown values. Reference it unqualified or self-qualified in branch conditions; publication-reachable guards preserve the whole applicability expression with dependency input[]. A criterion is library-local, unassertable and not a concept: CEL cannot define a fact by it. Foreign criterion references, cycles and concept-only uses are errors. Cross-library reuse must reflect a genuine shared determination via use decision, or a genuine shared concept; otherwise report the missing structural capability. CRE currently refuses foreign decision delegation under publication preparation; do not claim that a legacy cross-library run verifies that path.",
    why: "A named criterion preserves source criteria and their dependencies while providing readable reuse. It does not invent an assertable clinical fact or a determination boundary.",
    ref: "docs/decision-shapes.md; validator rules criterion-cycle / criterion-misuse; #224",
    clauses: [
  {
    "text": "Criterion cycles, concept-only uses and foreign references are rejected; CEL cannot define a fact by a criterion.",
    "force": "validator-enforced"
  },
  {
    "text": "Keep distinct criteria in the named Boolean expression and its dependency input[]. Naming does not justify hiding, dropping or inventing a criterion.",
    "force": "default"
  }
],
  },
  {
    id: "guard-or-vs-sibling-or",
    applicability: "All CRL authoring",
    category: "decision-shape",
    rule: "A combined when (A or B) expresses alternatives within one Boolean condition. Ordered sibling when A / when B branches express precedence, including when data is missing. With selected Boolean A unknown and B true, the combined condition is true but first: sibling branches pause at A. Do not split or merge them merely for presentation or DNF size. Use a compound guard when either alternative can establish the rule without resolving the other; use ordered siblings when the earlier determination must be resolved first or branches route differently. Under all:, two satisfied sibling branches can each fire, while one combined OR branch fires its body once. Preserve authored clinical intent and test missing-data cases as well as fully known inputs.",
    ref: "docs/decision-shapes.md §3; #224",
    clauses: [
      {
        "text": "Preserve source alternatives and precedence: a combined OR and ordered sibling branches are not interchangeable, especially with missing inputs. Do not split or merge merely for presentation or expression size.",
        "force": "invariant",
        "test": "judgeLens.composition:hollowed-criteria"
      },
      {
        "text": "Verify relevant unknown and known cases: unknown A with true B satisfies combined OR, but first sibling branches pause at A; under all, satisfied siblings may each fire while one combined OR branch fires once.",
        "force": "invariant",
        "test": "verifyLoop:native-outcome-verification"
      }
    ],
  },
  {
    id: "dispositions",
    applicability: "All CRL authoring",
    category: "dispositions",
    rule: "Model dispositions as plain `activity` declarations. CRL has no approve/deny/pend verbs — do not invent them. The triggering condition explains branch selection. Concept `meta is` text is not automatically propagated as a disposition rationale. An activity's own `because` supplies its ActivityDefinition description; configured reason codes are separate. DISPOSITION TYPE follows the ACT: a CDS recommendation to ORDER a service uses `request CPGServiceRequest` (service-order activity); a disposition that is COMMUNICATED rather than ordered uses `request CPGCommunicationRequest`. The emitter maps the authored request profile to its FHIR resource kind; it does not infer intent from the activity name.",
    why: "CRL is general (cognitive support, CDS, prior-auth, quality measures), not tied to any one disposition vocabulary; keep the core minimal. The disposition's request type follows what the ACT is — an ORDER vs a COMMUNICATION — which the author expresses through request; inventing approve/deny/pend verbs bakes one domain's taxonomy into the language.",
    ref: "src/fhir-emitter/tests/cpgActivityProfiles.test.ts (authored request profile to resource kind); src/fhir-emitter/tests/activity.test.ts (configured communication payload and reason codes)",
    clauses: [
      {
        text: "Model dispositions as plain `activity` declarations; CRL has no approve/deny/pend verbs — do not invent them.",
        force: "default",
      },
      {
        text: "Do not rely on concept metadata becoming emitted rationale. ActivityDefinition description uses the activity's own `because`, otherwise its name.",
        force: "default",
      },
    ],
  },
  {
    id: "pa-answers-not-records",
    applicability: "Authoring authorization or coverage determinations, including before project configuration exists",
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
    applicability: "Authoring authorization or coverage determinations, including before project configuration exists",
    category: "dispositions",
    rule: "A PA / medical-policy coverage DETERMINATION is a CONFIGURED disposition (see `configure-dispositions`): a plain local `activity` named `\"<category>.<key>\"`, where the CATEGORY is a PAS review-action — `certify`, `not-certify`, or `pended` — and the KEY is a reason/flavor the deployment declares in `crl.dispositions` (e.g. two `not-certify` reasons — a medical-necessity vs an experimental/investigational/unproven — as distinct keyed leaves). The determination is constrained STRUCTURALLY (naming no deployment activities): (1) MEMBERSHIP — every recommended determination is a CONFIGURED `<category>.<key>` (or a bare single-option `<category>`); a determination not in the deployment's configured set is invalid. (2) COMMUNICATED, not ordered — a determination is `CPGCommunicationRequest`, never a `CPGServiceRequest` service order. (3) MUTUAL EXCLUSIVITY — each completed case fires EXACTLY ONE determination; a needed-unknown pause fires none, spanning the DELEGATED CLOSURE (parent + any chained `use decision` sub together): no reachable path may emit two in a single run (author ordered precedence with `first:` + `otherwise`; do not place two determinations under one `all:`/`any:`; a branch that both delegates and `recommend`s is the case an in-tree-only check misses). (4) FINALITY BY MODE — `standalone` (our decision IS the whole adjudication) requires FINAL leaves (certify/not-certify); a non-final `pended` (PAS A4) leaf is legitimate only in `embedded` mode (our decision feeds a larger cross-company adjudication). WHICH keyed flavors exist, and their labels/codes, are the deployment's config; whether a policy uses the RIGHT flavor where it draws a distinction is a reviewer/Judge fidelity call this rule INSTRUCTS but does not mechanically enforce. (Membership + communicated-not-ordered + finality-by-mode are ALSO validator-enforced when the project configures a nonempty resolved `crl.dispositions.options` vocabulary — see `configure-dispositions`; they remain always-on per-policy invariants for unconfigured content.)",
    why: "The universal kit is customer-agnostic — it serves every deployment's content project, not one denial taxonomy. The determination vocabulary is per-deployment CONFIG (the closed set), so the kit constrains SHAPE (a communicated, mutually-exclusive, mode-appropriate-finality determination drawn from the configured set) without hard-coding any activity set; a distinct further not-certify flavor is legitimate content, not a defect (#167). The structural invariants catch the modeling defects #134 targeted — a determination modeled as a service order, an unconfigured/ad-hoc determination, a contradictory double-determination across a parent+sub.",
    ref: "#134; #167; §4; crl.dispositions",
    clauses: [
      {
        text: "COMMUNICATED, not ordered: a coverage determination is `CPGCommunicationRequest`, never a `CPGServiceRequest` service order — modeling a determination as a service order is a clinical-safety error (#134). ALSO validator-enforced (`disposition-request-type`) when `crl.dispositions.options` resolves to a configured, nonempty vocabulary; always-on per-policy check otherwise.",
        force: "invariant",
        test: "verifyLoop:communicated-not-ordered",
      },
      {
        text: "MEMBERSHIP: every recommended determination is a CONFIGURED `<category>.<key>` disposition (or a bare single-option `<category>`) from the deployment's `crl.dispositions` set — never an unconfigured/ad-hoc determination. ALSO validator-enforced (`disposition-not-configured`) with a configured, nonempty resolved vocabulary; always-on per-policy check otherwise.",
        force: "invariant",
        test: "verifyLoop:configured-membership",
      },
      {
        text: "MUTUAL EXCLUSIVITY spans the DELEGATED CLOSURE: exactly one determination on completion and none during a needed-unknown pause over parent + any chained sub together; no path may emit two (a branch that both delegates and `recommend`s is the case an in-tree-only check misses). Author ordered precedence with `first:` + `otherwise`.",
        force: "invariant",
        test: "verifyLoop:mutual-exclusivity-spans-closure",
      },
      {
        text: "FINALITY BY MODE: `standalone` requires FINAL determination leaves (certify/not-certify); a non-final `pended` (PAS A4) leaf is legitimate ONLY in `embedded` mode. ALSO validator-enforced (`disposition-non-final-leaf`) with a configured, nonempty resolved vocabulary; always-on per-policy check otherwise.",
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
    applicability: "Authoring authorization or coverage determinations, including before project configuration exists",
    category: "dispositions",
    rule: "Configure a medical-policy deployment's disposition vocabulary in the content project's `package.json` under `crl.dispositions`: a `mode` (`standalone` | `embedded`) and `options` mapping each PAS category (`certify` / `not-certify` / `pended`) to keyed reasons/flavors — `{ label, code? }`. The activity name a policy recommends is `\"<category>.<key>\"` (e.g. `recommend activity \"not-certify.EIU\"`), authored as a plain local `activity` block (`request CPGCommunicationRequest`); the `code` on an option is a PAS review-decision-reason code in full-PAS (Approve/Deny) intent, or the larger system's own code in embedded (Met/Unmet) intent. Once configured `options` resolves to a nonempty vocabulary it is the CLOSED valid set: the validator rejects any recommended activity not in it, any determination not `CPGCommunicationRequest`, and (per `disposition-mode`) a non-final leaf under `standalone`. `options: {}` yields an `empty-vocabulary` warning and leaves these checks inactive; resolve configuration diagnostics before relying on enforcement. Default vocabulary (if unconfigured): `certify.Approve` / `not-certify.Deny`.",
    why: "The determination vocabulary is per-deployment (one payer per content project) — Approve/Deny for a standalone full-PA deployment, Met/Unmet for one that is part of a larger adjudication. Making it CONFIG (not hard-coded in the language or the kit) is what lets a deployment relabel or add a flavor without re-authoring policies, and keeps the universal kit customer-agnostic. This rule is GUIDANCE — the validator does NOT error on a MISSING config (an unconfigured project keeps today's behavior); it is the nudge to configure so the closed-set + request-type + finality checks turn on.",
    ref: "crl.dispositions; #134",
    clauses: [
      {
        "text": "Configure the deployment disposition vocabulary and standalone/embedded mode in package.json crl.dispositions. Missing configuration is not rejected; unconfigured defaults are certify.Approve and not-certify.Deny. Resolve empty-vocabulary warnings before relying on config-gated checks.",
        "force": "default"
      },
      {
        "text": "A configured, nonempty resolved vocabulary gates disposition-not-configured, disposition-request-type and standalone disposition-non-final-leaf diagnostics. Missing configuration or an empty resolved vocabulary does not enable those checks.",
        "force": "validator-enforced"
      },
      {
        "text": "Check every recommended determination against the deployment vocabulary, including when configuration does not enable automatic validation.",
        "force": "invariant",
        "test": "verifyLoop:configured-membership"
      },
      {
        "text": "A coverage determination communicates its conclusion through CPGCommunicationRequest, rather than ordering a service.",
        "force": "invariant",
        "test": "verifyLoop:communicated-not-ordered"
      }
    ],
  },
  {
    id: "disposition-mode",
    applicability: "Authoring authorization or coverage determinations, including before project configuration exists",
    category: "dispositions",
    rule: "`crl.dispositions.mode` is first-class and gates FINALITY only. `standalone` — our decision IS the whole coverage adjudication; every determination leaf must be FINAL (certify / not-certify). `embedded` — our decision is a SUB-determination feeding a larger cross-company adjudication; a non-final `pended` (PAS A4) leaf is legitimate (a refer-up / need-info contribution). In BOTH modes our decision still issues EXACTLY ONE determination on completion; a needed-unknown pause emits none (mutual-exclusivity is not relaxed by mode — do NOT read `embedded` as permission to emit two determinations across a parent + sub).",
    why: "The customer described two operating modes: Smile as the whole PA (Approve/Deny final) vs Smile as part of a larger system (Met/Unmet contributions that the larger tree finalizes). Only finality differs — a contribution may be non-final; it is still one contribution per run. Making mode explicit lets the same policy CRL run either way per deployment, and lets the validator enforce standalone-finality without guessing.",
    ref: "crl.dispositions.mode",
    clauses: [
      {
        "text": "Standalone determinations must be final; embedded determinations may contribute a non-final pended result. Mode governs finality, not whether multiple conclusions are allowed.",
        "force": "invariant",
        "test": "verifyLoop:finality-by-mode"
      },
      {
        "text": "Across the complete executed closure, a completed coverage determination produces exactly one conclusion; a needed-unknown pause produces none. Check delegated and sibling emission paths in both modes.",
        "force": "invariant",
        "test": "verifyLoop:mutual-exclusivity-spans-closure"
      }
    ],
  },
  {
    id: "minimalism",
    applicability: "All CRL authoring",
    category: "minimalism",
    rule: "Declare the MINIMAL set that captures the clinical intent and let the emitter do the heavy lifting. Do not over-specify properties the emitter can derive. Minimalism is over EMITTER-DERIVABLE detail, NOT over FIDELITY: a branch guard that keeps each distinct criterion VISIBLE (an inline atom in the applicability expression and dependency `input[]`, or a named criterion as one identifier `condition[]` resolving to a transparent define with its atoms in `input[]`) is NOT 'over-specified' relative to a `defined as` composite that hides them in one opaque boolean — semantic fidelity (same-fact vs distinct-criteria; see decision-composition) governs over node-count.",
    ref: "docs/CRL-NORTH-STAR.md §4.0",
    clauses: [
      {
        "text": "Omit emitter-derivable detail where doing so preserves the authored meaning; prefer the minimal faithful declaration.",
        "force": "default"
      },
      {
        "text": "Retain each distinct source criterion as an auditable decision operand. A smaller opaque Boolean composite is not a faithful substitute merely because it has fewer nodes.",
        "force": "invariant",
        "test": "judgeLens.composition:hollowed-criteria"
      }
    ],
  },
  {
    id: "library-scoping",
    applicability: "All CRL authoring",
    category: "process",
    rule: 'A document may start with one # header, followed by its required library "Name". declaration and optional library metadata, then includes before statements. Library and include declarations do not accept version clauses. Use logical CRL library and declaration names, not generated CQL filenames. Validate multifile content with validate_crl(path); inline code has no sibling context. The nearest package.json defines the project, and nested packages are separate projects. A qualified local sibling reference such as "Shared"."Choices" resolves without include, as in named-answer-reference.crl and named-answer-terms.crl. Installed packages must expose CRL files through package.json crl.libraries and be discoverable under the project\'s top-level node_modules (including scoped packages); nested dependency installations are not scanned. Each referencing CRL library must explicitly include a package library by its declared CRL name. Being installed, discovered or transitively included by another library does not grant reference visibility.',
    why: 'Discovery, reference visibility and physical CQL routing are distinct. Explicit include resolves an installed package before a same-named local library; without that include, a local qualified reference resolves locally. Avoid ambiguous ownership names. Packages cannot fall back to consumer-local libraries. Include aliases are unsupported: use declared names. Fix missing imports, cycles and emitted-name collision diagnostics in the source/package configuration, not generated CQL. Criteria are library-local; a concept and criterion cannot share a name within one library, and including another library does not make its criteria exportable.',
    ref: "imports/tests/preparePublicationContext.test.ts; imports/tests/registry.test.ts; imports/tests/criterionMultifile.test.ts; docs/decision-shapes.md",
    clauses: [
      {
        "text": "CRL requires a library declaration before statements and places includes before statements. Library/include version clauses and include aliases are unsupported. Project-path validation checks import visibility: a referenced installed package library needs an explicit include in the referencing library; discovery or transitive inclusion alone does not grant visibility. Inline validation has no sibling project context. Criteria are library-local; same-library concept/criterion name collisions are rejected.",
        "force": "validator-enforced"
      },
      {
        "text": "Use logical CRL names, validate multifile content by path, and avoid ambiguous ownership names. Installed packages should expose crl.libraries through discoverable top-level node_modules; nested package roots are separate projects.",
        "force": "default"
      },
      {
        "text": "Verify emitted references resolve to the intended local or package owner. Inspect import/cycle/identity diagnostics; repair source or configuration rather than generated CQL. Package code must not acquire unintended consumer-local dependencies.",
        "force": "invariant",
        "test": "verifyLoop:native-outcome-verification"
      }
    ],
  },
  {
    id: "cel-cases",
    applicability: "All CRL authoring",
    category: "cel",
    rule: "Author a companion `.cel`: `covers \"<CRL library>\"`; a Patient subject `fact` (`- defined by \"Patient\".`); separately named clinical `fact` records linked to their concept via `- defined by \"<library>\".\"<concept>\".`; and one `case` per path with `- subject is …`, the relevant `- fact is …`, and a `- result is \"<decision>\" is \"<branch>\".` oracle. For expected missing evidence before any activity, use `- result is \"<decision>\" is pause.` instead; a pause case must have exactly one result assertion. Quoted \"pause\" is an activity name. A passing pause assertion checks CRE's prediction only: native $apply is the source of truth, and each case requires independent error/activity/Questionnaire/QuestionnaireResponse answer-state checks. All-false empty results and partial `all:` activity production are not whole-decision pauses. CRE attribution currently identifies the decision condition, not an unknown compound operand. The CRE resolves concept-linked facts and checks code membership for supported representations; a matching explicit resource code participates in that representation. A well-formed nonmember can be authored deliberately and may warn; it is not a false answer. Malformed tokens are errors. CURRENT LIMIT: a local concept without a derivable local code set fails loudly. Some non-local forms still use name-based presence; this is not evidence of code membership. A bare concept-linked fact uses its declared local code. For a value-reading boolean question, write `value is true` or `value is false`; omission preserves an UNKNOWN answer, not an implicit no. A pause depends on the reached conditions: an unreached missing answer or a determinate compound such as true OR unknown does not by itself pause the decision. There is no absence code. Legacy closed-world record-existence fixtures are not selected-answer examples. Current ServiceRequest existence projection produces no candidate without a matching witness; it does not turn absence into a false local answer. A bare-type CEL fact without a code cannot match a coded retrieve; CEL validation emits warning `bare-type-fact-uncoded` for those resource types (#312). Patient is exempt because its retrieve is not code-scoped.",
    ref: "pa-determination-reference.cel; src/cre/run.ts",
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
    id: "cel-identity",
    applicability: "All CRL authoring",
    category: "cel",
    rule: "Use distinct fact names for distinct resources in a case. Referencing the same emitting fact twice with different dates or intents does not create new resource identities and can invalidate the case. Different names can also collide after identity normalization. Patient references do not create extra Patients; an ambient Encounter participates in identity checks. Reusing a fact in separate cases is supported. Inspect diagnostics and the returned case/resource manifest; do not assume every referenced fact emitted a resource or that a warning skipped the whole case.",
    ref: "cel/validator/tests/identityDiagnostics.test.ts; emit_cel",
    clauses: [
      {
        "text": "Collisions in actual emitted resource paths, within a case or with a previously emitted case in the same run, report id-collision as an error and prevent the colliding case from emitting. Different fact names can collide after normalization; repeated Patient references are exempt, and the ambient Encounter participates. Reusing a fact across separate cases is legal when their emitted paths remain distinct.",
        "force": "validator-enforced"
      },
      {
        "text": "Check identity diagnostics and the complete case/resource manifest, including normalization collisions, Patient references and ambient Encounter participation. Confirm that the intended resources actually emitted; do not infer resource presence or whole-case rejection from a warning.",
        "force": "invariant",
        "test": "verifyLoop:artifact-integrity"
      }
    ],
  },
  {
    id: "cel-quantity",
    applicability: "All CRL authoring",
    category: "cel",
    rule: "For a concept-linked Quantity answer, use a unit-bearing CEL literal, for example value is 90 'kg'. A bare number or whitespace-only unit is rejected. Unit presence validation does not certify UCUM spelling or dimensional compatibility; the producer and native execution must support the intended units. A numeric literal is not a CodeableConcept answer. Do not infer support for integer or other publication types from legacy numeric-validator tests.",
    ref: "cel/validator/tests/numericValueRules.test.ts; quantity-declaration; quantity-answer",
    clauses: [
      {
        "text": "For a numeric/Quantity literal whose qualified defined by reference resolves to a concept with exactly one declared value type, Quantity requires a unit-bearing literal: bare numbers and whitespace-only units are rejected. A numeric literal targeting CodeableConcept is a value-type mismatch. This numeric check does not cover bare FHIR-type facts or unresolved/multiple-value-type targets; absence of a diagnostic there does not certify the value. Legacy integer/decimal targets have separate unitless rules, not proof of new publication support.",
        "force": "validator-enforced"
      },
      {
        "text": "Verify units are supported by the intended producer and native execution. Unit-presence validation alone does not establish UCUM or dimensional correctness; legacy numeric tests do not establish other publication-type support.",
        "force": "invariant",
        "test": "verifyLoop:native-outcome-verification"
      }
    ],
  },
  {
    id: "emit-output-root",
    applicability: "All CRL authoring",
    category: "process",
    rule: "ONE OUTPUT ROOT for the writing emit tools. MCP `emit_cql` returns CQL inline and never writes. Normally omit MCP `out` / `outRoot`, CLI `--out-dir` (`--out` for crl-emit-results): the nearest package.json defines the project root. `emit_crl` (target fhir-def) writes `<root>/src/cql/` and `<root>/src/fhir/<ResourceType>/<id>.json`; target cql writes `<root>/src/cql/`. `emit_cel` writes `<root>/tests/data/fhir/patient/<compartmentId>/<lowercase-type>/<id>.json`; `emit_results` writes under `<root>/tests/results/fhir/patient/<compartmentId>/`. An explicit output argument replaces ROOT, retaining that entire layout. Never pass a leaf such as src or tests/data/fhir as the root: src would become src/src/cql. Omission WRITES for emit_crl and emit_cel; use an explicit scratch root for inspection. A scratch tree mirrors the project layout. For both-representation content use closure emit_crl, not the single-library emit_cql tool. Consume returned paths and manifests; tools own placement. `emit_cel` replaces its patient data tree and `emit_results` prunes its generated outputs; `emit_crl` does not prune stale files, so a renamed definition can leave an obsolete CQL/FHIR file. Inspect the definition tree before publishing it.",
    ref: "packages/crl/TOOLING.md — the ROOT",
    clauses: [
      {
        "text": "Normally omit output-root arguments to use the nearest project package.json. Use an explicit scratch root for inspection and closure emit_crl for both-representation content; consume returned paths instead of constructing output paths.",
        "force": "default"
      },
      {
        "text": "Verify that the selected root and complete returned paths are intended before publishing. Select a root above the documented generated layout, not a leaf that duplicates src or tests/data/fhir below itself. Account for CEL/results replacement and pruning, and inspect CRL definition trees for stale files after renames.",
        "force": "invariant",
        "test": "verifyLoop:artifact-integrity"
      }
    ],
  },
  {
    id: "written-equals-executed",
    applicability: "All CRL authoring",
    category: "process",
    rule: "CRL owes you written == executed. It optimizes clarity, not fewer keystrokes. The emitter translates CRL into CQL/FHIR; it does not invent a CRL expression the author could and should have written. Report a mismatch when a determination behaves differently from its source, even if the tool reports success. Target-language plumbing that CRL cannot express, such as the FHIR structural floor, belongs to emit. It must not manufacture a determination value. An unanswered pure question pauses because nothing supplies its value; that behavior follows from its declaration and must agree in the CRE. Explicitness is useful where the form exists; do not replace a faithful model merely to obtain a green run.",
    ref: "docs/CRL-NORTH-STAR.md §0 and §4.0",
    clauses: [
      {
        "text": "The computable representation must preserve source criteria and outcomes. Do not introduce or remove a determination merely to obtain a green run; report written/executed mismatches.",
        "force": "invariant",
        "test": "judgeLens.composition:dropped-or-added-criterion"
      },
      {
        "text": "Verify emitted behavior against authored intent, including unanswered questions. Compiler-owned structural plumbing must not manufacture determination values; CRE alone does not prove native agreement.",
        "force": "invariant",
        "test": "verifyLoop:native-outcome-verification"
      }
    ],
  },
  {
    id: "terminology-forms",
    applicability: "All CRL authoring",
    category: "concept-model",
    rule: "A terminology has three forms. Pure `valueset is` is a reference: when its final path segment is a FHIR id (1-64 letters, digits, dot or hyphen), the emitted placeholder uses that declared canonical, and deployment supplies the real membership there. CURRENT LIMIT: a canonical without that id-legal tail, including a URN OID, falls back to a policy slug canonical. This does not satisfy the fixed-canonical deployment model; inspect emitted identity and report the mismatch rather than assuming the swap works. `system is` plus `code is` entries instantiates membership. Mixed `valueset is` plus codes emits ONE policy-owned ValueSet identity and includes the authored external canonical by reference alongside its explicit codes; CQL references that same policy-owned identity. Do not assume a named reference contains a usable dropdown: instantiate the offered codes or deploy the real terminology. `value from is` binds offered answer values, never source retrieves. With value domain is answer options and in qualifying, that offered finite set also supplies the interpreted domain and concept-local exceptions; representation-local `coded from` selects which source records participate. They may name the same terminology when those roles genuinely coincide. A terminology code may carry optional `display is`; each finite answer ValueSet member requires its display. Displays are authored, never inferred. Example instantiated terminology:\n\n```crl\nterminology \"Example Choices\":\n- system is `http://example.org/CodeSystem/choices`.\n- code is `a` display is `Choice A`.\n- code is `b` display is `Choice B`.\n```\n\nA coded question without `value from is` still warns `answer-options-missing`. #313 remains open: this release adds displays but does not fix the titled codeless-reference defect.",
    ref: "docs/CRL-NORTH-STAR.md; #313; #316",
    clauses: [
      {
        "text": "Choose reference, instantiated or mixed terminology to express the intended membership. Use value from is for offered answer values and representation-local coded from for source retrieval; share a terminology only when those roles coincide.",
        "force": "default"
      },
      {
        "text": "Finite answer ValueSet members require authored displays at the answer use site. A missing value from is on a coded question warns rather than failing.",
        "force": "validator-enforced"
      },
      {
        "text": "Inspect emitted ValueSet/CodeSystem identities and actual membership, including mixed/reference forms. Deploy real membership for an opaque reference before relying on it. Report the documented non-id-tail canonical fallback instead of assuming its identity or dropdown is correct.",
        "force": "invariant",
        "test": "verifyLoop:native-outcome-verification"
      }
    ],
  },
  {
    id: "verify-loop",
    applicability: "All CRL authoring",
    category: "process",
    rule: "Verify with the MCP tools in order: validate_crl(path) clean → validate_cel(path) clean → run_decision(path) with every case's `result is` passing. validate_cel and run_decision need FILES under a project root (a package.json) — they do not accept inline code. For a COMPOUND-GUARD branch, cite the run_decision `conditionTrace` (the per-operand truth-table) as the audit surface, and demonstrate that each conjunct is load-bearing; the DROP-ONE battery (see cel-cases) is recommended, and equivalent proof is acceptable. A satisfying case alone is insufficient.",
    ref: "verifyLoop",
    clauses: [
      {
        "text": "Validate CRL and CEL, compare supported CRE predictions with independent native activity/pause expectations, and record unsupported or unexecuted cases as unverified. Establish that each distinct criterion is consequential and relevant unknown behavior is correct; equivalent proof methods are acceptable.",
        "force": "invariant",
        "test": "verifyLoop:native-outcome-verification"
      },
      {
        "text": "Prefer file-based CRL validation to supply project context. For compound guards, the conditionTrace and a drop-one battery are a recommended way to demonstrate that each conjunct matters.",
        "force": "default"
      },
      {
        "text": "The validate_cel and run_decision MCP tools require a file path under a project root and reject inline code. This restriction does not apply to validate_crl, which also accepts inline CRL.",
        "force": "validator-enforced"
      },
      {
        "text": "Check the executed path as well as the disposition; a matching activity name alone can hide a wrong fall-through or delegation route.",
        "force": "invariant",
        "test": "verifyLoop:assert-path"
      }
    ],
  },
  {
    id: "emitted-trees-are-ours",
    applicability: "All CRL authoring",
    category: "process",
    rule: "Emitted trees are producer-owned. `emit_cel` wipes `<root>/tests/data/fhir/patient/` and repopulates it; one suite owns that project tree, with no sibling-suite protection. `emit_results` prunes unclaimed Questionnaire/QuestionnaireResponse files in its results tree by default (`prune: false` retains them). Keep authored files elsewhere. Symlinks and removal failures are reported. Each tool writes a manifest with case → compartmentDir → paths and hashes. Re-hashing listed files proves integrity, not completeness: compare the complete path set too. A renamed case otherwise leaves plausible stale data which a downstream mirror copies and certifies. Use each tool's manifest and returned paths.",
    ref: "verifyLoop",
    clauses: [
      {
        "text": "Keep authored files outside producer-owned data/results trees. Compare the complete expected path/resource set with returned manifests as well as file hashes; inspect pruning, retention, symlink and removal diagnostics. Integrity of listed files alone does not prove completeness or absence of stale output.",
        "force": "invariant",
        "test": "verifyLoop:artifact-integrity"
      }
    ],
  },
  {
    id: "produce-results",
    applicability: "All CRL authoring",
    category: "process",
    rule: "Questionnaires are generated by `$apply`, never emitted from CRL: no Questionnaire appears in the CRL definition emit. After validation and CRE checks, call `emit_results(celPath, crlPath, useCase)` (useCase selects result-driver behavior, not kit content); it owns result placement, so never place `$apply` output yourself. Enable `crl.enableResults` in VS Code User settings and restart the MCP client. An absent setting preserves an existing opt-in; explicit false removes it. A JRE 17+ and the CRL-maintained complete CLI engine " + ENGINE_JAR_SOURCE.buildId + " are required. The tool gives the download command when missing, discovers <home>/" + ENGINE_JAR_SOURCE.cacheRelativePath + ", and verifies the pinned hash; normal use needs no manual hashing, extraction, or classpath. The original Maven jar is not the corrected default. `jarPath` and `jarSha256` are overrides. Read every case state: generated / no-questionnaire / populate-degraded / failed / timeout / not-run. An absent file alone is not evidence that the policy asked nothing. generated means a Questionnaire was returned, not that the intended activity or pause was verified; compare those outcomes against each case oracle. Written MV pairs have stable per-case identities and omit QuestionnaireResponse.authored to avoid run-time churn. They are MV review artifacts; do not resubmit these normalized files unchanged as interactive responses. The results tree is producer-owned; use returned paths/manifests and keep hand-authored Q/QR elsewhere.",
    ref: "verifyLoop",
    clauses: [
      {
        "text": "Use emit_results after validation and CRE checks, enabling it through crl.enableResults in VS Code User settings and restarting the MCP client, and using the maintained verified engine. Consume returned paths and manifests; use explicit jar overrides only for a deliberate alternate engine.",
        "force": "default"
      },
      {
        "text": "Inspect every results case state and compare actual activity/path and answer states with independent expectations. Generated means a Questionnaire was returned, not that the expected conclusion or pause was proved. Failed extraction, degradation, timeout or missing output is not evidence of a clinical pause. Keep result files under producer control: use returned paths/manifests rather than manually placing $apply output or hand-authored Q/QR in its generated tree. MV-normalized Q/QR files omit interactive metadata and must not be resubmitted unchanged as session responses.",
        "force": "invariant",
        "test": "verifyLoop:native-outcome-verification"
      }
    ],
  },
  {
    id: "review-flags",
    applicability: "All CRL authoring",
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
      "tags above belong to extraction (CRL versus narrative fidelity). The validation-phase vocabulary has four " +
      "MV types: validation-concern (CRL versus customer intent), narrative-defect (the narrative itself is wrong), " +
      "tooling-bug and other. The category identifies the workflow phase, not an API permission or a claim that " +
      "only a human can file a flag. During narrative extraction, use the extraction vocabulary; do not infer " +
      "customer intent from the narrative alone. Preserve existing MV flags and their review history during " +
      "re-extraction, regardless of type. A tool accepting a validation tag does not establish that the caller " +
      "has evidence or authorization to make that judgment.",
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
          "A `@validation-concern` records evidence of a " +
          "CRL-vs-customer-intent concern, distinct from extraction fidelity. Category is not author permission: use session authorization and evidence. Preserve existing `@validation-concern` " +
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

const STAGE_RECOMMENDED_CONCEPT_TYPES = ["Observation"];

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
  recommended: {
    conceptTypes: STAGE_RECOMMENDED_CONCEPT_TYPES,
    activityTypes: STAGE_RECOMMENDED_ACTIVITY_TYPES,
  },
  note:
    "conceptTypes / conceptValueTypes / activityTypes are the full grammar-legal " +
    "vocabularies, not a promise that every type works in every declaration. The " +
    "selected-publication contract taught here uses Observation with boolean, " +
    "CodeableConcept or Quantity values. Patient and ServiceRequest can be source " +
    "representation types under their supported projection contracts; they are " +
    "not substitutes for the concept's Observation type. Other grammar types " +
    "need their own supported emission and execution contract. `recommended` " +
    "lists this kit's current concept and activity guidance.",
};

const EXAMPLES: KitExample[] = [
  { id: "source-field-order", title: "source-field-order", language: "crl", valid: true, snippet: SOURCE_ORDER_EXAMPLE, note: "Exact declaration shared with concept-body-order-independence.test.ts: all concept fields precede the trailing source block. The owning test checks AST ownership and publication preparation, not native execution." },
  { id: "quantity-declaration", title: "quantity-declaration", language: "crl", valid: true, snippet: QUANTITY_EXAMPLE_DECLARATION, note: "Exact current Quantity declaration from the owning CEL numeric-literal test. Supply package.json crl.canonicalBase for emission. This example defines a measurement, not a Boolean decision guard." },
  { id: "quantity-answer", title: "quantity-answer", language: "cel", valid: true, snippet: QUANTITY_EXAMPLE_FACT, note: "Fact excerpt shared verbatim with numericValueRules.test.ts. Use within a CEL library covering L with a Patient subject and case referencing F. The owning test checks numeric-literal diagnostics; this excerpt does not establish BMI, unit conversion or native execution." },

  {
    id: "terminology-displays", title: "Instantiated terminology with authored displays",
    language: "crl",
    snippet:
      'terminology "Example Choices":\n- system is `http://example.org/CodeSystem/choices`.\n- code is `a` display is `Choice A`.\n- code is `b` display is `Choice B`.',
    valid: true,
    note: "The terminology contains the offered codes. A pure valueset reference instead needs deployment-provided membership; see terminology-forms.",
  },
  {
    id: "local-answer", title: "Local case-feature concept (asserted, in scope)",
    language: "crl",
    snippet:
      "concept \"Documented Nonunion\":\n- shape is Record.\n- shape reduction is most recent.\n- type is Observation.\n- value type is boolean.\n- code is `documented-nonunion`.",
    valid: true,
    note: "A locally attested question: the boolean answer lives in Observation.value; omission is unknown, and an explicit false answer is not absence.",
  },
  {
    id: "decision-alternatives", title: "A policy's ALTERNATIVES are joined in the DECISION layer, not by `defined as`",
    language: "crl",
    snippet:
      "concept \"Failed Drug Therapy\":\n- shape is Record.\n- shape reduction is most recent.\n- type is Observation.\n- value type is boolean.\n- code is `failed-drug`.\nconcept \"Failed Physical Therapy\":\n- shape is Record.\n- shape reduction is most recent.\n- type is Observation.\n- value type is boolean.\n- code is `failed-pt`.\ncriterion \"Failed Conservative Therapy\":\n- when ( \"Failed Drug Therapy\" or \"Failed Physical Therapy\" ).",
    valid: true,
    note: "Drug-therapy failure and physical-therapy failure are DISTINCT events. The named criterion combines their selected Boolean values in decision logic. Publication guards preserve the expression and expose its dependency inputs; no inference concept is invented to name these alternatives.",
  },
  {
    id: "vacuity-trap", title: 'THE VACUITY TRAP — the label supplying "the one fact"',
    language: "crl",
    snippet:
      'concept "Life Threatening Cardiovascular Disease":\n- type is Condition.\n- value type is boolean.\n- code is `cv-disease`.\nconcept "Sleep Apnea":\n- type is Condition.\n- value type is boolean.\n- code is `sleep-apnea`.\nconcept "Uncontrolled Diabetes Mellitus":\n- type is Condition.\n- value type is boolean.\n- code is `uncontrolled-dm`.\nconcept "Severe Musculoskeletal Problem":\n- type is Condition.\n- value type is boolean.\n- code is `msk-problem`.\nconcept "Substantial Co Morbidity":\n- value type is boolean.\n- defined as ( "Life Threatening Cardiovascular Disease" sem-or "Sleep Apnea" sem-or "Uncontrolled Diabetes Mellitus" sem-or "Severe Musculoskeletal Problem" ).',
    valid: false,
    note: "Legacy counterexample, not current authoring: naming cardiovascular disease, sleep apnea, diabetes and a musculoskeletal problem as one co-morbidity does not make them one event. They are independently occurring criteria. Repair both the operands and the composition according to the narrative. For submitter/reviewer-attested Boolean answers, use shape is Record, type is Observation, value type is boolean, code is and shape reduction is most recent. Condition has no Boolean answer value slot. For chart-derived Condition evidence, report the outstanding Condition source projection/merge capability gap; do not substitute local attestation. Combine selected Boolean answers in a library-local criterion, as in policy-alternatives. That repair does not provide an imported or CEL-assertable composite concept; report the outstanding concept-composition capability if either is needed. Parser or validator acceptance of old syntax does not establish correct source modeling or current authoring.",
  },
  {
    id: "menu-less-guard", title: "DON'T: a guard on a single menu-less action",
    language: "crl",
    snippet: 'decision "D":\n- when "A" then:\n  - recommend activity "X" unless "C".\n  end.',
    valid: false,
    expectRule: "guard-on-single-action",
    note: "Gate the whole branch with when. Per-action guards over selected publications are unsupported; do not repair this by switching to a legacy Scalar concept.",
  },
  {
    id: "any-when", title: "DON'T: `any:` over when-branches",
    language: "crl",
    snippet:
      'decision "D":\nany:\n- when "A" then recommend activity "X".\n- when "B" then recommend activity "Y".',
    valid: false,
    expectRule: "any-over-branches",
    note: "any: selects among actions, not when branches. Use ordered first: branches for precedence, or a Boolean OR guard when the source means disjunction. They differ on unknown input: an earlier unknown ordered guard pauses even if a later branch could qualify.",
  },
  {
    id: "compound-guard", title: "Compound branch guard — distinct criteria as `when ( A and B )` (#224)",
    language: "crl",
    snippet:
      'decision "Coverage":\nfirst:\n- when ( "Has Qualifying Diagnosis" and "Failed Conservative Therapy" ) then recommend activity "certify.Approve".\n- otherwise then recommend activity "not-certify.Deny".',
    valid: true,
    note: "Distinct criteria conjoined in decision logic. For selected publications, the emitter keeps the whole applicability expression and its dependency input[]. This is an excerpt: supply the referenced concepts/criteria and activity in the containing library. Mixed and/or must be parenthesized.",
  },
  {
    id: "criterion-reuse", title: "`criterion` — a named, reusable branch guard (#224)",
    language: "crl",
    snippet:
      'criterion "Meets Coverage Preconditions":\n- when ( "Has Qualifying Diagnosis" and "Failed Conservative Therapy" ).\ndecision "Coverage":\nfirst:\n- when ( "Meets Coverage Preconditions" and "Imaging Not Recent" ) then recommend activity "certify.Approve".\n- otherwise then recommend activity "not-certify.Deny".',
    valid: true,
    note: "A reusable library-local Boolean guard over distinct criteria. Its dependency inputs remain visible when used in a publication-reachable branch. This excerpt requires the referenced concepts and activity in the containing library.",
  },
  {
    id: "open-fork-flag", title:
      "Review flag: an @open-fork on the concept it concerns (via create_flag — LEAN, detail in the linked issue)",
    language: "text",
    snippet:
      'create_flag(\n  path: "<policy>/src/crl/coverage-policy.crl",\n  kind: "concept", name: "BMI Threshold",\n  tag: "open-fork",\n  gist: "eligibility threshold encoded as BMI-40-only, but the source also allows 35-plus-comorbidity",\n  fields: { chosen: "bmi-40-only", alternatives: "bmi-35-plus-comorbidity", ref: "#207" }\n)\n→ writes <policy>/src/medical-validation/flags/<id>.json  (status defaults to open)',
    valid: true,
    note: "The flag is a STORE record, not a `.crl` line: a one-line gist + `chosen`/`alternatives` (semantic, optional) + an optional `ref` to the tracker issue with the full reasoning. `create_flag` writes `medical-validation/flags/<id>.json`; it does NOT touch the `.crl`. An open flag blocks Medical Validation completion.",
  },
  {
    id: "fidelity-defect-flag", title: "Review flag: an @fidelity-defect on a DECISION (required `direction` field)",
    language: "text",
    snippet:
      'create_flag(\n  path: "<policy>/src/crl/coverage-decision.crl",\n  kind: "decision", name: "Coverage Decision",\n  tag: "fidelity-defect",\n  gist: "the encoding reads an axillary-only finding the source does not require",\n  fields: { direction: "over-reach", ref: "#207" }\n)',
    valid: true,
    note: 'Anchor at the narrowest faithful scope — here `kind: "decision"`. `@fidelity-defect` REQUIRES a `direction` = over-reach|criterion-drop; omitting it → `create_flag` returns `reason: missing-field` and writes nothing.',
  },
  {
    id: "gap-filed", title:
      "@gap-filed is NOT a flag — it stays a `.crl` meta tag (required `; ref`), ships fine, does not gate",
    language: "crl",
    snippet:
      "concept \"Renal Function\":\n- shape is Record.\n- shape reduction is most recent.\n- type is Observation.\n- value type is boolean.\n- meta is `@gap-filed: eGFR unit normalization not yet expressible; ref #180`.\n- code is `renal-function`.",
    valid: true,
    note: "A durable pointer to already-tracked work — a REAL `.crl` meta tag (unlike flags, which left `.crl`), REQUIRED `; ref`, does not block mvComplete. Contrast with a review flag (a `medical-validation/flags/` store record authored via create_flag, blocks while open).",
  },
  {
    id: "library-flag", title:
      "Review flag at LIBRARY scope: an @internal-inconsistency spanning the whole policy (via create_flag)",
    language: "text",
    snippet:
      'create_flag(\n  path: "<policy>/src/crl/policy.crl",\n  kind: "library", name: "Coverage Policy",\n  tag: "internal-inconsistency",\n  gist: "the eligibility section requires prior imaging, but the exclusions section forbids it",\n  fields: { ref: "#207" }\n)',
    valid: true,
    note: 'Use `kind: "library"` (name = the library name) for a contradiction that isn\'t about one concept or decision. `@internal-inconsistency` = the SOURCE contradicts itself. The flag anchors to the library; nothing is written into the `.crl`.',
  },
];

/** The common verify-loop note; conditional determination guidance follows. */
const VERIFY_LOOP_NOTE_BASE =
  "Questionnaires are generated by `$apply`, never emitted from CRL. Use emit_results and its returned paths; do not place engine output yourself. For definition/data emission use emit-output-root: omitted output arguments write under the project root, and explicit arguments replace that root. " +
  "AFTER this loop is clean, `emit_results` produces the Questionnaire/QuestionnaireResponse a medical reviewer " +
  "reads (see the `produce-results` rule): it is DISABLED by default, needs an engine jar you supply, and it " +
  "DELETES any Q/QR under `tests/results/fhir/` that the run did not write — do not hand-author artifacts there. " +
  "validate_cel and run_decision require FILES under a project root (a package.json); they do not accept inline code. In a content project's artifact-package layout, author <artifact>.crl and <artifact>.cel under the artifact's package and pass absolute paths. " +
  "PROJECT CONFIG — the project's `package.json` MUST declare `crl.canonicalBase` (e.g. `\"crl\": { \"canonicalBase\": \"http://example.org/crl/<project>\" }`): the analytical local CodeSystem url is `<canonicalBase>/CodeSystem/<domain>-local`; owned answer vocabularies have separate logical-owner CodeSystem identities, so emit fails with `missing-canonical-url-base` without it (no urn fallback). Projects that emit FHIR already require it; `emit_cql` for local-`code is` content likewise needs a `path` (not inline `code`) so it can read the base from the nearest package.json. " +
  "PROVENANCE / PROMOTION (beyond the run_decision proof): canonicalize the source, inspect excluded/dropped-text warnings against the original, and resolve meaningful omissions before attributing its anchor. Successful canonicalization and matching hashes do not prove the anchor includes every source criterion. Generate the scaffold with `generate_provenance` " +
  'clusterBy:"disposition-path" — it clusters per grounded RUN PATH (decision-node refs only). Correspondence requires frozen, uniquely identified cases, successful rendering and resolvable produced paths. Check generation diagnostics and FINAL validate_provenance results; generation success alone is insufficient. Cases with no produced activity, including pauses, currently remain unchecked by this correspondence gate. Keep useful pause tests and record that provenance limitation; never invent a disposition to clear it. ' +
  'The default clusterBy:"decision" is the per-decision concept-attribution VIEW (it cites ' +
  "concept refs that fan out / over-light the gate) — inspect with it, do NOT promote with it. " +
  "DERIVEDFROM PORTABILITY (#250): the anchorSource.derivedFrom back-pointer must be CARRIER-RELATIVE + POSIX — " +
  "relative to the directory of the file that carries it, `/` only, a leading `../` is legal. canonicalize_source and the " +
  "CLI crl-generate-provenance write the carrier file and are conformant; a DESTINATION-LESS generate_provenance (the MCP " +
  "path that returns the artifact inline, its derivedFrom relative to the producer-assumed carrier dir) must be NORMALIZED " +
  "if you save it to a different " +
  "directory. The gate otherwise bites LEGACY + hand-edited records. validate_provenance emits `derived-from-*` findings " +
  "as errors under the enforced contract; when one fires, do NOT " +
  "hand-edit the path — run normalize_provenance (CLI crl-normalize-provenance) to rewrite it carrier-relative + stamp " +
  "the 1.1 marker, oracle-verified. It writes each VERIFIED record and leaves each WORKLISTED record byte-untouched " +
  "(per-record — a run can rewrite the artifact yet worklist its sidecar). Exit 0 = every record normalized; exit 2 = " +
  "residue remains (a dead upstream path → re-run with --search-root <dir>; a hash mismatch / cross-drive source / " +
  "marker-tell disagreement → adjudicate). ALWAYS re-run validate_provenance after — normalize checks each record's own " +
  "source trail, but the artifact↔sidecar oracle cross-check runs only in validate. normalize processes one artifact (+ " +
  "its discovered sidecar), or one standalone sidecar, per invocation; corpus enumeration is external. " +
  "PROOF STATUS IS ORTHOGONAL TO FAITHFULNESS (§4): faithfulness decides the model, provability decides whether run_decision can prove it yet. Encode the FAITHFUL model, test its actual supported paths, and record a proof gap only where execution is unsupported — never substitute a less-faithful provable model, and never assert a composite to fake green (K4). Read artifact proof from `verification` and `verificationLegend`; scope in/out describes this introductory kit's coverage, not a language legality check or an execution verdict. Validate and execute forms outside the worked examples rather than assuming all predicates are deferred. " +
  "DURABLE proof-methodology (independent of which constructs are evaluated): ASSERT THE PATH, not just the disposition. an activity `result is` checks disposition MEMBERSHIP only — two paths ending in the same disposition (a sub-decision's `otherwise` Deny and a parent's `otherwise` Deny) are indistinguishable, so a case short-circuiting to the WRONG `otherwise` still 'passes'. Fall-through / chained proof cases must assert the path via the run trace (`viaWhen` / nodeId) or use DISTINCT disposition activities per path.";

/** The conditional authorization/coverage paragraph in the verify-loop note (the coverage cardinality invariant). */
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

/** Methodology requirements retain explicit applicability; all invariant anchors resolve in this one kit. */
const METHODOLOGY_REQUIREMENTS: VerifyLoop["methodologyRequirements"] = [
  {
    "id": "native-outcome-verification",
    "applicability": "All CRL authoring",
    "text": "Manual verification obligation: validate and emit the intended artifact closure, then compare native $apply activity identities, paths and relevant question/answer states with independently specified case expectations. Verify source/terminology ownership, membership, units and input prerequisites relevant to the case. Check known and missing-input cases and evidence that distinct criteria remain consequential; drop-one is one acceptable method, not a mandatory battery. A pause requires an identified unanswered question and no activity, with setup/extraction/evaluation errors excluded. When execution or a required capability is unavailable, record the affected cases as unverified with the blocking gap and owner/issue; this permits continued authoring but does not discharge runtime acceptance. CRE and successful emission are separate evidence tiers; neither proves native behavior or clinical fidelity."
  },
  {
    "id": "artifact-integrity",
    "applicability": "All CRL authoring",
    "text": "Manual artifact check: keep authored files outside producer-owned trees; inspect tool diagnostics, returned paths and manifests. Compare the complete intended case/resource/path set as well as listed file hashes. Check for identity collisions, omitted resources, stale definitions and pruning/removal failures. Confirm that alternate output roots retain the documented layout. Hash equality alone proves neither completeness nor runtime or clinical correctness."
  },

  {
    id: "assert-path",
    applicability: "All CRL authoring",
    text: "§4-req1 — ASSERT THE PATH, not just the disposition: an activity `result is` checks disposition membership only, so two paths ending in the same disposition (a sub's `otherwise` Deny vs a parent's `otherwise` Deny) are indistinguishable; a fall-through / chained proof case must assert the path via the run trace (`viaWhen`/nodeId) or use DISTINCT disposition activities per path.",
  },
  {
    id: "patient-age-projection",
    applicability: "All CRL authoring",
    text: "Patient age Record publication: validate the supported comparator/unit, explicit shape reduction and answer representation. Verify birthday recalculation, same-day overrides, missing-input repair and method-preserving extraction through native $apply. CRE is a separate prediction. See patient-age-projection for the pattern-owned contract.",
  },
  {
    id: "mutual-exclusivity-spans-closure",
    applicability: "Authoring authorization or coverage determinations, including before project configuration exists",
    text: "§4-req2 — the coverage 'exactly one determination on completion, none during a needed-unknown pause' invariant is checked over ALL emission paths (the DELEGATED CLOSURE — parent + any chained `use decision` sub together — AND `all:`/`any:` sibling FAN-OUT): run_decision over the policy's cases must show no run producing >1 determination, INCLUDING a branch that both delegates and `recommend`s, or two determinations placed under one `all:`. (PA is a consumer of this coverage invariant.)",
  },
  {
    id: "communicated-not-ordered",
    applicability: "Authoring authorization or coverage determinations, including before project configuration exists",
    text: "Every determination a PA/medical-policy decision recommends is `CPGCommunicationRequest` (communicated), never `CPGServiceRequest` (ordered) — inspect the recommended activities' request types per policy (#134). AUTO when the project configures a nonempty resolved `crl.dispositions.options` vocabulary (validator `disposition-request-type`); a manual per-policy check otherwise.",
  },
  {
    id: "configured-membership",
    applicability: "Authoring authorization or coverage determinations, including before project configuration exists",
    text: "Every recommended determination is a CONFIGURED `<category>.<key>` disposition (or a bare single-option `<category>`) from the deployment's `crl.dispositions` set — never an unconfigured/ad-hoc determination (#167). AUTO with a configured, nonempty resolved vocabulary (validator `disposition-not-configured`); a manual per-policy check otherwise.",
  },
  {
    id: "finality-by-mode",
    applicability: "Authoring authorization or coverage determinations, including before project configuration exists",
    text: "FINALITY BY MODE: under `standalone` mode every determination leaf must be FINAL (certify/not-certify) — a non-final `pended` (PAS A4) leaf is legitimate ONLY under `embedded` mode. run_decision has no notion of mode/finality, so this is a MANUAL per-policy check UNLESS the project configures a nonempty resolved `crl.dispositions` vocabulary (then the validator enforces it: `disposition-non-final-leaf`).",
  },
];

/**
 * The PA determination MODEL for authorization/coverage determinations (feature: configurable PA leaves) — customer-agnostic:
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
      "configured `options` must resolve to a nonempty vocabulary for CLOSED-set enforcement; `options: {}` warns empty-vocabulary and does not enforce. Resolve config diagnostics before relying on these checks. Unconfigured projects do not enable enforcement",
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
        "Whether separate source criteria remain visible as decision operands with traceable dependencies, rather than being renamed as one clinical fact.",
      guidance:
        "APPLY UNIT ANCHORING FIRST: identify the underlying event or state without using the composite's label. Alternative records of one fact differ from independently occurring criteria. Put distinct criteria in decision expressions or named criteria and preserve their dependencies. Do not use legacy sem composition to evade an unsupported publication producer. A green legacy test is not evidence that the construct belongs in new teaching. Compare source meaning and missing-data behavior, not the number of emitted condition entries; moving logic can change unknown propagation.",
      checkpoints: [
  "Can you identify one underlying event without using the composite's label, or are these distinct independently occurring events?",
  "Are the distinct criteria retained in the applicability expression or a named criterion's transparent define + use-site input[]?",
  "Does first: precedence belong to the source, including behavior when an earlier criterion is unknown?",
  "Does a proposed normalization require a publication capability that has not been implemented?"
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
        "implementation-artifact / modeling-rationale = routine priority. These labels are prioritization hints, not earned acceptance; every waiver still needs its source-fidelity checks.",
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

const BOUNDARY_ENTRIES: { text: string; applicability: string }[] = [
  {
    text: "New kit authoring uses explicit selected publications. Scalar remains compiler-legal in general legacy paths and is the implicit result of omitting shape; full compiler retirement is unfinished under #320. It is not a recommended kit form. Legacy sem composition, aliases, action guards and general source-collection operations lack complete publication replacements. Report a required missing capability rather than copying old syntax.",
    applicability: "All CRL authoring",
  },
  {
    text: "publication-reference.crl demonstrates finite-code Quantity sources, BMI with explicit validity, a numeric threshold and an uncoded Patient-age projection. It is validated and FHIR-emitted, not a whole-artifact native $apply proof. ServiceRequest projections remain supported but lack a complete served worked example. General count/temporal/collection refinements and arbitrary pipelines require separate implementation evidence.",
    applicability: "All CRL authoring",
  },
  {
    text: "PA Pended (HCR01 A4) is a configured non-final leaf allowed only in embedded mode; standalone requires final leaves. A needed-unknown pause is before any leaf, produces no determination, and never requires adding a pended activity.",
    applicability: "Authoring authorization or coverage determinations, including before project configuration exists",
  },
  {
    text: "the numeric legacy emit MATERIALIZATION cap (an INLINE compound guard's expanded-DNF ARM bound) — owned by the EMITTER as a resource bound and REPORTED by it (`compound-guard-expansion-overflow`); the kit reasons about PROXIMITY qualitatively (see branch-guards over-envelope doctrine) and defers the cap's VALUE to the emitter, never copying it into the kit (drift). (A `criterion` no longer has an expansion cap — post-#236 it is one referenced define, not materialized into the DNF; the old `criterion-expansion-overflow` + criterion-atom bound are retired.)",
    applicability: "All CRL authoring",
  },
  {
    text: "Engine and FHIR round-trip proof beyond the specific checks named by verificationLegend.",
    applicability: "All CRL authoring",
  },
];

/** Worked sources retain their applicability and independent proof limits. */
/**
 * The in-payload legend for `ReferenceArtifact.verification` (a TS docstring never reaches the remote-MCP
 * consumer). The independent tiers are different KINDS of proof, NOT an ordered rank. It states the PROOF axis
 * (is it runtime-proven, and by what?) — ORTHOGONAL to the AUTHORING-SCOPE axis (`boundary` / `conceptLayerModel`
 * `scope`): a `validate-only` artifact can demonstrate a construct that is OUT of scope to AUTHOR in these introductory examples.
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
];

const REFERENCE_ARTIFACTS: ReferenceArtifact[] = ([
  { name: "selection-reference.crl", language: "crl", applicability: "All CRL authoring", verification: ["cre-run", "fhir-emit"], purpose: "Actual input of the CRE newer-false selection test. A selected Boolean answer preserves false and follows the otherwise branch. Missing presentation is a legal warning with concept-name fallback. Use with selection-reference.cel in a project with crl.canonicalBase = http://example.org/publication. This is CRE and emission evidence, not native $apply execution.", source: SELECTION_REFERENCE_CRL },
  { name: "selection-reference.cel", language: "cel", applicability: "All CRL authoring", verification: ["cre-run"], purpose: "The existing test's two dated answers: the newer false answer produces Deny. Both input orders are checked in the owning CRE test.", source: SELECTION_REFERENCE_CEL },
  { name: "named-answer-reference.crl", language: "crl", applicability: "All CRL authoring", verification: ["cre-run", "fhir-emit"], purpose: "Selected coded answers, explicit negative exceptions and question presentation. Use with named-answer-terms.crl and named-answer-reference.cel; package.json crl.canonicalBase = " + ANSWER_EXAMPLE_BASE + ". The owning test also checks CQL emission and emitted presentation extensions; it does not execute native $apply.", source: answerExampleSource() },
  { name: "named-answer-terms.crl", language: "crl", applicability: "All CRL authoring", verification: ["fhir-emit"], purpose: "Imported answer vocabulary for named-answer-reference.crl. Validated and emitted as a terminology module (ValueSet, no Case Feature profile), and used by the tested CRL/CEL closure. Use the same canonicalBase as the named-answer reference; this module defines no standalone decision.", source: `library "Shared".\n${ANSWER_EXAMPLE_TERMS}` },
  { name: "named-answer-reference.cel", language: "cel", applicability: "All CRL authoring", verification: ["cre-run"], purpose: "Actual positive and explicit-negative CEL cases consumed by the named-answer closure test; bare answer codes resolve to their unique offered systems.", source: ANSWER_EXAMPLE_CEL },
  {
    name: "pa-determination-reference.crl",
    language: "crl",
    applicability: "Authoring authorization or coverage determinations, including before project configuration exists",
    purpose:
      "Coverage communication using configured certify.Approve and not-certify.Deny activities. A local selected Boolean answer supplies the criterion; unanswered input pauses before a disposition.",
    verification: ["cre-run", "fhir-emit"],
    source: PA_DETERMINATION_REFERENCE_CRL,
  },
  {
    name: "pa-determination-reference.cel",
    language: "cel",
    applicability: "Authoring authorization or coverage determinations, including before project configuration exists",
    purpose:
      "Explicit true approves, explicit false denies and missing input predicts pause in the CRE.",
    verification: ["cre-run"],
    source: PA_DETERMINATION_REFERENCE_CEL,
  },
  {
    name: "source-delegated-decision-reference.crl",
    language: "crl",
    applicability: "Authoring authorization or coverage determinations, including before project configuration exists",
    purpose:
      "Exemplar B — SOURCE-REQUIRED delegation (§2/§5-B): the source NAMES a separate determination, so the policy chains to it with a BARE same-library `use decision`. Source delegation is this example's reason; genuine shared-determination reuse is also legitimate. The bare same-library delegation IS evaluated (recursed; the sub determination bubbles up), so the oracle names the DELEGATED disposition, not the sub-decision name. One parent + one delegated sub.",
    verification: ["cre-run", "fhir-emit"],
    source: SOURCE_DELEGATED_DECISION_REFERENCE_CRL,
  },
  {
    name: "source-delegated-decision-reference.cel",
    language: "cel",
    applicability: "Authoring authorization or coverage determinations, including before project configuration exists",
    purpose:
      "Two delegated and two parent outcome cases plus missing delegated input. Path assertions distinguish the delegated Deny from the parent Deny; unknown delegated input predicts pause.",
    verification: ["cre-run"],
    source: SOURCE_DELEGATED_DECISION_REFERENCE_CEL,
  },
  {
    name: "disposition-arbitration-reference.crl",
    language: "crl",
    applicability: "Authoring authorization or coverage determinations, including before project configuration exists",
    purpose:
      "One determination with overlapping full-conjunction pathways and first: outcome precedence. Selected Boolean publications preserve whole applicability expressions and dependency inputs. Explicit false permits fall-through; decisive unknown pauses. Distinct Deny and EIU activities make the outcome observable.",
    verification: ["cre-run", "fhir-emit"],
    source: DISPOSITION_ARBITRATION_REFERENCE_CRL,
  },
  {
    name: "disposition-arbitration-reference.cel",
    language: "cel",
    applicability: "Authoring authorization or coverage determinations, including before project configuration exists",
    purpose:
      "Cases for both qualifying pathways, explicit-negative overlap cases, within-indication Deny, off-indication EIU and missing-answer pause.",
    verification: ["cre-run"],
    source: DISPOSITION_ARBITRATION_REFERENCE_CEL,
  },
  {
    name: "patient-age-both-rep-reference.crl",
    language: "crl",
    applicability: "All CRL authoring",
    purpose:
      "Synthetic age Record publication with Patient calculation and local answers. The age pattern recalculates daily and admits same-day asserted overrides; missing input remains unknown. Execute the emitted artifact and its full Q/QR interaction. See patient-age-projection for method metadata and temporal rules.",
    verification: ["fhir-emit"],
    source: PATIENT_AGE_BOTH_REP_REFERENCE_CRL,
  },
  {
    name: "publication-reference.crl",
    language: "crl",
    applicability: "All CRL authoring",
    purpose:
      "Selected Quantity publications for Height, Weight and BMI, a Boolean threshold, and uncoded Patient age. Synthetic finite source codes; explicit BMI validity. This exact source validates and emits; no CEL companion or whole-artifact native execution is claimed.",
    verification: [
  "fhir-emit"
],
    source: PUBLICATION_REFERENCE_CRL,
  },
] as Omit<ReferenceArtifact, "requires">[]).map(a => ({ ...a, requires: artifactRequirements(a.name) }));

/** Complete canonical content. Audit metadata never participates in its content hash. */
export function getAuthoringKit(): AuthoringKit {
  const content = {
    introduction: {
      goal: "Help the KE create a comprehensive and correct computable representation of source material at L1 (narrative), L2 (semi-structured recommendations), or both, using CRL and emitted CQL/FHIR. L2 organizes clinical scenarios, decisions and actions; it is not a required pre-existing intermediate step. Preserve criteria, alternatives, exceptions and outcomes, and validate source coverage separately from execution. Knowledge levels: Boxwala et al. (2011), https://pmc.ncbi.nlm.nih.gov/articles/PMC3241169/. Kit format is a means to this goal, not a language requirement.",
      reading: "Read applicability before applying guidance. The index is complete and unfiltered. Search results are discovery summaries, not complete instructions; retrieve their entry IDs and read the force clauses before acting. Entry includes prerequisites. Rule ref fields are human-readable source notes (documents, issues, validator names), not retrieval IDs; use index IDs and requires for tool navigation. Read counterexamples as warnings, never positive templates. Introductory coverage and verification evidence are separate axes.",
      navigation: 'authoring_kit({view:"entry",id:"rule:named-answer-options"}); authoring_kit({view:"full"}) exports everything.',
      auditMeaning: "contentMatchesAudit compares content only. auditedRevision is the last reviewed source revision, not the build revision or proof that subsequent implementation changes were audited. Development retrieval remains available with contentMatchesAudit:false; release acceptance requires matching audited content.",
    },
    schemaVersion: SCHEMA_VERSION,
    summary: SUMMARY,
    forceModel: FORCE_MODEL,
    conceptLayerModel: CONCEPT_LAYER_MODEL,
    rules: RULES,
    typeAllowlist: TYPE_ALLOWLIST,
    referenceArtifacts: REFERENCE_ARTIFACTS,
    verificationLegend: VERIFICATION_LEGEND,
    examples: EXAMPLES,
    verifyLoop: { ...VERIFY_LOOP_BASE, note: VERIFY_LOOP_NOTE_BASE + VERIFY_LOOP_NOTE_PRIOR_AUTH,
      methodologyRequirements: METHODOLOGY_REQUIREMENTS },
    judgeLens: JUDGE_LENS,
    feedbackUrl: FEEDBACK_URL,
    boundary: BOUNDARY_ENTRIES.map(b => b.applicability === "All CRL authoring" ? b.text : `${b.applicability}: ${b.text}`),
    dispositionModel: DISPOSITION_MODEL,
  };
  const base = { ...content, navigation: buildKitIndex(content) };
  const contentHash = createHash("sha256").update(JSON.stringify(base)).digest("hex");
  return { ...base, contentHash, audit: { ...audit,
    contentMatchesAudit: audit.auditedContentHash === contentHash && audit.auditedSchemaVersion === SCHEMA_VERSION } };
}
