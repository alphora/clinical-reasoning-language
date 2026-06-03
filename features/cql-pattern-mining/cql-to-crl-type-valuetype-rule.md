# CQL → CRL: `type` and `valuetype` assignment rule

**Purpose.** When transforming a CQL `define` (or an existing narrative form of one) into a CRL `concept`, this document is the canonical rule for choosing `type is X.` and `value type is Y.`. Use this as the body of a transformation skill / prompt. The skill should refuse to guess and consult the source CQL when the semantics are ambiguous.

This is intended to outlast the current corpus and survive being lifted into an MCP server later (the "CQL/Narrative → CRL transformer" the user described). Encode every claim here as a checkable step, not a heuristic.

**Design stance (what / how).** CRL is **declarative**: the author states WHAT they're asserting via `type` and `valuetype` declarations. The CQL emitter and runtime handle HOW. The catalog stays a pure narrative-pattern → CQL-function map; it does NOT carry return-semantic metadata. The transformer reasons about semantic intent at transformation time and encodes it in the declaration; the validator's job is then to verify the declaration is consistent with the subject chain (see §7). Catalog-level return-semantic metadata was considered and rejected: it would (a) lock pattern phrases to single intents when the same phrase can legitimately serve different intents in different concepts, (b) duplicate information already present in the CRLPatterns.cql function signatures (todo 5), and (c) introduce a drift surface.

**Note on fuzzy logic.** This is not fuzzy logic in the Zadeh / degrees-of-truth sense. CRL semantics is crisp — boolean predicates are true/false; refinements return concrete lists. The transformer's interpretation of source-CQL intent is heuristic in a colloquial sense (it makes judgment calls), but the OUTPUT it produces is a crisp declaration that the validator checks crisply. Future probabilistic / graded-truth extensions are out of scope for v0.6.

---

## 1. The core rule (read first, internalize before transforming anything)

> **If the CQL define returns a Boolean** → model the CRL concept with `value type is boolean`. The `type` is the target FHIR resource IF that resource has a native boolean value field; otherwise fall back to `Observation`. Concretely: `Observation+boolean` and `QuestionnaireResponse+boolean` are valid (they have `valueBoolean` / `answer.valueBoolean`); `Condition+boolean`, `Encounter+boolean`, `MedicationRequest+boolean`, `Procedure+boolean`, `ServiceRequest+boolean` are NOT (those resources have no boolean value field) — those flip to `Observation+boolean`.
>
> **Otherwise** (the define returns a List of a FHIR resource, or a single FHIR resource) → the `type` is that resource type traced back to its asserted concept, and the `valuetype` is the applicable valuetype for that resource (i.e., whatever the asserted concept declared, OR what its enclosing defined-as chain has declared).

The corrected boolean rule is: `<Resource>+boolean` is valid ONLY when `<Resource>` has a native boolean value field in FHIR. The short list of resources with native boolean values is `Observation` (`valueBoolean`), `QuestionnaireResponse` (`item.answer.valueBoolean`), and a few rare ones (`Consent.policyRule`-adjacent flags, `Coverage` subscriber flags). For every other resource — and for every CRL boolean concept that is a *computed* patient-level predicate rather than a stored boolean value — the declaration is `Observation+boolean`.

This is the single most consequential error to avoid. The original framing "boolean is always Observation+boolean, never inherits" over-stated the rule; the corrected version is more precise but yields the same answer for the cms69/cms22 corpus because every NonObservation resource we use lacks a boolean value field.

**On composition operators (`sem-and`, `sem-or`, `sem-not`):** these are **SEMANTIC composition** operators, not boolean logic. The author declares the resulting concept's `(type, valuetype)`; the sem-* operators describe HOW the meaning is composed (intersection / union / exclusion at the semantic layer); they DO NOT type-check the operands against each other or against the result. Operands of mixed shapes (e.g., one refinement and one boolean) compose legally under an explicit author declaration. The CQL emitter is responsible for bridging operand types to produce the declared result (e.g., wrapping a refinement operand in `exists` when the result is boolean). This is the same "What not How" principle CRL applies elsewhere: authors declare WHAT a concept means; the implementation handles HOW to compute it.

**See [defined-as-is-semantic-composition.md](defined-as-is-semantic-composition.md)** for the full principle, worked examples, and the common mis-readings to avoid. That document is mandatory reading before authoring or auditing any CRL concept with composition bodies.

---

## 2. Step-by-step procedure

Run these steps in order for every concept you produce.

