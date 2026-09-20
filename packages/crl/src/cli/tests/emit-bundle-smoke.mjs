import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";

// @kit fhir-packaging:definition-bundle-mcp
// Same protocol checks run against the actual core and extension stdio servers.
export async function checkEmitBundle(client) {
  const root = mkdtempSync(join(tmpdir(), "crl-bundle-mcp-"));
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "bundle-test", version: "1.0.0",
      crl: { canonicalBase: "http://example.org/bundle", date: "2026-09-20" } }));
    const file = join(root, "policy.crl");
    const source = 'library "Policy".\nconcept "Answer": - type is Observation. - shape is Record. - value type is boolean. - code is `answer`. - shape reduction is most recent.\nactivity "Done": - request CPGCommunicationRequest. - with `Done`.\ndecision "Policy": first: - when "Answer" then recommend activity "Done".';
    writeFileSync(file, source);
    const call = path => client.callTool({ name: "emit_crl_bundle", arguments: { path } });
    const response = await call(file);
    assert(!response.isError, JSON.stringify(response));
    const result = JSON.parse(response.content.find(c => c.type === "text").text);
    assert.equal(result.success, true); assert.equal(result.bundle.type, "collection");
    assert(result.bundle.entry.some(e => e.resource.resourceType === "PlanDefinition"));
    assert(!result.bundle.entry.some(e => ["Patient", "Questionnaire", "QuestionnaireResponse"].includes(e.resource.resourceType)));
    const libraries = result.bundle.entry.map(e => e.resource).filter(r => r.resourceType === "Library");
    assert(libraries.length > 0);
    for (const library of libraries) for (const content of library.content ?? []) {
      if (content.contentType !== "text/cql") continue;
      assert.equal(content.url, undefined);
      assert.match(Buffer.from(content.data, "base64").toString("utf8"), /library /);
    }
    assert.deepEqual(readdirSync(root).sort(), ["package.json", "policy.crl"]);
    assert.equal(readFileSync(file, "utf8"), source);
    for (const invalid of ["relative.crl", root, join(root, "missing.crl")]) assert.equal((await call(invalid)).isError, true);
    if (process.platform !== "win32") {
      // /dev/null is a bounded non-regular input even on WSL mounts that cannot
      // create FIFOs. A regressed reader gets EOF, never an unbounded stream.
      const refused = await call("/dev/null");
      assert.equal(refused.isError, true);
      assert.match(refused.content[0].text, /regular file/);
    }
    const big = join(root, "big.crl"); writeFileSync(big, "x".repeat(1_000_001));
    assert.equal((await call(big)).isError, true);
    writeFileSync(file, 'library "Invalid". not a valid declaration');
    const refused = await call(file);
    assert(!refused.isError, JSON.stringify(refused));
    const payload = JSON.parse(refused.content.find(c => c.type === "text").text);
    assert.equal(payload.success, false); assert.equal(payload.bundle, undefined);
    assert(payload.diagnostics.some(d => d.severity === "error"));
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  }
}
