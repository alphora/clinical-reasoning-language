# `inferred from` is SEMANTIC composition, not boolean logic

**Audience:** humans working on CRL design or transformation; agents asked to generate, audit, or review CRL concepts.

**Status:** load-bearing design principle of CRL v0.6. Mis-reading this principle has been the single most expensive mistake in the corpus-correction work — it caused a multi-round review loop where each iteration "fixed" type mismatches that weren't actually defects, and introduced new ones in the process.

---

## The principle, in one paragraph

In CRL, a concept declared with `inferred from <composition>` is a NEW concept whose `type` and `valuetype` are declared by the AUTHOR. The composition body — `sem-and`, `sem-or`, `sem-not` — describes HOW the meaning of the new concept is composed from existing concepts (semantic intersection / union / exclusion). It does NOT type-check the operands against each other or against the result. The author owns the semantic claim; the implementation (the CQL emitter, the runtime) is responsible for figuring out HOW to combine the operands' values to produce the declared result.

`sem-and` is NOT boolean `AND` with strict operand-type matching. It is a SEMANTIC operator: "the resulting concept's meaning is the intersection of the operand concepts' meanings, interpreted in the result's type/valuetype." Same for `sem-or` (union of meanings) and `sem-not` (exclusion of meaning).

This is the same "What not How" principle CRL applies elsewhere: the author declares WHAT a concept means; the implementation handles HOW to compute it.

---

## What this means concretely

### For authoring

When you write:

```crl
concept "Has Normal BMI":
- type is Observation.
- valuetype is boolean.
- inferred from
(
   "Normal BMI Range"            // operand: refinement (Observation+Quantity list)
   sem-and
   "Without Documented Abnormal BMI"  // operand: boolean predicate (Observation+boolean)
).
```

The composition is composing a Quantity-bearing refinement with a boolean predicate. **This is not a defect.** The author is asserting: "the concept `Has Normal BMI` semantically means: the patient has a normal-BMI-range observation AND has no documented abnormal BMI. The result is a boolean predicate." The CQL emitter will translate this into something like `exists("Normal BMI Range") and "Without Documented Abnormal BMI"`, wrapping the refinement in `exists` to bridge to the boolean.

The author did not have to declare the operands as the same shape. They declared the RESULT's shape. The semantics of the composition follows.

### For the validator

The validator's job is to enforce the rules the design says are rules — not to enforce a strict type system the design doesn't ask for.

- ✅ Check that asserted concepts declare a `type` (cardinality "required") and a valid `(type, valuetype)` pair for that FHIR resource.
- ✅ Check that the boolean rule is respected: `<Resource>+boolean` only valid if the resource has a native boolean value field; else `Observation+boolean`.
- ✅ Check reference resolution: every concept ref points to a declared concept.
- ✅ Check cycles, name uniqueness, action uniqueness — structural defects.
- ⚠️ **WARN** (not error) on mixed-shape sem-* operands as a code-smell — but DO NOT block. The author may have explicitly chosen this.
- ❌ **DO NOT** require sem-* operands to have matching `(type, valuetype)`. That's not a rule. The author declares the result.

### For the CQL emitter

When the emitter walks a sem-* composition with mixed-shape operands, its job is to BRIDGE the operand types into the result type:

- `sem-and(refinement, boolean)` with boolean result → emit `exists(refinement-as-CQL) and boolean-as-CQL`.
- `sem-or(refinement-A, refinement-B)` with same-resource refinement result → emit `refinement-A-CQL union refinement-B-CQL`.
- `sem-or(SR-refinement, MR-refinement)` with boolean result (heterogeneous union case) → emit `exists(SR-CQL) or exists(MR-CQL)`.
- `sem-not(refinement)` with boolean result → emit `not exists(refinement-CQL)`.

These are emitter-side translations, not author-side concerns. The author declares "this composition produces an Observation+boolean predicate"; the emitter delivers that.

---

## What this means for the type/valuetype rule

The transformation rule at [cql-to-crl-type-valuetype-rule.md](cql-to-crl-type-valuetype-rule.md) says: for any concept, the `(type, valuetype)` is decided by the author based on what the concept SEMANTICALLY MEANS, with the boolean rule as the one hard constraint (boolean valuetype requires a resource with a native boolean field, else fall back to Observation).

The chain check in §7 of that rule has been updated to reflect this principle. Old version said: "mixed-shape sem-* composition is a defect, the validator flags it." That was wrong — it imposed a constraint the design doesn't have. New version says: mixed operands are legal under explicit author declaration; the validator may warn but does not block.

---

## Common mis-readings to avoid

These are the failure modes the corpus-correction work hit; future authors and agents should recognize and skip them.

### Mis-reading 1: "sem-and is boolean AND, so operands must be boolean"

