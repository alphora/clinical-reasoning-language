# v2.0.0 — Cross-library imports

Major version bump for a redesigned imports model. CRL files can now reference each other via a CQL-style `library` / `include` syntax, with resolution handled by npm: `package.json` defines your project, `node_modules/` holds installed CRL packages, and the resolver finds everything by name.

This is a breaking release — there are no compatibility shims. See **Migration** below for the per-feature updates.

---

## Highlights

- **`library` and `include` are first-class CRL syntax.** Author your project as multiple `.crl` files; the resolver finds and links them by library name.
- **npm IS the version system.** Installed packages carry their version via npm — there is no `version '<v>'?` clause anywhere in CRL or in the emitted CQL library declaration.
- **Strict project root.** Every CRL project has a `package.json`. Walk-up from any `.crl` finds it. If none exists, that's an error — no implicit "use the file's directory" fallback.
- **Publish CRL libraries as npm packages.** A package declares which files contribute libraries via a `crl.libraries: string[]` field in `package.json`. Consumers `npm install` and `include` by library name.
- **Same emitter, same output shape.** A 4-layer split of cms22 (1010-line monolith → 5 files) round-trips byte-identical (modulo the now-unversioned library line) to the previously JAR-validated single-file emit.

---

## What's new

### Author surface

```crl
# CMS22 BMI Screening
library "CMS22".
include "CMS22 Terminology".
include "CMS22 Asserted".
include "CMS22 Inferred".
include "CMS22 Interface".

concept "Initial Population":
- type is Encounter.
- defined as "Qualifying Encounter".
```

- `library "Name".` declares a file's identity (optional; at most one per file).
- `include "Name".` repeats per dependency.
- Both end with `.` per CRL statement convention.
- `library`, `include` are reserved at the top level but remain usable as narrative words inside `definition is` bodies.
- **No aliasing in v0.7.** Reserved for v0.8.

### Project layout

```
my-project/
├── package.json                       # standard npm package.json
├── node_modules/                      # installed CRL packages live here
│   └── @smile/bmi-shared/
│       ├── package.json               # has "crl": { "libraries": [...] }
│       └── src/crl/bmi-shared.crl
├── src/crl/                           # convention for author's .crl files
│   ├── screening.crl                  # root: includes "Shared Vocabulary"
│   └── shared.crl                     # local sibling
└── tests/...
```

The resolver:
1. **Walks up** from the root `.crl` to the nearest `package.json` → that's the project root.
2. **Local scan** of the project root (recursive; skips `node_modules`, `dist`, `build`, dot-dirs).
3. **Package scan** of top-level `node_modules/*` and `node_modules/@*/*`. For each package with `crl.libraries: string[]` in its `package.json`, parses the listed files.
4. Each file's `library "Name".` registers under that name; collisions emit `registry-duplicate`.

### Publishing a CRL package

```json
{
  "name": "@smile/bmi-shared",
  "version": "1.0.0",
  "crl": {
    "libraries": [
      "src/crl/bmi-asserted.crl",
      "src/crl/bmi-inferred.crl",
      "src/crl/bmi-terminology.crl"
    ]
  },
  "files": ["src/crl/**/*.crl", "package.json", "README.md"]
}
```

- `crl.libraries` paths are package-relative; `..` escapes are rejected.
- Unknown sub-fields under `crl.*` are ignored (forward-compat for future `crl.aliases`, etc.).
- Files listed but missing or without a `library` declaration emit `package-resolution-failure` warnings.

### New programmatic API

```ts
import {
  resolveImports,
  validateCRLImports,
  emitCQLImports,
  emitCQLFromAST,
  findProjectRoot,
  buildRegistry,
} from '@smile-digital-health/crl';

const graph = resolveImports('/abs/path/to/cms22.crl');
graph.projectRoot;        // string — dir containing package.json
graph.resolvedLibraries;  // RegistryEntry[] in topological order (leaves first, root last)
graph.namespace;          // { concepts, terminologies, decisions, activities }
graph.diagnostics;        // ImportDiagnostic[]
```

### Two new diagnostic kinds

| Kind | Severity | When |
|---|---|---|
| `project-root-not-found` | error | No `package.json` found walking up from the root `.crl` |
| `package-resolution-failure` | warning | A `node_modules` package's `crl.libraries` entry can't be loaded. Carries a `reason` field (`"missing-file"`, `"invalid-json"`, `"crl-libraries-not-array"`, `"no-library-declaration"`, `"path-escapes-package"`, `"parse-error"`). |

### New `RegistryEntry` / `ResolvedGraph` shape

```ts
interface RegistryEntry {
  name: string | null;        // null only for the anonymous root
  filePath: string;
  ast: CRL;
  isRoot: boolean;
  origin: 'local' | 'package' | 'root';   // NEW
}
interface ResolvedGraph {
  rootPath: string;
  projectRoot?: string;       // NEW — undefined when project-root-not-found
  resolvedLibraries: RegistryEntry[];
  namespace: Namespace;
  diagnostics: ImportDiagnostic[];
}
```

### CLI

