# Kit evidence ledger

## Initial broader audit — 624–639

Source review and the grouped reverse mapping are complete, with explicit evidence limits. All300 originally discovered test files were read, including parameterized rows/helpers;639 adds a producer cleanup suite (301 total). See [reverse-claim-map.md](reverse-claim-map.md) for every substantive payload claim group and [survey-dispositions.md](survey-dispositions.md) for applicable, internal and legacy cases. The machine inventory records source hashes and execution separately.

Source kit1.38 remains unreleased; installed4.123.0/kit1.37 is unchanged. This audit does not recertify native engines, installed clients, rendered questionnaires or clinical fidelity. Those limits are mapped explicitly rather than counted as passing source tests.

The inventory links118 primary test declarations to stable `@kit` claims, plus
four extension-owned assertions. Final639 added40 reviewed declaration tags
across21 files; a byte comparison verified those edits only insert comments.
Parameterized declarations retain their existing rows and evidence limits.
Examples reuse the owning inputs described below; tags do not create a second
behavior suite or turn internal/legacy cases into recommended authoring.

### Final corrections — 639

- Empty disposition options produce a warning and disable disposition checks; corrected rule, all invariant clauses, methodology and model. Owning config/validator tests retain actual input `{ options: {} }` and are tagged.
- Producer cleanup has three new owning filesystem tests: default removal, prune:false retention and failed-removal reporting, preserving unowned types. No production behavior changed.
- Linked TOOLING/USER_GUIDE now describe reproducible dates, shared catalog versions and supported prepared imports accurately. MCP date/capability inputs remain supported; explicit date has precedence.
- Extension-owned opt-in and MV flag gate assertions are linked/tagged separately from the CRL census; source assertion inspection does not claim an installed-client run.

Review638:0 critical,1 important,0 nit; accepted. Review639 first round:0 critical,2 important,0 nit; both accepted and corrected. Final verification and follow-up review recorded below. Native GPT-6 Astra/high, crl-emit-v0.1.0; external unavailable after two624 failures.

Final639 verification: **244 passed,0 failed,0 skipped across10 files**; TypeScript and complete MCP smoke passed in isolation. Native follow-up review found0 critical/important/nit and closed both findings. CPG contentHash remains `ed833359fba7a0efb09af8ddd291c404b5401424bba03873913c8ceb3141e5c9`; PA contentHash is `cb36c1692d48a3300e1aa778c10e1f10892a88ea22ac16da074a647e73e78f6d`. These are payload content hashes, not serialized-file SHA256.

### CQL, FHIR, CRE and reference corrections — 637

Reviews631/633/635/636 accepted25 findings (0 critical,19 important,6 nit).
Code review637 found0 critical,0 important,1 nit; both path-description corrections
were applied. Native GPT-6 Astra/high used crl-emit-v0.1.0; external arm unavailable.

| Claim / consumer | Owning evidence and actual observation | Limit |
|---|---|---|
| MCP emission success / parameters | terminologyIdentifierCollision and emitCQL-parameters CQL suites: non-narrative failure and authored parameter declarations | success is required; returned text is inspectable, not certified |
| MCP FHIR dates / identities / imports | reproDate, closureOrchestrator, membershipPublication, namedAnswerClosure FHIR suites | missing publishable date errors; catalog versions differ; prepared imported bindings resolve. JSON/CQL text, not native |
| dispositions rationale | activity.test.ts and reviewed activity emitter: own because description or name | no automatic concept-meta rationale propagation |
| publication-selection:local-source-tie-preference | validator/publication.test.ts explicit Height local+finite Observation source | new control failed before warning-predicate fix; now no errors/warnings. Selector behavior remains owned by publicationSelection tests |
| value-type repair guidance | lowerLocalCodes, reductionShape and useSiteType owning suites | retain typed refusal without prescribing existence/Scalar migration. Legacy positive shapes remain internal |
| CRE projection / foreign delegation | cre/publication.test.ts off-path failed publication omitted; foreign delegation refused | no authoritative conceptTruth row does not establish pause. Existing supported local delegation/imported operands remain distinct |
| decision-composition:arbitration | shared reference CRL/CEL, eight exact CRE output arrays | new X=false,Y=true,severe=false case denies; deleting severe conjunct fails owning test (637-arbitration-mutation). No native run |
| reference project context | referenceArtifactsEmit: real project validation for every artifact, appropriate PA config including EIU, actual dependency closure | declaration admission/emission distinct from native and clinical fidelity |
| emitted tree failure / output layout | MCP smoke checks no output root on parse failure; CLI paths include src | path equivalence, not byte identity or transactional writes |
| legacy collector order | collectCaseFeatures local/foreign same-name branches in both orders | legacy collector regression, not current imported publication semantics |
| review flags / disposition mode / chaining | existing flag/config/disposition checks and reviewed source | category is not authorization; standalone finality not bypassed by config; shared determination reuse valid, foreign publication delegation limited |

