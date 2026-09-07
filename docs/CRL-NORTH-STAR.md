# CRL North Star - intent, runtime model, and verification

Status: reconciled target for #320, not a claim of implementation conformance.
Current operator goals govern this document and all prior design agreements.

## 0a. Behavioral goals govern; build debt is not a language rejection

The operator states: "Nothing is a sacred cow" and "I don't want our work to be tainted by mistaking
existing examples as correct." Behavioral goals and current operator decisions govern. Prior design
agreements, charter clauses, fixture syntax, compiler structures, and POC accommodations are revisable.
Changes need an explicit behavioral rationale, not merely convenience or agreement between reviewers.

Establish intended behavior from narrative and clarified requirements before choosing its CRL expression.
Treat existing CRL/CEL, tests, golden files, and examples as unverified inputs. Passing tests establish
only the behavior they actually measure. Inspect old examples for use cases and migration needs;
independently establish their intent before promoting them to teaching or correctness oracles.
This applies to Obese's syntax and Bleph's encoding alike.

Distinguish operator requirements, design proposals, measured behavior, and unresolved interpretations.
An unresolved customer interpretation belongs with the KE/operator. Judge history is background, not
a prerequisite to investigate a concrete behavior. Preserve before-state evidence when revising rules.

A supported target that is not implemented is build debt, not automatically an invalid language form.
Removing a previously supported capability requires an expressible, executable replacement and a
demonstrated content migration. This is sequencing, not a promise of permanent compatibility syntax.

The operator directs complete deprecation of the old ways and states: "KEs should update to the new
as they touch existing." New authoring and teaching use the replacement contract. Existing customer
content migrates when worked on; a bulk rewrite of customer policies is not a prerequisite. Compiler
retirement must provide actionable diagnostics and an executable replacement, not preserve conflicting
semantics as a second supported contract.

## 0. AI authorship and clarity of meaning

CRL makes narrative computable. An AI knowledge-engineering agent expresses narrative intent in CRL,
authors CEL examples, emits executable artifacts, and verifies them with the engine. AI authorship is
primary; human readability is second. Explicit semantics are inexpensive for AI authors. Hidden semantic
choices are costly because both authors and emitter developers can misunderstand them.

The two obligations of #320 are to make the language coherent and sufficiently expressive, and to make
CQL emission express the authored intent completely and correctly. Target-language plumbing belongs in
the compiler. Decisions about meaning must be expressible and understandable at the CRL level.

Blepharoplasty is the primary customer delivery target. It is a real Prior Authorization policy being
worked on by the IEHP KE, within a program of approximately 400 policies (operator, 2026-09-06). Obese is the broader language
target: it exercises combinations of asserted, sourced, and computed contributions beyond the mostly
local PA workflow. PA also exercises Patient and ServiceRequest sourcing. Neither target substitutes
for the other. Correctness includes narrative fidelity, executable logic, and a usable verification flow.

## 1. What CRL and CEL express and emit

CEL may also state an expected execution pause with `result is "Decision" is pause.` This creates
no patient data and adds no policy disposition. CRE checks its own prediction; native `$apply` is
the source of truth for emitted behavior. Each acceptance case needs separate native evidence of
errors, activities and missing/populated answers. Returning no activity does not by itself establish a pause: all-false
conditions can also produce nothing. A green CRE assertion cannot substitute for native execution.

| Language | Meaning | Output |
|---|---|---|
| CRL | Logic and knowledge/structure | CQL plus FHIR definitional resources |
| CEL | Case data | FHIR data resources |

The operator's conceptual mapping for `emit_crl` is decisions to PlanDefinitions, activities to
ActivityDefinitions, concepts to StructureDefinitions, and vocabulary/concepts to CodeSystems and
ValueSets. CQL is embedded in FHIR Library resources, through which `$apply` accesses it. This mapping does not decide every resource eligibility rule. In particular, the treatment
of a computed concept with no persistent representation remains part of the design work.

`emit_cel` produces the data used to test that logic. `$apply` executes the emitted definitions and CQL
against those data. A generated Questionnaire or QuestionnaireResponse proves neither that population
succeeded nor that the policy's expected disposition was reached. Inspect errors, relevant item states,
answers, and the intended decision results separately.

