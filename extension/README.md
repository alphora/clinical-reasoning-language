# CRL Language Support for VS Code

A VS Code extension for the Clinical Reasoning Language (CRL). It does four things:

1. **Highlights `.crl` files** — CRL keywords, strings, comments. Updated for v0.6 grammar (covers `logic is`, `sem-and`, `sem-or`, `sem-not`).
2. **Catalog-driven authoring help** — narrative-pattern, type, valuetype, and concept-reference completion + hover for `.crl` files:
   - Inside `- logic is ` bodies, narrative-pattern snippets from the 45-entry catalog (`<X> during <Y>`, `<X> performed`, `<X> justified by <Y>`, `has <X>`, etc.).
   - After `- type is `, the list of FHIR resource types CRL recognizes (`Observation`, `Encounter`, `Condition`, …).
   - After `- valuetype is `, the list of FHIR value types (`boolean`, `CodeableConcept`, `Quantity`, `dateTime`, …).
   - Inside any quoted name position (e.g. `inferred from "…"`, `logic is "…"`), the names of every `concept` / `terminology` declared in the file.
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

- **Narrative pattern completion** — inside any `- logic is ` line, snippet for each of the 45 catalog patterns (`has <X>`, `<X> during <Y>`, `<X> justified by <Y>`, etc.). Tab-stops drop you into the quoted concept-ref slots. The catalog is embedded into the extension at build time from `features/cql-pattern-mining/results/inference-pattern-catalog-draft.md`; new patterns are picked up by the next `npm run compile`.
- **Type / valuetype completion** — fires after `- type is ` and `- valuetype is ` with the enum allowed by the CRL grammar.
- **Concept-reference completion** — inside any quoted name position, the names of every `concept` / `terminology` declared in the file (with their type / valuetype / body preview in the hover).
- **Hover** over a narrative phrase, a type/valuetype token, or a concept reference for the catalog entry or declaration info.
- **Diagnostics** — the bundled CRL validator runs on document open / change (debounced 250 ms) / save. Findings appear as VS Code diagnostics (red for errors, yellow for unresolved-reference warnings in soft mode). Hard-mode validation is available via the `validate_crl` MCP tool.

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

Publishing to the Marketplace uses `vsce` (`vsce login <publisher>`, then `vsce publish`).
