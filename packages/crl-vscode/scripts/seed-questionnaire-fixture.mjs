#!/usr/bin/env node
// Seed the FHIR Questionnaire / QuestionnaireResponse fixture into the qa tree, where the real producer
// (issue #277) will eventually write them.
//
// WHY THIS EXISTS: the pane reads from the real qa path, not from a compiled-in fixture, so exercising it today
// needs files on disk at that path. This puts them there repeatably instead of by hand, and makes it obvious
// they are seeded rather than produced.
//
// Layout it writes (settled — docs/questionnaire-pane-integration-plan.md §5a):
//   <content-repo>/**/tests/data/fhir/patient/<library-slug>-cases/<case-slug>/Questionnaire/<id>.json
//   <content-repo>/**/tests/data/fhir/patient/<library-slug>-cases/<case-slug>/QuestionnaireResponse/<id>.json
//
// Usage (from the WORKTREE ROOT — E:\src\mv-plandefinition-questionnaire):
//   npm run seed:questionnaire -- --root <content-repo> --all
//   npm run seed:questionnaire -- --root <content-repo> --case <case-slug-or-prefix>
//   npm run seed:questionnaire -- --root <content-repo> --all --clean
//
// Or directly:
//   node scripts/seed-questionnaire-fixture.mjs --root <content-repo> --all
//   node scripts/seed-questionnaire-fixture.mjs --root <content-repo> --case <case-slug-or-prefix>
//   node scripts/seed-questionnaire-fixture.mjs --root <content-repo> --all --clean
//
// ⚠ These are SEEDED artifacts: identical content for every case, so the pane shows the same form everywhere.
// That is expected until the producer exists. `--clean` removes what this script wrote.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "..", "src", "testdata", "questionnaire-pane", "get-case.example.json");

const argv = process.argv.slice(2);
const arg = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (n) => argv.includes(n);

const root = arg("--root");
const only = arg("--case");
const all = has("--all");
const clean = has("--clean");

if (!root || (!all && !only)) {
  console.error("usage: --root <content-repo> (--all | --case <case-slug-or-prefix>) [--clean]");
  process.exit(2);
}
if (!existsSync(root)) {
  console.error(`--root does not exist: ${root}`);
  process.exit(2);
}

/** Every `<...>/tests/data/fhir/patient/<library>/<case>` directory under root. */
function caseDirs(dir, acc = [], depth = 0) {
  if (depth > 8) return acc;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === "node_modules" || e.name === ".git") continue;
    const p = join(dir, e.name);
    if (p.replace(/\\/g, "/").endsWith("tests/data/fhir/patient")) {
      for (const lib of readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory())) {
        for (const c of readdirSync(join(p, lib.name), { withFileTypes: true }).filter((d) => d.isDirectory())) {
          acc.push(join(p, lib.name, c.name));
        }
      }
      continue;
    }
    caseDirs(p, acc, depth + 1);
  }
  return acc;
}

const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
const targets = caseDirs(resolve(root)).filter((d) => {
  if (all) return true;
  const name = d.replace(/\\/g, "/").split("/").pop();
  return name === only || name.startsWith(only);
});

if (!targets.length) {
  console.error(`no case directories matched under ${root}${only ? ` for --case ${only}` : ""}`);
  process.exit(1);
}

let n = 0;
for (const caseDir of targets) {
  for (const [type, resource] of [
    ["Questionnaire", fixture.questionnaire],
    ["QuestionnaireResponse", fixture.questionnaireResponse],
  ]) {
    const dir = join(caseDir, type);
    if (clean) {
      if (existsSync(dir) && statSync(dir).isDirectory()) {
        rmSync(dir, { recursive: true, force: true });
        n++;
      }
      continue;
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${resource.id}.json`), JSON.stringify(resource, null, 2) + "\n");
    n++;
  }
}

console.log(`${clean ? "removed" : "seeded"} ${n} item(s) across ${targets.length} case dir(s) under ${root}`);
