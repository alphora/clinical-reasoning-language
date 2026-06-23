// CRL MCP server factory (#132 step 4). The SINGLE source for the MCP tool surface, consumed by
// the `crl-mcp` CLI bin (packages/crl/src/cli/run-mcp-server.ts) and the VS Code extension's
// bundled server (packages/crl-vscode/src/mcp-server.ts) — both are thin shims that import
// createServer/main/selfTest from here, so the two can no longer drift. No module-level dispatch:
// importing this module must NOT start a server (the thin entries own the argv dispatch).
import { readFileSync, statSync } from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getAuthoringKit, DEFAULT_STAGE } from "../authoring-kit";
import { emitCelToFhir } from "../cel/emitter";
import { resolveCelImports } from "../cel/imports";
import { validateCELFile } from "../cel/validator";
import { runCel, renderScenario } from "../cre";
import { emitFhirDefFromPath } from "../fhir-emitter";
import type { ImportDiagnostic } from "../imports/types";
import { validateCRLImports } from "../imports/validate";
import { tokenizeCRL, buildCRL, validateCRL, emitCQL } from "../index";
import { validateProvenanceFiles } from "../provenance";

// Caps the CRL SOURCE (input) size. Response size scales with this — there is
// no separate output cap, but bounding input keeps responses bounded enough.
const MAX_INPUT_BYTES = 1_000_000;

type CrlFn = (input: string) => { success: boolean; result?: unknown; errors?: unknown };
type ToolArgs = { code?: string; path?: string };
type ValidateArgs = ToolArgs & { soft?: boolean };
type EmitArgs = ToolArgs & { libraryName?: string };

// Thrown for bad tool input (XOR violation, unreadable/oversized/dir path).
// These map to MCP isError responses; CRL parse/build failures do NOT — those
// are normal results with success:false.
class ToolInputError extends Error {}

