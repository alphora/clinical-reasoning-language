# CRL / CEL tooling — CLI and MCP reference

This is the reference for consuming the CRL toolchain. The package ships two surfaces:

- **CLI** — scripted invocation. The primary surface; use this from build scripts, CI, and host applications (e.g. KELP).
- **MCP** — Model Context Protocol tools, registered by a server the package ships. Use this from AI assistants (Claude Code, etc.) for interactive workflows.

For the **languages** themselves see [USER_GUIDE.md](./USER_GUIDE.md) (CRL) and [docs/cel-spec.md](./docs/cel-spec.md) (CEL).

---

## Overview

Two source languages, three emit targets:

```
                       ┌──────────────────────┐
                       │  CRL  (.crl)         │
                       │  authoring DSL       │
                       └─┬──────────────────┬─┘
                         │                  │
             ┌───────────▼───────────┐    ┌─▼───────────────────────────┐
             │ crl-emit              │    │ crl-emit                    │
             │ --target cql          │    │ --target fhir-def           │
             │ (default for .crl)    │    │ (writes BOTH lanes)         │
             └───┬───────────────────┘    └─┬───────────────────────────┘
                 │                          │
                 ▼                          ▼
         ┌───────────────┐    ┌─────────────────────────────────────────┐
         │ CQL (.cql)    │    │ FHIR Definition resources               │
         │ libraries     │◄───│   ValueSet, Library, ActivityDefinition,│
         │               │    │   PlanDefinition                        │
         │               │    │ Library.content[0].attachment.url       │
         │               │    │ points back at the sibling .cql         │
         └───────────────┘    └─────────────────────────────────────────┘

                       ┌──────────────────────┐
                       │  CEL  (.cel)         │      covers
                       │  case examples       ├──────────────► (CRL library closure
                       └─┬────────────────────┘                  validated against)
                         │
                   ┌─────▼─────────────┐
                   │ crl-emit          │
                   │ (no --target)     │
                   └─┬─────────────────┘
                     ▼
             ┌─────────────────────────────────┐
             │ FHIR instance resources         │
             │   Patient, Encounter,           │
             │   Observation, ServiceRequest,  │
             │   MedicationRequest, ...        │
             └─────────────────────────────────┘
```

| Source | What it is | What it produces |
|---|---|---|
| **CRL** | Author DSL for inference, decisions, activities, terminologies | CQL libraries; FHIR Definition resources (ValueSet, Library, ActivityDefinition, PlanDefinition) |
| **CEL** | Test-case DSL over a CRL library | FHIR instance resources (Patient + per-fact resources per case) |

A single CLI binary (`crl-emit`) dispatches all three emit paths by the input file's extension plus an optional `--target` flag.

---

## Installation

```bash
npm install @smile-digital-health/crl
```

CLI binaries are then available via `npx`:

```bash
npx crl-emit --help
npx crl-validate --path mylib.crl
```

For interactive authoring in VS Code with MCP integration, also install the bundled extension (`crl-language-support-X.Y.Z.vsix`); it auto-provisions `<workspace>/.mcp.json` so any MCP host (Claude Code, etc.) picks up the 7 tools automatically.

---

## CLI reference

### `crl-emit` — the dispatcher

```
crl-emit --path <file.{crl,cel}> --out-dir <dir> [--target <mode>] [--quiet]
crl-emit --help
```

**Flags**

| Flag | Required | Value | Default | Notes |
|---|---|---|---|---|
| `--path` | yes | path to `.crl` or `.cel` file | — | Absolute path recommended |
| `--out-dir` | yes | output directory | — | Created if missing |
| `--target` | for `.crl` | `cql` \| `fhir-def` | `cql` for `.crl`; rejected for `.cel` | See dispatch table below |
| `--quiet` | no | (flag) | off | Suppress per-file `wrote …` lines (`--target fhir-def` only) |
| `--help` / `-h` | no | (flag) | — | Print usage + exit 0 |

**Input → output dispatch**

