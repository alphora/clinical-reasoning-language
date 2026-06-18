// CRL language services, extracted from the extension in #132 step 1. These modules
// are vscode-free but NODE-targeted (they use node:fs); browser-safety for a future
// web editor is deferred to the LanguageServiceHost abstraction (#132 step 2).
//
// `export *` re-exports the UNION of all six modules' public symbols as the
// `@smile-digital-health/crl/language-services` API surface (verified collision-free).
// The surface is intentionally broad for this mechanical extraction; curating it
// (explicit re-exports / narrower sub-paths) is a follow-up if external consumers
// need a tighter contract. `catalog.ts` is deferred — its dist/catalog.json
// generation is entangled with the extension's esbuild step.
export * from "./concepts";
export * from "./completionHelpers";
export * from "./contextDetect";
export * from "./findDeclaration";
export * from "./projectIndex";
export * from "./highlight";
