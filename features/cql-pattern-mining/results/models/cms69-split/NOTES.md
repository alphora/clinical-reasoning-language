# cms69 split (4-layer layout)

The 4-layer split of the original single-file `../cms69.crl` (867 lines),
mirroring the cms22-split layout.

## Layout

| File | Library | Layer | Contents |
|---|---|---|---|
| `cms69.crl` | `"CMS69"` | interface | Initial Population / Numerator / Denominator / Exclusions / Exceptions — the Quality Measure API (what the Measure evaluation engine consumes) |
| `cms69-inferred.crl` | `"CMS69 Inferred"` | inferred | `defined as` + `definition is` concepts: lifted property concepts, BMI classifications, intervention bundles, pregnancy logic, age predicate |
| `cms69-asserted.crl` | `"CMS69 Asserted"` | asserted | `coded from` concepts (asserted FHIR resource-to-valueset bindings) |
| `cms69-terminology.crl` | `"CMS69 Terminology"` | terminology | terminology declarations (valuesets, codes) + the Measurement Period runtime parameter (declarative since v2.2.0) |

The unsuffixed file (`cms69.crl`) is the interface layer — this matches
the CQL convention where `CMS69.cql` is the entry point downstream consumers
(FHIR Measure resources, registries) reference.

Cross-layer refs use the qualified `"OtherLib"."Name"` syntax (e.g.
`coded from "CMS69 Terminology"."Body Mass Index Observations"`). Per
v2.1.0 lock 026, local sibling libraries auto-resolve via qualified refs
without an `include`, so none of these files carry an `include` line. The
per-CRL emitter still produces a self-contained CQL dependency graph by
emitting a CQL `include` for every cross-library reference it sees in
each layer's body. (For an externally-`npm install`ed CRL package the
`include "Pkg".` line is still required at the CRL level — that's how
v2.1.0 distinguishes local siblings from external deps.)

## How to re-emit

From the repo root:

```bash
npm run build
node dist/cli/run-emitter.js \
  --path features/cql-pattern-mining/results/models/cms69-split/cms69.crl \
  --out-dir /tmp/cms69-split-out
```

v2.1.0 per-CRL emit produces one `.cql` file per CRL library:
`CMS69.cql`, `CMS69 Inferred.cql`, `CMS69 Asserted.cql`, `CMS69 Terminology.cql`.
Cross-library refs emit as CQL native `"OtherLib"."Name"`.

To validate:

```bash
node dist/cli/run-validator.js \
  --path features/cql-pattern-mining/results/models/cms69-split/cms69.crl \
  --pretty
```

## Relationship to the original single-file `../cms69.crl`

The original `features/cql-pattern-mining/results/models/cms69.crl` is
preserved as the historical reference. This split demonstrates that the
imports feature lets a human break the monolith into navigable layers —
and under v2.1.0 per-CRL emit, those layers become separate CQL libraries
in the output.
