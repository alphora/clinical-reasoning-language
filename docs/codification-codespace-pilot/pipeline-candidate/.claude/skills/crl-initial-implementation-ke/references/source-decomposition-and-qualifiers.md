# Source decomposition and qualifiers

Reusable customer-neutral source-analysis practice. No individual policy examples or rulings are included. Source authority and the bound method govern interpretation; matched kit clauses govern supported encoding.

## Inspectable rules

State how an interpretation affects the decision tree, question surface or actual behavior. Do not use an invisible convention to settle disputed source meaning. Label behavior-neutral conventions as conventions; expose consequential choices to review.

## Candidate meanings before the tree

Before arranging branches, identify the distinct candidate concepts in the complete source. Record them in the existing source-model.md (or source-notes.md in a bounded tree-only task), alongside source correspondence. This is a short meaning inventory, not upfront CRL implementation or another approval stage. For each candidate, record:

- The fact, state, event or measurement meant, its source span, and applicable qualifiers such as subject, timing, site and threshold.
- Its role: supplied request/data, an independently answerable fact, or an explicitly derived computation. An answerable fact may already be supplied; inventory membership does not require another question.
- Its relationships to other candidates: source AND/OR/NOT, shared qualifiers and reuse of the same fact. Record a named condition group as a relationship over its members, not as an additional respondent attestation.

Keep independently answerable events, states and therapy outcomes separate when their answers or evidence can differ. A shared bullet, sentence, timing qualifier or ultimate outcome does not make them one datum. Combining their question wording into "A or B?" loses the independent answer states; compose their concept references with Boolean operators in a Criterion or Decision instead. In the main eligibility flow, apply the selected depth preference to those same concepts. This is not a requirement to serialize every Boolean expression.

Do not split by nouns, conjunctions or punctuation alone. Synonyms for the same event remain one concept. One event with its timing qualifier, or one measurement with its stated threshold, can remain one meaningful qualified fact. A genuinely source-required holistic judgment can remain an attestation; a list of independently answerable facts is not made holistic merely by naming or wording it as one question. Preserve source-defined same-instance and evidence relationships when decomposing.

### Synthetic example: distinct facts, grouped condition

Source: "Either event A or event B occurred during the specified interval." A and B are distinct events, not synonyms. The candidate inventory contains an occurrence of A during that interval and an occurrence of B during that interval. The time qualifier applies to both; it need not become a separate question. The OR remains visible:

```crl
criterion "Example Event Group":
- when ("Policy Condition A" or "Policy Condition B").
```

Here Policy Condition A and Policy Condition B are separate answer concepts with their respective event meanings. Replacing them with one answer concept named "A Or B" would erase which event was answered. If the same two facts are alternatives in the main eligibility flow, nested branches may reference A and then B, when that better expresses the source and interview. Neither arrangement combines their answer identities. This snippet illustrates composition only; concept definitions and qualification come from the assigned source and matched guide.

### Check the tree against the inventory

After drawing the tree and before freezing it, map every leaf condition to its candidate concept, and expand every named group into its members and operators. Distinguish a negative guard from a new fact: `not A` still refers to A. Request checks and any source-authorized computations have explicit dependencies rather than invented respondent questions. Check the reverse mapping too: every source-required candidate and qualifier must have a justified place in the model or an explicit source/scope reason for exclusion. An invented candidate should be removed, not forced into a question.

Check that translation preserves these identities as well as branch shape. In particular, changing A and B into a single combined answer is a modeling change even when completed answers can give the same outcome. Reconcile a mistaken decomposition through the existing source-model amendment process; do not create another gate or permanent layer of helper concepts.

## Meaningful decomposition

Separate publication type from source-resource type. Current selected answers use Record/Observation, explicit value type and most-recent selection (rule:concept-form.clauses[0], default). The evidence's resource type is not itself a Boolean answer carrier.

Use a transparent Criterion for a distinct policy condition grouping, such as EIU or population applicability, within the responsibilities described in initial-interview.md. A policy-coherent group need not be one medical fact. Strongly prefer depth-oriented Decisions for the base eligibility flow, while allowing Boolean expressions where they preserve clear, faithful reasoning and an acceptable questionnaire tradeoff. Repetition alone does not justify a Criterion; genuinely repeated decision flow can justify a separate Decision. Meaningful single-use Criteria are allowed. Keep distinct obligations, qualifiers and dependencies visible (rule:decision-composition.clauses[0..1], invariant).

A source reference explicitly requiring another section's criteria incorporates those requirements within authorized source scope. Preserve every required obligation in a referenced enumerated table/list; use meaningful answer grains and transparent conjunction. Apply the candidate-meaning boundary above when the source requires a holistic attestation; do not use it to collapse independently answerable members of a criterion set. Distinguish a required criterion set from a reference that only defines one term. Obtain missing necessary referenced material through the source owner.

Keep concept identity and question presentation meaningful to the respondent. Put row/section identifiers in comments and per-item provenance, not in the question. Rule:concept-presentation supplies the supported fields and fallback behavior; read the current contract.

## Qualifiers and conditions

A name is not an operand. When decomposing a condition, enumerate all stated subclauses and locate each in the executable condition. Synthetic example: "established by method M and supported by A and B" requires M as well as A and B. Naming the group "Established By M" does not implement M.

Compare source modifiers against each leaf's meaning and coding separately: population, timing, modality, measurement standard, site, severity, and documented versus present. Check additions as well as omissions. A qualifier in a comment does not make it operative.

A shared gate can carry a qualifier once if it covers every affected route. Do not duplicate the same real-world fact as unlinked answers at multiple levels. Test a route that would bypass the claimed shared gate. Different modifiers among siblings can be legitimate: check against source rather than making them mechanically uniform.

Related labels do not create entailment. Establish the same-fact relationship from source and supported data semantics; do not invent an inference producer or a redundant unanswered gate. A specific-datum-only case can expose a hidden dependence on an unnecessary general datum.

Prove source-required conditions consequential (rule:cel-cases.clauses[0], invariant). A satisfying case plus explicit false/disqualifying data for each conjunct is the clauses[1] default method; equivalent evidence is permitted. Keep omission/unknown cases distinct. Tool success, broad provenance spans and reviewer consensus do not prove complete source meaning.

Read policy-document-structure.md for shared lead-ins, local conjunctions and nested alternatives.