1. **Read the source CQL define** (if available). Look at its return type as ELM would compute it.
   - Returns `Boolean` → boolean shape. Go to step 4.
   - Returns `List<Resource>` or `Resource` → refinement shape. Go to step 3.
   - Returns `DateTime` / `Date` / `Quantity` directly (a singleton value) → value-bearing shape. Note the value's primitive type; go to step 5.

2. **If no source CQL is available**, the narrative form must classify into one of the shapes. Use the **semantic shape catalog** in §3 below. If the pattern is not in the catalog or the call is ambiguous, **stop and ask the operator**. Do not guess — the cost of a wrong guess is silent model corruption that we will spend hours auditing later.

3. **Refinement shape.** Identify the *subject* — the first FHIR-resource-bearing concept ref in the narrative. Trace it back through the chain (`defined as` → `defined as` → `coded from`) until you reach the asserted concept. Then:
   - `type` is the asserted concept's `type`.
   - `valuetype` is the asserted concept's `valuetype` (carried through unchanged — refinement preserves valuetype).

4. **Boolean shape.** Set:
   - `type is Observation.`
   - `value type is boolean.`
   - Do **NOT** inherit the underlying resource type from the subject. The boolean shape is a patient-level observation, not a refined view of the subject's FHIR resource.

5. **Value-bearing shape** (returns a `DateTime`/`Date`/`Quantity` value directly — e.g. `*-Order Date` defines that return an `authoredOn`):
   - `type` is the FHIR resource the value is extracted from (e.g. `ServiceRequest` for `*.authoredOn`, `Procedure` for `*.performed[x]`, `MedicationRequest` for `*.authoredOn`).
   - `valuetype` is the value's primitive type (`dateTime`, `Quantity`, etc.).

6. **Sanity-check the (type, valuetype) pair** against the per-FHIR-type allowed set (§5). If the pair is outside the set, do not auto-correct — surface a warning and ask.

---

## 3. Common semantic shapes by narrative pattern (transformer guidance, NOT catalog metadata)

This is **transformer-side guidance only**, drawn empirically from cms69 + cms22. It is NOT a field stored on each pattern in the catalog. The catalog records form (narrative template + CQL function); intent is encoded by the author's `(type, valuetype)` declaration on each concept and verified by the chain check (§7).

Use this section when transforming a CQL define into CRL and you need a default shape guess. **Always validate the guess against the actual source CQL's return type** before committing — a pattern phrase can serve different intents in different concepts (see `classified as` below).

### BOOLEAN shape (→ `Observation` + `boolean`)

These narratives return a Boolean from CQL — patient-level assertions.

| Narrative pattern | Why boolean |
|---|---|
| `X exists` | Existence test |
| `Has X` (where X is a Condition/diagnosis) | Existence test on the patient |
| `X is documented` | Existence test for documentation |
| `X active` | Active-status predicate on a Condition |
| `X low` / `X high` / `X normal` | Classification predicate over a value range |
| `X is documented as Y` | Documentation predicate |
| `X exceeds N 'unit'` / `X below N 'unit'` / `X at least N 'unit'` / `X between N and M 'unit'` | Quantity comparison |
| `without documented X` / `without documented (X or Y)` | Negated existence |
| `X on or before Y` (when X is a clinical event and Y is a date) | Temporal predicate (existed before date) |
| `X classified as Y` (when the classification is a yes/no test) | Predicate |

### REFINEMENT shape (→ inherit type + valuetype from subject)

These narratives return a List of the subject's FHIR resource — same shape, filtered.

| Narrative pattern | Behavior |
|---|---|
| `X during Y` (filters X to occurrences during Y) | List filter |
| `X performed` | Status filter |
| `X justified by Y` | reasonReference filter |
| `X component of Y` | Component extraction (still Observation-typed) |
| `X not done with reason Y` (filters X to not-done with the given reason) | Status+reason filter |
| `X same day as Y` | Temporal filter |
| `last X on day of Y` | Pick-one filter |
| `X classified as Y` (when classification narrows the list, not asserts boolean) | Filter — same shape, fewer items |

Note `X classified as Y` appears in both columns — **the CQL is the tiebreaker**. If unsure, look at the source.

### VALUE-BEARING shape (→ resource type + primitive valuetype)

| Narrative pattern | type, valuetype |
|---|---|
| `*-Order Date` (returns ServiceRequest.authoredOn) | `ServiceRequest`, `dateTime` |
| `*-Performed Date` (returns Procedure.performed[x]) | `Procedure`, `dateTime` |
| `*-Authored Date` for MedicationRequest | `MedicationRequest`, `dateTime` |

