# Findings — round 1, curated against the inference taxonomy (first pass; superseded)

> **Corpus:** `dqm-content-qicore-2025` (91 libraries, 2344 statement definitions, 61,366 ELM nodes after stripping type-specifier metadata).
> **Methods:** function-call inventory (every `FunctionRef` ranked by `<lib>.<name>`) + frequent-subtree signatures at depths 2/3/4 (canonical structural signatures with scalars and statement-local names abstracted, function/operator/property names kept concrete).

## Headline

the taxonomy's hypothesis was right and the evidence is direct: **the patterns are already in the corpus, mostly as published FHIRHelpers / QICoreCommon / CQMCommon / Status / TJC functions.** They aren't labeled "patterns" because the authors called them "helpers" — but they are, exactly, the reusable named primitives the inference taxonomy predicted. Most of his categories have one or more direct hits in the top-30 by call count.

The implicit patterns (the ones that should be helpers but aren't) surface from the depth-3 subtree mining — most prominently around FHIR **choice-type discrimination** and **field-access-after-normalization** shapes that recur thousands of times across the corpus but are inlined every time.

## How the discoveries map to the inference taxonomy

The categories below are the taxonomy's. Within each, I name **explicit patterns** (already extracted into a named function in the corpus — top hits from the function-call inventory) and **implicit patterns** (recurring subtree shapes nobody bothered to extract — from the subtree-signature ranking). Pattern names in **bold** are my proposed CRL `apply pattern` candidates.

### Transformation / Normalization / (Domain) Semantic Normalization

the taxonomy notes we wouldn't have to worry about transformation directly — FHIR + good value-set binding handles it. The corpus mostly bears that out at the *resource* level. But there's a *value-level* normalization layer (`FHIRHelpers.To*`) that's pervasive and probably belongs as an implicit emit-time concern, not a user-authored CRL pattern.

**Explicit (already-extracted helpers):**

| Function | Calls | What it does |
|---|---:|---|
| `FHIRHelpers.ToValue` | 3,709 | normalize a FHIR choice-type value to its actual typed value |
| `FHIRHelpers.ToConcept` | 789 | FHIR `Coding`/`CodeableConcept` → System `Concept` |
| `FHIRHelpers.ToInterval` | 787 | FHIR `Period`/`Range`/`Timing` → System `Interval<T>` |
| `FHIRHelpers.ToQuantity` | 88 | FHIR `Quantity` → System `Quantity` |
| `FHIRHelpers.ToString` | 61 | FHIR primitive `string` → System `String` |
| `FHIRHelpers.ToCode` | 27 | FHIR `Coding` → System `Code` |

That's **5,461 calls** to type-normalization helpers. They are foundational but probably don't deserve user-facing CRL patterns — they should be implicit in the CRL→CQL emitter ("when you access a FHIR field, emit the appropriate `To*` wrapping"). noted in the taxonomy.

**Implicit (subtree shape, not yet extracted):**

Depth-3 subtree hits 1995 and 670 say:
- `FunctionRef:FHIRHelpers.ToValue(operand=[Property:performed(scope=#s)])` — 1995 instances
- `FunctionRef:FHIRHelpers.ToValue(operand=[Property:effective(scope=#s)])` — 670 instances
- `FunctionRef:FHIRHelpers.ToInterval(operand=[Property:period(scope=#s)])` — 671 instances

These are the same FHIR-attribute-access-with-normalization pattern over and over: "give me the typed value of `<resource>.<field>`." It's pure boilerplate that no human wrote on purpose. Strong case for the CRL emitter to add these implicitly when the author writes `<Procedure>.performed`. **Pattern: `Normalized(<resource>.<field>)`** — but emit-implicit, not user-facing.

### Classification ("Type-ing")

**Explicit:**

| Function | Calls | What it does |
|---|---:|---|
| `Status.verified` | 62 | verified-clinical-status predicate |
| `Status.isAssessmentPerformed` | 47 | "this assessment was performed" |
| `Status.isEncounterPerformed` | 34 | "this encounter was performed" |
| `Status.isProcedurePerformed` | 32 | "this procedure was performed" |
| `Status.isMedicationOrder` | 23 | "this MedRequest is an order (not a proposal)" |
| `.isVerified` (in measure-local libs) | 47 | per-measure-local verified check |

the taxonomy's classification "applied to status attributes" — these are the prototype. The Status library is *literally a classification helper library*.

**Implicit (the big one):**

Top depth-3 hit #11 (count: 644):
- `?(then=As(operand=As(_)), when=Is(isTypeSpecifier=<T>, operand=FunctionRef:FHIRHelpers.ToValue(operand=[_])))`

That's a CaseItem (the `?` is an unrecognized parent type — the Case's branch) shape that reads "when the normalized value `is` of type T, then `as` cast it to T." Repeated **644 times**. This is FHIR choice-type discrimination — the dispatch pattern for `Observation.value[x]`, `MedicationRequest.medication[x]`, etc. It's classification at the language-machinery level.

