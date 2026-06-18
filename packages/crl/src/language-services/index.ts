// Headless CRL language services — host-agnostic (zero `vscode`) modules consumed
// by the VS Code extension, the MCP/agent, and (later) the Coral editor. Extracted
// from the extension in #132 step 1. No export-name collisions across these modules,
// so `export *` is safe. NOTE: `catalog.ts` is intentionally deferred — its
// `dist/catalog.json` generation is entangled with the extension's esbuild step.
export * from "./concepts";
export * from "./completionHelpers";
export * from "./contextDetect";
export * from "./findDeclaration";
export * from "./projectIndex";
export * from "./highlight";