Final latest-per-file validation: **603 passed,0 failed,0 skipped in31 files**.
TypeScript and complete MCP smoke passed. Per-file reports/tested-source hashes
are preserved in637-execution.json and the inventory. Source kit1.38 is unreleased.
Both assembled payloads were reviewed. The subsequent638 reverse map and639 corrections complete the initial grouped survey; release/native gates remain separate.

### Grammar and provenance corrections — 632

Current intent: teach admitted syntax and preserve faithful narrative attribution.
Parser recovery and zero coverage/error counts cannot supply that evidence alone.

| Tag / consumer | Owning evidence | Observation and limit |
|---|---|---|
| `source-representation:field-order` | `ast/tests/concept-body-order-independence.test.ts`; shared `sourceOrderExample.ts` | Complete selected Patient-age declaration prepares without diagnostics; reordered source fields preserve the AST; dedented projection remains in the source; concept-only trailing lines fail. Kit embeds the exact declaration. No native execution claim |
| `library-scoping:declaration-syntax` | `ast/tests/library-and-include-structure.test.ts` | Required library, rejected library/include version clauses; include negative has a valid required library so the rejection is specific. Existing ordering cases own header/include structure |
| Positive syntax evidence | `ast/tests/parseInput.ts` and builder positive-fixture tests | Rejects lexer/parser diagnostics before building. Two malformed inputs prove the helper catches recovery.27 previously recovered fixtures repaired; this does not validate their legacy semantics |
| `provenance-source:excluded-text` | `provenance/tests/canonicalize.test.ts`, footnote criterion input | Successful canonicalization excludes footnote text and reports excluded-part-text. Source completeness requires reviewing that warning; source-fidelity adjudication remains manual |
| `provenance-source:coverage-is-not-fidelity` | `provenance/tests/generate-loop.test.ts`, intentionally incorrect20-byte source span plus ignored denial | Coverage clears but item-text-drift error and waiver-ignored-span review remain, including after merge. This is an explicit counterexample, not a positive attribution recipe |
| Correspondence eligibility / verification note and MCP | `provenance/tests/correspondenceCheck.test.ts`, `generate-disposition-path.test.ts`; reviewed production branches | Frozen identity and grounded produced paths required. Pauses/no-produced-action and unfrozen cases remain unchecked; full gate can fail. Existing legacy fixtures establish provenance mechanics, not clinical or native correctness |
| Waiver priority / worklist severity / judge and MCP | `provenance/tests/validators.test.ts`; reviewed authoredKind classifier and MN-keyword severity branches | Routine labels are hints; manual-review/warning do not fail the error count but retain review obligations. Truth of the waiver label is manual evidence |
| Derived-from enforcement / verification note | `provenance/tests/derivedFromResolution.test.ts`, `derivedFromPolicy.ts` | Enforced state is true; transition-window teaching removed. Source integrity is distinct from source fidelity |

Read-only reviews629/630 accepted all12 findings. Corrected44-distinct-file run had
916pass/3fail/9skip; stale ValueSet expectation and two payload-pin failures were
fixed, then112pass/0fail/5skip in affected builder/library/kit follow-up. TypeScript
build and complete MCP smoke passed. Final latest-per-file results: 44 files, 921 passed, 0 failed, 9 skipped;
source hashes and individual reports are recorded in632-execution.json; no installed or native-engine result is claimed. Broader
mapping and remaining test survey are still prerequisites to release.

### CEL and library scope corrections — 628

