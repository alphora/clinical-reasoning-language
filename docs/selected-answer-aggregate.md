# Selected-answer aggregate membership (development candidate)

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
