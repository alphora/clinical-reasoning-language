# Kit evidence ledger

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
| `decision-composition:arbitration` | `DISPOSITION_ARBITRATION_REFERENCE_CRL/CEL`; seven cases with exact outputs for every case | Explicit negatives in both overlap cases, false-dominant conjunction with other inputs absent, and wholly missing input; CRE only |
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
- Remaining census: classify all 294 files, their parameterized cases, applicable
  claims and exclusions; map other kit process rules, type/catalog guidance,
  source-fidelity instructions and examples. No blanket file exclusion has been
  made. The current ledger is not comprehensive certification.
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