Intent: current selected answers retain unknown; resource identity is distinct
from answer value. Logical declaration scope must be explicit to an AI author.
Plan review627 and CEL audit626 accepted these corrections; code review628 tracks
final verification. Source kit1.38 remains unreleased.

| Tag / consumer | Exact owning evidence and input | Observation and limits |
|---|---|---|
| `cel-cases:nonmember-warning` | CEL `localMembershipWarning.test.ts`, warning-not-error case, membership CEL fixture | Well-formed wrong local codes warn and remain authorable; diagnostic explicitly avoids false-answer teaching. The legacy fixture's outcome expectations are not asserted here |
| `cel-cases:authored-nonmember-preserved`, `:malformed-code-rejected` | CEL `derive-local.test.ts`, authored-code mutation and empty-code mutation of DME input | Authored valid coding appears in emitted data; malformed token produces error and no matching resource. These are coding/diagnostic assertions, not native outcomes |
| `cel-identity:repeated-reference`, `:patient-exception`, `:ambient-encounter`, `:normalized-collision`, `:cross-case-reuse`, `:distinct-instances` | CEL `identityDiagnostics.test.ts`; `graphFrom`/`fact` and exact named cases | Changed date/intent does not create new identity; repeated Patient refs emit one Patient; Encounter/normalized collisions diagnosed; reused fact in two cases has different ids; two separately named instances produce two ServiceRequests. Other identity diagnostic helpers do not prove whole clinical validity |
| `cel-quantity:unit-required`, `:unit-bearing-literal`, `:nonempty-unit` | CEL `numericValueRules.test.ts`; shared `quantityExample.ts` declaration/fact plus owning context | Missing/blank unit errors;90 'kg' avoids numeric-shape errors. Kit embeds exact declaration and fact excerpt; policy adds library L. Existing kit gate validates the declaration. Integer/coded legacy companion declarations are not delivered examples. This is not UCUM validation, dimensional compatibility, full CEL validation or native BMI evidence |
| `library-scoping:package-discovery`, `:project-boundary` | `imports/tests/registry.test.ts`; four new manifest/location rows and existing nested-package row | Top-level plain/scoped `crl.libraries` packages discovered; missing manifest and nested node_modules not discovered; nested package excluded from parent project. Registry evidence, not execution |
| `library-scoping:explicit-package-priority`, `:implicit-local-priority`, `:package-visibility`, `:aliases-unsupported`, `:package-owner-isolation` | `imports/tests/preparePublicationContext.test.ts`; matching named cases and generated package/local fixtures | Asserts actual owner/origin or unresolved/visibility diagnostics. Same-name package/local shadows are boundaries to avoid, not recommended architecture. No native execution |
| `library-scoping:criterion-local` | `imports/tests/criterionMultifile.test.ts`, qualified criterion misuse fixture | Known foreign local criterion yields criterion-misuse; does not require an external-package include. Concept/criterion name collisions have both ordering rows in the same file |
| `cel-cases` omission boundary / MCP `run_decision` | Existing `cre/tests/publication.test.ts`, determinate disjunction versus ordered unknown branch | OR true/unknown can approve; earlier unknown ordered branch pauses. Already mapped under guard-or-vs-sibling-or. No duplicate kit truth-table suite added |

Library-scope example reuses the existing exact `answerExample.ts` library/terms
closure with the imported-answer owning test; it does not purport to demonstrate
package installation. Package boundaries are diagnostics guidance backed by the
owning generated fixtures. Native outcomes, human policy fidelity and deployed
client behavior are outside this batch's evidence.

MCP partial-emission description is supported by inspection of `emitFhir.ts`:
failed derive returns no resource while the caller continues collecting other
resources. The identity suite tests skipped-reference diagnostic handling, not
every possible partial-emission cause. This is source-reviewed behavior with a
remaining exact owning-assertion gap; do not label it native or fully verified.

Baseline 60e0cd0c; source kit 1.38 remains unreleased. The initial discovery now
includes **300 tracked test files**, including CLI and native checker tests.
[test-survey.md](test-survey.md) and [test-inventory.json](test-inventory.json)
record discovered declarations, source hashes, runner membership and unreviewed
areas. This is discovery, not a completed semantic census. Parameter tables,
helper assertions and documented native entry points still need explicit review.
Inspection and execution are separate: a native test skipped for a missing jar
does not gain runtime evidence from its passing registration sibling.

