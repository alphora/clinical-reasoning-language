import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Catalog loader (#187) — reads the SHARED catalog CQL libraries the emitter
 * always ships into every policy's `cql/` output folder:
 *
 *   - `CRLCommon.cql`        — the CRL→CQL emitter's narrative-pattern target
 *                              library (`Has`/`HasHistoryOf`/`Without`/…).
 *   - `CaseFeatureCommon.cql` — the truth-set helpers (`asTruths`/`satisfied`)
 *                              the Inferences/Interface layers call fluently
 *                              (renamed from `CaseFeatureHelpers` in #187).
 *   - `FHIRHelpers.cql`      — the engine-bundled FHIRHelpers 4.0.1 source, so
 *                              a human KE's CQL tooling resolves the include
 *                              offline (the cqf engine auto-provides it at
 *                              execution; humans need the file).
 *
 * Runtime resolution has to work across THREE layouts, because this module is
 * consumed by more than one build system:
 *
 *   1. ts-jest / plain tsc dist — `__dirname` is the `catalog` folder itself
 *      (`src/cql-emitter/catalog` or `dist/cql-emitter/catalog`), where the
 *      `.cql` sit as direct siblings. `scripts/copy-catalog.mjs` copies them into
 *      dist at build time; `package.json` `files` ships the dist `.cql` glob.
 *   2. esbuild bundle (crl-vscode VSIX `dist/mcp-server.js`, and the crl CLI's own
 *      `dist/cli/run-mcp-server.js` when bundled) — the whole module is inlined
 *      into ONE file, so `__dirname` is that bundle's dir (e.g.
 *      `crl-vscode/dist`) with NO `catalog` subfolder. The bundler's build step
 *      copies the three `.cql` NEXT TO the bundle (see crl-vscode `esbuild.js`),
 *      so they are direct siblings of `__dirname` there too.
 *
 * Both siblings-of-`__dirname` layouts are the SAME expression
 * `join(__dirname, name)`. We ALSO probe `join(__dirname, "catalog", name)` as a
 * defensive fallback for any future bundle that keeps a `catalog/` subdir. First
 * existing candidate wins; if none exist we throw a diagnostic listing every path
 * tried (so an ENOENT can't be silent — the crl-vscode invoke test covers this).
 */

export interface CatalogLibrary {
  /** The CQL `library <name>` header identifier (== FHIR `Library.name`/url-tail). */
  libraryName: string;
  /** The CQL `version '<v>'` pin. */
  version: string;
  /** The `.cql` output filename written under `cql/`. */
  outputFilename: string;
  /** The raw catalog CQL source. */
  cql: string;
}

function catalogCandidates(fileName: string): string[] {
  return [
    // (1) plain-dist/ts-jest catalog dir AND (2) esbuild bundle-sibling copy.
    join(__dirname, fileName),
    // Defensive: a bundle that preserves a `catalog/` subdir next to the bundle.
    join(__dirname, "catalog", fileName),
  ];
}

function readCatalog(fileName: string): string {
  const candidates = catalogCandidates(fileName);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
  }
  throw new Error(
    `Catalog CQL "${fileName}" not found. The emitter ships the shared catalog ` +
      `libraries (CRLCommon/CaseFeatureCommon/FHIRHelpers) into every policy, so this ` +
      `file must be resolvable at runtime. Tried:\n  ${candidates.join("\n  ")}\n` +
      `In the plain dist this is copied by scripts/copy-catalog.mjs (build step); in an ` +
      `esbuild bundle (crl-vscode VSIX) the bundler must copy the .cql next to the bundle. ` +
      `If you added a new bundle entrypoint, mirror that copy step.`,
  );
}

/**
 * CRLCommon — always emitted as `cql/CRLCommon.cql` + a FHIR `Library`.
 */
export function loadCRLCommon(): CatalogLibrary {
  return {
    libraryName: "CRLCommon",
    version: "0.2.0",
    outputFilename: "CRLCommon.cql",
    cql: readCatalog("CRLCommon.cql"),
  };
}

/**
 * CaseFeatureCommon — always emitted as `cql/CaseFeatureCommon.cql` + a FHIR
 * `Library` (renamed from CaseFeatureHelpers in #187).
 */
export function loadCaseFeatureCommon(): CatalogLibrary {
  return {
    libraryName: "CaseFeatureCommon",
    version: "1.0.0",
    outputFilename: "CaseFeatureCommon.cql",
    cql: readCatalog("CaseFeatureCommon.cql"),
  };
}

/**
 * FHIRHelpers 4.0.1 — always emitted as `cql/FHIRHelpers.cql` ONLY (NO FHIR
 * `Library`: the cqf engine auto-provides FHIRHelpers at execution; humans need
 * the source file). Version pinned 4.0.1 to match the engine's bundled copy AND
 * the emitted `include FHIRHelpers version '4.0.1'`.
 */
export function loadFHIRHelpers(): CatalogLibrary {
  return {
    libraryName: "FHIRHelpers",
    version: "4.0.1",
    outputFilename: "FHIRHelpers.cql",
    cql: readCatalog("FHIRHelpers.cql"),
  };
}

/**
 * The three catalog libraries the CQL lane ALWAYS appends to every policy's
 * `cqlByLibrary`. Order: CRLCommon, CaseFeatureCommon, FHIRHelpers.
 */
export function loadCatalogLibraries(): CatalogLibrary[] {
  return [loadCRLCommon(), loadCaseFeatureCommon(), loadFHIRHelpers()];
}

/** The catalog libraries that ALSO get a FHIR `Library` resource (NOT FHIRHelpers). */
export function catalogFhirLibraries(): CatalogLibrary[] {
  return [loadCRLCommon(), loadCaseFeatureCommon()];
}
