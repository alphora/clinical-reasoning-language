import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, mkdtempSync, rmSync } from "node:fs";
import { join, relative, isAbsolute, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { retainInteractiveQuestionnaire } from "./interactiveQuestionnaireResponse";
import { emitCrlBundle, resolveCelSuite } from "@smile-digital-health/crl";
import type { ApplySessionRequestV1, ApplySessionResult, ApplySessionOptions } from "@smile-digital-health/crl/session";

export type Fhir = { resourceType?: string; [key: string]: any };
export interface InitialState { id: string; label: string; bundle: Fhir; subject: string }
const PREFIX = "request-";
const MAX_BYTES = 16 * 1024 * 1024;
const REQUEST_TYPES = ["ServiceRequest", "NutritionOrder", "MedicationRequest", "CommunicationRequest", "Task"];
const isRequest = (resource: Fhir) => REQUEST_TYPES.includes(resource.resourceType ?? "");
const list = (value: any): any[] => Array.isArray(value) ? value : [];

/** Display only: request resources are passed to apply unchanged, including choice references. */
function requestLabels(resource: Fhir): string[] {
  let concepts: any[] = [], reference: any;
  switch (resource.resourceType) {
    case "ServiceRequest": concepts = [resource.code]; break;
    case "MedicationRequest": concepts = [resource.medicationCodeableConcept]; reference = resource.medicationReference; break;
    case "NutritionOrder": concepts = [...list(resource.oralDiet?.type), ...list(resource.supplement).map(s => s?.type), resource.enteralFormula?.baseFormulaType]; break;
    case "Task": concepts = [resource.code]; break;
    case "CommunicationRequest": concepts = list(resource.category); break;
  }
  const labels = concepts.flatMap(c => {
    const codes = list(c?.coding).map(code => code?.code).filter(v => typeof v === "string" && v.length);
    return codes.length ? codes : typeof c?.text === "string" && c.text.length ? [c.text] : [];
  });
  if (!labels.length && typeof reference?.reference === "string" && reference.reference.length) labels.push(reference.reference);
  return labels.length ? labels : [resource.resourceType!];
}

export function validateInitialBundle(bundle: Fhir): string {
  if (bundle?.resourceType !== "Bundle" || bundle.type !== "collection" || !Array.isArray(bundle.entry))
    throw new Error("Expected a collection Bundle with resource entries.");
  const resources = bundle.entry.map((e: any) => e?.resource);
  if (resources.some((r: Fhir) => !r?.resourceType)) throw new Error("Every Bundle entry must contain a resource.");
  const patients = resources.filter((r: Fhir) => r.resourceType === "Patient");
  if (patients.length !== 1 || !/^[A-Za-z0-9.-]{1,64}$/.test(patients[0].id ?? ""))
    throw new Error("Supply exactly one Patient with a FHIR id.");
  const subject = `Patient/${patients[0].id}`;
  const requests = resources.filter(isRequest);
  if (!requests.length) throw new Error(`Supply at least one supported request: ${REQUEST_TYPES.join(", ")}.`);
  const ids = new Set<string>();
  for (const r of resources) {
    if (r.id) {
      const key = `${r.resourceType}/${r.id}`;
      if (ids.has(key)) throw new Error(`Duplicate resource identity: ${key}`);
      ids.add(key);
    }
    if (["Questionnaire", "QuestionnaireResponse", "Observation", "Condition"].includes(r.resourceType))
      throw new Error("Initial states contain the Patient, requests and their supporting resources, without clinical answers or Q/QR.");
  }
  for (const request of requests) {
    const field = request.resourceType === "NutritionOrder" ? "patient" : request.resourceType === "Task" ? "for" : "subject";
    if (request[field]?.reference !== subject)
      throw new Error(`${request.resourceType}/${request.id ?? "?"}.${field} must reference the initial Patient as ${subject}; the native evaluator requires this relative reference.`);
  }
  return subject;
}

/** Discover only the selected policy's direct interactive-questionnaire request folders; never traverse into other policies. */
export function discoverInitialStates(projectRoot: string): InitialState[] {
  const root = join(projectRoot, "tests", "interactive-questionnaire");
  if (!existsSync(root)) return [];
  const realRoot = realpathSync(projectRoot);
  const inside = (file: string) => {
    const r = relative(realRoot, realpathSync(file));
    if (isAbsolute(r) || r === ".." || r.startsWith("..\\") || r.startsWith("../"))
      throw new Error(`Initial state is outside the selected policy: ${file}`);
  };
  inside(root);
  return readdirSync(root, { withFileTypes: true })
    .filter(e => new RegExp(`^${PREFIX}[1-9][0-9]*$`).test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
    .map(e => {
      const folder = join(root, e.name), file = join(folder, "request-bundle.json");
      try {
        if (!e.isDirectory() || e.isSymbolicLink()) throw new Error("Expected a regular directory.");
        inside(folder);
        const stat = lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error("request-bundle.json must be a regular file of at most 16 MiB.");
        inside(file);
        const bundle = JSON.parse(readFileSync(file, "utf8"));
        const subject = validateInitialBundle(bundle);
        const codes = bundle.entry.map((x: any) => x.resource).filter(isRequest).flatMap(requestLabels);
        return { id: e.name, label: `Request ${e.name.slice(PREFIX.length)}${codes.length ? " — " + codes.join(", ") : ""}`, bundle, subject };
      } catch (error) { throw new Error(`${e.name}/request-bundle.json: ${(error as Error).message}`); }
    });
}

export function prepareInteractivePolicy(celPath: string) {
  const selected = resolveCelSuite(celPath);
  if (!selected.ok) throw new Error(selected.diagnostics.map(d => d.message).join("; "));
  if (!selected.suite.policyPath) throw new Error("The selected MV policy has no CRL root.");
  const initialStates = discoverInitialStates(selected.suite.projectRoot);
  const emitted = emitCrlBundle(selected.suite.policyPath);
  if (!emitted.success) throw new Error("Cannot prepare policy definitions: " + JSON.stringify(emitted.diagnostics));
  const roots = emitted.bundle.entry.map(e => e.resource).filter((r: Fhir) => r.resourceType === "PlanDefinition" &&
    r.type?.coding?.some((c: any) => c.code === "workflow-definition"));
  if (roots.length !== 1 || !roots[0].id) throw new Error("The policy must emit exactly one workflow-definition PlanDefinition.");
  return { initialStates, definitions: emitted.bundle, planId: roots[0].id,
    warnings: emitted.diagnostics.filter(d => d.severity === "warning").map(d => {
      const detail = d.detail as { message?: unknown; line?: unknown };
      return typeof detail?.message === "string" ? detail.message + (typeof detail.line === "number" ? ` (line ${detail.line})` : "") : JSON.stringify(d.detail);
    }) };
}

export interface InteractiveResult { questionnaire?: Fhir; response?: Fhir; activities: string[]; warnings?: string[] }
export function readInteractiveResult(native: Fhir): InteractiveResult {
  const resources: Fhir[] = [];
  const visit = (v: any) => {
    if (!v || typeof v !== "object") return;
    if (v.resourceType) resources.push(v);
    for (const value of Object.values(v)) if (value && typeof value === "object") visit(value);
  };
  visit(native);
  const unique = (type: string) => [...new Map(resources.filter(r => r.resourceType === type).map(r => [JSON.stringify(r), r])).values()];
  const qs = unique("Questionnaire"), qrs = unique("QuestionnaireResponse");
  if (qs.length > 1 || qrs.length > 1) throw new Error("The engine returned multiple distinct Questionnaires or responses; this session cannot select an unambiguous form.");
  const questionnaire = qs[0], response = qrs[0];
  if (questionnaire && !questionnaire.url) throw new Error("The returned Questionnaire has no canonical URL.");
  const [url, version] = (response?.questionnaire ?? "").split("|");
  if (response && (!questionnaire || url !== questionnaire.url || version && version !== questionnaire.version))
    throw new Error("The engine returned an unbound QuestionnaireResponse.");
  const activities: string[] = [];
  const orchestrationIds = new Set(resources.filter(r => ["RequestGroup", "RequestOrchestration"].includes(r.resourceType!)).map(r => r.id));
  const actions = (items: any[]) => {
    for (const a of items ?? []) {
      const ref = a.resource?.reference;
      if (ref && !orchestrationIds.has(ref.replace(/^#/, "").split("/").pop()))
        activities.push(a.title || a.description || a.code?.[0]?.text || ref);
      actions(a.action);
    }
  };
  for (const r of resources.filter(r => ["RequestGroup", "RequestOrchestration"].includes(r.resourceType!))) actions(r.action);
  return { questionnaire, response, activities };
}

export function interactiveRequest(definitions: Fhir, planId: string, initial: InitialState, questionnaire?: Fhir, response?: Fhir): ApplySessionRequestV1 {
  if (response && !questionnaire) throw new Error("A response needs its returned Questionnaire.");
  return {
    schemaVersion: 1, requestId: randomUUID(), caseId: initial.id, stepId: randomUUID(),
    planDefinitionId: planId, subjectReference: initial.subject,
    repositoryJson: JSON.stringify({ ...definitions, entry: [...definitions.entry, ...(questionnaire ? [{ resource: questionnaire }] : [])] }),
    requestDataJson: JSON.stringify({ ...initial.bundle, entry: [...initial.bundle.entry, ...(response ? [{ resource: response }] : [])] }),
  };
}

export type NativeApply = (request: ApplySessionRequestV1, options: ApplySessionOptions) => Promise<ApplySessionResult>;
export function nativeInteractiveRunner(apply: NativeApply, scratchRoot = tmpdir()) {
  let quarantined = false;
  return async (request: ApplySessionRequestV1, signal: AbortSignal): Promise<InteractiveResult> => {
    if (quarantined) throw new Error("Native process cleanup was not confirmed. Reopen the panel after checking the reported process failure.");
    const dir = mkdtempSync(join(resolve(scratchRoot), "crl-interactive-"));
    let cleanup = false;
    try {
      const result = await apply(request, { outDir: join(dir, "step"), signal });
      cleanup = result.cleanupConfirmed;
      quarantined = !cleanup;
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}${cleanup ? "" : ` (native files retained at ${dir})`}`);
      const artifact = result.artifacts["native-result.json"];
      if (!artifact || artifact.bytes > 32 * 1024 * 1024) throw new Error("Native result is missing or too large.");
      return { ...readInteractiveResult(JSON.parse(readFileSync(artifact.path, "utf8"))), warnings: result.diagnostics.filter(d => d.severity === "warning").map(d => d.message) };
    } finally {
      // dir is our absolute mkdtemp child of the chosen scratch root, never a supplied project path.
      if (cleanup) rmSync(dir, { recursive: true, force: true });
    }
  };
}

/** Request ownership only: no extracted data or previous answer states are retained. */
export class InteractiveSession {
  private epoch = 0;
  private abort?: AbortController;
  private work: Promise<unknown> = Promise.resolve();
  result?: InteractiveResult;
  initial?: InitialState;
  constructor(private definitions: Fhir, private planId: string,
    private run: (r: ApplySessionRequestV1, signal: AbortSignal) => Promise<InteractiveResult>) {}
  cancel() { ++this.epoch; this.abort?.abort(); }
  reset(initial: InitialState) { this.cancel(); this.initial = initial; this.result = undefined; }
  async evaluate(response?: Fhir, retainedQuestionnaire?: Fhir): Promise<InteractiveResult | undefined> {
    if (!this.initial) throw new Error("Select an initial state.");
    let questionnaire = this.result?.questionnaire;
    if (retainedQuestionnaire) {
      if (!response || !questionnaire || retainedQuestionnaire.resourceType !== "Questionnaire" ||
        retainedQuestionnaire.url !== questionnaire.url || retainedQuestionnaire.version !== questionnaire.version)
        throw new Error("The retained Questionnaire does not match the current form.");
      const validate = (items: any[]) => {
        if (!Array.isArray(items)) throw new Error("Expected retained Questionnaire items.");
        const ids = new Set();
        for (const item of items) {
          if (!item || typeof item !== "object" || typeof item.linkId !== "string" || !item.linkId)
            throw new Error("Expected a retained Questionnaire item with a nonempty linkId.");
          if (item.answer !== undefined) throw new Error("Questionnaire items cannot contain response answers.");
          if (ids.has(item.linkId)) throw new Error("Duplicate retained Questionnaire item.");
          ids.add(item.linkId);
          if (item.item !== undefined) validate(item.item);
        }
      };
      validate(retainedQuestionnaire.item);
      questionnaire = retainInteractiveQuestionnaire(questionnaire, retainedQuestionnaire);
    }
    this.cancel();
    const epoch = this.epoch, abort = this.abort = new AbortController();
    const request = interactiveRequest(this.definitions, this.planId, this.initial, questionnaire, response);
    const previous = this.work;
    const work = (async () => {
      await previous.catch(() => {});
      if (epoch !== this.epoch) return;
      try {
        const native = await this.run(request, abort.signal);
        if (epoch !== this.epoch) return;
        // The returned pair owns assessment state. Reconstructing omitted questions here
        // hides runtime state loss and can resurrect an inapplicable answered branch.
        this.result = native;
        return native;
      } catch (error) { if (epoch === this.epoch) throw error; }
    })();
    this.work = work;
    return work;
  }
}
