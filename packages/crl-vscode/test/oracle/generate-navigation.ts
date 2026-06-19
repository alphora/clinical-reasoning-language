// Golden generator for the navigation providers (#132 step 3c). Unlike hover/completion
// (fake indexes), navigation is deeply ProjectIndex-coupled, so this builds a REAL
// `new ProjectIndex()` over a temp fixture project (mirroring projectIndex.test.mjs). Each
// provider runs OLD vs NEW; the harness captures thrown/rejected results as { error } (the
// rename paths), and absolute temp paths are normalized to "$TMP" so the committed golden is
// deterministic across runs (the temp dir name changes every run).
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  CrlDefinitionProvider,
  CrlReferenceProvider,
  CrlDocumentSymbolProvider,
  CrlWorkspaceSymbolProvider,
  CrlRenameProvider,
  CrlDocumentLinkProvider,
} from "../../src/navigation";
import { ProjectIndex, canonicalize } from "@smile-digital-health/crl/language-services";
import { Position, Uri, workspace } from "./vscode-stub";
import { makeDoc, toPlain } from "./harness-lib";

const ROOT_SRC = [
  "# Root", //                              0
  'library "Root".', //                     1
  'include "Sib".', //                      2
  "", //                                    3
  'terminology "BMI Valueset":', //         4
  "- valueset is `urn:bmi`.", //            5
  "", //                                    6
  'concept "BMI":', //                      7
  "- type is Observation.", //              8
  '- coded from "BMI Valueset".', //        9
  "", //                                    10
  'concept "BMI Composed":', //             11
  "- type is Observation.", //              12
  '- defined as "BMI".', //                 13
  "", //                                    14
  'concept "BMI Cross":', //                15
  "- type is Observation.", //              16
  '- defined as "Sib"."Sib Concept".', //   17
].join("\n");

const SIB_SRC = ["# Sib", 'library "Sib".', "", 'concept "Sib Concept":', "- type is Observation."].join("\n");

function normalizePaths(v: unknown, roots: string[]): unknown {
  if (typeof v === "string") {
    let s = v;
    for (const r of roots) s = s.split(r).join("$TMP");
    return s;
  }
  if (Array.isArray(v)) return v.map((x) => normalizePaths(x, roots));
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) o[k] = normalizePaths((v as Record<string, unknown>)[k], roots);
    return o;
  }
  return v;
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "crl-nav-oracle-"));
  const rootFile = path.join(root, "root.crl");
  const sibFile = path.join(root, "sib.crl");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "tmp", version: "0.0.0" }));
  fs.writeFileSync(rootFile, ROOT_SRC);
  fs.writeFileSync(sibFile, SIB_SRC);

  try {
    const index = new ProjectIndex();
    const def = new CrlDefinitionProvider(index);
    const ref = new CrlReferenceProvider(index);
    const docsym = new CrlDocumentSymbolProvider(index);
    const wssym = new CrlWorkspaceSymbolProvider(index);
    const rename = new CrlRenameProvider(index);
    const links = new CrlDocumentLinkProvider(index);
    const rootDoc = makeDoc(ROOT_SRC, rootFile);

    const results: unknown[] = [];
    const run = async (label: string, fn: () => unknown) => {
      try {
        const r = await Promise.resolve(fn());
        results.push({ label, result: toPlain(r ?? null) });
      } catch (e) {
        results.push({ label, error: e instanceof Error ? e.message : String(e) });
      }
    };
    const at = (line: number, character: number) => new Position(line, character);

    // Definition
    await run("def-on-decl", () => def.provideDefinition(rootDoc, at(7, 10))); // "BMI" decl
    await run("def-on-bare-ref", () => def.provideDefinition(rootDoc, at(13, 15))); // ref "BMI"
    await run("def-on-include", () => def.provideDefinition(rootDoc, at(2, 10))); // include "Sib"
    await run("def-on-qualifier", () => def.provideDefinition(rootDoc, at(17, 15))); // "Sib" qualifier
    await run("def-on-qualified-name", () => def.provideDefinition(rootDoc, at(17, 25))); // "Sib Concept"

    // References
    await run("refs-BMI-withDecl", () => ref.provideReferences(rootDoc, at(7, 10), { includeDeclaration: true }));
    await run("refs-BMI-noDecl", () => ref.provideReferences(rootDoc, at(7, 10), { includeDeclaration: false }));

    // DocumentSymbols (sib.crl decls must NOT appear — filtered by filePath)
    await run("docsymbols", () => docsym.provideDocumentSymbols(rootDoc));

    // WorkspaceSymbols
    workspace.workspaceFolders = [{ uri: Uri.file(root) }];
    await run("worksymbols-query-BMI", () => wssym.provideWorkspaceSymbols("BMI"));
    await run("worksymbols-empty-query", () => wssym.provideWorkspaceSymbols(""));
    workspace.workspaceFolders = [];
    await run("worksymbols-empty-roots", () => wssym.provideWorkspaceSymbols("BMI"));

    // Rename — prepare
    await run("rename-prepare-decl", () => rename.prepareRename(rootDoc, at(7, 10)));
    await run("rename-prepare-library", () => rename.prepareRename(rootDoc, at(1, 10))); // "Root" library
    await run("rename-prepare-qualifier", () => rename.prepareRename(rootDoc, at(17, 15)));
    await run("rename-prepare-nosymbol", () => rename.prepareRename(rootDoc, at(0, 0)));

    // Rename — edits
    await run("rename-edits-success", () => rename.provideRenameEdits(rootDoc, at(7, 10), "BMI2")); // decl + ref
    // Renames via the qualified cross-lib ref. In this flat fixture the cross-lib decl lookup
    // returns undefined (the include doesn't resolve a sibling library), so only the local ref
    // edits — faithful current behavior. TRUE cross-file decl+ref ordering is pinned by the
    // computeRename unit test (navigation.test.ts).
    await run("rename-edits-via-qualified-ref", () => rename.provideRenameEdits(rootDoc, at(17, 25), "Sib Concept 2"));
    await run("rename-edits-noop", () => rename.provideRenameEdits(rootDoc, at(7, 10), "BMI"));
    await run("rename-edits-invalid", () => rename.provideRenameEdits(rootDoc, at(7, 10), 'Bad"Name'));
    await run("rename-edits-collision", () => rename.provideRenameEdits(rootDoc, at(7, 10), "BMI Composed"));
    await run("rename-edits-nosymbol", () => rename.provideRenameEdits(rootDoc, at(0, 0), "X"));

    // DocumentLinks (the include "Sib" on line 2)
    await run("doclinks", () => links.provideDocumentLinks(rootDoc));

    const normalized = normalizePaths(results, [canonicalize(root), root]);
    const outFile =
      process.env.CRL_ORACLE_OUT ?? path.resolve(process.cwd(), "test/oracle/golden/navigation.json");
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(normalized, null, 2) + "\n");
    console.log(`navigation golden: ${results.length} cases →`);
    for (const r of results as { label: string; result?: unknown; error?: string }[]) {
      const n = r.error
        ? `error: ${r.error.slice(0, 40)}`
        : Array.isArray(r.result)
          ? `${r.result.length} item(s)`
          : r.result === null
            ? "null"
            : (r.result as { kind?: string })?.kind ?? "obj";
      console.log(`  ${r.label} → ${n}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