```bash
# Validate
crl-validate --path src/crl/screening.crl --pretty
crl-validate --path src/crl/screening.crl --soft     # demote ref-target errors to warnings

# Emit one flat-inlined CQL library
crl-emit --path src/crl/screening.crl > out.cql
crl-emit --path src/crl/screening.crl --library-name MyProject > out.cql
```

No more `--source-path` flag — resolution is automatic via `package.json` walk-up + `node_modules/` scan.

### Worked examples in USER_GUIDE.md §5

- **Two-file local example** — `shared.crl` + `screening.crl` in one project, sibling cross-file references.
- **Cross-package npm example** — same `screening.crl`, but the shared library is `npm install`ed from `@smile/bmi-shared`.
- **cms22 4-layer split** — the existing larger demo, updated for the new CLI surface.

---

## Breaking changes

### CRL syntax

| Before | After |
|---|---|
| `library "Foo" version '1.0.0'.` | `library "Foo".` |
| `include "Bar" version '2.0.0'.` | `include "Bar".` |

The `VERSION` lexer token is gone. `'version'` is no longer reserved (it can appear as a regular narrative word).

### Public API

| v1.7.x | v2.0.0 |
|---|---|
| `resolveImports(rootPath, sourcePaths?)` | `resolveImports(rootPath)` |
| `validateCRLImports(rootPath, sourcePaths?, options?)` | `validateCRLImports(rootPath, options?)` |
| `emitCQLImports(rootPath, sourcePaths?, options?)` | `emitCQLImports(rootPath, options?)` |
| `scanSourcePaths(paths)` | **removed** — replaced by `findProjectRoot` + `buildRegistry` |
| `EmitOptions.libraryVersion` | **removed** — CQL output is unversioned |
| `EmitOptions.crlPatternsVersion` | **removed** — emitted `include CRLPatterns` is unversioned |
| `AmbiguousIncludeDiagnostic` type + `"ambiguous-include"` kind | **removed** — no versions means no ambiguity |
| `RegistryEntry.version?: string` | **removed** |
| `LibraryDeclaration.version?: string` | **removed** |
| `Include.version?: string` | **removed** |

### CLI

| v1.7.x | v2.0.0 |
|---|---|
| `crl-validate --path X --source-path DIR` | `crl-validate --path X` (walks up + scans `node_modules` automatically) |
| `crl-emit --path X --source-path DIR` | `crl-emit --path X` |
| Unknown flags silently ignored | Unknown flags now fail with exit 1 |

`--source-path` itself is detected and fails with a clear migration message rather than being silently dropped.

### Emitted CQL output

| Before | After | Reason |
|---|---|---|
| `library CMS22 version '0.1.0'` | `library CMS22` | npm packaging IS the version |
| `include CRLPatterns version '0.2.0' called CRLPatterns` | `include CRLPatterns called CRLPatterns` | CRLPatterns is our library; npm handles its version |
| `include FHIRHelpers version '4.0.1' called FHIRHelpers` | unchanged | FHIRHelpers ships versioned with the FHIR spec, not via npm |
| `using FHIR version '4.0.1'` | unchanged | Semantic FHIR model identifier (R4 vs R5 are different shapes) |

### Resolution model

- **No fallback.** If no `package.json` is found walking up, the resolver returns a `project-root-not-found` error diagnostic. The previous "treat the file's own directory as the project" behavior is gone — every CRL project has a `package.json` by definition.
- **`--source-path` is gone.** Resolution is project-root + `node_modules/`. To make a `.crl` file reachable from another, it has to be inside the same project (a sibling file under the project root) or in an `npm install`ed package whose `package.json` lists it under `crl.libraries`.

---

## Migration

### 1. Strip `version '<v>'?` clauses from your `.crl` files

```bash
find . -name "*.crl" -exec sed -i -E "s/[[:space:]]+version[[:space:]]+'[^']*'//g" {} \;
```

### 2. Add a `package.json` to every CRL project root

If you don't already have one:

```json
{
  "name": "my-project",
  "version": "0.1.0",
  "private": true
}
```

### 3. Drop `--source-path` from CLI invocations

```bash
# Before
crl-validate --path src/crl/foo.crl --source-path src/crl

# After (the resolver finds src/crl automatically)
crl-validate --path src/crl/foo.crl
```

### 4. Drop `sourcePaths` from programmatic API calls

```ts
// Before
const g = resolveImports('/abs/path/foo.crl', ['/abs/path/libs']);
const v = validateCRLImports('/abs/path/foo.crl', [], { soft: true });
const e = emitCQLImports('/abs/path/foo.crl', [], { libraryName: 'X' });

// After
const g = resolveImports('/abs/path/foo.crl');
const v = validateCRLImports('/abs/path/foo.crl', { soft: true });
const e = emitCQLImports('/abs/path/foo.crl', { libraryName: 'X' });
```

### 5. Drop `libraryVersion` / `crlPatternsVersion` from `EmitOptions`

```ts
// Before
emitCQL(source, { libraryName: 'X', libraryVersion: '1.0.0', crlPatternsVersion: '0.2.0' });

// After
emitCQL(source, { libraryName: 'X' });   // FHIRHelpers version still pinnable via fhirHelpersVersion
```

