// REFACTOR:grounded (MV/KE workflow): MV marks Fixed/Approved after KE reports completion out of band.
import { createHash } from "node:crypto";
import type { MvFlag, MvFlagStatus } from "./mvFlag";
import { coerceQaEditRequest, type QaEditRequest, type QaEditTarget } from "./qaEditRequest";
export type MvReviewStatus = "pending-fix" | "fixed" | "approved";
export function canonicalMvValue(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonicalMvValue).join(",") + "]";
  if (v !== null && typeof v === "object") return "{" + Object.entries(v).filter(([, x]) => x !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => JSON.stringify(k) + ":" + canonicalMvValue(x)).join(",") + "}";
  return JSON.stringify(v) ?? "null";
}
/** Apply-selection fingerprint only, not an automatic fix attestation. */
export const mvFlagRevision = (f: MvFlag): string => createHash("sha256").update(canonicalMvValue(f)).digest("hex");
export const isQaEditFlag = (f: Pick<MvFlag, "tag">): boolean => f.tag === "question-edit" || f.tag === "answer-crud";
export const qaEditFlagId = (t: QaEditTarget): string => "qa-" + createHash("sha256").update(canonicalMvValue(t)).digest("hex");
export function mvReviewStatus(f: Pick<MvFlag, "category" | "status">): MvReviewStatus {
  if (f.category !== "validation") throw new Error("MV review status applies only to MV flags.");
  return f.status === "approved" || f.status === "resolved" ? "approved" : f.status === "fixed" ? "fixed" : "pending-fix";
}
export function transitionMvFlag(f: MvFlag, next: MvFlagStatus, now = new Date().toISOString()): MvFlag {
  if (f.category !== "validation") throw new Error("KE flags retain their Answer/Ignore lifecycle.");
  const desired = next === "resolved" ? "approved" : next;
  if (mvReviewStatus(f) === mvReviewStatus({ category: "validation", status: desired })) return f;
  if (desired === "approved" && mvReviewStatus(f) !== "fixed") throw new Error("Mark the flag Fixed before approving it.");
  if (desired === "fixed" && mvReviewStatus(f) !== "pending-fix") throw new Error("Only a pending flag can be marked Fixed.");
  return { ...f, status: desired, editedAt: now };
}
export function renewMvFlag(f: MvFlag, patch: Partial<Pick<MvFlag, "gist" | "description" | "fields" | "anchor" | "tag">> = {},
  now = new Date().toISOString()): MvFlag {
  if (f.category !== "validation") throw new Error("KE flags retain their Answer/Ignore lifecycle.");
  const updated = { ...f, ...patch };
  return canonicalMvValue(updated) === canonicalMvValue(f) ? f : { ...updated, status: "open", editedAt: now };
}
/** One current-state record per Q/A. Undefined removes a no-op or reverted pending request. */
export function buildQaEditFlag(request: QaEditRequest, current?: MvFlag,
  now = new Date().toISOString(), baselineApplied = false): MvFlag | undefined {
  const parsed = coerceQaEditRequest(request);
  if (!parsed) throw new Error("Invalid Question Edit or Answer CRUD request.");
  const id = qaEditFlagId(parsed.target);
  if (current && (!isQaEditFlag(current) || current.id !== id || current.category !== "validation")) throw new Error("Question/answer flag identity changed.");
  // Saving the same intent is not Revert, including after KE applied it. Preserve MV's review state.
  if (current?.editRequest && canonicalMvValue(current.editRequest.desired) === canonicalMvValue(parsed.desired)) return current;
  const composed = current?.editRequest && !baselineApplied ? { ...parsed, before: current.editRequest.before } as QaEditRequest : parsed;
  if (canonicalMvValue(composed.before) === canonicalMvValue(composed.desired)) return undefined;
  const t = composed.target;
  return { schemaVersion: 2, id, category: "validation", tag: composed.kind, status: "open", fields: {},
    gist: composed.kind === "question-edit" ? "Question Edit" : "Answer CRUD", editRequest: composed,
    anchor: { scope: "concept", name: t.kind === "question" ? t.concept : t.terminology, library: t.library,
      label: t.kind === "question" ? t.concept : t.code }, createdAt: current?.createdAt ?? now, editedAt: now };
}