These are concepts whose CQL extracts a single value out of a resource. The `type` records which resource the value comes from; the `valuetype` is the primitive.

---

## 4. Worked examples (correct transformations)

```crl
// asserted — coded list of MR resources
concept "High BMI Medications":
- type is MedicationRequest.
- value type is CodeableConcept.
- coded from "High BMI Medications".

// REFINEMENT shape (justified-by filters the list)
//   Subject: "High BMI Medications" → MR + CodeableConcept
//   Output:  refined MR list, same valuetype.
concept "High BMI Medication Justified by Overweight Diagnosis":
- type is MedicationRequest.
- value type is CodeableConcept.
- definition is "High BMI Medications" justified by "Overweight or Obese Diagnoses".

// BOOLEAN shape (`on or before` returns a Boolean)
//   Even though the subject is a Condition, the semantic is
//   "did the patient have Overweight on or before that date?" — yes/no.
concept "Has Overweight On Or Before High BMI Medication Order":
- type is Observation.
- value type is boolean.
- definition is "Has Overweight or Obese" on or before "High BMI Medication Order Date".

// asserted Observation with Quantity value
concept "BMI Observations":
- type is Observation.
- value type is Quantity.
- coded from "Body Mass Index Observations".

// REFINEMENT shape — filtered list of Observations, valuetype preserved
concept "BMI Observation During MP":
- type is Observation.
- value type is Quantity.
- definition is "BMI Observations" during "Measurement Period".

// BOOLEAN shape — classification predicate over the Quantity value
concept "BMI During MP Is Low":
- type is Observation.
- value type is boolean.
- definition is "BMI During Measurement Period" low.

// VALUE-BEARING shape — extracts authoredOn from ServiceRequest
concept "High BMI Follow-up Order Date":
- type is ServiceRequest.
- value type is dateTime.
- definition is authored date of "High BMI Follow-up Order".
```

---

## 5. Per-FHIR-type allowed valuetype set (constraint, not authority)

This is the soft constraint for the validator. The shape decided in §1 is the authority; this is a sanity check.

| Resource type | Allowed valuetypes (empirical) | Conceptually allowed (FHIR-valid, not yet seen in corpus) |
|---|---|---|
| `Condition` | `CodeableConcept` | `dateTime` (onsetDateTime) |
| `Encounter` | `CodeableConcept` | `Period` |
| `MedicationRequest` | `CodeableConcept`, `dateTime` | — |
| `Observation` | `CodeableConcept`, `Quantity`, `boolean`, `dateTime` | `string`, `integer`, `Ratio`, `SampledData`, `time`, `Period` |
| `Procedure` | `CodeableConcept`, `dateTime` | `Period` |
| `ServiceRequest` | `CodeableConcept`, `dateTime` | — |

Validator behavior:
- If `(type, valuetype)` is in the **observed** set → pass silent.
- If it's in the **FHIR-valid but unseen** set → pass with an info note (we're crossing into new territory).
- If it's outside both → error: pair is invalid.

Note `boolean` only appears in the `Observation` row. The whole point of the §1 rule is that boolean predicates are always Observations.

---

## 6. Known corpus errors (to fix in a follow-up pass)

The current cms69.crl and cms22.crl contain concepts that violate §1. They were authored before the rule was articulated. Audit and correct in a single pass:

**Pattern: `Has X` modeled as `Condition + boolean`** — should be `Observation + boolean`.

Examples observed (cms69 + cms22 survey):
- `Has Overweight or Obese`
- `Has Underweight`
- `Active Pregnancy Diagnosis` (and similar "Active *" predicates)
- All other Condition+boolean entries from the survey (8 in cms69)

**Pattern: predicate concepts modeled with their subject's FHIR type instead of `Observation`** — anywhere the corpus shows `<NonObservationType> + boolean`, audit each. From the empirical survey:
- Condition + boolean: 8 — almost certainly all wrong
- Encounter + boolean: 8 — wrong (Encounter has no boolean value)
- MedicationRequest + boolean: 6 — wrong
- Procedure + boolean: 4 — wrong
- ServiceRequest + boolean: 29 — wrong

Observation + boolean: 32 — these are the only legitimate boolean concepts. Verify each is actually a boolean predicate, not a misnamed refinement.

**The just-committed annotation pass** (`a1ab358`) added `- type is X.` to 107 logic-is concepts by inheriting the subject's FHIR type. About half of those concepts are boolean-shape and should have been `type is Observation` regardless of subject. Revert the commit OR audit concept-by-concept against this rule before treating them as ground truth.

---

## 7. Validator: chain consistency check

