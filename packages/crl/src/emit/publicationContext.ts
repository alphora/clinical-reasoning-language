import type { Concept, CRL, Location, ReferenceName, Statement, Terminology } from "../ast/types";

// REFACTOR:grounded (#320, plan 557) — resolve raw authored declarations once in their owning
// scope before lowering. This context identifies declarations; it does not admit a publication,
// infer its value domain, select candidates, or assign physical CQL/FHIR export names.

export interface PublicationPackageIdentity {
  readonly name: string;
  readonly version?: string;
}

export interface PublicationArtifactIdentity {
  readonly canonicalBase?: string;
  readonly policyId?: string;
  readonly localDomainId?: string;
}

export interface PublicationLibraryInput {
  /** Compile-local identity, normally the resolved source path. Never emit it as portable lineage. */
  readonly sourceIdentity: string;
  /** Actual diagnostic source file when supplied by a file-based caller; never infer it from identity. */
  readonly filePath?: string;
  readonly ast: CRL;
  readonly packageIdentity?: PublicationPackageIdentity;
  readonly artifact: PublicationArtifactIdentity;
}

export interface PublicationLibrary extends PublicationLibraryInput {
  readonly libraryName: string;
}

export type PublicationLibraryResolution =
  | { readonly kind: "resolved"; readonly sourceIdentity: string }
  | {
      readonly kind: "missing" | "not-visible" | "outside-context";
      readonly sourceIdentity?: string;
      readonly detail?: string;
      readonly message?: string;
    };

/** The adapter owns include visibility, package/local precedence and aliases. No global fallback. */
export type ResolvePublicationLibrary = (
  fromSourceIdentity: string,
  rawQualifier: string,
) => PublicationLibraryResolution;

export interface PublicationLocation {
  readonly start: Readonly<Location["start"]>;
  readonly end: Readonly<Location["end"]>;
}

export interface PublicationLookupSite {
  readonly fromSourceIdentity: string;
  readonly reference:
    | string
    | {
        readonly type: "QualifiedReference";
        readonly libraryName: string;
        readonly name: string;
        readonly location: PublicationLocation;
      };
  /** Bare string refs need the containing authored expression's location supplied by the caller. */
  readonly location?: PublicationLocation;
}

interface QualifiedDeclarationIdentity {
  /** Collision-safe compile-local tuple key. It is not a portable computational identifier. */
  readonly key: string;
  readonly sourceIdentity: string;
  readonly libraryName: string;
  readonly packageIdentity?: PublicationPackageIdentity;
}

export interface QualifiedConceptIdentity extends QualifiedDeclarationIdentity {
  readonly conceptName: string;
}

export interface QualifiedTerminologyIdentity extends QualifiedDeclarationIdentity {
  readonly terminologyName: string;
}

export interface PublicationDeclarationHit<Node, Identity> {
  readonly kind: "hit";
  readonly site: PublicationLookupSite;
  readonly library: PublicationLibrary;
  readonly identity: Identity;
  /** Original raw node; the context never modifies or freezes caller-owned ASTs. */
  readonly node: Readonly<Node>;
}

interface LookupFailureBase {
  readonly site: PublicationLookupSite;
  readonly expectedKind: "Concept" | "Terminology";
  readonly targetSourceIdentity?: string;
}

export type PublicationLookupFailure = LookupFailureBase &
  (
    | {
        readonly kind: "missing";
        readonly reason: "owner-library" | "library" | "declaration";
        readonly detail?: string;
        readonly message?: string;
      }
    | {
        readonly kind: "not-visible" | "outside-context";
        readonly detail?: string;
        readonly message?: string;
      }
    | { readonly kind: "wrong-kind"; readonly actualKinds: readonly Statement["type"][] }
    | { readonly kind: "ambiguous"; readonly declarationLocations: readonly PublicationLocation[] }
  );

export type PublicationConceptLookup =
  | PublicationDeclarationHit<Concept, QualifiedConceptIdentity>
  | PublicationLookupFailure;

export type PublicationTerminologyLookup =
  | PublicationDeclarationHit<Terminology, QualifiedTerminologyIdentity>
  | PublicationLookupFailure;

export interface PublicationContextDiagnostic {
  readonly kind: "duplicate-source-identity" | "library-name-mismatch";
  readonly sourceIdentity: string;
  readonly libraryNames: readonly string[];
  readonly declarationLocations: readonly PublicationLocation[];
}

export class PublicationContextError extends Error {
  readonly diagnostics: readonly PublicationContextDiagnostic[];

