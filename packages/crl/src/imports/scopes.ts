import type { Statement } from "../ast/types";

import type { RegistryEntry, Registry } from "./types";

/**
 * Per-kind name buckets for one library.
 */
export interface LibraryScopeNames {
  concepts: Set<string>;
  terminologies: Set<string>;
  decisions: Set<string>;
  activities: Set<string>;
  parameters: Set<string>;
  // #224 ii: a library's `criterion` declarations. Kept SEPARATE from `concepts`
  // (concept XOR criterion is a distinct-declaration invariant, enforced by
  // `NameUniquenessValidator`); the reference resolver reads this to give a
  // targeted `criterion-misuse` diagnostic when a criterion name lands in a
  // concept-only slot or a foreign qualified ref, instead of "unresolved concept".
  criteria: Set<string>;
}

/**
 * Visibility/origin record for a known library — what the registry knows
 * about a library without yet deciding whether the asking file can refer
 * to it.
 */
export interface KnownLibraryEntry {
  libraryName: string;
  filePath: string;
  origin: "local" | "package" | "root";
  names: LibraryScopeNames;
}

/**
 * The per-file scope handed to source-aware validators.
 *
 * Key fields:
 *  - `currentLibrary` / `filePath` / `origin` identify the asking file.
 *  - `localNames` is the asking library's own declarations (for bare-ref lookup).
 *  - `knownLibraries` is the REGISTRY-WIDE universe of libraries the resolver
 *    has indexed (all locals + all packages, regardless of include-walk
 *    reachability from root). Visibility is decided per-ref by
 *    `lookupKnownLibrary` + `explicitIncludes`.
 *  - `explicitIncludes` carries the EFFECTIVE include names from this file's
 *    `include` lines (alias-aware in v2.2; raw name in v2.1).
 */
export interface LibraryScope {
  currentLibrary: string;
  filePath: string;
  origin: "local" | "package" | "root";
  localNames: LibraryScopeNames;
  // Keyed by `${origin}|${libraryName}` so local "Foo" and package "Foo"
  // coexist as distinct entries.
  knownLibraries: Map<string, KnownLibraryEntry>;
  explicitIncludes: Set<string>;
}

/**
 * Statement-level source attribution. Carries the owning library entry +
 * its scope so a statement-walking validator can resolve refs in the right
 * library context.
 */
export interface SourceContext {
  stmt: Statement;
  entry: RegistryEntry;
  scope: LibraryScope;
}

function emptyNames(): LibraryScopeNames {
  return {
    concepts: new Set(),
    terminologies: new Set(),
    decisions: new Set(),
    activities: new Set(),
    parameters: new Set(),
    criteria: new Set(),
  };
}

function collectLocalNames(entry: RegistryEntry): LibraryScopeNames {
  const names = emptyNames();
  for (const stmt of entry.ast.statements) {
    switch (stmt.type) {
      case "Concept":
        if (stmt.name) names.concepts.add(stmt.name);
        break;
      case "Terminology":
        if (stmt.name) names.terminologies.add(stmt.name);
        break;
      case "Decision":
        if (stmt.name) names.decisions.add(stmt.name);
        break;
      case "Activity":
        if (stmt.name) names.activities.add(stmt.name);
        break;
      case "Parameter":
        if (stmt.name) names.parameters.add(stmt.name);
        break;
      case "Criterion":
        if (stmt.name) names.criteria.add(stmt.name);
        break;
    }
  }
  return names;
}

const KNOWN_KEY = (origin: "local" | "package" | "root", name: string) =>
  `${origin}|${name}`;

/**
 * Build per-library scopes for the files the validator should iterate
 * (root's include-walk closure + non-included local siblings), AND a
 * registry-wide `knownLibraries` map shared by every scope.
 *
 * `knownLibraries` is populated from the FULL registry (every local file +
 * every node_modules package the registry indexed), not just from what
 * include-walking reached. This matters because a non-included local
 * sibling may itself `include "SomePkg".` even when root doesn't; the
 * sibling's scope needs to find SomePkg in `knownLibraries` to resolve
 * its qualified refs without firing a false `external-library-not-included`.
 *
 * Scope output keyed by `entry.filePath` (canonical) — stable identity
 * even when two entries share a library name (local + package both "Foo").
 */