function resolveSource(args: ToolArgs): string {
  // `code` counts as supplied if it is a string at all (empty string is a
  // valid — if degenerate — CRL document, not a bad argument). `path` must be
  // a non-blank string.
  const hasCode = typeof args.code === "string";
  const hasPath = typeof args.path === "string" && args.path.trim().length > 0;
  if (hasCode === hasPath) {
    throw new ToolInputError(
      "Provide exactly one of `code` (inline CRL) or `path` (a .crl file), not both or neither.",
    );
  }

  let text: string;
  if (hasCode) {
    text = args.code as string;
  } else {
    const p = (args.path as string).trim();
    try {
      const st = statSync(p);
      if (st.isDirectory()) {
        throw new ToolInputError(`Path is a directory, not a file: "${p}".`);
      }
      if (st.size > MAX_INPUT_BYTES) {
        throw new ToolInputError(`File too large: ${st.size} bytes > ${MAX_INPUT_BYTES}.`);
      }
      text = readFileSync(p, "utf8");
    } catch (e) {
      if (e instanceof ToolInputError) throw e;
      throw new ToolInputError(`Cannot read path "${p}": ${(e as Error).message}`);
    }
  }

  if (Buffer.byteLength(text, "utf8") > MAX_INPUT_BYTES) {
    throw new ToolInputError(`Input too large: > ${MAX_INPUT_BYTES} bytes.`);
  }
  // strip a leading UTF-8 BOM (clinical files are often saved with one)
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function runTool(fn: CrlFn, args: ToolArgs) {
  let source: string;
  try {
    source = resolveSource(args);
  } catch (e) {
    const msg =
      e instanceof ToolInputError ? e.message : `Unexpected error: ${(e as Error).message}`;
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
  // A CRL lexical/parse/build failure is a normal ParseResult (success:false),
  // not a tool error — return it as content so the agent can read errors[].
  // Compact JSON (no pretty-print) keeps the LLM-facing payload small.
  const result = fn(source);
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

function runEmit(args: EmitArgs) {
  let source: string;
  try {
    source = resolveSource(args);
  } catch (e) {
    const msg =
      e instanceof ToolInputError ? e.message : `Unexpected error: ${(e as Error).message}`;
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
  const result = emitCQL(source, {
    libraryName: args.libraryName,
  });
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

function importDiagnosticToError(d: ImportDiagnostic): Record<string, unknown> {
  // Project ImportDiagnostic variants into a uniform { type, kind, message,
  // filePath?, line?, column? } shape so the slim response stays consistent
  // with single-file validation errors. The `kind` discriminator is preserved
  // so callers can branch on it without parsing the message.
  const base: Record<string, unknown> = { type: "Import", kind: d.kind };
  switch (d.kind) {
    case "parse-failure": {
      const first = d.errors[0];
      base.filePath = d.filePath;
      base.message = `Parse failure in ${d.filePath}${first ? `: ${first.message}` : ""}`;
      if (first) {
        base.line = first.line;
        base.column = first.column;
      }
      return base;
    }
    case "project-root-not-found":
      base.message = `No package.json found upward from ${d.fromPath}`;
      return base;
    case "package-resolution-failure":
      base.filePath = d.packagePath;
      base.message = d.message;
      return base;
    case "registry-duplicate":
      base.message = `Duplicate library "${d.name}" declared in ${d.filePaths.join(", ")}`;
      return base;
    case "unresolved-include":
      base.filePath = d.from.filePath;
      base.line = d.include.location?.start.line;
      base.column = d.include.location?.start.column;
      base.message = `Unresolved include of library "${d.include.name}" from ${d.from.filePath}`;
      return base;
    case "cycle":
      base.message = `Include cycle: ${d.filePaths.join(" → ")}`;
      return base;
    case "alias-not-yet-supported":
      base.filePath = d.from.filePath;
      base.line = d.include.location?.start.line;
      base.column = d.include.location?.start.column;
      base.message = `Include alias not yet supported (library "${d.include.name}")`;
      return base;
    case "redundant-local-include":
      base.filePath = d.from.filePath;
      base.line = d.include.location?.start.line;
      base.column = d.include.location?.start.column;
      base.message = `Redundant local include "${d.include.name}" (sibling libraries auto-resolve via qualified refs)`;
      return base;
  }
}

function validationErrorToSlim(v: {
  kind: string;
  message: string;
  location?: { start: { line: number; column: number } };
  filePath?: string;
  libraryName?: string;
}): Record<string, unknown> {
  return {
    type: "Validation",
    kind: v.kind,
    message: v.message,
    line: v.location?.start.line,
    column: v.location?.start.column,
    filePath: v.filePath,
    libraryName: v.libraryName,
  };
}

function runValidate(args: ValidateArgs) {
  const hasCode = typeof args.code === "string";
  const hasPath = typeof args.path === "string" && args.path.trim().length > 0;
  if (hasCode === hasPath) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Provide exactly one of `code` (inline CRL) or `path` (a .crl file), not both or neither.",
        },
      ],
      isError: true,
    };
  }

  // Path mode → cross-file/project validation. Sees sibling libraries the
  // same way the VS Code in-editor diagnostic surface does.
  if (hasPath) {
    const p = (args.path as string).trim();
    try {
      const st = statSync(p);
      if (st.isDirectory()) {
        throw new ToolInputError(`Path is a directory, not a file: "${p}".`);
      }
      if (st.size > MAX_INPUT_BYTES) {
        throw new ToolInputError(`File too large: ${st.size} bytes > ${MAX_INPUT_BYTES}.`);
      }
    } catch (e) {
      const msg =
        e instanceof ToolInputError
          ? e.message
          : `Cannot read path "${p}": ${(e as Error).message}`;
      return { content: [{ type: "text" as const, text: msg }], isError: true };
    }
    const full = validateCRLImports(p, { soft: args.soft === true });
    const errors: Record<string, unknown>[] = [
      ...full.importDiagnostics.filter((d) => d.severity === "error").map(importDiagnosticToError),
      ...full.validationErrors.map(validationErrorToSlim),
    ];
    const warnings: Record<string, unknown>[] = [
      ...full.importDiagnostics
        .filter((d) => d.severity === "warning")
        .map(importDiagnosticToError),
      ...full.validationWarnings.map(validationErrorToSlim),
    ];
    const slim = { success: full.success, errors, warnings };
    return { content: [{ type: "text" as const, text: JSON.stringify(slim) }] };
  }

  // Inline-code mode → single-file validation (no sibling-file context to see).
  let source: string;
  try {
    source = resolveSource(args);
  } catch (e) {
    const msg =
      e instanceof ToolInputError ? e.message : `Unexpected error: ${(e as Error).message}`;
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
  // Strip the (potentially large) AST from the response — the agent only
  // needs the diagnostic envelope, not the full tree. Callers that need the
  // tree should use `build_crl_ast` separately.
  const full = validateCRL(source, { soft: args.soft === true });
  const slim = { success: full.success, errors: full.errors, warnings: full.warnings };
  return { content: [{ type: "text" as const, text: JSON.stringify(slim) }] };
}

function runValidateCel(args: { path?: string; soft?: boolean }) {
  const hasPath = typeof args.path === "string" && args.path.trim().length > 0;
  if (!hasPath) {
    return {
      content: [
        {
          type: "text" as const,
          text: "validate_cel requires a `path` argument (path to a .cel file).",
        },
      ],
      isError: true,
    };
  }
  const p = (args.path as string).trim();
  try {
    const st = statSync(p);
    if (st.isDirectory()) {
      throw new ToolInputError(`Path is a directory, not a file: "${p}".`);
    }
    if (st.size > MAX_INPUT_BYTES) {
      throw new ToolInputError(`File too large: ${st.size} bytes > ${MAX_INPUT_BYTES}.`);
    }
  } catch (e) {
    const msg =
      e instanceof ToolInputError ? e.message : `Cannot read path "${p}": ${(e as Error).message}`;
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
  const result = validateCELFile(p, { soft: args.soft === true });
  // Strip the .graph from the response — it carries the full registry which
  // can be very large. Callers needing the raw graph should use the npm
  // package directly.
  const slim = {
    success: result.errors.length === 0,
    errors: result.errors,
    warnings: result.warnings,
  };
  return { content: [{ type: "text" as const, text: JSON.stringify(slim) }] };
}

const inputSchema = {
  code: z.string().optional().describe("Inline CRL source text. Provide this OR `path`, not both."),
  path: z
    .string()
    .optional()
    .describe(
      "Path to a .crl file to read (absolute recommended; relative resolves against the server's working directory). Provide this OR `code`, not both.",
    ),
};

export function createServer(): McpServer {
  const server = new McpServer({ name: "crl", version: "0.1.0" });

  server.registerTool(
    "tokenize_crl",
    {
      title: "Tokenize CRL",
      description:
        "Lex Clinical Reasoning Language (CRL) source into tokens. Pass exactly one of `code` (inline) or `path` (file). " +
        "Returns a ParseResult JSON envelope: { success: boolean; result?: Token[]; errors?: CRLError[] }. " +
        "Check `success` first; on false, `errors` lists { type, line, column, message, details }. " +
        "Token = { line, column, type, text }.",
      inputSchema,
    },
    (args) => runTool(tokenizeCRL, args),
  );

  server.registerTool(
    "build_crl_ast",
    {
      title: "Build CRL AST",
      description:
        "Parse CRL source and build its Abstract Syntax Tree. Pass exactly one of `code` (inline) or `path` (file). " +
        "Returns a ParseResult JSON envelope: { success: boolean; result?: <AST>; errors?: CRLError[] }. " +
        "success:true means lexing/parsing/AST construction succeeded — it does NOT perform semantic validation. " +
        "The AST root is { type: 'CRL', header?, library?, includes[], statements[], location }. header is present only when the document opens with a '#' line; library is present only when the file declares `library \"Name\" version '<v>'?.`; includes is always an array (may be empty) of `include` declarations.",
      inputSchema,
    },
    (args) => runTool(buildCRL, args),
  );

  server.registerTool(
    "validate_crl",
    {
      title: "Validate CRL",
      description:
        "Validate a CRL document end-to-end: lex, parse, build AST, then run semantic checks (name uniqueness, " +
        "reference resolution, cycle detection, action uniqueness). Pass exactly one of `code` (inline) or " +
        "`path` (file), plus an optional `soft` flag. " +
        "When `path` is provided the validator runs in PROJECT mode: it walks up to the nearest package.json and " +
        "validates the file in the context of its sibling local libraries and node_modules packages — so " +
        'qualified refs like "OtherLib"."X" resolve the same way they do for the VS Code in-editor ' +
        "diagnostics. When `code` is provided the validator runs in SINGLE-FILE mode (no sibling context). " +
        "Returns { success, errors[], warnings[] } — the AST is omitted (use build_crl_ast for that). " +
        "In soft mode, reference-target-exists checks demote to warnings (useful while authoring); name uniqueness " +
        "and cycle detection remain errors.",
      inputSchema: {
        ...inputSchema,
        soft: z
          .boolean()
          .optional()
          .describe("If true, demote reference-target-exists errors to warnings."),
      },
    },
    (args) => runValidate(args as ValidateArgs),
  );

  server.registerTool(
    "validate_cel",
    {
      title: "Validate CEL",
      description:
        "Validate a CEL (Case Example Language) document end-to-end against the covered CRL library's " +
        "closure. Pass `path` (a .cel file); inline `code` is not supported in this tool because the " +
        "validator needs the file's project root to walk the CRL closure. " +
        "Returns { success, errors[], warnings[] } — the AST is omitted (use build_crl_ast on a .crl file " +
        "for AST inspection, or call buildCEL from the npm package). " +
        "Diagnostic kinds include: unresolved-bare-type, unresolved-qualified-library, " +
        "unresolved-qualified-declaration, unsupported-yet, unresolved-result-leaf, invalid-result-shape, " +
        "invalid-result-leaf-kind, unresolved-fact-ref, duplicate-fact-name, duplicate-case-name, " +
        "unresolved-cel-include, alias-not-yet-supported, plus passthrough kinds from the resolver " +
        "(parse-failure, project-root-not-found, unresolved-covers, covers-missing-but-cases-present, " +
        "crl-import). See docs/cel-spec.md for the full semantics. " +
        "In soft mode, unsupported-yet and alias-not-yet-supported warnings are silenced; ref-resolution " +
        "and structural errors stay strict (CEL diverges from CRL's soft-mode semantics).",
      inputSchema: {
        path: z
          .string()
          .describe(
            "Path to a .cel file (absolute recommended; relative resolves against the server CWD).",
          ),
        soft: z
          .boolean()
          .optional()
          .describe("If true, silence unsupported-yet and alias-not-yet-supported warnings."),
      },
    },
    (args) => runValidateCel(args as { path?: string; soft?: boolean }),
  );

  server.registerTool(
    "emit_cql",
    {
      title: "Emit CQL",
      description:
        "Emit CQL from a CRL document. Pass exactly one of `code` (inline) or `path` (file), plus optional " +
        "`libraryName`. " +
        "Returns { success, result?, errors?, unmatched? }: on full success, `result` is the generated CQL text " +
        "targeting the CRLCommon library (src/cql-emitter/catalog/CRLCommon.cql). The emitted CQL library declaration is " +
        "unversioned (npm packaging IS the version system); `include CRLCommon` is also unversioned. " +
        "Refinement-vs-boolean composition is detected per-operand; stub valuesets (empty URL) become " +
        "parameter declarations; terminology/concept name collisions are disambiguated with a ' Code' / " +
        "' ValueSet' suffix. " +
        "Issue #79 — when one or more `- definition is …` narrative bodies fail to match a catalog " +
        "pattern, `success` becomes `false`, `unmatched[]` lists each failing narrative ({text, line, column}), " +
        'and `errors[]` mirrors them as `kind: "emit-unmatched-narrative"`. The `result` CQL is still ' +
        "populated so callers can inspect partial output — each unmatched spot contains a compile-failing " +
        "`CRLCommon.UnmatchedNarrative(...)` sentinel that downstream CQL translation will reject. " +
        "Callers gating on emit fidelity should check `success` (or `unmatched.length === 0`), NOT just " +
        "the presence of `result`. The output may still need a CQL compiler to validate end-to-end.",
      inputSchema: {
        ...inputSchema,
        libraryName: z
          .string()
          .optional()
          .describe("Library name for the emitted CQL (default: GeneratedFromCRL)."),
      },
    },
    (args) => runEmit(args as EmitArgs),
  );

  server.registerTool(
    "emit_crl_fhir",
    {
      title: "Emit FHIR Definition Resources from CRL",
      description:
        "Emit cpg-conformant FHIR Definition resources (ValueSet, Library, ActivityDefinition, PlanDefinition) from a CRL document. " +
        "Closure walks from the file's nearest package.json. Returns a SUMMARY envelope by default to keep tool output small: " +
        "`{ success, resourceCount, resourceManifest:[{resourceType, id, relativePath, sourceKind, sourceName}], errors, unmatched, importDiagnostics, metadataErrors }`. " +
        "Pass `includeResources: true` to also receive the full `resources[]` array (each with the full FHIR JSON). " +
        "Emitted FHIR definitional resources carry `version` (sourced from the npm package.json — CRMI Shareable requires version 1..1) and, at publishable+ capability, a reproducible `date` (resolved from SOURCE_DATE_EPOCH env or package.json `crl.date`, else wall clock). Emitted CQL stays version-less. Default capability is publishable. " +
        "Decision actions using the CRL `any:` qualifier emit a `crl-logical-switch` extension URL whose corresponding StructureDefinition is not yet shipped (pending CPG ballot); strict validators may require an ignore-list for the URL until then. " +
        'Cross-library concept/terminology refs are unsupported in v0 (cascade-suppression surfaces via unresolved-* UnmatchedReference). Same-library qualified refs `"CurrentLib"."X"` still resolve. ' +
        "Deliberate spec deviation: PlanDefinitions reference publishable-only sub-decisions via action.definitionCanonical (the published cpg-strategydefinition target-profile constraint is wrong; operator is amending the spec).",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("Absolute path to a .crl file. Imports walk to nearest package.json."),
        includeResources: z
          .boolean()
          .optional()
          .describe(
            "Include the full resources[] array in the result. Default false (summary only).",
          ),
        date: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Publication date (ISO) for reproducible emit. Highest precedence (over SOURCE_DATE_EPOCH env and package.json crl.date). Only stamped at publishable+.",
          ),
        capability: z
          .enum(["shareable", "computable", "publishable", "executable"])
          .optional()
          .describe(
            "CRMI capability level (shareable|computable|publishable; default publishable). Gates date + meta.profile + knowledgeCapability together. `executable` is not yet supported (needs ELM/expansion — issue #113).",
          ),
      },
    },
    (args) =>
      runEmitCrlFhir(
        args as {
          path: string;
          includeResources?: boolean;
          date?: string;
          capability?: "shareable" | "computable" | "publishable" | "executable";
        },
      ),
  );

  server.registerTool(
    "emit_cel",
    {
      title: "Emit FHIR Instance Resources from CEL",
      description:
        "Emit FHIR instance resources (Patient + 1-per-fact-reference per case) from a CEL (Case Example Language) document. " +
        "Pass `path` (an absolute .cel file path); the resolver walks to the nearest package.json to load the covered CRL closure. " +
        "Returns a SUMMARY envelope by default: " +
        "`{ success, caseCount, resourceCount, caseManifest:[{caseSlug, librarySlug, resourceCount}], resourceManifest:[{caseSlug, resourceType, id, outputPath}], diagnostics }`. " +
        "Pass `includeResources: true` to also receive the full `emittedCases[]` array (each case's full FHIR JSON bodies). " +
        "success is true iff there are zero error-severity diagnostics; `unsupported-yet`, `result-deferred`, and `precondition-failed` (when not error) are warnings, surfaced but non-fatal. " +
        "Diagnostic kinds: unsupported-yet (fact's `defined by` couldn't derive a bare FHIR type — case skipped), " +
        "result-deferred (`result is` parsed but not emitted, deferred to #70/metric), " +
        "precondition-failed (parse error / unresolved covers / etc. — case skipped).",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("Absolute path to a .cel file. Imports walk to nearest package.json."),
        includeResources: z
          .boolean()
          .optional()
          .describe(
            "Include the full emittedCases[] array (with resource bodies). Default false (summary only).",
          ),
      },
    },
    (args) => runEmitCel(args as { path: string; includeResources?: boolean }),
  );

  server.registerTool(
    "run_decision",
    {
      title: "Run CRL decisions over CEL cases (CRE)",
      description:
        "Evaluate the CRL decision(s) a CEL document covers over each case's facts and check the case's " +
        "`result is` oracle — the CRL Clinical Reasoning Engine (#115), an authoring-time interpreter " +
        "(NOT the FHIR/CQL engine). Pass `path` (an absolute .cel file path); the resolver walks to the " +
        "nearest package.json to load the covered CRL closure. A concept is satisfied when a case fact is " +
        "`defined by` it (asserted) OR its `defined as` composition (sem-and/sem-or/sem-not, closed-world) " +
        "evaluates true (#126); it walks the full decision shape (first:/all:/any:/otherwise + " +
        "`unless`/`only when` guards) and a decision-leaf `result is` passes iff the expected branch is " +
        "in the produced recommendation set. Returns { success, caseCount, passCount, failCount, " +
        "errorCount, runs:[{case, decision, status, expected, produced, trace:[{node, nodeId, source, " +
        "...}], diagnostics}], errors, importDiagnostics }. NOT yet evaluated (deferred): `definition is` " +
        "predicates (count/temporal/value), `coded from`/external value sets, transitive `use decision`.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("Absolute path to a .cel file. Imports walk to nearest package.json."),
        case: z
          .string()
          .optional()
          .describe("Optional: run only the named case (default: all cases)."),
      },
    },
    (args) => runDecision(args as { path: string; case?: string }),
  );

  server.registerTool(
    "render_scenario",
    {
      title: "Render the scenario/decision view-model (CRE→UI contract)",
      description:
        "Run the CRE over a CEL document and project each case into the stable scenario view-model — the " +
        "host-independent CRE↔UI contract (roadmap item #2) the scenario-runner UI consumes. Unlike " +
        "`run_decision` (raw evaluation trace), this returns the FULL decision tree (the CRL AST is the " +
        "structural spine — EVERY branch and action, reached or not) overlaid with per-node run state: " +
        "`evaluated` (reached?), `condition` (satisfied + which facts + a `defined as` explanation), " +
        "`guard` provenance, `guardedOut`, `action` (recommend-activity vs use-decision, qualifier, " +
        'produced), `unreachedReason:"preempted"` for first:-short-circuited branches, and a `source` ' +
        "span (filePath + 0-based range) per node for navigation. Pass `path` (absolute .cel); `case` " +
        "renders only one case. Returns { schemaVersion, success, source, caseCount, passCount, failCount, " +
        "errorCount, scenarios:[{case, decision, status, expected, produced, tree, diagnostics}], errors }.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("Absolute path to a .cel file. Imports walk to nearest package.json."),
        case: z
          .string()
          .optional()
          .describe("Optional: render only the named case (default: all cases)."),
      },
    },
    (args) => runRenderScenario(args as { path: string; case?: string }),
  );

  server.registerTool(
    "authoring_kit",
    {
      title: "CRL authoring kit (stage-sliced)",
      description:
        "Return the self-contained authoring knowledge a Knowledge-Engineering agent needs to encode one " +
        "CRL artifact for a given stage: the concept-layer model, authoring rules (decision shapes, guards, " +
        "dispositions incl. PA Approve/Deny determination handling, CEL cases, the verify loop), the grammar " +
        "type allowlists (full + a stage-recommended subset), seven validated reference artifacts embedded " +
        "inline (CDS decision-reference.crl/.cel; composition-reference.crl/.cel using `defined as` boolean " +
        "composition; the shared medical-policy-determination.crl determination library; and the " +
        "pa-determination-reference.crl/.cel prior-authorization exemplar), do/don't examples, and a feedback " +
        "URL. The verify loop states what a green `run_decision` does AND does NOT prove (it is asserted-only " +
        '— it never evaluates `code is`). v1 stage: "local-decision-support" (narrow: local `code is` sources ' +
        "only; shallow: asserted concepts + `defined as` local composition; no `definition is` predicates or " +
        "external sources). Returns the kit JSON incl. `schemaVersion` + a derived `contentHash`. Unknown " +
        "stage → tool error listing valid stages.",
      inputSchema: {
        stage: z
          .string()
          .optional()
          .describe(
            'Authoring stage. Default "local-decision-support". Unknown → error listing valid stages.',
          ),
      },
    },
    (args) => runAuthoringKit(args as { stage?: string }),
  );

  server.registerTool(
    "validate_provenance",
    {
      title: "Validate a provenance artifact (§9)",
      description:
        "Run the §9 provenance validators on a policy's provenance artifact: resolve the .cel's CRL closure, build the " +
        "AST index, derive two-sense coverage, and check referential integrity, content-hash drift, source-acknowledgement, " +
        "linkRequirement (Missed₁), drivesDetermination ancestry, authored-item discipline, §9.1 MN-keyword, §9.2 structural " +
        "mis-tag, and over-reach. A CEL ref to a case lacking an explicit (frozen) `- id is` → provenance-references-unfrozen-case " +
        "(§7). Pass three ABSOLUTE paths. Returns { policyId, policyVersion, diagnostics[], findings:[{kind, severity " +
        "(error|manual-review|warning), message, itemId?, cluster?, ref?, range?}], errorCount, manualReviewCount, " +
        "warningCount, pass }. pass=true ⇔ zero error-severity findings.",
      inputSchema: {
        artifact: z.string().min(1).describe("Absolute path to the provenance artifact JSON."),
        cel: z
          .string()
          .min(1)
          .describe("Absolute path to the policy .cel (imports walk to nearest package.json)."),
        anchor: z.string().min(1).describe("Absolute path to the canonical anchor-source .txt."),
      },
    },
    (args) => runValidateProvenance(args as { artifact: string; cel: string; anchor: string }),
  );

  return server;
}

