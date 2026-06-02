# v2.1.0 — Per-library scoping + multi-file editor UX

Builds on v2.0.0's cross-library imports by tightening the semantics (every CRL file declares its library, bare refs are local-only, cross-library refs must be qualified) and shipping the editor experience that model needs: cross-file diagnostics, kind-restricted autocomplete, qualified-ref autocomplete, and a full LSP navigation set (F12, Shift+F12, Outline, Workspace Symbols, Rename, Document Links).

This is a breaking release for `.crl` source — bare cross-library refs that worked under v2.0.0 (via `include`-flattened lookup) no longer resolve. See **Migration** below.

---

## Highlights

- **`library "Foo".` is required.** Anonymous CRL files are gone. The parser rejects a file with no `library` line.
- **Per-library validator scoping.** A bare ref `"X"` resolves against the asking library's local declarations only. Cross-library refs MUST use the qualified `"Lib"."X"` syntax (introduced in v2.0.0). `include` is a CQL-emit directive — it does not widen CRL bare-ref scope.
- **Per-CRL emit.** One `.cql` file per CRL library instead of one flat-inlined output. Cross-library refs round-trip as native CQL `"Lib"."Name"`. The four-layer cms22 split now produces four `.cql` files that mirror its `.crl` layout.
- **Multi-file editor.** The VS Code extension wires diagnostics, hover, completion, and the new LSP navigation through `validateCRLImports`. Edit a declaration in one file → diagnostics update in every file that references it.
- **Kind-restricted + qualified-ref autocomplete.** `coded from "│"` offers terminologies only; `defined as "│"` / `definition is "│"` offer concepts only. Typing `"OtherLib"."│"` lists everything that library exports, filtered by the slot's expected kind. Closes [#54](https://github.com/alphora/clinical-reasoning-language/issues/54).
- **Six LSP navigation providers.** Definition (F12), References (Shift+F12), Document Symbol (Outline), Workspace Symbol (Ctrl+T), Rename (F2), and Document Link (Ctrl+Click on `include "X"`). All backed by an AST-driven reference index — not regex scanning.
- **cms69 4-layer split.** The 867-line cms69 monolith joins cms22 as a navigable demonstration of the imports + per-CRL emit feature set.

---

## What's new

### Author surface — `library` is required

```crl
# CMS69 BMI Screening
library "CMS69".
include "CMS69 Inferred".

concept "Initial Population":
- type is Observation.
- valuetype is boolean.
- defined as "CMS69 Inferred"."Aged 18+ at Measurement Period Start".
```

- The leading `# Markdown heading` is still optional and decorative.
- Exactly one `library "Name".` line per file. Zero is a parse error.
- Local sibling libraries auto-resolve via qualified refs without an `include` (per v2.1.0 lock 026); `include` is reserved for packages, but using it on a sibling library is still legal and just emits a `redundant-local-include` warning.

### Per-library scoping (the central semantic change)

The validator now runs per-library. Each `RegistryEntry` is validated against a scope containing only that library's own declarations.

- **Bare refs** (`"X"`) resolve to declarations in the same library only.
- **Qualified refs** (`"Lib"."X"`) resolve to the named library's declarations, gated by visibility rules: locals + the root are always visible; package libraries require an explicit `include`.
- **`include`** still emits as a CQL `include` statement (so the produced `.cql` has the right dependency graph), but it does NOT bring the included library's names into bare-ref scope at the CRL level.

The same name can now appear as `concept "X"` in one library and `terminology "X"` in another — no false collision, no name-conflict diagnostic. Uniqueness is per-(library, kind).

### Per-CRL emit

```bash
$ node dist/cli/run-emitter.js \
    --path features/cql-pattern-mining/results/models/cms69-split/cms69.crl \
    --out-dir ./out
wrote ./out/CMS69 Terminology.cql
wrote ./out/CMS69 Asserted.cql
wrote ./out/CMS69 Inferred.cql
wrote ./out/CMS69.cql
```