### First corrected claims

Current intent: independent final selection after producer-owned operations,
preserve selected false/unknown, explicit equal-time policy, and classify a
selected coded answer. Basis: north star assembly model, operator's pattern-owned
behavior clarification, and the #320 selection/membership contracts tested below.

| Tag / kit consumer | Actual input and owning assertion | Evidence and limits |
|---|---|---|
| `concept-form:publication-admission` / typeAllowlist | `emit/tests/publicationProgram.test.ts`: “refuses unsupported %s”; Scalar, Condition, string, empty producer and legacy selector mutations of explicit Answer | No descriptor, one error, lookup fails. Grammar vocabulary is not an execution allowlist. This kit's selected concepts recommend Observation; Patient/ServiceRequest are source types. Other supported Quantity/coded/age forms retain their separate evidence |
| `publication-selection:syntax` | `ast/tests/shape-reduction.test.ts`: plain selector and authored prefer-local tests; exact `line`/body strings | AST has equalTime `error` or authored `preferLocal`; syntax only |
| `publication-selection:newest-value` | `cre/tests/publication.test.ts`: “newer false wins independent of order”; both reference orders | Selects New and produces Deny. `selectionExample.ts` holds the actual policy, decision, fact and CEL builders. The delivered CRL/CEL pair is exactly the non-reversed test input; the generic kit gate also executes it. CRE, not native `$apply` |
| `publication-selection:newest-unknown` | Same file: “newer unknown displaces old true”; dated Old/New facts | No activity, blockedUnknown true, selected fact New, emitted newer Observation lacks valueBoolean. The test deliberately supplies Deny as an unmet oracle; that oracle is not taught as the expected outcome |
| `publication-selection:single-undated` | `emit/tests/publicationSelection.test.ts`: “selects one undated %s record”; false and unknown resources | Exact resource retained for both rows; pure selector evidence |
| `publication-selection:equal-time-error` | Same file: “does not merge equal-time records…”; agreeing/disagreeing values and every order | `publication-ambiguous-selection`, not a value merge |
| `publication-selection:local-tie-only` | Same file: authored local preference, older-local/newer-source, and multiple maximal locals tests | Unique local wins at equal latest time; newer source wins over older local; two latest locals still fail. Each helper checks permutations |
| `publication-selection:incomparable-validity` | Same file: “does not treat %s versus %s as an equal-time tie”; calendar overlap plus unsupported comparison rows | Fails as incomparable, not a tie. These unit rows do not establish arbitrary precision support |
| `publication-selection:undated-competition` | Same file: three undated competition/repair tests | Additional dated answer cannot repair undated competition; correcting actual validity can |
| `publication-selection:invalid-input` | Same file: malformed validity table and repeated contributor/input identity table | Invalid input fails even when another row is newer; duplicate identity is scoped to a contributor. Same input in different contributors remains distinct (separate existing tests), not blanket deduplication |
| `named-answer-options:domain-coding` | `emit/tests/publicationMembership.test.ts`: “ignores foreign/display/version codings…”; both coding orders | Recognized yes plus foreign no remains true; adding recognized no errors; no domain coding errors. Display/version do not decide membership |
| `named-answer-options:selected-record-only` | Same file: “does not interpret an older losing value”; older unrecognized and newer yes | Selects newer yes, then produces true. Does not excuse malformed carrier/identity/validity |
| `produce-results:generated-is-not-an-outcome-oracle`, `:case-states` | `results/tests/runProducer.test.ts`: synthetic clean Questionnaire and each non-generated state | `generated` classifies returned form presence; no activity assertion. Non-generated cases carry reasons. Synthetic classification does not prove native behavior |
| `produce-results:mv-pair-normalization` | `results/tests/persistedPair.test.ts`: “drops QuestionnaireResponse.authored…” | Written MV pair lacks run-authored time; do not treat it as a complete interactive request. No client interaction is executed by this unit test |
| `review-flags:phase-vocabulary`, `:required-direction`, `:optional-issue-reference` | `flags/tests/flagVocab.test.ts`: complete tag/category table, missing direction failure, all eight optional-ref rows | Four extraction tags and four validation types; fidelity-defect requires direction, issue ref is optional. Phase is distinct from actor identity per flagVocab's workflow contract. Preservation and authority to judge customer intent are manual workflow requirements, not conclusions from these tests |
| `review-flags:gap-pointer-required-reference` | `validator/tests/metaTag.test.ts`: missing `@gap-filed` ref errors | Filtered metadata diagnostic only; legacy fixture is not a positive selected-concept example. The delivered Renal Function gap-pointer snippet is validated by the existing kit example gate |

