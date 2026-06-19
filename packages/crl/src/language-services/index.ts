// CRL language services, extracted from the extension in #132 step 1. These modules
// are vscode-free but NODE-targeted (they use node:fs); browser-safety for a future
// web editor is deferred to the LanguageServiceHost abstraction (#132 step 2).
//
// `export *` re-exports the UNION of every language-service module's public symbols as the
// `@smile-digital-health/crl/language-services` API surface (verified collision-free).
// The surface is intentionally broad for this mechanical extraction; curating it
// (explicit re-exports / narrower sub-paths) is a follow-up if external consumers
// need a tighter contract.
export * from "./concepts";
export * from "./completionHelpers";
export * from "./contextDetect";
export * from "./findDeclaration";
export * from "./projectIndex";
export * from "./highlight";
// #132 step 2 — plain-data contracts + the LanguageServiceHost fs abstraction + paths util.
export * from "./contracts";
export * from "./paths";
export * from "./host";
// #132 step 3 — headless compute* services (the extension wraps these in vscode adapters).
export * from "./hover";
export * from "./completion";
export * from "./navigation";
// catalog (allowlists + parser + narrative helpers) moved from the extension in #132 step 3;
// the extension's esbuild generates dist/catalog.json via this module's parseCatalog.
export * from "./catalog";