Authority for "is this concept's `(type, valuetype)` declaration correct?" lies with the **chain check**, not the catalog. The validator walks each non-asserted concept back through its subject chain and verifies the declared pair matches ONE of three valid shapes.

### 7.1 Find the subject

For a concept `C` with `defined as` or `definition is` body:

- **`defined as <composition>`** — subject is the first `CompositionRef` reached in left-to-right traversal of the composition expression (descending into `sem-and`/`sem-or`/`sem-not`/group as needed).
- **`definition is <narrative>`** — subject is the first `NConceptRef` reached in left-to-right traversal of the narrative elements (descending into `NDisjunction`/`NConjunction` ArgValues as needed).

If the subject is itself a non-asserted concept, **do not recursively unwind**. The subject's declared `(type, valuetype)` is authoritative (we've already validated the subject when its turn came). Use the subject's declaration directly.

### 7.2 The three valid shapes

Let `(T_C, V_C)` = the concept's declared pair, `(T_S, V_S)` = the subject's declared pair.

| Shape | Constraint | Notes |
|---|---|---|
| **Boolean predicate** | `V_C = boolean` AND `T_C ∈ {Observation, QuestionnaireResponse, Consent, Coverage}` (the resources with native boolean value fields) | Subject `(T_S, V_S)` irrelevant. Default `T_C = Observation` for computed predicates. `<NonObs>+boolean` (e.g. `Condition+boolean`) is an error — those resources have no boolean value field. |
| **Refinement** | `T_C = T_S` AND `V_C = V_S` | The concept is a filtered view of the subject. Type AND valuetype both preserved. |
| **Value-bearing** | `T_C = T_S` AND `V_C` ∈ {`dateTime`, `Quantity`, `integer`, `string`, ...} (a FHIR primitive) AND `V_C ≠ V_S` | The concept extracts a primitive value (e.g. `authoredOn`) from the subject. Type comes from the source resource; value type is the primitive. |

Anything outside these three is an error.

**Composition operators in the chain.** When `T_C` and `V_C` are validated against a composed body (`defined as sem-and(...)` / `sem-or(...)` / `sem-not(...)`):

- **The author declares the result `(T_C, V_C)`; that declaration is authoritative.** The sem-* operators are SEMANTIC (intersection / union / exclusion of meaning), not boolean logic. They do NOT impose type-matching constraints on operands.
- **Mixed-shape operands are legal** under explicit author declaration. The CQL emitter bridges operand types to produce the declared result. The validator MAY warn on mixed operands as a code-smell (to help authors notice unintended mismatches), but MUST NOT block.
- **For boolean-declared concepts**: any operand shape mix is acceptable. Emitter wraps refinements in `exists` and value-bearing extracts in null-checks as needed.
- **For refinement-declared concepts**: the chain check applies to the SUBJECT (first concept ref in left-to-right traversal of the composition expression) — that subject's `(T_S, V_S)` must satisfy the refinement constraint `T_C = T_S` AND `V_C = V_S`. Other operands in the composition are free to be different shapes; the emitter interprets them per the operator's semantic meaning relative to the subject.
- **Heterogeneous-resource composition** (e.g. `sem-or` of a `ServiceRequest` refinement with a `MedicationRequest` refinement) is supported by author declaration: the author picks an umbrella result type (typically `Observation+boolean` if no `DomainResource` umbrella exists yet) and the emitter unions / boolean-wraps each typed operand.

See [defined-as-is-semantic-composition.md](defined-as-is-semantic-composition.md) for examples and the mis-readings to avoid.

### 7.3 Asserted concepts

Asserted concepts (`coded from` body) have no subject chain — their `(type, valuetype)` is the **ground truth** for everything that refines them. Validate only that:
- `type` is declared (required for asserted, per the cardinality rule).
- `(type, valuetype)` is in the per-FHIR-type allowed set from §5.

### 7.4 Special case: subject lacks declared `valuetype`

