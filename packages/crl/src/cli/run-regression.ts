#!/usr/bin/env node
// REFACTOR:grounded: native regression is explicit and never publishes retained MV output.
import { runRegression } from "../cel/regression";
import { resolveCelSuite } from "../cel/suite";
import { produceRegressionResults } from "../results/produce";

const options: Record<string, string | boolean> = {};
try {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--help") {
      console.log("crl-run-regression --project <policy> [--native [--jar <engine.jar>]]\nRuns each MV and regression CEL file once. Default: CRE checks only, no FHIR emission. --native enables the JVM and writes results to a new temporary directory.");
      process.exit(0);
    }
    if (flag === "--native") options.native = true;
    else if (["--project", "--jar"].includes(flag)) {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Missing value for ${flag}`);
      options[flag.slice(2)] = args[++i];
    } else throw new Error(`Unknown option ${flag}`);
  }
  if (typeof options.project !== "string") throw new Error("--project is required");
  if (!options.native && options.jar) throw new Error("--jar requires --native");
  const checks = runRegression(options.project);
  let native;
  if (options.native && checks.success) {
    const selected = resolveCelSuite(options.project, "regression");
    if (!selected.ok) throw new Error(selected.diagnostics.map(d => d.message).join("\n"));
    native = produceRegressionResults({ projectPath: options.project,
      crlPath: selected.suite.policyPath ?? options.project, useCase: "prior-auth", jarPath: options.jar as string | undefined,
      crlVersion: (require("../../package.json") as { version: string }).version });
  }
  console.log(JSON.stringify({ checks, ...(native ? { native } : {}) }, null, 2));
  process.exitCode = checks.success && (!options.native || (native?.ok && native.failed === 0)) ? 0 : 2;
} catch (error) { console.error(String(error)); process.exitCode = 1; }
