# CRL Language Support for VS Code

A VS Code extension for the Clinical Reasoning Language (CRL). It does four things:

1. **Highlights `.crl` files** — CRL keywords, strings, comments. Updated for v0.7 grammar (covers `defined as`, `definition is`, `sem-and`, `sem-or`, `sem-not`).
2. **Catalog-driven authoring help** — narrative-pattern, type, valuetype, and concept-reference completion + hover for `.crl` files:
   - Inside `- definition is ` bodies, narrative-pattern snippets from the 45-entry catalog (`<X> during <Y>`, `<X> performed`, `<X> justified by <Y>`, `has <X>`, etc.).
   - After `- type is `, the list of FHIR resource types CRL recognizes (`Observation`, `Encounter`, `Condition`, …).
   - After `- value type is `, the list of FHIR value types (`boolean`, `CodeableConcept`, `Quantity`, `dateTime`, …).
   - Inside any quoted name position (e.g. `defined as "…"`, `definition is "…"`), the names of every `concept` / `terminology` declared in the file.
   - Hover any of the above to see what it is and where it's declared.
3. **Live error checking** — the bundled CRL validator runs on every change (debounced 250 ms) and reports parser, AST-build, and semantic findings as VS Code diagnostics (squiggles). Runs in **soft mode** so unresolved references appear as warnings during authoring.
4. **Gives your Claude Code agent CRL tools** — Claude can parse and **validate** CRL for you. The MCP server now exposes `validate_crl` with an optional `soft` flag in addition to `tokenize_crl` and `build_crl_ast`.

It configures everything automatically — there are no settings to paste by hand.

## Install

1. Install **VS Code** and the **Claude Code** extension, and sign in to Claude.
2. Install this extension from its `.vsix` file:
   ```
   code --install-extension crl-language-support-<version>.vsix
   ```
   (Or, in Cursor: Ctrl+Shift+P → "Developer: Install Extension From Location".)
3. Open the folder that holds your `.crl` files.
4. When the notification appears, click **Reload**. Done — `.crl` files are highlighted and Claude Code can use the CRL tools.

> **Node.js required.** The CRL tools run as a small Node program, so Node needs to be on your PATH. If it isn't, ask Claude Code to install it for you.

## What it sets up

When you open a workspace that contains `.crl` files, the extension configures the following (all reversible — see **Removing it**):

- **`.mcp.json`** (this workspace) — registers a `crl` MCP server so Claude Code can call the CRL tools. Any MCP servers you already have are preserved.
- **`CLAUDE.md`** (this workspace) — a short managed block telling Claude when and how to use the CRL tools. Your own `CLAUDE.md` content is left untouched.
- **Highlighting settings** (your user settings) — associates `*.crl` with the CRL grammar and adds the CRL token colors, preserving your existing customizations.

### The tools Claude gets
- **`tokenize_crl`** — lex CRL source into tokens.
- **`build_crl_ast`** — parse CRL source and build its AST. No semantic checks.
- **`validate_crl`** — lex + parse + build + run all semantic validators (name uniqueness, reference resolution, cycle detection, action uniqueness). Optional `soft: true` demotes reference-target-exists findings to warnings. Returns `{ success, errors[], warnings[] }`.
- **`emit_cql`** — emit a CQL library from a CRL document targeting the shared `CRLPatterns.cql` library. Optional `libraryName` and `libraryVersion` parameters. Returns `{ success, result?, errors? }` with the generated CQL text on success.

Each takes inline `code` or a `.crl` file `path` and returns a `ParseResult`-shaped envelope (validate/emit add extra fields).

### Authoring help in the editor

- **Narrative pattern completion** — inside any `- definition is ` line, snippet for each of the 45 catalog patterns (`has <X>`, `<X> during <Y>`, `<X> justified by <Y>`, etc.). Tab-stops drop you into the quoted concept-ref slots. The catalog is embedded into the extension at build time from `src/cql-emitter/catalog/inference-pattern-catalog.md`; new patterns are picked up by the next `npm run compile`.
- **Type / valuetype completion** — fires after `- type is ` and `- value type is ` with the enum allowed by the CRL grammar.
- **Concept-reference completion** — inside any quoted name position, the names of every `concept` / `terminology` declared in the file (with their type / valuetype / body preview in the hover).
- **Hover** over a narrative phrase, a type/valuetype token, or a concept reference for the catalog entry or declaration info.
- **Diagnostics** — the bundled CRL validator runs on document open / change (debounced 250 ms) / save. Findings appear as VS Code diagnostics (red for errors, yellow for unresolved-reference warnings in soft mode). Hard-mode validation is available via the `validate_crl` MCP tool.

### Keystroke reference

