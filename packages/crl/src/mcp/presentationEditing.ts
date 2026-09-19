import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  previewPresentationFileEdit,
  applyPresentationFileEdit,
  revertPresentationFileEdit,
} from "../editing/presentationFile";
import { PresentationEditError } from "../editing/presentationEdit";

const targetSchema = {
  projectRoot: z
    .string()
    .min(1)
    .describe("Absolute root of the locally owned package.json project."),
  filePath: z
    .string()
    .min(1)
    .describe(
      "Absolute path to the locally owned CRL file; package and linked targets are refused.",
    ),
};
const requestSchema = z
  .object({
    library: z.string().min(1),
    concept: z.string().min(1),
    context: z
      .object({ decision: z.string().min(1), criteria: z.array(z.string().min(1)).max(100) })
      .strict()
      .optional(),
    questionText: z.string().max(8000).optional(),
    questionDescription: z.string().max(16000).optional(),
  })
  .strict();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const editSchema = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    before: z.string().max(1_000_000),
    text: z.string().max(1_000_000),
  })
  .strict();
const receiptSchema = z
  .object({
    ...targetSchema,
    edit: z
      .object({
        schemaVersion: z.literal(1),
        request: requestSchema,
        beforeSha256: hash,
        afterSha256: hash,
        inverseEdits: z.array(editSchema).max(20),
      })
      .strict(),
  })
  .strict();
function result(action: () => unknown) {
  try {
    return {
      content: [
        { type: "text" as const, text: JSON.stringify({ success: true, ...(action() as object) }) },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            code: error instanceof PresentationEditError ? error.code : "filesystem-error",
            message: error instanceof Error ? error.message : String(error),
          }),
        },
      ],
    };
  }
}
/** Both the CLI and VS Code bundle register exactly the same editing surface. */
export function registerPresentationEditing(server: McpServer) {
  server.registerTool(
    "preview_presentation_edit",
    {
      title: "Preview question wording edit",
      description:
        "Preview an ordinary CRL question text/description edit without writing. Edits existing field owners: an inherited description can affect its shared default and other uses. Inspect fields, owner scope, impact and source/edits before applying. No new per-use override is inferred. Omit a field to keep it; an empty description requests removal and refuses if unexpected inherited text would appear. Returns a previewToken binding the proposal, saved source, configuration and discovered dependencies. Source validation does not establish emission readiness, native behavior or clinical approval. MV wording submissions remain separate proposals.",
      inputSchema: z.object({ ...targetSchema, request: requestSchema }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (args) => result(() => previewPresentationFileEdit(args, args.request)),
  );
  server.registerTool(
    "apply_presentation_edit",
    {
      title: "Apply previewed question wording",
      description:
        "Apply exactly the previewed wording to its field owners in authorized CRL scope. Requires previewToken from preview_presentation_edit and the same request. Refuses changed source/project inputs or wording; re-preview to reconcile. Writes one saved source file and returns an exact reversal receipt; leaves generated artifacts, MV verdicts and flags unchanged. Cannot see unsaved editor buffers: save/reconcile them first. Optimistic check plus replacement, not an exclusive lock against external writers. Regenerate and verify downstream results before renewed clinical review.",
      inputSchema: z
        .object({ ...targetSchema, request: requestSchema, previewToken: hash })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    (args) => result(() => applyPresentationFileEdit(args, args.request, args.previewToken)),
  );
  server.registerTool(
    "revert_presentation_edit",
    {
      title: "Undo an applied question wording edit",
      description:
        "Restore the exact source bytes from a verified apply_presentation_edit receipt. Refuses intervening source edits, invalid receipts and project source-validation errors; never force-overwrites later work. No generated-output or clinical-review changes.",
      inputSchema: z.object({ receipt: receiptSchema }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    (args) => result(() => revertPresentationFileEdit(args.receipt)),
  );
}
