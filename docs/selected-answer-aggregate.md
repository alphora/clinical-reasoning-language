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

List two or more distinct selected Record/Observation/CodeableConcept operands. Each must declare a finite interpreted value domain. The finite predicate terminology must be contained in every operand's domain. The explicit validity anchor must resolve to a listed operand. Qualified references retain their declaring library's identity.

Every selected operand is interpreted before reducing the result. Any member gives true; all selected, interpretable nonmembers give false; otherwise the result is null. A selected record without a value is unknown, as is a missing selected record. Selection errors, uninterpretable values and contradictory recognized codings remain errors even beside a true member.

The producer constructs one ephemeral Boolean Observation, including for a null result. It inherits only the anchor's actual optional validity; it invents no timestamp. Candidate identity includes ordered input identities/missing states. Valid selected Observation IDs provide derivedFrom references. The independent most-recent selector arbitrates any coded local contribution normally.

Omit `code is` for a calculation that must not become an editable question. For a terminal answer-quality check, list only the inputs on that route. Distinct incoming routes require their own checks before convergence: including an unvisited alternative can incorrectly introduce unknown or a flagged answer. This calculation does not implement interview history, QR pruning, or session state. The client supplies the current pruned QR; native extraction produces the resources evaluated by the policy.

This is a locally tested development capability. It is not an accepted KE authoring-kit or deployment upgrade. Evidence and review are recorded in discussions866/867 and the bounded reference's native acceptance records.