| Input | `--target` | Output layout |
|---|---|---|
| `.crl` | (omitted) or `cql` | `<out-dir>/<library-name>.cql` (flat) |
| `.crl` | `fhir-def` | **BOTH lanes written atomically:** `<out-dir>/cql/<library-name>.cql` + `<out-dir>/fhir/<ResourceType>/<id>.json` |
| `.cel` | (omitted) | `<out-dir>/patient/<library-slug>/<case-slug>/<ResourceType>/<id>.json` (KALM-style per-case tree) |
| `.cel` | any | **Hard error** — CEL has its own pipeline; `--target` is rejected |

**Atomic-write contract** (`--target fhir-def` only): either both the CQL lane AND the FHIR-def lane succeed and write, or neither writes. This guarantees the emitted `Library.content[0].attachment.url = "../../cql/<name>.cql"` references always resolve.

**Exit codes**

| Code | Meaning | Typical CI handling |
|---|---|---|
| `0` | Success | green |
| `1` | Hard error — parse failure, unresolved reference, write failure, incompatible flags | fail |
| `2` | Soft warnings — unresolved bare refs, empty terminologies, ASCII-fallback slugs, unmatched concept narratives, `result-deferred` outcomes | warn (your call whether to gate on it) |

`--target fhir-def` walks the import closure from the input `.crl` file's nearest `package.json`. Cross-library qualified refs (`"OtherLib"."X"`) resolve through that closure.

### `crl-validate` — validate without emitting

```
crl-validate --path <file.crl> [--soft]
```

Runs semantic validation (name uniqueness, reference resolution, cycle detection — both concept and decision-delegation) on the file and prints `{success, errors[], warnings[]}` as JSON on stdout. Always exits 0.

In `--soft` mode, reference-resolution errors demote to warnings (useful while authoring); cycles + duplicate-name errors never demote.

### Common combinations

```bash
# Lint a CRL file
npx crl-validate --path lib.crl | jq .success

# Emit CQL only (flat layout — legacy)
npx crl-emit --path lib.crl --out-dir out/

# Emit FHIR-def + CQL together (atomic two-lane write)
npx crl-emit --path lib.crl --out-dir out/ --target fhir-def

# Emit FHIR instances from CEL test cases
npx crl-emit --path cases.cel --out-dir out/

# CI exit-code gate
npx crl-emit --path lib.crl --out-dir out/ --target fhir-def --quiet
case $? in
  0) echo "clean" ;;
  1) echo "hard error"; exit 1 ;;
  2) echo "warnings"   ;;
esac
```

---

## MCP reference

The bundled MCP server registers **7 tools** for interactive AI workflows. Each returns a JSON envelope on success; invalid arguments (XOR violation, unreadable path, oversized input) come back as a tool error.