A subject concept may legitimately have `type is T_S.` with no `valuetype` declared (e.g. `definition is` concepts that are themselves boolean predicates — `T_S = Observation, V_S = boolean` is the implicit inheritance, but the boolean predicate rule covers this directly: the SUBJECT is `Observation + boolean`, and we don't need its absent `valuetype`).

Rule: if the subject is itself a boolean-shape concept (`type is Observation` and either declared `value type is boolean` or no `valuetype`), the only valid `C` shapes are:
- **Boolean predicate** (`T_C = Observation, V_C = boolean`) — a chained boolean predicate.
- A new boolean predicate over a boolean subject is fine (e.g. `"Has X" on or before "Date"`).

If the subject's `valuetype` is missing AND the subject is not Observation, error: cannot validate refinement/value-bearing without a `V_S` to compare against.

### 7.5 Asserted concepts as required-valuetypes contracts (post-pass)

An asserted concept's declared valuetypes are the **set of projections
its consumers may legally take**. Concretely, after all surface concepts
have been declared via §1–§5 above, run this whole-corpus pass:

For each asserted concept `A`:

1. Walk the reverse-dependency closure of `A` — every concept `C` in the
   model whose chain (per §7.1's subject-tracing rules) bottoms out at
   `A`.
2. Collect `V_C` for every such `C`, with one exclusion: **`boolean`
   does NOT contribute** to the set. Boolean is the consumer's property
   per §1 — a patient-level predicate the consumer derives, not a shape
   the source advertises. If every asserted absorbed boolean from every
   downstream predicate, every asserted would end up boolean.
3. Union the result with `A`'s own declared valuetypes.
4. Emit `A` with the union as multiple `value type is X.` lines (the AST
   supports `valueTypes?: string[]`).

The asserted advertises **every shape its consumers project from it**.
This is the contract surface — downstream tools (the emitter, future
model viewers, IDE qualified-ref completion) read the asserted's
valuetypes set to know what projections are legal.

The validator's check on this set is: for any refinement-shape consumer
`C` of `A` with `(T_C = T_A, V_C)`, `V_C` must be in `A`'s valuetypes
set. (`V_C = boolean` is exempt per the rule above — boolean predicates
don't need a matching valuetype on the asserted.)

### 7.6 Future cross-check against CRLPatterns.cql

Once todo 5 ships, each pattern function in CRLPatterns.cql has a concrete return type. The validator gains a second consistency check: the function's return type must match the concept's `(T_C, V_C)` according to:

- Function returns `Boolean` → concept must be Boolean predicate shape.
- Function returns `List<R>` → concept must be Refinement shape with `T_S = R`.
- Function returns a primitive `P` → concept must be Value-bearing shape with `V_C = P`.

This is independent of the chain check. Both must pass. If they diverge, the author's declaration is wrong OR the catalog's CQL function binding is wrong — both need investigation.

---

## 8. When the skill must stop and ask

The transformation should be conservative. Stop and ask the operator when:

- The narrative pattern is not in §3's catalog.
- The narrative pattern appears in two columns (e.g. "classified as" — depends on semantics).
- The source CQL is unavailable AND the narrative could plausibly be either boolean or refinement.
- The subject of a refinement traces back to multiple asserted concepts with conflicting types or valuetypes.
- A `(type, valuetype)` pair would be outside the §5 allowed set.

Do not guess. The reason the corpus has the errors in §6 is that earlier passes guessed instead of asking. Treat the rule above as a contract: if the skill cannot derive a confident answer from the rule + the input, escalation is the right behavior.

---

## 9. Open design questions (to resolve before promoting this to an MCP)

These do not block the skill's first version, but the future MCP must answer them:

- **Refinement-shape subject tracing across imports.** When the subject is imported from another CRL library, the type/valuetype must be visible. (Blocked on the `imports` backlog issue.)
- **Parameter substitution.** When a pattern is parameterized (the `parameters` backlog issue), the resulting concept's type/valuetype depends on the bound argument's type. Rule TBD.
- **Pattern overloads with different return semantics.** (The `pattern-typesafe-overloads` issue may force one pattern name to map to multiple `returnSemantic` values, disambiguated by argument types.)

---

## 10. Quick checklist (for inline use in a prompt)

When transforming a CQL define or narrative form into a CRL concept, answer these in order:

1. Read the source CQL. What is its return type as ELM would compute it?
   - `Boolean` → declare `type is Observation. value type is boolean.` Done.
   - `List<Resource>` or single `Resource` (refinement of the subject) → identify the subject, copy ITS `type` AND `valuetype` to this concept. Done.
   - A primitive value (`DateTime`, `Quantity`, `Integer`, etc.) extracted from a resource → declare `type is <source Resource>. value type is <primitive>.` Done.
2. No source CQL? Use §3's narrative-pattern guidance as a default guess — but flag it as a guess for review, not a commit.
3. Catalog-derived defaults conflict with what the CQL actually returns? → CQL wins. Update the concept declaration; do NOT trust the catalog default.
4. None of the above apply confidently? → **stop and escalate.**

The chain check (§7) catches mistakes at validation time. The author's declaration is the authority; the validator verifies; the catalog supplies form only.
