#!/usr/bin/env node
import { resolve } from "node:path";
import { packageFhir, type PackageFhirOptions } from "../fhir-package";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log("crl-package-fhir --project <directory> [--out <file.tgz>] [--package-id <dotted-id>]\nPackages existing src/fhir definitions using CRMI FHIR NPM conventions.");
    return;
  }
  const options: Partial<PackageFhirOptions> = {};
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (!["--project", "--out", "--package-id"].includes(flag) || !value || value.startsWith("--") || seen.has(flag)) throw new Error(`Invalid or repeated argument: ${flag}. Use --help.`);
    seen.add(flag);
    if (flag === "--project") options.projectRoot = resolve(value);
    if (flag === "--out") options.outputFile = resolve(value);
    if (flag === "--package-id") options.packageId = value;
  }
  if (!options.projectRoot) throw new Error("--project is required. Use --help.");
  const result = await packageFhir(options as PackageFhirOptions);
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exitCode = 1;
}
void main().catch(error => {
  console.log(JSON.stringify({ success: false, errors: [(error as Error).message] }));
  process.exitCode = 1;
});
