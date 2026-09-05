#!/usr/bin/env node
/**
 * `crl-emit-results` — run an engine over an emitted artifact and write what it produced.
 *
 * ⚠ NOT AN `emit_*` IN THE PURE SENSE, and named `emit-results` rather than `emit-questionnaire` for two
 * reasons. First, every other `emit_*` here is a pure function of source; this one RUNS AN ENGINE and
 * needs a Java RUNTIME (a JRE 17+; the driver ships compiled). Second, questionnaires are one use
 * case: prior auth produces Questionnaire + QuestionnaireResponse, a measure will produce
 * MeasureReport. The use case is an argument, not a tool.
 */
import path from "node:path";

// ⚠ THIS FILE PARSES FLAGS AND REPORTS. It once imported twenty more symbols — the emitters, the
// bundler, the JVM resolver — from when it orchestrated the run itself. They outlived that job and
// stayed, which is the same defined-but-never-called shape review has caught here four times: they read
// as evidence this file still does that work.
import {
  RESULT_USE_CASES,
  IMPLEMENTED_USE_CASES,
  isImplementedUseCase,
  isResultUseCase,
} from "../index";
import { resolveEmitOutput } from "../emit-layout";
import { produceResults } from "../results/produce";

// Provenance must name the version that actually ran, not a placeholder.
const CRL_VERSION: string = (require("../../package.json") as { version: string }).version;

const HELP_TEXT = `crl-emit-results — run an engine over an emitted artifact and write the results

USAGE:
  crl-emit-results --cel <file.cel> --crl <file.crl> --use-case <${RESULT_USE_CASES.join("|")}>
                   --jar <producer.jar> --jar-sha256 <hex> --enable [--out <dir>]
  crl-emit-results --help

WHAT IT DOES
  Emits the definition closure and the case data, builds one in-memory repository PER CASE
  (CQL inlined — an emitted Library points at a relative .cql url that an in-memory repo
  cannot follow), runs the engine, and writes what came back to

      tests/results/fhir/patient/<compartmentId>/<resourceType>/

  Case DATA stays where the CEL emitter puts it (tests/data/fhir/patient/...). Results are
  what an ENGINE produced and live in their own tree.

⚠ DISABLED BY DEFAULT. This downloads nothing, but it does execute a JVM, so it runs only
  with --enable. Medical-validation users read committed results and never need this;
  knowledge engineers producing them turn it on.

FLAGS:
  --cel <file>         The CEL suite. Required.
  --crl <file>         The CRL library the suite covers. Required.
  --use-case <name>    ${RESULT_USE_CASES.join(" | ")}. Required.
  --jar <path>         Engine jar. OPTIONAL — defaults to the local Maven repository copy at
                       ~/.m2/repository/org/opencds/cqf/fhir/cqf-fhir-cr-cli/4.7.0/cqf-fhir-cr-cli-4.7.0.jar
                       Do not have it? ~215 MB:
                         curl -fL --create-dirs -o "$HOME/.m2/repository/org/opencds/cqf/fhir/cqf-fhir-cr-cli/4.7.0/cqf-fhir-cr-cli-4.7.0.jar"                               "https://repo1.maven.org/maven2/org/opencds/cqf/fhir/cqf-fhir-cr-cli/4.7.0/cqf-fhir-cr-cli-4.7.0.jar"
                       ⚠ the -cli artifact; the plain cqf-fhir-cr jar will not launch.
  --jar-sha256 <hex>   Expected sha256, verified BEFORE EVERY LAUNCH. OPTIONAL — defaults to this
                       build's pinned value. Pass one only to pin a different engine build.
  --out <root>         Root the results tree hangs off. Default: the .cel file's PROJECT ROOT
                       (nearest package.json) — writes <root>/tests/results/fhir/patient/…
                       Pass any other path to write elsewhere; the layout under it is identical.
  --enable             Opt in to running a JVM. Without it, nothing runs.
  --no-prune           Keep superseded Questionnaire/QuestionnaireResponse files that this run
                       did not write. They are reported either way; by default they are deleted,
                       because a stale pair from a renamed case is shown to reviewers as real.
  --help               Show this message and exit 0.

EXIT CODES:
  0  Every case reached a terminal state and none FAILED.
  2  At least one case failed, or the engine could not be run.
  1  Bad arguments, or --enable was not given.
`;

interface Args {
  cel?: string; crl?: string; useCase?: string; jar?: string; jarSha?: string;
  out?: string; enable: boolean; prune: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { enable: false, prune: true };
  const need = (i: number, flag: string): string => {
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) {
      process.stderr.write(`${flag} requires a value\n`);
      process.exit(1);
    }
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === "--help" || f === "-h") { process.stdout.write(HELP_TEXT); process.exit(0); }
    else if (f === "--cel") a.cel = need(i++, f);
    else if (f === "--crl") a.crl = need(i++, f);
    else if (f === "--use-case") a.useCase = need(i++, f);
    else if (f === "--jar") a.jar = need(i++, f);
    else if (f === "--jar-sha256") a.jarSha = need(i++, f);
    else if (f === "--out") a.out = need(i++, f);
    else if (f === "--enable") a.enable = true;
    else if (f === "--no-prune") a.prune = false;
    else { process.stderr.write(`unknown flag ${f}\n`); process.exit(1); }
  }
  return a;
}

