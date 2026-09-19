import { createHash } from "node:crypto";
import { buildCRL, parseCRL } from "../index";
import { createPresentationCatalog, type PresentationContext } from "../emit/presentation";
import { getRefName, type CRL, type Presentation } from "../ast/types";
import type {
  CrlContext,
  PresentationStatementContext,
} from "../grammar/generated/antlr/CRLParser";

export type WordingField = "questionText" | "questionDescription";
export interface PresentationEditRequest {
  library: string;
  concept: string;
  context?: { decision: string; criteria: string[] };
  questionText?: string;
  questionDescription?: string;
}
export interface SourceEdit {
  start: number;
  end: number;
  before: string;
  text: string;
}
export interface PresentationEditReceipt {
  schemaVersion: 1;
  request: PresentationEditRequest;
  beforeSha256: string;
  afterSha256: string;
  inverseEdits: SourceEdit[];
}
export class PresentationEditError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PresentationEditError";
  }
}
const fail = (code: string, message: string): never => {
  throw new PresentationEditError(code, message);
};
export const sourceSha256 = (source: string): string =>
  createHash("sha256").update(source, "utf8").digest("hex");
const content = (source: string) => (source.startsWith("\uFEFF") ? source.slice(1) : source);
const fields: readonly WordingField[] = ["questionText", "questionDescription"];
function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "location")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalized(item)]),
    );
  return value;
}
const clean = (value: unknown): string => JSON.stringify(normalized(value));
function astOf(source: string): CRL {
  const parsed = buildCRL(content(source));
  if (!parsed.success || !parsed.result)
    return fail("invalid-source", "The baseline CRL is not parseable.");
  return parsed.result;
}
function contextOf(request: PresentationEditRequest): PresentationContext | undefined {
  return request.context
    ? { decision: request.context.decision, criteria: new Set(request.context.criteria) }
    : undefined;
}
/** The parser preserves literal spelling rather than decoding JavaScript escapes. */
function literal(value: string): string {
  if (/[`\\]/.test(value))
    return fail(
      "unsupported-literal",
      "Backticks and backslashes cannot be represented faithfully in presentation wording yet.",
    );
  return /["\r\n]/.test(value) ? "`" + value + "`" : '"' + value + '"';
}

/** Source-only resolution; file/package ownership remains the adapter's responsibility. */
export function resolvePresentationTarget(
  source: string,
  concept: string,
  context?: PresentationContext,
) {
  const ast = astOf(source);
  if (!ast.statements.some((s) => s.type === "Concept" && s.name === concept && s.code))
    return undefined;
  const catalog = createPresentationCatalog(ast),
    resolved = catalog.resolveOccurrence(concept, context);
  const errors = [...catalog.diagnostics, ...resolved.diagnostics].filter(
    (d) => d.severity === "error",
  );
  const owners = {
    ...resolved.fieldOwners,
    questionDescription:
      resolved.fieldOwners.questionDescription?.questionDescription !== undefined
        ? resolved.fieldOwners.questionDescription
        : resolved.declaration,
  };
  const ownerList = [owners.questionText, owners.questionDescription].filter(
    (p): p is Presentation => !!p,
  );
  const scopeLabel =
    [
      ...new Set(
        ownerList.map((p) =>
          p.contexts.length
            ? p.contexts.map((c) => `${c.kind} ${JSON.stringify(c.ref)}`).join(", ")
            : "all uses in this library",
        ),
      ),
    ].join("; ") || "new default for all uses in this library";
  return {
    library: ast.library.name,
    concept,
    baseline: source,
    owners,
    scopeLabel,
    editable: errors.length === 0,
    readOnlyReason: errors.length
      ? `Question wording needs correction (${[...new Set(errors.map((d) => d.kind))].join(", ")}). Ask the CRL owner to validate it.`
      : !resolved.wording.questionText
        ? "No question wording authored."
        : undefined,
    questionText: errors.length ? concept : (resolved.wording.questionText ?? concept),
    questionDescription: errors.length ? "" : (resolved.wording.questionDescription ?? ""),
    ...(context
      ? { context: { decision: context.decision, criteria: [...context.criteria] } }
      : {}),
  };
}

function checkedRequest(request: PresentationEditRequest): PresentationEditRequest {
  if (
    !request ||
    typeof request.library !== "string" ||
    !request.library.trim() ||
    typeof request.concept !== "string" ||
    !request.concept.trim()
  )
    return fail("invalid-request", "A library and concept identity are required.");
  for (const field of fields)
    if (request[field] !== undefined && typeof request[field] !== "string")
      return fail("invalid-request", `${field} must be text.`);
  if (
    request.context &&
    (typeof request.context.decision !== "string" ||
      !Array.isArray(request.context.criteria) ||
      request.context.criteria.some((c) => typeof c !== "string"))
  )
    return fail(
      "invalid-request",
      "Context requires a decision name and an array of criterion names.",
    );
  return {
    library: request.library,
    concept: request.concept,
    ...(request.context
      ? {
          context: {
            decision: request.context.decision,
            criteria: [...new Set(request.context.criteria)].sort(),
          },
        }
      : {}),
    ...Object.fromEntries(
      fields.filter((f) => request[f] !== undefined).map((f) => [f, request[f]]),
    ),
  };
}
function replay(source: string, edits: readonly SourceEdit[]): string {
  if (edits.some((e) => !e || typeof e !== "object"))
    return fail("invalid-edits", "Invalid source edit.");
  let result = source,
    previous = source.length + 1;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    if (
      !edit ||
      !Number.isInteger(edit.start) ||
      !Number.isInteger(edit.end) ||
      edit.start < 0 ||
      edit.end < edit.start ||
      edit.end > source.length ||
      edit.end > previous ||
      edit.start === previous ||
      typeof edit.text !== "string" ||
      source.slice(edit.start, edit.end) !== edit.before
    )
      return fail("invalid-edits", "Edits do not match the exact source or overlap.");
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    previous = edit.start;
  }
  return result;
}

/** Plan only permitted presentation mutations; all locations are derived from fresh parser contexts. */
export function planPresentationEdit(
  source: string,
  input: PresentationEditRequest,
  expectedSha256?: string,
) {
  if (typeof source !== "string") return fail("invalid-source", "CRL source must be text.");
  const beforeSha256 = sourceSha256(source);
  if (expectedSha256 !== undefined && expectedSha256 !== beforeSha256)
    return fail("stale-source", "Source changed since preview. Preview the current source again.");
  const request = checkedRequest(input),
    ast = astOf(source),
    context = contextOf(request);
  if (ast.library.name !== request.library)
    return fail("wrong-owner", "The source library no longer matches the selected owner.");
  if (
    context &&
    (!ast.statements.some((s) => s.type === "Decision" && s.name === context.decision) ||
      [...context.criteria].some(
        (c) => !ast.statements.some((s) => s.type === "Criterion" && s.name === c),
      ))
  )
    return fail(
      "invalid-context",
      "The selected decision or criterion context does not exist in this library.",
    );
  const target = resolvePresentationTarget(source, request.concept, context);
  if (!target)
    return fail(
      "invalid-target",
      "The selected concept must be a locally declared question-enabled concept.",
    );
  if (!target.editable) return fail("invalid-presentation", target.readOnlyReason!);
  const desired = {
    questionText: request.questionText ?? target.questionText,
    questionDescription: request.questionDescription ?? target.questionDescription,
  };
  if (!desired.questionText.trim()) return fail("invalid-wording", "Question text is required.");
  if (desired.questionText.length > 8000 || desired.questionDescription.length > 16000)
    return fail("invalid-wording", "Presentation wording exceeds the editing limit.");
  const changes = fields.filter((f) => desired[f] !== target[f]);
  if (!changes.length) return fail("no-change", "There are no wording changes to propose.");
  for (const field of changes) if (desired[field]) literal(desired[field]);
  const parsed = parseCRL(content(source));
  if (!parsed.success || !parsed.result)
    return fail("invalid-source", "The baseline CRL is not parseable.");
  const contexts = (parsed.result as CrlContext)
    .statement()
    .flatMap((s) => (s.presentationStatement() ? [s.presentationStatement()!] : []));
  const declarations = ast.presentations ?? [];
  if (contexts.length !== declarations.length)
    return fail("invalid-source", "Presentation source locations cannot be established.");
  // ANTLR uses codepoint offsets. JavaScript/editor edits use UTF-16 offsets.
  const offsets = [source.startsWith("\uFEFF") ? 1 : 0];
  for (const cp of content(source)) offsets.push(offsets[offsets.length - 1] + cp.length);
  const utf16 = (index: number) =>
    offsets[index] ?? fail("invalid-source", "Parser offset is outside source.");
  const edits: SourceEdit[] = [];
  const edit = (start: number, end: number, text: string) =>
    edits.push({ start, end, before: source.slice(start, end), text });
  const expected: Presentation[] = declarations.map((p) => ({ ...p, contexts: [...p.contexts] }));
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  let newDefault: Presentation | undefined;
  const changedFields = changes.map((field) => {
    const owner = target.owners[field];
    return {
      field,
      before: target[field],
      proposed: desired[field],
      declaration: owner ? { contexts: owner.contexts, location: owner.location } : null,
      operation:
        field === "questionDescription" && !desired[field]
          ? "remove-field-from-owner"
          : owner
            ? "replace-field"
            : "add-default-field",
    };
  });
  for (const field of changes) {
    const owner = target.owners[field];
    const index = owner
      ? declarations.findIndex((p) => clean(p.location) === clean(owner.location))
      : -1;
    if (owner && index < 0) return fail("invalid-owner", "Presentation owner no longer exists.");
    if (index < 0) {
      if (!newDefault) {
        newDefault = {
          type: "Presentation",
          target: request.concept,
          contexts: [],
          questionText: target.questionText,
          location: ast.location,
        };
        expected.push(newDefault);
      }
      if (field === "questionDescription" && !desired[field]) delete newDefault.questionDescription;
      else newDefault[field] = desired[field];
      continue;
    }
    const declarationContext: PresentationStatementContext = contexts[index];
    const line = declarationContext
      .presentationLine()
      .find((l) =>
        field === "questionText" ? !!l.QUESTION_TEXT_IS() : !!l.QUESTION_DESCRIPTION_IS(),
      );
    if (!desired[field] && field === "questionDescription") {
      if (line) {
        const value = line.QUOTED_STRING()?.symbol ?? line.backtickString()!.start;
        const valueEnd = line.QUOTED_STRING()?.symbol ?? line.backtickString()!.stop!;
        // Remove grammar tokens individually so skipped comments/trivia survive.
        for (const token of [line.DASH().symbol, line.QUESTION_DESCRIPTION_IS()!.symbol])
          edit(utf16(token.startIndex), utf16(token.stopIndex + 1), "");
        edit(utf16(value.startIndex), utf16(valueEnd.stopIndex + 1), "");
        const dot = line.DOT().symbol;
        edit(utf16(dot.startIndex), utf16(dot.stopIndex + 1), "");
      }
      delete expected[index].questionDescription;
    } else if (line) {
      const start = line.QUOTED_STRING()?.symbol ?? line.backtickString()!.start;
      const end = line.QUOTED_STRING()?.symbol ?? line.backtickString()!.stop!;
      edit(utf16(start.startIndex), utf16(end.stopIndex + 1), literal(desired[field]));
      expected[index][field] = desired[field];
    } else {
      const first = declarationContext.presentationLine()[0].start;
      const start = utf16(first.startIndex),
        lineStart = source.lastIndexOf("\n", start - 1) + 1;
      const indent = source.slice(lineStart, start).match(/^[ \t]*$/)?.[0] ?? "";
      edit(start, start, `- question description is ${literal(desired[field])}.${eol}${indent}`);
      expected[index][field] = desired[field];
    }
  }
  if (newDefault)
    edit(
      source.length,
      source.length,
      eol +
        eol +
        `presentation for ${literal(request.concept)}:${eol}- question text is ${literal(newDefault.questionText!)}.` +
        (newDefault.questionDescription
          ? `${eol}- question description is ${literal(newDefault.questionDescription)}.`
          : "") +
        eol,
    );
  // Coalesce adjacent replacements, including a literal immediately followed by its dot.
  const ordered: SourceEdit[] = [];
  for (const next of [...edits].sort((a, b) => a.start - b.start)) {
    const last = ordered.at(-1);
    if (last && last.end === next.start) {
      last.end = next.end;
      last.before += next.before;
      last.text += next.text;
    } else ordered.push({ ...next });
  }
  const candidateSource = replay(source, ordered),
    candidate = astOf(candidateSource);
  const withoutPresentations = ({ presentations: _ignored, ...rest }: CRL) => rest;
  if (
    clean(withoutPresentations(ast)) !== clean(withoutPresentations(candidate)) ||
    clean(expected) !== clean(candidate.presentations ?? [])
  )
    return fail(
      "unexpected-change",
      "Candidate changed content outside the requested presentation fields.",
    );
  const catalog = createPresentationCatalog(candidate),
    resolved = catalog.resolveOccurrence(request.concept, context);
  const errors = [...catalog.diagnostics, ...resolved.diagnostics].filter(
    (d) => d.severity === "error",
  );
  if (errors.length) return fail("invalid-presentation", errors.map((d) => d.message).join(" "));
  if (
    (resolved.wording.questionText ?? request.concept) !== desired.questionText ||
    (resolved.wording.questionDescription ?? "") !== desired.questionDescription
  )
    return fail(
      "inherited-wording",
      "This change would expose different inherited wording. Propose the change at its owning presentation instead.",
    );
  let shift = 0;
  const inverseEdits = ordered.map((e) => {
    const start = e.start + shift;
    shift += e.text.length - (e.end - e.start);
    return { start, end: start + e.text.length, before: e.text, text: e.before };
  });
  const afterSha256 = sourceSha256(candidateSource);
  const receipt: PresentationEditReceipt = {
    schemaVersion: 1,
    request,
    beforeSha256,
    afterSha256,
    inverseEdits,
  };
  const impact = changedFields.map((change) => {
    const owner = target.owners[change.field],
      isDefault = !owner || !owner.contexts.length;
    return {
      field: change.field,
      scope: isDefault
        ? "All uses inheriting this default in the owning library"
        : owner!.contexts.map((c) => `${c.kind} ${JSON.stringify(c.ref)}`).join(", "),
      ownerContexts: owner?.contexts ?? [],
      affectedPresentations: declarations
        .filter(
          (p) =>
            getRefName(p.target) === request.concept &&
            ((owner && clean(p.location) === clean(owner.location)) ||
              (isDefault && p[change.field] === undefined)),
        )
        .map((p) => ({ contexts: p.contexts })),
      externalConsumers: "Not enumerated; callers outside this source may use the changed wording.",
    };
  });
  return {
    request,
    beforeSha256,
    afterSha256,
    edits: ordered,
    fields: changedFields,
    impact,
    candidateSource,
    receipt,
    validation: {
      coverage: "CRL parse, owning-library presentation resolution and unrelated AST preservation",
      remaining: [
        "Project/import validation",
        "Emission presentation coexistence checks",
        "Native display and renewed wording review",
      ],
    },
  };
}

/** Exact optimistic apply; semantic planning is repeated instead of trusting caller edits. */
export function applyPresentationEditToSource(
  source: string,
  request: PresentationEditRequest,
  expectedSha256: string,
) {
  if (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(expectedSha256))
    return fail("invalid-request", "Apply requires the exact baseline SHA-256 from preview.");
  return planPresentationEdit(source, request, expectedSha256);
}
/** Untrusted receipts cannot replace computation: replay the permitted forward edit first. */
export function revertPresentationEditInSource(
  current: string,
  receipt: PresentationEditReceipt,
): string {
  if (
    !receipt ||
    receipt.schemaVersion !== 1 ||
    !Array.isArray(receipt.inverseEdits) ||
    receipt.inverseEdits.length > 20
  )
    return fail("invalid-receipt", "Invalid presentation reversal receipt.");
  if (sourceSha256(current) !== receipt.afterSha256)
    return fail("stale-source", "Source changed after the edit. Reconcile it before undoing.");
  const original = replay(current, receipt.inverseEdits);
  if (sourceSha256(original) !== receipt.beforeSha256)
    return fail("invalid-receipt", "Reversal does not reconstruct the recorded baseline.");
  const forward = planPresentationEdit(original, receipt.request, receipt.beforeSha256);
  if (
    forward.candidateSource !== current ||
    clean(forward.receipt.inverseEdits) !== clean(receipt.inverseEdits)
  )
    return fail(
      "invalid-receipt",
      "Reversal is not the inverse of the permitted presentation edit.",
    );
  return original;
}
