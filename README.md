# Clinical Reasoning Language (CRL) — monorepo

An npm-workspaces monorepo.

- **[`packages/crl`](packages/crl)** — `@smile-digital-health/crl`: the CRL/CEL language core (lexer/parser, validator, CRE decision evaluator, CQL/FHIR emitters, MCP server, CLI). Published to npm.
- **[`packages/crl-vscode`](packages/crl-vscode)** — `crl-language-support`: the VS Code extension (highlighting, live diagnostics, completion/hover, and a bundled MCP server). Published as a VSIX.
- **`packages/coral`** — reserved for the Coral authoring editor.

## Develop

```sh
npm install        # at the repo root — installs + links all workspaces
npm run build      # build the core (packages/crl)
npm test           # core test suite
npm run test:ext   # extension test suite
```

The extension depends on the core as a workspace package; `npm install` at the root links it. See [`packages/crl/README.md`](packages/crl/README.md) for core details and [`packages/crl/USER_GUIDE.md`](packages/crl/USER_GUIDE.md) for the language.