function main(): void {
  const a = parseArgs(process.argv.slice(2));
  if (!a.cel || !a.crl || !a.useCase) {
    process.stderr.write("--cel, --crl and --use-case are required\n");
    process.exit(1);
  }
  if (!isResultUseCase(a.useCase)) {
    process.stderr.write(`unknown --use-case "${a.useCase}"; valid: ${RESULT_USE_CASES.join(", ")}\n`);
    process.exit(1);
  }
  // ⚠ REFUSE A DECLARED-BUT-UNDRIVEN USE CASE. `measure` has a layout and a type mapping but no
  // `$evaluate-measure` driver: running it would apply the prior-auth path, find no Questionnaire, and
  // record `no-questionnaire` — a missing feature disguised as a legitimate empty result.
  if (!isImplementedUseCase(a.useCase)) {
    process.stderr.write(
      `--use-case "${a.useCase}" has no driver yet; implemented: ${IMPLEMENTED_USE_CASES.join(", ")}\n`,
    );
    process.exit(1);
  }
  if (!a.enable) {
    // ⚠ Named, not implied: a KE who has not opted in must be told the exact flag rather than left to
    // infer that "nothing happened" is a failure.
    process.stderr.write(
      "refusing to run: this executes a JVM and is disabled by default. Pass --enable.\n",
    );
    process.exit(1);
  }

  // ⚠ THE DEFAULT USED TO BE `path.dirname(a.cel)` WHILE THE HELP SAID "project root", and the two are
  // only the same when the .cel sits beside package.json. In the documented layout a .cel lives under
  // `src/cel/`, so the default wrote `src/cel/tests/results/fhir/` — which `useCases.ts`'s consumer glob
  // (`**/tests/results/fhir/patient/…`) WOULD have picked up. It was never reported because every caller
  // passes --out; the default was unfired rather than harmless.
  const outRoot = resolveEmitOutput("results", a.cel, a.out);
  if (!outRoot.ok) {
    process.stderr.write(`${outRoot.reason}\n`);
    process.exit(1);
  }

  // ⭐ ONE PIPELINE. The MCP `emit_results` tool calls this same function; this file only parses flags and
  // reports. Two entry points each orchestrating emit → bundle → spawn → write is how a helper ends up
  // right and a caller wrong, with the helper's tests green throughout.
  const outcome = produceResults({
    celPath: a.cel,
    crlPath: a.crl,
    useCase: a.useCase,
    outRoot: outRoot.root,
    jarPath: a.jar,
    jarSha256: a.jarSha,
    prune: a.prune,
    crlVersion: CRL_VERSION,
  });

  if (!outcome.ok) {
    for (const d of outcome.detail ?? []) process.stderr.write(`  ${d}
`);
    process.stderr.write(`${outcome.reason}
`);
    process.exit(2);
  }

  for (const name of outcome.notEmitted) {
    process.stderr.write(`case "${name}": declared in the suite but not emitted; skipped
`);
  }
  for (const c of outcome.manifest.cases) {
    process.stdout.write(
      c.state.padEnd(18) +
        " " +
        c.caseName +
        (c.artifacts?.length ? ` (${c.artifacts.length} artifact)` : "") +
        (c.reason ? ` — ${c.reason}` : "") +
        "\n",
    );
  }
  // Say what was deleted. A silent deletion is indistinguishable from a file that was never there.
  if (outcome.pruned.length > 0) {
    process.stderr.write(`\npruned ${outcome.pruned.length} superseded artifact(s):\n`);
    for (const f of outcome.pruned) process.stderr.write(`  ${f}\n`);
  }
  if (outcome.skippedLinks.length > 0) {
    process.stderr.write(`\n${outcome.skippedLinks.length} symlink(s) under the results tree were not followed:\n`);
    for (const f of outcome.skippedLinks) process.stderr.write(`  ${f}\n`);
  }
  if (outcome.orphaned.length > 0) {
    process.stderr.write(
      `\n${outcome.orphaned.length} file(s) were left alone (types this use case does not own):\n`,
    );
    for (const f of outcome.orphaned) process.stderr.write(`  ${f}\n`);
  }

  process.stdout.write(
    `\njava ${outcome.java.major} at ${outcome.java.exe}\n` +
      `engine jar${outcome.engineJar.defaulted ? " (defaulted from ~/.m2)" : ""}: ${outcome.engineJar.path}\n` +
      `manifest: ${outcome.manifestPath}\n` +
      `cases: ${outcome.manifest.cases.length}, failed: ${outcome.failed}\n`,
  );
  process.exit(outcome.failed > 0 ? 2 : 0);
}

main();
