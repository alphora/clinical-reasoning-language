// Golden generator for the hover providers (#132 step 3.0/hover). Runs the CURRENT
// providers (via the vscode stub) on fixtures that exercise all three + serializes.
// After the hover extraction, the same harness runs the thin delegating providers and
// must reproduce these goldens byte-for-byte.
import * as fs from "node:fs";
import * as path from "node:path";
import {
  NarrativeHoverProvider,
  TypeValuetypeHoverProvider,
  ConceptRefHoverProvider,
} from "../../src/hover";
import { parseCatalog } from "@smile-digital-health/crl/language-services";
import { Position } from "./vscode-stub";
import { makeDoc, toPlain } from "./harness-lib";

async function main() {
  // Run from packages/crl-vscode; core's catalog md is a sibling package.
  const catalogMd = fs.readFileSync(
    path.resolve(process.cwd(), "../crl/src/cql-emitter/catalog/inference-pattern-catalog.md"),
    "utf-8",
  );
  const patterns = parseCatalog(catalogMd);
  if (patterns.length === 0) throw new Error("oracle: catalog parsed 0 patterns");

  // A concrete narrative instance built from the first pattern (robust to catalog drift):
  // `<X>` slots → `"Foo"`, prefixed with `- definition is ` so isDefinitionIsBody fires.
  const concrete = patterns[0].narrative.replace(/<[A-Za-z][A-Za-z0-9_]*>/g, '"Foo"');
  const narrativeLine = `- definition is ${concrete}`;
  const narrativeCol = "- definition is ".length + 1; // inside the matched span

  // Fake index with no declarations → exercises the ConceptRef ORPHAN path.
  const fakeIndex = { getDeclarations: () => [] } as unknown as ConstructorParameters<
    typeof ConceptRefHoverProvider
  >[0];

  // A non-empty index → exercises the ConceptRef INDEXED path (bare + qualified ref).
  const indexedDecl = {
    name: "Diabetic",
    kind: "concept",
    libraryName: "Conditions",
    filePath: "/proj/conditions.crl",
    line: 4,
    bodyPreview: 'definition is has "Diabetes"',
  };
  const indexedIndex = { getDeclarations: () => [indexedDecl] } as unknown as ConstructorParameters<
    typeof ConceptRefHoverProvider
  >[0];

  const narrativeProv = new NarrativeHoverProvider(patterns);
  const typevtProv = new TypeValuetypeHoverProvider();
  const conceptrefProv = new ConceptRefHoverProvider(fakeIndex);
  const conceptrefIndexedProv = new ConceptRefHoverProvider(indexedIndex);

  // Concept headers need the trailing colon for scanDeclarations to pick them up.
  const FIXTURE = [
    'concept "Diabetic":', //                                   0
    '- definition is has "Diabetes".', //                       1
    "", //                                                      2
    'concept "Body Weight":', //                                3
    "- type is Observation.", //                                4
    "- value type is Quantity.", //                             5
    "", //                                                      6
    'decision "Screen":', //                                    7
    "first:", //                                                8
    '- when "Diabetic" then recommend activity "Refer".', //    9
    "end.", //                                                  10
  ].join("\n");
  const doc = makeDoc(FIXTURE, "/fake/hover.crl");
  const narrativeDoc = makeDoc(narrativeLine, "/fake/narrative.crl");
  // Qualified ref `"Lib"."Concept"` — the indexed path's qualifierMatch branch.
  const qualifiedDoc = makeDoc(
    '- when "Conditions"."Diabetic" then recommend activity "Refer".',
    "/fake/q.crl",
  );

  const results: unknown[] = [];
  const run = async (
    label: string,
    prov: { provideHover: (d: unknown, p: Position) => unknown },
    d: unknown,
    line: number,
    character: number,
  ) => {
    const hover = await Promise.resolve(prov.provideHover(d, new Position(line, character)));
    results.push({ provider: label, line, character, hover: toPlain(hover ?? null) });
  };

  await run("narrative", narrativeProv, narrativeDoc, 0, narrativeCol);
  await run("typevaluetype-type", typevtProv, doc, 4, 12); // inside "Observation"
  await run("typevaluetype-valuetype", typevtProv, doc, 5, 18); // inside "Quantity"
  await run("typevaluetype-request", typevtProv, makeDoc("- request CPGServiceRequest.", "/fake/r.crl"), 0, 18); // activity request type
  await run("typevaluetype-request-dnp", typevtProv, makeDoc("- request do not perform CPGServiceRequest.", "/fake/rd.crl"), 0, 30); // do-not-perform modifier
  await run("conceptRef-orphan", conceptrefProv, doc, 9, 12); // on "Diabetic" ref
  await run("conceptRef-miss", conceptrefProv, doc, 9, 2); // not on a quoted ref → null
  await run("conceptRef-indexed-bare", conceptrefIndexedProv, doc, 9, 12); // indexed path, bare ref
  await run("conceptRef-indexed-qualified", conceptrefIndexedProv, qualifiedDoc, 0, 25); // "Conditions"."Diabetic"
  // Inclusive-end hit-testing on the `- type is Observation.` token (cols 10..21):
  await run("boundary-token-start", typevtProv, doc, 4, 10); // cursor at token start → hover
  await run("boundary-token-end", typevtProv, doc, 4, 21); // cursor at inclusive end → hover
  await run("boundary-past-end", typevtProv, doc, 4, 22); // one past end → null

  // CRL_ORACLE_OUT lets check.mjs redirect output to a temp file for diffing vs the golden.
  const outFile = process.env.CRL_ORACLE_OUT ?? path.resolve(process.cwd(), "test/oracle/golden/hover.json");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2) + "\n");
  console.log(`hover golden: ${results.length} cases (narrative pattern0 = ${JSON.stringify(patterns[0].narrative)}) →`);
  for (const r of results as { provider: string; hover: { kind?: string } | null }[])
    console.log(`  ${r.provider} → ${r.hover?.kind ?? "null"}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