  constructor(diagnostics: readonly PublicationContextDiagnostic[]) {
    super(
      diagnostics
        .map((d) => `${d.kind}: ${d.sourceIdentity} (${d.libraryNames.join(", ")})`)
        .join("; "),
    );
    this.name = "PublicationContextError";
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}

export interface PublicationContext {
  getLibrary(sourceIdentity: string): PublicationLibrary | undefined;
  getLibraries(): readonly PublicationLibrary[];
  lookupConcept(
    fromSourceIdentity: string,
    ref: ReferenceName,
    location?: Location,
  ): PublicationConceptLookup;
  lookupTerminology(
    fromSourceIdentity: string,
    ref: ReferenceName,
    location?: Location,
  ): PublicationTerminologyLookup;
}

type Declaration = Concept | Terminology;
type DeclarationIdentity = QualifiedConceptIdentity | QualifiedTerminologyIdentity;
interface IndexedDeclaration {
  readonly node: Declaration;
  readonly identity: DeclarationIdentity;
  readonly location: PublicationLocation;
}
interface IndexedLibrary {
  readonly library: PublicationLibrary;
  readonly concepts: Map<string, IndexedDeclaration[]>;
  readonly terminologies: Map<string, IndexedDeclaration[]>;
  readonly kinds: Map<string, Set<Statement["type"]>>;
}

function copyLocation(location: Location): PublicationLocation {
  return Object.freeze({
    start: Object.freeze({ ...location.start }),
    end: Object.freeze({ ...location.end }),
  });
}

function lookupSite(
  fromSourceIdentity: string,
  ref: ReferenceName,
  location?: Location,
): PublicationLookupSite {
  const authoredLocation = typeof ref === "string" ? location : ref.location;
  const reference =
    typeof ref === "string"
      ? ref
      : Object.freeze({
          type: ref.type,
          libraryName: ref.libraryName,
          name: ref.name,
          location: copyLocation(ref.location),
        });
  return Object.freeze({
    fromSourceIdentity,
    reference,
    ...(authoredLocation === undefined ? {} : { location: copyLocation(authoredLocation) }),
  });
}

function indexLibrary(input: PublicationLibraryInput): IndexedLibrary {
  const packageIdentity =
    input.packageIdentity === undefined
      ? undefined
      : Object.freeze({
          name: input.packageIdentity.name,
          ...(input.packageIdentity.version === undefined
            ? {}
            : { version: input.packageIdentity.version }),
        });
  const library: PublicationLibrary = Object.freeze({
    sourceIdentity: input.sourceIdentity,
    ...(input.filePath === undefined ? {} : { filePath: input.filePath }),
    libraryName: input.ast.library.name,
    ast: input.ast,
    artifact: Object.freeze({ ...input.artifact }),
    ...(packageIdentity === undefined ? {} : { packageIdentity }),
  });
  const indexed: IndexedLibrary = {
    library,
    concepts: new Map(),
    terminologies: new Map(),
    kinds: new Map(),
  };
  for (const node of input.ast.statements) {
    const kinds = indexed.kinds.get(node.name) ?? new Set<Statement["type"]>();
    kinds.add(node.type);
    indexed.kinds.set(node.name, kinds);
    if (node.type !== "Concept" && node.type !== "Terminology") continue;
    const index = node.type === "Concept" ? indexed.concepts : indexed.terminologies;
    const identity = Object.freeze({
      key: JSON.stringify([node.type, input.sourceIdentity, library.libraryName, node.name]),
      sourceIdentity: input.sourceIdentity,
      libraryName: library.libraryName,
      ...(packageIdentity === undefined ? {} : { packageIdentity }),
      ...(node.type === "Concept" ? { conceptName: node.name } : { terminologyName: node.name }),
    }) as DeclarationIdentity;
    const entries = index.get(node.name) ?? [];
    entries.push({ node, identity, location: copyLocation(node.location) });
    index.set(node.name, entries);
  }
  return indexed;
}

/**
 * Snapshot resolution metadata while retaining raw AST/node references. Callers must finish editing
 * the raw AST before preparation and pass this same context through subsequent emit phases. Private
 * indexes cannot be mutated by consumers; no caller-owned object is frozen as a side effect.
 */
export function createPublicationContext(args: {
  readonly libraries: readonly PublicationLibraryInput[];
  readonly resolveLibrary: ResolvePublicationLibrary;
}): PublicationContext {
  const indexedLibraries = new Map<string, IndexedLibrary>();
  const diagnostics: PublicationContextDiagnostic[] = [];
  for (const input of args.libraries) {
    const existing = indexedLibraries.get(input.sourceIdentity);
    if (existing !== undefined) {
      diagnostics.push(
        Object.freeze({
          kind:
            existing.library.libraryName === input.ast.library.name
              ? "duplicate-source-identity"
              : "library-name-mismatch",
          sourceIdentity: input.sourceIdentity,
          libraryNames: Object.freeze([existing.library.libraryName, input.ast.library.name]),
          declarationLocations: Object.freeze([
            copyLocation(existing.library.ast.library.location),
            copyLocation(input.ast.library.location),
          ]),
        }),
      );
      continue;
    }
    indexedLibraries.set(input.sourceIdentity, indexLibrary(input));
  }
  if (diagnostics.length > 0) throw new PublicationContextError(diagnostics);
  const libraries = Object.freeze([...indexedLibraries.values()].map(({ library }) => library));
  const libraryResolutions = new Map<string, PublicationLibraryResolution>();
  const resolveLibrary = args.resolveLibrary;

  function lookup(
    fromSourceIdentity: string,
    ref: ReferenceName,
    expectedKind: "Concept" | "Terminology",
    location?: Location,
  ): PublicationDeclarationHit<Declaration, DeclarationIdentity> | PublicationLookupFailure {
    const site = lookupSite(fromSourceIdentity, ref, location);
    const owner = indexedLibraries.get(fromSourceIdentity);
    const base = { site, expectedKind };
    if (owner === undefined)
      return Object.freeze({ ...base, kind: "missing", reason: "owner-library" });
    let target = owner;
    if (typeof ref !== "string" && ref.libraryName !== owner.library.libraryName) {
      const key = JSON.stringify([fromSourceIdentity, ref.libraryName]);
      let resolution = libraryResolutions.get(key);
      if (resolution === undefined) {
        resolution = Object.freeze({ ...resolveLibrary(fromSourceIdentity, ref.libraryName) });
        libraryResolutions.set(key, resolution);
      }
      if (resolution.kind !== "resolved") {
        return Object.freeze({
          ...base,
          kind: resolution.kind,
          ...(resolution.kind === "missing" ? { reason: "library" as const } : {}),
          ...(resolution.sourceIdentity === undefined
            ? {}
            : { targetSourceIdentity: resolution.sourceIdentity }),
          ...(resolution.detail === undefined ? {} : { detail: resolution.detail }),
          ...(resolution.message === undefined ? {} : { message: resolution.message }),
        }) as PublicationLookupFailure;
      }
      const resolvedTarget = indexedLibraries.get(resolution.sourceIdentity);
      if (resolvedTarget === undefined)
        return Object.freeze({
          ...base,
          kind: "outside-context",
          targetSourceIdentity: resolution.sourceIdentity,
          detail: "The resolved library was not supplied in the raw publication context.",
        });
      target = resolvedTarget;
    }
    const name = typeof ref === "string" ? ref : ref.name;
    const targetBase = { ...base, targetSourceIdentity: target.library.sourceIdentity };
    const entries = (expectedKind === "Concept" ? target.concepts : target.terminologies).get(name);
    if (entries === undefined) {
      const kinds = target.kinds.get(name);
      return kinds === undefined
        ? Object.freeze({ ...targetBase, kind: "missing", reason: "declaration" })
        : Object.freeze({
            ...targetBase,
            kind: "wrong-kind",
            actualKinds: Object.freeze([...kinds].sort()),
          });
    }
    if (entries.length > 1)
      return Object.freeze({
        ...targetBase,
        kind: "ambiguous",
        declarationLocations: Object.freeze(entries.map((entry) => entry.location)),
      });
    const entry = entries[0];
    return Object.freeze({
      kind: "hit",
      site,
      library: target.library,
      identity: entry.identity,
      node: entry.node,
    });
  }

  return Object.freeze({
    getLibrary: (sourceIdentity: string): PublicationLibrary | undefined =>
      indexedLibraries.get(sourceIdentity)?.library,
    getLibraries: (): readonly PublicationLibrary[] => libraries,
    lookupConcept: (
      from: string,
      ref: ReferenceName,
      location?: Location,
    ): PublicationConceptLookup =>
      lookup(from, ref, "Concept", location) as PublicationConceptLookup,
    lookupTerminology: (
      from: string,
      ref: ReferenceName,
      location?: Location,
    ): PublicationTerminologyLookup =>
      lookup(from, ref, "Terminology", location) as PublicationTerminologyLookup,
  });
}
