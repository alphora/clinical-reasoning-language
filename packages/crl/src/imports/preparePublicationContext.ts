import { astHasConceptLocalCode } from "../cql-emitter/lowerLocalCodes";
import {
  createPublicationContext,
  PublicationContextError,
  type PublicationContext,
  type PublicationPackageIdentity,
} from "../emit/publicationContext";
import {
  createLocalDomainResolver,
  type LocalDomainEntryId,
  type LocalDomainResolver,
} from "../fhir-emitter/localDomain";
import { preparePublicationProgram, type PublicationProgram } from "../emit/publicationProgram";

import { computeCqlEmitClosure, computeFhirEmitClosure } from "./computeEmitClosure";
import { buildLibraryScopes, lookupKnownLibrary } from "./scopes";
import type { RegistryEntry, ResolvedGraph } from "./types";

// REFACTOR:grounded (#320, plan 557) — one raw declaration context for both emit lanes.
// Preparation preserves their different closure memberships and admits publications from raw
// declarations once. Explicit value-domain dependencies enter both raw closures without
// becoming runtime CQL includes: classification consumes prepared finite code tables.

export interface PreparePublicationContextOptions {
  readonly canonicalBase?: string;
  readonly policyId?: string;
  /** Caller-supplied owning package metadata, keyed by the graph's canonical source identity. */
  readonly packageIdentityByPath?: ReadonlyMap<string, PublicationPackageIdentity>;
}

export interface PreparedPublicationContext {
  /** Original graph, including import diagnostics. Preparation is not import validation. */
  readonly graph: ResolvedGraph;
  readonly rawCqlClosure: readonly RegistryEntry[];
  readonly rawFhirClosure: readonly RegistryEntry[];
  readonly canonicalBase?: string;
  readonly policyId?: string;
  readonly primarySeedPaths: readonly string[];
  readonly localCodePaths: readonly string[];
  /** Snapshot by raw source path, so a later layer rename cannot change a local domain. */
  readonly localDomainResolver: LocalDomainResolver;
  readonly declarations: PublicationContext;
  readonly publications: PublicationProgram;
}