### 6. If you publish CRL libraries as npm packages

Add a `crl.libraries` field to your `package.json`:

```json
{
  "crl": {
    "libraries": [
      "src/crl/my-shared.crl"
    ]
  }
}
```

### 7. If you import-resolve programmatically and matched on `kind: "ambiguous-include"`

That kind is gone. Without versions, an include resolves to exactly zero or one library. Multi-candidate scenarios now surface as `registry-duplicate` (two installed libraries with the same name) at scan time.

---

## Commits

The full commit list since v1.7.0:

```
2087e8a extension/mcp-server: drop libraryVersion from emit_cql tool
2277442 README: document the release-packaging flow + dist/ lock workaround
63f831a Release v2.0.0: imports redesign + version-syntax drop  ← tagged
285309a Emitter: drop version pins from library declaration + CRLPatterns include
d1a86d2 Imports redesign: drop version syntax, swap to npm-style resolution
bb3e1fd USER_GUIDE: add cross-library imports section + skip v0.5-era tests
36707e8 Imports Todo 5: cms22 4-layer split + JAR-validated by transitivity
4ca6e0f Imports Todo 4: emitter integration (emitCQLImports + CLI flag)
a5a04e4 Imports Todo 3: validator integration (validateCRLImports + CLI flag)
d8291d3 Imports Todo 2: resolver module (src/imports/)
8b8e612 Imports Todo 1: CRL library/include (CQL-aligned) - grammar + AST + parser
558a477 metadata-model: sweep stale `inferred from` references to v0.7 keywords
```

Note: `2277442` (README) and `2087e8a` (mcp-server libraryVersion drop) landed on `main` after the `v2.0.0` tag at `63f831a`. They are required to build the release artifacts cleanly. If you're cutting the artifacts now, build from `main` (head), not from the tag — or move the tag to `2087e8a`.

---

## Test signal

`npm test`: **240 passed, 21 skipped (pre-v0.7 syntax fixtures, parked for follow-up cleanup), 0 failed.**

End-to-end verification: the cms22 4-layer split at `features/cql-pattern-mining/results/models/cms22-split/` emits CQL byte-identical (modulo the now-unversioned library line) to the previously JAR-validated `cql/src/CMS22Generated.cql`. JAR-validated by transitivity.

---

## What's NOT in this release

### Tracked for v2.1.0

- **Required `library "Foo".` declaration** in every CRL file (drops the v2.0 "anonymous file" mode).
- **Qualified cross-library references** — `"OtherLibrary"."Concept"`. Bare `"Foo"` becomes same-file-only. Sibling libraries in the same project auto-resolve via qualifier (no `include` line needed); `include` becomes exclusively for external `node_modules` packages.
- **Emergency aliasing** on `include` — only for the case where a local library name collides with an external package's library name (`include "Foo" as "ExternalFoo".`). Not a general user-facing feature.
- **Multi-file editor support** — wire the extension's diagnostics through `validateCRLImports` so cross-file refs stop showing as yellow squiggles.
- **LSP reference navigation** — Go to Definition (F12), Peek Definition (Alt+F12), Find All References (Shift+F12), Document Outline, Workspace Symbols (Ctrl+T), cross-file Rename Symbol (F2).
- **Kind-restricted autocomplete** — `coded from` offers terminologies only; `defined as` / `definition is` ref slots offer concepts only. Closes [#54](https://github.com/alphora/clinical-reasoning-language/issues/54).
- **Qualified-ref autocomplete** — typing `"Lib".` pops up everything that library exports, grouped by kind with icons.
- **Corpus migration** — `features/cql-pattern-mining/results/models/cms22.crl` and `cms69.crl` (both currently monolithic) get folder-ified into 4-library layouts (terminology / asserted / inferred / interface) under the v2.1.0 qualified-ref syntax. JAR-validated round-trip preserved.
- **Modernizing the 21 skipped pre-v0.7 tests.**

### Backlog (issues/, deferred indefinitely)

- **Selective imports** — `from "Foo" include only-these` syntax. Nice-to-have for deep dep graphs; not blocking any current use case.
- **Direction-aware visibility** — `private` / `public` markers so package authors can hide internal helpers. Becomes real when packages get widely shared; not pressing while the ecosystem is small.

### Intentionally not a CRL concern

- **Semver range matching on package versions.** npm handles install-time resolution; the CRL resolver just sees what's in `node_modules/`. A CRL-source-level version constraint would duplicate npm's job.

---

## Releasing the artifacts

Both the npm tarball and the VSIX are produced locally:

```bash
# Heads up: close VS Code first (or disable the CRL extension) — its bundled
# MCP server holds dist/ open and the builds fail with EPERM otherwise.

npm pack                                   # → @smile-digital-health-crl-2.0.0.tgz
cd extension && npm run package            # → crl-language-support-2.0.0.vsix
```

Upload both to the [v2.0.0 GitHub release page](https://github.com/alphora/clinical-reasoning-language/releases/tag/v2.0.0).
