# CRL Language Support for VS Code

A VS Code extension for the Clinical Reasoning Language (CRL). It does two things:

1. **Highlights `.crl` files** — CRL keywords, strings, and comments.
2. **Gives your Claude Code agent CRL tools** — Claude can parse CRL for you, so you can ask things like *"validate this .crl file"* or *"what's the structure of this decision?"* and it can actually read the syntax tree.

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
- **`build_crl_ast`** — parse CRL source and build its Abstract Syntax Tree.

Each takes inline `code` or a `.crl` file `path` and returns a `ParseResult` (`{ success, result?, errors? }`).

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