All gestures below work in any `.crl` file once the extension is active.
"Click" assumes a left-click; substitute the equivalent VS Code chord on
your keyboard layout if different.

#### Navigation

| Gesture | What it does |
|---|---|
| **F12** / **Ctrl+Click** on a quoted ref | Jump to the declaration of that concept / terminology / decision / activity. Works for bare refs (resolved in the local library) and qualified refs (`"Lib"."Name"` → that library's file). |
| **F12** on the `"Lib"` qualifier portion of a ref | Jump to that library's `library "Lib".` line in its source file. |
| **Ctrl+Click** on `include "Lib"` | Open the included library's file. |
| **Shift+F12** on a declaration or any ref site | Open the References view listing every site that uses that name across the project. |
| **Ctrl+T** | Workspace Symbols — fuzzy-search every concept / terminology / decision / activity across every CRL project in the workspace. |
| **F2** on a declaration or ref name | Rename the declaration and every reference to it (atomic multi-file edit). Per-(library, kind) collision check matches validator semantics. Library rename is rejected in v2.1.0. |

#### Outline / overview

| Gesture | What it does |
|---|---|
| **View → Outline** (Explorer side panel) | Per-file outline. Top node is the file's library; children are its concepts (Variable icon) / terminologies (Constant) / decisions (Function) / activities (Class). Click to jump. |
| **Ctrl+Shift+O** | Same outline, but in the Command Palette as a quick-picker. |

#### Authoring help

| Gesture | What it does |
|---|---|
| **Ctrl+Space** | Manually open the completion popup. Filtered to the slot's expected kind: `coded from "│"` → terminologies, `defined as "│"` / `definition is "│"` ref slots → concepts, `recommend "│"` → activities, `use "│"` → decisions. |
| Typing `"` inside a body | Auto-triggers the completion popup with the same kind-filtered list. |
| Typing `.` after `"Lib"` | Auto-triggers qualified-ref completion — only that library's declarations of the slot's expected kind appear. |
| Mouse hover on a narrative phrase / type token / concept ref | Inline catalog entry or declaration info (signature, library, body preview). |
| **Ctrl+K Ctrl+I** | Force the hover popup at the cursor. |

#### Diagnostics

No keystroke required — diagnostics run automatically on document open
and on every change (debounced 250 ms) and on save. Red squiggles =
errors, yellow squiggles = warnings (soft mode demotes
unresolved-reference findings to warnings during authoring; the
`validate_crl` MCP tool runs hard mode if you want errors instead).

#### Commands

Open the Command Palette with **Ctrl+Shift+P** and type:

- **CRL: Set up tools** — run setup manually (e.g. if automatic setup is off).
- **CRL: Remove tools** — undo everything.
- **CRL: Refresh project cache** — force a full re-scan of all `.crl` files in the workspace (useful after large external file changes).

### Customized highlight colors

If your existing user settings already have a token color for a CRL scope (e.g. you customized `entity.name.type.crl`), the extension prompts you per scope on first run: **Replace**, **Keep mine**, or **Don't ask again**. Choices persist in the extension's global state, so subsequent activations don't re-ask. **CRL: Remove tools** clears nothing of yours; the persisted preferences just stop being consulted.

## Commands and settings

- **CRL: Set up tools** — run setup manually (e.g. if automatic setup is turned off).
- **CRL: Remove tools** — undo everything: removes the `crl` server from `.mcp.json`, the CRL block from `CLAUDE.md`, and the CRL highlighting from your settings (leaving your own entries intact).
- **`crl.autoProvision`** (default `true`) — set to `false` to skip automatic setup and use the commands instead.

## Removing it

Run **CRL: Remove tools** from the Command Palette. (VS Code has no reliable "on uninstall" hook, so uninstalling the extension does not auto-remove these files — use the command first if you want a clean teardown.)

## For maintainers

The extension bundles the CRL parser (`@smile-digital-health/crl`) and a small MCP server into the VSIX with esbuild. Build the parser first, since the extension bundles its compiled output:

```bash
# repo root
npm install
npm run build            # regenerates the ANTLR parser + compiles to dist/

# extension
cd extension
npm install
npm test                 # typecheck + bundle + unit/integration tests
npm run package          # produces crl-language-support-<version>.vsix
```

**Heads-up (Windows):** if VS Code is open with the CRL extension active, its bundled MCP server holds `dist/` files open and `npm run package` will fail with `EPERM`. Close VS Code (or disable the CRL extension) before building the VSIX.

Publishing to the Marketplace uses `vsce` (`vsce login <publisher>`, then `vsce publish`).

For the **full release flow** (npm tarball + VSIX produced together, then uploaded to a GitHub release), see [`README.md` § Cutting a release](../README.md#cutting-a-release-build-both-artifacts--upload-to-github) in the repo root.