/** No filesystem reads: metadata must already have been loaded by the operation's caller. */
export function preparePublicationContext(
  graph: ResolvedGraph,
  options: PreparePublicationContextOptions = {},
): PreparedPublicationContext {
  const { canonicalBase, policyId } = options;
  const rawCqlClosure = Object.freeze(computeCqlEmitClosure(graph));
  const rawFhirClosure = Object.freeze(computeFhirEmitClosure(graph));
  // FHIR dependency collection includes every CQL edge. Both lanes share this raw-path snapshot.
  const fhirSourcePaths = new Set(rawFhirClosure.map((entry) => entry.filePath));
  for (const entry of rawCqlClosure) {
    if (!fhirSourcePaths.has(entry.filePath))
      throw new Error(`Publication preparation invariant: CQL source ${entry.filePath} is outside the FHIR closure.`);
  }
  const primarySeedPaths = new Set(graph.resolvedLibraries.map((entry) => entry.filePath));
  const localCodePaths = new Set(
    rawFhirClosure
      .filter((entry) => astHasConceptLocalCode(entry.ast))
      .map((entry) => entry.filePath),
  );
  const domainResolver = createLocalDomainResolver({ primarySeedPaths, localCodePaths, policyId });
  const domainByPath = new Map<string, string | undefined>();
  const disambiguatedBaseByPath = new Map<string, string | undefined>();
  for (const entry of rawFhirClosure) {
    if (entry.name !== entry.ast.library.name) {
      throw new PublicationContextError([
        Object.freeze({
          kind: "library-name-mismatch",
          sourceIdentity: entry.filePath,
          libraryNames: Object.freeze([
            entry.name ?? "<missing registry name>",
            entry.ast.library.name,
          ]),
          declarationLocations: Object.freeze([
            Object.freeze({
              start: Object.freeze({ ...entry.ast.library.location.start }),
              end: Object.freeze({ ...entry.ast.library.location.end }),
            }),
          ]),
        }),
      ]);
    }
    domainByPath.set(entry.filePath, domainResolver.domainIdFor(entry));
    disambiguatedBaseByPath.set(entry.filePath, domainResolver.disambiguatedBaseFor(entry));
  }
  const localDomainResolver: LocalDomainResolver = Object.freeze({
    domainIdFor: (entry: LocalDomainEntryId): string | undefined =>
      domainByPath.get(entry.filePath),
    disambiguatedBaseFor: (entry: LocalDomainEntryId): string | undefined =>
      disambiguatedBaseByPath.get(entry.filePath),
  });

  // Registry-wide knowledge matters: known-but-not-prepared is different from an unknown library.
  // Snapshot scopes before any caller lowers or requalifies its AST. The scope builder owns actual
  // local/package precedence; its lookup still requires the package include gate below.
  const registry = graph.registry;
  const scopes = buildLibraryScopes(
    [...rawFhirClosure],
    graph.localLibraries,
    registry ?? { byNameLocal: new Map(), byNamePackage: new Map() },
  );
  const unsupportedAliases = new Map<string, ReadonlyMap<string, string>>();
  for (const entry of rawFhirClosure) {
    unsupportedAliases.set(
      entry.filePath,
      new Map(
        entry.ast.includes.flatMap((include) =>
          include.alias === undefined ? [] : [[include.alias, include.name] as const],
        ),
      ),
    );
  }
  const declarations = createPublicationContext({
    libraries: rawFhirClosure.map((entry) => {
      const localDomainId = localDomainResolver.domainIdFor(entry);
      const packageIdentity = options.packageIdentityByPath?.get(entry.filePath) ?? entry.packageIdentity;
      return {
        sourceIdentity: entry.filePath,
        filePath: entry.filePath,
        ast: entry.ast,
        ...(packageIdentity === undefined ? {} : { packageIdentity }),
        artifact: {
          ...(canonicalBase === undefined ? {} : { canonicalBase }),
          ...(policyId === undefined ? {} : { policyId }),
          ...(localDomainId === undefined ? {} : { localDomainId }),
        },
      };
    }),
    resolveLibrary(fromSourceIdentity, rawQualifier) {
      const aliasedName = unsupportedAliases.get(fromSourceIdentity)?.get(rawQualifier);
      if (aliasedName !== undefined)
        return {
          kind: "not-visible",
          detail: "unsupported-include-alias",
          message: `Include alias "${rawQualifier}" for "${aliasedName}" is not supported by the current imports resolver; use the raw library name.`,
        };
      if (registry === undefined)
        return {
          kind: "missing",
          detail: "registry-unavailable",
          message: `No library registry was supplied for reference to "${rawQualifier}".`,
        };
      const scope = scopes.get(fromSourceIdentity);
      if (scope === undefined)
        return {
          kind: "missing",
          detail: "owner-scope-unavailable",
          message: `No raw library scope exists for ${fromSourceIdentity}.`,
        };
      const target = lookupKnownLibrary(scope, rawQualifier);
      if (target === undefined)
        return {
          kind: "missing",
          detail: "library-not-known-in-scope",
          message: `Library "${rawQualifier}" is not known in the scope of "${scope.currentLibrary}".`,
        };
      if (target.origin === "package" && !scope.explicitIncludes.has(rawQualifier))
        return {
          kind: "not-visible",
          sourceIdentity: target.filePath,
          detail: "external-library-not-included",
          message: `Package library "${rawQualifier}" requires an explicit include in "${scope.currentLibrary}".`,
        };
      return { kind: "resolved", sourceIdentity: target.filePath };
    },
  });

  return Object.freeze({
    graph,
    rawCqlClosure,
    rawFhirClosure,
    ...(canonicalBase === undefined ? {} : { canonicalBase }),
    ...(policyId === undefined ? {} : { policyId }),
    primarySeedPaths: Object.freeze([...primarySeedPaths]),
    localCodePaths: Object.freeze([...localCodePaths]),
    localDomainResolver,
    declarations,
    publications: preparePublicationProgram(declarations),
  });
}
