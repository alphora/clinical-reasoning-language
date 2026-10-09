// REFACTOR:grounded (MV/KE workflow): MV records desired state; this module never writes source.
export interface QuestionEditTarget {
  kind: "question"; file: string; library: string; concept: string;
  context?: { decision: string; criteria: string[] };
}
export interface AnswerEditTarget {
  kind: "answer"; file: string; library: string; terminology: string; system: string; code: string;
}
export type QaEditTarget = QuestionEditTarget | AnswerEditTarget;
export interface QuestionEditState { text: string; description: string }
export interface AnswerEditState {
  display: string; description: string;
  /** Keys are JSON.stringify([library, concept]); every consuming question is represented. */
  qualifications: Record<string, boolean>;
}
export type QaEditRequest =
  | { kind: "question-edit"; target: QuestionEditTarget; before: QuestionEditState; desired: QuestionEditState }
  | { kind: "answer-crud"; target: AnswerEditTarget; before: AnswerEditState | null; desired: AnswerEditState | null };

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const named = (v: unknown): v is string => text(v) && v.trim() !== "";
/** Portable artifact-relative source identity, never an arbitrary filesystem write destination. */
export function isQaSourcePath(v: unknown): v is string {
  return named(v) && !/[\\:\x00]/.test(v) && !v.startsWith("/") && v.endsWith(".crl") &&
    v.split("/").every(p => p !== "" && p !== "." && p !== "..");
}
function questionState(v: unknown): QuestionEditState | undefined {
  return object(v) && named(v.text) && text(v.description) ? { text: v.text, description: v.description } : undefined;
}
function answerState(v: unknown): AnswerEditState | undefined {
  if (!object(v) || !named(v.display) || !text(v.description) || !object(v.qualifications)) return undefined;
  const entries = Object.entries(v.qualifications);
  if (!entries.length) return undefined;
  for (const [key, value] of entries) {
    try { const pair: unknown = JSON.parse(key); if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(named) || JSON.stringify(pair) !== key || typeof value !== "boolean") return undefined; }
    catch { return undefined; }
  }
  return { display: v.display, description: v.description, qualifications: Object.fromEntries(entries) as Record<string, boolean> };
}
/** Corruption is surfaced by the enclosing flag store; malformed requests never become plain generic flags. */
export function coerceQaEditRequest(v: unknown): QaEditRequest | undefined {
  if (!object(v) || !object(v.target)) return undefined;
  const t = v.target;
  if (!isQaSourcePath(t.file) || !named(t.library)) return undefined;
  if (v.kind === "question-edit" && t.kind === "question" && named(t.concept)) {
    const before = questionState(v.before), desired = questionState(v.desired);
    if (!before || !desired) return undefined;
    const target: QuestionEditTarget = { kind: "question", file: t.file, library: t.library, concept: t.concept };
    if (t.context !== undefined) {
      if (!object(t.context) || !named(t.context.decision) || !Array.isArray(t.context.criteria) || !t.context.criteria.every(named)) return undefined;
      target.context = { decision: t.context.decision, criteria: [...t.context.criteria] };
    }
    return { kind: "question-edit", target, before, desired };
  }
  if (v.kind === "answer-crud" && t.kind === "answer" && named(t.terminology) && named(t.system) && named(t.code)) {
    const before = v.before === null ? null : answerState(v.before), desired = v.desired === null ? null : answerState(v.desired);
    if (before === undefined || desired === undefined || before === null && desired === null) return undefined;
    return { kind: "answer-crud", target: { kind: "answer", file: t.file, library: t.library, terminology: t.terminology, system: t.system, code: t.code }, before, desired };
  }
  return undefined;
}