**Pattern: `WhenTypeIs(<choice>, <T>)`** — a CRL primitive that emits the Case-Is-As trio. Universal. Currently inlined everywhere.

**Pattern: `OfType(<resource>, <type>)`** — filter a list of resources to those whose value matches a target type. Common building block.

### Qualification (temporal — the taxonomy's "several flavors")

**Explicit:**

| Function | Calls | What it does |
|---|---:|---|
| `QICoreCommon.earliest` | 245 | earliest occurrence in a period — the "first" qualification |
| `QICoreCommon.latest` | 25 | latest occurrence in a period — the "most recent" qualification |
| `QICoreCommon.prevalenceInterval` | 150 | period during which a condition was prevalent |
| `QICoreCommon.toInterval` | 549 | extract a normalized interval (any source) |
| `CMD.medicationRequestPeriod` | 80 | the time period of a medication request |
| `TJC.calendarDayOfOrDayAfter` | 89 | "calendar day of X, or the day after" — discharge timing |

These are *exactly* the taxonomy's qualification examples. `earliest` and `latest` are the "Most Recent / Earliest" pattern family in his framing. `prevalenceInterval` is condition-period qualification. `calendarDayOfOrDayAfter` is the kind of discharge/admission day-offset pattern.

**Strong CRL `apply pattern` candidates** (these become CRL primitives that map to QICoreCommon/CMD/TJC under the hood):
- **`Earliest(X[, period])`** → `QICoreCommon.earliest`
- **`MostRecent(X[, lookback])`** → `QICoreCommon.latest` (the taxonomy's own example pattern in CRL today)
- **`PrevalenceInterval(condition)`** → `QICoreCommon.prevalenceInterval`
- **`MedicationPeriod(request)`** → `CMD.medicationRequestPeriod`
- **`AsInterval(period|range|timing|datetime)`** → `QICoreCommon.toInterval`

### Contextualization (relationships between case features — temporal anchors)

**Explicit (the most domain-specific cluster):**

| Function | Calls | What it does |
|---|---:|---|
| `CQMCommon.hospitalizationWithObservation` | 100 | full hospitalization interval including the ED-obs prelude |
| `CQMCommon.hospitalizationWithObservationAndOutpatientSurgeryService` | 38 | same, plus outpatient-surgery prelude |
| `CQMCommon.isDiagnosisPresentOnAdmission` | 54 | POA flag |
| `CQMCommon.encounterDiagnosis` | 19 | the primary/relevant diagnosis on an encounter |
| `CQMCommon.edVisit` | 18 | the ED-visit prelude of an encounter |
| `.latestGeneralAnesthesiaOrMAC` | 57 | most recent anesthesia within an episode |
| `.firstAnesthesiaDuringHospitalization` | 43 | first anesthesia |
| `.fromDayOfStartOfHospitalizationToDayAfterAdmission` | 24 | timing window relative to admission |
| `.fromDayOfStartOfHospitalizationToDayAfterFirstICU` | 20 | timing window relative to first ICU |

These are the *richest* patterns in the corpus and the *most clinical*. They name contextual relationships ("anesthesia during hospitalization", "diagnosis present on admission", "from this point to that point") that no FHIR field captures directly. the taxonomy's contextualization category.

These mostly stay as named functions referenced from CRL via `apply pattern` — the work is mapping CRL pattern syntax onto these existing CQL functions. **The CQL helper library *is* the pattern library already.**

### Calculation

Sparse in the explicit inventory — most calculation is inlined as ELM operators:

**Implicit (subtree):**
- `And(operand=[_,_])` — 1498
- `Or(operand=[_,_])` — 595
- `In(operand=[_,_])` — 616 (set / interval membership)
- `Union(operand=[_,_])` — 1207
- `Quantity(unit=#s, value=#n)` — 535

The boolean / set / interval ops are CQL's calculation backbone. Not "patterns" — they're the calculus the patterns combine over. The `Quantity` literal shape is interesting: 535 instances of `<n> '<unit>'` (e.g., `60 'a'`, `>= 2 '[in_i]'`). Threshold comparisons against typed quantities are common; CRL might want a **`Threshold(field, op, quantity)`** primitive that compiles to `Comparison(Property[+ToValue], Quantity(value, unit))`.

### State / Process Inference

The corpus has limited state-machine logic at this layer — DQM measures are mostly stateless (per-encounter / per-episode rollups). I see **`Case` (21)** and **`If` (28)** as expression roots, but they're mostly the choice-type discrimination case identified under Classification, not clinical state-transition logic. **the taxonomy's prediction stands**: state inference is a category we *will* see when we move beyond CMS quality measures (e.g., to CDS-Connect or CPG-driven IGs).

### Statistical Inference

Not present in this corpus — DQM measures don't do statistical scoring. deferred this to PMML anyway. No findings.

### Assertion

Not present — DQM doesn't carry this kind of provenance/confidence layer. Expected.

## Structural building blocks (not patterns, but the substrate)

These are the recurring ELM shapes that aren't "patterns" but tell us what the CRL→CQL emitter has to assemble:

- **Direct retrieves** (top-3 expression roots): `Retrieve:Condition` (464), `Retrieve:Encounter` (387), plus Observation/Procedure/MedicationRequest. Always parametrized by a `ValueSetRef`. Clean and uniform.
- **Aliased query sources**: `?(alias=#s, expression=ExpressionRef(name=#s))` (620). The `[X] X` pattern in CQL — name the result of an ExpressionRef so you can filter/sort/return.
- **ValueSet references**: `ValueSetRef(name=#s, preserve=#b)` (1532). Always the binding mechanism for retrieves.
- **Code references**: `CodeRef(name=#s)` (438). Direct named-code refs (less common than valuesets).
- **Parameter references**: `ParameterRef(name=#s)` (379) — measurement period parameter, mostly.

## What I'd recommend as the CRL pattern catalog v1 (round-1 draft)

Direct candidates from the explicit function-call inventory, named per CRL conventions:

| CRL pattern | Maps to | category | Evidence (count) |
|---|---|---|---|
| `Normalize(field)` | `FHIRHelpers.To*` (emit-implicit) | Normalization | 5,461 |
| `MostRecent(X[, lookback])` | `QICoreCommon.latest` | Qualification | 25 (named) + 22 root `Last` |
| `Earliest(X[, period])` | `QICoreCommon.earliest` | Qualification | 245 |
| `PrevalenceInterval(X)` | `QICoreCommon.prevalenceInterval` | Qualification | 150 |
| `AsInterval(X)` | `QICoreCommon.toInterval` | Qualification | 549 |
| `IsVerified(X)` | `Status.verified` / `.isVerified` | Classification | 109 |
| `WasPerformed(X)` | `Status.isProcedurePerformed` / `.isAssessmentPerformed` / `.isEncounterPerformed` | Classification | 113 |
| `IsOrder(X)` | `Status.isMedicationOrder` | Classification | 23 |
| `WhenTypeIs(choice, T)` | implicit `Case/Is/As` triple — **not yet extracted** | Classification | 644 |
| `MedicationPeriod(X)` | `CMD.medicationRequestPeriod` | Qualification | 80 |
| `HospitalizationWith(X, obs?)` | `CQMCommon.hospitalizationWith*` | Contextualization | 138 |
| `IsDiagnosisPOA(X)` | `CQMCommon.isDiagnosisPresentOnAdmission` | Classification | 54 |
| `CalendarDayOfOrDayAfter(X, anchor)` | `TJC.calendarDayOfOrDayAfter` | Qualification (temporal-offset) | 89 |
| `Threshold(field, op, quantity)` | inlined `Comparison(Property, Quantity)` — **not yet extracted** | Calculation | est. 500+ (Quantity literal × Comparison) |

Two of the most consequential candidates (`WhenTypeIs` and `Threshold`) are **implicit** — they're not in anyone's helpers library because they're so foundational they get inlined everywhere. Those are exactly the discoveries the subtree-mining angle was meant to surface.

## Next steps (in order of leverage)

1. **Bring in a second corpus.** The current findings are dominated by CMS DQM's housestyle — `CQMCommon`, `Status`, `TJC` are corpus-specific. Adding **CDS-Connect** logic libraries or the **HL7 Clinical Reasoning IG examples** will reveal whether `Earliest`/`MostRecent`/`HospitalizationWith` are universal or DQM-flavored. (Drop the new corpus under `sources/`, re-run both stages — same machinery.)
2. **Drill into the implicit patterns.** Specifically the `WhenTypeIs` Case/Is/As triple — dump 20 example call sites with their CQL source (from `data/cql/`) and see whether the parameter shapes really are uniform across instances.
3. **Verify a hypothesized pattern via Comby/Semgrep.** Take `MostRecent` — search the CQL corpus for `Last([X] ... sort by ... date)` shapes that *aren't* using `QICoreCommon.latest`. Tells us the prevalence of inlined-vs-helpered Most-Recent across the corpus.
4. **LLM-assisted naming pass on the long tail.** For the depth-3 patterns below the top-30, hand each candidate template + 3 examples to an LLM and ask for a clinical name + typed signature. Curate.
5. **Catalog draft.** Turn the table above into a real pattern registry (mirror the metadata-registry artifact shape: typed signatures, CQL emit templates, category-bucket).

## Notes on the methodology

- **Subtree depth.** Depth 3 is the sweet spot. Depth 2 captures broad shapes (operators, refs); depth 3 captures meaningful compositions (FunctionRef + Property + scope); depth 4 mostly repeats depth 3 because the corpus has shallow body-trees rooted at FunctionRef.
- **Type-specifier filtering matters.** Pre-filter: 193K nodes, top hits were all `NamedTypeSpecifier:DateTime`. Post-filter: 61K nodes, top hits are real patterns. Without this, the analysis is unreadable.
- **What the mining missed.** I'm not doing true frequent-subtree mining yet — I'm doing rooted-subtree-signature counting. That misses patterns that recur in *different rooted contexts* (e.g., a `where` clause shape that's identical across many Query nodes). A second pass with the actual FREQT/gSpan algorithm would catch that long tail. Recommended after the second corpus lands.
- **What's reliable vs. what to take with salt.** The function-call inventory is hard data — every count is an actual call site. The depth-3 subtree counts are also hard, but the *interpretation* ("this is the choice-type discrimination pattern") is mine and would benefit from a second eye (LLM naming + human curation in the next pass).
