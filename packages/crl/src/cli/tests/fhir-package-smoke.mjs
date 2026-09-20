import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { extract } from "tar";

// Shared by the real core stdio server and the extension's actual bundled stdio server.
export async function checkFhirPackage(client, includeCli = false) {
  const root = mkdtempSync(join(tmpdir(), "crl-package-mcp-"));
  try {
    mkdirSync(join(root, "src/fhir"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "package-test", version: "1.0.0", description: "Synthetic packaging integration test", author: "Test Author",
      crl: { canonicalBase: "https://example.org/fhir", packageId: "org.example.package-test" },
    }));
    const original = { resourceType: "PlanDefinition", id: "package-test", url: "https://example.org/fhir/PlanDefinition/package-test", version: "1.0.0", status: "draft" };
    writeFileSync(join(root, "src/fhir/definition.json"), JSON.stringify(original));
    const result = await client.callTool({ name: "package_fhir", arguments: { projectRoot: root } });
    assert.ok(!result.isError, JSON.stringify(result));
    const receipt = JSON.parse(result.content.find(c => c.type === "text").text);
    assert.equal(receipt.success, true); assert.equal(receipt.resourceCount, 2);
    assert.equal(receipt.sha256, createHash("sha256").update(readFileSync(receipt.outputFile)).digest("hex"));
    const unpacked = join(root, "unpacked"); mkdirSync(unpacked);
    await extract({ file: receipt.outputFile, cwd: unpacked });
    const read = name => JSON.parse(readFileSync(join(unpacked, "package", name), "utf8"));
    assert.deepEqual(read("PlanDefinition-package-test.json"), original);
    assert.equal(read("package.json").name, "org.example.package-test");
    assert.equal(read("ImplementationGuide-package-test.json").packageId, "org.example.package-test");
    assert.equal(read(".index.json").files.length, 2);
    if (includeCli) {
      const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../../../dist/cli/run-package-fhir.js");
      const processResult = spawnSync(process.execPath, [cli, "--project", root, "--out", join(root, "cli.tgz")], { encoding: "utf8" });
      assert.equal(processResult.status, 0, processResult.stdout + processResult.stderr);
      const cliReceipt = JSON.parse(processResult.stdout);
      assert.equal(cliReceipt.sha256, receipt.sha256);
      const invalid = spawnSync(process.execPath, [cli, "--project"], { encoding: "utf8" });
      assert.equal(invalid.status, 1); assert.equal(JSON.parse(invalid.stdout).success, false);
    }
    const rejected = await client.callTool({ name: "package_fhir", arguments: { projectRoot: root, outputFile: join(root, "src/bad.tgz") } });
    assert.equal(rejected.isError, true);
    assert.equal(JSON.parse(rejected.content.find(c => c.type === "text").text).success, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