function runValidateProvenance(args: { artifact: string; cel: string; anchor: string }): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  for (const [label, p] of [
    ["artifact", args.artifact],
    ["cel", args.cel],
    ["anchor", args.anchor],
  ] as const) {
    let stat;
    try {
      stat = statSync(p);
    } catch {
      return {
        content: [{ type: "text", text: `${label} path "${p}" not readable.` }],
        isError: true,
      };
    }
    if (!stat.isFile()) {
      return {
        content: [{ type: "text", text: `${label} path "${p}" is not a file.` }],
        isError: true,
      };
    }
  }
  try {
    const result = validateProvenanceFiles(args.artifact, args.cel, args.anchor);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return {
      content: [{ type: "text", text: `validate_provenance failed: ${(e as Error).message}` }],
      isError: true,
    };
  }
}

function runAuthoringKit(args: { stage?: string }): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  try {
    const kit = getAuthoringKit(args.stage ?? DEFAULT_STAGE);
    return { content: [{ type: "text", text: JSON.stringify(kit, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: (e as Error).message }], isError: true };
  }
}

function runDecision(args: { path: string; case?: string }): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  let stat;
  try {
    stat = statSync(args.path);
  } catch {
    return {
      content: [{ type: "text", text: `Path "${args.path}" not readable.` }],
      isError: true,
    };
  }
  if (!stat.isFile()) {
    return {
      content: [{ type: "text", text: `Path "${args.path}" is not a file.` }],
      isError: true,
    };
  }
  const graph = resolveCelImports(args.path);
  const result = runCel(graph);
  const runs = args.case ? result.runs.filter((r) => r.case === args.case) : result.runs;
  const summary = {
    success: result.success && runs.every((r) => r.status !== "error"),
    caseCount: runs.length,
    passCount: runs.filter((r) => r.status === "pass").length,
    failCount: runs.filter((r) => r.status === "fail").length,
    errorCount: runs.filter((r) => r.status === "error").length,
    runs,
    errors: result.errors,
    importDiagnostics: graph.diagnostics.filter((d) => d.severity === "error"),
  };
  return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
}

