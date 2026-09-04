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
const SCHEMA_VERSION = "1.29";
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
  "Stage 1 — local-decision-support. Encode a clinical decision over LOCAL coded " +
  "case-features and prove it with CEL cases + the CRE oracle. Narrow (local `code is` " +
  "sources, plus the one sanctioned patient-age Patient `value projection` posrep) + shallow " +
  "(asserted concepts + `defined as` inference over one concept's representations; no " +
  "`definition is` predicates or external value-set sources).";

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
      "REQUIRED on every SCALAR concept — the DEFAULT shape and the ONLY Stage-1 shape (A.10 `missing-value-type` is a validator ERROR for a Scalar concept; the requirement is now SHAPE-CONDITIONAL — a `shape is Record | RecordSet` concept, which is validate-only + OUT of Stage-1, MAY omit it and takes its result type from `type is`, see the `shape is` entry below) — an ORTHOGONAL property, NOT a producer or a layer: the concept's ONE canonical PUBLISHED result shape, the thing every use site consumes and type-checks against. Choose by what the concept RESULTS IN, not its FHIR resource type: boolean = a determination/finding (incl. ANY concept a decision/`criterion`/action guard consumes); Quantity = a measurement/value (most-recent-able); CodeableConcept = a coded refinement; dateTime/integer/string = a scalar datum. The value-type line does NOT itself produce a value — at least one PRODUCER from the entries below is also required (`x + n ≥ 1`; a value type with nothing producing it is invalid, #202). Composition: `concept = value type + ( n primitives and/or ≤1 derived )`. See rule value-type.",
    scope: "in",
  },
  {
    form: "- shape is Scalar | Record | RecordSet.",
    meaning:
      "The concept's declared PUBLISHED CARDINALITY, on its own concept-level line. `Scalar` = a single reduced value (the DEFAULT when `shape is` is omitted, and the ONLY shape Stage-1 authors — every determination/finding/measurement is a Scalar); `Record` = a single selected record; `RecordSet` = the set of records a concept publishes for others to derive from by name. It DECLARES intent — it is NOT yet emit-active: `shape is Record | RecordSet` PARSES + VALIDATES today (and relaxes the concept-level `value type is` requirement, resolving the result type from `type is` — or, for a representation-free derived concept, from its validated operand), but its emit-lowering activates at the #189 flip (a reduction on such a concept trips the `emit-reduction-not-active` sentinel). So `Record`/`RecordSet` are OUT of Stage-1 authoring — do NOT author one; this entry is a VOCABULARY preview so a KE recognizes the marker (and why a non-Scalar concept need not carry a `value type`) if they meet it, NOT a form to write. Stage-1 leaf concepts omit `shape is` (defaulting to Scalar) and carry a `value type`.",
    scope: "out",
  },
  {
    form: "- code is `local-code`.",
    meaning:
      "Query to the LOCAL source using local domain codes. The asserted layer. ⚠ `type is` is REQUIRED alongside `code is` — there is NO implicit default. A locally coded concept is ANSWERABLE (someone can assert it), so the record must be storable, and storing it needs a resource type; omitting it is the validator error `local-code-missing-type`. The type names the resource the local record IS: `type is Observation` for an attested answer (the Stage-1 default CHOICE, written explicitly), a declared non-Observation type retrieves THAT resource. The primary in-stage producer alongside `defined as` (and, for patient age, an optional local override paired with a Patient age `value projection` — see below). MIGRATION-PROMPT (validate-only, do NOT act on it in Stage-1): a bare Scalar boolean `code is` determination — the canonical Stage-1 leaf — emits a `no-bare-scalar-code` WARNING in the shipped #189 validation slice, prompting that its existence be stated explicitly (`definition is exists this`) at the emit FLIP. IGNORE it in Stage-1: reductions are NOT emit-active yet (authoring one now FAILS emit via `emit-reduction-not-active`), so keep the bare `code is` form until the flip lands. The warning does NOT flip validity, and it does NOT contradict the `definition is` OUT-of-stage rule — it is a forward-looking flip prompt, not a Stage-1 action. (A `code is` concept whose reduction is supplied by a `value projection` posrep — patient age — is NOT bare and does not warn.)",
    scope: "in",
  },
  {
    form: '- source representation: - type is <Resource>. - [ coded from "Value Set" ] - [ value projection is <phrase> ].',
    meaning:
      "Query to a source. ⭐ A source representation carries `type is <Resource>.` and, when the resource has a coded retrieve, `coded from` a value set — AND NOTHING ELSE. It does NOT declare a `value element is` or a `value type is`: WHICH element carries the datum is MODEL INFO (the canonical carrier per resource), and its TYPE is the concept's. Requiring the author to name them is what once forced writing something FALSE — `value element is Condition.code.` + `value type is boolean.` on an existence rep asserts that element yields a boolean; it yields a CodeableConcept. It IS a producer (a primitive counting toward `x + n ≥ 1`), and it does not discharge the concept-level `value type is` requirement (A.10) — the concept still declares its own. The rep MAY carry `coded from` (assert the datum against a value set — external, OUT of Stage-1 authoring) AND/OR `value projection is <phrase>` (a rep-level COMPUTATION that TRANSFORMS the rep's own datum into the concept result) — the grammar permits either or both on one rep. `value projection` is a bounded catalog: TODAY the sole projection with a BUILT emit-lowering is `age today <at least|at most|under|younger than> <N> years|months` over `Patient.birthDate` (the IN-stage patient-age form — see below). Only that age-today family is tool-ENFORCED: an `age today` projection with a bad comparator/unit or on a non-Patient carrier is REJECTED at author time. Any OTHER projection phrase PARSES + VALIDATES but its emit-lowering is runtime-DEFERRED (general posrep/projection emit is #257) and OUT of Stage-1 by rule — NOT (yet) tool-rejected (the enforced set is a SUBSET of the normative scope; cf. rule concept-form). Anchored `age at start of \"<anchor>\"` references ANOTHER concept, so it is a concept-level `definition is`, NOT a rep-local projection. Asserted (external value-set) posreps stay OUT of Stage-1 authoring; the Patient-age projection is the one sanctioned Stage-1 posrep.",
    scope: "out",
  },
  {
    form: "- defined as ( ... sem-and / sem-or / sem-not ... ).",
    meaning:
      "INFERENCE / semantic normalization: combines the sub-representations or data-components of ONE concept into ONE clinical fact (the only added depth this stage; #126). It is NOT decision composition and NEVER combines distinct decision criteria — that is the decision tree's job (#168). THE TELL (anchor the unit OUTSIDE the label): name the ONE clinical reality the operands each RECORD without using the concept's own name — alternative records of a SINGLE underlying occurrence (a viral-load lab result and/or a chart note attesting the SAME suppression — the records may themselves coexist, that is fine) are one fact. Operands that are SEPARATE underlying events, each independently occurring (a patient can fail drug therapy AND, separately, physical therapy), are DISTINCT criteria → decision layer, NOT `defined as`. The tell is SAME occurrence vs DIFFERENT occurrences, not whether the records coexist. run_decision evaluates it: sem-and = all, sem-or = any, sem-not = not (closed-world). Bare operands resolve within the defining library; cross-library operands must be qualified. VALUE-PRESERVING: `sem-or`/`sem-and` and a bare-ref alias PRESERVE the concept's declared value type (the author declares it, the composition reconciles operands) — only a TOP-LEVEL `sem-not` and the `defined as exists (…)` sub-form are inherently boolean (see rule value-type). `defined as exists ( \"Concept\" )` is the explicit boolean EXISTENCE form (present → true, absent → false, closed-world), but run_decision cannot PROVE it — it returns status:error when it is EVALUATED ON A DECISION PATH (engine existence evaluation is #270); see rule value-type for the lane matrix.",
    scope: "in",
  },
  {
    form: "- definition is <predicate>.",
    meaning:
      "A predicate (most recent / count within / temporal / value). The INFERRED layer — computes over a source. OUT this stage — no exceptions. (Patient age is NOT a `definition is`: it is a Patient `source representation` with a `value projection` — see below. The one age form that stays a concept-level `definition is` is the anchored `age at start of \"<anchor>\"` measure-context predicate — engine-supported, but OUT of this kit.)",
    scope: "out",
  },
  {
    form: "- code is `age-code`. + - source representation: - type is Patient. - value projection is age today <at least | at most | under | younger than> <N> years|months.",
    meaning:
      "PATIENT AGE — a Patient `source representation` whose `value projection` computes live age over `Patient.birthDate`; the SOLE sanctioned Stage-1 posrep, and the only rep-level `value projection`. TWO shapes: (1) STANDALONE — the age posrep ALONE (no `code is`) — the determination IS the projection; (2) RECENCY — an optional local `code is` age Observation PLUS the age posrep on ONE concept (in the MODEL sense a 2-representation concept: one authored `source representation` + one `code is` producer — NOT two posrep blocks), whose Inferred layer recency-merges the local age Observation (`Observation.effective`) against the live computed age (`Patient.meta.lastUpdated`): NEWEST wins; indeterminate (`lastUpdated` absent) → session-fresh local-source wins (unit-independent). " +
      'Both bounds (#215): `at least` (≥) plus the upper `at most` (≤) / `under` / `younger than` (<) — under closed world a member with NO usable birthDate AND no local age assertion is FALSE (deny), the engine-verified alternative to the wrong `sem-not "Age N Or Older"` complement (which turns that missing evidence into TRUE). ' +
      "UNITS (#257 T2): `years` (`AgeAt()`, whole years) OR `months` (`AgeInMonths()`, whole months) — `days`/`weeks` are a hard error. `Patient.birthDate` being a genuine clinical record that COMPUTES the age is what earns the projection. Do NOT generalize `value projection` to a non-age datum: an `age today` projection on the wrong carrier/unit is tool-rejected, but any OTHER projection phrase parses + validates and is merely runtime-DEFERRED / OUT-by-rule (not tool-rejected); see rule patient-age-projection.",
    scope: "in",
  },
];

