# Required responses, meaningful groups, and concept identity

Read when the authorized source requires a response before a result or when reviewing Criteria. This is a reusable modeling example, not a declaration that every mentioned field is mandatory. Read the matched kit's `rule:text-answers`, `rule:criterion`, and `rule:review-flags` with their dependencies before using the form.

An answerable clinical condition can be unknown and pause when its required datum is missing. A completion check instead asks whether a response has been supplied, including a valid No or source-authorized Not applicable. Use an uncoded Boolean concept with `definition is "Answer Concept" has a value`. The selected answer concept remains its input dependency, while the helper itself creates no respondent question. Missing selected value produces false; invalid selection can still error. Presence does not establish clinical qualification, nonblank text, or completeness of other records.

Kit 2.35 retains this presence check to selected `Quantity` answers. Zero counts as answered; a missing numeric value or unit-only Quantity does not. The helper treats an extension-only primitive value as absent in source tests; that shape has not been separately qualified in native execution. A number without a valid explicit unit is a validation error, not an unanswered gate. Guard the result continuation when the source requires a count. Keep optional counts and rates outside the completion gate so blank optional evidence does not block the result. Do not invent a numeric threshold to collect a value. The kit's `numeric-intake-reference.crl` and `.cel` demonstrate optional evidence with the same result on both branches; a required count instead needs one guarded result continuation and no result-producing `otherwise`. The policy source and approved customer rules decide requiredness.

For source-required responses that form one coherent group, combine these helpers in a named Criterion. Guard the result-producing continuation with that Criterion and do **not** add an `otherwise` result for incompleteness. A false completion condition should leave the assessment without a determination while the applicable questions remain available. Do not convert blank to Unmet, add respondent attestation, use repeated `(X or not X)` tautologies, invent `required is true` on Criterion, or edit emitted Questionnaire `required` fields. Test this false/no-result state natively; it is distinct from a null-condition `pause` assertion in CEL.

Small synthetic fragment, omitting a policy request and actual clinical routing:

```crl
concept "Symptom A Answered":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is "Symptom A" has a value.
- shape reduction is most recent.
concept "Symptom B Answered":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is "Symptom B" has a value.
- shape reduction is most recent.
criterion "Symptom Responses Complete":
- when ("Symptom A Answered" and "Symptom B Answered").
decision "Assessment":
- when "Symptom Responses Complete" then recommend activity "Review".
```

In a real policy, the guarded continuation contains the source's actual result logic, and the Request condition remains first. Requiredness and applicability come from source/customer authority. Exclude optional and inapplicable questions; model conditional requirements only on their applicable routes. Where related subgroups exist, name them. A Criterion must have a coherent responsibility beyond “all questions on the form.” For more than five direct operands, author and judge explicitly check strong alignment; five is a review heuristic, not a language maximum. Keep ordinary progression and outcomes in Decisions. Criterion grouping does not promise visible form sections or question suppression, so verify native and client behavior.

The concept's authored library-qualified name is its CRL identity. Do not add redundant `meta is @id` metadata to every concept. A supplied `@id` can be a stable historical flag anchor; before changing an existing ID, inspect and preserve affected flag references. In this fresh authoring batch the author does not inspect old flags, so the lead handles any such identity reconciliation during delivery. Do not fabricate an ID to imitate an earlier encoding.

For an applicable completion group, test empty, partial, No/Not applicable, complete, changed and cleared answers through native returned Q/QR. Confirm zero determination and zero errors while incomplete, exact source-directed outcome when complete, and correction access. Record any CEL/audit limitation explicitly instead of calling an unsupported false/no-result case a passing null pause.

For numeric intake, include blank required, zero required, cleared required, blank optional and populated-without-unit controls. A blank required value produces no determination through a false completion gate; it is not a CEL null pause. A valid zero permits the source-directed result, clearing it withholds that result again, and a blank optional count/rate leaves the result available. A populated value without a valid unit must error.
