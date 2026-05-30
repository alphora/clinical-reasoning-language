# CQL pattern mining

> **Status: discovery — north star refined 2026-05-30 (after consultant coherence check + operator corrections; see `.vibe-tools/discussions/008-…md`).**

## North star

Build a **catalog of declarative clinical inferencing patterns** an informaticist uses as `apply pattern <Name>(args)` hints in CRL. The catalog is the deliverable.

The working intuition is that the right catalog lands **somewhere around 50** patterns if we're capturing what we're looking for. The number is a **signal, not a target** — if the answer turns out to be 20 or 100, that tells us something about what we caught or missed. Don't pad to reach 50; don't stop at 50 if the corpus warrants more.

CRL is the informaticist-accessible intermediary in narrative → FHIR + CQL. The `apply pattern` element lets the informaticist tell the AI agent "this is the *kind* of clinical reasoning happening here" — `apply pattern \`MostRecent(this, lookbackMonths)\``, `apply pattern \`Within(visit, hospitalization)\``, etc. The AI agent uses that hint to choose the right CQL shape to emit. Patterns are composable; **the informaticist composes them** (composites are their work product, not catalog entries).

### The load-bearing line: WHAT, not HOW

The catalog is a vocabulary of **declarative clinical intent** — what the informaticist *says* from the narrative. It is NOT a library of implementation primitives — how an emitter realizes those statements. This distinction is load-bearing; slipping into HOW is the recurring failure mode this north star exists to prevent.

| In scope (WHAT — declarative intent) | Out of scope (HOW — implementation) |
|---|---|
| `MostRecent(X)` — "the most recent X" | `[X] o sort by o.date desc → [0]` — how an emitter realizes MostRecent |
| `Within(event, period)` — "event occurs within period" | "Convert Period to Interval, check containment" |
| `HasHistoryOf(condition)` — "patient has history of condition" | Choice-type dispatch on `value[x]` |
| `Verified(diagnosis)` — clinical assertion of verification | `FHIRHelpers.ToValue(Property:performed)` |
| Active / process / state predicates an informaticist would say | Type conversions, value-set lookups, sort-take-aggregate plumbing |

Also out of scope: **quality-measure framework structure** (Initial Population, Numerator, Denominator, Exclusions, Exceptions, `SDE_*`, `Stratification_*`). That's the QM domain API — analogous to a framework's lifecycle hooks — not clinical reasoning. The clinical reasoning happens *inside* each slot; that's where patterns live.

Also out of scope: **CRL composition primitives** (`GreaterThan`, `Between`, `In` etc.). The patterns we want are higher-level like `Within`, which an emitter may realize *using* `GreaterThan`/`Between` under the hood. Separate tier.

A separate **helper-library catalog** (HOW-side, for the CRL→CQL emitter to draw on) is tracked under "identify helper libraries" in `issues/rough-backlog.md`.

### Naming

Names target the **informaticist/clinician** articulating clinical narrative — not the CQL community-of-practice. If `MostRecent` is what a doctor would naturally call the intent, that's the name. Existing CQL helper names (e.g. `QICoreCommon.prevalenceInterval`) are *evidence* that an intent recurs in practice — they aren't necessarily good catalog names.

### Success signal

A catalog of declarative intent labels at `results/inference-pattern-catalog.md` — count emerges from the corpus + the discrimination, with ~50 as the working intuition. Each entry:
- informaticist-natural name
- one-line declarative description ("the patient's most recent X" / "X occurred during Y")
- parameter sketch in plain clinical language
- category (primary; optional secondary)
- ≥3 example callers from the corpus (library :: statement name)
- recurring-shape evidence pointing to this intent

NO return types, NO implementation hints, NO composability typing scaffolding — the emitter handles all that.

**Concrete verification:** one real DQM measure re-expressed in CRL with `apply pattern` hints drawn from the catalog, where an informaticist reads it and recognizes the clinical intent.

the inference taxonomy is the receiving schema (Transformation, Normalization, Semantic Normalization, Classification, Qualification, Contextualization, Calculation, State/Process Inference, Statistical Inference, Assertion). Categories may be unevenly populated by the corpus — don't pad to balance.

## Approach — three-layer signal mining

Three signal layers, all yielding WHAT-level intent. **The HOW substrate is evidence, not catalog content.**

1. **Name** — statement names like "Most Recent BMI", "First Anesthesia During Hospitalization", "Patient Had Major Depression Active During Measurement Period" are the informaticist's own articulation of intent. Surface signal — cluster on normalized name tokens.

2. **Body — recurring implementation shapes that triangulate on shared clinical intent.** Authors who don't extract a helper still keep re-implementing the same shape: `[observation] o sort by o.date desc → [0]` reappears across measures because they all need "most recent X" but nobody named it. The shape is HOW; the intent it keeps re-expressing (`MostRecent of qualifying X`) is the WHAT we catalog. Structural mining is the triangulation tool — recurring HOW is *evidence* for shared WHAT.