const RULES: KitRule[] = [
  {
    id: "concept-form",
    edge: "cpg",
    category: "concept-model",
    rule: 'Every concept declares a `value type` (REQUIRED on a SCALAR concept — the default and only Stage-1 shape; A.10 `missing-value-type` is an ERROR for Scalar, SHAPE-CONDITIONAL for the validate-only `shape is Record | RecordSet` case; see rule value-type) plus at least one PRODUCER — the composition is `concept = value type + ( n primitives and/or ≤1 derived )`, `x + n ≥ 1`. A Stage-1 leaf concept declares `value type is` + `type is` + `code is` (local); `type is` is written EXPLICITLY in this kit\'s exemplars (the terse implicit-standard form that drops `type is` when it is the standard `Observation` / `Observation.value` shape is a later kit-migration, deferred — do not read its absence into these exemplars). A SINGLE criterion stated at a finer data-grain — multiple representations/components of ONE clinical fact — is normalized with `defined as` (INFERENCE) over named local leaves. The unit is anchored OUTSIDE the concept\'s own name: the operands must be alternative records of ONE underlying occurrence (e.g. "viral suppression documented" = a viral-load lab result OR a clinician chart note of the SAME suppression), NOT two SEPARATE events (failed drug therapy and failed physical therapy each occur independently — DISTINCT criteria; author them as decision structure, see decision-composition). The conjunction of DISTINCT criteria (a policy\'s "ALL of the following are met") is decision COMPOSITION (see decision-composition): author it as decision STRUCTURE — a compound branch guard `when ( A and B and C )` (or a named `criterion`) when the criteria share one consequence, sibling `when` branches when they route to DIFFERENT consequences — NEVER as a `defined as`/`sem-*` composite (which ships ONE opaque `condition[]` and asserts a sameness distinct criteria do not have). At the CONCEPT level this stage, `defined as` normalizes ONE concept\'s sub-representations; joining distinct criteria is a DECISION-level construct, not a concept-model one. Still OUT this stage: EXTERNAL `source representation`/`coded from` (value-set posreps) and `definition is` predicates (count/temporal/value) — the SOLE exception: the patient-age Patient `source representation` whose `value projection is age today <at least | at most | under | younger than> <N> years|months` computes over `Patient.birthDate` (standalone, or with a local `code is` override → recency merge; see rule patient-age-projection). The boundary is the concept FORM, not the type vocabulary: any FHIR type may be a local `code is` concept. `meta is` is optional.',
    why: "Local-source pass proves decision authoring (incl. one-concept `defined as` inference) before external sources and predicate inference are added; keeping one-concept inference distinct from decision composition keeps distinct-criteria logic in the DECISION layer, where each criterion is a visible structural operand — an inline concept atom as its own `condition[]`, or a named criterion as one identifier `condition[]` whose transparent define + use-site `input[]` expose its atoms (post-#236) — never fused into one opaque inference boolean (#168 — the test is same-fact vs distinct-criteria; distinct criteria are never fused by `defined as`/`sem-*`; see decision-composition).",
    ref: "concept-layer-model; the `representation-reference.crl` artifact (the reachable worked v3 exemplar)",
    clauses: [
      {
        text: "A Stage-1 leaf concept declares `value type is` (REQUIRED, a property present on the concept — NOT position-bound; the exemplars order it after `type is`) + `type is` + `code is` (local). The IN-stage PRODUCERS are `code is` (local rep) and `defined as` (inference); EXTERNAL `source representation`/`coded from` (value-set posreps) and `definition is` predicates are OUT this stage (the SOLE exception: the patient-age Patient `source representation` with a `value projection is age today <at least | at most | under | younger than> <N> years|months` — standalone or with a local `code is` override — see rule patient-age-projection). The general model `concept = declared shape + shape-appropriate result typing + ( n primitives and/or ≤1 derived )` holds package-wide: a Scalar concept (the default + only Stage-1 shape) declares a concept-level `value type`; a `shape is Record | RecordSet` concept (validate-only, OUT of Stage-1) takes its result type from `type is`. This stage restricts the PRODUCERS and authors only Scalar concepts, so the concept-level `value type` is always required HERE.",
        force: "default",
      },
      {
        text: "`defined as` at the CONCEPT level (this stage) is INFERENCE over the sub-representations/components of ONE concept (the §1 rung-1 unit). Joining a policy's DISTINCT criteria is a DECISION-level construct, not a concept-model one (see decision-composition): author it as decision STRUCTURE — a compound branch guard `when ( A and B )` (or a `criterion`) when the criteria share one consequence, sibling `when` branches when they route to different consequences — NEVER a `defined as`/`sem-*` composite, which ships ONE opaque `condition[]` (the distinct criteria vanish from the emitted artifact) and asserts a sameness distinct criteria do not have. Likewise the disposition-arbitration model carries precedence in the DECISION layer (`first:` branch ORDER over full-conjunction guards), not in the inference layer via `sem-not` FINAL-* concepts (see disposition-arbitration-reference). The violation is distinct criteria fused by opaque inference; the faithful form keeps each criterion a visible structural operand (an inline atom as its own `condition[]`, or a named criterion as one identifier `condition[]` whose transparent define + use-site `input[]` expose its atoms).",
        force: "invariant",
        test: "judgeLens.composition:hollowed-criteria",
      },
    ],
  },
  {
    id: "value-type",
    edge: "cpg",
    category: "concept-model",
    rule: '`value type` is a concept\'s ONE canonical PUBLISHED result shape — the single declared result SHAPE every use site consumes and type-checks against (a shape, not a scalar-cardinality claim). REQUIRED on every SCALAR concept — the default shape and the only shape Stage-1 authors — where A.10 `missing-value-type` is a validator ERROR; the requirement is SHAPE-CONDITIONAL (a validate-only `shape is Record | RecordSet` concept, OUT of Stage-1, may omit it, taking its result type from `type is`). A value type with NO producer is invalid (`x + n ≥ 1`, #202). CHOOSE BY ROLE — what the concept RESULTS IN, not its FHIR resource type: `boolean` = a determination/finding (present-or-not, met-or-not) — INCLUDING any concept a decision `when`, a `criterion` body, or an action guard (`unless`/`only when`) consumes (a guard REQUIRES boolean; rule-B `decision-guard-nonboolean`); `Quantity` = a measurement/value (a BMI, a BP, a lab value — most-recent-able); `CodeableConcept` = a coded refinement/classification; `dateTime`/`integer`/`string` = a scalar datum. THE A.10b LESSON: a determination whose UNDERLYING resource is coded is STILL `boolean` when it is consumed as a guard — the guard CONSUMPTION governs the value type, NOT the resource\'s codedness. And do NOT relabel a genuinely resource/value-shaped concept `boolean` merely to feed a guard: keep that concept at its real shape (it may also be needed as an instance stream, e.g. `most recent`) and DERIVE a SEPARATE boolean guard concept from it. VALUE-PRESERVING INFERENCE: `sem-or`/`sem-and` composition and a bare-ref alias PRESERVE the declared value type (the author declares the concept\'s value type, the composition reconciles operands — the validator makes a NON-boolean composition with a BOOLEAN leaf a hard ERROR, and WARNS on any other result-type disagreement it currently bridges — `composition-result-type-mismatch`, which becomes an ERROR at the #189 flip — though it does not check full datum-type equality among matching-shape non-boolean leaves); only a TOP-LEVEL `sem-not` and `defined as exists (…)` are inherently boolean — so a `defined as` concept is NOT boolean-by-default. NORMATIVE vs SHIPPED: the MODEL requires the value type checked at EVERY use site, but the validator ENFORCES a subset (the operand-constraint registry is seeded, not exhaustive — #266; the nested-call blind spot is the OUTER constrained position; and package-library resolution is a blind spot across ALL rule-B checks), so author to use-site typing as doctrine, not as a guarantee the tool catches every violation. Among the rule-B checks shipped THIS STAGE (NOT an exhaustive list): a guard operand must be boolean; a bare-ref alias must EQUAL its target\'s value type (FULL equality, not just boolean-ness); a NON-boolean composition requires every LEAF non-boolean (a boolean leaf under a non-boolean VALUE-TYPE parent is a hard ERROR `boolean-in-refinement-composition`; a boolean PARENT over a resource/record leaf is bridged today but WARNS `composition-result-type-mismatch` → ERROR at the flip, fixed with an explicit `defined as exists ( … )`; two differing non-booleans likewise warn); a record-shaped guard concept warns `decision-guard-record-shaped`; a no-projector posrep must EQUAL the concept value type; a TOP-LEVEL `sem-not` / `defined as exists` result must be boolean. `defined as exists ( "Concept" )` is the explicit boolean EXISTENCE form (present → true, absent → false, closed-world) — LANE MATRIX (capability status, NOT a usable Stage-1 form yet): it PARSES + VALIDATES, and the STANDARD CQL emit lowers it to `exists (<Concept>)` (#265), BUT `run_decision` cannot PROVE it — it returns status:error whenever the exists concept is EVALUATED ON A DECISION PATH (engine existence evaluation is #270; an unused / off-path exists does not error the run, but it also is not verify-loop-proven); and #269 (reject a boolean operand, which emits silently-always-true via CQL list-promotion) is not yet built, so its operand must be an INSTANCE-BEARING non-boolean concept (in Stage-1, a local `code is` concept with a non-boolean value type) by AUTHOR care. Until #270 lands, a run_decision-provable boolean determination is a plain `code is` boolean concept (asserted directly); reach for `defined as exists` only when a non-boolean concept must be existence-tested, and expect the verify loop to gap on it.',
    why: "The published value type is what makes a concept's result legible AND checkable at every use site; DECLARING it (rather than inferring a return type — patterns have none) is what lets the producers disagree LOUDLY at validate time instead of silently at apply time (the #231 lane bug the redesign closes). The guard⇒boolean check is the specific rule that catches the A.10b masking — a coded-resource determination mis-typed `CodeableConcept` but consumed as a guard. Separating normative doctrine from shipped enforcement keeps the kit honest: it teaches the model to author to without claiming coverage the validator does not yet have.",
    ref: "the `representation-reference.crl` artifact (worked v3 exemplar); src/validator/useSiteTypeValidator.ts (rule-B); concept-layer-model; #202; #231; #265; #266; #269; #270; A.10 missing-value-type",
    clauses: [
      {
        text: "`value type` is REQUIRED on every SCALAR concept (the default + only Stage-1 shape; A.10 `missing-value-type` ERROR for Scalar — SHAPE-CONDITIONAL, a validate-only `shape is Record | RecordSet` concept may omit it and takes its result type from `type is`) and needs at least one producer (`x + n ≥ 1`, #202).",
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
        text: "VALUE-PRESERVING inference (DOCTRINE, partially tool-checked): `sem-or`/`sem-and` and a bare-ref alias preserve the declared value type (author declares; composition reconciles). The validator hard-errors the boolean-leaf/non-boolean-value-type-parent cell and WARNS on other determinable RESULT-type disagreements (`composition-result-type-mismatch` → error at the #189 flip); it does NOT check full DATUM/element-level equality among matching-shape non-boolean leaves, and has documented resolution blind spots (unknown-resource, cross-library), so that finer drift is on the author. Only a TOP-LEVEL `sem-not` and `defined as exists (…)` are inherently boolean.",
        force: "default",
      },
      {
        text: "SHIPPED rule-B checks (NOT exhaustive): a bare-ref alias = FULL equality with its target; a non-boolean composition rejects any boolean LEAF (`boolean-in-refinement-composition`, value-type-keyed hard ERROR — fix by giving the leaf its resource value type or declaring the parent boolean, NOT an `exists` lift); any OTHER composition result-type disagreement the implicit-existence bridge permits (a boolean parent over a resource/record leaf; two differing non-booleans, incl. two Scalar leaves like Quantity-under-CodeableConcept; a differing record resource) is a `composition-result-type-mismatch` WARNING today that becomes an ERROR at the #189 flip (fix the boolean-parent+record-leaf cell with an explicit `defined as exists ( \"X\" )`); a TYPED record-shaped concept (a non-Scalar shape with a declared boolean datum value type) in a decision guard warns (`decision-guard-record-shaped`) — but a value-type-LESS Record/RecordSet guard operand resolves untyped and is SILENT in N (a residual flip hole, not caught until the flip); a no-projector posrep = concept value type; a TOP-LEVEL `sem-not` / `defined as exists` result must be boolean; a guard operand must be boolean.",
        force: "validator-enforced",
      },
      {
        text: "NORMATIVE vs SHIPPED: the model requires use-site type-checking EVERYWHERE, but the enforced set is a SUBSET (operand-constraint registry seeded not exhaustive, #266; nested-call / package-library blind spots) — author to the doctrine; do not assume the tool catches every use-site mismatch.",
        force: "default",
      },
      {
        text: "`defined as exists ( \"Concept\" )` LANE MATRIX (capability status, NOT a usable Stage-1 form yet): parses+validates ✓; standard CQL emit ✓ (#265, `exists (<Concept>)`); run_decision ✗ (status:error, #270) — cannot pass the kit verify-loop today; #269 (reject a boolean operand → silently-always-true) unbuilt, so its operand must be an instance-bearing non-boolean concept by author care. The run_decision-passing boolean determination form is a plain `code is` boolean concept.",
        force: "default",
      },
    ],
  },
  {
    id: "inline-answer-options",
    edge: "cpg",
    category: "concept-model",
    rule:
      "A CODED QUESTION DECLARES ITS OWN ANSWER OPTIONS INLINE, and the predicate that reads them names a " +
      "SUBSET of that same declaration \u2014 so the codes are written ONCE, on the question they belong to. " +
      "`- value from:` takes option lines of the form \`<code>\` display is \`<text a clinician reads>\`, " +
      "<marker>. The marker is `qualifying` or `not qualifying`. A separate boolean concept then tests " +
      "`definition is \"<question>\" in qualifying.` \u2014 no terminology, no system URL, no second list. " +
      "THE OPTION CODES LIVE IN THE CONCEPT'S OWN CodeSystem, minted from its `code is`; an author never " +
      "writes a system anywhere, including in CEL, where a fact may carry a BARE option code " +
      "(`- value is \"chronic-blepharitis\".`) and its system is resolved from the `defined by` concept. " +
      "THE MARKER IS REQUIRED EXACTLY WHEN the concept is the subject of an `in qualifying` predicate \u2014 a " +
      "plain dropdown that feeds no predicate needs none, and forcing one would classify options as " +
      "qualifying-for-nothing. ALWAYS OFFER A \"NONE OF THE LISTED \u2026\" OPTION, marked `not qualifying`: it " +
      "is what lets an honest user reach a DETERMINATE false in ONE answer instead of leaving the criterion " +
      "unknown, and the word \"listed\" is load-bearing \u2014 a patient may genuinely have the finding without " +
      "having a LISTED one. Membership stays OFFERED, NOT ADMISSIBLE: a present code that was never offered " +
      "is a determinate NON-member (false), not an error, and CEL states one with the explicit " +
      "\`<system>|<code>\` form. THE SUBJECT MUST PUBLISH ONE RECORD (`shape is Record` + a reduction such " +
      "as `definition is most recent this`); a `RecordSet` subject is REFUSED (multi-select is not built). " +
      "A cross-library subject is REFUSED: a subset names part of the subject's OWN declaration and cannot " +
      "be resolved across libraries, and a foreign subject's unknown would be totalized to false \u2014 denying " +
      "an unanswered question instead of pausing. USE THE NAMED-TERMINOLOGY FORM " +
      "(`value from \"<terminology>\"`) INSTEAD when the options are an EXTERNAL code set (CPT, ICD-10) or " +
      "when two predicates need DIFFERENT qualifying subsets of one question.",
    why:
      "Declaring the options twice \u2014 once as an offered set and again as the qualifying set \u2014 is the " +
      "CONFIDENT-DENY hazard in its purest form: a KE adds an option, forgets to mirror it, and an honest " +
      "answer computes false and DENIES. A pause is recoverable; a spurious false looks like a decision. " +
      "One list with a required marker makes that mistake fail to compile instead of failing a patient.",
    ref: "src/validator/answerOptionsValidator.ts; src/validator/membershipScopeValidator.ts; src/fhir-emitter/inlineAnswerSet.ts; #189",
    clauses: [
      {
        text:
          "Options are declared INLINE on the question: `- value from:` then one line per option \u2014 " +
          "\`<code>\` display is \`<text>\`, qualifying|not qualifying. The predicate is a separate boolean " +
          "concept: `definition is \"<question>\" in qualifying.`",
        force: "default",
      },
      {
        text:
          "A `display` is REQUIRED on every inline option (`answer-options-missing-display`). It is the text " +
          "a clinician reads; it is never derived from the code.",
        force: "validator-enforced",
      },
      {
        text:
          "The `qualifying` / `not qualifying` marker is REQUIRED on every option of a concept that IS the " +
          "subject of an `in qualifying` predicate (`answer-options-missing-marker`), and is not required " +
          "otherwise. Adding an option therefore cannot compile until you say what it does.",
        force: "validator-enforced",
      },
      {
        text:
          "Offer a \"none of the listed \u2026\" option marked `not qualifying`. Without it a denial costs one " +
          "answer per option instead of one answer total, because an unanswered disjunct leaves the " +
          "criterion UNKNOWN. If EVERY option qualifies the validator warns (`answer-options-all-qualifying`); " +
          "if NONE does it errors (`answer-options-none-qualifying`).",
        force: "validator-enforced",
      },
      {
        text:
          "The subject must publish ONE record: `shape is Record` plus a reduction (`definition is most " +
          "recent this`). A `RecordSet` subject is refused (`membership-subject-shape-unsupported`) \u2014 " +
          "multi-select is not built.",
        force: "validator-enforced",
      },
      {
        text:
          "A cross-library subject is refused (`membership-subset-cross-library`), as is a subject with no " +
          "inline options (`membership-subset-subject-has-no-options`).",
        force: "validator-enforced",
      },
      {
        text:
          "In CEL, a fact on such a concept carries a BARE option code (`- value is \"<code>\".`); the system " +
          "is resolved from the concept. The explicit \`<system>|<code>\` form remains legal and is how you " +
          "author a deliberate NON-member (an unoffered or external code), which evaluates to a determinate " +
          "false, not an error.",
        force: "default",
      },
      {
        text:
          "Use `value from \"<terminology>\"` instead when the options are an EXTERNAL code set, or when two " +
          "predicates need different qualifying subsets of one question.",
        force: "default",
      },
      {
        text:
          "MIGRATING N BOOLEAN LEAVES INTO ONE CODED QUESTION: each leaf's `code is` becomes an OPTION code " +
          "(keep the code text \u2014 it is the clinical identity, and shortening it loses the distinctions the " +
          "leaves were carrying), its concept NAME becomes the `display`, and the criterion's disjunction is " +
          "replaced by `definition is \"<question>\" in qualifying`. ADD a \"none of the listed \u2026\" option " +
          "\u2014 without it the migration does not reduce the denial cost at all.",
        force: "default",
      },
      {
        text:
          "\u26a0 MIGRATION CHANGES BEHAVIOUR, and the change is worth stating to whoever owns the policy: N " +
          "booleans are N INDEPENDENT facts that COEXIST, while a coded question has ONE answer slot arbitrated " +
          "by `most recent this`. So a later answer OVERRIDES an earlier one, where before both stood. It also " +
          "means only ONE qualifying answer can be recorded \u2014 harmless for a disjunctive criterion (one " +
          "qualifying answer decides it), but a real loss if anything downstream needs the full set.",
        force: "default",
      },
      {
        text:
          "\u26a0 DO NOT COLLAPSE A LAYER WHOSE LEAVES ARE CHARTABLE. A boolean leaf can grow an evidence arm " +
          "later (`coded from` over external records, additively, one leaf at a time); a coded question cannot, " +
          "because its options live in a LOCAL system that external codes are never members of. Collapse the " +
          "layers whose answers are ASSERTED (patient-reported, reviewer-attested); leave the layers whose " +
          "answers are, or may become, READ FROM THE CHART.",
        force: "default",
      },
      {
        text:
          "\u26a0 A concept with inline options and a CODED `source representation` is a contradiction the " +
          "validator warns about: the options live in a minted LOCAL system, so a source-supplied datum can " +
          "never be a member and every such record computes a determinate FALSE.",
        force: "validator-enforced",
      },
    ],
  },
  {
    id: "patient-age-projection",
    edge: "cpg",
    category: "concept-model",
    rule: 'PATIENT AGE is the SOLE sanctioned Stage-1 `source representation` — a Patient posrep whose `value projection` computes live age over `Patient.birthDate`. It is NOT a `definition is` (that form is RETIRED — an authored `definition is age today` is now an author-time + emit error pointing at this posrep form). TWO shapes: (1) STANDALONE — the age posrep ALONE (no `code is`): the determination IS the projection. (2) RECENCY — a local `code is` age Observation PLUS the age posrep on ONE concept; the Inferred layer RECENCY-MERGES them: newest of the local age Observation (`Observation.effective`) vs `Patient.meta.lastUpdated` wins; indeterminate (`lastUpdated` absent) → the session-fresh local-source wins (unit-independent). This is a 2-representation concept in the MODEL sense — ONE authored `source representation` block plus one `code is` producer — NOT two posrep blocks (a second age posrep is rejected). COMPARATORS (#215): `at least <N>` (≥, lower bound) and the UPPER bounds `at most <N>` (≤, inclusive), `under <N>` / `younger than <N>` (<, exclusive). The upper bounds are the engine-verified alternative to the INCORRECT `sem-not "Age N Or Older"` complement — the exact closed-world cell: a member with NO usable birthDate AND no local age assertion evaluates FALSE (deny) through the recency truth-set (a session-fresh local TRUE assertion still wins via recency); the complement instead turns that MISSING evidence into TRUE, granting an under-N pathway for unknown age (a measured wrong determination). UNITS (#257 T2): `years` OR `months` — `days`/`weeks` are a hard error. Years compute via `AgeAt()` (whole years), months via `AgeInMonths()` (whole months); both TRUNCATE, so `at most N` ≡ `under N+1` in the chosen unit (a pediatric "under 21" gate is `under 21`; an infant "under 6 months" gate is `under 6 months`). `validate_crl` REJECTS an unsupported comparator (`less than`) or an unsanctioned unit (`days`/`weeks`) at AUTHOR time, and emit refuses them loudly. The anchored `age at start of "<anchor>" <cmp> <N> years` predicate takes the SAME comparators, but it references ANOTHER concept (the anchor), so it stays a concept-level `definition is` COMPUTE-ONLY inference (a measure-context age, years-only) — engine-supported, yet NEITHER a posrep projection NOR this recency merge; do NOT migrate it to a posrep. Constraints: the RECENCY (local-override) concept is `type is Observation` (emit recency-shape guard); every age concept is `value type is boolean` (author-required; a guard-consumed age concept is author-time REJECTED if non-boolean by rule-B `decision-guard-nonboolean`, the non-guard-consumed residual tracked #241). Arm semantics: `code is` + age posrep = recency-merge; the age posrep ALONE = standalone (projection-only) determination — do NOT call the standalone form a recency merge (recency applies ONLY when the local `code is` arm is present). VERIFICATION (honest tiers): the RECENCY arbitration (years) is verified at `$r5.apply` POINT-IN-TIME (lower bound: 6 cases incl. the indeterminate-recency cell; upper bound: 11 cells incl. unknown→deny, the exclusive/inclusive boundary, and recency — #215); T1 preserved the emitted artifacts byte-identically (golden-confirmed), so that claim transfers to the posrep form. The MONTHS and STANDALONE forms (#257 T2) are construct- + executed-CQL-verified (`AgeInMonths()` truncation + boundary math run through the translator), NOT re-verified at `$r5.apply`. AGE-ONLY guardrail: `value projection` is a bounded catalog whose ONLY entry with a BUILT emit-lowering today is age today over `Patient.birthDate`. Tool enforcement covers ONLY the age-today family (a bad comparator/unit/carrier → author error); any OTHER projection phrase PARSES + VALIDATES but is runtime-DEFERRED (#257) and OUT of Stage-1 by rule — NOT yet tool-rejected (the enforced set is a SUBSET of the normative scope). Do NOT author one. The do-not-persist of a session-asserted age answer is a documentation marker (`@business-logic-deferred` in `meta is`) present ONLY on the local-override (`code is`) arm (a standalone posrep has no human-assert Observation to persist); the persistence mechanism is #190 (deferred).',
    why: "`Patient.birthDate` is a real clinical record that COMPUTES the age, so a patient-age concept can be determined by a live projection over it (standalone), or — with a local `code is` age assertion — recency-merge the two genuine sources (newest wins); that is why age earns the one sanctioned Stage-1 posrep projection the rest of the stage defers.",
    ref: "#190; #257; patient-age recency merge; disc 173",
    clauses: [
      {
        text: "The RECENCY (local `code is` + age posrep) concept's EFFECTIVE local type is Observation — the recency merge emits an Observation-boolean retrieve. ⚠ Authoring MUST still declare `- type is Observation.` — the recency concept is a local `code is` like any other, and the implicit-standard omission it once relied on has been removed. A STANDALONE age posrep's own `type is` is `Patient` (the projected carrier).",
        force: "invariant",
        test: "verifyLoop:patient-age-projection",
      },
      {
        text: "Every patient-age concept is `value type is boolean` (the exemplar demonstrates it). An age concept CONSUMED as a decision/`criterion` guard is now author-time REJECTED if non-boolean by rule-B `decision-guard-nonboolean`; general enforcement of the boolean declaration for a non-guard-consumed age concept remains tracked — #241.",
        force: "invariant",
        test: "verifyLoop:patient-age-projection",
      },
      {
        text: "The age comparator is one of `at least` (≥) / `at most` (≤) / `under` (<) / `younger than` (< synonym), and its unit is `years` (`AgeAt()`) OR `months` (`AgeInMonths()`) — an unsupported comparator (e.g. `less than`) or an unsanctioned unit (`days`/`weeks`) is a hard error. `validate_crl` rejects both at author time (#215/#257 T2).",
        force: "invariant",
        test: "verifyLoop:patient-age-projection",
      },
      {
        text: "Arm semantics: `code is` + age posrep = recency-merge; the age posrep ALONE = standalone projection-only determination (NOT a recency merge). The anchored `age at start of \"<anchor>\"` stays a concept-level `definition is` compute-only inference, NOT a posrep.",
        force: "default",
      },
      {
        text: "AGE-ONLY guardrail: `value projection` has ONE entry with a built emit-lowering today — age today over `Patient.birthDate`. An `age today` projection with a bad comparator/unit/carrier is tool-REJECTED; any OTHER projection phrase parses + validates but is runtime-DEFERRED (#257) and OUT of Stage-1 by rule (not yet tool-rejected) — do NOT author one.",
        force: "invariant",
        test: "verifyLoop:patient-age-projection",
      },
    ],
  },
  {
    id: "interface-concept-naming",
    edge: "cpg",
    category: "concept-model",
    rule: 'Name a concept a decision\'s `when` references (an INTERFACE concept — the case-feature the determination consumes) as an ASKABLE phrase: the FHIR emit forms the case-feature input PROMPT by appending \'?\' to the concept name ("Patient Has Active Crohns Disease" -> "Patient Has Active Crohns Disease?"), so a name that reads as a yes/no question yields a sensible DTR questionnaire prompt with no separate author field. SCOPE: the emit generates a case-feature StructureDefinition + a PlanDefinition `action.input` for a TOP-LAYER directly-asserted local concept only (a single `code is` LocalSource/boolean concept the `when` asserts directly). A `when` on a `defined as`/INFERRED condition does NOT yet generate the recursive leaf inputs — deferred (#180).',
    why: "The interface concept's NAME is the human prompt the DTR questionnaire renders; an askable name produces the prompt by emit convention (+'?') with no extra grammar. Top-layer-only is the current emit reality: a directly-asserted condition maps 1:1 to one case-feature input; an inferred condition needs a recursive input over its leaves (open design — #180).",
    ref: "#180; fhir-emitter case-feature + action.input",
  },
  {
    id: "decision-qualifiers",
    edge: "cpg",
    category: "decision-shape",
    rule: "A multi-branch decision must declare a qualifier: `first:` (ordered, first match wins — requires a trailing `otherwise`), `all:` (every matching branch fires), or `any:` (over actions only — offer alternatives). A `then:` body is closed by `end.`. A single-member block takes no qualifier.",
    ref: "docs/decision-shapes.md; validator rules qualifier-required / otherwise-required / any-over-branches / first-over-actions",
  },
  {
    id: "decision-composition",
    edge: "cpg",
    category: "decision-shape",
    rule: 'The COMPOSITION LADDER (§1) — the primitive is decided by the UNIT you are combining: (rung 1) sub-representations of ONE criterion → `defined as` INFERENCE (sem-and/or/not, closed-world; see concept-form); (rung 2) DISTINCT criteria of ONE determination → decision STRUCTURE in all cases: a COMPOUND BRANCH GUARD `when ( A and B and C )` (or a named `criterion`, see branch-guards / criterion) when the criteria share ONE consequence and you want a single gate node; sibling `when` branches under `first:` when they route to DIFFERENT consequences (divergent dispositions / precedence / exclusion-first / per-criterion sub-tree). Distinct criteria are NEVER fused by `defined as`/`sem-*` — that inference collapses them to ONE opaque CQL boolean (the criteria vanish from the emitted PlanDefinition) and asserts a sameness that does not exist; `defined as` is rung-1 only. (rung 3) SEPARATE determinations the SOURCE delegates, OR a GENUINELY-SHARED determination reused across policies/pathways → chained `use decision` (see chaining-necessity — source-delegation OR genuine reuse, NOT fabricated coupling). The tree already expresses AND/OR/NOT, so "I have boolean logic" is NOT a chaining signal — almost all of it stays in ONE tree. (`any:` is over ACTIONS only — alternatives WITHIN one matched branch — NEVER an OR over `when` branches; see decision-qualifiers.) A `when` now takes an `and`/`or`/`not` boolean over concept/criterion refs (see branch-guards / criterion), not a single concept. A `defined as` composite over distinct criteria gated as a `when` is a VIOLATION regardless of consequence: the emitted PlanDefinition ships ONE opaque `condition[]` (the distinct criteria are invisible), and `sem-*` over distinct criteria asserts a sameness that does not exist. Each distinct criterion is a visible structural operand — an inline concept atom as its own action-level `condition[]`, or its own `when` node, or a named `criterion` (itself one identifier `condition[]` whose transparent define + use-site `input[]` expose its atoms, post-#236) — NEVER fused into one opaque inference boolean (see criteria-decision-reference / criterion). Exposing ONE criterion\'s sub-representations AS `when` nodes (§3) is presumed-faithful: do NOT revert it. AT SCALE, when one determination has many OVERLAPPING pathways with outcome precedence + fall-through, gate each pathway on its FULL conjunction as a compound branch guard and let `first:` branch ORDER carry the precedence (see disposition-arbitration-reference) — every criterion stays a visible guard atom, a partial match falls through (no trap), and NO `sem-not` inference-layer arbitration is needed (that was the retired pre-#224 workaround for single-concept `when`).',
    why: "The test is SAME-FACT vs DISTINCT-CRITERIA (\"one fact\" is ANCHORED OUTSIDE the author's naming — it must be nameable without the composite's own label; see the UNIT ANCHORING clause. Without that anchor this test is unfalsifiable, because the author names the composite and thereby names the fact.) — are the `defined as`/`sem-*` operands alternative representations of ONE clinical fact, or a policy's distinct criteria? Two reasons a composite over DISTINCT criteria is unfaithful. (1) EMIT OPACITY: it lowers to ONE opaque CQL boolean, so the emitted PlanDefinition ships a SINGLE `condition[]` — the distinct criteria are INVISIBLE in the shipped artifact (a downstream reader, and any engine but the CRE, sees one true/false, not which criterion failed). A decision-layer branch guard keeps each criterion VISIBLE instead — an inline atom as its own `condition[]`, a named criterion as one identifier `condition[]` resolving to a transparent define with its atoms in the use-site `input[]` (post-#236) — never fused into one opaque boolean. (2) SEMANTIC SAMENESS: `sem-*` asserts its operands are alternative REPRESENTATIONS of ONE fact; distinct criteria are not one fact, so the assertion is false — and now that the decision layer expresses conjunction (`and` guards) and precedence (`first:`) directly, there is a faithful STRUCTURAL home with no reason to reach for inference. So `defined as`/`sem-*` is rung-1 ONLY (one criterion's representations); distinct-criteria composition AND precedence live in the decision layer. (This retires the earlier 'a single-consequence composite is faithful' rule, which rested on the CRE's render-time operand truth-table — an affordance the SHIPPED artifact does not carry — and it lands the whole kit on one rule with no carve-out.)",
    ref: "docs/decision-shapes.md; criteria-decision-reference; disposition-arbitration-reference; chaining-necessity; #168",
    clauses: [
      {
        text: "Combine by the UNIT (§1 ladder): one criterion's representations → `defined as`; distinct criteria of one determination → decision STRUCTURE (a compound branch guard / `criterion` when they share one consequence; sibling `when` branches when they route to different consequences); separate source-delegated OR genuinely-shared/reused determinations → `use decision`. Distinct criteria are NEVER fused by `defined as`/`sem-*`. Boolean complexity alone is NOT a chaining signal.",
        force: "default",
      },
      {
        text: "A `defined as`/`sem-*` composite over a policy's DISTINCT criteria, gated as a `when`, is a VIOLATION regardless of shared consequence. Two reasons: the emitted PlanDefinition ships ONE opaque `condition[]` (the distinct criteria are INVISIBLE in the shipped artifact — the CRE's operand truth-table is a render-time affordance the artifact does not carry), and `sem-*` asserts a SAMENESS (alternative representations of ONE fact) that distinct criteria do not have. The faithful home is decision STRUCTURE: a COMPOUND BRANCH GUARD `when ( A and B and C )` (or a named `criterion`) when the criteria share one consequence — each criterion a distinct VISIBLE structural operand (an inline concept atom as its own action-level `condition[]`; a named criterion as one identifier `condition[]` whose transparent decomposable define + use-site `input[]` expose its atoms — post-#236, NOT collapsed into the parent), never FUSED into one opaque inference boolean; sibling `when` branches when they route to DIFFERENT consequences (divergent dispositions / precedence / exclusion-first / per-criterion sub-tree). Flag and revert (even against a human) a distinct-criteria `defined as`/`sem-*` composite. (The REVERSE — exposing ONE criterion's sub-representations as `when` nodes — is faithful; do NOT revert it. `defined as`/`sem-*` over ONE criterion's representations is rung-1 and stands.)",
        force: "invariant",
        test: "judgeLens.composition:hollowed-criteria",
      },
      {
        text: "UNIT ANCHORING — the ONE fact must be identifiable WITHOUT the composite's own label. `sem-` is SEMANTIC: the operator ASSERTS its operands are the same underlying clinical reality RECORDED DIFFERENTLY (a lab value OR a chart note attesting one viral suppression; the local age Observation OR the computed `Patient.birthDate`). A composite's NAME must NEVER be accepted as the fact its operands represent: name seven distinct diseases `Substantial Co Morbidity` and they become 'representations' of it — at which point EVERY disjunction is rung-1 and the distinct-criteria invariant CANNOT BE VIOLATED. A test whose subject the author names is a test the author always passes. Adjudicate by asking: is this ONE clinical event/state that could be RECORDED in more than one place, or are these DIFFERENT states, any of which independently satisfies the rule? Different diseases, expense categories, programmes, diagnoses, clinician types, required plan components are DIFFERENT -> decision STRUCTURE. Source wording offering alternatives ('one or both of the following', 'either of the following', 'such as', 'including') marks ALTERNATIVES the policy presents; it is NOT a licence for `defined as`. Rung-1 inference is NARROW: on a real policy most candidate composites FAIL this test, and a review clearing most of them is itself evidence the label was allowed to stand in for the fact. MECHANICAL COROLLARY, decisive alone and needing no source read: if an operand ALSO appears as a guard atom anywhere in the decision, it is a distinct criterion — the author already had to name it as its own condition.",
        force: "invariant",
        test: "judgeLens.composition:hollowed-criteria",
      },
      {
        text: "OR-of-PATHWAYS: when a policy offers criteria as ALTERNATIVE multi-criterion pathways ('medically necessary for ANY ONE of the following indications'), give each pathway its OWN sibling `when` branch gated on its FULL conjunction as a COMPOUND BRANCH GUARD (`when ( c1 and c2 and c3 ) then …`), or name that conjunction a `criterion` and gate on the name. This is required for ACCURACY: under `first:` a matched branch COMMITS and `otherwise` is TERMINAL, so gating a pathway on a PARTIAL condition strands a patient who fails it but qualifies under the next pathway — the full-conjunction guard is what makes a partial match FALL THROUGH. Both keep every criterion visible — the inline compound guard as its own per-atom `condition[]`, the named criterion as one identifier `condition[]` resolving to a transparent define with its atoms in the use-site `input[]` (post-#236) — so do NOT additionally re-expose them as nested `when` nodes (behaviour-neutral duplication). Do NOT gate the pathway on a `defined as` entry-gate composite — that hides the criteria in one opaque `condition[]` and asserts false sameness (per the invariant above).",
        force: "default",
      },
      {
        text: 'SIZE / #236 (emit mechanics of the recommended shape — load-bearing): an INLINE compound `or`-guard (`when ( A or B )`, or a mixed `and`-of-`or`) lowers to the FHIR PlanDefinition in DISJUNCTIVE NORMAL FORM — the guard expands into K arms (K = the number of DNF terms, NOT necessarily the count of source disjuncts: a mixed `and`-of-`or` guard multiplies the arm count CARTESIANLY, ~2^N in the worst case), and each arm gets its own per-atom `condition[]` AND a DEEP-CLONED copy of the ENTIRE downstream subtree beneath the guard. So K arms over an S-action descendant subtree emit ~K×(S+1) actions. Placement: the arms splice as ordered SIBLINGS under `first:`; under other qualifiers they are wrapped in ONE synthesized `cqf-applicabilityBehavior "any"` grouping action. That duplication is the transparency win for an inline guard (every atom is a visible `condition[]`, no hidden disjunction), but it is MULTIPLICATIVE — an inline `or` high in the tree clones everything below it. A named `criterion` is the FACTORING remedy (post-#236): a criterion ref is ONE DNF leaf — its `or` lives inside the criterion\'s named define, emitted ONCE and referenced by identity, so it does NOT expand at the parent and does NOT clone the subtree (multiplication → addition; its atoms stay visible in the define body + use-site `input[]`). Contrast a rung-1 `defined as`, which lowers to ONE opaque `condition[]` — bounded but HIDING the disjunction (right for one-fact-attested-two-ways, wrong for distinct criteria). So for distinct criteria: an inline compound guard is transparent-but-multiplicative; a named criterion is transparent-AND-linear; a `defined as` is bounded-but-opaque and reserved for rung-1. #236 was MOTIVATED by a measurement on a real prior-auth policy — PRE-#236, inline-expanding a reused criterion grew one emitted PlanDefinition ~51× (130 KB → 6.7 MB, 2.5k → 122k lines) with no logic change; the named-define lowering (#236, resolved) retired that expansion.',
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
    rule: 'PER-ACTION guard: a menu item in an `any:`/`all:` action block may carry `unless "C"` (drop when C holds) or `only when "C"` (include only when C holds). Guards are legal ONLY on multi-action menu members — not on inline `when … then recommend`, not on `otherwise`, not on a single menu-less action. Takes a CONCEPT only (a `criterion` name here is `criterion-misuse`). Keep at least one ALWAYS-offered (unguarded) item so a matched branch can never produce nothing. EMIT: action guards LOWER to FHIR (#224 iii.1) — a guarded menu item emits its own `condition[kind=applicability]` (`only when "C"` → positive `text/cql-identifier`; `unless "C"` → a library-qualified, null-safe negation `not Coalesce("<Library>"."C", false)` as `text/cql-expression`) PLUS the guard concept as a case-feature `input`. The guard boolean itself never lowers to CQL — it stays a single per-item applicability condition. (This is a DIFFERENT construct from a branch guard — the `when` condition; see branch-guards.)',
    ref: "docs/decision-shapes.md; validator rule guard-on-single-action",
  },
  {
    id: "branch-guards",
    edge: "cpg",
    category: "guards",
    rule: 'A `when` BRANCH condition is a boolean over concept (and `criterion`) references — `and`, `or`, `not`, parentheses (CRL #224). A single ref needs no parens; a HOMOGENEOUS chain (`A and B and C` or `A or B or C`) may be bare; a MIXED `and`/`or` MUST be parenthesized (`( A or B ) and C`) — a bare mixed chain is a builder error. NEGATION is first-class: `not X` (`when not X`, `when A and not B`) and `not ( <compound> )` (parens required over a compound operand). CLOSED-WORLD: `not X` holds when X is NOT established. The guard STRUCTURE itself never collapses to one opaque CQL boolean: `and` → several ANDed applicability `condition[]` on one action; `or` → DNF arms (contiguous ordered siblings under `first:`; one `cqf-applicabilityBehavior:"any"` group under `all:`/flat); `not` → De Morgan pushes it to signed leaf literals, and a NEGATED literal emits a per-atom `not Coalesce(<ref>, false)` applicability `condition[]`. Each ATOM — positive or negated — stays a VISIBLE `condition[]` / cockpit guard-box row: a CONCEPT atom is one `text/cql-identifier` naming the concept; a CRITERION atom is one `condition[]` naming the criterion (positive → `text/cql-identifier`; negated → `not Coalesce(...)` `text/cql-expression`), resolving to that criterion\'s OWN named boolean define (its sub-atoms visible in the transparent define body + the use-site `input[]` + an expandable named cockpit view-model node, post-#236) — NOT the parent guard collapsed. This visible-atom property is what separates a branch guard from `defined as` inference (which collapses distinct criteria to ONE opaque CQL boolean asserting a false sameness). DIFFERENT construct from the per-action guard (`unless`/`only when` on a menu member; see guards).',
    why: "The branch guard is the decision-layer home for a policy's distinct-criteria conjunction/disjunction/negation: it keeps each criterion a visible atom in the shipped PlanDefinition — a concept atom as its own action-level `condition[]`, a named criterion atom as one identifier `condition[]` resolving to a transparent decomposable define (atoms in the define body + use-site `input[]`) — unlike a `defined as` composite, which ships one opaque boolean and asserts a false sameness. Allowing `not` alongside `and`/`or` keeps every branch guard structurally lowerable — De Morgan / DNF pushes negation to signed literals, so the guard structure never collapses to a compound CQL boolean; precedence is expressed by parentheses and branch ordering under `first:`.",
    ref: "docs/decision-shapes.md; #224",
    clauses: [
      {
        text: "A MIXED `and`/`or` branch condition MUST be parenthesized (a bare mixed chain is a builder error), and a `not` over a COMPOUND operand must parenthesize it (`not ( A or B )`); `not` over a single ref needs none (`not X`). `not` IS in the branch-condition grammar (#224 iii.3). The tool enforces the parenthesization, not the agent.",
        force: "validator-enforced",
      },
      {
        text: "A `when` branch condition is an `and`/`or`/`not` boolean over concept/criterion refs; the guard STRUCTURE lowers to PlanDefinition.action shape (ANDed `condition[]` for `and`; DNF arms for `or`; a per-atom `not Coalesce(<ref>, false)` applicability `condition[]` for a negated literal) and never collapses to one opaque CQL boolean — so each ATOM stays a VISIBLE `condition[]`: an inline CONCEPT atom is its own action-level condition; a CRITERION atom is one identifier (positive) or `not Coalesce` (negated) condition resolving to that criterion's named define, its sub-atoms in the define body + use-site `input[]` (post-#236, NOT the parent collapsed). Branch `not` lowers to FHIR emit as of #224 iii.3 (closed-world: `not X` holds when X is NOT established), alongside the per-action `unless` (#224 iii.1 — see guards). A per-action `unless` is menu-member-only; a single-determination `first:` exclusion needs branch `not`.",
        force: "default",
      },
      {
        text: "OVER-ENVELOPE response: the emit MATERIALIZATION envelope (the finite bound on an INLINE compound guard's expanded DNF — an ARM cap only, owned + reported by the emitter as `compound-guard-expansion-overflow`; a guard's own `and`/`or` nesting is parser-bounded, not a separate emit cap) is a RESOURCE bound, NOT an authoring-complexity gate. Author to fidelity; a FAITHFUL model that approaches it is a capability-gap SIGNAL, not an error — raise it / consult the kit, do NOT blind-restructure to satisfy the bound. Two faithful ways to keep logic OUT of the parent DNF: (1) a `use decision` sub-decision ONLY for a genuinely-shared / source-delegated determination (never a fabricated one; see chaining-necessity); and (2) name a reused OR large-`or` sub-expression a `criterion` — post-#236 a criterion ref is ONE DNF leaf (its `or` lives inside its named define, emitted once), so it DOES provide arm-count relief (this is the emitter's own factoring path, not a fabricated boundary — the atoms stay visible in the define + use-site `input[]`). The retired `criterion-expansion-overflow`/criterion-atom bound is GONE — a criterion no longer materializes into the DNF at all.",
        force: "default",
      },
    ],
  },
  {
    id: "criterion",
    edge: "cpg",
    category: "decision-shape",
    rule: 'A `criterion` is a NAMED, reusable branch-guard sub-expression: `criterion "Name": - when ( <and/or/not condition> ).` (outer parens REQUIRED on the declaration; a criterion body may use `not`/`and`/`or`, #224 iii.3 — emitted STRUCTURALLY into its define, per-operand totalized, with NO De Morgan / DNF flattening of the body; only the PARENT guard\'s own leaves lower to DNF, and a criterion ref is one such leaf). Reference it UNQUALIFIED in any `when` branch (bare or inside a compound). It LOWERS ONCE to a NAMED boolean CQL define and is referenced BY IDENTITY — a criterion ref is a single guard LITERAL (one positive `text/cql-identifier` `condition[]`, or `not Coalesce("Lib"."Name", false)` when negated, #224 iii.3), NOT its inline-expanded body (this is the decision-layer twin of naming a `concept … defined as` — a named reference, not a materialized macro; #236). N references → the body is emitted ONCE (a DAG of named defines, linear in distinct criteria); criterion→criterion refs are define→define refs. BRANCH-CONDITION position ONLY; UN-ASSERTABLE (a CEL case cannot assert a criterion — it is not a first-class value; the named define is emitted LOGIC identity, NOT a concept identity or an assertable value); illegal inside `defined as`/`sem-*`, a narrative, or an action guard (`criterion-misuse`). LIBRARY-LOCAL: an unqualified or SELF-qualified (`"ThisLib"."X"`) ref resolves; a FOREIGN-qualified ref is rejected (`criterion-misuse: cannot be library-qualified` once the sibling lib is included; `external-library-not-included` before). A criterion is not cross-library exportable — to REUSE guard logic across libraries, share a CONCEPT only when it is ONE genuine clinical fact and its representations (NEVER as a container for distinct-criteria guard logic — that is the retired composite the invariant forbids), or a `use decision` for a genuinely-shared determination; otherwise duplicate inline, or report the missing cross-library structural capability. It IS an emit-arm reducer: a criterion ref is ALWAYS one parent DNF leaf (positive → one `text/cql-identifier` `condition[]`; negated → one `not Coalesce(...)` `text/cql-expression` `condition[]`), so it never itself multiplies the parent arm count. Whether NAMING reduces the count vs inlining is a property of the BODY: naming reduces exactly when the inlined-then-NNF equivalent would have >1 DNF arm — the common cases are a positive ref to an effective-disjunction body (an `or` not under a `not`) and a negated ref to an effective-conjunction body (`not ( A and B )`). Any body whose inlined NNF is a pure conjunction is arm-neutral (a positive pure-`and`/single-ref body — and equally e.g. a negated `or`, `not ( X or Y )`). The criterion\'s atoms stay VISIBLE — in its own decomposable define body, in the use-site `input[]` (its recursive atom closure), and as an expandable named node in the cockpit view-model (`op:"criterion"`; the MV cockpit rendering of it trails, #274) — so naming does not hide them; it RELOCATES where they surface (§decision-composition).',
    why: "A `criterion` is authoring DRY for a distinct-criteria guard sub-expression reused across branches/decisions — a readability aid AND (post-#236) an emit-tractability one: it lowers to a named define emitted once and referenced by identity, so a reused or large-`or` sub-expression collapses to a single guard leaf instead of cloning its body across DNF arms. Keeping it un-assertable + branch-only + library-local keeps it a pure guard name (emitted LOGIC identity, not a concept/value kind or a cross-library coupling). Its define is a TRANSPARENT decomposable boolean over named leaves (with the atom closure carried in the use-site `input[]`), which is exactly what distinguishes it from a `defined as`/`sem-*` inference composite (one opaque boolean asserting a sameness) — so naming a criterion is a faithful STRUCTURAL factoring, not a hiding of distinct criteria.",
    ref: "docs/decision-shapes.md; validator rules criterion-cycle / criterion-misuse; #224",
    clauses: [
      {
        text: "VALIDATOR-ENFORCED: a criterion in a concept-only slot (`defined as`/`sem-*`/narrative/action-guard) or a FOREIGN library-qualified ref is `criterion-misuse`; a cycle/self-reference is `criterion-cycle`; a CEL `defined by` a criterion is `criterion-not-a-defined-by-target`; a name is EITHER a concept or a criterion (`duplicate-name`). The tool rejects these — the agent need not police them.",
        force: "validator-enforced",
      },
      {
        text: "A `criterion` names a reusable `and`/`or`/`not` branch guard, referenced UNQUALIFIED (or self-qualified) in a branch condition; it lowers ONCE to a named boolean CQL define referenced BY IDENTITY (one condition per ref, body emitted once) — a readability/DRY + emit-tractability aid: the criterion ref stays ONE parent leaf, and naming reduces the arm count exactly when the inlined-then-NNF body would have >1 DNF arm (a positive effective disjunction, or a negated effective conjunction); a body whose inlined NNF is a pure conjunction is arm-neutral. Still NOT a cross-library export. Its atoms stay visible in the define body + use-site `input[]` + an expandable named cockpit view-model node.",
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
    rule: 'Under `first:`, `when ( A or B )` and two sibling `when A` / `when B` branches (same disposition) emit the SAME disjunctive arms — both keep every atom visible; this is NOT the #168 line (both are structure, not inference). Choose on audit granularity + routing: DIFFERENT dispositions → sibling branches (ordered — precedence is part of the rule); an `or` that is a SUB-TERM of a larger `and` → it MUST be a guard (sibling branches would DUPLICATE the shared conjunct); interchangeable alternatives of ONE rule sharing one body → a guard is fine (promote to a `criterion` when it recurs OR when its `or` needs arm-count relief — but note the promotion is no longer emit-neutral post-#236: a named criterion is ONE identifier `condition[]` resolving to a define with atoms in `input[]`, whereas the inline guard is per-atom action `condition[]` — both faithful, an audit-granularity choice; see criterion). ⚠ The equivalence holds ONLY under `first:` — under `all:` a guard-`or` branch fires its body ONCE (one `"any"` group), while two sibling `when`s under `all:` each fire (the disposition can be produced TWICE).',
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
      "IN PRIOR AUTH, ALMOST NOTHING IS READ FROM THE CHART. The submitted request and the patient are the " +
      "record arm \u2014 a `ServiceRequest` (what is being asked for) and `Patient` (demographics, age). " +
      "EVERYTHING ELSE IS AN ANSWER: the clinical criteria are ATTESTED by whoever submits or reviews the " +
      "request, not retrieved from a chart the payer does not have. So the DEFAULT shape for a PA criterion " +
      "is a LOCALLY-CODED question \u2014 a `code is` boolean, or a coded question with INLINE `value from:` " +
      "options (see `inline-answer-options`) \u2014 and NOT a `source representation` with `coded from`. Reach " +
      "for a source representation only for the request itself, for Patient, or where a deployment genuinely " +
      "does have the clinical data. \u26a0 THE CONSEQUENCE FOR ANSWER OPTIONS: because PA criteria are local, " +
      "their option codes belong to the policy, so the INLINE form is the normal one and the named-terminology " +
      "form is for the request's service codes (CPT and the like) \u2014 the opposite default from a measure or a " +
      "CDS artifact working over a real record.",
    why:
      "A PA artifact authored as though it could read the chart produces criteria that are UNANSWERABLE in " +
      "the deployment that runs it: nothing populates them, every determination pauses, and the policy looks " +
      "broken rather than under-informed. Naming the record arm precisely \u2014 request and patient \u2014 is what " +
      "keeps the rest of the model honest about where its facts come from.",
    ref: "#189; concept-layer-model; inline-answer-options",
    clauses: [
      {
        text:
          "The RECORD arm in PA is the submitted `ServiceRequest` and `Patient`. Model every other criterion " +
          "as a locally-coded ANSWER unless the deployment is known to hold the clinical data.",
        force: "default",
      },
      {
        text:
          "Prefer INLINE `value from:` options for a PA coded question \u2014 the codes are the policy's own. Use " +
          "`value from \"<terminology>\"` for the REQUEST's service codes and other external code sets.",
        force: "default",
      },
      {
        text:
          "\u26a0 An unanswered local criterion is UNKNOWN, not false, so the tree PAUSES and the question is asked. " +
          "That is the intended behaviour \u2014 do not add a source representation merely to make a criterion " +
          "resolve, because that trades a recoverable pause for a confident wrong answer.",
        force: "default",
      },
    ],
  },
  {
    id: "pa-disposition-set",
    edge: "prior-auth",
    category: "dispositions",
    rule: "A PA / medical-policy coverage DETERMINATION is a CONFIGURED disposition (see `configure-dispositions`): a plain local `activity` named `\"<category>.<key>\"`, where the CATEGORY is a PAS review-action — `certify`, `not-certify`, or `pended` — and the KEY is a reason/flavor the deployment declares in `crl.dispositions` (e.g. two `not-certify` reasons — a medical-necessity vs an experimental/investigational/unproven — as distinct keyed leaves). The determination is constrained STRUCTURALLY (naming no deployment activities): (1) MEMBERSHIP — every recommended determination is a CONFIGURED `<category>.<key>` (or a bare single-option `<category>`); a determination not in the deployment's configured set is invalid. (2) COMMUNICATED, not ordered — a determination is `CPGCommunicationRequest`, never a `CPGServiceRequest` service order. (3) MUTUAL EXCLUSIVITY — each case fires EXACTLY ONE determination, spanning the DELEGATED CLOSURE (parent + any chained `use decision` sub together): no reachable path may emit two in a single run (author ordered precedence with `first:` + `otherwise`; do not place two determinations under one `all:`/`any:`; a branch that both delegates and `recommend`s is the case an in-tree-only check misses). (4) FINALITY BY MODE — `standalone` (our decision IS the whole adjudication) requires FINAL leaves (certify/not-certify); a non-final `pended` (PAS A4) leaf is legitimate only in `embedded` mode (our decision feeds a larger cross-company adjudication). WHICH keyed flavors exist, and their labels/codes, are the deployment's config; whether a policy uses the RIGHT flavor where it draws a distinction is a reviewer/Judge fidelity call this rule INSTRUCTS but does not mechanically enforce. (Membership + communicated-not-ordered + finality-by-mode are ALSO validator-enforced when the project configures `crl.dispositions.options` — see `configure-dispositions`; they remain always-on per-policy invariants for unconfigured content.)",
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
        text: "MUTUAL EXCLUSIVITY spans the DELEGATED CLOSURE: exactly one determination per run over parent + any chained sub together; no path may emit two (a branch that both delegates and `recommend`s is the case an in-tree-only check misses). Author ordered precedence with `first:` + `otherwise`.",
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
    rule: 'A medical-policy deployment MUST configure its disposition vocabulary in the content project\'s `package.json` under `crl.dispositions`: a `mode` (`standalone` | `embedded`) and `options` mapping each PAS category (`certify` / `not-certify` / `pended`) to keyed reasons/flavors — `{ label, narrative?, code? }`. The activity name a policy recommends is `"<category>.<key>"` (e.g. `recommend activity "not-certify.EIU"`), authored as a plain local `activity` block (`request CPGCommunicationRequest`); the `code` on an option is a PAS review-decision-reason code in full-PAS (Approve/Deny) intent, or the larger system\'s own code in embedded (Met/Unmet) intent. Once `options` is configured it is the CLOSED valid set: the validator rejects any recommended activity not in it, any determination not `CPGCommunicationRequest`, and (per `disposition-mode`) a non-final leaf under `standalone`. Default vocabulary (if unconfigured): `certify.Approve` / `not-certify.Deny`.',
    why: "The determination vocabulary is per-deployment (one payer per content project) — Approve/Deny for a standalone full-PA deployment, Met/Unmet for one that is part of a larger adjudication. Making it CONFIG (not hard-coded in the language or the kit) is what lets a deployment relabel or add a flavor without re-authoring policies, and keeps the universal kit customer-agnostic. This rule is GUIDANCE — the validator does NOT error on a MISSING config (an unconfigured project keeps today's behavior); it is the nudge to configure so the closed-set + request-type + finality checks turn on.",
    ref: "crl.dispositions; #134",
  },
  {
    id: "disposition-mode",
    edge: "prior-auth",
    category: "dispositions",
    rule: "`crl.dispositions.mode` is first-class and gates FINALITY only. `standalone` — our decision IS the whole coverage adjudication; every determination leaf must be FINAL (certify / not-certify). `embedded` — our decision is a SUB-determination feeding a larger cross-company adjudication; a non-final `pended` (PAS A4) leaf is legitimate (a refer-up / need-info contribution). In BOTH modes our decision still issues EXACTLY ONE determination per run (mutual-exclusivity is not relaxed by mode — do NOT read `embedded` as permission to emit two determinations across a parent + sub).",
    why: "The customer described two operating modes: Smile as the whole PA (Approve/Deny final) vs Smile as part of a larger system (Met/Unmet contributions that the larger tree finalizes). Only finality differs — a contribution may be non-final; it is still one contribution per run. Making mode explicit lets the same policy CRL run either way per deployment, and lets the validator enforce standalone-finality without guessing.",
    ref: "crl.dispositions.mode",
  },
  {
    id: "minimalism",
    edge: "cpg",
    category: "minimalism",
    rule: "Declare the MINIMAL set that captures the clinical intent and let the emitter do the heavy lifting. Do not over-specify properties the emitter can derive. Minimalism is over EMITTER-DERIVABLE detail, NOT over FIDELITY: a branch guard that keeps each distinct criterion VISIBLE (an inline atom as its own `condition[]`, or a named criterion as one identifier `condition[]` resolving to a transparent define with its atoms in `input[]`) is NOT 'over-specified' relative to a `defined as` composite that hides them in one opaque boolean — semantic fidelity (same-fact vs distinct-criteria; see decision-composition) governs over node-count.",
    ref: "declarative-not-implementation",
  },
  {
    id: "cel-cases",
    edge: "cpg",
    category: "cel",
    rule: 'Author a companion `.cel`: `covers "<CRL library>"`; a Patient subject `fact` (`- defined by "Patient".`); one clinical `fact` per case-feature linked to its concept via `- defined by "<library>"."<concept>".`; and one `case` per path with `- subject is …`, the relevant `- fact is …`, and a `- result is "<decision>" is "<branch>".` oracle. The CRE satisfies a concept iff a case fact is `defined by` it.',
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
    rule:
      "⚠ THE EMITTED TREES ARE PRODUCER-OWNED — do not hand-author into them, and do not keep anything " +
      "there you are not willing to lose. `emit_cel` WIPES `<out>/patient/` (conventionally " +
      "`tests/data/fhir/`) and repopulates it; `emit_results` DELETES unclaimed files of the resource types " +
      "it owns under `tests/results/fhir/` — by default, and unless you pass `prune: false`; symlinks and " +
      "files it could not remove are REPORTED rather than deleted. Both leave a MANIFEST beside their tree " +
      "(`cel-data-manifest.json`, `questionnaire-manifest-<library>.json`) listing case → compartmentDir → " +
      "[{path, sha256}], so ONE verification routine covers both. " +
      "⚠ RE-HASHING THE LISTED FILES PROVES INTEGRITY, NOT COMPLETENESS — it says the manifested artifacts " +
      "have the expected bytes, and says NOTHING about extra files. To verify a tree exactly you must also " +
      "enumerate it and compare the path SET against the manifest. " +
      "⭐ WHY THIS MATTERS EVEN IF YOU NEVER LOOK IN THE TREE: renaming a case changes its compartmentId, so " +
      "without a wipe the OLD compartment stays on disk, complete and plausible. Measured in the field: a " +
      "47→48 case suite with 12 renames left 60 directories and 964 stale files. Worse, those stale files " +
      "then defeat any downstream mirror-and-prune step — it reports 0 pruned and is CORRECT, because the " +
      "junk is in its SOURCE, so it copies it onward and certifies it. A dirty generator does not just leave " +
      "junk; it manufactures confidence downstream. Verify against the manifest, not a directory listing.",
    ref: "verifyLoop",
  },
  {
    id: "produce-results",
    edge: "cpg",
    category: "process",
    rule:
      "AFTER the verify loop is clean, produce the artifacts a MEDICAL REVIEWER reads with " +
      "`emit_results(celPath, crlPath, useCase, jarPath, jarSha256)` — for prior-auth it runs the engine’s " +
      "`$apply` per case and writes a Questionnaire + QuestionnaireResponse to " +
      "`tests/results/fhir/patient/<compartmentId>/<type>/`, the SAME compartmentId the CEL emitter uses under " +
      "`tests/data/`, so a case’s facts and its results address alike. Unlike every other `emit_*` this RUNS AN " +
      "ENGINE, so it is DISABLED by default: turn on the `crl.enableResults` VS Code setting (User scope) and " +
      "restart your MCP client — an exported or `setx` CRL_ENABLE_RESULTS is NOT inherited by an editor launched " +
      "from a pre-existing shell or desktop session, on any OS. You supply the engine jar and its sha256; get it " +
      "from Maven Central `org.opencds.cqf.fhir:cqf-fhir-cr-cli:4.7.0` (⚠ the `-cli` artifact — the plain " +
      "`cqf-fhir-cr` jar is not a Spring Boot fat jar and will not launch). Needs a JRE 17+, nothing is extracted. " +
      "READ THE PER-CASE STATE, never a directory listing: every case gets exactly one of `generated` | " +
      "`no-questionnaire` | `populate-degraded` | `failed` | `timeout` | `not-run`, so ‘the policy asked nothing’ " +
      "and ‘the run died’ are different answers rather than both being an absent file. " +
      "⚠ THE RESULTS TREE IS PRODUCER-OWNED: every Questionnaire and QuestionnaireResponse under it that the run " +
      "did not write is DELETED (pass `prune: false` to keep them). Do NOT hand-author Q/QR there — put them " +
      "somewhere else. This is what stops a renamed case leaving a stale pair behind that the viewer then shows a " +
      "reviewer as a real case.",
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
    title: "Local case-feature concept (asserted, in scope)",
    language: "crl",
    snippet:
      'concept "Documented Nonunion":\n- type is Condition.\n- value type is boolean.\n- code is `documented-nonunion`.',
    valid: true,
    note: "value type is + type is + code is only — the Stage-1 leaf concept form.",
  },
  {
    title: "A policy's ALTERNATIVES are joined in the DECISION layer, not by `defined as`",
    language: "crl",
    snippet:
      'concept "Failed Drug Therapy":\n- type is Observation.\n- value type is boolean.\n- code is `failed-drug`.\nconcept "Failed Physical Therapy":\n- type is Observation.\n- value type is boolean.\n- code is `failed-pt`.\ncriterion "Failed Conservative Therapy":\n- when ( "Failed Drug Therapy" or "Failed Physical Therapy" ).',
    valid: true,
    note: "TWO DISTINCT criteria the policy offers as ALTERNATIVES, joined in the DECISION layer by naming them a `criterion`. Post-#236 the criterion lowers to ONE named boolean CQL define referenced by identity — so a `when` on it emits ONE identifier `condition[]` naming the criterion, and the two modality atoms stay visible in the criterion's TRANSPARENT define body (`Coalesce(\"Failed Drug Therapy\", false) or Coalesce(\"Failed Physical Therapy\", false)`) + the use-site `input[]` (the recursive atom closure) + an expandable named node in the cockpit view-model (post-#236) — a downstream reader recovers WHICH modality failed from those, and the modalities do NOT clone the downstream subtree. This is faithful STRUCTURE, categorically distinct from a `defined as` sem-or composite (which fuses them into ONE opaque inference boolean asserting a false sameness). REPLACES the former `defined as` sem-or composite over these same two failures: pre-#224 a `when` took a SINGLE concept reference, so `defined as` was the ONLY way to get a disjunction into a guard — that constraint is gone. The old note ('ONE criterion satisfiable by either representation') was weaker than the rule and was read as licensing any disjunction sitting under a criterion label. #168.",
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
    note: "Distinct criteria conjoined in the DECISION layer — each conjunct is its OWN visible `condition[]` in the emitted PlanDefinition, NOT fused into a `defined as` composite. (A conjunct that is itself a named `criterion` — here `\"Failed Conservative Therapy\"` — resolves to ONE identifier `condition[]` naming that criterion, its own sub-atoms in its transparent define + use-site `input[]`, post-#236; it is not re-expanded.) A single ref needs no parens; a homogeneous chain may be bare; MIXED `and`/`or` must be parenthesized.",
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
  "AFTER this loop is clean, `emit_results` produces the Questionnaire/QuestionnaireResponse a medical reviewer " +
  "reads (see the `produce-results` rule): it is DISABLED by default, needs an engine jar you supply, and it " +
  "DELETES any Q/QR under `tests/results/fhir/` that the run did not write — do not hand-author artifacts there. " +
  "validate_cel and run_decision require FILES under a project root (a package.json); they do not accept inline code. In a content project's artifact-package layout, author <artifact>.crl and <artifact>.cel under the artifact's package and pass absolute paths. " +
  "PROJECT CONFIG — the project's `package.json` MUST declare `crl.canonicalBase` (e.g. `\"crl\": { \"canonicalBase\": \"http://example.org/crl/<project>\" }`): every emitted local CodeSystem url is `<canonicalBase>/CodeSystem/<domain>-local`, so emit fails with `missing-canonical-url-base` without it (no urn fallback). Projects that emit FHIR already require it; `emit_cql` for local-`code is` content likewise needs a `path` (not inline `code`) so it can read the base from the nearest package.json. " +
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
  "PROOF STATUS IS ORTHOGONAL TO FAITHFULNESS (§4): faithfulness decides the model, provability decides whether run_decision can prove it yet. Encode the FAITHFUL model and DEFER the proof for any construct the kit `boundary` marks out-of-scope — never substitute a less-faithful provable model, and never assert a composite to fake green (K4). Read the live proof status from `conceptLayerModel` (scope in/out) and `boundary` (e.g. a `definition is` predicate is deferred; a `use decision` delegation — bare same-library OR qualified cross-library — is evaluated) — do not hardcode a snapshot. " +
  "DURABLE proof-methodology (independent of which constructs are evaluated): ASSERT THE PATH, not just the disposition. `result is` checks disposition MEMBERSHIP only — two paths ending in the same disposition (a sub-decision's `otherwise` Deny and a parent's `otherwise` Deny) are indistinguishable, so a case short-circuiting to the WRONG `otherwise` still 'passes'. Fall-through / chained proof cases must assert the path via the run trace (`viaWhen` / nodeId) or use DISTINCT disposition activities per path.";

/** The prior-auth-only closure paragraph appended to the verify-loop `note` (the coverage cardinality invariant). */
const VERIFY_LOOP_NOTE_PRIOR_AUTH =
  " MUTUAL-EXCLUSIVITY SPANS ALL EMISSION PATHS (coverage / PA — the consumer of this invariant). The 'exactly one determination per run' invariant is evaluated over EVERY emission path — the DELEGATED CLOSURE (parent + any chained `use decision` sub together) AND `all:`/`any:` sibling FAN-OUT — not in-tree branches or delegation alone: a branch that both delegates and `recommend`s, or two determinations placed under one `all:`, each emit two determinations an in-tree-only check misses. Note BOTH `first:` and `all:` are legal branch qualifiers (validator: `first:` or `all:` over when-branches; `any:` is over ACTIONS only) — a determination authored `all:` fans out multiple outcomes and so HITS this invariant; author a determination's precedence with `first:` + `otherwise` so exactly one fires.";

const VERIFY_LOOP_BASE: Omit<VerifyLoop, "note" | "methodologyRequirements"> = {
  steps: [
    "validate_crl(path) — clean (no errors)",
    "validate_cel(path) — clean (no errors)",
    "run_decision(path) — every case's `result is` passes (status: pass)",
  ],
  proves:
    "The decision SHAPE is valid and the branch/menu WIRING produces the asserted disposition for each case's facts.",
  doesNotProve:
    "That a concept's `code is` is the clinically correct code, or that the concept-to-intent mapping is right. The CRE (v1) is asserted-only and never evaluates `code is`: a concept is satisfied purely because a case fact is `defined by` it. A green run means the wiring is right, NOT that the encoding is clinically complete or correct. " +
    "For a PATIENT-AGE RECENCY concept specifically (a local `code is` age Observation + a Patient age `value projection`): run_decision proves the concept integrates into the decision SHAPE (a satisfied case flows to the right branch), NOT the recency EXECUTION — which representation (the local age Observation vs the age computed over `Patient.birthDate`) actually wins the merge. That recency arbitration (newest wins; indeterminate → session-fresh local-source wins) is verified for the YEARS form at the engine level via `PlanDefinition/<id>/$r5.apply` POINT-IN-TIME (6 cases incl. the indeterminate-recency cell), not by the asserted-only run_decision.",
};

/** The methodology requirements, edge-tagged. Assembled by chain in buildBase; a prior-auth requirement is present exactly when its anchoring prior-auth clause is. */
const METHODOLOGY_REQUIREMENTS: VerifyLoop["methodologyRequirements"] = [
  {
    id: "assert-path",
    edge: "cpg",
    text: "§4-req1 — ASSERT THE PATH, not just the disposition: `result is` checks disposition membership only, so two paths ending in the same disposition (a sub's `otherwise` Deny vs a parent's `otherwise` Deny) are indistinguishable; a fall-through / chained proof case must assert the path via the run trace (`viaWhen`/nodeId) or use DISTINCT disposition activities per path.",
  },
  {
    id: "patient-age-projection",
    edge: "cpg",
    text: "PATIENT-AGE projection structural checks (the SOLE sanctioned Stage-1 posrep — a Patient `source representation` with a `value projection is age today …`, NOT a `definition is`): the RECENCY (local `code is` + age posrep) concept is `type is Observation`; every age concept is `value type is boolean`; the unit is `years` (`AgeAt()`) OR `months` (`AgeInMonths()`) — days/weeks are a hard error; and `value projection` is not generalized to any non-age datum. The recency-merge EXECUTION (newest of `Observation.effective` vs `Patient.meta.lastUpdated` wins; indeterminate → session-fresh local-source wins) is engine-verified for the YEARS recency form at `$r5.apply` POINT-IN-TIME (6 cases incl. the indeterminate-recency cell; transfers to the posrep form via T1's byte-identical emit), not by asserted-only run_decision; the months/standalone forms are construct- + executed-CQL-verified (#257 T2), not $r5.apply-re-verified (#190; #257; disc 173).",
  },
  {
    id: "mutual-exclusivity-spans-closure",
    edge: "prior-auth",
    text: "§4-req2 — the coverage 'exactly one determination per run' invariant is checked over ALL emission paths (the DELEGATED CLOSURE — parent + any chained `use decision` sub together — AND `all:`/`any:` sibling FAN-OUT): run_decision over the policy's cases must show no run producing >1 determination, INCLUDING a branch that both delegates and `recommend`s, or two determinations placed under one `all:`. (PA is a consumer of this coverage invariant.)",
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
        "our decision feeds a larger adjudication; a non-final (pended) leaf is legitimate; still ONE determination per run",
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
        "whether a SOURCE sentence names/delegates the sub-determination a `use decision` chains to.",
      guidance:
        "A `use decision` is faithful ONLY if the source presents a SEPARATE / delegated determination by name " +
        "(another policy/protocol/shared sub-determination). Chaining for DRY / reuse / readability, or to factor " +
        "one policy's internal pathways, INVENTS a boundary the source does not draw (an ADD; it changes the " +
        "disposition/provenance surface). Cross-policy apparent reuse must be DUPLICATED, not factored.",
      checkpoints: [
        "Does a specific source sentence name/delegate the chained sub-determination?",
        "Does the sub render its OWN disposition (Approve/Deny meaningful alone), vs a true/false condition that should stay a `when`?",
        "Is this cross-policy reuse that should be duplicated (two sources), not factored (a false coupling)?",
      ],
    },
    {
      check: "hollowed-criteria",
      weightedBy:
        "whether the `defined as`/`sem-*` operands are alternative REPRESENTATIONS of ONE clinical fact (faithful inference) or DISTINCT criteria (a decision-composition violation), and whether each distinct criterion surfaces as a distinct STRUCTURAL operand (an inline atom's own `condition[]`, a `when` node, or a named criterion's transparent define + use-site `input[]`) rather than being FUSED into ONE opaque inference `condition[]`.",
      guidance:
        "FAITHFUL: `defined as`/`sem-*` used ONLY over the alternative representations of ONE criterion (one clinical fact — " +
        "the rung-1 unit). VIOLATION: distinct criteria fused by `defined as`/`sem-*`, REGARDLESS of shared consequence. Two " +
        "reasons, independent of the CRE's render-time truth-table: (1) EMIT OPACITY — the composite lowers to ONE opaque CQL " +
        "boolean, so the shipped PlanDefinition carries a SINGLE `condition[]` and the distinct criteria are invisible in the " +
        "artifact (only the CRE re-derives them at render time; a downstream engine/reader does not). (2) SEMANTIC SAMENESS — " +
        "`sem-*` asserts its operands are one fact's representations, which distinct criteria are not. The faithful home is " +
        "decision STRUCTURE: a compound branch guard (each INLINE criterion its own `condition[]`) or a named `criterion` " +
        "(one identifier `condition[]` resolving to a TRANSPARENT decomposable define with its atoms in the use-site `input[]`, post-#236) when they share one consequence, " +
        "sibling `when` branches when they route differently. Flag a distinct-criteria composite even if deliberate; a one-fact " +
        "`defined as` STANDS even if deliberate. (The REVERSE — exposing one criterion's sub-representations as `when` nodes — " +
        "is faithful; do NOT revert it.) NOT behaviour-based: re-grounding a composite to a guard is a zero-behaviour diff — " +
        "'it changed nothing' is expected (the truth function is preserved), not a defence. " +
        "APPLY UNIT ANCHORING FIRST, OR THIS CHECKPOINT CANNOT FAIL: name the single clinical reality the operands each " +
        "RECORD, WITHOUT using the composite's own label. If you cannot, they are distinct criteria and the faithful home is " +
        "decision structure. 'The policy groups them under one heading' is evidence of nothing — a heading is a label, not a " +
        "fact. MECHANICAL COROLLARY (no source read needed): an operand that ALSO appears as a guard atom anywhere in the " +
        "decision is a distinct criterion; a floor, not a substitute — it catches only the subset the author re-used. EXPECT " +
        "most composites in a real policy to FAIL; a pass clearing the majority must be re-run against UNIT ANCHORING before it is reported.",
      checkpoints: [
        "Are the `defined as`/`sem-*` operands alternative REPRESENTATIONS of ONE clinical fact, or DISTINCT criteria of the policy? Operational test (from decision-shapes.md): would a policy reviewer expect to see this operand as its OWN criterion line (→ distinct criterion; use structure) or as one of several data forms of a single fact (→ representation; inference is faithful)?",
        "Are the distinct criteria carried by decision STRUCTURE — each an inline atom's own `condition[]`, a `when` node, or a named `criterion` (one identifier `condition[]` resolving to a TRANSPARENT decomposable define with its atoms in the use-site `input[]`, post-#236) — or are they FUSED inside ONE opaque `defined as`/`sem-*` inference `condition[]` (the violation)? The test is OPACITY-OF-INFERENCE, not action-level condition count: a named criterion is faithful even though its sub-atoms live in its define + `input[]` rather than as separate action conditions.",
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
      checkpoints: [
        "Is every source criterion a visible node/operand (an action `condition[]`, a `when` node, a named criterion's transparent define + use-site `input[]`, or a rung-1 representation)?",
        "Is any criterion or determination boundary present that the source does not state?",
      ],
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
    text: "`definition is` predicates (count / most-recent / temporal / value thresholds — compute over a source) are OUT (no age exception — patient age is a `source representation` `value projection`, NOT a `definition is`; see rule patient-age-projection). The one age form that remains a concept-level `definition is` is the anchored `age at start of \"<anchor>\" <cmp> <N> years` measure-context predicate — engine-supported, but OUT of this kit. CORRELATED resource-level temporal refinement (e.g. `<orders> on day of or after <active diagnoses>`) is a later-stage measure/refinement construct that EXISTS in CRL but is OUT of this kit — it is documented in the CQL emitter's inference-pattern catalog, not taught here. (The `representation-reference` validate-only artifact also PREVIEWS `definition is` selection/count/within — read-not-author, same proof-axis-vs-authoring-scope caveat as the posrep boundary entry.)",
    edge: "cpg",
  },
  {
    text: "EXTERNAL / value-set sources (`source representation` + `coded from`). The `representation-reference` artifact (verification `validate-only`) DEMONSTRATES external posreps as a forward-looking capability preview — reachable to READ, but this is a PROOF-axis status, ORTHOGONAL to authoring scope: EXTERNAL (value-set) posreps remain OUT of scope to AUTHOR at Stage 1. Do not read the artifact's presence as a license. The ONE posrep that IS in-scope to author at Stage 1 is the patient-age Patient `source representation` with a `value projection is age today …` (standalone or with a local `code is` override; see rule patient-age-projection) — a `value projection` posrep, not a `coded from` one.",
    edge: "cpg",
  },
  {
    text: "PA Pended (X12 278 HCR01 A4) — an async/workflow disposition resolved OUTSIDE the per-policy clinical decision; not a determination leaf",
    edge: "prior-auth",
  },
  {
    text: "the numeric emit MATERIALIZATION cap (an INLINE compound guard's expanded-DNF ARM bound) — owned by the EMITTER as a resource bound and REPORTED by it (`compound-guard-expansion-overflow`); the kit reasons about PROXIMITY qualitatively (see branch-guards over-envelope doctrine) and defers the cap's VALUE to the emitter, never copying it into the kit (drift). (A `criterion` no longer has an expansion cap — post-#236 it is one referenced define, not materialized into the DNF; the old `criterion-expansion-overflow` + criterion-atom bound are retired.)",
    edge: "cpg",
  },
  {
    text: "emit to FHIR / CQL",
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
 * consumer). The three tiers are different KINDS of proof, NOT an ordered rank. It states the PROOF axis
 * (is it runtime-proven, and by what?) — ORTHOGONAL to the AUTHORING-SCOPE axis (`boundary` / `conceptLayerModel`
 * `scope`): a `validate-only` artifact can demonstrate a construct that is OUT of scope to AUTHOR at this stage.
 */
const VERIFICATION_LEGEND: VerificationLegendEntry[] = [
  {
    tier: "cre-run",
    means:
      "The artifact — a `.crl` + `.cel` PAIR — is executed through the CRE (the engine behind `run_decision`) by the kit's OWN test suite every build (a `.cel`'s tier names the pair it proves). Proves that the asserted recommendation is PRODUCED (membership) for each supplied case's facts — i.e. the branch/menu wiring reaches it.",
    doesNotProve:
      "Membership only: it does NOT prove exact output, that a guarded item is ABSENT, or path identity (two cases ending in the same disposition are indistinguishable). Nor clinical `code is` correctness, engine retrieval, FHIR emit, or `$apply` — CRE v1 is asserted-only (a concept is satisfied purely because a case fact is `defined by` it; it never evaluates `code is`).",
  },
  {
    tier: "engine-run",
    means:
      "Validated by the kit suite, AND the artifact's CONSTRUCT was verified at `PlanDefinition/<id>/$r5.apply` POINT-IN-TIME by a separate engine harness (used for the patient-age recency merge, which asserted-only `run_decision` cannot prove).",
    doesNotProve:
      "That THIS exact artifact is re-run by the kit suite — the `$r5.apply` verification is a historical, point-in-time claim over the construct, not a per-build regression. There is no CEL companion.",
  },
  {
    tier: "validate-only",
    means:
      "Validated by the kit suite (build + validator-clean) only. A capability PREVIEW of the concept model — reachable so the worked form (e.g. the value-preserving `sem-or` union) can be learned.",
    doesNotProve:
      "Any runtime behavior OF THIS ARTIFACT: the suite does not execute its constructs. Most are runtime-DEFERRED anyway (external posreps #257; `defined as exists` #270; `definition is` selection/count/within). An artifact MAY embed a construct that IS runtime-shipped in production (e.g. the patient-age `value projection`) — `validate-only` only says THIS artifact was not runtime-proven here (not re-verified at `$r5.apply`), never that every construct in it is deferred. It is NOT a runtime-proven template, and NOT a Stage-1 authoring license (see `boundary`).",
  },
];

const REFERENCE_ARTIFACTS: ReferenceArtifact[] = [
  {
    name: "decision-reference.crl",
    language: "crl",
    edge: "cpg",
    purpose:
      "Canonical Stage-1 decision: first:/otherwise ordered precedence + a matched branch opening an `any:` menu with `unless`/`only when` guards and an always-offered item; local `code is` concepts; plain activity dispositions.",
    verification: "cre-run",
    source: DECISION_REFERENCE_CRL,
  },
  {
    name: "decision-reference.cel",
    language: "cel",
    edge: "cpg",
    purpose:
      "Companion cases for decision-reference.crl: Patient subject, concept-linked facts, and one `result is` oracle per path (the unless drop, the only-when enable, ordered exclusion, a plain offer).",
    verification: "cre-run",
    source: DECISION_REFERENCE_CEL,
  },
  {
    name: "criteria-decision-reference.crl",
    language: "crl",
    edge: "prior-auth",
    purpose:
      'The model for #168: a policy\'s DISTINCT criteria as decision STRUCTURE (each criterion visible/auditable) — nested `when` nodes or a COMPOUND BRANCH GUARD `when ( A and B )` (nesting/`and` = AND): an inline atom is its own action `condition[]`; a named `criterion` is one identifier `condition[]` whose TRANSPARENT decomposable define + use-site `input[]` expose its atoms (post-#236, NOT collapsed into the parent). "Failed Conservative Therapy" (failed drug therapy OR failed physical therapy) is a named `criterion` — lowered ONCE to a boolean define referenced by identity, NOT a `defined as`: failed drug therapy and failed physical therapy are two SEPARATE events joined in the DECISION layer. Its CONTRAST — "Viral Suppression Documented" (ONE clinical state attested two ways: a lab result OR a chart note) — IS a `defined as ( ... sem-or ... )`, riding the tree as a single-concept `when` node: the artifact\'s end-to-end proof that the sanctioned rung-1 construct emits + runs. THE TELL — alternative records of a SINGLE underlying occurrence (their records may coexist) are one fact → `defined as`; SEPARATE independently-occurring events are distinct criteria → decision structure. Criteria that route to DIFFERENT consequences MUST be separate `when` nodes; a conjunction sharing ONE consequence is a compound branch guard (or a `criterion`). Distinct criteria are NEVER fused into a `defined as`/`sem-*` composite (see decision-composition). `defined as` at the concept level normalizes ONE concept\'s representations.',
    verification: "cre-run",
    source: CRITERIA_DECISION_REFERENCE_CRL,
  },
  {
    name: "criteria-decision-reference.cel",
    language: "cel",
    edge: "prior-auth",
    purpose:
      "Companion cases exercising each decision NODE: criterion-1 node (Has Qualifying Diagnosis), the nested criterion-2 node (the failed-conservative-therapy guard-`or`, resolving on EITHER distinct criterion — drug OR physical therapy), the criterion-3 node (the viral-suppression `defined as`, resolving on EITHER record — lab OR chart note — of the one occurrence, and denying at its `otherwise` when neither is present), and the top-level otherwise.",
    verification: "cre-run",
    source: CRITERIA_DECISION_REFERENCE_CEL,
  },
  {
    name: "pa-determination-reference.crl",
    language: "crl",
    edge: "prior-auth",
    purpose:
      "Canonical PRIOR-AUTHORIZATION exemplar (#134) — distinct from the CDS decision-reference (which ORDERs a service). The payer COMMUNICATES the determination via configured `<category>.<key>` local activities (certify.Approve / not-certify.Deny), validated against crl.dispositions; Pended (A4) is a non-final leaf, legitimate only in embedded mode.",
    verification: "cre-run",
    source: PA_DETERMINATION_REFERENCE_CRL,
  },
  {
    name: "pa-determination-reference.cel",
    language: "cel",
    edge: "prior-auth",
    purpose:
      "Companion cases for the PA exemplar: qualifying diagnosis → certify.Approve; otherwise → not-certify.Deny. The determination activities are local (config-driven, no shared library).",
    verification: "cre-run",
    source: PA_DETERMINATION_REFERENCE_CEL,
  },
  {
    name: "source-delegated-decision-reference.crl",
    language: "crl",
    edge: "prior-auth",
    purpose:
      "Exemplar B — SOURCE-REQUIRED delegation (§2/§5-B): the source NAMES a separate determination, so the policy chains to it with a BARE same-library `use decision`. NOT DRY/reuse factoring — chaining is faithful only because the source draws the boundary. The bare same-library delegation IS evaluated (recursed; the sub determination bubbles up), so the oracle names the DELEGATED disposition, not the sub-decision name. One parent + one delegated sub.",
    verification: "cre-run",
    source: SOURCE_DELEGATED_DECISION_REFERENCE_CRL,
  },
  {
    name: "source-delegated-decision-reference.cel",
    language: "cel",
    edge: "prior-auth",
    purpose:
      "Companion cases for exemplar B: the two delegated-path cases (continuation → the sub's Approve/Deny bubbles up) + the two parent-resolved cases. The kit's unit test asserts the continuation→Deny case's PATH goes through the delegated sub (not the parent `otherwise`) — §4-req1.",
    verification: "cre-run",
    source: SOURCE_DELEGATED_DECISION_REFERENCE_CEL,
  },
  {
    name: "disposition-arbitration-reference.crl",
    language: "crl",
    edge: "prior-auth",
    purpose:
      "Exemplar C — DISPOSITION-ARBITRATION (§5-C / §6). The TEMPTING-but-DON'T-chain case: ONE determination with MANY OVERLAPPING pathways + outcome PRECEDENCE + fall-through, which a KE is tempted to factor into chained sub-decisions — but the source draws no boundary, so it is ONE determination. Faithful form (CRL #224): each pathway a sibling `when` gated on its FULL conjunction as a COMPOUND BRANCH GUARD, the precedence carried by `first:` branch ORDER, the residual by `otherwise` — every criterion a visible guard atom, partial matches fall through (no trap), NO `use decision` and NO `sem-not` inference-layer arbitration. Two denies use DISTINCT activities (Deny vs Deny EIU) so `result is` distinguishes them.",
    verification: "cre-run",
    source: DISPOSITION_ARBITRATION_REFERENCE_CRL,
  },
  {
    name: "disposition-arbitration-reference.cel",
    language: "cel",
    edge: "prior-auth",
    purpose:
      "Companion cases for exemplar C (verified 6/6): each pathway alone (approve), BOTH load-bearing overlap cases (a both-indication patient who fails one pathway still approves via the other — no overlap-pop), within-indication failure (Deny), off-indication (Deny EIU).",
    verification: "cre-run",
    source: DISPOSITION_ARBITRATION_REFERENCE_CEL,
  },
  {
    name: "patient-age-both-rep-reference.crl",
    language: "crl",
    edge: "cpg",
    purpose:
      "The patient-age RECENCY exemplar — a Patient `source representation` with a `value projection is age today … years`, the SOLE sanctioned Stage-1 posrep (see rule patient-age-projection). ONE concept carries BOTH arms: `code is` (the LOCAL age Observation) + the age posrep (a live compute over `Patient.birthDate`) — in the MODEL sense a 2-representation concept (one authored `source representation` + one `code is` producer, NOT two posrep blocks). The Inferred layer recency-merges them (newest of the local `Observation.effective` vs `Patient.meta.lastUpdated` wins; indeterminate → session-fresh local-source wins); `Patient.birthDate` being a genuine clinical record that COMPUTES the age is what earns the projection. The YEARS recency arbitration is engine-verified at `$r5.apply` POINT-IN-TIME (6 cases incl. the indeterminate-recency cell; transfers to this posrep form via T1's byte-identical emit); the recency EXECUTION is not something asserted-only run_decision proves, so no companion CEL. For the STANDALONE (no `code is`) and MONTHS forms — construct- + executed-CQL-verified (#257 T2) — see the `representation-reference` exemplar. `value projection` is age-only; do NOT generalize.",
    verification: "engine-run",
    source: PATIENT_AGE_BOTH_REP_REFERENCE_CRL,
  },
  {
    name: "representation-reference.crl",
    language: "crl",
    edge: "cpg",
    purpose:
      "The v3 concept-model multi-representation exemplar (Mammogram multi-source + BMI cascade + a standalone patient-age projection) — reachable in the payload so a remote-MCP consumer can READ the worked form (a `ref:` path string can't be followed; disc 398 measured a MISSING worked `sem-or` REGENERATING the 'defined-as is boolean' misconception). Teaches: the value-preserving `sem-or` union of two dateTime concepts into a dateTime `Mammogram` (NOT boolean — only `defined as exists` / a top-level `sem-not` are boolean); addressability-split discipline (split a concept into named sub-concepts only when a downstream query must NAME the subset — NOT by provenance alone; contrast `Height`, one posrep, no split); self-describing posreps; the STANDALONE patient-age `value projection` (`age today under 6 months` over `Patient.birthDate` — the one sanctioned in-stage posrep projection, `months` unit #257 T2, no local `code is` so no recency merge; see rule patient-age-projection); and `defined as exists` / `definition is` selection/count/within forms. CAPABILITY PREVIEW, `verification: validate-only` (the ARTIFACT tier — the suite builds + validates it, but does NOT execute it). It PARSES + VALIDATES clean; its constructs are MOSTLY runtime-DEFERRED (the general external posrep #257; `defined as exists` returns run_decision status:error on-path, #270; `definition is` predicates deferred). ONE construct — the patient-age `value projection` — is by contrast runtime-SHIPPED in production (the #257 age slice; construct- + executed-CQL-verified) and IS in-stage authorable; but THIS artifact stays `validate-only` (that projection is not re-verified at `$r5.apply` here). This is a PROOF-axis status; on the AUTHORING-scope axis the EXTERNAL posrep / `defined as exists` / `definition is` constructs are still OUT of Stage-1 (the patient-age `value projection` is the one exception; see `boundary` / `conceptLayerModel` scope) — do NOT copy it as a run_decision-complete Stage-1 artifact.",
    verification: "validate-only",
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