## 2. The local domain is a production analytical identity

Local codes are production analytical identities, not test shims. External terminology adds a source
path; it does not invalidate the local path. An analytical determination is distinct from a medical
record entry. A record's human or external origin alone does not imply precedence. The authored reduction
expresses how competing contributions are resolved. For the proposed recency example, newer evidence
and newer assertions compete symmetrically; ties, absent timestamps, and derived validity need a contract.

For the implemented final publication selector, calendar-only validity and a zoned instant can be
ordered when every possible instant represented by the calendar precision is earlier or later.
Comparison bounds cover the full day/month/year and the allowed timezone range; they never become
clinical timestamps. Overlapping uncertainty remains indeterminate and cannot activate an equal-time
preference. This publication policy does not silently change legacy evaluator comparison contracts.

The local identity expresses an analytical determination without claiming a new medical-record fact.
PA can therefore operate on locally supplied answers while also sourcing Patient and ServiceRequest data.
See `docs/decisions/0001-asserted-vs-sourced-data-model.md` for historical rationale; its particular
mechanisms remain revisable. Neither local nor external origin alone authorizes compiler precedence.

### Case Features and the iterative SDC session

Operator-stated runtime contract (2026-09-06): in workflows using extraction, a concept with `code is`
is a Case Feature: persistable, question-enabled, answer-enabled, and connected through a CPG Case
Feature expression. Persistable means its CQL returns a FHIR resource that can enter a repository;
actual persistence is optional. Its local domain code denotes an analytical determination, not a
chart diagnosis. PlanDefinition/StructureDefinition/Library bindings must support the SDC question,
its population, and extraction into an answer resource. The exact extraction references are an
implementation detail to verify against emitted artifacts, not inferred from the conceptual diagram.

The app configures and supplies runtime data; workflows need not use every arm or identical stores. `$apply`
uses available data to populate questions and progress along the decision path. At a null condition,
the app pauses and presents the needed question at that point, rather than exposing all later questions.
The answer/extraction flow adds a locally coded resource to the evaluation dataset. A client can submit
its updated QuestionnaireResponse to the R4 backport's `$r5.apply` in a request `data` Bundle; the engine
performs extraction before evaluating that same request. A separate client-side `$extract` is not required.
This repeats until the applicable path reaches a leaf activity. Existing values may be defaulted and
changed by the user. Session-only answer resources participate even when never persisted.

The operator's intended recency workflow holds external data stable during the session, so a newer local
answer can win. A later session may retrieve newer external data that wins over a persisted prior answer.
The app owns dataset refresh; authored pattern behavior and selection own arbitration. There is no
universal local-wins rule or universal freshness rule for every computation.

Operator clarification (2026-09-07): "each pattern slash defined arg needs to own its own behavior.
There's no pure default. For age clearly since time has been passing the calculation should always win.
Unless there's an assertion the same day."

For the age-today pattern, today's calculation therefore supersedes an older assertion, while a same-day
assertion takes precedence over that calculation. A Patient record update is not required for age to
change. This is the age pattern's behavioral contract; it is not an origin-based precedence rule for
all concepts. Pattern contracts must expose their temporal and selection behavior to authors and be
implemented consistently in emitted CQL and evaluation. Precise handling of missing calculation inputs,
multiple assertions and calendar boundaries must be specified and tested as part of that implementation.

Age-today authoring now uses explicit `shape is Record`, `type is Observation`, Boolean value type,
one Patient age projection and `shape reduction is most recent`. A local `code is` adds the answer
representation; an uncoded calculation publishes its result without inventing a question or profile.
Implicit/Scalar age-today and `definition is age today` are retired. KEs migrate existing content when
touching it; new authoring uses the replacement. A criterion may negate the selected Boolean value;
publication aliases and concept-space composition remain unsupported and are diagnosed explicitly.
This is an age-specific retirement, not removal of all Scalar declarations or generic recency patterns.