function runRenderScenario(args: { path: string; case?: string }): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  let stat;
  try {
    stat = statSync(args.path);
  } catch {
    return {
      content: [{ type: "text", text: `Path "${args.path}" not readable.` }],
      isError: true,
    };
  }
  if (!stat.isFile()) {
    return {
      content: [{ type: "text", text: `Path "${args.path}" is not a file.` }],
      isError: true,
    };
  }
  const graph = resolveCelImports(args.path);
  const vm = renderScenario(graph, args.case ? { case: args.case } : undefined);
  return { content: [{ type: "text", text: JSON.stringify(vm, null, 2) }] };
}

function runEmitCrlFhir(args: {
  path: string;
  includeResources?: boolean;
  date?: string;
  capability?: "shareable" | "computable" | "publishable" | "executable";
}): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  let stat;
  try {
    stat = statSync(args.path);
  } catch {
    return {
      content: [{ type: "text", text: `Path "${args.path}" not readable.` }],
      isError: true,
    };
  }
  if (!stat.isFile()) {
    return {
      content: [{ type: "text", text: `Path "${args.path}" is not a file.` }],
      isError: true,
    };
  }

  const result = emitFhirDefFromPath(args.path, {
    ...(args.date !== undefined ? { date: args.date } : {}),
    ...(args.capability !== undefined ? { capability: args.capability } : {}),
  });
  const summary = {
    success: result.success,
    resourceCount: result.resources.length,
    resourceManifest: result.resources.map((r) => ({
      resourceType: r.resourceType,
      id: (r.resource as { id?: string }).id ?? null,
      relativePath: r.relativePath,
      sourceKind: r.sourceKind,
      sourceName: r.sourceName,
    })),
    errors: result.errors,
    unmatched: result.unmatched,
    importDiagnostics: result.importDiagnostics,
    metadataErrors: result.metadataErrors,
    ...(args.includeResources ? { resources: result.resources } : {}),
  };

  return {
    content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
  };
}

