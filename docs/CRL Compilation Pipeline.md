# CRL Compilation Pipeline

A high-level architecture overview of how CRL source becomes executable CQL.
This is a living document; it tracks the *design* of the pipeline. Implementation
status varies by stage — see the section "Implementation status" at the bottom.

## Pipeline stages

CRL source flows through **three transformation stages with two intermediate
representations**:

```
┌────────────────────┐
│  CRL source (.crl) │  author-facing — clinical-narrative style
└────────────────────┘
          │
          ▼  Parse + AST build (lexer, parser, AST builder)
┌────────────────────┐
│  Structural AST    │  concept/inference nodes; NarrativeClause with
│                    │  NConceptRef/NWord/Quantity/NDisjunction elements
└────────────────────┘
          │
          ▼  Template-match against catalog narrative-form templates
┌────────────────────┐
│  Canonical AST     │  typed pattern calls — Justified(action, reason),
│                    │  WasPerformed(X), Last(X, BeforeStartOf(d, anchor))
└────────────────────┘
          │
          ▼  Emit using catalog's `CQL function` field + CRLPatterns library
┌────────────────────┐
│  CQL output (.cql) │  CRLPatterns.Justified(...), CRLPatterns.WasPerformed(...)
└────────────────────┘
```

## Stage 1 — Parse + AST build

**Input:** CRL source text.
**Output:** Structural AST.

The structural AST preserves the author's narrative as a token stream
(`NarrativeClause.elements: NarrativeElement[]`). No pattern semantics
applied yet; just lexical structure.

- `inference "Foo": - <narrative phrase>.` → `Inference { name, body: NarrativeClause }`
- `concept "Bar": ... inferred from "X".` → `Concept` with `InferredFromBareRef`
- `concept "Baz": ... inferred from ( "A" sem-and "B" ).` → `Concept` with `InferredFromComposition` (sem-or/sem-and/sem-not tree over CompositionRef leaves)

**Why the structural AST stops here.** The narrative `<X> performed` could
match many patterns until we consult the catalog. Keeping the structural form
separate from pattern semantics means the parser is bounded (one grammar) and
the pattern matcher (next stage) can evolve independently as the catalog grows.

## Stage 2 — Template-match → Canonical AST

**Input:** Structural AST.
**Output:** Canonical AST (typed pattern calls).

For each `NarrativeClause`, walk the catalog's narrative-form templates and
match. On match, emit a typed canonical pattern call.

- `"BMI Evaluation Encounter" performed` → `WasPerformed("BMI Evaluation Encounter")`
- `"X" justified by ("A" or "B")` → `Justified("X", Disjunction("A", "B"))`
- `last "BP Panels" within 1 year before start of "Qualifying Encounter"` → `Last("BP Panels", BeforeStartOf(1 'year', "Qualifying Encounter"))`

Canonical signatures are typed (e.g. `WasPerformed(X: ConceptRef): boolean`,
`AtLeast(value: ConceptRef<Quantity<U>>, target: Quantity<U>): boolean`).
Type checking — units matching, arity matching, return-type compatibility —
happens at this stage.

**Soft compile.** Unknown narrative phrases produce `PatternCall(name, args, known=false)`
nodes + warnings. The build doesn't fail; tooling can surface "unrecognized
pattern" diagnostics. This lets authors experiment with new templates before
they land in the catalog.

## Stage 3 — Emit → CQL output

**Input:** Canonical AST.
**Output:** CQL source.

The catalog's `CQL function` field maps each canonical pattern to a function
in the shared `CRLPatterns.cql` library. The emitter generates CQL calls:

- `WasPerformed("BMI Evaluation Encounter")` → `CRLPatterns.WasPerformed(<resolved expression for "BMI Evaluation Encounter">)`
- Sem-composition (`sem-or` / `sem-and` / `sem-not`) emits as boolean CQL
  combining the operand expressions.
- Concept references resolve to their declared expression (an Inferred concept's
  body becomes a CQL `define` block; Asserted concepts become valueset retrievals).

## Why three stages, not two

Considered: skip the canonical intermediate, emit CQL directly from the
structural AST + catalog lookup. **Rejected** because:

- **Type checking** requires typed pattern signatures. Validating "`AtLeast(X, Y)`
  needs X to be Quantity-valued with units matching Y" is much easier on a
  canonical-AST pattern call than on raw narrative tokens.
- **Soft compile** needs a typed slot to attach unknown patterns to —
  `PatternCall(name, args, known=false)` is awkward to fit into a single-pass
  emitter that just wants to print CQL.
- **VS Code tooling** (hover, autocomplete, refactor) reads catalog metadata
  from the canonical AST; without it, the IDE has to re-walk narrative element
  streams to figure out what pattern it's looking at.
- **Multi-target potential.** Same canonical AST could emit to FHIR/JSON/other
  formats later. The structural-only path bakes in the CQL target.

The cost is one extra pass and one extra AST shape. For the catalog-as-source-of-truth
model this catalog uses, the cost is worth it.

## Catalog as the bridge between stages

The catalog (`src/cql-emitter/catalog/inference-pattern-catalog.md`)
is the **single source of truth** mapping all three layers:

| Field | Used by stage | Purpose |
|---|---|---|
| **narrative form** | Stage 2 template-match | input pattern matched against author narrative |
| **canonical signature** | Stage 2 type-check + Stage 3 emit | typed function signature for validation + AST shape |
| **CQL function** | Stage 3 emit | name of the function in CRLPatterns.cql |

Adding a new pattern is three steps: add a catalog row, add a CRLPatterns
CQL function, write a couple of test cases. The pipeline picks up the new
pattern automatically.

## Implementation status

| Stage | Status (2026-05-31) |
|---|---|
| Lexer + Parser + AST builder (structural AST) | ✅ Done (Todo 2 in [issues/](../issues/)) |
| Validator: name uniqueness + reference resolution | ✅ Done |
| Validator: cycle detection across kinds | ⏳ Deferred (existing detector broken) |
| Template-match → canonical AST | ⏳ Planned (Todo 3) |
| Soft compile (unknown patterns) | ⏳ Planned (Todo 4) |
| CRLPatterns.cql shared library | ⏳ Planned (Todo 5) |
| CRL → CQL emitter | ⏳ Planned ([issues/crl/todo/crl-to-cql-emitter/](../issues/crl/todo/crl-to-cql-emitter/)) |
| VS Code extension (autocomplete + hover from catalog) | ⏳ Planned (Todo 6) |