Quantity measurements can use explicit Record/Observation publication with `shape reduction is most recent`.
An Observation source preserves its Quantity and effectiveDateTime while projecting the analytical identity.
A local code adds an answer representation; an uncoded source calculation does not invent a question.
The unary `definition is "Measurement" at least N 'unit'` producer publishes a Boolean Observation and
inherits the selected operand's actual optional validity. No operand produces no candidate; a selected
operand with no numeric value produces an unknown-valued candidate. Final selection remains separate.
Quantity code determines unit identity when present; display unit does not override it. The existing CEL
unit-only representation is supported. Supplied systems must be UCUM with a code; comparator quantities
are not exact measurements. This comparison currently supports m/cm, kg/g and kg/m2, magnitude at most
10^6 and at most eight decimal places, with exact decimal unit-factor comparison. This is a bounded
implementation domain, not a clinical range. It does not recover unsupported lexical precision already
lost in a caller's numeric parsing.

BMI production uses `definition is body mass index of "Weight" and "Height" using validity of "Weight"`.
Both operands must be selected Quantity publications; the validity operand must name one of them.
An absent operand produces no candidate. Two selected records with a missing value produce an unknown
candidate carrying the anchor's actual optional validity. Errors are not hidden by an absent counterpart.
Both operand identities remain computational dependencies; only the named anchor supplies validity.
The independent final selector can select a local, external or calculated BMI candidate.
Current arithmetic admits positive kg/g and m/cm measurements within the comparison input domain.
Height normalized to centimetres admits at most four decimal places, keeping its squared denominator exact.
BMI is emitted in UCUM kg/m2, truncated to eight decimal places with a published-value limit of10^6.
This precision preserves `at least` comparisons against supported thresholds; no four-place rounding occurs.
No timestamp is invented and the producer does not assign a persistence id.

The coded BMI full-QuestionnaireResponse session is **not yet supported end to end**. The current
generated questionnaire/extraction path also turns untouched BMI defaults or blanks into local
Observations with the response timestamp. When Height/Weight are answered in that same response,
the inferred BMI can tie this untouched local candidate. Measurement repair then fails selection.
Uncoded BMI has a passing separate repair/clear control; this does not close coded BMI's own-answer
contract. The response/extraction contract must distinguish untouched fields from intentional
assertions and clears. Dropping valueless records would lose clears; unconditional local preference
could freeze a stale populated BMI. Neither is the correction. Direct-data candidate selection and
arithmetic evidence does not certify this session behavior.
An alternative request shape has a bounded native control: send the full returned Questionnaire with
only explicitly edited response items and their ancestors. Height repair/clear and direct BMI
override/clear each pass this way. Untouched fields are absent from that response, while an explicitly
cleared item is retained without its answer. This is distinct from full-response resubmission; it does
not certify a rendered client or persistence reconciliation.
A separate cumulative developer probe retains successful extracted singleton answers between requests,
replaces only the edited session entry, and preserves earlier values and timestamps. Its invalid-input
control retains the previous successful state. This is client-owned request construction, not automatic
repository merging. Height edits do not renew Weight's authored validity or an existing BMI override;
a later Weight edit can make the calculation newer because Weight is the explicit validity anchor.
A BMI clear contributes a newer unknown and can pause the decision. It does not mean removing the
override to restore calculation. See the [bounded BMI session probe](../packages/crl/test/acceptance/bmi/README.md).
The measurement/comparison prerequisite retains CRE's explicit imported-publication limitation;
cross-library emitted CQL and CRE imports require separate verification and are not interchangeable claims.

Acceptance: partial data pauses before an activity; adding the missing answer reaches the intended
activity; complete data initially reaches the same activity. Verify the visible progression separately
from engine output, and execute the full generated-QuestionnaireResponse edit/resubmit path rather than
substituting manual fact injection or a trimmed one-answer response for that acceptance case.
Exercise local-only data, Patient-derived values with local alternatives (including age), and
ServiceRequest-derived values with local alternatives, with conflicts resolved by authored selection.

