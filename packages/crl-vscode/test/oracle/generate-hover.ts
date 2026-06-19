// Golden generator for the hover providers (#132 step 3.0). Runs the CURRENT providers
// (via the vscode stub) on a fixture and snapshots their output. After the hover
// extraction, the same harness runs the thin delegating providers and must reproduce
// these goldens byte-for-byte.
import * as fs from "node:fs";
import * as path from "node:path";
import {
  NarrativeHoverProvider,
  TypeValuetypeHoverProvider,
  ConceptRefHoverProvider,
} from "../../src/hover";
import { parseCatalog } from "../../src/catalog";
import { Position } from "./vscode-stub";
import { makeDoc, toPlain } from "./harness-lib";

async function main() {
  // Run from packages/crl-vscode; core's catalog md is a sibling package.
  const catalogMd = fs.readFileSync(
    path.resolve(process.cwd(), "../crl/src/cql-emitter/catalog/inference-pattern-catalog.md"),
    "utf-8",
  );
  const patterns = parseCatalog(catalogMd);
  // Fake index with no declarations → exercises the ConceptRef ORPHAN path (scanDeclarations).
  const fakeIndex = { getDeclarations: () => [] } as unknown as ConstructorParameters<
    typeof ConceptRefHoverProvider
  >[0];

  const providers: Record<string, { provideHover: (d: unknown, p: Position) => unknown }> = {
    narrative: new NarrativeHoverProvider(patterns) as never,
    typevaluetype: new TypeValuetypeHoverProvider() as never,
    conceptRefOrphan: new ConceptRefHoverProvider(fakeIndex) as never,
  };

  const FIXTURE = [
    "# Concepts",
    "",
    'concept "Body Mass Index"',
    "- type is Observation.",
    "- value type is Quantity.",
    "",
    'decision "X"',
    "first:",
    '- when "Body Mass Index" then recommend activity "Y".',
    "end.",
  ].join("\n");
  const doc = makeDoc(FIXTURE, "/fake/hover.crl");

  const cases = [
    { provider: "typevaluetype", line: 3, character: 15 }, // inside "Observation"
    { provider: "typevaluetype", line: 4, character: 20 }, // inside "Quantity"
    { provider: "conceptRefOrphan", line: 8, character: 12 }, // inside quoted "Body Mass Index"
    { provider: "narrative", line: 3, character: 15 }, // a non-`definition is` line → expect null
  ];

  const results = [];
  for (const c of cases) {
    const hover = await Promise.resolve(
      providers[c.provider].provideHover(doc, new Position(c.line, c.character)),
    );
    results.push({ ...c, hover: toPlain(hover ?? null) });
  }

  // Run from packages/crl-vscode (the bundle's __dirname is the throwaway .gen/ dir).
  const outDir = path.resolve(process.cwd(), "test/oracle/golden");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "hover.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(`hover golden written: ${results.length} cases →`);
  for (const r of results)
    console.log(`  ${r.provider} @${r.line}:${r.character} → ${(r.hover as { kind?: string } | null)?.kind ?? "null"}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
