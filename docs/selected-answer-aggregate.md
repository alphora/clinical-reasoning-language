# Selected-answer aggregate membership

This calculation interprets selected answers, independently of the clinical condition that uses them.

```crl
concept "Route Answers Flagged":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is any of "Answer A" and "Answer B" in "Flagged Answers" using validity of "Answer A".
- shape reduction is most recent.
```

Ordinary `any of` lists two or more distinct selected Record/Observation/CodeableConcept operands. `any available value of` accepts one or more. Each operand must declare a finite interpreted value domain. The finite predicate terminology must be contained in every operand's domain. The explicit validity anchor must resolve to a listed operand. Qualified references retain their declaring library's identity.

Every selected operand is interpreted before reducing the result. Any member gives true; all selected, interpretable nonmembers give false; otherwise the result is null. A selected record without a value is unknown, as is a missing selected record. Selection errors, uninterpretable values and contradictory recognized codings remain errors even beside a true member.

The producer constructs one ephemeral Boolean Observation, including for a null result. It inherits only the anchor's actual optional validity; it invents no timestamp. Candidate identity includes ordered input identities/missing states. Valid selected Observation IDs provide derivedFrom references. The independent most-recent selector arbitrates any coded local contribution normally.

Omit `code is` for a calculation that must not become an editable question. Enumerate the answers the quality rule is intended to inspect. Use `any available value of` when only currently present answers matter, including answers to other alternatives if any present uncertainty must prevent Met. Use ordinary `any of` when missing operands must leave the result unknown. These calculations do not implement interview history, QR pruning, or session state. Native extraction produces the resources evaluated by the policy from the client's current response.

The explicit `any available value of` form uses the same operand list, target terminology and validity anchor, but ignores absent or selected valueless operands. Its empty available set returns false. Errors still propagate, including beside a positive member. This describes only the enumerated available values; it does not make required unanswered questions false or prove evidence completeness. Keep required-input prerequisites separate from a terminal check over available answers.

A single-answer check can state `definition is any available value of "A" in "Affirmative Answers" using validity of "A"`. A negative witness must check an explicit negative-answer terminology separately. Negating the positive check would incorrectly classify an absent or cleared answer as negative. Both positive and negative available-value checks return false for absence. Prospective questions still use their original answerable concepts.

Available-value membership contributes no questionnaire inputs for its operands. Their computation, profiles and extraction definitions remain available; an operand reached independently by the decision still becomes a question normally. A coded aggregate retains its own answer slot. Ordinary `any of` continues to gather its answerable operands.

The bundled authoring kit teaches both operations under `selected-answer-aggregate`. Verify each policy's route scope, missing-input behavior and native execution independently. Source tests, installed tooling checks and customer-policy acceptance establish different things.

## Worked uncertainty example

Retrieve `rule:selected-answer-aggregate` with `authoring_kit` to get the complete
`uncertainty-reference.crl` and `.cel` pair and its package configuration. The same
CRL/CEL strings are compiled and executed by the kit tests; source lives in
`packages/crl/src/authoring-kit/uncertaintyExample.ts`.

This is a synthetic eligibility slice, beginning **after request applicability
and any EIU assessment**. It is not a medical policy or a required structure for
all policies. Its interview order is: G prerequisite, then A, then B only if A
is negative. Each successful alternative reaches an uncertainty check just
before Met. An unanswered reached G, A or B pauses. In particular, A absent/B
supplied Yes still pauses at A in this ordered example; a grouped OR has different
missing-input semantics.

All three questions offer Yes, No, Uncertain - assume Yes and Uncertain - assume
No. Their qualification exceptions are No and Uncertain - assume No, so each
clinical guard follows the selected direction. An explicitly enumerated terminal
check inspects G, A and B for **both** uncertainty codes:

A decision guard reads an answer's Boolean qualification; available-value membership
reads its selected answer coding. Thus `uncertain-yes` qualifies as Yes for routing
and remains a member of the uncertainty terminology for the terminal check.

```crl
concept "Current G A B Answers Include Uncertainty":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is any available value of "G" and "A" and "B" in "Uncertain Answers" using validity of "G".
- shape reduction is most recent.
```

