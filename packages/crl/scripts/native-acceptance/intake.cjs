#!/usr/bin/env node
"use strict";
// REFACTOR:grounded (#322): real emitted Q/QR session, independent result and answer oracles.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const pkg = path.resolve(__dirname, "../..");
const {
  INTAKE_CRL,
  INTAKE_CEL,
  DATETIME_ANSWER,
  INTAKE_BASE,
  intakeAnswer,
  intakePresence,
} = require("../../dist/authoring-kit/intakeExample");
const { emitCQLImports } = require("../../dist/imports/emit");
const { emitFhirDefFromPath } = require("../../dist/fhir-emitter/closureOrchestrator");
const { resolveCelImports } = require("../../dist/cel/imports");
const { emitCelToFhir } = require("../../dist/cel/emitter/emitFhir");
const { buildEngineRepoBundle } = require("../../dist/results/repoBundle");
const { ENGINE_JAR_SOURCE } = require("../../dist/results/spawn");
const { runBounded, childEnvironment } = require("./process.cjs");
const { classDir, helperReady, carryExtractionBindings } = require("./session-check.cjs");
const objects = (x) =>
  !x || typeof x !== "object"
    ? []
    : [x, ...Object.values(x).flatMap((v) => (Array.isArray(v) ? v.flatMap(objects) : objects(v)))];
