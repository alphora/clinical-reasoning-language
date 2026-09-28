# Maintaining the interactive Questionnaire in local extension builds

The interactive Questionnaire is part of `packages/crl-vscode`, not a separately installed tool. Build and package it with the CRL compiler and native session adapter from the same checkout.

## Working baseline

The operator confirmed local VSIX **6.4.14** works with the supplied request-source policy. Its source combines the interactive panel with the special MedicationRequest/ServiceRequest coded-source compiler implementation. Local build evidence is under `tmp/local-interactive-questionnaire-6.4.14/`.

The interactive panel and request-source compiler changes are maintained together on `develop`. Cut new development branches from an up-to-date `develop` containing this integration. The earlier baseline `1939f4c0` does not contain either addition. Older experimental worktrees may contain only part of the implementation; bring them up to the integrated baseline before using them to build an extension.

The local packaging wrapper temporarily set all package versions to 6.4.14 and restored the original version files after packaging. The source manifests therefore still read 6.4.9. Do not use that manifest value as evidence of which local VSIX was delivered.

## Source ownership

| Area | Source |
| --- | --- |
| MV toolbar entry and panel lifecycle integration | `packages/crl-vscode/src/correspondenceCockpit.ts` |
| Initial Bundle discovery, request validation, policy compilation, request ownership | `packages/crl-vscode/src/interactiveQuestionnaire.ts` |
| VS Code panel and native adapter loading | `packages/crl-vscode/src/interactiveQuestionnairePanel.ts` |
| LForms UI and response pruning | `packages/crl-vscode/src/interactiveQuestionnaireHtml.ts`, `interactiveQuestionnaireResponse.ts` |
| Interactive tests and synthetic fixture | `packages/crl-vscode/src/interactiveQuestionnaire*.test.mjs`, `src/testdata/interactive-questionnaire/`, `test/interactiveQuestionnaire.browser.cjs` |
| Special compiler integration | `packages/crl/src/cql-emitter/emitCQL.ts`, `lowerLocalCodes.ts`, `renderPublicationRequest.ts`; `src/emit/publicationProgram.ts`, `publicationSource.ts`; `src/cre/run.ts` |
| Request-source compiler tests | `packages/crl/src/emit/tests/publicationRequest.test.ts`, `src/cre/tests/publicationRequest.test.ts` |
| Bundling and asset staging | `packages/crl-vscode/esbuild.js`, `src/stableServer.ts` |

The VSIX carries separate bundles for the extension host (`dist/extension.js`), agent-facing MCP server (`dist/mcp-server.js`), native session API (`dist/apply-session.js`), and session CLI (`dist/crl-apply-session.js`). It also carries the driver, CQL helpers, catalog and LForms assets. The interactive controller loads the standalone session API from its installed extension directory so runtime assets resolve together.

## Iteration loop

1. Make changes on a branch based on the integrated `develop`. Do not copy compiled `dist` files between otherwise different source checkouts.
2. Run the tests relevant to the change. For compiler/request-source and interactive integration changes, the existing combined check is:

   ```powershell
   npx.cmd vitest run --project crl --project crl-vscode --no-file-parallelism publication interactiveQuestionnaire
   ```

   For form/session changes, also run the shipped-LForms browser harness with `CRL_IQ_NATIVE=1`. Set TEMP/TMP to the intended scratch drive. Do not run a native harness concurrently with the build that deletes/recreates core `dist`.
3. Give the next local artifact a new version. Keep the root, core and extension package versions and lockfile metadata consistent during packaging. Follow the CRL release skill's local artifact checks. Do not reuse a previously delivered version for different bytes.
4. Package through the extension's normal lifecycle:

   ```powershell
   npm.cmd run package --workspace crl-language-support -- --out <absolute-output-path.vsix>
   ```

   `vsce package` invokes `vscode:prepublish`, rebuilding core before compiling/bundling the extension. Calling `esbuild.js` alone consumes whatever core `dist` already exists and can therefore embed an older compiler.
5. Inspect the actual VSIX archive and compare its bundled files with the build output. Check that the compiler change is present in both extension and MCP bundles and that native driver/runtime assets are included. `vsce ls` is not an archive verification.
6. Install the VSIX into an isolated test profile. Verify activation and execute the changed behavior through installed artifacts. For a request-source change, use installed MCP `emit_crl_bundle` followed by the installed native session adapter with an appropriate initial Bundle. For an interaction change, exercise the rendered answer/edit/resubmit path too. Source tests and activation alone do not establish those behaviors.
7. Install in the intended user profile and run **Developer: Reload Window in the policy window**. Reopen the Interactive FHIR Questionnaire. Check **Output → CRL** for the intended version and bundled source path; another open window can still be running an older extension host.
8. Restart/reconnect the agent's CRL MCP server if it was already running. Extension activation refreshes the stable server files, but does not replace code already loaded in a separate MCP process. Ensure the MCP configuration points to the extension-managed stable server or another deliberately selected matching build, rather than an older checkout or package.

Record the source revision plus any uncommitted changes, artifact version/hash, and installed verification result with each handoff. A successful extension install does not prove the intended policy window or MCP process is using the new code.

## Contracts to retain

See [interactive Questionnaire usage](interactive-questionnaire.md) for the active folder scheme, supported input resources and Patient-reference requirements. Input-type admission, CRL source projection, and native engine execution are separate capabilities; changing one does not automatically implement the others.

The session sends initial data plus the current QuestionnaireResponse to native apply, prunes downstream answers after earlier edits, and does not retain an answer history or perform client extraction. Preserve those behaviors when changing the surrounding compiler or extension.

The 6.4.14 verification included 630 passing publication/interactive tests with one skip, archive checks, installed activation, installed compilation and first-question execution with the operator's unchanged input, and a synthetic rendered full-response loop including earlier-answer pruning. These are bounded checks, not a claim that every policy or all source projections are supported.
