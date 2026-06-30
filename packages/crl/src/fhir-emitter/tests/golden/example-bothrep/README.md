# example-bothrep — both-representation condition (`code is` AND `defined as`)

Variation of the `example-for-emit` base golden. Demonstrates a condition
concept that carries **both** representations at once: a direct local-source
`code is` AND a `defined as` inference over two leaves. The Inferred library
**folds** the two representations together (the direct retrieve OR'd with the
inference) so a determination fires when either the condition was asserted
directly OR it can be inferred from the leaves.

Concept shape (CRL):

```
Implanted Estrogen Pellets             (code is a)                <- leaf
Implanted Estradiol Pellets            (code is b)                <- leaf
Implanted Estrogen Or Estradiol Pellets
    (code is c) AND (defined as ( Estrogen sem-or Estradiol ))    <- both-rep
```

What this variation demonstrates (vs the base):

- **LocalSource has THREE retrieves** — one per `code is`, including the
  both-rep concept's OWN `code is c` retrieve (alongside the two leaves).
- **Inferred folds the direct representation into the inference**:
  `define "Implanted Estrogen Or Estradiol Pellets":
     LocalSource."Implanted Estrogen Or Estradiol Pellets".asTruths()
       union ( LocalSource."Implanted Estrogen Pellets".asTruths()
                 union LocalSource."Implanted Estradiol Pellets".asTruths() )`.
  The first operand is the both-rep concept's direct `code is` truth-set; the
  parenthesized operand is the inference (`sem-or` over the two leaves).
- The **Interface re-exports the Inferred** define with `.satisfied()`.
- **THREE PlanDef inputs** — the both-rep concept itself plus the two leaves
  (each a `code is` concept gets an input), each with both cpg- input
  extensions and a `profile` → its case-feature StructureDefinition.
- **THREE case-feature StructureDefinitions** (the both-rep concept + the two
  leaves), each `cpg-featureExpression.reference` → the LocalSource Library.

The FHIR **Library** wrappers, the **CodeSystem**, the **ActivityDefinitions**,
and the recommendation **PlanDefinitions** mirror the base golden and are
omitted here — only the demonstrative core is materialized (CRL, the four CQL
libraries, the decision PlanDefinition, and the three case-feature
StructureDefinitions).