| Tool | Input | Returns | Use when |
|---|---|---|---|
| [`tokenize_crl`](#tokenize_crl) | CRL source | `Token[]` | Token-level inspection |
| [`build_crl_ast`](#build_crl_ast) | CRL source | AST root | Structural inspection (no semantic check) |
| [`validate_crl`](#validate_crl) | CRL source + project context | `{success, errors[], warnings[]}` | Pre-emit correctness check |
| [`validate_cel`](#validate_cel) | `.cel` path + project context | `{success, errors[], warnings[]}` | Pre-emit CEL correctness check |
| [`emit_cql`](#emit_cql) | CRL source | `{success, result, errors?, unmatched?, futureExpressions?}` | CRL → CQL |
| [`emit_crl_fhir`](#emit_crl_fhir) | `.crl` path | Summary or full resource envelope | CRL → FHIR Definition resources |
| [`emit_cel`](#emit_cel) | `.cel` path | Summary or full case envelope | CEL → FHIR instance resources |

### Input conventions

Tools that take CRL source accept **exactly one** of:

- `code` (string) — inline CRL text. Empty string is a valid (degenerate) document.
- `path` (string) — file path. Absolute path recommended; relative paths resolve against the MCP server's working directory, not the workspace.

Tools that need project context (the validators, FHIR-def emit, CEL emit) require `path` and walk to the nearest `package.json` to find the closure.

### Tool details

<a id="tokenize_crl"></a>**`tokenize_crl`** — lex CRL into tokens.
- Input: `{ code?: string, path?: string }`
- Returns: `{ success, result?: Token[], errors? }` where each token is `{ line, column, type, text }`

<a id="build_crl_ast"></a>**`build_crl_ast`** — parse + build AST.
- Input: `{ code?: string, path?: string }`
- Returns: `{ success, result?: AST, errors? }`. `success: true` means lexing/parsing/AST construction succeeded — **NOT** that semantic validation passed.

<a id="validate_crl"></a>**`validate_crl`** — semantic validation.
- Input: `{ code?: string, path?: string, soft?: boolean }`
- Returns: `{ success, errors[], warnings[] }`
- **Project mode** (when `path` provided): walks to the nearest `package.json` and validates in the context of sibling local libraries + `node_modules` packages. Qualified refs like `"OtherLib"."X"` resolve the same way they do for in-editor diagnostics.
- **Single-file mode** (when `code` provided): no sibling context.
- Error kinds: `empty-name`, `duplicate-name`, `unresolved-reference`, `qualified-ref-unresolved`, `external-library-not-included`, `reference-cycle`, `decision-delegation-cycle`.
- `soft: true` demotes reference-resolution kinds to warnings; cycles + duplicate-name never demote.

<a id="validate_cel"></a>**`validate_cel`** — validate a CEL document against its covered CRL closure.
- Input: `{ path: string, soft?: boolean }` (path required — inline `code` not supported)
- Returns: `{ success, errors[], warnings[] }`
- Error kinds: `unresolved-bare-type`, `unresolved-qualified-library`, `unresolved-qualified-declaration`, `unresolved-result-leaf`, `invalid-result-shape`, `invalid-result-leaf-kind`, `unresolved-result-branch`, `result-leaf-not-boolean-valued`, `unresolved-fact-ref`, `duplicate-fact-name`, `duplicate-case-name`, `unresolved-cel-include`, `alias-not-yet-supported`, plus passthrough kinds from the resolver (`parse-failure`, `project-root-not-found`, `unresolved-covers`, `covers-missing-but-cases-present`, `crl-import`).
- `soft: true` silences `unsupported-yet` + `alias-not-yet-supported` warnings; reference-resolution + structural errors stay strict.

<a id="emit_cql"></a>**`emit_cql`** — CRL → CQL.
- Input: `{ code?: string, path?: string, libraryName?: string }`
- Returns: `{ success, result?, errors?, unmatched?, futureExpressions? }`
- On full success, `result` is the generated CQL targeting the bundled `CRLPatterns` library (unversioned `include`).
- When at least one `- definition is …` body fails to match a catalog pattern, `success: false` and `unmatched[]` lists each failing narrative. The emitted CQL still populates `result` with compile-failing `CRLPatterns.UnmatchedNarrative(…)` sentinels so downstream CQL translation fails loudly.
- `meta is` annotations on concepts emit as a leading block comment on each `define`. `@crl-future-expression: <body>` annotations also surface as structured `futureExpressions[]` records `{conceptName, expression, line, column}` — informational, does NOT force `success: false`.

<a id="emit_crl_fhir"></a>**`emit_crl_fhir`** — CRL → FHIR Definition resources.
- Input: `{ path: string, includeResources?: boolean }` (path required + absolute)
- Returns a summary envelope by default:
  ```
  { success, resourceCount, resourceManifest: [{resourceType, id, relativePath, sourceKind, sourceName}],
    errors, unmatched, importDiagnostics, metadataErrors }
  ```
- `includeResources: true` adds `resources[]` with the full FHIR JSON.
- The closure walks from the file's nearest `package.json`.
- Emitted resources carry NO `version` field (consumer's package owns the version).
- `meta.profile` canonicals: `cpg-strategydefinition`, `cpg-recommendationdefinition` (CPG IG); `crmi-publishableplandefinition`, `crmi-shareablevalueset` (CRMI IG); `cqf-knowledgeCapability`, `cqf-knowledgeRepresentationLevel` (FHIR-core).
- Cross-library concept/terminology refs are unsupported in v0; same-library qualified refs `"CurrentLib"."X"` resolve as bare locals.
- `any:` qualifier emits a `crl-logical-switch` extension URL (StructureDefinition not yet shipped — pending CPG ballot).

<a id="emit_cel"></a>**`emit_cel`** — CEL → FHIR instance resources.
- Input: `{ path: string, includeResources?: boolean }` (path required + absolute)
- Returns a summary envelope by default:
  ```
  { success, caseCount, resourceCount,
    caseManifest:     [{caseSlug, librarySlug, resourceCount}],
    resourceManifest: [{caseSlug, resourceType, id, outputPath}],
    diagnostics }
  ```
- `includeResources: true` adds `emittedCases[]` with full FHIR JSON.
- `success: true` iff there are zero error-severity diagnostics. Diagnostic kinds include `unsupported-yet`, `result-deferred`, `precondition-failed`.

---

## Integration with the KELP application framework

KELP is the canonical host consumer for this toolchain. KELP defines a filesystem contract for a clinical artifact project; the CRL CLI is the engine that materializes the generated lanes of that contract.

### KELP's filesystem contract → CLI invocation map

| KELP folder | Contains | Authored by | CLI invocation that writes it |
|---|---|---|---|
| `src/crl/` | N `.crl` files (one per CRL library in the project) | operator / agent (authored) | — (sources, not generated) |
| `src/cel/` | N `.cel` files (one per case-example library) | operator / agent (authored) | — (sources, not generated) |
| `src/scn/<id>.csv` | Scenario CSV (feeds CEL) | operator | — (sources, not generated) |
| `src/cql/` | N `.cql` files | `crl-emit … --target fhir-def` (and the CQL lane of `--target cql`) | `npx crl-emit --path src/crl/<entry>.crl --out-dir . --target fhir-def` writes `src/cql/<library>.cql` |
| `src/fhir/` | N `.json` files (ValueSet / Library / ActivityDef / PlanDef) | `crl-emit … --target fhir-def` | same call — writes `src/fhir/<ResourceType>/<id>.json` alongside `src/cql/` |
| `tests/data/fhir/patient/<patient>/...` | N subfolders, each with FHIR instance JSON | `crl-emit` on `.cel` | `npx crl-emit --path src/cel/<entry>.cel --out-dir tests/data` writes `tests/data/patient/<library>/<case>/<ResourceType>/*.json` |

### Two ways to drive the CRL engine from KELP

**1. CLI (host-driven, scripted).** The KELP host (or a CI step) invokes `crl-emit` directly for the four engineering folders (`src/cql/`, `src/fhir/`, plus the CEL instance tree under `tests/data/`). Deterministic, reproducible, suitable for build pipelines.

```bash
# From a KELP project root:
npx crl-emit --path src/crl/cms22.crl       --out-dir . --target fhir-def   # writes src/cql/* + src/fhir/*
npx crl-emit --path src/cel/cms22-cases.cel --out-dir tests/data            # writes tests/data/patient/...
```

The atomic two-lane contract for `--target fhir-def` is the right primitive here: a single CRL change regenerates both lanes together, so `Library.content` URLs never drift.

**2. MCP (agent-driven, interactive).** KELP's agent host (e.g. Claude Code) calls the MCP tools directly. Useful for the read-only inspection tools (`tokenize_crl`, `build_crl_ast`, `validate_crl`, `validate_cel`) where the agent is reasoning about author intent, and for the emit tools when the agent wants the structured envelope (e.g. `emit_crl_fhir`'s summary manifest) without touching the filesystem.

The two surfaces are equivalent for the emit tools — the CLI produces the same FHIR JSON the MCP tool returns. Pick the surface that fits the call site: CLI for batch / CI / KELP-host filesystem writes; MCP for interactive AI workflows.

### Lock / clean rule

KELP's filesystem contract treats the four generated folders (`src/cql/`, `src/fhir/`, the CEL instance tree) as **engine-owned**: do not hand-edit. The CRL CLI is the only writer. A clean rebuild from `src/crl/` + `src/cel/` is always the source of truth.

---

## Related reading

- [README.md](./README.md) — install + features overview
- [USER_GUIDE.md](./USER_GUIDE.md) — CRL language reference
- [docs/cel-spec.md](./docs/cel-spec.md) — CEL language reference
- [features/cql-pattern-mining/results/inference-pattern-catalog-draft.md](./features/cql-pattern-mining/results/inference-pattern-catalog-draft.md) — narrative-pattern catalog (the matchable forms `definition is <…>` accepts)