const one = (x, type) => {
  const found = objects(x).filter((v) => v.resourceType === type);
  assert.equal(found.length, 1, type);
  return found[0];
};
const {assertQuestionAssociation,assertOtherAnswersUnchanged}=require("./presentation-check.cjs");
const {planPresentationEdit}=require("../../dist/editing/presentationEdit");
const write = (p, x) => fs.writeFileSync(p, JSON.stringify(x, null, 2) + "\n");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
async function main() {
  const [jarArg, outArg, mode] = process.argv.slice(2);
  const temporalOnly = mode === "--temporal-only";
  const presentationOnly = mode === "--presentation-only";
  const wording = [
    ["Primary Diagnosis", "primary-diagnosis", "Which diagnosis needs review?"],
    ["Treatment Begun", "treatment-begun", "Has the treatment already started?"],
    ["Additional Information", "additional-information", "What else \u2014 if anything \u2014 should we review?"],
  ];
  let presentationSource = INTAKE_CRL;
  if (presentationOnly) for (const [concept,,questionText] of wording) {
    presentationSource = planPresentationEdit(presentationSource, {library:"Intake",concept,questionText,questionDescription:"Details for " + concept + ".\nKeep the original meaning."}).candidateSource;
  }
  assert(jarArg && outArg, "Usage: node intake.cjs <engine.jar> <new-scratch-directory> [--temporal-only|--presentation-only]");
  const jar = path.resolve(jarArg),
    out = path.resolve(outArg),
    root = path.resolve(pkg, "../.."),
    rel = path.relative(root, out);
  assert(
    path.isAbsolute(rel) || rel.startsWith(".." + path.sep) || rel.startsWith("tmp" + path.sep),
    "Output must be outside workspace or below tmp",
  );
  assert(!fs.existsSync(out), "Output must be new");
  assert.equal(
    createHash("sha256").update(fs.readFileSync(jar)).digest("hex"),
    ENGINE_JAR_SOURCE.sha256,
    "Use the pinned engine",
  );
  helperReady();
  fs.mkdirSync(out, { recursive: true });
  const controller = new AbortController(),
    cancel = () => controller.abort();
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  const rows = [];
  try {
    const prepare = (name, source, celSource = INTAKE_CEL) => {
      const dir = path.join(out, name);
      fs.mkdirSync(dir);
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({
          name: "intake-native",
          version: "1.0.0",
          crl: { canonicalBase: INTAKE_BASE, date: "2026-09-16" },
        }),
      );
      const crl = path.join(dir, "intake.crl"),
        cel = path.join(dir, "cases.cel");
      fs.writeFileSync(crl, source);
      fs.writeFileSync(cel, celSource);
      const cql = emitCQLImports(crl),
        fhir = emitFhirDefFromPath(crl),
        cases = emitCelToFhir(resolveCelImports(cel));
      assert(cql.success, JSON.stringify(cql.errors));
      assert(fhir.success, JSON.stringify(fhir.errors));
      if (presentationOnly) for (const [concept,,text] of wording) {
        const inputs=objects(fhir.resources).filter(x=>x.extension?.some(e=>e.url?.endsWith("/cpg-input-text")&&e.valueString===text));
        assert(inputs.length>0,"Emitted authored input text: "+concept);
        for(const input of inputs) assert(input.extension.some(e=>e.url?.endsWith("/cpg-input-description")&&e.valueMarkdown==="Details for "+concept+".\nKeep the original meaning."),"Emitted description: "+concept);
      }
      assert.deepEqual(
        cases.diagnostics.filter((d) => d.severity === "error"),
        [],
      );
      write(path.join(dir, "emission.json"), { cql, fhir, cases });
      const plan = fhir.resources.filter(
        (r) => r.resourceType === "PlanDefinition" && r.sourceKind === "Decision",
      );
      assert.equal(plan.length, 1);
      assert.equal(plan[0].resource.id, "intake-native");
      assert.equal(plan[0].relativePath, "PlanDefinition/intake-native.json");
      assert.equal(plan[0].resource.url, INTAKE_BASE + "/PlanDefinition/intake-native");
      const bundle = (caseName) => {
        const c = cases.emittedCases.find((c) => c.caseName === caseName);
        assert(c);
        const built = buildEngineRepoBundle({
          definitions: fhir.resources.map((r) => r.resource),
          cqlByLibraryFile: Object.fromEntries(
            cql.cqlByLibrary.map((r) => [r.outputFilename, r.cql]),
          ),
          caseInput: { caseName: c.caseName, resources: c.resources },
        });
        assert.deepEqual(built.missingCql, []);
        return {
          repo: built.bundle,
          subject:
            "Patient/" +
            one(
              c.resources.map((r) => r.body),
              "Patient",
            ).id,
        };
      };
      return { planId: plan[0].resource.id, bundle };
    };
    const normal = prepare("normal", presentationSource);
    const control = prepare(
      "presence-control",
      presentationSource.replace(
        'decision "Intake":',
        'activity "Missing": - request CPGCommunicationRequest. - with `MISSING`.\ndecision "Intake":',
      ).replace(
        '- otherwise then recommend activity "Human Review".',
        '- otherwise then recommend activity "Missing".',
      ),
    );
    let q, qr;
    const stages = [
      ["empty", normal, "Empty", null, "HUMAN_REVIEW"],
      ["populated", normal, "Answered", null, "HUMAN_REVIEW"],
      ["presence", control, "Answered", null, "HUMAN_REVIEW"],
      ["changed", control, "Answered", "Changed diagnosis", "HUMAN_REVIEW"],
      ["cleared", control, "Answered", undefined, "MISSING"],
    ];
    if (!temporalOnly) for (const [i, [name, model, caseName, value, outcome]] of stages.entries()) {
      const dir = path.join(out, String(i) + "-" + name);
      fs.mkdirSync(dir);
      const { repo, subject } = model.bundle(caseName);
      const request = { resourceType: "Bundle", type: "collection", entry: [] };
      if (i >= 3) {
        // Definition-based extraction resolves the returned Questionnaire by canonical.
        repo.entry.push({ resource: structuredClone(q) });
        const submitted = carryExtractionBindings(q, qr),
          item = objects(submitted.item).find(
            (x) =>
              x.definition?.endsWith("#Observation.value[x]") &&
              x.definition?.includes("-primary-diagnosis#"),
          );
        assert(item);
        const prior = structuredClone(submitted);
        if (value === undefined) delete item.answer;
        else item.answer = [{ valueString: value }];
        submitted.authored = `2030-01-0${i}T12:00:00Z`;
        // Confirm no unrelated answer has been removed or modified by the test client.
        assertOtherAnswersUnchanged(prior, submitted, item);
        request.entry.push({ resource: submitted });
      }
      write(path.join(dir, "repo.json"), repo);
      write(path.join(dir, "request.json"), request);
      const prefix = path.join(dir, "native"),
        args = [
          "-Xmx768m",
          "-XX:ActiveProcessorCount=2",
          "-Duser.timezone=UTC",
          "-Duser.language=en",
          "-Duser.country=US",
          "-Dfile.encoding=UTF-8",
          "-Djava.io.tmpdir=" + dir,
          "-Dloader.main=ApplySessionDriver",
          "-Dloader.path=" + classDir,
          "-cp",
          jar,
          "org.springframework.boot.loader.launch.PropertiesLauncher",
          path.join(dir, "repo.json"),
          path.join(dir, "request.json"),
          model.planId,
          subject,
          prefix,
        ];
      const p = await runBounded("java", args, {
        cwd: dir,
        env: childEnvironment(dir),
        timeoutMs: 120000,
        signal: controller.signal,
      });
      fs.writeFileSync(path.join(dir, "stdout.log"), p.stdout);
      fs.writeFileSync(path.join(dir, "stderr.log"), p.stderr);
      assert(!p.failure && p.exitCode === 0, p.stderr);
      const result = read(prefix + "-result.json");
      assert(
        !objects(result).some(
          (x) =>
            x.resourceType === "OperationOutcome" &&
            x.issue?.some((v) => ["error", "fatal"].includes(v.severity)),
        ),
        JSON.stringify(result),
      );
      assert(
        !objects(result).some(
          (x) => x.name === "error" && Object.keys(x).some((k) => k.startsWith("value")),
        ),
        JSON.stringify(result),
      );
      const errors = p.stderr
        .split(/\r?\n/)
        .filter(
          (l) =>
            /\bERROR\b|Exception|FATAL|Failed to/.test(l) &&
            !l.includes("No resource of type Questionnaire found for url:"),
        );
      assert.deepEqual(errors, [], "Native error log");
      const activities = objects(result).filter((x) => x.resourceType === "CommunicationRequest");
      assert.equal(activities.length, 1);
      assert.deepEqual(activities[0].payload, [{ contentString: outcome }]);
      q = one(result, "Questionnaire");
      qr = one(result, "QuestionnaireResponse");
      if (presentationOnly) for (const [,slug,text] of wording) {
        assertQuestionAssociation(q,qr,INTAKE_BASE+"/StructureDefinition/intake-native-"+slug,text);
      }
      const answers = objects(qr.item).filter((x) =>
        x.definition?.endsWith("#Observation.value[x]"),
      );
      assert.equal(
        answers.length,
        3,
        "Every input must remain reachable with zero or several populated answers",
      );
      const answer = (slug) =>
        answers.find((x) => x.definition?.includes("-" + slug + "#"))?.answer?.[0];
      const diagnosis =
        i === 0
          ? undefined
          : i === 3
            ? { valueString: value }
            : i === 4
              ? undefined
              : { valueString: "Example diagnosis, code if known" };
      assert.deepEqual(answer("primary-diagnosis"), diagnosis);
      assert.deepEqual(answer("treatment-begun"), i === 0 ? undefined : { valueBoolean: false });
      assert.deepEqual(
        answer("additional-information"),
        i === 0 ? undefined : { valueString: "Please review the attached information." },
      );
      if (i >= 3) {
        // Definition-based extraction resolves the returned Questionnaire by canonical.
        repo.entry.push({ resource: structuredClone(q) });
        assert(
          objects(repo).some(
            (x) =>
              x.resourceType === "Observation" &&
              x.valueString === "Example diagnosis, code if known",
          ),
          "Historical text must remain in the dataset",
        );
        const extracted = objects(read(prefix + "-request-after.json")).filter(
          (x) => x.resourceType === "Observation",
        );
        const cleared = extracted.find((x) =>
          x.code?.coding?.some((c) => c.code === "primary-diagnosis"),
        );
        assert(cleared, "Text answer must extract");
        assert.equal(cleared.valueString, value);
        assert(cleared.effectiveDateTime, "Extracted answer needs actual response validity");
      }
      rows.push({ name, questionCount: answers.length, outcome, diagnosis, passed: true });
      console.log(name + ": PASS");
    }

    if (presentationOnly) {
      // Exercise the association oracle against corrupted copies of real native output.
      const profile=INTAKE_BASE+"/StructureDefinition/intake-native-primary-diagnosis";
      const missing=structuredClone(q);delete assertQuestionAssociation(missing,qr,profile,wording[0][2]).group.text;
      assert.throws(()=>assertQuestionAssociation(missing,qr,profile,wording[0][2]));
      const swapped=structuredClone(q);const a=assertQuestionAssociation(swapped,qr,profile,wording[0][2]).group;
      const b=assertQuestionAssociation(swapped,qr,INTAKE_BASE+"/StructureDefinition/intake-native-treatment-begun",wording[1][2]).group;
      [a.text,b.text]=[b.text,a.text];assert.throws(()=>assertQuestionAssociation(swapped,qr,profile,wording[0][2]));
      write(path.join(out,"verification.json"),{passed:true,engineSha256:ENGINE_JAR_SOURCE.sha256,contract:"Planner-edited CRL through native group/answer/QR association; five answer/change/clear outcomes; missing/swapped native wording copies rejected. Description emission checked separately; no native description rendering claim.",rows,negativeControls:["missing group wording","swapped group wording"]});
      return;
    }
    // These are synthetic source controls, not additional ADMIN policy requirements.
    const activity =
      'activity "Human Review": - request CPGCommunicationRequest. - with `HUMAN_REVIEW`.\n';
    const branchSource =
      INTAKE_CRL.slice(0, INTAKE_CRL.indexOf('decision "Intake"')) +
      intakeAnswer("Category", "CodeableConcept", "category") +
      '- value domain is answer options.\n- value from is "Categories":\n  - not qualifying is `drug`.\n' +
      'terminology "Categories": - system is `urn:intake:category`. - code is `medical` display is `Medical`. - code is `drug` display is `Drug`.\n' +
      intakePresence("Unused Presence", '"Category"')
        .replace("has a value", "in qualifying")
        .replace("Unused Presence", "Is Medical") +
      intakeAnswer("Drug Details", "text", "drug-details") +
      intakePresence("Has Drug Details", '"Drug Details"') +
      `decision "Intake": first:
- when "Is Medical" then:
  first:
  - when "Treatment Begun" then:
    first:
    - when ("Has Primary Diagnosis" and "Has Additional Information") then recommend activity "Human Review".
    - otherwise then recommend activity "Human Review".
    end.
  - otherwise then recommend activity "Human Review".
  end.
- otherwise then:
  first:
  - when "Has Drug Details" then recommend activity "Human Review".
  - otherwise then recommend activity "Human Review".
  end.`;
    const branchCel = INTAKE_CEL.replace("- value is false.", "- value is true.")
      .replace(
        'case "Empty":',
        'fact "Category": - defined by "Intake"."Category". - value is "medical". - date is "2026-09-01".\n' +
          'fact "Drug": - defined by "Intake"."Drug Details". - value is "Historical drug details". - date is "2026-09-01".\ncase "Empty":',
      )
      .replace('case "Answered":', 'case "Answered": - fact is "Category". - fact is "Drug".');
    const branched = prepare("conditional-control", branchSource, branchCel);
    const answerItems = (r) =>
      objects(r.item).filter((x) => x.definition?.endsWith("#Observation.value[x]"));
    const slug = (x) => x.definition.split("/").pop().split("#")[0].replace("intake-native-", "");
    async function probe(
      name,
      model,
      caseName,
      requestEdit,
      repoEdit,
      expectedOutcome = "HUMAN_REVIEW",
    ) {
      const dir = path.join(out, name);
      fs.mkdirSync(dir);
      const { repo, subject } = model.bundle(caseName);
      const request = { resourceType: "Bundle", type: "collection", entry: [] };
      if (repoEdit) repoEdit(repo);
      if (requestEdit) requestEdit(request, repo);
      write(path.join(dir, "repo.json"), repo);
      write(path.join(dir, "request.json"), request);
      const prefix = path.join(dir, "native");
      const result = await runBounded(
        "java",
        [
          "-Xmx768m",
          "-XX:ActiveProcessorCount=2",
          "-Duser.timezone=UTC",
          "-Duser.language=en",
          "-Duser.country=US",
          "-Dfile.encoding=UTF-8",
          "-Djava.io.tmpdir=" + dir,
          "-Dloader.main=ApplySessionDriver",
          "-Dloader.path=" + classDir,
          "-cp",
          jar,
          "org.springframework.boot.loader.launch.PropertiesLauncher",
          path.join(dir, "repo.json"),
          path.join(dir, "request.json"),
          model.planId,
          subject,
          prefix,
        ],
        { cwd: dir, env: childEnvironment(dir), timeoutMs: 120000, signal: controller.signal },
      );
      fs.writeFileSync(path.join(dir, "stdout.log"), result.stdout);
      fs.writeFileSync(path.join(dir, "stderr.log"), result.stderr);
      assert(!result.failure && result.exitCode === 0, result.stderr);
      const body = read(prefix + "-result.json");
      const errors = objects(body).filter(
        (x) =>
          (x.resourceType === "OperationOutcome" &&
            x.issue?.some((i) => ["error", "fatal"].includes(i.severity))) ||
          (x.name === "error" && Object.keys(x).some((k) => k.startsWith("value"))),
      );
      const actions = objects(body).filter((x) => x.resourceType === "CommunicationRequest");
      if (expectedOutcome === null) {
        assert(errors.length > 0);
        assert.equal(actions.length, 0);
        return body;
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(
        result.stderr
          .split(/\r?\n/)
          .filter(
            (l) =>
              /\bERROR\b|Exception|FATAL|Failed to/.test(l) &&
              !l.includes("No resource of type Questionnaire found for url:"),
          ),
        [],
      );
      assert.deepEqual(
        actions.map((x) => x.payload),
        [[{ contentString: expectedOutcome }]],
      );
      const generatedQ = one(body, "Questionnaire");
      const generatedQr = one(body, "QuestionnaireResponse");
      assert.equal(generatedQ.url, INTAKE_BASE + "/Questionnaire/intake-native");
      assert.equal(generatedQr.questionnaire.split("|")[0], generatedQ.url);
      return body;
    }
    let branchResult;
    if (!temporalOnly) for (const [i, name, change, expected] of [
      [
        0,
        "medical",
        null,
        ["category", "treatment-begun", "primary-diagnosis", "additional-information"],
      ],
      [
        1,
        "drug",
        { category: { valueCoding: { system: "urn:intake:category", code: "drug" } } },
        ["category", "drug-details"],
      ],
      [
        2,
        "medical-again",
        { category: { valueCoding: { system: "urn:intake:category", code: "medical" } } },
        ["category", "treatment-begun", "primary-diagnosis", "additional-information"],
      ],
      [
        3,
        "no-treatment",
        { "treatment-begun": { valueBoolean: false } },
        ["category", "treatment-begun"],
      ],
    ]) {
      const previous = branchResult;
      branchResult = await probe(
        "branch-" + name,
        branched,
        "Answered",
        change
          ? (request, repo) => {
              repo.entry.push({ resource: structuredClone(one(previous, "Questionnaire")) });
              const submitted = carryExtractionBindings(
                one(previous, "Questionnaire"),
                one(previous, "QuestionnaireResponse"),
              );
              for (const [key, value] of Object.entries(change)) {
                const item = answerItems(submitted).find((x) => slug(x) === key);
                assert(item, key);
                item.answer = [value];
              }
              submitted.authored = `2031-01-0${i + 1}T12:00:00Z`;
              request.entry.push({ resource: submitted });
            }
          : null,
      );
      const actual = answerItems(one(branchResult, "QuestionnaireResponse"));
      assert.deepEqual(actual.map(slug).sort(), expected.sort(), "Active questions for " + name);
      if (name === "medical-again")
        assert.deepEqual(
          actual.find((x) => slug(x) === "primary-diagnosis").answer,
          [{ valueString: "Example diagnosis, code if known" }],
          "Off-path historical data remains available when its branch is reached again",
        );
      rows.push({
        name: "branch-" + name,
        questionCount: actual.length,
        outcome: "HUMAN_REVIEW",
        passed: true,
      });
      console.log("branch-" + name + ": PASS");
    }
    const codedSource =
      'library "Intake".\n' +
      intakeAnswer("Choice", "CodeableConcept", "choice") +
      '- value domain is answer options.\n- value from is "Answers":\n  - not qualifying is `na`.\n' +
      'terminology "Answers": - system is `urn:answers`. - code is `unknown` display is `Unknown`. - code is `na` display is `N/A`.\n' +
      intakePresence("Has Choice", '"Choice"') +
      activity +
      'activity "Missing": - request CPGCommunicationRequest. - with `MISSING`.\n' +
      'decision "Intake": first: - when "Has Choice" then recommend activity "Human Review". - otherwise then recommend activity "Missing".';
    if (!temporalOnly) for (const value of ["unknown", "na"]) {
      const cel = `library "Cases". covers "Intake". fact "Patient": - defined by "Patient". fact "Answer": - defined by "Intake"."Choice". - value is "${value}". case "Answered": - subject is "Patient". - fact is "Answer". - result is "Intake" is "Human Review".`;
      const model = prepare("coded-" + value, codedSource, cel),
        body = await probe("coded-" + value + "-apply", model, "Answered");
      assert.deepEqual(answerItems(one(body, "QuestionnaireResponse"))[0].answer, [
        { valueCoding: { system: "urn:answers", code: value } },
      ]);
      rows.push({ name: "coded-" + value, outcome: "HUMAN_REVIEW", passed: true });
      console.log("coded-" + value + ": PASS");
    }
    if (!temporalOnly) {
      // A valid FHIR value outside the declared domain must fail before HasValue,
      // matching CRE rather than becoming an answered=true finding.
      const cel = 'library "Cases". covers "Intake". fact "Patient": - defined by "Patient". fact "Answer": - defined by "Intake"."Choice". - value is "unknown". case "Answered": - subject is "Patient". - fact is "Answer". - result is "Intake" is "Human Review".';
      const model = prepare("coded-invalid", codedSource, cel);
      const body = await probe("coded-invalid-apply", model, "Answered", null, repo => {
        const answer = objects(repo).find(x => x.resourceType === "Observation" && x.code?.coding?.some(c => c.code === "choice"));
        assert(answer, "Coded source observation exists");
        answer.valueCodeableConcept = { coding: [{ system: "urn:foreign", code: "invalid" }] };
      }, null);
      assert.match(JSON.stringify(body), /publication-uninterpretable-value|No recognized domain coding/);
      rows.push({ name: "coded-invalid", outcome: "domain error; no activities", passed: true });
      console.log("coded-invalid: PASS");
    }
    // Standard dateTime: actual generated Q and full QR, with no date conversion extension.
    const temporalSource = 'library "Intake".\n' +
      DATETIME_ANSWER +
      intakePresence("Has Treatment Start", '"Treatment Start"') + activity +
      'activity "Missing": - request CPGCommunicationRequest. - with `MISSING`.\n' +
      'decision "Intake": first: - when "Has Treatment Start" then recommend activity "Human Review". - otherwise then recommend activity "Missing".';
    const temporalCel = `library "Cases". covers "Intake".
      fact "Patient": - defined by "Patient".
      fact "Answer": - defined by "Intake"."Treatment Start". - value is "2026-09-17". - date is "2026-09-01".
      case "Answered": - subject is "Patient". - fact is "Answer". - result is "Intake" is "Human Review".`;
    const temporal = prepare("datetime-model", temporalSource, temporalCel);
    let temporalResult = await probe("datetime-populated", temporal, "Answered");
    const tq = one(temporalResult, "Questionnaire");
    assert.equal(answerItems(tq)[0].type, "dateTime");
    assert.deepEqual(answerItems(one(temporalResult, "QuestionnaireResponse"))[0].answer, [{valueDateTime:"2026-09-17"}]);
    rows.push({name:"datetime-populated",type:"dateTime",value:"2026-09-17",passed:true});
    for (const [i, value] of ["2024", "2024-02", "2024-02-29", "1980-01-01T10:15:30Z", undefined].entries()) {
      temporalResult = await probe("datetime-edit-" + i, temporal, "Answered", (request, repo) => {
        repo.entry.push({ resource: structuredClone(one(temporalResult, "Questionnaire")) });
        const submitted = carryExtractionBindings(tq, structuredClone(one(temporalResult, "QuestionnaireResponse")));
        const item = answerItems(submitted)[0];
        if (value === undefined) delete item.answer;
        else item.answer = [{valueDateTime:value}];
        submitted.authored = `2032-01-0${i+1}T12:00:00Z`;
        request.entry.push({resource:submitted});
      }, null, value === undefined ? "MISSING" : "HUMAN_REVIEW");
      const actual = answerItems(one(temporalResult, "QuestionnaireResponse"))[0].answer ?? [];
      assert.deepEqual(actual, value === undefined ? [] : [{valueDateTime:value}], "Native dateTime precision and newer answer wins");
      rows.push({name:"datetime-edit-"+i,value:value ?? null,passed:true});
      console.log("datetime-edit-"+i+": PASS");
    }
    if (!temporalOnly) {
    // Deliberately malformed raw-FHIR controls measure the parser boundary; they are not emitted positive fixtures.
    const diagnosisRecord = (repo) =>
      objects(repo).find(
        (x) =>
          x.resourceType === "Observation" &&
          x.code?.coding?.some((c) => c.code === "primary-diagnosis"),
      );
    for (const [name, edit, outcome] of [
      [
        "empty-string",
        (r) => {
          r.valueString = "";
        },
        "MISSING",
      ],
      [
        "extension-only",
        (r) => {
          delete r.valueString;
          r._valueString = {
            extension: [
              {
                url: "http://hl7.org/fhir/StructureDefinition/data-absent-reason",
                valueCode: "unknown",
              },
            ],
          };
        },
        "MISSING",
      ],
      [
        "wrong-type",
        (r) => {
          delete r.valueString;
          r.valueBoolean = true;
        },
        null,
      ],
    ]) {
      await probe(
        "boundary-" + name,
        control,
        "Answered",
        null,
        (repo) => edit(diagnosisRecord(repo)),
        outcome,
      );
      rows.push({ name: "boundary-" + name, outcome: outcome ?? "ERROR", passed: true });
      console.log("boundary-" + name + ": PASS");
    }
    const original = read(path.join(out, "2-presence/native-result.json"));
    await probe(
      "boundary-qr-empty",
      control,
      "Answered",
      (request, repo) => {
        repo.entry.push({ resource: structuredClone(one(original, "Questionnaire")) });
        const submitted = carryExtractionBindings(
          one(original, "Questionnaire"),
          one(original, "QuestionnaireResponse"),
        );
        answerItems(submitted).find((x) => slug(x) === "primary-diagnosis").answer = [
          { valueString: "" },
        ];
        submitted.authored = "2032-01-01T12:00:00Z";
        request.entry.push({ resource: submitted });
      },
      null,
      null,
    );
    rows.push({ name: "boundary-qr-empty", outcome: "ERROR", passed: true });
    console.log("boundary-qr-empty: PASS");

    }
    write(path.join(out, "verification.json"), {
      passed: true,
      engineSha256: ENGINE_JAR_SOURCE.sha256,
      contract:
        temporalOnly ? "Generated dateTime Q and full QR edits; calendar precision, timestamp, earlier answer date with newer authored validity, and clear against retained historical answer. No renderer/persistence precision claim." :
        "Full returned QR with copied extraction bindings; fixed initial CEL dataset per apply; explicit newer authored response; old text remains; sibling answer values preserved. No persistence or untouched timestamp preservation claim.",
      rows,
    });
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
main().catch((e) => {
  console.error(e.stack || e);
  process.exitCode = 1;
});