Removed four duplicated flag/metadata behavior checks from the kit suite. Negative
direction and gap-reference assertions already belong to the flag and metadata
validator suites. The optional-ref check moved to the flag suite and now validates
all eight types both with and without ref rather than merely inspecting five registry entries. Positive
gap-pointer authoring remains covered by the delivered-example validation gate.

Validation of this slice: isolated released emitter plus audit changes; TypeScript
build and 495 tests across 24 files passed, plus the complete MCP smoke. Review625
found and closed two gaps: share the concrete selection case as well as its builders,
and test optional references both present and absent. The affected209 tests across4
files passed afterward; delivered kit hashes were unchanged by those fixes. Exact
per-case outputs: tmp/625-vitest.json and tmp/625-followup-vitest.json; MCP log:
tmp/625-mcp.log. Native review converged; external review was unavailable after
two internal errors. No fresh native execution is claimed. The
optional native selector test requires CRL_PUBLICATION_CQL_ENGINE_JAR and its
matching driver configuration; it was not included in this command. The results
orphan symlink test can return early when the OS refuses symlink creation, so its
passing status alone is not proof that symlink rejection executed.

Further inspected areas have candidate mappings, not completed coverage:
ServiceRequest and Quantity source bounds; import visibility; all results tests;
flag workflow vocabulary; native checker false-positive defenses. The remaining
survey must cover both complete payloads and all applicable tests before release.

## Earlier correction evidence

Initial adoption of `crl-kit-update`, 2026-09-08. Diff baseline: CRL v4.123.0,
`8f62a14a99aa3823fc3c54fb47a2d5fa4009604c`. Current audit covers the kit correction
and shared answer example in this change. **The complete CRL test census is not
finished.** Inventory command `rg --files packages/crl -g '*test.ts' -g '*spec.ts'
-g '!node_modules' -g '!dist'` found 294 TypeScript test files. CLI .mjs tests and native acceptance harnesses
are additional inventory work; this is a file count, not a count
of reviewed cases or assertions. Untagged tests remain unreviewed, not excluded.

Intent basis: operator instructions for named ValueSet answer bindings, optional
negative exceptions with warning, presentation separate from concept identity,
null-preserving decisions and native `$apply` as execution authority;
`docs/named-answer-valuesets-and-presentation.md`, `docs/CRL-NORTH-STAR.md`.
Existing tests are measured evidence and are subject to correction.

Paths below are relative to `packages/crl/src`. Each `@kit` tag points to the
owning behavioral test, not a duplicate kit implementation.

