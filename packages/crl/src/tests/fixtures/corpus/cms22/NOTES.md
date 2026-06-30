# cms22 (4-layer source-typed layout)

The operator's 4-layer split of the original single-file `cms22.crl`
(1010 lines, too big for a human to navigate). Folder, filename prefix,
and package `name` are all the measure id (`cms22`); the CQL library
declarations use the policy-id source-typed form.

## Layout

| File | Library | Layer | Contents |
|---|---|---|---|
| `cms22.crl` | `"cms22"` | interface | Initial Population / Numerator / Denominator / Exclusions / Exceptions — the Quality Measure API (what the Measure evaluation engine consumes) |
| `cms22-inferred.crl` | `"cms22-Inferred"` | inferred | `defined as` + `definition is` concepts (measure logic) |
| `cms22-recordsource.crl` | `"cms22-RecordSource"` | record-source | `coded from` concepts (asserted FHIR resource-to-valueset bindings) |
| `cms22-recordconcepts.crl` | `"cms22-RecordConcepts"` | terminology | terminology declarations (valuesets, codes) + the Measurement Period runtime parameter (declarative since v2.2.0) |

The unsuffixed file (`cms22.crl`) is the interface layer — this matches
the CQL convention where `cms22.cql` is the entry point downstream consumers
(FHIR Measure resources, registries) reference.

The layer tokens (`RecordConcepts` / `RecordSource` / `Inferred`) are
PascalCase, matching the auto-split convention (Concepts→RecordConcepts,
Asserted→RecordSource). The measure root (`cms22`) and the strategy
(`cms22-strategy`) are lowercase — the strategy is not a layer.

Cross-layer refs use the qualified `"OtherLib"."Name"` syntax (e.g.
`coded from "cms22-RecordConcepts"."Encounter to Screen for Blood Pressure"`).
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
  --path packages/crl/src/tests/fixtures/corpus/cms22/cms22.crl \
  --out-dir /tmp/cms22-out
```

v2.1.0 per-CRL emit produces one `.cql` file per CRL library:
`cms22.cql`, `cms22-Inferred.cql`, `cms22-RecordSource.cql`, `cms22-RecordConcepts.cql`.
Cross-library refs emit as CQL native `"OtherLib"."Name"`.

To validate:

```bash
node dist/cli/run-validator.js \
  --path packages/crl/src/tests/fixtures/corpus/cms22/cms22.crl \
  --pretty
```
