import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validateCRLImports } from "../validate";

const POLICY = (approveActivity: string, denyRef: string, denyActivity: string) =>
  `library "Policy".
concept "Q":
- type is Condition.
- code is \`q\`.
decision "Cov":
first:
- when "Q" then recommend activity "certify.Approve".
- otherwise then recommend activity "${denyRef}".
${approveActivity}
${denyActivity}
`;

const ACT = (name: string, req = "CPGCommunicationRequest") =>
  `activity "${name}":\n- request ${req}.\n- with \`text\`.`;

function project(pkgCrl: Record<string, unknown>, crl: string): string {
  const dir = mkdtempSync(join(tmpdir(), "disp-integ-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "policy",
      version: "1.0.0",
      private: true,
      crl: { canonicalBase: "http://example.org/policy", status: "draft", experimental: true, ...pkgCrl },
    }),
  );
  writeFileSync(join(dir, "policy.crl"), crl);
  return join(dir, "policy.crl");
}

const OPTIONS = { certify: { Approve: { label: "Approve" } }, "not-certify": { Deny: { label: "Deny" } } };

describe("validateCRLImports — disposition config (end-to-end, multi-file path)", () => {
  it("configured project: valid determinations validate clean (no disposition errors)", () => {
    const root = project(
      { dispositions: { options: OPTIONS } },
      POLICY(ACT("certify.Approve"), "not-certify.Deny", ACT("not-certify.Deny")),
    );
    const r = validateCRLImports(root);
    expect(r.validationErrors.filter((e) => e.kind.startsWith("disposition-"))).toEqual([]);
  });

  it("configured project: a non-configured recommend → disposition-not-configured with source attribution", () => {
    const root = project(
      { dispositions: { options: OPTIONS } },
      POLICY(ACT("certify.Approve"), "Deny", ACT("Deny")),
    );
    const r = validateCRLImports(root);
    const err = r.validationErrors.find((e) => e.kind === "disposition-not-configured");
    expect(err).toBeDefined();
    expect((err as any).activityName).toBe("Deny");
    expect(err!.filePath).toContain("policy.crl"); // multi-file attribution flows through
    expect(r.success).toBe(false);
  });

  it("configured project: a determination declared CPGServiceRequest → disposition-request-type", () => {
    const root = project(
      { dispositions: { options: OPTIONS } },
      POLICY(ACT("certify.Approve"), "not-certify.Deny", ACT("not-certify.Deny", "CPGServiceRequest")),
    );
    const r = validateCRLImports(root);
    expect(r.validationErrors.some((e) => e.kind === "disposition-request-type")).toBe(true);
  });

  it("MALFORMED config surfaces as a blocking disposition-config diagnostic, and the closed set is NOT flooded", () => {
    const root = project(
      { dispositions: { options: { "bad-cat": { x: { label: "X" } } } } }, // unknown-category
      POLICY(ACT("certify.Approve"), "not-certify.Deny", ACT("not-certify.Deny")),
    );
    const r = validateCRLImports(root);
    const diag = r.importDiagnostics.find((d) => d.kind === "disposition-config");
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe("error");
    expect(r.success).toBe(false); // config error blocks
    // enforcement was skipped (broken config) — no closed-set flood on top of the config error.
    expect(r.validationErrors.some((e) => e.kind === "disposition-not-configured")).toBe(false);
  });

  it("NO dispositions config → nothing enforced (today's behavior): arbitrary recommends validate clean", () => {
    const root = project({}, POLICY(ACT("Approve"), "Deny", ACT("Deny")));
    const r = validateCRLImports(root);
    expect(r.validationErrors.filter((e) => e.kind.startsWith("disposition-"))).toEqual([]);
    expect(r.importDiagnostics.some((d) => d.kind === "disposition-config")).toBe(false);
  });
});
