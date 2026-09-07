import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { emitCelToFhir, prepareCelPublications } from "../../cel/emitter/emitFhir";
import * as celEmission from "../../cel/emitter/emitFhir";
import { resolveCelImports } from "../../cel/imports";
import { validateCEL } from "../../cel/validator";
import { runCel } from "../run";
import * as publicationProgramModule from "../../emit/publicationProgram";
import { produceMembershipCandidate } from "../../emit/publicationProducer";

// REFACTOR:grounded (#320, review 560): the selected Record's value decides; unknown pauses.
const POLICY = `library "Publication".
concept "Answer":
- shape is Record.
- type is Observation.
- value type is boolean.
- code is \`answer\`.
- shape reduction is most recent.
activity "Approve":
- request CPGCommunicationRequest.
- with \`APPROVED\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`DENIED\`.
`;
const DECISION = `decision "D":
first:
- when "Answer" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
const fact = (name: string, value?: string, date?: string) => `fact "${name}":
${value === undefined ? "" : `- value is ${value}.`}
${date === undefined ? "" : `- date is "${date}".`}
- defined by "Publication"."Answer".`;

function evaluate(facts: string, references: string[], decision = DECISION, addition = "", expected = "Deny", extraCases = "", project: { policy?: string; coveredLibrary?: string; siblings?: string[]; installed?: string[]; packageName?: string; capturePublication?: boolean } = {}) {
  const parent = path.resolve(os.tmpdir());
  const directory = mkdtempSync(path.join(parent, "crl-publication-"));
  if (path.dirname(directory) !== parent || !path.basename(directory).startsWith("crl-publication-")) throw new Error("Unexpected temporary directory");
  try {
    writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: project.packageName ?? "publication", version: "0.0.0", private: true, crl: { canonicalBase: "http://example.org/publication" } }));
    writeFileSync(path.join(directory, "policy.crl"), (project.policy ?? POLICY) + addition + "\n" + decision);
    for (const [index, source] of (project.siblings ?? []).entries()) writeFileSync(path.join(directory, `sibling-${index}.crl`), source);
    for (const [index, source] of (project.installed ?? []).entries()) {
      const packageDirectory = path.join(directory, "node_modules", `fixture-${index}`);
      mkdirSync(packageDirectory, { recursive: true });
      writeFileSync(path.join(packageDirectory, "package.json"), JSON.stringify({ name: `fixture-${index}`, version: "0.0.0", crl: { libraries: ["policy.crl"], canonicalBase: `http://example.org/fixture-${index}` } }));
      writeFileSync(path.join(packageDirectory, "policy.crl"), source);
    }
    const celPath = path.join(directory, "cases.cel");
    writeFileSync(celPath, `library "Cases".
covers "${project.coveredLibrary ?? "Publication"}".
fact "Subject":
- name is "Synthetic subject".
- birth date is "1970-01-01".
- defined by "Patient".
${facts}
case "Case":
- subject is "Subject".
${references.map((r) => `- fact is "${r}".`).join("\n")}
- result is "D" is "${expected}".
${extraCases}`);
    const graph = resolveCelImports(celPath);
    expect(graph.celParseErrors).toEqual([]);
    expect(graph.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const execution = runCel(graph);
    return { run: execution.runs[0], runs: execution.runs, emission: emitCelToFhir(graph), validation: validateCEL(graph), preparedPublications: project.capturePublication ? prepareCelPublications(graph) : undefined };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("CRE selected Boolean publication", () => {
  it.each([true, false])("preserves explicit %s", (value) => {
    const { run, emission, validation } = evaluate(fact("Answer", String(value)), ["Answer"], DECISION, "", value ? "Approve" : "Deny");
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual([value ? "Approve" : "Deny"]);
    expect(run.conceptTruth.find((c) => c.name === "Answer")?.satisfied).toBe(value);
    expect(validation.errors).toEqual([]);
    expect(validation.warnings.some((w) => w.kind === "value-ignored-on-presence-concept")).toBe(false);
    expect(emission.emittedCases[0].resources.find((r) => r.resourceType === "Observation")?.body.valueBoolean).toBe(value);
  });

  it.each([false, true])("missing or selected unknown pauses (record=%s)", (present) => {
    const { run } = evaluate(present ? fact("Unknown") : "", present ? ["Unknown"] : []);
    expect(run.status).toBe("fail");
    expect(run.produced).toEqual([]);
    expect(run.trace[0].blockedUnknown).toBe(true);
    expect(run.conceptTruth).toEqual([]);
  });

  it.each([false, true])("newer false wins independent of order (reverse=%s)", (reverse) => {
    const refs = ["Old", "New"];
    const { run } = evaluate(fact("Old", "true", "2026-01-01") + fact("New", "false", "2026-02-01"), reverse ? refs.reverse() : refs);
    expect(run.status).toBe("pass");
    expect(run.trace[0].facts).toEqual(["New"]);
    expect(run.produced[0].recommendation).toBe("Deny");
  });

  it("newer unknown displaces old true", () => {
    const { run, emission, validation } = evaluate(fact("Old", "true", "2026-01-01") + fact("New", undefined, "2026-02-01"), ["Old", "New"]);
    expect(run.produced).toEqual([]);
    expect(run.trace[0].blockedUnknown).toBe(true);
    expect(run.trace[0].facts).toEqual(["New"]);
    expect(validation.errors).toEqual([]);
    expect(validation.warnings.some((w) => w.kind === "publication-unanswered-fact")).toBe(true);
    const unknown = emission.emittedCases[0].resources.find((r) => r.body.effectiveDateTime === "2026-02-01")?.body;
    expect(unknown?.resourceType).toBe("Observation");
    expect(unknown).not.toHaveProperty("valueBoolean");
  });

  it("rejects a present non-Boolean CEL value rather than treating it as unknown", () => {
    const { run, validation, emission } = evaluate(fact("Wrong", "12 'mg'"), ["Wrong"]);
    expect(validation.errors.some((e) => e.kind === "value-reading-assertion-needs-boolean")).toBe(true);
    expect(emission.diagnostics.some((e) => e.kind === "value-reading-assertion-needs-boolean")).toBe(true);
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
  });

  it("keeps a malformed case from poisoning an independent valid case", () => {
    const { runs } = evaluate(fact("True", "true") + fact("Wrong", "12 'mg'"), ["True"], DECISION, "", "Approve",
      `case "Bad":\n- subject is "Subject".\n- fact is "Wrong".\n- result is "D" is "Deny".`);
    expect(runs.map((run) => run.status)).toEqual(["pass", "error"]);
    expect(runs[0].produced[0].recommendation).toBe("Approve");
    expect(runs[1].produced).toEqual([]);
  });

  it("retains two distinct failing publication identities while deduplicating each replay", () => {
    const original = celEmission.emitCelToFhir;
    const spy = vi.spyOn(celEmission, "emitCelToFhir").mockImplementation((...args) => {
      const emitted = original(...args);
      // Exercise the raw adapter with the same carrier violation on two independently
      // named publications; CEL itself correctly refuses to author this malformed value.
      for (const testCase of emitted.emittedCases) for (const resource of testCase.resources)
        if (resource.resourceType === "Observation") resource.body.valueBoolean = "not a Boolean";
      return emitted;
    });
    try {
      const second = POLICY.slice(POLICY.indexOf('concept "Answer"'), POLICY.indexOf('activity "Approve"'))
        .replace('concept "Answer"', 'concept "Second"').replace('`answer`', '`second`');
      const decision = `decision "D":\nall:\n- when "Answer" then recommend activity "Approve".\n- when "Second" then recommend activity "Approve".\n- when "Answer" then recommend activity "Approve".`;
      const { run } = evaluate(fact("A", "true") + fact("B", "true").replace('"Publication"."Answer"', '"Publication"."Second"'), ["A", "B"], decision, second);
      expect(run.status).toBe("error");
      expect(run.produced).toEqual([]);
      expect(run.trace).toHaveLength(3);
      for (const branch of run.trace) expect(branch.publicationErrors?.map((error) => error.code)).toEqual(["publication-invalid-value"]);
      const diagnostics = run.diagnostics.filter((diagnostic) => diagnostic.startsWith("publication-invalid-value:"));
      expect(diagnostics).toHaveLength(2);
      expect(diagnostics.some((diagnostic) => diagnostic.includes('"Publication"."Answer"'))).toBe(true);
      expect(diagnostics.some((diagnostic) => diagnostic.includes('"Publication"."Second"'))).toBe(true);
    } finally { spy.mockRestore(); }
  });

  it.each([
    ["2026-01-01", "2026-01-01", "publication-ambiguous-selection"],
    [undefined, "2026-01-01", "publication-undated-input"],
    ["2026", "2026-02", "publication-incomparable-validity"],
    ["2026-01-01T00:00:00.0001Z", "2026-01-01T00:00:00.0002Z", "publication-incomparable-validity"],
  ])("rejects unordered candidates %s / %s", (first, second, code) => {
    const { run } = evaluate(fact("Old", "true", first) + fact("New", "false", second), ["Old", "New"]);
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain(code);
  });

  it("rejects actual duplicate CEL resource identities", () => {
    const { run } = evaluate(fact("Repeated", "true"), ["Repeated", "Repeated"]);
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("id-collision");
  });

  it("preserves nullable criterion and compound branch negation", () => {
    const decision = `criterion "Eligible":
- when ("Answer" or not "Publication"."Answer").
decision "D":
first:
- when "Eligible" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
    const { run } = evaluate("", [], decision);
    expect(run.produced).toEqual([]);
    expect(run.trace[0].blockedUnknown).toBe(true);
  });

  it.each(['- defined as "Answer".', '- defined as ("Answer" or "Answer").', '- definition is exists "Answer".', '- definition is most recent "Answer".'])
  ("refuses dependent context %s", (definition) => {
    const { run } = evaluate(fact("True", "true"), ["True"], DECISION.replace('when "Answer"', 'when "Dependent"'),
      `concept "Dependent":\n- shape is Scalar.\n- value type is boolean.\n${definition}`);
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-unsupported-context");
  });

  it("rejects a foreign qualifier rather than falling through to false", () => {
    const { run } = evaluate("", [], DECISION.replace('when "Answer"', 'when "Foreign"."Answer"'));
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-unsupported-scope");
  });

  it.each(["local", "installed", "shadowed installed"])("does not activate publication scope for an unused %s policy beside a legacy policy", (origin) => {
    const legacy = POLICY.replace("- shape is Record.", "- shape is Scalar.").replace("- shape reduction is most recent.\n", "");
    const unrelated = (origin === "shadowed installed" ? POLICY : POLICY.replace('library "Publication".', 'library "Unrelated".')) + DECISION;
    const project = { policy: legacy, ...(origin === "local" ? { siblings: [unrelated] } : { installed: [unrelated] }) };
    const baseline = evaluate(fact("False", "false"), ["False"], DECISION, "", "Deny", "", { policy: legacy });
    const { run } = evaluate(fact("False", "false"), ["False"], DECISION, "", "Deny", "", project);
    expect(baseline.run.status).toBe("pass");
    expect(run.status).toBe("pass");
    expect(run.produced).toEqual(baseline.run.produced);
    expect(run.diagnostics.some((d) => d.includes("publication-unsupported-scope"))).toBe(false);
  });

  it.each(["Publication", "Independent"])("runs %s when two unrelated publication policies share a project", (coveredLibrary) => {
    const independent = POLICY.replace('library "Publication".', 'library "Independent".') + DECISION;
    const authoredFact = fact("False", "false").replace('"Publication"."Answer"', `"${coveredLibrary}"."Answer"`);
    const { run } = evaluate(authoredFact, ["False"], DECISION, "", "Deny", "", { coveredLibrary, siblings: [independent] });
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Deny"]);
    expect(run.conceptTruth.find((c) => c.name === "Answer")?.satisfied).toBe(false);
  });

  it.each(["local", "installed"])("keeps an included %s library's unused publication outside a legacy dependency", (origin) => {
    const legacy = POLICY.replace("- shape is Record.", "- shape is Scalar.").replace("- shape reduction is most recent.\n", "")
      .replace('library "Publication".', 'library "Publication".\ninclude "Shared".');
    const sharedLegacy = `concept "Legacy":
- shape is Scalar.
- type is Observation.
- value type is boolean.
- code is \`legacy\`.`;
    const decision = DECISION.replace('when "Answer"', 'when "Shared"."Legacy"');
    const authoredFact = fact("False", "false").replace('"Publication"."Answer"', '"Shared"."Legacy"');
    const source = (publication: boolean) => (publication ? POLICY.replace('library "Publication".', 'library "Shared".') : 'library "Shared".') + "\n" + sharedLegacy;
    const project = (publication: boolean) => ({ policy: legacy, ...(origin === "local" ? { siblings: [source(publication)] } : { installed: [source(publication)] }) });
    const baseline = evaluate(authoredFact, ["False"], decision, "", "Deny", "", project(false));
    const { run } = evaluate(authoredFact, ["False"], decision, "", "Deny", "", project(true));
    expect(baseline.run.status).toBe("pass");
    expect(run.status).toBe("pass");
    expect(run.produced).toEqual(baseline.run.produced);
    expect(run.diagnostics.some((d) => d.includes("publication-unsupported-scope"))).toBe(false);
  });

  it("does not make an include alone consume a publication", () => {
    const legacy = POLICY.replace("- shape is Record.", "- shape is Scalar.").replace("- shape reduction is most recent.\n", "")
      .replace('library "Publication".', 'library "Publication".\ninclude "Shared".');
    const shared = POLICY.replace('library "Publication".', 'library "Shared".');
    const { run } = evaluate(fact("False", "false"), ["False"], DECISION, "", "Deny", "", { policy: legacy, siblings: [shared] });
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Deny"]);
  });

  it.each(["direct", "criterion alias", "delegated criterion", "CEL alias"])("still refuses consumed included publication through %s", (site) => {
    const legacy = POLICY.replace("- shape is Record.", "- shape is Scalar.").replace("- shape reduction is most recent.\n", "")
      .replace('library "Publication".', 'library "Publication".\ninclude "Shared".');
    const shared = POLICY.replace('library "Publication".', 'library "Shared".') + `
concept "Alias":
- defined as "Answer".
criterion "Inner":
- when ("Alias").
criterion "Outer":
- when ("Inner").
decision "Sub":
first:
- when "Outer" then recommend activity "Approve".
- otherwise then recommend activity "Deny".`;
    const decision = site === "delegated criterion"
      ? DECISION.replace('recommend activity "Approve"', 'use decision "Shared"."Sub"')
      : site === "criterion alias"
        ? 'criterion "Via Alias":\n- when ("Shared"."Alias").\n' + DECISION.replace('when "Answer"', 'when "Via Alias"')
        : site === "direct" ? DECISION.replace('when "Answer"', 'when "Shared"."Answer"') : DECISION;
    const authoredFact = site === "CEL alias" ? fact("True", "true").replace('"Publication"."Answer"', '"Shared"."Alias"') : fact("True", "true");
    const { run } = evaluate(authoredFact, ["True"], decision, "", "Approve", "", { policy: legacy, siblings: [shared] });
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-unsupported-scope");
  });

  it("retains the covered publication's unsupported imports boundary", () => {
    const policy = POLICY.replace('library "Publication".', 'library "Publication".\ninclude "Shared".');
    const { run } = evaluate(fact("False", "false"), ["False"], DECISION, "", "Deny", "", {
      policy, siblings: ['library "Shared".\nactivity "Unused":\n- request CPGCommunicationRequest.\n- with `UNUSED`.'],
    });
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-unsupported-scope");
  });

  it.each(["CRL", "CEL"])("refuses a genuinely referenced foreign publication through %s", (site) => {
    const legacy = POLICY.replace("- shape is Record.", "- shape is Scalar.").replace("- shape reduction is most recent.\n", "");
    const foreign = POLICY.replace('library "Publication".', 'library "Foreign".') + DECISION;
    const authoredFact = site === "CEL" ? fact("False", "false").replace('"Publication"."Answer"', '"Foreign"."Answer"') : fact("False", "false");
    const decision = site === "CRL" ? DECISION.replace('when "Answer"', 'when "Foreign"."Answer"') : DECISION;
    const { run } = evaluate(authoredFact, ["False"], decision, "", "Deny", "", { policy: legacy, siblings: [foreign] });
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-unsupported-scope");
  });

  it("follows a referenced legacy library to its foreign publication dependency", () => {
    const legacy = POLICY.replace("- shape is Record.", "- shape is Scalar.").replace("- shape reduction is most recent.\n", "");
    const foreign = POLICY.replace('library "Publication".', 'library "Foreign".') + DECISION;
    const bridge = 'library "Bridge".\nconcept "Derived":\n- defined as "Foreign"."Answer".';
    const decision = DECISION.replace('when "Answer"', 'when "Bridge"."Derived"');
    const { run } = evaluate(fact("False", "false"), ["False"], decision, "", "Deny", "", { policy: legacy, siblings: [bridge, foreign] });
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-unsupported-scope");
  });

  it.each(["unless", "only when"])("scopes unsupported %s action guards", (polarity) => {
    const decision = `decision "D":
first:
- when "Answer" then:
  any:
  - recommend activity "Approve" ${polarity} "Answer".
  - recommend activity "Deny".
  end.
- otherwise then recommend activity "Deny".`;
    const { run } = evaluate(fact("True", "true"), ["True"], decision);
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-unsupported-context");
  });
});

const membershipPolicy = `library "Publication".
concept "Procedure":
- shape is Record.
- type is Observation.
- value type is CodeableConcept.
- code is \`procedure\`.
- value domain is answer options.
- shape reduction is most recent.
- value from:
  - \`yes\` display is \`Yes\`, qualifying.
  - \`no\` display is \`No\`, not qualifying.
concept "Answer":
- shape is Record.
- type is Observation.
- value type is boolean.
- definition is "Procedure" in qualifying.
- shape reduction is most recent.
activity "Approve":
- request CPGCommunicationRequest.
- with \`APPROVED\`.
activity "Deny":
- request CPGCommunicationRequest.
- with \`DENIED\`.
`;
const procedureFact = (name: string, value?: string, date?: string) => fact(name, value?.startsWith("`") ? JSON.stringify(value.slice(1, -1)) : value, date).replace('"Publication"."Answer"', '"Publication"."Procedure"');

describe("CRE selected-datum membership production", () => {
  it("uses the same owning policy/package identity and derived key as emit preparation", () => {
    const spy = vi.spyOn(publicationProgramModule, "prepareSingleLibraryPublication");
    try {
      const policy = membershipPolicy.replace('- definition is "Procedure" in qualifying.', '- code is `answer`.\n- definition is "Procedure" in qualifying.');
      const {run, preparedPublications} = evaluate(procedureFact("Selected", "`yes`"), ["Selected"], DECISION, "", "Approve", "", {policy, packageName:"distinct-owning-package", capturePublication:true});
      expect(run.status, run.diagnostics.join("\n")).toBe("pass");
      const call = spy.mock.calls.findIndex((args) => args[0].library.name === "Publication");
      expect(call).toBeGreaterThanOrEqual(0);
      expect(spy.mock.calls[call][1].policyId).toBe("distinct-owning-package");
      expect(spy.mock.calls[call][3]).toEqual({name:"distinct-owning-package",version:"0.0.0"});
      const result = spy.mock.results[call];
      if (result.type !== "return") throw new Error("CRE preparation failed");
      const cre = result.value.descriptors.find((d: publicationProgramModule.PublicationDescriptor) => d.identity.conceptName === "Answer")!;
      const emitted = preparedPublications!.descriptors.find((d) => d.identity.conceptName === "Answer")!;
      expect({conceptId:cre.conceptId,producerId:cre.producer?.producerId,profileUrl:cre.profileUrl})
        .toEqual({conceptId:emitted.conceptId,producerId:emitted.producer?.producerId,profileUrl:emitted.profileUrl});
      expect(cre.profileUrl).toBeDefined();
      const operand = {key:"local/operand-1",contributorId:"local",arm:"local" as const,retrievedInputIdentity:"Observation/operand-1",resource:{resourceType:"Observation",id:"operand-1",status:"final",valueCodeableConcept:{coding:[emitted.producer!.qualifying[0]]}}};
      const left = produceMembershipCandidate(cre, operand, "Patient/subject");
      const right = produceMembershipCandidate(emitted, operand, "Patient/subject");
      expect(left.kind).toBe("candidate");
      expect(left).toEqual(right);
    } finally { spy.mockRestore(); }
  });
  it("refuses a direct non-Boolean publication guard", () => {
    const {run} = evaluate(procedureFact("Selected", "`yes`"), ["Selected"], DECISION.replace('when "Answer"', 'when "Procedure"'), "", "Deny", "", {policy:membershipPolicy});
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-unsupported-context");
  });
  it.each([["yes", true], ["no", false]] as const)("computes %s from the selected operand", (code, value) => {
    const {run, emission} = evaluate(procedureFact("Selected", `\`${code}\``), ["Selected"], DECISION, "", value ? "Approve" : "Deny", "", {policy:membershipPolicy});
    expect(emission.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(run.status, run.diagnostics.join("\n")).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual([value ? "Approve" : "Deny"]);
    expect(run.trace[0].facts).toEqual(["Selected"]);
  });

  it.each([false, true])("missing/unknown operand pauses without false (present=%s)", (present) => {
    const {run} = evaluate(present ? procedureFact("Unknown") : "", present ? ["Unknown"] : [], DECISION, "", "Deny", "", {policy:membershipPolicy});
    expect(run.status,run.diagnostics.join("\n")).toBe("fail");
    expect(run.produced).toEqual([]);
    expect(run.trace[0].blockedUnknown).toBe(true);
    expect(run.trace[0].facts).toEqual(present ? ["Unknown"] : []);
  });

  it("selects the operand before producing and retains the winning operand's fact", () => {
    const {run} = evaluate(procedureFact("Old", "`yes`", "2026-01-01") + procedureFact("New", "`no`", "2026-09-06T11:00:00Z"), ["New", "Old"], DECISION, "", "Deny", "", {policy:membershipPolicy});
    expect(run.status,run.diagnostics.join("\n")).toBe("pass");
    expect(run.trace[0].facts).toEqual(["New"]);
  });

  it("a newer unknown operand does not resurrect an older qualifying value", () => {
    const {run} = evaluate(procedureFact("Old", "`yes`", "2026-01-01") + procedureFact("Unknown", undefined, "2026-02-01"), ["Old", "Unknown"], DECISION, "", "Deny", "", {policy:membershipPolicy});
    expect(run.status,run.diagnostics.join("\n")).toBe("fail");
    expect(run.produced).toEqual([]);
    expect(run.trace[0].facts).toEqual(["Unknown"]);
    expect(run.trace[0].blockedUnknown).toBe(true);
  });

  it("selects a newer interpretable operand before interpreting an older foreign-domain value", () => {
    const {run} = evaluate(procedureFact("Old", '"http://example.org/foreign|bad"', "2026-01-01") + procedureFact("New", "`no`", "2026-02-01"), ["Old", "New"], DECISION, "", "Deny", "", {policy:membershipPolicy});
    expect(run.status, run.diagnostics.join("\n")).toBe("pass");
    expect(run.trace[0].facts).toEqual(["New"]);
  });

  it("fails a selected uninterpretable value without marking an unknown pause", () => {
    const {run} = evaluate(procedureFact("Bad", '"http://example.org/foreign|bad"'), ["Bad"], DECISION, "", "Deny", "", {policy:membershipPolicy});
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-uninterpretable-value");
    expect(run.trace[0].blockedUnknown).not.toBe(true);
  });

  it("does not hide an older malformed typed value behind a newer valid operand", () => {
    const {run} = evaluate(procedureFact("Malformed", "true", "2026-01-01") + procedureFact("New", "`no`", "2026-02-01"), ["Malformed", "New"], DECISION, "", "Deny", "", {policy:membershipPolicy});
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
  });

  it.each([false, true])("selects a newer own answer separately from the computed candidate (%s)", (ownValue) => {
    const policy=membershipPolicy.replace('- definition is "Procedure" in qualifying.', '- code is `answer`.\n- definition is "Procedure" in qualifying.');
    const {run} = evaluate(procedureFact("Operand", "`yes`", "2026-01-01") + fact("Own", String(ownValue), "2026-02-01"), ["Operand", "Own"], DECISION, "", ownValue ? "Approve" : "Deny", "", {policy});
    expect(run.status, run.diagnostics.join("\n")).toBe("pass");
    expect(run.trace[0].facts).toEqual(["Own"]);
  });

  it("supports the authored local equal-time preference without an inferred timestamp", () => {
    const policy=membershipPolicy.replace('- definition is "Procedure" in qualifying.\n- shape reduction is most recent.', '- code is `answer`.\n- definition is "Procedure" in qualifying.\n- shape reduction is most recent, on equal time prefer local.');
    const {run} = evaluate(procedureFact("Operand", "`yes`", "2026-01-01") + fact("Own", "false", "2026-01-01"), ["Operand", "Own"], DECISION, "", "Deny", "", {policy});
    expect(run.status, run.diagnostics.join("\n")).toBe("pass");
    expect(run.trace[0].facts).toEqual(["Own"]);
  });

  it("refuses an undated operand plus an own answer instead of inventing a recency winner", () => {
    const policy = membershipPolicy.replace('- definition is "Procedure" in qualifying.', '- code is `answer`.\n- definition is "Procedure" in qualifying.');
    const { run } = evaluate(procedureFact("Operand", "`yes`") + fact("Own", "false", "2026-02-01"), ["Operand", "Own"], DECISION, "", "Deny", "", { policy });
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.trace[0].blockedUnknown).not.toBe(true);
    expect(run.trace[0].publicationErrors?.map((error) => error.code)).toEqual(["publication-undated-input"]);
  });

  it("does not demote operand selection failure to a false or unknown producer", () => {
    const {run} = evaluate(procedureFact("First", "`yes`", "2026-01-01") + procedureFact("Second", "`no`", "2026-01-01"), ["First", "Second"], DECISION, "", "Deny", "", {policy:membershipPolicy});
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-ambiguous-selection");
    expect(run.trace[0].blockedUnknown).not.toBe(true);
  });

  it("keeps a true OR sibling from masking an evaluated operand failure", () => {
    const policy = membershipPolicy + '\nconcept "Photo":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `photo`.\n- shape reduction is most recent.\n';
    const photo = fact("Photo", "true").replace('"Publication"."Answer"', '"Publication"."Photo"');
    const {run} = evaluate(photo + procedureFact("A", "`yes`", "2026-01-01") + procedureFact("B", "`no`", "2026-01-01"), ["Photo", "A", "B"], DECISION.replace('when "Answer"', 'when ("Photo" or "Answer")'), "", "Approve", "", {policy});
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.trace[0].satisfied).toBe(false);
    expect(run.trace[0].blockedUnknown).not.toBe(true);
  });

  // CEL authors one Coding here. Supply the same raw multi-Coding input used in the pinned
  // native C3 measurement at the CEL/FHIR boundary, retaining the emitted option system.
  function withConflictingProcedure<T>(body: () => T): T {
    const original = celEmission.emitCelToFhir;
    const spy = vi.spyOn(celEmission, "emitCelToFhir").mockImplementation((...args) => {
      const emitted = original(...args);
      for (const testCase of emitted.emittedCases) for (const resource of testCase.resources) {
        const value = resource.body.valueCodeableConcept as { coding?: { system?: string; code?: string }[] } | undefined;
        const yes = value?.coding?.find((coding) => coding.code === "yes");
        if (yes) value!.coding!.push({ system: yes.system, code: "no" });
      }
      return emitted;
    });
    try { return body(); } finally { spy.mockRestore(); }
  }

  const photoPolicy = membershipPolicy + '\nconcept "Photo":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `photo`.\n- shape reduction is most recent.\n';
  const photoAndVisual = fact("Photo", "true").replace('"Publication"."Answer"', '"Publication"."Photo"') + procedureFact("Visual", "`yes`");

  it.each([false, true])("retains the independent all: activity despite a failed true-first OR condition (independent first=%s)", (independentFirst) => {
    const dependent = '- when ("Photo" or "Answer") then recommend activity "Approve".';
    const independent = '- when "Photo" then recommend activity "Deny".';
    const decision = `decision "D":\nall:\n${(independentFirst ? [independent, dependent] : [dependent, independent]).join("\n")}`;
    const { run } = withConflictingProcedure(() => evaluate(photoAndVisual, ["Photo", "Visual"], decision, "", "Deny", "", { policy: photoPolicy }));
    expect(run.status).toBe("error");
    expect(run.produced.map((item) => item.recommendation)).toEqual(["Deny"]);
    expect(run.trace).toHaveLength(2);
    const failed = run.trace[independentFirst ? 1 : 0];
    expect(failed.satisfied).toBe(false);
    expect(failed.conditionTrace?.satisfied).toBe(false);
    expect(failed.blockedUnknown).not.toBe(true);
    expect(failed.children).toEqual([]);
    expect(failed.publicationErrors?.map((error) => error.code)).toEqual(["publication-ambiguous-coded-value"]);
    expect(run.trace[independentFirst ? 0 : 1].satisfied).toBe(true);
    expect(run.diagnostics.join("\n")).toContain("publication-ambiguous-coded-value");
    expect(run.conceptTruth).toEqual([]);
  });

  it("does not replay a failed nested criterion as true, false, or unknown", () => {
    const decision = `criterion "Inner":
- when ("Photo" or "Answer").
criterion "Outer":
- when ("Inner").
decision "D":
all:
- when "Outer" then recommend activity "Approve".
- when not "Outer" then recommend activity "Approve".
- when "Outer" then recommend activity "Approve".
- when "Photo" then recommend activity "Deny".`;
    const { run } = withConflictingProcedure(() => evaluate(photoAndVisual, ["Photo", "Visual"], decision, "", "Deny", "", { policy: photoPolicy }));
    expect(run.status).toBe("error");
    expect(run.produced.map((item) => item.recommendation)).toEqual(["Deny"]);
    expect(run.trace).toHaveLength(4);
    expect(run.diagnostics.filter((diagnostic) => diagnostic.includes("publication-ambiguous-coded-value"))).toHaveLength(1);
    for (const failed of run.trace.slice(0, 3)) {
      expect(failed.satisfied).toBe(false);
      expect(failed.blockedUnknown).not.toBe(true);
      expect(failed.publicationErrors?.map((error) => error.code)).toEqual(["publication-ambiguous-coded-value"]);
    }
  });

  it("does not cross a failed first: prerequisite to a later true activity or otherwise", () => {
    const decision = `decision "D":
first:
- when ("Photo" or "Answer") then recommend activity "Approve".
- when "Photo" then recommend activity "Deny".
- otherwise then recommend activity "Deny".`;
    const { run } = withConflictingProcedure(() => evaluate(photoAndVisual, ["Photo", "Visual"], decision, "", "Deny", "", { policy: photoPolicy }));
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.trace).toHaveLength(1);
    expect(run.trace[0].publicationErrors?.map((error) => error.code)).toEqual(["publication-ambiguous-coded-value"]);
    expect(run.trace[0].blockedUnknown).not.toBe(true);
  });

  it("isolates off-path publication failures in truth probes and omits their truth rows", () => {
    const decision = `decision "D":
first:
- when "Photo" then recommend activity "Deny".
- when "Answer" then recommend activity "Approve".`;
    const { run } = withConflictingProcedure(() => evaluate(photoAndVisual, ["Photo", "Visual"], decision, "", "Deny", "", { policy: photoPolicy }));
    expect(run.status).toBe("pass");
    expect(run.produced.map((item) => item.recommendation)).toEqual(["Deny"]);
    expect(run.diagnostics).toEqual([]);
    expect(run.conceptTruth).toEqual([{ lib: "Publication", name: "Photo", satisfied: true }]);
  });

  it("keeps legacy delegation faults case-global after an independent action and publication failure", () => {
    const decision = `decision "D":
all:
- when "Photo" then recommend activity "Deny".
- when "Answer" then recommend activity "Approve".
- when "Photo" then use decision "D".`;
    const { run } = withConflictingProcedure(() => evaluate(photoAndVisual, ["Photo", "Visual"], decision, "", "Deny", "", { policy: photoPolicy }));
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-ambiguous-coded-value");
    expect(run.diagnostics.join("\n")).toContain("delegation cycle");
  });
});