| Claim | Owning test and actual input | Asserted observation / limit | Kit consumers | Status |
|---|---|---|---|---|
| `named-answer-options:finite-domain` | `validator/tests/namedAnswerOptions.test.ts`, “accepts a finite named answer domain without per-code positive markers”; `question()` | No answer-options diagnostics for the finite list and negative exception. This test filters to that diagnostic family; it does not establish complete validation or execution. | named-answer-options; pa-answers-not-records | Verified bounded assertion |
| `named-answer-options:all-qualifying-warning` | Same file, “warns without failing when no negatives are declared, even without a consumer”; `question("")` | No answer-options error; `answer-options-all-qualifying` warning. | named-answer-options | Verified bounded assertion |
| `named-answer-options:retired-syntax` | Same file, “removes inline answer lists and the former named spelling”; mutations of `question()` | Both removed spellings fail building. Invalid inputs are rejection examples, never positive teaching. | named-answer-options; pa-answers-not-records | Verified bounded assertion |
| `named-answer-options:imported-classification` | `fhir-emitter/tests/namedAnswerClosure.test.ts`, “uses an imported answer vocabulary in CQL, FHIR, CEL and CRE (publication=%s)”; `authoring-kit/answerExample.ts`, `source(true)` and legacy mutation | CQL emits with classification refusal, FHIR has the offered systems and owned code, CEL resolves positive/negative codings, CRE produces Met/Unmet/pause. Only the `true` row supplies current teaching; the legacy row is not a recommended publication form. No native `$apply` execution in this test. | named-answer-options; named-answer-reference CRL/CEL and terminology dependency | Verified bounded assertion |
| `concept-presentation:emitted-text` | Same owning test/input; presentation in `answerExampleSource()` | Decision input contains authored text and description extensions. Does not prove native display of description. | concept-presentation; named-answer reference | Verified bounded assertion |
| `concept-presentation:overlap` | `emit/tests/presentation.test.ts`, “rejects overlapping decision and criterion contexts even inside one declaration”; `head + base + scoped declaration` | `presentation-overlap` diagnostic, including one declaration whose selectors overlap. This row does not certify co-occurring fallback-wording comparison; that claim also relies on the linked presentation design and emitter source inspection. | concept-presentation | Verified bounded assertion |
| `branch-guards:whole-publication-expression` | `fhir-emitter/tests/membershipPublication.test.ts`, “preserves a whole publication condition and its inputs: %s”; three guard rows and their fixture/config | One `text/cql-expression` condition, no Coalesce, two dependency inputs; tests direct publication and traversal through a criterion. FHIR structure only; does not prove native pause. | branch-guards; criterion; decision-composition; docs/decision-shapes.md | Verified bounded assertion |
| `branch-guards:priority-exclusion` | Same file, “preserves the same compound failure boundary in first priority exclusions”; selected Photo/Answer fixture | Successor exclusion is `not (<whole prior expression>)`. FHIR structure, not native execution. | branch-guards; docs/decision-shapes.md | Verified bounded assertion |
| `guard-or-vs-sibling-or:unknown-order` | `cre/tests/publication.test.ts`, “distinguishes a determinate disjunction from an earlier unknown ordered branch”; Answer missing, Other true | Combined OR produces Approve; ordered sibling guards produce no activity and mark the first branch blockedUnknown. CRE evidence, not a native run. | guard-or-vs-sibling-or; docs/decision-shapes.md | Verified bounded assertion |
| `guards:publication-boundary` | `cre/tests/publication.test.ts`, “makes the same-library publication activation boundary explicit (publication=%s)”; legacy + optional unused publication | Missing legacy action guard yields error/no activities with a publication, but legacy no-publication case yields Deny. This is a limitation, not desired semantics or a pattern to copy. | guards; docs/decision-shapes.md | Verified bounded assertion |
| `cel-cases:missing-local-membership` | `cre/tests/localMembership.test.ts`, “an AUTHORED-code local fact with no derivable base fails the run LOUD…” and “a BARE local fact in a real project with no base ALSO fails loud…”; existing fixtures/helpers | Both fail loudly; no name-based fallback for these local-code inputs. Does not claim every non-local form checks membership. | cel-cases; verifyLoop; MCP descriptions; north star | Verified bounded assertion |
| `branch-guards:publication-error-boundary` | `cre/tests/publication.test.ts`, “keeps a true OR sibling from masking an evaluated operand failure” and “does not cross a failed first: prerequisite to a later true activity or otherwise”; existing ambiguous-selection inputs | An evaluated error is not hidden by a true alternative or later branch; distinct from an unknown pause. CRE evidence only. | branch-guards | Verified bounded assertion |

## Example synchronization

`answerExample.ts` contains pure CRL/CEL fixture data and the source builder;
the owning behavior test and kit assembly import it directly. The delivered
example is exactly the publication=true input, its imported terminology and
its CEL including a missing-answer pause. `ANSWER_EXAMPLE_BASE` is required project context. Editing the shared
input changes what the behavior test executes; no second copy is maintained.
The kit/reference packaging suite separately verifies the delivered closure.

The mixed mammography/representation preview is withdrawn from the kit. Its old
fixture remains a legacy validator regression, not a recommended example. The
supported BMI/threshold and uncoded-age declarations now live in the shared
`PUBLICATION_REFERENCE_CRL` constant, with synthetic decisions keeping those
dependencies in the emitted closure. The kit's emission gate executes that exact
source; it does not claim whole-artifact native execution. Missing presentations
remain legal warning/fallback examples, not proof of authored question wording.

