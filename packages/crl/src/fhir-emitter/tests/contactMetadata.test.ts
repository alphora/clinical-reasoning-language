// REFACTOR:grounded — FHIR metadata contact is ContactDetail[], not ContactPoint[].
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitCrlTwoLane } from "../../emit-two-lane";
import { normalizePackageMetadata } from "../metadata";
import { emitReferenceStubCodeSystem } from "../codeSystem";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));
const source = `library "Contact".
terminology "Answers": - system is \`https://example.org/contact/CodeSystem/answers\`. - code is \`yes\` display is \`Yes\`. - code is \`no\` display is \`No\`.
concept "Answer":
- shape is Record. - type is Observation. - value type is CodeableConcept. - code is \`answer\`.
- value domain is answer options.
- value from is "Answers":
  - not qualifying is \`no\`.
- shape reduction is most recent.
presentation for "Answer": - question text is "Answer?".
activity "Met": - request CPGTaskRequest. - with \`Met\`.
decision "Contact": - when "Answer" then recommend activity "Met".
`;

describe("FHIR author contact metadata", () => {
  it.each([
    ["Example (https://example.org)", "Example", [{ system: "url", value: "https://example.org" }]],
    ["Example <ops@example.org> (https://example.org)", "Example", [{ system: "email", value: "ops@example.org" }, { system: "url", value: "https://example.org" }]],
    [{ name: "Example", email: "ops@example.org", url: "https://example.org" }, "Example", [{ system: "email", value: "ops@example.org" }, { system: "url", value: "https://example.org" }]],
    ["<ops@example.org>", "unknown", [{ system: "email", value: "ops@example.org" }]],
    ["Pipeline Integration Tests (synthetic)", "Pipeline Integration Tests", [{ system: "url", value: "synthetic" }]],
    [undefined, "unknown", []],
  ])("emits R4 ContactDetail without changing normalized author input: %j", (author, publisher, points) => {
    const directory = mkdtempSync(join(tmpdir(), "crl-contact-")); directories.push(directory);
    const pkg = { name: "contact-policy", version: "1.0.0", author, crl: { canonicalBase: "https://example.org/contact", date: "2026-11-22" } };
    const metadata = normalizePackageMetadata(pkg);
    expect(metadata.metadata?.contact).toEqual(points);
    const packagePath = join(directory, "package.json"), entry = join(directory, "policy.crl");
    writeFileSync(packagePath, JSON.stringify(pkg)); writeFileSync(entry, source);
    const before = readFileSync(packagePath);
    const result = emitCrlTwoLane(entry, { date: "2026-11-22" });
    expect(result.success, JSON.stringify(result.hardErrors)).toBe(true);
    expect([...new Set(result.fhir.resources.map(resource => resource.resourceType))].sort()).toEqual(["ActivityDefinition", "CodeSystem", "Library", "PlanDefinition", "StructureDefinition", "ValueSet"]);
    expect(result.fhir.resources.find(resource => resource.sourceKind === "AnswerOptions")?.resource.url).toBe("https://example.org/contact/CodeSystem/answers");
    const stub = emitReferenceStubCodeSystem(["stub"], metadata.metadata!, {});
    expect(stub.resource?.sourceKind).toBe("ReferenceStubCodeSystem");
    for (const { resource } of [...result.fhir.resources, stub.resource!]) {
      expect(resource.publisher).toBe(publisher);
      if (points.length) expect(resource.contact).toEqual([{ telecom: points }]);
      else expect(resource).not.toHaveProperty("contact");
    }
    expect(readFileSync(packagePath)).toEqual(before);
    expect(metadata.metadata?.contact).toEqual(points);
  });
});
