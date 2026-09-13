// REFACTOR:grounded: regression success requires every case assertion to pass.
import { afterEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { runRegression } from "../regression";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
// @kit mv-case-authoring:regression-assertions
it.each(["pass", "fail", "error"])("reports a case's %s status through the API and actual CLI", status => {
  const root = mkdtempSync(join(tmpdir(), "crl-regression-check-")); roots.push(root);
  const put = (p: string, text: string) => { const file = join(root, p); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };
  put("package.json", JSON.stringify({ name: "regression-test", version: "1.0.0", crl: { canonicalBase: "http://example.org/regression-test" } }));
  put("src/crl/policy.crl", `library "Policy".
concept "A":
- type is Condition.
- code is \`a\`.
activity "Approve":
- request CPGCommunicationRequest.
- with \`approve\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`deny\`.
decision "D":
first:
- when "A" then recommend activity "Approve".
- otherwise then recommend activity "Deny".
`);
  put("src/cel/mv/example.cel", `library "Clinical".
covers "Policy".
fact "Pat":
- name is "Patient".
- defined by "Patient".
fact "A":
- defined by "Policy"."A".
case "Example":
- id is "example".
- subject is "Pat".
- fact is "A".
${status === "error" ? "" : `- result is "D" is "${status === "pass" ? "Approve" : "Deny"}".`}
`);
  const result = runRegression(root);
  expect(result.success).toBe(status === "pass");
  expect("files" in result && result.files[0].run?.runs[0].status).toBe(status);
  const cli = spawnSync(process.execPath, [resolve(__dirname, "../../../dist/cli/run-regression.js"), "--project", root], { encoding: "utf8" });
  expect(cli.status, cli.stderr).toBe(status === "pass" ? 0 : 2);
  expect(JSON.parse(cli.stdout).checks.success).toBe(status === "pass");
});