**No.** `sem-and` is semantic intersection. Operands can be refinements (the intersection is a smaller refinement), booleans (the intersection is `AND`), value-bearing (intersection over the value field), or mixed (the author declares the result's shape; the emitter bridges).

### Mis-reading 2: "If the author flips a concept from boolean to refinement, downstream consumers compose into a mixed-shape defect"

**Not necessarily.** The downstream consumer has its own `(type, valuetype)` declaration. If the consumer declares boolean, the sem-* composition still produces boolean — the refinement operand is bridged via `exists` at emit time. Mixed operands compose; the result follows the declaration.

### Mis-reading 3: "The source CQL define returns List<X>, so the CRL concept MUST be a refinement"

**No.** The CQL define's return type is HOW the implementation works. The CRL concept's `(type, valuetype)` is the AUTHOR'S declaration of WHAT the concept means. The author can declare boolean even when the CQL idiom uses `exists` at an outer concept. The emitter will produce the right CQL.

### Mis-reading 4: "The catalog says pattern X returns boolean, so concepts using X must be boolean"

**No.** The catalog describes the narrative pattern's form and links to a CQL function. The pattern is not authoritative on the concept's shape. Author declares concept shape; pattern provides the implementation form. (Note: the catalog still has `: boolean` return-type annotations from a v0.5 "How" design — these are obsolete and being swept out. Do not treat them as authoritative.)

### Mis-reading 5: "If I see operands of different types, I should refactor the CRL to add explicit `exists` wrappers"

**No.** That's HOW. The author's declared result `(type, valuetype)` already captures the semantic intent. Adding explicit `exists` wrappers makes the CRL more verbose without changing its meaning. Trust the author's declaration; let the emitter bridge.

---

## How to apply this when generating or auditing CRL

Per concept:

1. **What does this concept MEAN?** A patient-level yes/no claim? A filtered list of resources? An extracted primitive value? The author's intent is the authority.
2. **Declare `(type, valuetype)` to match that meaning.**
   - Boolean predicate: `<Resource>+boolean` if the resource has a native boolean value field (`Observation`, `QuestionnaireResponse`, etc.), else `Observation+boolean`.
   - Refinement: type and valuetype inherited from the subject of the refinement.
   - Value-bearing: type is the source resource; valuetype is the primitive extracted.
3. **For composition bodies**: don't worry about whether operands "type-check". The composition is semantic. Declare the result; trust the emitter.
4. **For source-CQL audits**: read the define for SEMANTIC INTENT, not return-type mechanics. An `exists` in the define means the WHOLE define is a boolean; an `exists` at an OUTER define wrapping a list-shaped concept means the OUTER define is boolean — but the inner concept could be authored as either boolean (predicate-shaped intent) or refinement (list-shaped intent). Author decides.

---

## Why this principle exists

Two reasons.

**Authoring ergonomics.** CRL is meant to be authored by clinicians and clinical-content modelers, not type-system specialists. Forcing them to maintain operand-type alignment across composition bodies — including refactoring composition trees when types change — is a productivity tax for no semantic gain. Let them declare what they mean.

**"What not How" as a discipline.** CRL deliberately separates declarative intent (author-facing) from implementation strategy (emitter-facing). Type-checking sem-* operands strictly is mixing the two layers: it pushes implementation concerns (how the CQL will compose) into the authoring layer. The principle says: keep them separate. Authors declare; emitters translate.

---

## For the future MCP

When the CQL→CRL transformer MCP ships, its behavior must respect this principle:

- The transformer reads source CQL and INFERS the semantic intent of each define.
- It declares the resulting CRL concept's `(type, valuetype)` based on that intent.
- It does NOT enforce operand-type matching in composition bodies it constructs.
- It does NOT refactor composition bodies to make operands type-uniform.

The transformer's job is intent-capture, not type-bridging. Type bridging is the emitter's problem.

---

## Open design question — explicit vs succinct valuetype on inferred concepts

For an `inferred from` concept whose valuetype CAN be inferred from the subject (refinement preserves V_S, value-bearing primitive declared inline), should the author **restate** the valuetype explicitly, or **omit** it and let the reader / validator infer from the chain?

Both are valid styles. CRL v0.6's grammar (`(valueTypeLine)*` — 0..*) and validator (skips chain check when V_C or V_S is missing) support both.

**Style A — explicit:**

```crl
concept "BMI Evaluation Encounter (not virtual)":
- type is Encounter.
- valuetype is CodeableConcept.
- inferred from
(
   "Encounters to Evaluate BMI"           // Encounter+CodeableConcept (asserted)
   sem-and
   sem-not "Virtual Encounters"           // Encounter+CodeableConcept (asserted)
).
```

Pros: new readers see the result valuetype without tracing the subject chain; the validator can enforce the refinement chain (V_C = V_S) strictly; documentation cost is one extra line.

Cons: redundant with the chain; if an asserted parent's valuetype changes, every downstream concept's declaration must be updated.

**Style B — succinct:**

```crl
concept "BMI Evaluation Encounter (not virtual)":
- type is Encounter.
- inferred from
(
   "Encounters to Evaluate BMI"
   sem-and
   sem-not "Virtual Encounters"
).
```

Pros: less repetition; valuetype changes at the asserted root propagate without per-concept edits; encourages thinking of refinements as "preserving" the subject's shape.

Cons: readers must trace the chain to learn the valuetype; the validator can't enforce the refinement chain locally (the chain check is skipped when V_C is missing); ambiguity if the subject also has no valuetype.

**Current corpus state (mixed):** cms69 and cms22 use Style A for the BMI/BP Quantity refinement chain (Quantity restated explicitly) and Style B for Encounter/Condition/SR/MR/Procedure refinements (resource type only, valuetype omitted). This isn't a deliberate policy — it's an artifact of the v3+v4 correction pass. A future convention decision could:

1. Pick Style A uniformly (restate everywhere) — favors clarity and validator strictness.
2. Pick Style B uniformly (omit when inferable) — favors succinctness and propagation.
3. Pick Style A only when the valuetype carries semantic load downstream (e.g., Quantity matters for value-comparison consumers), Style B otherwise — what the corpus accidentally has now.

This is an unresolved authoring-convention question, not a grammar or validator question. Both styles must continue to parse and validate. The recommended convention may emerge from real authoring experience.

---

## See also

- [cql-to-crl-type-valuetype-rule.md](cql-to-crl-type-valuetype-rule.md) — the canonical type/valuetype assignment rule (§1 and §7 reflect this principle).
- [.claude/skills/cql-to-crl-transformer/SKILL.md](../../.claude/skills/cql-to-crl-transformer/SKILL.md) — the operational procedure for transformation (references this document at the top).