- One CQL output per CRL library (no more flat inlining).
- Each emitted `.cql` carries its own `library`, `using FHIR`, `include FHIRHelpers`, `include CRLPatterns`, and one `include "Other".` line per CRL `include`.
- Cross-library refs render as `"Other"."Name"` — the native CQL qualified-reference syntax.
- `--library-name` was removed from `crl-emit`: the library name comes from the `library` declaration, not a CLI override.

### Multi-file editor (VS Code extension)

The extension now keeps a workspace-wide `ProjectIndex` keyed by project root. On every save and on every editor change:

- **Diagnostics** for every `.crl` file in the project recompute via `validateCRLImports` with an overlay map for unsaved buffers.
- **Hover** resolves cross-file refs through the index.
- **Completion** filters by the slot's expected kind (`coded from` → terminologies; `defined as` / `definition is` / `sem-or` / `sem-and` / `sem-not` ref slots → concepts; `recommend` → activities; `use` → decisions).
- **Qualified-ref completion** triggers after typing `"Lib".` — the list is filtered to that library's declarations of the slot's expected kind, with icons that match the LSP `SymbolKind`.

A new package-side **overlay API** threads in-memory editor content through `resolveImports` / `validateCRLImports` / `emitCQLImports` so the extension can validate unsaved buffers without touching disk:

```ts
validateCRLImports(rootPath, {
  overlays: new Map<string, string>([
    [absPathToCrl, currentBufferText],
  ]),
});
```

### LSP navigation (six providers)

All six providers share a single AST-driven reference index that walks every ref slot `ReferenceResolver` walks (concept `CodedFrom` / `DefinedAsBareRef` / `Composition` / `Narrative`; decision `WhenBlock.conceptName` / `RecommendActivity` / `UseDecision`; activity `ActivityWith.terminologyReference`).

| Gesture | Provider | Behavior |
|---|---|---|
| F12 / Ctrl+Click on a ref | Definition | Jumps to the declaration |
| F12 on `"Lib"` qualifier | Definition | Jumps to `library "Lib".` |
| Ctrl+Click on `include "Lib"` | Document Link | Opens that library's file |
| Shift+F12 on a decl or ref | References | Lists every ref site across the project |
| Outline panel | Document Symbol | All concepts / terminologies / decisions / activities in the current file, mapped to Variable / Constant / Function / Class icons |
| Ctrl+T | Workspace Symbol | Fuzzy-search every decl across every CRL project in the workspace |
| F2 on a decl or ref | Rename | Atomic multi-file `WorkspaceEdit`; per-(library, kind) collision check matches validator semantics |

Library rename (`F2` on a `library "X".` line) is rejected at `prepareRename` time with a clear message and deferred to v2.2 — cascading the rename through every include + qualified ref is its own piece of work.

### cms69 4-layer split

`features/cql-pattern-mining/results/models/cms69-split/`:

```
cms69.crl              library "CMS69"              interface (Measure API: IP / Denom / Numerator / Exclusions / Exceptions)
cms69-inferred.crl     library "CMS69 Inferred"     measure logic (defined-as / definition-is)
cms69-asserted.crl     library "CMS69 Asserted"     FHIR resource-to-valueset bindings (coded-from)
cms69-terminology.crl  library "CMS69 Terminology"  valuesets / codes / Measurement Period stub
NOTES.md               layout table + re-emit/validate instructions
package.json           {name: "cms69-demonstration-split"}
```

The same pass also repaired the pre-existing `features/cql-pattern-mining/results/models/cms22-split/` — its bare cross-library refs (which had been silently broken under per-library scoping since commit 2c) were qualified.

---

## Breaking changes

### CRL syntax

| v2.0.0 | v2.1.0 |
|---|---|
| `library` declaration optional | `library "Name".` required (max one per file) |
| Bare `"X"` flowed through `include` to find `X` in any included library | Bare `"X"` resolves to the asking library's local declarations only |

