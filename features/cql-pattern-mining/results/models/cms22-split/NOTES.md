# cms22 split (4-layer layout)

The operator's 4-layer split of the original single-file `../cms22.crl`
(1010 lines, too big for a human to navigate).

## Layout

| File | Library | Layer | Contents |
|---|---|---|---|
| `cms22.crl` | `"CMS22"` | interface | Initial Population / Numerator / Denominator / Exclusions / Exceptions — the Quality Measure API (what the Measure evaluation engine consumes) |
| `cms22-inferred.crl` | `"CMS22 Inferred"` | inferred | `defined as` + `definition is` concepts (measure logic) |
| `cms22-asserted.crl` | `"CMS22 Asserted"` | asserted | `coded from` concepts (asserted FHIR resource-to-valueset bindings) |
| `cms22-terminology.crl` | `"CMS22 Terminology"` | terminology | terminology declarations (valuesets, codes) + the Measurement Period runtime stub |

The unsuffixed file (`cms22.crl`) is the interface layer — this matches
the CQL convention where `CMS22.cql` is the entry point downstream consumers
(FHIR Measure resources, registries) reference.

Cross-layer refs use the qualified `"OtherLib"."Name"` syntax (e.g.
`coded from "CMS22 Terminology"."Encounter to Screen for Blood Pressure"`).
Per v2.1.0 lock 026, local sibling libraries auto-resolve via qualified
refs without an `include`, so none of these files carry an `include` line.
The per-CRL emitter still produces a self-contained CQL dependency graph
by emitting a CQL `include` for every cross-library reference it sees in
each layer's body. (For an externally-`npm install`ed CRL package the
`include "Pkg".` line is still required at the CRL level — that's how
v2.1.0 distinguishes local siblings from external deps.)

## How to re-emit

From the repo root:

```bash
npm run build
node dist/cli/run-emitter.js \
  --path features/cql-pattern-mining/results/models/cms22-split/cms22.crl \
  --out-dir /tmp/cms22-split-out
```

v2.1.0 per-CRL emit produces one `.cql` file per CRL library:
`CMS22.cql`, `CMS22 Inferred.cql`, `CMS22 Asserted.cql`, `CMS22 Terminology.cql`.
Cross-library refs emit as CQL native `"OtherLib"."Name"`.

To validate:

```bash
node dist/cli/run-validator.js \
  --path features/cql-pattern-mining/results/models/cms22-split/cms22.crl \
  --pretty
```

## Relationship to the original single-file `../cms22.crl`

The original `features/cql-pattern-mining/results/models/cms22.crl` is
preserved as the historical reference. This split demonstrates that the
imports feature lets a human break the monolith into navigable layers —
and under v2.1.0 per-CRL emit, those layers become separate CQL libraries
in the output.