## Scalar teaching correction (review 622)

Scope: both payloads, all positive CRL examples/reference artifacts, affected
normative/judge text, and active charter wording. Compiler Scalar/default paths
remain #320 retirement debt. RecordSet history, arbitrary composition/collection
operations and publication action-menu guards are not replaced by this kit edit.

| Tag | Shared input / owning assertion | Bounded claim |
| --- | --- | --- |
| `concept-form:local-answer-pause` | `PA_DETERMINATION_REFERENCE_CRL/CEL`; kit CRE test asserts all three cases pass | Explicit true approves, false denies, missing predicts pause |
| `chaining-necessity:local-delegation-pause` | `SOURCE_DELEGATED_DECISION_REFERENCE_CRL/CEL`; five CRE cases plus delegated-Deny trace assertions | Bare same-library delegation preserves its path and unknown-input pause prediction; no foreign-delegation claim |
| `decision-composition:arbitration` | `DISPOSITION_ARBITRATION_REFERENCE_CRL/CEL`; eight cases with exact outputs for every case | Explicit negatives in both overlap cases, false-dominant conjunction with other inputs absent, and wholly missing input; CRE only |
| `bmi-publication:kit-finite-source-and-missing` | `cql-emitter/tests/bmiRetirement.test.ts`; extracts actual terms/BMI concepts from `PUBLICATION_REFERENCE_CRL` | CQL/FHIR emission and three CRE outcomes: high BMI approves, a newer lower weight denies, missing height pauses. Existing subsection hash is unchanged; historical native evidence is not a fresh run. |

All source constants are consumed directly by the delivered kit and the owning
tests. The admission gate is a packaging check using `publicationAdmissionReason`;
it rejects omitted shape, explicit Scalar and a Record marker without reduction.
It does not substitute for running the examples. Every remaining CRL reference
must validate and emit without an exemption. Withdrawn delivery tests and reasons
are recorded in discussion 622; compiler regression tests were not deleted.

The revised inputs pass all 81 kit checks and the complete MCP smoke in the isolated checkout. The three migrated companions pass 15 cases, and every remaining CRL artifact emits. After the exact-output assertion fix, all 55 checks in the affected kit suite pass; the 22 BMI retirement checks also pass with the renamed shared reference and unchanged native-evidence hash. Discussion 623 records commands and source hashes. Prior 621 counts below describe the earlier revision only.

## Manual evidence and remaining work

- Genuine shared determination versus independent lookalikes: manual source and
  ownership adjudication. `chaining-necessity` and its judge must agree; no test
  can establish that two customers mean the same clinical rule.
- Initial channel survey found and corrected stale selected-shape/source scope,
  PA inline answers, action-guard assumptions, compound-emission generalizations,
  CRE fallback wording and completion-versus-pause language. Both assembled use
  cases and the MCP description copies are in scope.
- Historical621 census work is completed by the301-file inventory and reverse map above. Manual clinical/source fidelity and explicitly listed native/installed gaps remain obligations; this is not comprehensive runtime certification.
- A wording/hash/synchronization test is packaging evidence, not behavioral
  evidence. Historical engine stamps are not fresh native execution.

Verification: isolated checkout of the diff baseline plus this kit patch, with
`fhir-emitter/decision.ts` unchanged (Git blob
`60eef8f6801ad438a407dbbed63a7c45cdb410f5`). Core build passed; 360 tests in
10 targeted files passed; the complete `run-mcp-server.test.mjs` smoke passed.
The targeted files are the kit suites and the owning suites listed above, plus
`fhir-emitter/tests/decision.test.ts` and `selectedPublication.test.ts`.
Initial main-checkout results included unrelated paused599 emitter work and are
not used for these verified labels. No fresh native engine run is claimed.
After the final verification-legend correction, the 109 affected kit/example
checks and MCP smoke passed again. Commands and logs are recorded in discussion 621. Refresh this ledger's evidence when a mapped assertion, input,
configuration or intended behavior changes; do not retain a verified label on
an invalidated mapping. Source kit 1.38 is unreleased until the release gates run.