export function buildLibraryScopes(
  resolvedLibraries: RegistryEntry[],
  localLibraries: RegistryEntry[],
  registry: Registry,
): Map<string, LibraryScope> {
  // Scope owners: the files the validator will iterate.
  const ownerEntries: RegistryEntry[] = [];
  const ownerPaths = new Set<string>();
  for (const e of resolvedLibraries) {
    if (!ownerPaths.has(e.filePath) && e.name !== null) {
      ownerPaths.add(e.filePath);
      ownerEntries.push(e);
    }
  }
  for (const e of localLibraries) {
    if (!ownerPaths.has(e.filePath) && e.name !== null) {
      ownerPaths.add(e.filePath);
      ownerEntries.push(e);
    }
  }

  // Per-owner localNames cache.
  const perPathNames = new Map<string, LibraryScopeNames>();
  for (const entry of ownerEntries) {
    perPathNames.set(entry.filePath, collectLocalNames(entry));
  }

  // Shared known-libraries map: populated from the FULL registry so a
  // sibling that `include`s a package can resolve it even if root didn't.
  // Every scope sees the same universe.
  const knownLibraries = new Map<string, KnownLibraryEntry>();
  const addToKnown = (entry: RegistryEntry): void => {
    if (entry.name === null) return;
    if (knownLibraries.has(KNOWN_KEY(entry.origin, entry.name))) return;
    // Use the owner-cached names if we already computed them; otherwise
    // collect fresh (e.g. for packages whose statements weren't iterated
    // as scope owners).
    const names =
      perPathNames.get(entry.filePath) ?? collectLocalNames(entry);
    knownLibraries.set(KNOWN_KEY(entry.origin, entry.name), {
      libraryName: entry.name,
      filePath: entry.filePath,
      origin: entry.origin,
      names,
    });
  };
  for (const entry of registry.byNameLocal.values()) addToKnown(entry);
  for (const entry of registry.byNamePackage.values()) addToKnown(entry);
  // Root is always added as a local entry in registry.byNameLocal by
  // resolveImports's root-replacement guard, so it's covered above.

  const scopes = new Map<string, LibraryScope>();
  for (const entry of ownerEntries) {
    if (entry.name === null) continue;
    const localNames = perPathNames.get(entry.filePath) ?? emptyNames();
    const explicitIncludes = new Set<string>();
    for (const inc of entry.ast.includes) {
      // v2.1: alias treated as raw name. `alias-not-yet-supported` fires
      // from the resolver; here we just record the raw name as the gate.
      explicitIncludes.add(inc.name);
    }
    scopes.set(entry.filePath, {
      currentLibrary: entry.name,
      filePath: entry.filePath,
      origin: entry.origin,
      localNames,
      knownLibraries,
      explicitIncludes,
    });
  }

  return scopes;
}

/**
 * Resolve a qualified-ref's target library against the asker's scope.
 *
 * Precedence rules per discussion 031 round-1 disposition C2:
 *  - Asker is `local` or `root`:
 *    - If asker explicitly `include`s the name, prefer the package
 *      version (mirrors `resolveIncludeTarget`'s package-first rule for
 *      explicit includes).
 *    - Otherwise prefer local; local auto-resolves without an include per
 *      v2.1.0 lock 026. Fall back to package as a last resort so the
 *      ReferenceResolver can then fire `external-library-not-included`
 *      with the correct target metadata.
 *  - Asker is `package`: package-only (packages cannot reach consumer
 *    locals).
 *
 * The caller (ReferenceResolver) is responsible for the final
 * "package-origin + not in explicitIncludes → external-library-not-included"
 * gate; this function only does the lookup ordering.
 */
export function lookupKnownLibrary(
  scope: LibraryScope,
  libName: string,
): KnownLibraryEntry | undefined {
  if (scope.origin === "package") {
    return scope.knownLibraries.get(KNOWN_KEY("package", libName));
  }
  // local or root caller:
  if (scope.explicitIncludes.has(libName)) {
    // Explicit include — package-first per `resolveIncludeTarget`.
    return (
      scope.knownLibraries.get(KNOWN_KEY("package", libName)) ??
      scope.knownLibraries.get(KNOWN_KEY("local", libName)) ??
      scope.knownLibraries.get(KNOWN_KEY("root", libName))
    );
  }
  // No explicit include — local auto-resolves; package only as a fallback
  // (which triggers `external-library-not-included` downstream).
  return (
    scope.knownLibraries.get(KNOWN_KEY("local", libName)) ??
    scope.knownLibraries.get(KNOWN_KEY("root", libName)) ??
    scope.knownLibraries.get(KNOWN_KEY("package", libName))
  );
}
