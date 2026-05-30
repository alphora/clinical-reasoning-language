# extract-elm — coverage report

Decoded CQL source + slimmed ELM JSON trees for each source corpus. Re-run with `node features/cql-pattern-mining/scripts/extract-elm.mjs`.

Outputs:
- `data/cql/<corpus>/<libId>.cql` — decoded `text/cql` attachment (verbatim).
- `data/elm/<corpus>/<libId>.elm.json` — decoded `application/elm+json`, **slimmed**: only the `library.*` subset needed to interpret `statements/def` bodies, `annotation` stripped recursively. The original CQL source is in `data/cql/` if line/col context is needed.

## `dqm-content-qicore-2025`

- Library JSONs scanned: **93**
- has `text/cql` attachment: 91 / 93
- has `application/elm+xml` attachment: 91 / 93
- has `application/elm+json` attachment: 91 / 93
- CQL files written to `data/cql/dqm-content-qicore-2025/`: **91** (1.0 MB total)
- slim ELM files written to `data/elm/dqm-content-qicore-2025/`: **91** (56.7 MB total)
- total ELM `statements/def` entries (the mining target): **2344**
- libraries WITHOUT `application/elm+json` (would need local cql-to-elm to mine): **2**
  - `ecqm-fhir-update-2025-draft`
  - `ecqm-fhir-update-2025`

### ELM schema versions seen

- `r1`: 91

### `using` model versions seen (model@version : count)

- `System@?`: 91
- `QICore@?`: 89
- `FHIR@4.0.1`: 2
- `USCore@?`: 1

## Per-statement mining corpus

Aggregated from `data/elm/<corpus>/*.elm.json` into a single streaming file:

- `data/statements.jsonl` — one mining transaction (`statements/def` entry) per line, with corpus + library envelope. Each `def.expression` is a tree the subtree miner will ingest.
- Total records: **2344** from 91 libraries across 1 corpora.
- File size: 18.5 MB.

### `def.type` distribution

- `(none)`: 1752
- `FunctionDef`: 592

### `def.context` distribution

- `Patient`: 2047
- `Unfiltered`: 297

### Top 20 root `def.expression.type` (mining-target root kinds)

- `Query`: 740
- `ExpressionRef`: 426
- `Property`: 261
- `Exists`: 199
- `Union`: 145
- `SingletonFrom`: 107
- `And`: 79
- `Or`: 72
- `As`: 30
- `If`: 28
- `Last`: 25
- `First`: 22
- `Implies`: 21
- `Case`: 21
- `FunctionRef`: 18
- `Interval`: 15
- `In`: 15
- `Not`: 14
- `GreaterOrEqual`: 10
- `DateTime`: 7

