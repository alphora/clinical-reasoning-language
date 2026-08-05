# CRL / CEL tooling — CLI and MCP reference

This is the reference for consuming the CRL toolchain. The package ships three surfaces:

- **CLI** — scripted invocation. Use this from build scripts, CI, and host applications (e.g. KELP) that want to shell out to `crl-emit` / `crl-validate`.
- **MCP** — Model Context Protocol tools, registered by a server the package ships. Use this from AI assistants (Claude Code, etc.) for interactive workflows.
- **Library API** — typed in-process function calls. Use this when you're **embedding CRL into your own tool** — another VS Code extension, a Node service, a notebook — and want to call the functions directly rather than shelling out.

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

The package is **not yet published to the public npm registry**. Until it is, three delivery vectors are available — pick the one that matches your use case:

### Option A — VS Code extension (vsix) — for interactive authoring + MCP

Lowest-friction path if you want the language server, validation, and the MCP tools available inside VS Code / Claude Code. The extension carries its own bundled MCP server and auto-provisions `<workspace>/.mcp.json` on first activation.

1. Download `crl-language-support-X.Y.Z.vsix` from the [Releases page](https://github.com/alphora/clinical-reasoning-language/releases/latest).
2. Install:
   ```bash
   code --install-extension crl-language-support-X.Y.Z.vsix --force
   ```
3. Open VS Code in any workspace. The extension activates automatically (via `onStartupFinished`) and writes the `crl` server into `<workspace>/.mcp.json`. Any MCP host (Claude Code, etc.) picks up all 18 tools on its next start.

### Option B — npm tarball (`.tgz`) — for host apps + downstream code

The tarball delivers three surfaces in one package — pick whichever fits your call site:

- **CLI binaries** — `crl-emit`, `crl-validate`, the four provenance bins (`crl-canonicalize-source`, `crl-generate-provenance`, `crl-validate-provenance`, `crl-normalize-provenance`), plus lexer/AST helpers land in your project's `node_modules/.bin/`. The right vector for a host application or build pipeline (KELP-style use) that wants to script the CLI deterministically. See [Using the CLI with a project filesystem](#using-the-cli-with-a-project-filesystem) and [Provenance tools](#provenance-tools) below.
- **Library API** — typed in-process access to the same primitives the CLI uses (`tokenizeCRL`, `buildCRL`, `validateCRL`, `emitCQL`, `emitCelToFhir`, `emitFhirDefFromPath`, …). The right vector when you're **embedding CRL into your own tool** — another VS Code extension, a web service, a notebook, a custom validator. See [Library API](#library-api) below.
- **MCP server bin** — `crl-mcp` lands in `node_modules/.bin/` too, in case you want to point another MCP host at this package's stdio server without going through the bundled VS Code extension.

1. Download `smile-digital-health-crl-X.Y.Z.tgz` from the [Releases page](https://github.com/alphora/clinical-reasoning-language/releases/latest).
2. Install into your project:
   ```bash
   npm install ./smile-digital-health-crl-X.Y.Z.tgz
   ```
3. Use the binaries:
   ```bash
   npx crl-emit --help
   npx crl-validate --path mylib.crl
   ```

### Option C — git clone (for contributors / advanced users)

```bash
git clone https://github.com/alphora/clinical-reasoning-language.git
cd clinical-reasoning-language
npm install
npm run build
npm link    # or invoke binaries directly via dist/cli/run-*.js
```

### Once npm publish goes public

The intent is for the package to become publicly installable as `npm install @smile-digital-health/crl`. Until that happens, Options A–C above are the supported vectors. This document will be updated when the registry vector goes live.

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
| `--date` | no | ISO date | `SOURCE_DATE_EPOCH` → `crl.date` → wall clock | Reproducible publication date (`--target fhir-def`); only stamped at publishable+ |
| `--capability` | no | `shareable` \| `computable` \| `publishable` | `publishable` | CRMI capability level (`--target fhir-def`); gates `date` + `meta.profile` + `knowledgeCapability`. `executable` is not yet supported (needs ELM/expansion — [#113](https://github.com/alphora/clinical-reasoning-language/issues/113)) |
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

The bundled MCP server registers **18 tools** for interactive AI workflows. The **7 CRL-authoring tools** are detailed in the table below; the **5 provenance tools** in [Provenance tools](#provenance-tools); the remaining six (`emit_crl`, `run_decision`, `render_scenario`, `authoring_kit`, `create_flag`, `set_flag_status`) are registered but not yet detailed in this reference (a known documentation gap). Each returns a JSON envelope on success; invalid arguments (XOR violation, unreadable path, oversized input) come back as a tool error.

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
- On full success, `result` is the generated CQL targeting the bundled `CRLCommon` library (unversioned `include`).
- When at least one `- definition is …` body fails to match a catalog pattern, `success: false` and `unmatched[]` lists each failing narrative. The emitted CQL still populates `result` with compile-failing `CRLCommon.UnmatchedNarrative(…)` sentinels so downstream CQL translation fails loudly.
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
- Emitted FHIR definitional resources carry `version` (from `package.json`; CRMI Shareable requires it 1..1) and, at publishable+ capability, a reproducible `date` (resolved from `--date`/`date` → `SOURCE_DATE_EPOCH` env → `crl.date` → wall clock). Emitted CQL stays version-less. Optional inputs: `date` (ISO) and `capability` (`shareable|computable|publishable`, default `publishable`; `executable` is rejected — needs ELM/expansion, #113).
- `meta.profile` canonicals: `cpg-strategydefinition`, `cpg-recommendationdefinition` (CPG IG); at publishable+ `crmi-publishableplandefinition`/`crmi-publishablevalueset`, at shareable `crmi-shareableplandefinition`/`crmi-shareablevalueset` (CRMI IG); `cqf-knowledgeCapability`, `cqf-knowledgeRepresentationLevel` (FHIR-core).
- Cross-library concept/terminology refs are unsupported in v0; same-library qualified refs `"CurrentLib"."X"` resolve as bare locals.
- `first:` decision (ordered/first-match) emits the standard `cqf-applicabilityBehavior` "any" extension on a grouping action (apply the first applicable branch). Menu `any:` still emits a `crl-logical-switch` extension URL (StructureDefinition not yet shipped; its FHIR selection semantics are pending — GitHub #184).

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

<a id="library-api"></a>
## Library API — embedding CRL in another tool

When you're building a downstream tool that wants CRL functionality **in-process** — another VS Code extension, a Node service, a notebook, a custom linter — install the package via [Option B (.tgz)](#option-b--npm-tarball-tgz--for-host-apps--downstream-code) and import the public API directly.

### What's exported

The package's `exports` field gives typed access to the same primitives the CLI and MCP server use internally.

| Surface | Primary exports |
|---|---|
| **CRL lex/parse/AST** | `tokenizeCRL`, `parseCRL`, `buildCRL`, `Token`, `ParseResult<T>`, AST types from `../ast/types` re-exported |
| **CRL validation** | `validateCRL`, `validateCRLImports`, `ValidateOptions`, `ValidationResultEnvelope` |
| **CRL → CQL emit** | `emitCQL`, `emitCQLFromAST`, `emitCQLImports`, `CqlEmitOptions`, `CqlEmitResult`, `EmitImportsResult` |
| **CRL two-lane emit + write** | `emitCrlTwoLane` (pure: CQL closure + FHIR defs), `writeTwoLane` / `EmitWriteError` (the SHARED disk writer behind both `crl-emit --target fhir-def` and the `emit_crl` MCP `out` dir) |
| **CRL → FHIR Definition emit** | `emitFhirDefFromPath`, `emitFhirDefClosure`, `emitLibrary`, `emitValueSet`, `emitActivityDefinition`, `emitRecommendationDefinition`, `emitDecisionPlanDefinition`, `writeFhirResources`, plus `isFhirDefError`, `isFhirDefWarning`, `FHIR_DEF_WARNING_KINDS` |
| **CEL lex/parse/AST** | `tokenizeCEL`, `parseCEL`, `buildCEL`, `CELToken`, `CELParseResult`, CEL AST types |
| **CEL validation** | `validateCEL`, `validateCELFile` |
| **CEL → FHIR instance emit** | `emitCelToFhir`, `writeEmitResult`, `resolveCelImports`, `EmittedResource`, `EmittedCase`, `EmitResult`, `EmitDiagnostic` |
| **Shared types** | `CRLError`, `Location`, the full AST `Statement` union, FHIR-def resource shapes |

All exports are typed. Source-of-truth is `dist/index.d.ts` (shipped in the tarball).

### Minimal example

```ts
import { tokenizeCRL, buildCRL, validateCRL, emitCQL } from "@smile-digital-health/crl";

// Tokenize
const tok = tokenizeCRL('library "X". concept "Foo": ...');
if (!tok.success) { console.error(tok.errors); }

// Parse + AST
const ast = buildCRL('library "X". concept "Foo": ...');

// Semantic validate (inline / single-file mode)
const v = validateCRL('library "X". concept "Foo": ...');
if (!v.success) { console.error(v.errors); }

// Emit CQL
const { success, result, unmatched, futureExpressions } =
  emitCQL('library "X". concept "Foo": ...', { libraryName: "X" });
```

### Canonical pattern: building another VS Code extension

This is the same pattern the bundled `crl-language-support` extension uses internally to consume its own npm package. The shape:

1. **Add the tarball to your extension's `package.json`** as a regular dependency:
   ```json
   {
     "dependencies": {
       "@smile-digital-health/crl": "file:./vendor/smile-digital-health-crl-2.5.1.tgz"
     }
   }
   ```
   (Or, once the npm publish vector goes live, drop the `file:` prefix and pin a semver range.)

2. **Bundle the dep into your extension** with esbuild / webpack / your bundler of choice. VS Code extensions ship as a single `dist/extension.js`; the CRL code gets inlined just like any other dep.

3. **Import + call**:
   ```ts
   import * as vscode from "vscode";
   import { validateCRL, buildCRL, emitCQL } from "@smile-digital-health/crl";

   export function activate(ctx: vscode.ExtensionContext) {
     ctx.subscriptions.push(
       vscode.languages.registerCodeActionsProvider("crl", {
         provideCodeActions(doc) {
           const result = validateCRL(doc.getText(), { soft: true });
           // ... produce diagnostics, quick-fixes, etc.
         },
       }),
     );
   }
   ```

The CRL package has no `vscode` dependency of its own, so it composes cleanly into any extension host. If your extension also wants the bundled MCP server (instead of running validation in-process), you can spawn `crl-mcp` as a stdio subprocess from your extension's `activate` — same shape `crl-language-support` uses for the MCP-host case.

### Other embedding shapes

- **Node service / CLI of your own** — same `import { … } from "@smile-digital-health/crl"`, no bundler needed if you're already shipping Node.
- **Notebook / interactive REPL** — works out of the box; the package is plain Node + side-effect-free.
- **Browser** — not supported today. The package targets Node (uses `fs` for project-mode validation and emit). A browser build would need a shim for the filesystem walk.

---

## Using the CLI with a project filesystem

A typical clinical artifact project has authored CRL/CEL sources plus generated CQL and FHIR outputs. The table below shows where each kind of file lives and which CLI invocation writes it. The CRL CLI is opinionated about its own output layouts (see [Input → output dispatch](#crl-emit--the-dispatcher) above); the project-level paths below are the conventional places a host application asks it to write to.

| Path | Contents | How it gets there |
|---|---|---|
| `src/crl/*.crl` | CRL libraries (authored) | hand-authored |
| `src/cel/*.cel` | CEL case-example libraries (authored) | hand-authored |
| `src/cql/<library>.cql` | Emitted CQL libraries | CQL lane of `--target fhir-def`, or `--target cql` |
| `src/fhir/<ResourceType>/<id>.json` | Emitted FHIR Definition resources (ValueSet / Library / ActivityDef / PlanDef) | FHIR lane of `--target fhir-def` |
| `tests/data/patient/<library>/<case>/<ResourceType>/<id>.json` | Emitted FHIR instance resources per CEL case | `crl-emit` on a `.cel` file |

### Read / write flow

Which CLI command reads what, and writes what, when invoked from a project root:

```
   READS                                   COMMAND                                     WRITES
   ─────────────────────────────       ─────────────────────────────       ─────────────────────────────

   src/crl/<lib>.crl              ──►  crl-emit --target fhir-def    ──┬─► src/cql/<library>.cql
   (+ closure via package.json         --path src/crl/<lib>.crl        │   (one per library in
    and node_modules)                  --out-dir .                     │    the import closure)
                                                                       │
                                       atomic two-lane write:          ├─► src/fhir/<ResourceType>/<id>.json
                                       BOTH lanes succeed and write,   │   (ValueSet / Library /
                                       or NEITHER writes               │    ActivityDef / PlanDef)


   src/cel/<cases>.cel              ┐
                                    ├─► crl-emit                   ──► tests/data/patient/<lib>/<case>/<RT>/<id>.json
   src/crl/<lib>.crl                ┘   --path src/cel/<cases>.cel      (one tree per case)
   (closure named in the .cel           --out-dir tests/data
    `covers "<Library>"` clause)


   src/crl/<lib>.crl                ──► crl-validate              ──►  stdout — JSON {success, errors[], warnings[]}
   (+ closure)                          --path src/crl/<lib>.crl       (no filesystem writes)
                                        [--soft]
```

The two-input CEL row matters: a `.cel` file references CRL declarations from its `covers "<Library>"` clause, so the emitter resolves the full CRL closure under `src/crl/` (and any `node_modules` packages it imports) before emitting any FHIR instance.

Concrete invocations from a project root:

```bash
# Regenerate both CQL + FHIR-def lanes for one CRL library (atomic two-lane write):
npx crl-emit --path src/crl/cms22.crl --out-dir . --target fhir-def
#   reads   src/crl/cms22.crl  (+ closure via package.json / node_modules)
#   writes  src/cql/<library>.cql           (one per library in the import closure)
#           src/fhir/<ResourceType>/*.json  (ValueSet / Library / ActivityDef / PlanDef)

# Regenerate FHIR instance resources for one CEL case file:
npx crl-emit --path src/cel/cms22-cases.cel --out-dir tests/data
#   reads   src/cel/cms22-cases.cel + the CRL closure named in its `covers` clause
#   writes  tests/data/patient/<library>/<case>/<ResourceType>/*.json

# Validate a CRL file without writing anything:
npx crl-validate --path src/crl/cms22.crl
#   reads   src/crl/cms22.crl + closure
#   writes  nothing — emits `{success, errors[], warnings[]}` on stdout
```

The atomic two-lane contract on `--target fhir-def` is the load-bearing piece: a single CRL change regenerates `src/cql/` and `src/fhir/` together so `Library.content` URLs never drift out of sync.

---

## Provenance tools

The provenance pipeline links a policy's narrative ↔ CRL ↔ CEL into an auditable artifact (spec: [`docs/provenance-spec.md`](../../docs/provenance-spec.md); KE loop: [`docs/provenance-authoring-handoff.md`](../../docs/provenance-authoring-handoff.md)). Four CLI bins and five MCP tools.

The artifact's `derivedFrom` source back-pointer is **carrier-relative + POSIX** so it is expressed portably, not tied to the authoring machine (#250, spec §12). `validate_provenance` emits `derived-from-*` findings — a non-blocking warning during the transition window, a hard error from the #250 delivery onward; repair a flagged legacy record with `normalize_provenance`, never hand-edit the path.

### CLI binaries

| Bin | Does |
|---|---|
| `crl-canonicalize-source` | `.docx` → canonical `.txt` + `<name>.anchormeta.json` sidecar (an `upstream-source` record — `derivedFrom` names the `.docx`). |
| `crl-generate-provenance` | scaffold / merge a provenance artifact from the CRL+CEL closure (Model-A `anchor-self` — `derivedFrom` names the `.txt`). |
| `crl-validate-provenance` | run the §9 validators + the #250 `derived-from-*` gate; `--worklist` for the in-progress backlog view. |
| `crl-normalize-provenance` | repair a legacy record: rewrite `derivedFrom` carrier-relative + stamp the 1.1 marker, oracle-verified (per-record — verified records are written, worklisted ones byte-untouched). **Exit 0** = every record normalized; **exit 2** = residue remains (a dead upstream path → re-run with `--search-root <dir>`; a hash mismatch / cross-drive source / marker-tell disagreement → adjudicate). `--dry-run` reports the status writing nothing. Re-run `validate_provenance` after (the artifact↔sidecar cross-check runs only in validate). One artifact (+ its sidecar), or one standalone sidecar, per invocation. |

### MCP tools

| Tool | Input | Returns |
|---|---|---|
| `canonicalize_source` | `.docx` path (+ optional out path) | the written `.txt` + sidecar paths |
| `generate_provenance` | artifact / CEL context | the scaffold artifact (or a summary envelope) |
| `validate_provenance` | artifact + cel + anchor paths | findings + counts (FINAL gate) |
| `validate_provenance_worklist` | artifact + cel + anchor paths | findings + counts (worklist mode — the attribution backlog softened to warnings) |
| `normalize_provenance` | artifact path OR a standalone `sidecar` (+ optional `anchor` override, `searchRoot`, `dryRun`) | the repair result (`fullyNormalized` + the worklist of unrepairable records) |

---

## Related reading

- [README.md](./README.md) — install + features overview
- [USER_GUIDE.md](./USER_GUIDE.md) — CRL language reference
- [docs/cel-spec.md](./docs/cel-spec.md) — CEL language reference
- [src/cql-emitter/catalog/inference-pattern-catalog.md](./src/cql-emitter/catalog/inference-pattern-catalog.md) — narrative-pattern catalog (the matchable forms `definition is <…>` accepts)
