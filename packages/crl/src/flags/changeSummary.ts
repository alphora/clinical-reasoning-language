import { z } from "zod";

const text = z.string().regex(/\S/, "Expected nonblank text");
const id = z.string().regex(/^[A-Za-z0-9_-]+$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
// Forward-slash artifact-relative files only; no dot segments, drive names or control characters.
const file = z.string().regex(/^(?:src|tests)\/(?!.*(?:\/|^)\.{1,2}(?:\/|$))(?!\.{1,2}(?:\/|$))(?:[^\\/:\x00-\x1f]+\/)*[^\\/:\x00-\x1f]+$/);
const target = z.strictObject({
  scope: z.enum(["concept", "decision", "library"]), name: text, library: text.optional(),
  label: text, entityId: text.optional(), occurrenceKey: text.optional(),
});
export const flagChangeEvidenceSchema = z.strictObject({ label: text, path: file, sha256: digest });
const common = {
  flagIds: z.array(id).min(1), priorState: text, requestedChange: text,
  affectedTargets: z.array(target).min(1), evidence: z.array(flagChangeEvidenceSchema),
};
const item = z.union([
  z.strictObject({ ...common, implementedChange: text }),
  z.strictObject({ ...common, notImplementedReason: text }),
]);
/** Technical run reporting only. This contract has no approval or flag-status field. */
export const flagChangeSummarySchema = z.strictObject({
  schemaVersion: z.literal(1), runId: id.max(128), recordedAt: z.iso.datetime({ precision: 3 }),
  beforeCommit: z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/),
  items: z.array(item).min(1),
});
export type FlagChangeSummary = z.infer<typeof flagChangeSummarySchema>;
export type FlagChangeItem = FlagChangeSummary["items"][number];
export type FlagChangeEvidence = z.infer<typeof flagChangeEvidenceSchema>;
export const flagChangeSummaryJsonSchema = z.toJSONSchema(flagChangeSummarySchema, { target: "draft-7" });
export const validateFlagChangeSummary = (value: unknown) => flagChangeSummarySchema.safeParse(value);
