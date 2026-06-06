# CRL / CEL tooling — CLI and MCP reference

This document is the reference for the **interfaces** to the CRL toolchain — the command-line entrypoints and the Model Context Protocol (MCP) tools that AI assistants can use. For the **languages** themselves, see [USER_GUIDE.md](./USER_GUIDE.md) (CRL) and [docs/cel-spec.md](./docs/cel-spec.md) (CEL).

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

| Source | Purpose | Emits |
|---|---|---|
| **CRL** | Author inference logic, decision trees, activities, terminologies | CQL libraries; FHIR Definition resources (ValueSet, Library, ActivityDefinition, PlanDefinition) |
| **CEL** | Author test cases over a CRL library | FHIR instance resources (Patient + per-fact resources per case) |

Two interface surfaces:

| Surface | Audience | Entry points |
|---|---|---|
| **CLI** | Scripts, CI pipelines, batch operations | `crl-emit`, `crl-validate`, `crl-lex`, `crl-parse`, `crl-ast`, `crl-template-match`, `crl-mcp` |
| **MCP** | AI assistants (Claude Code, etc.) | 7 tools registered by `crl-mcp` |

---

## Installation

```bash
npm install @smile-digital-health/crl
```

All CLI entry points become available as binaries:

```bash
npx crl-emit --help
npx crl-validate --path mylib.crl
```

For VS Code authoring + MCP integration, install the extension:

```bash
code --install-extension extension/crl-language-support-X.Y.Z.vsix --force
```

The extension auto-provisions `<workspace>/.mcp.json` pointing at a stable `crl-mcp` server — Claude Code (or any MCP host) picks up the 7 tools automatically. See [provision.ts](./extension/src/provision.ts) for the auto-provisioning behavior.

---

## CLI reference

### `crl-emit` — emit CQL or FHIR resources

The single multi-target emit entrypoint. Dispatches on input extension + `--target` flag.

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
| `--quiet` | no | (flag) | off | Suppress per-file `wrote …` lines (only meaningful with `--target fhir-def`) |
| `--help` / `-h` | no | (flag) | — | Print usage + exit 0 |

**Input → output dispatch**

| Input | `--target` | Output layout |
|---|---|---|
| `.crl` | (omitted) or `cql` | `<out-dir>/<library-name>.cql` (flat — v2.2.x behavior) |
| `.crl` | `fhir-def` | **BOTH lanes written atomically:** `<out-dir>/cql/<library-name>.cql` + `<out-dir>/fhir/<ResourceType>/<id>.json` |
| `.cel` | (omitted) | `<out-dir>/patient/<library-slug>/<case-slug>/<ResourceType>/<id>.json` (KALM-style per-case tree) |
| `.cel` | any | **Hard error** — CEL has its own pipeline; `--target` is rejected |

**Atomic write contract** (`--target fhir-def` only): either both the CQL lane AND the FHIR-def lane succeed and write, or neither writes. This guarantees emitted `Library.content[0].attachment.url = "../../cql/<name>.cql"` references always resolve.

**Exit codes**

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Hard error — parse failure, unresolved reference, write failure, incompatible flags |
| `2` | Soft warnings — unresolved bare refs, empty terminologies, ASCII-fallback slugs, unmatched concept narratives, `result-deferred` outcomes |

### `crl-validate` — validate without emitting

Runs semantic validation (name uniqueness, reference resolution, cycle detection, decision-delegation cycles) on a `.crl` file.

```
crl-validate --path <file.crl> [--soft]
```

In `--soft` mode, reference-resolution errors demote to warnings (useful while authoring); structural errors (cycles, name uniqueness) stay strict.

Returns `{ success, errors[], warnings[] }` as JSON on stdout. Exit 0 always.

### `crl-mcp` — start the MCP server

```
crl-mcp
```

Speaks the Model Context Protocol over stdio. Used by the VS Code extension's auto-provisioning; usually not invoked directly. See [MCP reference](#mcp-reference) below for the 7 tools it exposes.

### Lower-level tools

For grammar / lexer / matcher debugging:

| Bin | Purpose |
|---|---|
| `crl-lex` | Tokenize a `.crl` file and print the token stream |
| `crl-parse` | Parse a `.crl` file and print parser-level result |
| `crl-ast` | Build the full AST and print it |
| `crl-template-match` | Run a narrative through the catalog matcher and print the canonical pattern call |

Each accepts `--path <file>` or `--code "<source>"`.

---

## MCP reference

The `crl-mcp` server registers **7 tools**. Each tool returns a JSON envelope on success; bad arguments (XOR violation, unreadable path, oversized input) come back as a tool error.

