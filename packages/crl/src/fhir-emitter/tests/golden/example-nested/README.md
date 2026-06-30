# example-nested — V3: nested `defined as` (recursion depth)

Variation of the `example-for-emit` base golden. Demonstrates a multi-level
inference tree and the recursive rule for collecting PlanDef inputs.

Inference tree:

```
Top  = ( "A And B" sem-or "Diagnosis C" )      <- defined as (no code is)
A And B = ( "Diagnosis A" sem-and "Diagnosis B" )  <- defined as (no code is)
Diagnosis A  (code is a)   <- leaf
Diagnosis B  (code is b)   <- leaf
Diagnosis C  (code is c)   <- leaf
```

What this variation demonstrates (vs the base):

- **Two Inferred defines** in one library:
  - `define "A And B": LocalSource."Diagnosis A" intersect LocalSource."Diagnosis B"`
  - `define "Top": "A And B" union "example-nested-LocalSource"."Diagnosis C".asTruths()`
  (the nested define references the sibling Inferred define for `A And B` BARE —
  a same-library define must not be qualified by its own library name — and the
  LocalSource define for the `code is` leaf `Diagnosis C`).
- The **Interface re-exports `Top`** (the condition concept).
- **Exactly three PlanDef inputs = Diagnosis A, Diagnosis B, Diagnosis C** — the
  `code is` LEAVES found by recursing through both inference levels. The
  intermediate `A And B` has **no input** because it has no `code is`.
- **Three case-feature StructureDefinitions** (one per leaf); none for `A And B`.

The FHIR **Library** wrappers, the **CodeSystem**, the **ActivityDefinitions**,
and the recommendation **PlanDefinitions** mirror the base golden and are omitted
here — only the demonstrative core is materialized.