function runEmitCel(args: { path: string; includeResources?: boolean }): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  let stat;
  try {
    stat = statSync(args.path);
  } catch {
    return {
      content: [{ type: "text", text: `Path "${args.path}" not readable.` }],
      isError: true,
    };
  }
  if (!stat.isFile()) {
    return {
      content: [{ type: "text", text: `Path "${args.path}" is not a file.` }],
      isError: true,
    };
  }

  const graph = resolveCelImports(args.path);
  const result = emitCelToFhir(graph);
  const hasErrors = result.diagnostics.some((d) => d.severity === "error");

  const resourceCount = result.emittedCases.reduce((n, c) => n + c.resources.length, 0);
  const summary = {
    success: !hasErrors,
    caseCount: result.emittedCases.length,
    resourceCount,
    caseManifest: result.emittedCases.map((c) => ({
      caseSlug: c.caseSlug,
      librarySlug: c.librarySlug,
      resourceCount: c.resources.length,
    })),
    resourceManifest: result.emittedCases.flatMap((c) =>
      c.resources.map((r) => ({
        caseSlug: c.caseSlug,
        resourceType: r.resourceType,
        id: r.id,
        outputPath: r.outputPath,
      })),
    ),
    diagnostics: result.diagnostics,
    ...(args.includeResources ? { emittedCases: result.emittedCases } : {}),
  };

  return {
    content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
  };
}

