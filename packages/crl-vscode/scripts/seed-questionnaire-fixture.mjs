#!/usr/bin/env node
// Seed a FHIR Questionnaire / QuestionnaireResponse fixture into the qa tree, where the real producer
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
//   npm run seed:questionnaire -- --root <content-repo> --all --fixture all-types
//   npm run seed:questionnaire -- --root <content-repo> --case <case-slug-or-prefix>
//   npm run seed:questionnaire -- --root <content-repo> --all --clean
//
// ⚠ These are SEEDED artifacts: identical content for every case, so the pane shows the same form everywhere.
// That is expected until the producer exists.
//
// TWO SAFETY PROPERTIES, both load-bearing (impl review, disc 441):
//
//   1. DETERMINISM. The pane's loader takes the FIRST findFiles hit per resource type and skips the rest, and
//      findFiles ordering is unspecified. Two fixtures with different resource ids left in one case directory
//      would mean "which form renders" is luck — reproducing the exact class of false-negative CSP reading this
//      pane has already produced twice. So a write REMOVES every known fixture filename (from ALL fixtures)
//      before writing the chosen one. One fixture in, one fixture out.
//
//   2. SCOPED CLEANUP. `--clean` deletes only files this script could have written, by name, and removes the
//      ResourceType directory only if it is then EMPTY. It used to rmSync the whole directory, which was
//      equivalent today and destructive the day #277's producer (or a hand-authored pair) writes real artifacts
//      to the same settled path.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const testdata = join(here, "..", "src", "testdata", "questionnaire-pane");

/** Every fixture this script can seed. `--fixture <key>`; `basic` is the default. */
const FIXTURES = {
  basic: "get-case.example.json",
  "all-types": "all-item-types.example.json",
};

const argv = process.argv.slice(2);
const arg = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (n) => argv.includes(n);

const root = arg("--root");
const only = arg("--case");
const which = arg("--fixture") ?? "basic";
const all = has("--all");
const clean = has("--clean");

if (!root || (!all && !only)) {
  console.error("usage: --root <content-repo> (--all | --case <case-slug-or-prefix>) [--fixture basic|all-types] [--clean]");
  process.exit(2);
}
if (!existsSync(root)) {
  console.error(`--root does not exist: ${root}`);
  process.exit(2);
}
if (!Object.hasOwn(FIXTURES, which)) {
  console.error(`unknown --fixture ${which}; expected one of: ${Object.keys(FIXTURES).join(", ")}`);
  process.exit(2);
}

const load = (file) => JSON.parse(readFileSync(join(testdata, file), "utf8"));

/** Filenames ANY fixture could have written, per resource type — the exact set `--clean` may delete and a write
 *  must clear first. Derived from the fixture contents so it can never drift from what was actually written. */
const knownNames = { Questionnaire: new Set(), QuestionnaireResponse: new Set() };
for (const file of Object.values(FIXTURES)) {
  const f = load(file);
  knownNames.Questionnaire.add(`${f.questionnaire.id}.json`);
  knownNames.QuestionnaireResponse.add(`${f.questionnaireResponse.id}.json`);
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

/** Remove every known fixture filename from `dir`. Returns how many were removed. Never touches anything else. */
function removeKnown(dir, type) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return 0;
  let removed = 0;
  for (const name of knownNames[type]) {
    const p = join(dir, name);
    if (existsSync(p)) {
      rmSync(p, { force: true });
      removed++;
    }
  }
  return removed;
}

const fixture = load(FIXTURES[which]);
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
let kept = 0;
for (const caseDir of targets) {
  for (const [type, resource] of [
    ["Questionnaire", fixture.questionnaire],
    ["QuestionnaireResponse", fixture.questionnaireResponse],
  ]) {
    const dir = join(caseDir, type);
    if (clean) {
      n += removeKnown(dir, type);
      // Remove the ResourceType dir ONLY if our files were the only thing in it. Anything left is somebody
      // else's — the producer's, or hand-authored — and is none of this script's business.
      if (existsSync(dir) && statSync(dir).isDirectory()) {
        const rest = readdirSync(dir);
        if (rest.length === 0) rmSync(dir, { recursive: true, force: true });
        else kept += rest.length;
      }
      continue;
    }
    mkdirSync(dir, { recursive: true });
    removeKnown(dir, type); // determinism: never leave two fixtures for the loader to choose between
    writeFileSync(join(dir, `${resource.id}.json`), JSON.stringify(resource, null, 2) + "\n");
    n++;
  }
}

console.log(
  clean
    ? `removed ${n} seeded file(s) across ${targets.length} case dir(s) under ${root}` +
        (kept ? `; left ${kept} file(s) this script did not write` : "")
    : `seeded ${n} file(s) from fixture "${which}" across ${targets.length} case dir(s) under ${root}`,
);
