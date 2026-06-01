# cms22 split (Imports Todo 5 verification)

This directory holds the operator's intended 4-layer split of the original
single-file `../cms22.crl` (1010 lines, too big for a human to navigate).

## Layout

| File | Library | Contents |
|---|---|---|
| `cms22.crl` | `"CMS22"` v1.0.0 | thin shell: `include "CMS22 Interface"` only |
| `cms22-interface.crl` | `"CMS22 Interface"` v1.0.0 | Initial Population / Numerator / Denominator / Exclusions / Exceptions (the measure entry points) |
| `cms22-inferred.crl` | `"CMS22 Inferred"` v1.0.0 | `defined as` + `definition is` concepts (measure logic) |
| `cms22-asserted.crl` | `"CMS22 Asserted"` v1.0.0 | `coded from` concepts (asserted FHIR resource-to-valueset bindings) |
| `cms22-terminology.crl` | `"CMS22 Terminology"` v1.0.0 | terminology declarations (valuesets, codes) + the Measurement Period runtime stub |

The interface library is the client-facing entry point: it `include`s the
inferred library, which `include`s the asserted library, which `include`s
the terminology library. The shell file just `include`s the interface
(transitive resolution pulls in the rest).

## Verification (2026-06-01)

End-to-end via the import-aware emit CLI:

```bash
node dist/cli/run-emitter.js \
  --path features/cql-pattern-mining/results/models/cms22-split/cms22.crl \
  --source-path features/cql-pattern-mining/results/models/cms22-split \
  --library-name CMS22
```

Output: 505-line CQL library identical (modulo the library identity line)
to the previously JAR-validated `cql/src/CMS22Generated.cql`:

```
$ diff cql/src/CMS22Generated.cql /tmp/cms22-split-emit.cql
1c1
< library CMS22Generated version '0.1.0'
---
> library CMS22 version '1.0.0'
```

That one-line delta is the new library identity declared in the split's
`cms22.crl` shell. Every other line is byte-identical, including
terminologies, asserted concept queries, defined-as compositions,
definition-is narrative emits, and the measure-API defines.

`cql/src/CMS22Generated.cql` is the JAR-validated reference (see
`cql/src/cms22-source-to-roundtrip-mapping.md` for the full audit).
The split-emitted CQL is therefore JAR-validated by transitivity —
same content, same emitter, same patterns library.

## How to re-emit

From the repo root:

```bash
npm run build  # rebuild dist/ if anything in src/ changed
node dist/cli/run-emitter.js \
  --path features/cql-pattern-mining/results/models/cms22-split/cms22.crl \
  --source-path features/cql-pattern-mining/results/models/cms22-split \
  --library-name CMS22
```

To validate (semantic checks):

```bash
node dist/cli/run-validator.js \
  --path features/cql-pattern-mining/results/models/cms22-split/cms22.crl \
  --source-path features/cql-pattern-mining/results/models/cms22-split \
  --pretty
```

## Relationship to the original single-file `../cms22.crl`

The original `features/cql-pattern-mining/results/models/cms22.crl` is
preserved as the historical reference. The split here is a demonstration
that the imports feature lets a human break the monolith into navigable
layers without changing the emitted CQL.