### Public API

| v2.0.0 | v2.1.0 |
|---|---|
| `Validator.validate(ast, options)` | `Validator.validate(ast, options, sources?)` — `sources` is per-statement `SourceContext[]` for per-library scoping |
| `emitCQL(source, options): string` | `emitCQLImports(rootPath, options?): { libraryName, cql }[]` — N outputs |
| `EmitOptions.libraryName` (CLI flag too) | removed — library name comes from `library` declaration |
| `validateCRLImports(rootPath, options?)` (no overlays) | `validateCRLImports(rootPath, { overlays?, soft? })` — overlays for editor unsaved-buffer integration |

`ValidationError` gained a `kind: string` field tagging the specific error category (e.g., `"unresolved-reference"`, `"name-uniqueness"`, `"external-library-not-included"`, `"redundant-local-include"`, `"reference-cycle"`). Existing `message` / `location` / `severity` fields unchanged.

### CLI

| v2.0.0 | v2.1.0 |
|---|---|
| `crl-emit --path X > out.cql` (one flat file) | `crl-emit --path X --out-dir DIR` (N files) |
| `crl-emit --library-name MyProject` | removed — library name comes from `library` declaration |

### Emit output shape

| v2.0.0 | v2.1.0 |
|---|---|
| One `.cql` file inlining every CRL library's contents | One `.cql` file per CRL library, with `include "Other"` for cross-library deps |
| Cross-library refs inlined under the root library's namespace | Cross-library refs emitted as native CQL `"Other"."Name"` |

---

## Migration

### 1. Add `library "Foo".` to every `.crl` file

```crl
# At the top of every CRL file (optional `# Markdown heading` first):
library "Your Library Name".

concept "...":
...
```

Files without a `library` declaration are now a parse error.

### 2. Qualify every cross-library reference

```crl
# Before (v2.0.0 — worked via include flattening)
concept "Initial Population":
- defined as "Aged 18+ at Measurement Period Start".

# After (v2.1.0 — must be qualified if the target lives in another library)
concept "Initial Population":
- defined as "CMS69 Inferred"."Aged 18+ at Measurement Period Start".
```

The validator's `unresolved-reference` diagnostic on a bare cross-library ref is the signal — qualify it with the target's library name. `include` statements still go in the file (they emit as CQL `include`), but they no longer make bare refs reach into the included library.

### 3. Update emitter callers — N outputs instead of 1

```ts
// Before
const cql = emitCQLImports(rootPath, { libraryName: 'X' });

// After — emitCQLImports returns an array; the library name comes from each CRL's `library` declaration
const outputs = emitCQLImports(rootPath);
for (const { libraryName, cql } of outputs) {
  fs.writeFileSync(path.join(outDir, `${libraryName}.cql`), cql);
}
```

The CLI:

```bash
# Before
crl-emit --path src/foo.crl --library-name MyProject > out.cql

# After
crl-emit --path src/foo.crl --out-dir ./out
# → ./out/MyProject.cql (plus one per included library)
```

### 4. Update validator callers if you embed it

```ts
// Before
new Validator().validate(ast, { soft: true });

