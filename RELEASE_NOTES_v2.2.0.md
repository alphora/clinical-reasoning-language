# v2.2.0 — Runtime parameters + `value type is` rename

Adds first-class runtime parameter declarations to CRL — replacing the empty-URL terminology + alias-concept workaround the cms22 / cms69 split corpora had been carrying — and renames `valuetype is` to `value type is` so every multi-word CRL body keyword is now space-separated. Closes [#59](https://github.com/alphora/clinical-reasoning-language/issues/59).

This is a breaking release for `.crl` source: `- valuetype is X.` lines no longer parse. See **Migration** below — a one-shot migration script ships in the box.

---

## Highlights

- **`- valuetype is` → `- value type is`.** The single largest breaking change in v2.2.0 for external corpora. Every `concept` declaration with a `- valuetype is X.` body line must rename to `- value type is X.` (space). `scripts/migrate-valuetype-is.js` automates the rewrite across `.crl` / `.ts` / `.mjs` / `.json` / `.md` files. Brings every multi-word CRL body keyword to space-separated form.
- **New `parameter` top-level statement.** `parameter "Name": - param type is X.` declares a runtime CQL parameter. Patient-typed parameters collapse to `context Patient` per the CQL spec; Period-typed parameters emit as `parameter "X" Interval<DateTime>` (matching `CRLPatterns.During(period Interval<DateTime>)` etc.); other types passthrough.
- **Library-local parameter rule.** Every library that references a runtime parameter declares it locally; no cross-library parameter refs in canonical authoring. The emitter still supports the qualified-ref syntactic path for niche cases, but the cms22 / cms69 split corpora illustrate the local-only pattern.
- **Stub mechanism removed.** The pre-v2.2.0 emitter silently converted any terminology with an empty `valueset` URL into a synthesized CQL `parameter` declaration. That mechanism is gone — empty-URL terminologies now emit as literal `valueset "X": ''` declarations, surfacing the author's pending-VSAC TODO rather than hiding it.
- **`Patient` added to the `type is` allowlist.** Catching up a documented hole that blocked patient-context concepts (commit `16d0634`).
- **Extension LSP: `param type is` slot completion + hover.** Authors get autocomplete for parameter types matching the grammar allowlist, with a Patient-specific hover note explaining the `context Patient` emit semantics.
- **cms22 + cms69 corpora migrated.** Both monolith and split projects now declare `parameter "Measurement Period": - param type is Period.` in their inferred layers.

---

## What's new

### CRL body keyword rename — `value type is`

```crl
# Before (v2.1.0)
concept "BMI":
- type is Observation.
- valuetype is Quantity.
- coded from "BMI VS".

# After (v2.2.0)
concept "BMI":
- type is Observation.
- value type is Quantity.
- coded from "BMI VS".
```

Brings every multi-word body keyword to the same space-separated form (`type is`, `value type is`, `coded from`, `defined as`, `definition is`, `param type is`, `inferred from`, `apply pattern`, `system is`, `code is`, `valueset is`). One-shot migration: `node scripts/migrate-valuetype-is.js <root>` walks the tree and rewrites `valuetype is` → `value type is` in every applicable file.

### Parameter declarations (`parameter "Name":`)

```crl
library "CMS22 Inferred".

parameter "Measurement Period":
- param type is Period.

concept "BP Evaluation Encounter (not virtual) During MP":
- type is Encounter.
- definition is "BP Evaluation Encounter (not virtual)" during "Measurement Period".
```

- **Body**: exactly one `- param type is X.` line. The type allowlist is the union of concept resource types (Observation, Encounter, …, **Patient**) and concept value types (Period, boolean, integer, Quantity, …). Practitioner is intentionally NOT in the allowlist for v2.2.0; emitter-side support exists as a defensive AST path but author syntax is rejected at parse time.
- **Per-library uniqueness**: per-kind (a parameter and a concept can share a name; two parameters cannot).
- **Reference resolution**: a parameter is the fifth `RefKind` (alongside concept, terminology, decision, activity). Bare narrative refs (`"Encounter" during "Measurement Period"`) resolve to a concept first, then to a parameter — matching the validator's concept-first precedence. Non-narrative slots (`coded from`, `defined as` bare-ref, composition operands, `when`, `with`) remain concept-/terminology-only.
- **Patient-typed parameters → CQL `context Patient`**: every Patient-typed parameter declaration (regardless of declared name) emits as `context Patient` per the CQL spec; every concept narrative ref that resolves to a Patient-typed parameter rewrites to the bare `Patient` identifier in emitted CQL. Practitioner follows the same shape (deferred from this release).
- **Period-typed parameters → CQL `parameter "Name" Interval<DateTime>`**: matches `CRLPatterns` timing-arg signatures.
- **Other primitives → PascalCase**: `boolean → Boolean`, `integer → Integer`, `string → String`, `dateTime → DateTime`, `time → Time`, `decimal → Decimal`.
- **FHIR data + resource types → passthrough**: `CodeableConcept → CodeableConcept`, `Observation → Observation`, etc. (resolved via the library's `using FHIR version '4.0.1'` declaration).
- **No default Interval clauses.** The pre-v2.2.0 stub mechanism synthesized a `default Interval[@2024-01-01T...]` clause; AST-declared parameters do not.

### Library-local rule

The canonical pattern is: every library that references a parameter declares it locally. The cms22-split project illustrates this — `parameter "Measurement Period"` lives in `cms22-inferred.crl` (where every `during "Measurement Period"` narrative ref lives), NOT in `cms22-terminology.crl`. The terminology, asserted, and shell libraries don't reference the parameter, so they don't declare it either.

Emit-time consequence: `CMS22 Inferred.cql` carries the `parameter "Measurement Period" Interval<DateTime>` line; `CMS22 Terminology.cql`, `CMS22 Asserted.cql`, and `CMS22.cql` do not.

Cross-library parameter references resolve via include qualification when present — see the `cross-lib-parameter-period` integration test for the supported behavior — but the canonical authoring pattern is local-only per [[parameters-are-library-local]]. The `cql-to-crl-transformer` skill is updated to teach this rule for whole-library CQL→CRL transforms.

### Extension LSP — `param type is` slot completion + hover

- New `ParamTypeCompletionProvider` triggers on the `- param type is ` slot, listing every type in `PARAMETER_TYPES` (mirrored from the grammar allowlist).
- Hover over a `- param type is X.` token shows the type with a Patient-specific note: "The emitter collapses this to CQL `context Patient`; the parameter's quoted CRL name is not emitted, and the CQL `context Patient` line has no per-name identifier."
- Concept-first precedence (validator's `NARRATIVE_KINDS` rule) is now applied symmetrically to both the indexed (ProjectIndex-backed) and orphan-file completion + hover paths — same-name concept+parameter pairs surface only the concept.
- Drift-guard tests assert exact equality between the static type mirror in `extension/src/catalog.ts` and the generated JSON allowlists; a grammar change to any of the three lists now fails the extension test suite immediately.

### Stub-mechanism removal

Pre-v2.2.0, the emitter looked at every `terminology "X": - valueset is \`\`.` declaration (single body line, empty URL) and silently synthesized a CQL `parameter "X" Interval<DateTime>` with a default Interval. That stub mechanism is removed wholesale per [[no-legacy-crl]].

Practical consequence: any empty-URL terminology in the corpus — whether it was a runtime-parameter alias or a pending-VSAC placeholder — now emits as its literal source form (`valueset "X": ''`). The CQL translator will flag the empty literal as invalid, surfacing the author's pending TODO rather than hiding it.

The cms22 / cms69 split corpora that previously relied on the mechanism are migrated in this release. Docs examples (`docs/clinical-reasoning-language-example.crl`, `docs/cms22-bp-control-example.crl`) got placeholder URNs (`urn:example:placeholder`) for their pending-VSAC terminologies.

---

## Breaking changes

### 1. CRL syntax — `valuetype is` → `value type is`

Every `concept` declaration with a `- valuetype is X.` body line must rename to `- value type is X.`. External corpora authored against v2.1.0 will parse-fail until migrated. Use the bundled script:

```bash
node scripts/migrate-valuetype-is.js path/to/corpus
```

The script rewrites `.crl`, `.ts`, `.mjs`, `.json`, and `.md` files in place. Inspect the diff before committing.

### 2. Stub-mechanism removal

Pre-v2.2.0 behavior:

```crl
# This pattern silently synthesized a CQL `parameter "Measurement Period" Interval<DateTime>` declaration.
terminology "Measurement Period (stub valueset)":
- valueset is ``.

concept "Measurement Period":
- type is Encounter.
- coded from "Measurement Period (stub valueset)".
```

v2.2.0 behavior: declare the parameter explicitly.

```crl
parameter "Measurement Period":
- param type is Period.
```

Place the declaration in the library that USES the parameter (typically the inferred / measure-logic layer in a split project, per [[parameters-are-library-local]]). For empty-URL terminologies that AREN'T runtime parameters (pending-VSAC placeholders), give them real or placeholder URLs so they emit as proper valueset declarations:

```crl
terminology "Pending Valueset":
- valueset is `urn:example:placeholder`.
```

### 3. Public API changes

- **`findRefsTo` signature change.** The kind argument is now REQUIRED. v2.1.0 callers that omitted it (relying on enumeration) must pass `kind: "concept"` (or whichever kind they were targeting). See `extension/src/projectIndex.ts` for the new signature.
- **`RefKind` union widened with `"parameter"`.** Consumers switching on `RefKind` must add a case (or accept the new value through a catch-all).
- **`Namespace`, `NameBuckets`, `LibraryScopeNames` types** widened with a `parameters` field. Destructuring callers compile-break until updated.
- **`ValidationError.kind` messages widened.** `unresolved-reference` for narrative slots now reads "no concept or parameter declared with name X" — string-matching consumers break.
- **New `EmitOptions.crossLibraryParameters` field** (additive). `emitCQLImports` populates it automatically; direct `emitCQLFromAST` callers can leave it `undefined`.
- **New exports**: `AstParameterInfo` discriminated union, `Parameter` AST statement type, `ParameterType` allowlist union, `infoForParameterStatement` helper.
- **New generated artifact**: `src/grammar/generated/types/parameterTypes.json`. Build-validated to be the union of `conceptTypes.json` + `conceptValueTypes.json`.

---

## Migration

### 1. Run the `valuetype` migration script

```bash
node scripts/migrate-valuetype-is.js path/to/corpus
git diff   # inspect
```

### 2. Replace stub-mechanism workarounds with declarative parameters

For each `terminology "X (stub valueset)":` + alias `concept "X":` pair, replace both with:

```crl
parameter "X":
- param type is Period.   # or `Patient`, `boolean`, etc. as appropriate
```

Place in the library that uses the parameter. Remove qualified parameter refs (`"OtherLib"."X"` → bare `"X"`).

### 3. Fix non-parameter empty-URL terminologies

For empty-URL terminologies that AREN'T runtime parameters (the placeholder-for-future-VSAC pattern), assign a real or placeholder URL so they emit as `valueset "X": '<url>'` declarations.

### 4. Update validator/emitter callers (if any)

- `findRefsTo(...)` now requires `kind`.
- `RefKind` union widened — add a `"parameter"` case to any `switch`.
- Type destructuring of `Namespace` / `NameBuckets` / `LibraryScopeNames` — add `parameters`.

### 5. Update CRL-generating scripts/skills

The `cql-to-crl-transformer` skill is updated in this release to teach the library-local parameter rule. If you have other CRL-generating code, ensure it places parameter declarations in libraries that reference them, not in shared terminology layers.

---

## Still deferred from v2.1.0

Behavior unchanged from v2.1.0; carrying these forward to v2.3+:

- **Library rename across the include graph.** F2 on `library "X".` is still rejected with the v2.1.0 message.
- **Alias support on `include`.** Grammar still accepts `include "Foo" as "Bar".`; resolver/validator still treat the alias as the raw name.
- **Multiple disjoint CRL projects per VS Code workspace folder.** Still only the first project per workspace folder is indexed.
- **ProjectIndex cache scoping.** `setOverlay` still invalidates the entire cache; scoping to the changed file's project root remains a future enhancement.

## Tracked for v2.3+

- **Validator diagnostic for cross-library parameter references.** The canonical pattern is library-local per [[parameters-are-library-local]]; surfacing the structural rule via a diagnostic (rather than relying on skill + release-notes guidance) would catch the anti-pattern at edit time.
- **Practitioner widening.** The lexer allowlist accepts Patient but not Practitioner. Emitter-side support exists as a defensive AST path; widening the source allowlist would unlock practitioner-context measures.
- **`crossLibraryParameters` infrastructure cleanup.** Defensive code with no canonical use case under the local-only rule; removing it is a [[no-legacy-crl]] follow-up.
- **`v06-test.crl` modernization.** The modeling-test file has no `library` declaration; tracked as separate test-cleanup.
- **IMMZ regression snapshots.** Pre-v0.7 schema (used singular `valueType`); skipped under existing `// TODO` comments. Re-recording is its own test-cleanup task.

## Intentionally not a CRL concern

Same as v2.1.0 / v2.0.0 — semver range matching on package versions stays with npm.

---

## Commits

- `8215f18` — Todo 1: Grammar + AST + parser (issue #59). Adds `parameter` keyword + `param type is` keyword + `PARAMETER_TYPE` allowlist; renames `valuetype is` → `value type is`.
  - `16d0634` — grammar: add Patient to the CONCEPT_TYPE allowlist.
- `7198596` — Todo 2: Validator + reference resolver (issue #59). Per-library uniqueness for parameters; Option C-lite acceptable-kinds-per-slot; cross-kind precedence; `findRefsTo` signature change.
- `db9c464` — Todo 3: Emitter (issue #59). `parameter "X" Type` lines, `context Patient` / `context Practitioner` rule, cross-library Patient-context rewrite, `emitContext` with FIXME on conflict.
- `674d965` — Todo 4: Extension LSP (issue #59). `param type is` slot completion + hover, concept-first precedence in indexed + orphan paths, drift-guard tests.
- `3bb788a` — Todo 5: Corpus migration + stub removal (issue #59). cms22/cms69/docs migrated; legacy stub mechanism removed; cql-to-crl-transformer skill updated.

---

## Releasing the artifacts

```bash
# Heads up: close VS Code first (or disable the CRL extension) — its bundled
# MCP server holds dist/ open and the builds fail with EPERM otherwise.

npm pack                                   # → @smile-digital-health-crl-2.2.0.tgz
cd extension && npm run package            # → crl-language-support-2.2.0.vsix
```

Upload both to the v2.2.0 GitHub release page once the tag is cut.
---
