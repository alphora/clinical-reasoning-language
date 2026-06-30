# cms69 (4-layer source-typed layout)

The 4-layer split of the original single-file `cms69.crl` (867 lines),
mirroring the cms22 layout. Folder, filename prefix, and package `name`
are all the measure id (`cms69`); the CQL library declarations use the
policy-id source-typed form.

## Layout

| File | Library | Layer | Contents |
|---|---|---|---|
| `cms69.crl` | `"cms69"` | interface | Initial Population / Numerator / Denominator / Exclusions / Exceptions — the Quality Measure API (what the Measure evaluation engine consumes) |
| `cms69-inferred.crl` | `"cms69-Inferred"` | inferred | `defined as` + `definition is` concepts: lifted property concepts, BMI classifications, intervention bundles, pregnancy logic, age predicate |
| `cms69-recordsource.crl` | `"cms69-RecordSource"` | record-source | `coded from` concepts (asserted FHIR resource-to-valueset bindings) |
| `cms69-recordconcepts.crl` | `"cms69-RecordConcepts"` | terminology | terminology declarations (valuesets, codes) + the Measurement Period runtime parameter (declarative since v2.2.0) |

The unsuffixed file (`cms69.crl`) is the interface layer — this matches
the CQL convention where `cms69.cql` is the entry point downstream consumers
(FHIR Measure resources, registries) reference.

The layer tokens (`RecordConcepts` / `RecordSource` / `Inferred`) are
PascalCase, matching the auto-split convention (Concepts→RecordConcepts,
Asserted→RecordSource). The measure root (`cms69`) and the strategy
(`cms69-strategy`) are lowercase — the strategy is not a layer.

Cross-layer refs use the qualified `"OtherLib"."Name"` syntax (e.g.
`coded from "cms69-RecordConcepts"."Body Mass Index Observations"`). Per
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
  --path packages/crl/src/tests/fixtures/corpus/cms69/cms69.crl \
  --out-dir /tmp/cms69-out
```

v2.1.0 per-CRL emit produces one `.cql` file per CRL library:
`cms69.cql`, `cms69-Inferred.cql`, `cms69-RecordSource.cql`, `cms69-RecordConcepts.cql`.
Cross-library refs emit as CQL native `"OtherLib"."Name"`.

To validate:

```bash
node dist/cli/run-validator.js \
  --path packages/crl/src/tests/fixtures/corpus/cms69/cms69.crl \
  --pretty
```
