#!/usr/bin/env node
// REFACTOR:grounded: native regression is explicit and never publishes retained MV output.
import { runRegression } from "../cel/regression";
import { installNativeSignals } from "./nativeSignals";
import { resolveCelSuite } from "../cel/suite";
import { produceRegressionResults } from "../results/produce";

const options: Record<string, string | boolean> = {};
const lifecycle = installNativeSignals();
async function main(): Promise<void> {
try {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--help") {
      console.log("crl-run-regression --project <policy> [--native [--jar <engine.jar>] [--case-timeout-ms <ms>] [--retry-from <manifest>]]\nRuns each MV and regression CEL file once. Default: CRE checks only, no FHIR emission. --native enables the JVM and writes results to a new temporary directory. --retry-from retains compatible successes in that earlier regression run.");
      process.exit(0);
    }
    if (flag === "--native") options.native = true;
    else if (["--project", "--jar", "--case-timeout-ms", "--retry-from"].includes(flag)) {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Missing value for ${flag}`);
      options[flag.slice(2)] = args[++i];
    } else throw new Error(`Unknown option ${flag}`);
  }
  if (typeof options.project !== "string") throw new Error("--project is required");
  if (!options.native && (options.jar || options["case-timeout-ms"] || options["retry-from"])) throw new Error("--jar, --case-timeout-ms and --retry-from require --native");
  const checks = runRegression(options.project);
  let native;
  if (options.native && checks.success) {
    const selected = resolveCelSuite(options.project, "regression");
    if (!selected.ok) throw new Error(selected.diagnostics.map(d => d.message).join("\n"));
    native = await produceRegressionResults({ projectPath: options.project, retryFrom: options["retry-from"] as string | undefined,
      crlPath: selected.suite.policyPath ?? options.project, useCase: "prior-auth", jarPath: options.jar as string | undefined,
      caseTimeoutMs: options["case-timeout-ms"] === undefined ? undefined : Number(options["case-timeout-ms"]),
      crlVersion: (require("../../package.json") as { version: string }).version });
  }
  if (lifecycle.interrupted) return;
  console.log(JSON.stringify({ checks, ...(native ? { native } : {}) }, null, 2));
  process.exitCode = checks.success && (!options.native || (native?.ok && native.failed === 0)) ? 0 : 2;
} catch (error) { console.error(String(error)); process.exitCode = 1; }

}
void main();