The complete reference defines those question concepts and both terminologies.
The uncertain codes belong to every operand's finite domain. G is the explicit
validity anchor; the producer inherits its actual optional validity, not an
invented evaluation timestamp. The concept has no `code is`, so it is not an
editable answer. The **available-value operation** prevents operand questions
from being requested through the check. Omitting `code is` alone does not do that.

The example consumes this uncoded result directly, with no competing candidate;
the outcomes do not test recency. In a publication with competing candidates, the
authored validity anchor affects selection. It is not inferred as the date of the
latest contributing answer. The owning aggregate tests separately cover validity.

An unknown reached condition pauses its `first` block: `otherwise` does not bypass
it. In particular, missing G does not enter the alternatives branch.

| Current answers, G = Yes unless stated | Result | Why |
| --- | --- | --- |
| G absent | Pause | The required prerequisite is unknown |
| G = Uncertain - assume No | Unmet | The negative route ends before an uncertainty check |
| G = Uncertain - assume Yes; A = Yes | Unmet | G permits the route, then its uncertainty prevents Met |
| A = Yes; B absent | Met | B is unused and the uncertainty check does not ask it |
| A = Uncertain - assume Yes; B absent | Unmet | A reaches otherwise-Met, then uncertainty redirects it |
| A = Uncertain - assume No; B absent | Pause | A follows No, so B must be answered before the terminal check |
| A = Yes; B = either uncertainty choice | Unmet | Retained uncertainty on unused B still counts |
| A = Yes; B = No | Met | A supplied definite answer on unused B adds no uncertainty |
| A absent; B = Yes | Pause | This ordered interview still requires A first |
| A = No; B absent | Pause | Eligibility requires B; the uncertainty check is not reached |
| A = No; B = Yes | Met | B establishes the second eligibility alternative |
| A = Uncertain - assume No; B = Yes | Unmet | A follows No, B qualifies, then A's uncertainty counts |
| A = No; B = Uncertain - assume No | Unmet | B's negative route ends before an uncertainty check |

The route explanations follow the authored decision. Outcomes and question sets
alone do not distinguish B's direct Unmet route from an uncertainty-redirected Unmet;
both produce the same result and form.

A supplied false or uncertain code is a value; absence is not an implicit No.
The assumed direction controls routing; it does not authorize Met despite uncertainty.
Invalid or conflicting supplied codings are errors, even if another operand is
uncertain. Ordinary `any of` is unsuitable for this terminal check because a
missing operand can keep its result unknown and request that operand's question.

When editing the current response, replacing or clearing an uncertain answer
changes what the computation sees on the next apply. No permanent uncertainty
flag or answer history is kept. The client retains submitted answered questions
for editing after completion; it does not restore answers that were cleared or
pruned before submission. Native form membership and this edit/clear behavior
must be checked separately from the CEL outcome predictions.

The computation reads the data submitted to this apply, not a hidden interview
history. A caller supplying uncertain B can receive Unmet with no native B
question; the caller must provide a way to inspect/edit that supplied answer.
The extension retains submitted Q/QR answers, but `applySession` itself is a
stateless engine call and does not provide a UI. Clients submitting different
retained answer sets are submitting different inputs and can get different results.
For persisted answers, replacement/clear must supersede the old selected record
under the ordinary validity rules. Equal-time competitors can cause selection
errors; clearing a QR item does not delete a previously persisted Observation.

When adopting an uncertainty policy, check every otherwise-Met endpoint and its
explicit operand coverage. CRL does not infer this policy requirement or repair
an omitted guard. Ordinary `any of` remains three-state, so including missing
alternative inputs in that operation can prevent convergence at a terminal.

The CEL companion covers valid four-choice routing and absent facts. It does not
simulate an edited QuestionnaireResponse or claim native error/clear coverage.
For adoption, use the kit's `native-apply-session` procedure: submit an uncertain
answer, replace it with Yes, then clear it in the full current Q/QR; inspect the
new activity, retained answer, and required pause. Separately supply an invalid
coding and conflicting qualifying/nonqualifying codings and verify errors with
no recommendation. The owning selected-clear, invalid/conflicting-value and
validity assertions are in `publicationAnyMembership.test.ts`; use the
`native-apply-session` procedure to check the compiled example as well. Changing
the vocabulary also requires reviewing both qualification exceptions and the
uncertainty subset, which are authored independently.