// After — `sources` is optional; pass null/undefined to keep single-file behavior,
// or build per-statement SourceContext[] for per-library scoping
new Validator().validate(ast, { soft: true }, sources);
```

Most consumers should call `validateCRLImports(rootPath, options)` instead — it builds `sources` from the resolved graph automatically.

### 5. If you check `ValidationError` programmatically

Switch on the new `kind` field:

```ts
const unresolved = result.errors.filter(e => e.kind === 'unresolved-reference');
const cycles    = result.errors.filter(e => e.kind === 'reference-cycle');
```

The legacy `message`-string matching still works but is brittle to wording changes; `kind` is stable.

---

## Commits

The full commit list since v2.0.0:

```
fa9b563 v2.1.0 Chunk D: cms69 4-layer split + fix cms22 cross-lib refs
77181c4 v2.1.0 Chunk C: LSP reference navigation (6 providers)
fbf8e61 v2.1.0 Chunk B: extension multi-file + qualified-ref autocomplete
b94297c v2.1.0 Chunk A Phase 2 (commit 2e): final cleanup — completes v2.1.0
5c333f8 cms22-split: collapse 5-library shell+interface pattern to 4-library layout
ddbce24 v2.1.0 Chunk A Phase 2 (commit 2d): per-CRL emit redesign
a5ba2e5 v2.1.0 Chunk A Phase 2 (commit 2c): per-library validator scoping core
139abbd v2.1.0 Chunk A Phase 2 (commit 2b): infra for per-library scoping
ab9295e v2.1.0 Chunk A Phase 2 (commit 2a): fixture migration + emitter + ValidationError.kind
1905213 v2.1.0 Chunk A Phase 2 (commit 1): library declaration is required
6da2983 v2.1.0 Chunk A Phase 2A prep: testUtils.makeTestCRL + validator-test migration
05f97c3 v2.0.0 release notes: split v2.1.0 work into Phase 1 (shipped) + Phase 2
4d2f3f8 v2.1.0 Chunk A Phase 1: qualified-ref grammar + AST + alias on include
285a084 v2.1.0 plan: add Chunk D corpus migration (cms22 + cms69 → folders)
1e70a5d v2.0.0 release notes refined; v2.1.0 scope + plan doc
```

---

## Test signal

`npm test` (root): **264 passed, 28 skipped (pre-v0.7 syntax fixtures + a few v0.5 snapshot tests parked for cleanup), 0 failed.**

Extension test suite: **all 10 suites pass** (mcp-server, provision, highlight, catalog, embedded-catalog, concepts, crl-patterns coverage, context-detect, find-declaration, project-index).

End-to-end verification:
- `features/cql-pattern-mining/results/models/cms69-split/` validates clean and emits 4 CQL files.
- `features/cql-pattern-mining/results/models/cms22-split/` validates clean and emits 4 CQL files.
- Both monolithic originals (`cms22.crl`, `cms69.crl`) still validate clean as single-library files.

UAT checklist: see `UAT.md` at the repo root — covers CLI validate/emit, extension diagnostics/completion/hover, all six LSP providers, and negative cases.

---

## What's NOT in this release

### Tracked for v2.2

- **Library rename across the include graph.** F2 on `library "X".` is rejected with a clear message in v2.1.0. Cascading the rename through every include + every qualified ref is its own piece of work.
- **Alias support on `include`.** The grammar accepts `include "Foo" as "Bar".` (shipped in Phase 1, commit 4d2f3f8); the resolver/validator treat the alias as the raw name for now. Real alias semantics are a v2.2 piece.
- **Multiple disjoint CRL projects per VS Code workspace folder.** Today only the first project discovered under each folder is indexed.
- **ProjectIndex cache scoping.** `setOverlay` currently invalidates the entire cache; should scope to the changed file's project root.

### Backlog (issues/, deferred)

- **Selective imports** — `from "Foo" include only-these`. No real demand yet.
- **Direction-aware visibility** — `private` / `public` markers for package-internal helpers. Becomes real when the ecosystem grows.

### Intentionally not a CRL concern

- **Semver range matching on package versions.** Same as v2.0.0 — npm handles install-time resolution; the CRL resolver sees what's in `node_modules/`.

---

## Releasing the artifacts

```bash
# Heads up: close VS Code first (or disable the CRL extension) — its bundled
# MCP server holds dist/ open and the builds fail with EPERM otherwise.

npm pack                                   # → @smile-digital-health-crl-2.1.0.tgz
cd extension && npm run package            # → crl-language-support-2.1.0.vsix
```

Upload both to the v2.1.0 GitHub release page once the tag is cut.
