import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { emitCelToFhir, prepareCelPublications } from "../../cel/emitter/emitFhir";
import * as celEmission from "../../cel/emitter/emitFhir";
import { resolveCelImports } from "../../cel/imports";
import { validateCEL } from "../../cel/validator";
import { runCel } from "../run";
import { renderScenario } from "../viewModel";
import * as publicationProgramModule from "../../emit/publicationProgram";
import { produceMembershipCandidate } from "../../emit/publicationProducer";
import { SELECTION_POLICY as POLICY, SELECTION_DECISION as DECISION, SELECTION_NEWER_FALSE, selectionFact as fact, selectionCases } from "../../authoring-kit/selectionExample";

// REFACTOR:grounded (#320, review 560): the selected Record's value decides; unknown pauses.

function evaluate(facts: string, references: string[], decision = DECISION, addition = "", expected = "Deny", extraCases = "", project: { policy?: string; coveredLibrary?: string; siblings?: string[]; installed?: string[]; packageName?: string; capturePublication?: boolean; captureView?: boolean } = {}) {
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
    writeFileSync(celPath, selectionCases(facts, references, expected, extraCases, project.coveredLibrary));
    const graph = resolveCelImports(celPath);
    expect(graph.celParseErrors).toEqual([]);
    expect(graph.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const execution = runCel(graph);
    return { run: execution.runs[0], runs: execution.runs, emission: emitCelToFhir(graph), validation: validateCEL(graph), preparedPublications: project.capturePublication ? prepareCelPublications(graph) : undefined,
      view: project.captureView ? renderScenario(graph).scenarios[0] : undefined };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("CRE selected Boolean publication", () => {
  // @kit guard-or-vs-sibling-or:unknown-order
  it("distinguishes a determinate disjunction from an earlier unknown ordered branch", () => {
    const other = POLICY.slice(POLICY.indexOf('concept "Answer"'), POLICY.indexOf('activity "Approve"'))
      .replace('"Answer"', '"Other"').replace('`answer`', '`other`');
    const known = fact("Known", "true").replace('"Publication"."Answer"', '"Publication"."Other"');
    const combined = DECISION.replace('when "Answer"', 'when ("Answer" or "Other")');
    const ordered = DECISION.replace('- otherwise', '- when "Other" then recommend activity "Approve".\n- otherwise');
    const whole = evaluate(known, ["Known"], combined, other, "Approve");
    expect(whole.validation.errors).toEqual([]);
    expect(whole.run.status).toBe("pass");
    expect(whole.run.produced.map((p) => p.recommendation)).toEqual(["Approve"]);
    const siblings = evaluate(known, ["Known"], ordered, other, "Approve");
    expect(siblings.validation.errors).toEqual([]);
    expect(siblings.run.status).toBe("fail"); // Approve oracle is intentionally not reached.
    expect(siblings.run.produced).toEqual([]);
    expect(siblings.run.trace[0].blockedUnknown).toBe(true);
  });

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

  // @kit publication-selection:newest-value
  it.each([false, true])("newer false wins independent of order (reverse=%s)", (reverse) => {
    const refs = [...SELECTION_NEWER_FALSE.references];
    const { run } = evaluate(SELECTION_NEWER_FALSE.facts, reverse ? refs.reverse() : refs);
    expect(run.status).toBe("pass");
    expect(run.trace[0].facts).toEqual(["New"]);
    expect(run.produced[0].recommendation).toBe("Deny");
  });

  // @kit publication-selection:newest-unknown
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

  // @kit branch-guards:nullable-negation
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

  it.each(["direct", "criterion alias", "delegated criterion", "CEL alias"])("admits direct imported publication but retains unsupported %s contexts", (site) => {
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
    if (site === "direct") {
      expect(run.status).toBe("pass"); expect(run.produced.map(p=>p.recommendation)).toEqual(["Approve"]);
      expect(run.diagnostics).toEqual([]); return;
    }
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-unsupported-scope");
  });

  it("allows a valid include beside a covered publication", () => {
    const policy = POLICY.replace('library "Publication".', 'library "Publication".\ninclude "Shared".');
    const { run } = evaluate(fact("False", "false"), ["False"], DECISION, "", "Deny", "", {
      policy, siblings: ['library "Shared".\nactivity "Unused":\n- request CPGCommunicationRequest.\n- with `UNUSED`.'],
    });
    expect(run.status).toBe("pass");
    expect(run.produced.map(p=>p.recommendation)).toEqual(["Deny"]);
    expect(run.diagnostics).toEqual([]);
  });

  // REFACTOR:grounded (#320, review 570): leaf ownership does not change selected
  // value truth or unknown pause. Resolve the typed activity slot, not expressions.
  const sharedActivities = 'library "Shared".\n' + POLICY.slice(POLICY.indexOf('activity "Approve"'));
  const sharedDecision = DECISION.replaceAll('activity "', 'activity "Shared"."');

  it.each([true, false, undefined])("resolves sibling leaves with selected value %s", (value) => {
    const { run } = evaluate(value === undefined ? "" : fact("A", String(value)), value === undefined ? [] : ["A"],
      sharedDecision, "", value ? "Approve" : "Deny", "", { policy: POLICY.slice(0, POLICY.indexOf('activity "Approve"')), siblings: [sharedActivities] });
    expect(run.status).toBe(value === undefined ? "fail" : "pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(value === undefined ? [] : [value ? "Approve" : "Deny"]);
    expect(run.trace[0].blockedUnknown === true).toBe(value === undefined);
    expect(run.trace[0].nodeId).toBe("when[0]");
    expect(run.diagnostics.some((d) => d.startsWith("publication-"))).toBe(false);
  });

  it.each(["missing library", "missing activity", "wrong kind", "package only", "local shadows package"])("refuses unresolved sibling activity: %s", (mode) => {
    const empty = 'library "Shared".';
    const wrong = empty + '\nconcept "Approve":\n- type is Observation.\n' + POLICY.slice(POLICY.indexOf('activity "Deny"'));
    const siblings = mode === "missing library" || mode === "package only" ? [] : [mode === "wrong kind" ? wrong : empty];
    const installed = mode === "package only" || mode === "local shadows package" ? [sharedActivities] : [];
    const { run } = evaluate(fact("A", "true"), ["A"], sharedDecision, "", "Approve", "", {
      policy: POLICY.slice(0, POLICY.indexOf('activity "Approve"')), siblings, installed,
    });
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain(mode === "package only" ? "publication-unsupported-activity" : "publication-unresolved-activity");
    if (mode === "wrong kind") expect(run.diagnostics.join("\n")).toContain('"Shared"."Approve"');
    if (mode === "missing library") expect(run.diagnostics.join("\n")).toContain("target library is not available");
    if (mode === "missing activity") expect(run.diagnostics.join("\n")).toContain("target library does not declare this activity");
  });

  it("uses the visible local activity without falling back to its installed namesake", () => {
    const { run } = evaluate(fact("A", "true"), ["A"], sharedDecision, "", "Approve", "", {
      policy: POLICY.slice(0, POLICY.indexOf('activity "Approve"')), siblings: [sharedActivities], installed: ['library "Shared".'],
    });
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Approve"]);
  });

  it.each(["sibling", "covered"])("refuses distinct %s activity targets with the same result label", (owner) => {
    const other = owner === "sibling" ? '"Other"."Approve"' : '"Approve"';
    const decision = sharedDecision.replace('"Shared"."Deny"', other);
    const { run } = evaluate(fact("A", "true"), ["A"], decision, "", "Approve", "", {
      policy: owner === "covered" ? POLICY : POLICY.slice(0, POLICY.indexOf('activity "Approve"')),
      siblings: [sharedActivities, sharedActivities.replace('library "Shared".', 'library "Other".')],
    });
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-ambiguous-activity");
  });

  it("allows repeated references to the same activity declaration", () => {
    const { run } = evaluate(fact("A", "false"), ["A"], sharedDecision.replace('"Shared"."Deny"', '"Shared"."Approve"'),
      "", "Approve", "", { policy: POLICY.slice(0, POLICY.indexOf('activity "Approve"')), siblings: [sharedActivities] });
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Approve"]);
  });

  // @kit chaining-necessity:foreign-scope-refusal
  it.each(["guard", "delegation"])("does not exempt a foreign %s alongside a valid sibling leaf", (site) => {
    const shared = sharedActivities + '\nconcept "Foreign":\n- type is Observation.\ndecision "Sub":\nfirst:\n- when "Foreign" then recommend activity "Approve".';
    const decision = site === "guard" ? sharedDecision.replace('when "Answer"', 'when "Shared"."Foreign"')
      : sharedDecision.replace('recommend activity "Shared"."Approve"', 'use decision "Shared"."Sub"');
    const { run } = evaluate(fact("A", "true"), ["A"], decision, "", "Approve", "", { policy: POLICY.slice(0, POLICY.indexOf('activity "Approve"')), siblings: [shared] });
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-unsupported-scope");
  });

  it.each([false, true])("admits a sibling publication already in the emitted closure (consumed=%s)", (consumed) => {
    const shared = POLICY.replace('library "Publication".', 'library "Shared".');
    const foreignFact = consumed ? fact("Foreign", "true").replace('"Publication"."Answer"', '"Shared"."Answer"') : "";
    const { run } = evaluate(fact("A", "true") + foreignFact, consumed ? ["A", "Foreign"] : ["A"],
      sharedDecision, "", "Approve", "", { policy: POLICY.slice(0, POLICY.indexOf('activity "Approve"')), siblings: [shared] });
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Approve"]);
    expect(run.diagnostics).toEqual([]);
    if (consumed) expect(run.conceptTruth.find(c=>c.lib==="Shared"&&c.name==="Answer")?.satisfied).toBe(true);
  });

  it("characterizes the unchecked legacy activity path without treating it as publication correctness", () => {
    // REFACTOR:suspect (#320): the legacy evaluator reports unresolved leaf names;
    // resolving them consistently is a separate legacy-lane correction.
    const policy = POLICY.replace("- shape is Record.", "- shape is Scalar.").replace("- shape reduction is most recent.\n", "");
    const { run } = evaluate(fact("A", "true"), ["A"], sharedDecision, "", "Approve", "", { policy });
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Approve"]);
  });

  it("rejects an unused covered activity that collides with a sibling emission", () => {
    const { run } = evaluate(fact("A", "true"), ["A"], sharedDecision, "", "Approve", "", { siblings: [sharedActivities] });
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-ambiguous-activity");
  });

  it.each(['"Missing"', '"Publication"."Missing"'])("refuses dangling bare/self-qualified leaf %s alongside a shared leaf", (ref) => {
    const decision = sharedDecision.replace('"Shared"."Approve"', ref);
    const { run } = evaluate(fact("A", "true"), ["A"], decision, "", "Missing", "", {
      policy: POLICY.slice(0, POLICY.indexOf('activity "Approve"')), siblings: [sharedActivities],
    });
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain('publication-unresolved-activity: activity "Publication"."Missing"');
  });

  it("retains every distinct unresolved activity diagnostic", () => {
    const decision = DECISION.replace('"Approve"', '"Missing A"').replace('"Deny"', '"Missing B"');
    const { run } = evaluate(fact("A", "true"), ["A"], decision);
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain('"Publication"."Missing A"');
    expect(run.diagnostics.join("\n")).toContain('"Publication"."Missing B"');
  });

  it.each([
    [false, true, true, "when[1]/action[0]"],
    [true, true, true, "when[0]/when[0]/action[0]"],
    [true, false, true, "when[0]/otherwise/action[0]"],
    [true, undefined, true, "when[0]/when[0]"],
  ] as const)("pins a shared disposition's route (gate=%s inner=%s)", (gate, inner, answer, nodeId) => {
    const concept = POLICY.slice(POLICY.indexOf('concept "Answer"'), POLICY.indexOf('activity "Approve"'));
    const policy = 'library "Publication".\n' + concept + concept.replaceAll('"Answer"', '"Gate"').replace('`answer`', '`gate`')
      + concept.replaceAll('"Answer"', '"Inner"').replace('`answer`', '`inner`');
    const decision = `decision "D":
first:
- when "Gate" then:
  first:
  - when "Inner" then recommend activity "Shared"."Approve".
  - otherwise then recommend activity "Shared"."Approve".
  end.
- when "Answer" then recommend activity "Shared"."Approve".
- otherwise then recommend activity "Shared"."Deny".`;
    const facts = fact("A", String(answer)) + fact("G", String(gate)).replace('"Publication"."Answer"', '"Publication"."Gate"')
      + (inner === undefined ? "" : fact("I", String(inner)).replace('"Publication"."Answer"', '"Publication"."Inner"'));
    const { run } = evaluate(facts, inner === undefined ? ["A", "G"] : ["A", "G", "I"], decision, "", "Approve", "", { policy, siblings: [sharedActivities] });
    const flatten = (nodes: typeof run.trace): typeof run.trace => nodes.flatMap((n) => [n, ...flatten(n.children ?? [])]);
    const trace = flatten(run.trace);
    expect(run.status).toBe(inner === undefined ? "fail" : "pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(inner === undefined ? [] : ["Approve"]);
    expect(trace.filter((n) => n.blockedUnknown || n.kind === "action" && n.evaluated).map((n) => n.nodeId)).toEqual([nodeId]);
  });

  it("supports a local delegated decision whose leaf is a sibling activity", () => {
    const policy = POLICY.slice(0, POLICY.indexOf('activity "Approve"'));
    const sub = sharedDecision.replace('decision "D"', 'decision "Sub"');
    const decision = sharedDecision.replace('recommend activity "Shared"."Approve"', 'use decision "Sub"');
    const { run } = evaluate(fact("A", "true"), ["A"], decision, sub, "Approve", "", { policy, siblings: [sharedActivities] });
    expect(run.status).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(["Approve"]);
    expect(run.trace[0].children?.[0].children?.[0].nodeId).toBe("when[0]/action[0]/when[0]");
  });

  it.each([true, false, undefined])("evaluates answered sibling menu guards and refuses unknown menu behavior (guard=%s)", (guard) => {
    const policy = POLICY.slice(0, POLICY.indexOf('activity "Approve"')) + '\nconcept "Legacy":\n- type is Observation.\n- value type is boolean.\n- code is `legacy`.';
    const decision = `decision "D":
first:
- when "Answer" then:
  any:
  - recommend activity "Shared"."Approve" only when "Legacy".
  - recommend activity "Shared"."Deny" unless "Legacy".
  end.`;
    const facts = fact("A", "true") + (guard === undefined ? "" : fact("L", String(guard)).replace('"Publication"."Answer"', '"Publication"."Legacy"'));
    const { run } = evaluate(facts, guard === undefined ? ["A"] : ["A", "L"], decision, "", guard ? "Approve" : "Deny", "", { policy, siblings: [sharedActivities] });
    expect(run.status).toBe(guard === undefined ? "error" : "pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(guard === undefined ? [] : [guard ? "Approve" : "Deny"]);
    expect(run.trace[0].children?.map((n) => n.guardedOut === true)).toEqual(guard === undefined ? [false] : [!guard, guard]);
    if (guard === undefined) {
      expect(run.trace[0].children?.[0]).not.toHaveProperty("guardedOut");
      expect(run.trace[0].children?.[0].evaluated).toBe(true);
      expect(run.trace[0].children?.[0].invalidated).toBe(true);
    }
    if (guard === undefined) expect(run.diagnostics.join("\n")).toContain("publication-unsupported-context: an unanswered action guard");
  });

  it("distinguishes a typo in a package library from an existing unsupported package activity", () => {
    const { run } = evaluate(fact("A", "true"), ["A"], sharedDecision.replaceAll('"Shared"."Approve"', '"Shared"."Typo"')
      .replaceAll('"Shared"."Deny"', '"Shared"."Typo"'), "", "Typo", "", {
      policy: POLICY.slice(0, POLICY.indexOf('activity "Approve"')), installed: [sharedActivities],
    });
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain('publication-unresolved-activity: activity "Shared"."Typo"');
    expect(run.diagnostics.join("\n")).not.toContain("publication-unsupported-activity");
  });

  it("does not produce an unless activity when its legacy answer is absent", () => {
    const policy = POLICY.slice(0, POLICY.indexOf('activity "Approve"')) + '\nconcept "Legacy":\n- type is Observation.\n- value type is boolean.\n- code is `legacy`.';
    const decision = 'decision "D":\nfirst:\n- when "Answer" then:\n  any:\n  - recommend activity "Shared"."Deny" unless "Legacy".\n  end.';
    const { run } = evaluate(fact("A", "true"), ["A"], decision, "", "Deny", "", { policy, siblings: [sharedActivities] });
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-unsupported-context: an unanswered action guard");
  });

  // @kit guards:publication-boundary
  it.each([false, true])("makes the same-library publication activation boundary explicit (publication=%s)", (publication) => {
    // REFACTOR:suspect: without publications the legacy lane coerces missing to false.
    // The publication lane refuses that context even if its first publication is unused.
    const legacy = POLICY.replace("- shape is Record.\n", "").replace("- shape reduction is most recent.\n", "")
      + '\nconcept "Legacy":\n- type is Observation.\n- value type is boolean.\n- code is `legacy`.';
    const unused = '\nconcept "Unused":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `unused`.\n- shape reduction is most recent.';
    const decision = 'decision "D":\nfirst:\n- when "Answer" then:\n  any:\n  - recommend activity "Deny" unless "Legacy".\n  end.';
    const { run } = evaluate(fact("A", "true"), ["A"], decision, "", "Deny", "", { policy: legacy + (publication ? unused : "") });
    expect(run.status).toBe(publication ? "error" : "pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual(publication ? [] : ["Deny"]);
    if (publication) expect(run.diagnostics.join("\n")).toContain("publication-unsupported-context: an unanswered action guard");
  });

  it("returns no partial activities for a case with an unsupported menu context", () => {
    const policy = POLICY + '\nconcept "Legacy":\n- type is Observation.\n- value type is boolean.\n- code is `legacy`.';
    const decision = 'decision "D":\nall:\n- when "Answer" then recommend activity "Approve".\n- when "Answer" then:\n  any:\n  - recommend activity "Deny" unless "Legacy".\n  end.';
    const { run, view } = evaluate(fact("A", "true"), ["A"], decision, "", "Approve", "", { policy, captureView: true });
    expect(run.status).toBe("error");
    expect(run.trace[0].children?.[0].node).toBe("Approve");
    expect(run.trace[0].children?.[0].evaluated).toBe(true);
    expect(run.produced).toEqual([]);
    expect(run.conceptTruth).toEqual([]);
    expect(run.trace[0].children?.[0].invalidated).toBe(true);
    expect(view?.produced).toEqual([]);
    expect(view?.tree[0].children?.[0].action?.produced).toBe(false);
    expect(view?.tree[0].children?.[0].invalidated).toBe(true);
    expect(view?.tree[1].children?.[0].invalidated).toBe(true);
  });

  it.each([false, true])("preserves a dependent guard's real error without claiming missing data (twoHop=%s)", (twoHop) => {
    const policy = POLICY + '\nconcept "Derived":\n- defined as "' + (twoHop ? 'Intermediate' : 'Answer') + '".'
      + (twoHop ? '\nconcept "Intermediate":\n- defined as "Answer".' : '');
    const decision = 'decision "D":\nfirst:\n- when "Answer" then:\n  any:\n  - recommend activity "Deny" unless "Derived".\n  end.';
    const { run } = evaluate(fact("A", "true"), ["A"], decision, "", "Deny", "", { policy });
    expect(run.status).toBe("error");
    expect(run.produced).toEqual([]);
    expect(run.diagnostics.join("\n")).toContain("publication-unsupported-context");
    expect(run.diagnostics.join("\n")).not.toContain("an unanswered action guard");
  });

  // REFACTOR:grounded (#320, review 571): a faulting condition is not established false.
  it("projects a dependent when failure as invalidated", () => {
    const policy = POLICY + '\nconcept "Derived":\n- defined as "Answer".';
    const { run, view } = evaluate(fact("A", "true"), ["A"], DECISION.replace('when "Answer"', 'when "Derived"'), "", "Approve", "", { policy, captureView: true });
    expect(run.status).toBe("error");
    expect(run.trace[0].invalidated).toBe(true);
    expect(view?.tree[0].invalidated).toBe(true);
    expect(view?.produced).toEqual([]);
  });

  it("projects delegation-cycle actions as invalidated", () => {
    const decision = DECISION.replaceAll('recommend activity "Approve"', 'use decision "D"');
    const { run, view } = evaluate(fact("A", "true"), ["A"], decision, "", "Approve", "", { captureView: true });
    expect(run.status).toBe("error");
    expect(run.diagnostics.join("\n")).toContain("cycle");
    expect(view?.tree[0].children?.[0].action?.actionKind).toBe("use-decision");
    expect(view?.tree[0].children?.[0].invalidated).toBe(true);
    expect(view?.produced).toEqual([]);
  });

  it.each(["CRL", "CEL"])("admits CRL closure dependencies but refuses CEL-only closure expansion through %s", (site) => {
    const legacy = POLICY.replace("- shape is Record.", "- shape is Scalar.").replace("- shape reduction is most recent.\n", "");
    const foreign = POLICY.replace('library "Publication".', 'library "Foreign".') + DECISION;
    const authoredFact = fact("False", "false").replace('"Publication"."Answer"', '"Foreign"."Answer"');
    const decision = site === "CRL" ? DECISION.replace('when "Answer"', 'when "Foreign"."Answer"') : DECISION;
    const { run } = evaluate(authoredFact, ["False"], decision, "", "Deny", "", { policy: legacy, siblings: [foreign] });
    if (site === "CRL") {
      expect(run.status).toBe("pass"); expect(run.produced.map(p=>p.recommendation)).toEqual(["Deny"]);
      expect(run.diagnostics).toEqual([]); return;
    }
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
- value from is "Publication Procedure Answer Options":
  - not qualifying is \`no\`.
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


terminology "Publication Procedure Answer Options":
- system is \`https://example.org/answer-codes\`.
- code is \`yes\` display is \`Yes\`.
- code is \`no\` display is \`No\`.
`;
const procedureFact = (name: string, value?: string, date?: string) => fact(name, value?.startsWith("`") ? JSON.stringify(value.slice(1, -1)) : value, date).replace('"Publication"."Answer"', '"Publication"."Procedure"');

describe("CRE selected-datum membership production", () => {
  it("uses the same owning policy/package identity and derived key as emit preparation", () => {
    const spy = vi.spyOn(celEmission, "prepareCelPublications");
    try {
      const policy = membershipPolicy.replace('- definition is "Procedure" in qualifying.', '- code is `answer`.\n- definition is "Procedure" in qualifying.');
      const {run, preparedPublications} = evaluate(procedureFact("Selected", "`yes`"), ["Selected"], DECISION, "", "Approve", "", {policy, packageName:"distinct-owning-package", capturePublication:true});
      expect(run.status, run.diagnostics.join("\n")).toBe("pass");
      const call = spy.mock.calls.findIndex((args) => args[0].coversTarget?.name === "Publication");
      expect(call).toBeGreaterThanOrEqual(0);
      const result = spy.mock.results[call];
      if (result.type !== "return") throw new Error("CRE preparation failed");
      const cre = result.value.descriptors.find((d: publicationProgramModule.PublicationDescriptor) => d.identity.conceptName === "Answer")!;
      expect(cre.identity.packageIdentity).toEqual({name:"distinct-owning-package",version:"0.0.0"});
      expect(result.value.declarations.getLibrary(cre.identity.sourceIdentity)?.artifact.policyId).toBe("distinct-owning-package");
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
  // @kit concept-form:selected-datum-membership
  it.each([["yes", true], ["no", false]] as const)("computes %s from the selected operand", (code, value) => {
    const {run, emission} = evaluate(procedureFact("Selected", `\`${code}\``), ["Selected"], DECISION, "", value ? "Approve" : "Deny", "", {policy:membershipPolicy});
    expect(emission.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(run.status, run.diagnostics.join("\n")).toBe("pass");
    expect(run.produced.map((p) => p.recommendation)).toEqual([value ? "Approve" : "Deny"]);
    expect(run.trace[0].facts).toEqual(["Selected"]);
  });

  // @kit concept-form:missing-evidence
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

  // @kit branch-guards:publication-error-boundary
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
    const { run, view } = withConflictingProcedure(() => evaluate(photoAndVisual, ["Photo", "Visual"], decision, "", "Deny", "", { policy: photoPolicy, captureView: true }));
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
    expect(view?.produced.map((item) => item.recommendation)).toEqual(["Deny"]);
    expect(view?.tree[independentFirst ? 0 : 1].children?.[0].invalidated).not.toBe(true);
    expect(view?.tree[independentFirst ? 1 : 0].publicationErrors?.map((error) => error.code)).toEqual(["publication-ambiguous-coded-value"]);
    expect(view?.tree[independentFirst ? 1 : 0].invalidated).not.toBe(true);
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

  // @kit branch-guards:publication-error-boundary
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