export async function main(): Promise<void> {
  // stdout is the MCP JSON-RPC channel. Route the stray console writers to
  // stderr so a debug line (ours or a dependency's) can't corrupt the stream.
  // The transport writes protocol frames to process.stdout directly, not via
  // console, so this is safe. (console.warn is already stderr; included for
  // completeness.)
  console.log = console.info = console.debug = console.warn = console.error;

  const server = createServer();
  const transport = new StdioServerTransport();

  // The host shuts us down by closing stdin (EOF) or signalling. The transport
  // does not exit on its own (it listens only for stdin 'data'/'error'), so
  // wire explicit teardown to avoid a lingering process.
  const exit = () => process.exit(0);
  process.stdin.on("end", exit);
  process.on("SIGTERM", exit);
  process.on("SIGINT", exit);

  await server.connect(transport);
}

// Build-time smoke (dependency-free, fast): proves the bundled CRL functions
// execute standalone. Distinct from `test:mcp`, which exercises the MCP layer.
export function selfTest(fixturePath?: string): number {
  const sample = 'decision "T":\n  - when "C" then recommend activity "A".\n';
  const tok = tokenizeCRL(sample);
  const lexOk = tok.success === true && Array.isArray(tok.result) && tok.result.length > 0;

  let buildOk: boolean;
  let report: Record<string, unknown>;
  if (fixturePath) {
    const built = buildCRL(readFileSync(fixturePath, "utf8"));
    buildOk = built.success === true;
    report = { lexOk, buildOk, fixture: fixturePath };
  } else {
    const built = buildCRL(sample);
    buildOk = typeof built.success === "boolean";
    report = { lexOk, buildRan: buildOk, tokenCount: tok.result?.length ?? 0 };
  }

  const ok = lexOk && buildOk;
  process.stdout.write(JSON.stringify({ ok, ...report }) + "\n");
  return ok ? 0 : 1;
}
