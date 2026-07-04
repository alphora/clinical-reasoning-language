// celSymbolsIndex (#4 fix): the CEL services must source CRL symbols via the .cel's covered closure
// (resolveCelImports), NOT the ProjectIndex — which gates on isCrlProject and so returns nothing for a .cel
// whose covered .crl lives outside a CRL-project layout. The dme101 policy fixture is exactly that case (a
// single .crl, no package.json crl.libraries), and is what surfaced the bug: hover/definition/completion on
// concepts/decisions found nothing because ProjectIndex.getAllProjectDeclarations was blind to it.
import * as path from "node:path";
import { resolveCelImports } from "../../cel/imports";
import type { ResolvedCelGraph } from "../../cel/imports/types";
import type { RegistryEntry } from "../../imports/types";
import { celSymbolsIndex } from "../celSymbols";
import { ProjectIndex } from "../projectIndex";

describe("celSymbolsIndex (#4) — CRL symbols from the covered closure", () => {
  const fixtureDir = path.resolve(__dirname, "../../tests/fixtures/policies/dme101-030");
  const celPath = path.join(fixtureDir, "dme101-030.cel");

  it("resolves the covered library's concepts/decisions where the ProjectIndex returns nothing", () => {
    // The bug's precondition: the fixture is not an isCrlProject, so the index is blind to it.
    expect(new ProjectIndex().getAllProjectDeclarations([fixtureDir]).length).toBe(0);

    const src = celSymbolsIndex(resolveCelImports(celPath));
    const decls = src.getAllProjectDeclarations([]);
    const concept = decls.find((d) => d.name === "Fracture Of Skull Or Vertebrae" && d.kind === "concept");
    const decision = decls.find((d) => d.name === "Ultrasonic Osteogenesis Stimulator Coverage" && d.kind === "decision");
    expect(concept).toBeDefined();
    expect(concept?.libraryName).toBe("Ultrasonic Osteogenesis Stimulator Coverage");
    expect(concept?.filePath).toBe(path.join(fixtureDir, "dme101-030.crl"));
    expect(concept?.nameRange).toBeDefined(); // the go-to-definition target
    expect(decision?.arms).toEqual(["certify.Approve", "not-certify.Deny"]); // arms drive result-value completion
    expect(src.getAllProjectLibraries([]).map((l) => l.libraryName)).toContain("Ultrasonic Osteogenesis Stimulator Coverage");
  });

  it("local shadows package: a package library hidden by a same-name local is not exposed", () => {
    // The resolver resolves "Foo" local-first then looks ONLY there, so exposing a package "Foo"'s members
    // would offer/navigate symbols the validator rejects. Hand-built graph: same-name local + package.
    const LOC = { start: { line: 1, column: 0 }, end: { line: 2, column: 0 } };
    const entry = (filePath: string, origin: RegistryEntry["origin"], conceptName: string): RegistryEntry => ({
      name: "Foo",
      filePath,
      isRoot: false,
      origin,
      ast: {
        type: "CRL",
        library: { type: "LibraryDeclaration", name: "Foo", location: LOC },
        statements: [{ type: "Concept", name: conceptName, location: LOC } as never],
        location: LOC,
      } as never,
    });
    const barPkg: RegistryEntry = { ...entry("/pkg/bar.crl", "package", "Bar Only"), name: "Bar", ast: { ...entry("/pkg/bar.crl", "package", "Bar Only").ast, library: { type: "LibraryDeclaration", name: "Bar", location: LOC } } as never };
    const graph = {
      crlRegistry: {
        byNameLocal: new Map([["Foo", entry("/local/foo.crl", "local", "Local Only")]]),
        byNamePackage: new Map([
          ["Foo", entry("/pkg/foo.crl", "package", "Pkg Only")],
          ["Bar", barPkg],
        ]),
      },
    } as unknown as ResolvedCelGraph;
    const names = celSymbolsIndex(graph).getAllProjectDeclarations([]).map((d) => d.name);
    expect(names).toContain("Local Only");
    expect(names).not.toContain("Pkg Only"); // package shadowed by the same-name local
    expect(names).toContain("Bar Only"); // a differently-named package lib is NOT skipped (scoping guard)
  });
});