Measured CQFramework4.7.0 behavior is recorded in
[discussion559](../.vibe-tools/discussions/559-native-apply-experiment.md). Native extraction exposes
answer resources to CQL for the request without automatically persisting them. Repository and request
retrieves are combined without automatic identity replacement or newest-record selection. This input
plumbing is distinct from CRL's contribution arms. The earlier full Bleph QR experiment exposed blank
service groups becoming affirmative requests, Coding values lost during extraction, and repeated
boolean defaults reaching population. These findings are acceptance defects, not permanent language
rules or requirements to redesign the client's questionnaire workflow. Current migrated Bleph uses
Boolean request determinations and selected answer publication. The2026-09-07 full-response comparison
reproduces Coding loss with the original4.7 engine; the reviewed local4.7 overlay preserves the answers
and supports pause → Met → Unmet → pause on the same emitted artifacts. This is native operation API
evidence, not client rendering or an installed-engine claim. See the separate
[session acceptance contract](../packages/crl/test/acceptance/bleph/README.md#full-questionnaireresponse-session-acceptance).

Operator-accepted absence rule (2026-09-06): missing evidence for an answerable determination leaves it
unknown. False requires an explicit negative answer or a computation that establishes the negative.
Using absence of matching records to establish a negative determination requires an explicit
completeness assumption for the relevant subject, scope, and time. A positive witness does not require
that completeness. Receiving a bundle or omitting a positive assertion does not establish completeness.

Closed-world collection operations remain available. Their scope and absence behavior follow authored
semantics; `Scalar`, `Observation`, `code is`, and `definition is` cannot substitute for a completeness
contract. Uncoded computations can also be unknown when required inputs are missing. Completeness and
answerability are separate: an answer slot allows a person to supply a determination; it does not
establish that retrieved evidence covers the whole question. The language spelling and enforcement of
completeness remain design work, not a capability claimed for 4.121.0.

An unknown matters when needed on the applicable decision path. It does not require every missing
concept to become a question or prevent a result that the authored logic can already determine.
For a calculation with no answer representation, gather its answerable dependencies or obtain the
missing source input. If neither route exists, the workflow has unresolved input that must be exposed;
the emitter cannot fabricate a question or force false to finish. A pause is an intermediate state
before a leaf activity, not a requirement for a new pended disposition in the policy.

## 3. The concept assembly model

The operator's diagram depicts conceptual runtime sourcing, not a classification of FHIR definitions
by assembly stage. Runtime queries retrieve from data stores; codes determine contribution through
the local, external, and inferred (derived) paths. The diagram's FHIR output arrow is a compilation output.

- Asserted contributions use the concept's local code; extracted answers enter this path.
- Source representations retrieve external data; value projections make contributions conform to the concept.
- Definitions and composition contribute calculated or composed results. A producer such as BMI
  consumes Height and Weight, constructs a BMI Case Feature, and adds it to the candidate collection;
  producing that candidate does not select the final BMI.
- Each arm can have its own producers, restrictors, and selectors. Their outputs join one collection.
- A final selector produces the single record when that is the authored publication; arm-local operations
  remain independent (for example max, most recent, and within two weeks before final most recent).
- The resulting concept is available to consumers. The CQL library boxes describe compilation responsibilities.

Projection, derivation, composition, and collection reduction must have distinguishable meanings.
The diagram's derived contribution is not the older rule that definitions mutate the entire collection
step by step. Arm-local pipelines are supported by the target. Their exact scope, including what `this` denotes
in each construct and how stages carry metadata, must be specified before implementation. Do not silently retain the older execution model.

No arbitration or boolean OR-fold may be introduced merely to reconcile contributions. The author
expresses the intended operation; the compiler implements it. Old local-wins tie behavior is an
implementation choice to assess, not the rule for all concepts.

### Behavioral checks

Obese's stated behavior is true -> Approve, false -> Deny, unknown -> no recommendation and gather
answerable inputs. An explicit false is a value; missing input must not manufacture a measurement or
negative determination. A calculation that establishes false can deny without a human asserting it.

Selecting from an empty collection yields no selected value. An explicit closed-world existence test
over a specified empty set returns false about that set. Inferring a broader negative determination
from that nonmatch requires the completeness contract above. A per-record projection has no invocation
when no source record exists. These operations must not acquire the same absence behavior merely
because their spelling contains `exists` or their published value is boolean.

The representation of a computed result without a witness, its validity metadata, and how it participates
in later operations are open. Evaluation time must not silently masquerade as the validity used for
recency arbitration. Separate data validity from evaluation provenance.

The same concept must retain its meaning when consumed directly, by another library, by a composition,
or by a decision. Display decomposition may differ, but must not introduce a different determination.
Stored false values must survive retrieval and round-trip. Coding identity, resource shape, and value
must agree between emitted data and the logic that reads it.

Membership of one explicitly selected datum and existence of any matching member in a collection are
different questions. For the selected-datum question, an interpretable non-member yields false; no
selected datum/value leaves it unknown. A selected non-repair request can establish that this request
is not a repair request; it cannot establish that no repair was requested elsewhere in an open set.
The author must express the intended subject and quantification. Selection cannot silently stand in
for evaluating the whole collection. Membership is not restricted to locally answerable operands.
Unrecognized coding or unavailable terminology resolution must remain distinguishable from established
nonmembership; exact diagnostic/unknown handling is still open. A filtered retrieve followed by
existence cannot substitute for selected-value membership.
Do not collapse unknown operands to false before negation without an explicit semantic basis.
Resource/datum type and the type of a computed result are distinct: existence over Condition records
can produce a boolean without making the records boolean-valued. No particular current spelling is
mandated by these examples.

Whether a determination can be unknown must follow mechanically from the authored semantics in each
evaluation lane, never from an emitter judgment about the clinical situation. Boolean expressions must
be able to use facts computed about collections through an explicit, type-coherent expression; this
does not prescribe a particular composition operator or implicit conversion.

### Decisions still to resolve

- Candidate/value model: the operator proposes replacing Scalars with Observations carrying value and
  metadata; evaluate this with tuples/relations and the current Scalar/Record/RecordSet distinction;
  declared versus derived shape; distinguish absent candidates from candidates with unknown values.
- Named-set scope: the current `this` plus named-set reduction rule (historically attributed to the
  operator, 2026-08-29) is reopened. Specify whether each operation reads its operand alone or also
  the enclosing concept collection; test whether local assertions participate. No silent implicit union.
- Definition/composition scope, operand types, pipelines, and `this`; no existing `defined as` use is
  presumed correct. Preserve independently established capabilities, not necessarily their current syntax.
- Reduction semantics: selecting versus computing; eligibility, duplicate identity, tie-breaks,
  timestamp precision, missing validity, and validity of results derived from multiple inputs.
- Composition/criterion boundary: value semantics, unknown propagation, addressable operands, traces,
  and how consumers expose decomposition. Previous restrictions are proposals to reassess.
- Publication and answerability: when a concept has a persistent answer representation; how computed
  values populate it; how uncoded computed concepts appear without redundant required questions;
  record identity and metadata at the boundary. A boolean and a record carrying a boolean are distinct
  target-language values; changing a library reference alone does not establish a correct population contract.
- Evidence absence, question unknown, boolean composition, and action guards: preserve intended outcomes
  explicitly. The old two-valued action-guard convention and other special cases require assessment;
  neither existing implementation nor an old test makes a convention mandatory for #320.
- Migration and teaching: audit meaning before rewriting examples, validate representative use cases
  before bulk migration, and provide one consistent authoring and runtime contract.

## 4. Emit principles

### 4.0. Semantic explicitness: the emitter-magic test

Does the compiler introduce a decision about CRL meaning that the author could not express or predict?
Target-language plumbing is the compiler's job; hidden choices about selection, absence, value, or
precedence are language defects. Equivalent meanings must not diverge by consumption site.

Supported author-evaluator (CRE) and emitted execution paths must agree on values, unknown states, and
code matching for the same case. Unsupported evaluation must report its limitation explicitly. A
successful CRE run is not evidence that emitted `$apply` agrees, or vice versa.

Preserve the declared resource kind at data boundaries. Do not silently coerce a case-feature to
Observation, manufacture a boolean value for a resource without such a slot, or treat an absent record value as true when the determination reads that value.
When a determination reads presence instead, the language must make that operation explicit; an authored
false value must not silently be discarded as if it meant true. Preserve explicit false. Unsupported resource operations must fail visibly.

Gather and emit the required structure for a valid resource, satisfying its declared constraints.
Current extraction uses fixed/pattern values for some defaults because alternatives failed in measured
engine runs. That workaround does not settle which fields should be answerable with defaults; #290
tracks completeness work. Do not turn an extraction limitation into a permanent authoring restriction. Canonical identity must be explicit and consistent; do not invent a fallback
canonical base. These are behavioral safeguards, not endorsement of every current classifier or test.
See `docs/emit-189-casefeature-completeness.md` for implementation detail to reassess and
`tmp/NOTES-apply-null-behavior.md` for dated engine/$extract evidence. Engine-specific limits, repeating
items, and populated false values need verification against the actual shipped artifacts.

## 5. Scope, maturity, and implementation evidence

The active #189 implementation is mid-refactor. Its code and doctrine comments describe mechanisms to
evaluate, not authority for the target. Continue the large-refactor trust-marker discipline for code changes.
Unsupported behavior must be explicit; successful-looking output is not a substitute for correct execution.

Current resource emission constraints, required FHIR fields, terminology membership, canonical URLs,
and runtime limits still need verification. Reconciliation of the model does not authorize silently
changing those contracts or dropping their tests. Carry relevant behavior into slice acceptance checks,
and record remaining debt with an owner/issue before replacing an implementation.

Bleph's measured evidence is `tmp/320-bleph/BASELINE.md`; `tmp/320-bleph/README.md` describes
the snapshot and validation plan. The source snapshot has a hash manifest.
The #320 scenario draft is `tmp/DESIGN-language-320-obese-contract.md` and the questions are
`tmp/DESIGN-language-open-questions.md`. Historical rationale lives in `docs/_old/` and `tmp/_old/`.
The active work inventory is `tmp/REFACTORS-IN-FORCE.md`; dated measurements are not current capability claims.

Before declaring a customer issue fixed, execute the relevant emitted/installed artifacts and verify
the consumer-visible behavior, including rendered forms when the issue concerns interaction. A source
test, generated-file count, or successful process exit alone is insufficient. #311 is an arbitration
regression within #320; do not bulk-migrate shapes before the replacement semantics are demonstrated.

Known target/implementation divergence belongs to #320, owned by its lead. The older sequential model
spans the shared `packages/crl/src/template-match/resolvePipeline.ts`, validators, CRE, and CQL lowering
in `emitCQL.ts` / `lowerLocalCodes.ts`; `packages/crl/src/cre/tests/pipelineFamily.test.ts` pins examples.
These are representative entry points, not an exhaustive inventory. The replacement must reconcile all
lanes. Existing tests describe behavior rather than settle its correctness.

The 4.121.0 authoring kit (`packages/crl/src/authoring-kit/index.ts`) reports two further CRE limitations:
unknown operands collapsed in composition, and name-based presence fallback when code membership cannot
be resolved. These are recorded implementation debt to verify and eliminate, not target semantics or
new execution findings from this documentation round. Existing QM cases supply capabilities to investigate,
not an obligation to retain `sem-*` operators or their present semantics.

Propagation debt is explicit: generated reviewer agents need supported regeneration and runtime reload;
source catalog quotations in `CRLCommon.cql` and `CaseFeatureCommon.cql`, their golden copies, and authoring
kit references still contain older doctrine. Reconcile these with the implementation/teaching slice before
shipping it. Updating this charter does not update already installed artifacts or certify their behavior.
In 4.121.0, ordinary existence lowering still returns false over an empty retrieve; that measurement
does not certify its use as a broader negative determination. Before migrating such content, establish
the intended scope/completeness, expose changed semantics, and revalidate exact results including unknown.
Neither a green legacy suite nor membership in an allowed disposition set proves that migration correct.

## 6. For reviewers

Review against current operator intent and independently established behavior. Read the before-state
when reviewing deleted rules. Flag concrete lost capabilities or wrong results; do not veto a change
solely because it contradicts an old design, fixture, or this draft. Explain the behavioral basis of
every finding. Distinguish current measurements from targets, and proposals from approved requirements.
Reviewers advise; the lead owns the decisions. No review result proves runtime behavior without execution.

Read this document at round start and give the same current intent to both reviewers. Flag forms that
read the same but execute differently, and meaning discoverable only by reading emitted CQL/FHIR.
Do not import CQL idioms or chart authority as CRL requirements. Section numbers retain their historical
subjects so existing citations can be located; old claims at those citations are not thereby reaffirmed.
