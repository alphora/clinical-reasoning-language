// Golden generator for the completion providers (#132 step 3b). Runs the CURRENT providers
// (via the vscode stub) on fixtures exercising every branch, and serializes. After the
// extraction the same harness runs the thin delegating providers and must reproduce the
// golden byte-for-byte. Coverage per the plan review (091): narrative in/out of a
// `definition is` body; type/valuetype/param slots + misses; ConceptRef expectedKind per
// slot (coded from→terminology, recommend activity→activity, use decision→decision,
// when→concept), qualifier (dot + quote trigger), orphan vs indexed paths, declaration-
// header + unquoted-slot suppression, empty returns, and narrative concept/param precedence.
import * as fs from "node:fs";
import * as path from "node:path";
import {
  NarrativeCompletionProvider,
  TypeCompletionProvider,
  ValuetypeCompletionProvider,
  ParamTypeCompletionProvider,
  ConceptRefCompletionProvider,
} from "../../src/completion";
import { parseCatalog } from "@smile-digital-health/crl/language-services";
import { Position } from "./vscode-stub";
import { makeDoc, toPlain } from "./harness-lib";

type Idx = ConstructorParameters<typeof ConceptRefCompletionProvider>[0];

async function main() {
  const catalogMd = fs.readFileSync(
    path.resolve(process.cwd(), "../crl/src/cql-emitter/catalog/inference-pattern-catalog.md"),
    "utf-8",
  );
  const patterns = parseCatalog(catalogMd);
  if (patterns.length === 0) throw new Error("oracle: catalog parsed 0 patterns");

  const emptyIndex = { getDeclarations: () => [] } as unknown as Idx;
  const indexedDecls = [
    { name: "BMI", kind: "concept", libraryName: "Vitals", origin: "local", type: "Observation", filePath: "/p/vitals.crl", line: 0 },
    { name: "Diabetes Codes", kind: "terminology", libraryName: "Vitals", origin: "local", filePath: "/p/vitals.crl", line: 5 },
    { name: "Screen", kind: "decision", libraryName: "Logic", origin: "local", filePath: "/p/logic.crl", line: 0 },
    { name: "Refer", kind: "activity", libraryName: "Logic", origin: "local", filePath: "/p/logic.crl", line: 10 },
    { name: "Lookback", kind: "parameter", libraryName: "Logic", origin: "local", type: "Period", filePath: "/p/logic.crl", line: 20 },
  ];
  const fullIndex = { getDeclarations: () => indexedDecls } as unknown as Idx;
  // Same-name concept + parameter → exercises applyNarrativePrecedence in a narrative slot.
  const precedenceIndex = {
    getDeclarations: () => [
      { name: "Lookback", kind: "concept", libraryName: "L", origin: "local", filePath: "/p.crl", line: 0 },
      { name: "Lookback", kind: "parameter", libraryName: "L", origin: "local", type: "Period", filePath: "/p.crl", line: 5 },
    ],
  } as unknown as Idx;

  const narrativeProv = new NarrativeCompletionProvider(patterns);
  const typeProv = new TypeCompletionProvider();
  const valuetypeProv = new ValuetypeCompletionProvider();
  const paramProv = new ParamTypeCompletionProvider();
  const refOrphanProv = new ConceptRefCompletionProvider(emptyIndex);
  const refIndexedProv = new ConceptRefCompletionProvider(fullIndex);
  const refPrecedenceProv = new ConceptRefCompletionProvider(precedenceIndex);

  // Orphan declarations (scanDeclarations sees concept/terminology/parameter headers).
  const DECLS = [
    'concept "BMI":',
    "- type is Observation.",
    'terminology "Diabetes Codes":',
    '- coded from "http://x".',
    'parameter "Lookback":',
    "- param type is Period.",
  ].join("\n");
  const declLineCount = 6;

  const results: unknown[] = [];
  const run = async (
    label: string,
    prov: { provideCompletionItems: (d: unknown, p: Position) => unknown },
    doc: unknown,
    line: number,
    character: number,
  ) => {
    const items = await Promise.resolve(prov.provideCompletionItems(doc, new Position(line, character)));
    results.push({ label, line, character, items: toPlain(items ?? null) });
  };
  const oneLine = (s: string) => makeDoc(s, "/f.crl");
  const orphan = (label: string, refLine: string) =>
    run(label, refOrphanProv, makeDoc(DECLS + "\n" + refLine, "/fake/orphan.crl"), declLineCount, refLine.length);
  const indexed = (label: string, refLine: string, prov = refIndexedProv) =>
    run(label, prov, makeDoc(refLine, "/fake/indexed.crl"), 0, refLine.length);

  // narrative
  await run("narrative-in-body", narrativeProv, oneLine("- definition is "), 0, 16);
  await run("narrative-not-body", narrativeProv, oneLine("- when x"), 0, 7);
  // type / valuetype / param + a miss
  await run("type", typeProv, oneLine("- type is "), 0, 10);
  await run("type-miss", typeProv, oneLine("- when "), 0, 7);
  await run("valuetype", valuetypeProv, oneLine("- value type is "), 0, 16);
  await run("paramtype", paramProv, oneLine("- param type is "), 0, 16);
  // ConceptRef — orphan path (concept/terminology/parameter only)
  await orphan("ref-orphan-when", "- when \"");
  await orphan("ref-orphan-coded-from", "- coded from \"");
  await orphan("ref-orphan-header-suppress", "concept \"");
  await orphan("ref-orphan-unquoted-slot", "- type is \"");
  await orphan("ref-orphan-no-quote", "- when x");
  // ConceptRef — indexed path (all 5 kinds available; expectedKind narrows)
  await indexed("ref-indexed-when", "- when \"");
  await indexed("ref-indexed-coded-from", "- coded from \"");
  await indexed("ref-indexed-recommend-activity", "then recommend activity \"");
  await indexed("ref-indexed-use-decision", "- use decision \"");
  await indexed("ref-indexed-qualified-dot", "- when \"Vitals\".");
  await indexed("ref-indexed-qualified-quote", "- when \"Vitals\".\"");
  await indexed("ref-narrative-precedence", "- definition is has \"", refPrecedenceProv);

  // CRL_ORACLE_OUT lets check.mjs redirect output to a temp file for diffing vs the golden.
  const outFile = process.env.CRL_ORACLE_OUT ?? path.resolve(process.cwd(), "test/oracle/golden/completion.json");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2) + "\n");
  console.log(`completion golden: ${results.length} cases →`);
  for (const r of results as { label: string; items: unknown }[]) {
    const n = Array.isArray(r.items) ? r.items.length : r.items === null ? "null" : "?";
    console.log(`  ${r.label} → ${n} item(s)`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