| Tool | Input | Returns | Use when |
|---|---|---|---|
| [`tokenize_crl`](#tokenize_crl) | CRL source | `Token[]` | Token-level inspection |
| [`build_crl_ast`](#build_crl_ast) | CRL source | AST root | Structural inspection |
| [`validate_crl`](#validate_crl) | CRL source + project context | `{success, errors[], warnings[]}` | Pre-emit correctness check |
| [`validate_cel`](#validate_cel) | `.cel` path + project context | `{success, errors[], warnings[]}` | Pre-emit CEL correctness check |
| [`emit_cql`](#emit_cql) | CRL source | `{success, result, errors?, unmatched?, futureExpressions?}` | CRL → CQL |
| [`emit_crl_fhir`](#emit_crl_fhir) | `.crl` path | Summary or full resource envelope | CRL → FHIR Definition resources |
| [`emit_cel`](#emit_cel) | `.cel` path | Summary or full case envelope | CEL → FHIR instance resources |

### Input conventions

Every tool that takes CRL source accepts **exactly one** of:

- `code` (string) — inline CRL text. Empty string is a valid (degenerate) document.
- `path` (string) — file path. Absolute path recommended; relative paths resolve against the MCP server's working directory, not the workspace.

Tools that need project context (validators, FHIR-def emit, CEL emit) require `path` and walk to the nearest `package.json` to find the closure.

### Tool details

<a id="tokenize_crl"></a>**`tokenize_crl`** — lex CRL into tokens.

```
{ code?: string, path?: string }
```

Returns `{ success: boolean, result?: Token[], errors?: CRLError[] }`. Token shape: `{ line, column, type, text }`.

---

<a id="build_crl_ast"></a>**`build_crl_ast`** — parse + build AST.

```
{ code?: string, path?: string }
```

Returns `{ success, result?: AST, errors?: CRLError[] }`. `success: true` means lexing/parsing/AST construction succeeded — **NOT** that semantic validation passed. AST root: `{ type: 'CRL', header?, library?, includes[], statements[], location }`.

---

<a id="validate_crl"></a>**`validate_crl`** — semantic validation.

```
{ code?: string, path?: string, soft?: boolean }
```

When `path` is provided, runs in **project mode**: walks to the nearest `package.json` and validates the file in the context of its sibling local libraries + `node_modules` packages — qualified refs like `"OtherLib"."X"` resolve the same way they do for VS Code in-editor diagnostics. When `code` is provided, runs in **single-file mode** (no sibling context).

Returns `{ success, errors[], warnings[] }`. Error kinds include:

- `empty-name`, `duplicate-name`
- `unresolved-reference`, `qualified-ref-unresolved`, `external-library-not-included`
- `reference-cycle` (concepts), `decision-delegation-cycle` (decisions — added in v2.5.0)

In `soft: true`, reference-resolution kinds demote to warnings; cycle and duplicate-name errors never demote.

---

<a id="validate_cel"></a>**`validate_cel`** — semantic validation of a `.cel` document against its covered CRL closure.

```
{ path: string, soft?: boolean }
```

`path` is required — CEL validation needs the file's project root to walk the CRL closure (inline `code` not supported).

Returns `{ success, errors[], warnings[] }`. Error kinds include:

- `unresolved-bare-type`, `unresolved-qualified-library`, `unresolved-qualified-declaration`
- `unresolved-result-leaf`, `invalid-result-shape`, `invalid-result-leaf-kind`
- `unresolved-result-branch` (added v2.5.0 — branch string must be a direct arm of the decision)
- `result-leaf-not-boolean-valued` (added v2.5.0 — `is true|false` requires `value type is boolean`)
- `unresolved-fact-ref`, `duplicate-fact-name`, `duplicate-case-name`
- `unresolved-cel-include`, `alias-not-yet-supported`
- Passthrough kinds from the resolver: `parse-failure`, `project-root-not-found`, `unresolved-covers`, `covers-missing-but-cases-present`, `crl-import`

In `soft: true`, `unsupported-yet` + `alias-not-yet-supported` warnings are silenced; reference resolution and structural errors stay strict.

---

<a id="emit_cql"></a>**`emit_cql`** — CRL → CQL.

```
{ code?: string, path?: string, libraryName?: string }
```

Returns `{ success, result?, errors?, unmatched?, futureExpressions? }`. On full success, `result` is the generated CQL targeting the `CRLPatterns` library (`cql/src/CRLPatterns.cql`).

**Issue #79 (unmatched narrative)** — when one or more `- definition is …` bodies fail to match a catalog pattern, `success: false`, `unmatched[]` lists each failing narrative `{text, line, column}`, and the emitted CQL still populates `result` with a compile-failing `CRLPatterns.UnmatchedNarrative(…)` sentinel for each unmatched spot.

**Issue #108 (future expressions)** — when a concept carries `@crl-future-expression: <body>` in a `meta is` line, the emitted CQL gets a leading block comment AND `futureExpressions[]` is populated with `{conceptName, expression, line, column}` records. Does NOT force `success: false`.

**No version** — the emitted `library` declaration is unversioned; `include CRLPatterns` is also unversioned.

---

<a id="emit_crl_fhir"></a>**`emit_crl_fhir`** — CRL → FHIR Definition resources.

```
{ path: string, includeResources?: boolean }
```

`path` is required and must be absolute. The closure orchestrator walks to the nearest `package.json`.

Returns a **summary envelope** by default to keep tool output small:

```
{
  success: boolean,
  resourceCount: number,
  resourceManifest: [{ resourceType, id, relativePath, sourceKind, sourceName }],
  errors: CRLError[],
  unmatched: UnmatchedReference[],
  importDiagnostics: ImportDiagnostic[],
  metadataErrors: MetadataError[]
}
```

Pass `includeResources: true` to also receive `resources[]` with the full FHIR JSON.

**Notes:**
- Emitted resources carry NO `version` field (npm package owns the version).
- `meta.profile` canonicals are stamped per v2.5.1's #104 remap: `cpg-strategydefinition`, `cpg-recommendationdefinition` (CPG IG); `crmi-publishableplandefinition`, `crmi-shareablevalueset` (CRMI IG); `cqf-knowledgeCapability`, `cqf-knowledgeRepresentationLevel` (FHIR-core).
- Cross-library concept/terminology refs are unsupported in v0; same-library qualified refs `"CurrentLib"."X"` resolve as bare locals.
- `any:` qualifier emits a `crl-logical-switch` extension URL; the StructureDefinition is not yet shipped (pending CPG ballot).

---

<a id="emit_cel"></a>**`emit_cel`** — CEL → FHIR instance resources.

```
{ path: string, includeResources?: boolean }
```

`path` is required and must be absolute. The resolver walks to the nearest `package.json` to load the covered CRL closure.

Returns a **summary envelope** by default:

```
{
  success: boolean,
  caseCount: number,
  resourceCount: number,
  caseManifest:     [{ caseSlug, librarySlug, resourceCount }],
  resourceManifest: [{ caseSlug, resourceType, id, outputPath }],
  diagnostics: EmitDiagnostic[]
}
```

Pass `includeResources: true` to receive `emittedCases[]` with the full FHIR JSON.

`success: true` iff there are zero error-severity diagnostics. Diagnostic kinds include:

- `unsupported-yet` — a fact's `defined by` couldn't derive a bare FHIR type; case is skipped
- `result-deferred` — a `result is` line was parsed but outcome emit is deferred to #70 / `metric`
- `precondition-failed` — parse error / unresolved covers / etc.; case skipped

---

## Quick recipes

### Validate a CRL file before emit

```bash
npx crl-validate --path mylib.crl | jq .success
```

### Emit CQL flat

```bash
npx crl-emit --path mylib.crl --out-dir out/
# → out/MyLib.cql, out/MyLib Inferred.cql, ...
```

### Emit FHIR Definition resources + paired CQL

```bash
npx crl-emit --path mylib.crl --out-dir out/ --target fhir-def
# → out/cql/MyLib.cql
# → out/fhir/Library/mylib.json
# → out/fhir/ValueSet/*.json
# → out/fhir/ActivityDefinition/*.json
# → out/fhir/PlanDefinition/*.json
```

### Emit FHIR instances from a CEL case file

```bash
npx crl-emit --path mycases.cel --out-dir out/
# → out/patient/<library-slug>/<case-slug>/<ResourceType>/*.json
```

### Programmatic use of MCP from an AI assistant

The 7 tools appear in any MCP-aware host (Claude Code, etc.) after the extension provisions `.mcp.json`. Typical assistant invocation:

```
build_crl_ast(path="/abs/path/mylib.crl")  → AST inspection
emit_cql(path="/abs/path/mylib.crl")        → CQL preview
emit_crl_fhir(path="/abs/path/mylib.crl", includeResources=true)  → full FHIR
```

### Exit-code-driven CI gating

```bash
npx crl-emit --path mylib.crl --out-dir out/ --target fhir-def --quiet
case $? in
  0) echo "clean" ;;
  1) echo "hard error"; exit 1 ;;
  2) echo "warnings" ;;
esac
```

---

## Where things live

| Concern | File / dir |
|---|---|
| CLI dispatcher | [`src/cli/run-emitter.ts`](./src/cli/run-emitter.ts) |
| CLI validator | [`src/cli/run-validator.ts`](./src/cli/run-validator.ts) |
| MCP server (npm) | [`src/cli/run-mcp-server.ts`](./src/cli/run-mcp-server.ts) |
| MCP server (extension bundle) | [`extension/src/mcp-server.ts`](./extension/src/mcp-server.ts) |
| CRL → CQL emitter | [`src/emitter/emitCQL.ts`](./src/emitter/emitCQL.ts) |
| CRL → FHIR-def emitter | [`src/fhir-emitter/`](./src/fhir-emitter/) |
| CEL → FHIR-instance emitter | [`src/cel/emitter/`](./src/cel/emitter/) |
| Validators | [`src/validator/`](./src/validator/), [`src/cel/validator/`](./src/cel/validator/) |
| Auto-provisioning | [`extension/src/provision.ts`](./extension/src/provision.ts) |

## Related reading

- [USER_GUIDE.md](./USER_GUIDE.md) — CRL language reference
- [docs/cel-spec.md](./docs/cel-spec.md) — CEL language reference
- [features/cql-pattern-mining/results/inference-pattern-catalog-draft.md](./features/cql-pattern-mining/results/inference-pattern-catalog-draft.md) — narrative-pattern catalog
- [README.md](./README.md) — install + features overview