3. **Meta — clinical reasoning compositions across multiple defines.** "Compute most recent X, then check exceeds threshold." "Exists positive evidence AND absence of contradictory evidence." "Active condition during period AND attempted treatment within window." Dependency graph between defines + clinical-assertion reading per cluster. **Framework boilerplate is excluded** — IP / Num / Den / Exclusions / SDE_* / Stratification_* is QM API, not clinical reasoning.

The discriminator at every layer is the WHAT/HOW test: *would the informaticist say this from the narrative, or is this something an emitter or framework worries about?* If the latter, it's out — no matter how often it recurs.

### Workflow

1. **Stratify the corpus.** Measure libraries (primary mining target), domain commons (secondary — close-to-named clinical shapes), implementation helpers (out — used as negative control set).
2. **Sample first.** 8–20 measures across clinical domains (screening, hospital flow, chronic disease, medication, OB/peds) — ~400–600 statements. Validate the approach before scaling to the full 2,344.
3. **Name × shape × meta join.** Cluster names, body shapes, and compositional meta-shapes. Where layers converge ("these 30 statements share name tokens + body shape + similar composition") → strong pattern candidate. Divergence is diagnostic.
4. **Pattern cards** per cluster: name, declarative description, parameter sketch, category, example callers, evidence (recurring shapes), anti-examples (where NOT to use it).
5. **Composability cross-check.** Try composing two patterns as the informaticist would write them. Awkward composition reveals wrong names or parameters.
6. **Validate.** Coverage on the sample (target ≥ 70% of non-boilerplate measure defines map to ≥ 1 pattern). Helpers as negative control (catalog should not match helper bodies). Round-trip readability test with an informaticist.
7. **Expand** to full corpus. Let the long tail populate whatever categories the corpus actually supports — don't pad to balance the inference taxonomy.

### Earlier discovery output (now evidence-only)

The function-call inventory (`data/patterns/function-refs.jsonl`), subtree-signature counts (`data/patterns/subtree-d*.jsonl`, `frequent-subtrees-d*.jsonl`), and the `results/mine-patterns.report.md` summary are **HOW-side evidence**. They are:
- **useful as triangulation input for Layer 2** here (recurring shapes may signal shared WHAT intent),
- **directly applicable to the helper-catalog backlog item**.

The `results/findings-first-pass.md` first pass was helper-shaped (it cataloged the inventory as patterns) and is superseded by this north star. Leaving it in place as a record of the first attempt.

## Layout

```
features/cql-pattern-mining/
├── README.md                # this file
├── sources/                 # gitignored — corpus drops (CQL + ELM bundles, each often its own git checkout)
│   └── <corpus-name>/
├── data/                    # gitignored — derived (decoded ELM trees, intermediate indices)
│   └── elm/<corpus>/
├── scripts/                 # committed — extraction + mining tooling
└── results/                 # committed — reports + catalog drafts
```

`sources/` and `data/` are gitignored. Source corpora typically ship their own `.git`, and the decoded ELM forest is large and regenerable.

## Current corpus

| Corpus | Source | Libraries | Notes |
|---|---|---|---|
| `dqm-content-qicore-2025` | CMS Digital Quality Measures, QI-Core, 2025 | 93 | each Library has `text/cql` + `application/elm+xml` + `application/elm+json` attachments |

Additional corpora will be dropped in `sources/` as needed.

## Pipeline

Two stages today (mining is the next stage):

1. **`scripts/extract-elm.mjs`** — per-library decode. Walks `sources/*/input/resources/library/*.json`, decodes the `text/cql` and `application/elm+json` attachments, and writes:
   - `data/cql/<corpus>/<libId>.cql` — the CQL source (verbatim, for human inspection and Comby/Semgrep-style verification once a pattern is named).
   - `data/elm/<corpus>/<libId>.elm.json` — the ELM tree, **slimmed**: only the `library.*` keys needed to interpret `statements/def` bodies (`identifier`, `schemaIdentifier`, `usings`, `includes`, `parameters`, `codeSystems`, `valueSets`, `codes`, `concepts`, `contexts`, `statements`), with `annotation` stripped recursively. The original source narrative + per-node line/col live in `data/cql/`.

2. **`scripts/build-statement-corpus.mjs`** — per-statement mining transactions. Walks `data/elm/<corpus>/*.elm.json` and flattens every `library.statements.def[]` into a streaming JSONL:
   - `data/statements.jsonl` — one line per statement, shape: `{ corpus, library: {id, version}, name, context, accessLevel, def: {...} }`. Each `def.expression` is a typed tree the (future) subtree miner will ingest. JSONL is the friendly input for streaming, filtering, partitioning, parallelizing.

Both stages append to `results/extract-elm.report.md`. Re-running overwrites.

```bash
node features/cql-pattern-mining/scripts/extract-elm.mjs
node features/cql-pattern-mining/scripts/build-statement-corpus.mjs
```

The two scripts split deliberately: per-library decode is one concern (corpus → derived artifacts), per-statement assembly is another (artifacts → mining transactions). If the mining unit changes later (e.g. per-subtree windows), only stage 2 changes.
