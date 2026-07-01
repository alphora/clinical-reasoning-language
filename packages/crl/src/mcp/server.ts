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
import { emitCrlTwoLane } from "../emit-two-lane";
import type { ImportDiagnostic } from "../imports/types";
import { validateCRLImports } from "../imports/validate";
import { tokenizeCRL, buildCRL, validateCRL, emitCQL } from "../index";
import { validateProvenanceFiles, generateProvenanceFiles } from "../provenance";

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
        "Emit cpg-conformant FHIR Definition resources (ValueSet, CodeSystem, Library, ActivityDefinition, PlanDefinition) from a CRL document. " +
        "A library whose concepts carry local `code is` codes also emits ONE local CodeSystem (url under canonicalBase). When a decision-bearing library is partial-split into a `<lib>` Root + `<lib> Concepts` sibling, that CodeSystem is depends-on'd by the CONCEPTS Library (the codes relocate there) and the Root Library depends-on the Concepts Library; otherwise (single-library emit) it is depends-on'd by that library's own Library resource. One FHIR Library is emitted PER emitted CQL library. " +
        "Closure walks from the file's nearest package.json. Returns a SUMMARY envelope by default to keep tool output small: " +
        "`{ success, resourceCount, resourceManifest:[{resourceType, id, relativePath, sourceKind, sourceName}], errors, unmatched, importDiagnostics, metadataErrors }`. " +
        "Pass `includeResources: true` to also receive the full `resources[]` array (each with the full FHIR JSON). " +
        "Emitted FHIR definitional resources carry `version` (sourced from the npm package.json — CRMI Shareable requires version 1..1) and, at publishable+ capability, a reproducible `date` (resolved from SOURCE_DATE_EPOCH env or package.json `crl.date`, else wall clock). Emitted CQL stays version-less. Default capability is publishable. " +
        "A CRL `first:` decision (ordered/first-match) emits the standard `cqf-applicabilityBehavior` \"any\" extension on a grouping action so a FHIR engine applies the first applicable branch. The menu `any:` qualifier still emits a `crl-logical-switch` extension URL whose StructureDefinition is not yet shipped (its FHIR selection semantics are pending — GitHub #184); strict validators may require an ignore-list for that URL until then. " +
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
    "emit_crl",
    {
      title: "Emit CRL (two-lane: CQL + FHIR)",
      description:
        "Emit BOTH lanes from one .crl in a single call: the layered CQL closure AND the cpg-conformant FHIR Definition resources that reference it — the SAME two-lane composition as the CLI `crl-emit --target fhir-def` (shared `emitCrlTwoLane`, so the two cannot drift). " +
        "USE THIS (not `emit_cql`) for layered / both-representation policies: `emit_cql` is the single-library DIRECT lane and rejects both-representation with a duplicate `define`; `emit_crl` lowers it correctly via the decision/case-feature lane. The FHIR `Library.content` URLs point at the sibling `cql/<name>.cql`, so emitting one lane without the other ships broken references — this returns both together. " +
        "Returns `{ success, cql: { libraries: [{ outputFilename, cql }] }, fhir: { resourceCount, resourceManifest: [{ resourceType, id, relativePath, sourceKind, sourceName }], errors, unmatched }, hardErrors, warnings, filenameCollisions, importDiagnostics, metadataErrors }`. `success` is true iff BOTH lanes are clean AND no CQL filename collides. `cql.libraries` carry the full CQL source (write each to `<out>/cql/<outputFilename>`); pass `includeResources: true` to also get the full FHIR `resources[]` (write each to `<out>/fhir/<ResourceType>/<id>.json`). " +
        "Publishable+ emit needs a publication date — pass `date` (ISO) or set `crl.date` in the artifact package.json.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("Absolute path to a .crl file. Imports walk to the nearest package.json."),
        includeResources: z
          .boolean()
          .optional()
          .describe("Include the full FHIR resources[] array (default false: manifest only)."),
        date: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Publication date (ISO) for reproducible FHIR emit (publishable+). Over SOURCE_DATE_EPOCH / package.json crl.date.",
          ),
        capability: z
          .enum(["shareable", "computable", "publishable", "executable"])
          .optional()
          .describe("CRMI capability level (default publishable). `executable` unsupported (#113)."),
      },
    },
    (args) =>
      runEmitCrl(
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
        "`defined by` it (asserted) OR its `defined as` inference (sem-and/sem-or/sem-not over one concept's representations, closed-world) " +
        "evaluates true (#126); it walks the full decision shape (first:/all:/any:/otherwise + " +
        "`unless`/`only when` guards) and a decision-leaf `result is` passes iff the expected branch is " +
        "in the produced recommendation set. A `use decision` target IS evaluated — bare same-library OR " +
        "qualified cross-library (`\"Lib\".\"Sub\"`) / self-qualified: the sub is recursed in place and its " +
        "determinations bubble up into the produced set (the bare sub-NAME is not produced) — so the oracle " +
        "names the delegated disposition. A cross-library sub's bare criteria resolve in ITS library (qualify a " +
        "CEL fact `defined by \"Lib\".\"C\"` to satisfy one); an unresolved/cyclic target is non-producing. " +
        "Returns { success, caseCount, passCount, " +
        "failCount, errorCount, runs:[{case, decision, status, expected, produced, trace:[{node, nodeId, " +
        "source, ...}], diagnostics}], errors, importDiagnostics }. NOT yet evaluated (deferred): `definition " +
        "is` predicates (count/temporal/value) and `coded from`/external value sets.",
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
        "CRL artifact for a given stage: a `forceModel` (how hard each rule binds — the validator-enforced / " +
        "invariant / default FORCE levels, read first), the concept-layer model, authoring rules (decision " +
        "shapes incl. the composition ladder + chaining necessity, guards, dispositions incl. PA determination " +
        "handling, CEL cases, the verify loop) — each with a machine-readable `clauses` force breakdown, the " +
        "grammar type allowlists (full + a stage-recommended subset), eleven validated reference artifacts " +
        "embedded inline (CDS decision-reference.crl/.cel; criteria-decision-reference.crl/.cel — distinct " +
        "criteria as decision-tree nodes + one `defined as` INFERENCE, #168; the shared " +
        "medical-policy-determination.crl determination library; the pa-determination-reference.crl/.cel " +
        "prior-authorization exemplar; source-delegated-decision-reference.crl/.cel — source-required bare " +
        "same-library `use decision` delegation; and disposition-arbitration-reference.crl/.cel — the " +
        "at-scale sem-not outcome arbitration for overlapping pathways), do/don't examples, a `judgeLens` " +
        "rubric with TWO families (waivers — how to adjudicate the FINAL-mode provenance waivers " +
        "validate_provenance surfaces; and composition — the decision-composition / chaining source-fidelity " +
        "checks invented-determination-boundary / hollowed-criteria / dropped-or-added-criterion that have no " +
        "mechanical home), and a feedback " +
        "URL. The verify loop states what a green `run_decision` does AND does NOT prove (it is asserted-only " +
        '— it never evaluates `code is`). v1 stage: "local-decision-support" (narrow: local `code is` sources ' +
        "only; shallow: asserted concepts + `defined as` inference over one concept's representations; no `definition is` predicates or " +
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
        "(§7). This is the FINAL/strict gate on a COMPLETED artifact — over the in-progress check, use validate_provenance_worklist " +
        "(it re-grades the attribution backlog to remaining-work). FINAL mode ALSO surfaces judge-lens WAIVERS — every escape hatch " +
        "that suppresses a finding (authored over-reach support, ignored span, legal intentional-unlink, non-decision dispositionClass) — " +
        "as uniform manual-review findings (kinds waiver-*) for a Judge to adjudicate; see the authoring_kit `judgeLens` rubric for the " +
        "earned-ness weighting. FINAL mode ALSO runs the cockpit-correspondence gate (kind cockpit-correspondence, integrity/error): per CEL " +
        "case it asserts the cockpit's lit decision-row set (the REAL crlRevealMaps resolution) equals the case's run path — green now " +
        "GUARANTEES the cockpit lights exactly each case's path, not just referential integrity (a case that cannot be compared is reported " +
        "as an explicit unchecked finding, never silently skipped). Pass three ABSOLUTE paths. Returns { policyId, policyVersion, " +
        "diagnostics[], findings:[{kind, severity (error|manual-review|warning), class (attribution|integrity), message, itemId?, " +
        "cluster?, ref?, range?, scrutiny? (routine|scrutinize, on waiver-* only)}], errorCount, manualReviewCount, warningCount, worklistCount, " +
        "waiverCount, waiverScrutinizeCount, pass }. pass=true ⇔ zero error-severity findings (waivers are manual-review — they do NOT fail the " +
        "gate, but waiverScrutinizeCount>0 means the Judge has real adjudication to do; the routine remainder is a rubber-stamp).",
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

  server.registerTool(
    "validate_provenance_worklist",
    {
      title: "Validate a provenance artifact — IN-PROGRESS (worklist mode)",
      description:
        "The IN-PROGRESS / authoring counterpart to validate_provenance. Runs the SAME §9 validators, but in worklist " +
        "mode: attribution-class findings (the COVERAGE backlog — over-reach, uncovered-span, missed-decision) are " +
        "re-graded from error to \"warning\" and reported as REMAINING WORK, not failures — so a fresh, half-attributed " +
        "scaffold does not read as a wall of red. Integrity issues (drift, mistag, mn-keyword, malformed, referential, " +
        "etc.) are STILL surfaced at their native severity and STILL fail. Use this WHILE authoring; use " +
        "validate_provenance for the final/strict gate on a completed artifact. Pass three ABSOLUTE paths. Returns the " +
        "same envelope as validate_provenance plus `worklistCount` (the attribution-backlog tally) and a `remaining` " +
        "note. pass=true ⇔ zero error-severity findings (so a fresh scaffold's attribution backlog passes).",
      inputSchema: {
        artifact: z.string().min(1).describe("Absolute path to the provenance artifact JSON."),
        cel: z
          .string()
          .min(1)
          .describe("Absolute path to the policy .cel (imports walk to nearest package.json)."),
        anchor: z.string().min(1).describe("Absolute path to the canonical anchor-source .txt."),
      },
    },
    (args) =>
      runValidateProvenance(args as { artifact: string; cel: string; anchor: string }, "worklist"),
  );

  server.registerTool(
    "generate_provenance",
    {
      title: "Generate a provenance scaffold (Model A)",
      description:
        "Generate the structurally-derivable MAJORITY of a provenance artifact for a policy from its .cel + its " +
        "canonical anchor-source .txt, leaving the KE only the source-attribution work. Resolves the .cel's CRL " +
        "closure, builds one cluster per covered decision with provisional refs (nodeKind/ownership straight from the " +
        "§5-authoritative index, so they pass V1/V2), and emits NO items — the source-attribution layer is the KE's. " +
        "The anchor .txt is treated as ALREADY canonical: we hash its bytes (sha256) for anchorSource.textHash; we do " +
        "NOT re-canonicalize a .docx here. Pass `existingArtifact` to MERGE the fresh scaffold onto a prior artifact " +
        "(mergeScaffold — preserves the KE's items + linked refs, surfaces every broken link as a merge diagnostic). " +
        "The anchor .txt is treated as ALREADY canonical: we hash its bytes (sha256) for anchorSource.textHash; we do " +
        "NOT re-canonicalize a .docx here. Returns a SUMMARY envelope by default to keep tool output small: " +
        "{ success, policyId, policyVersion, clusterCount, diagnosticCountsByKind, mergeDiagnosticCountsByKind? (only " +
        "when merging), merged }. The `diagnostics`/`mergeDiagnostics` COUNTS describe the FRESH-scaffold worklist " +
        "(the attribution + over-reach BASELINE); when `merged` is true they are the PRE-MERGE baseline, NOT the " +
        "merged artifact's residual. While ATTRIBUTING the scaffold, run `validate_provenance_worklist` on the output " +
        "(the in-progress check — the attribution backlog reads as remaining work, not errors); run the strict " +
        "`validate_provenance` for the FINAL gate on the completed artifact. Pass " +
        "`includeArtifact: true` to also receive the full `artifact` (use the `crl-generate-provenance` CLI's --out for " +
        "the full body in scripts). Bad/missing/unreadable/oversized paths or an unresolved `covers` target → a tool " +
        "error. NOTE: generate succeeding does NOT mean the artifact is complete — the diagnostics ARE the KE's worklist. " +
        "`clusterBy` (default \"decision\") selects the clustering strategy: \"decision\" emits one cluster per covered " +
        "decision (the per-case CEL pass attaches frozen cases to each). #175: the default mode is now CHAIN-AWARE — a " +
        "case whose branch result `D is X` fires X in a SUB-decision D delegates to (`use decision`) is attached to that " +
        "SUB's cluster + arm via the run path, instead of orphaning the sub-clusters; a NON-chained case is unchanged. A " +
        "chained case that can't be clustered defers with a diagnostic (never a guessed attach): `ambiguous-cel-branch` " +
        "(X fired in ≥2 distinct subs), or `cel-result-run-mismatch` (the run produced no X, or the chained case's run " +
        "path is unavailable/ungroundable), or `unfrozen-case`. \"disposition-path\" instead renders the CEL and " +
        "emits one cluster per distinct RUN PATH (decision-node refs ONLY) + one policy-owned-leaf coverage cluster — a " +
        "scaffold that is correspondence-correct BY CONSTRUCTION (it passes validate_provenance's FINAL cockpit gate with " +
        "zero mismatch before any items are attached). A same-lib inlined `use decision` chain RESOLVES (the run path is " +
        "decomposed into each sub's standalone rows — #175); a case that can't be path-clustered (unfrozen, name-collision, " +
        "no/unresolved decision, no produced action, a run error, or a cross-lib / genuinely-ungroundable run) is surfaced " +
        "as a deferred-disposition-path diagnostic, never silently dropped. Changing clusterBy is a STRUCTURAL mode switch, " +
        "not a safe `existingArtifact` regen (a cross-mode merge orphans the prior mode's clusters).",
      inputSchema: {
        cel: z
          .string()
          .min(1)
          .describe("Absolute path to the policy .cel (imports walk to nearest package.json)."),
        anchor: z
          .string()
          .min(1)
          .describe(
            "Absolute path to the canonical anchor-source .txt (already canonicalized; its bytes are hashed).",
          ),
        policyVersion: z
          .string()
          .optional()
          .describe('Policy version stamped into the artifact (default "1").'),
        existingArtifact: z
          .string()
          .optional()
          .describe(
            "Absolute path to an existing provenance artifact JSON to MERGE the fresh scaffold onto (mergeScaffold). Omit to emit a fresh scaffold.",
          ),
        includeArtifact: z
          .boolean()
          .optional()
          .describe(
            "Include the full `artifact` JSON in the result. Default false (summary only — use the CLI's --out for the full body).",
          ),
        clusterBy: z
          .enum(["decision", "disposition-path"])
          .optional()
          .describe(
            'Clustering strategy. Default "decision" (one cluster per covered decision). "disposition-path" emits one cluster per distinct run path (decision-node refs only) + a policy-owned-leaf coverage cluster — correspondence-correct by construction. Changing it is a structural mode switch, not a safe regen.',
          ),
      },
    },
    (args) =>
      runGenerateProvenance(
        args as {
          cel: string;
          anchor: string;
          policyVersion?: string;
          existingArtifact?: string;
          includeArtifact?: boolean;
          clusterBy?: "decision" | "disposition-path";
        },
      ),
  );

  return server;
}

/** Tally diagnostics by `kind` into a plain record (sorted-insertion is irrelevant for an object; JSON readers don't rely on key order). */
function countsByKind(diags: ReadonlyArray<{ kind: string }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of diags) out[d.kind] = (out[d.kind] ?? 0) + 1;
  return out;
}

function runGenerateProvenance(args: {
  cel: string;
  anchor: string;
  policyVersion?: string;
  existingArtifact?: string;
  includeArtifact?: boolean;
  clusterBy?: "decision" | "disposition-path";
}): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  // Required cel + anchor must be readable files (each ≤ MAX_INPUT_BYTES); the optional existingArtifact (when given)
  // too. Mirrors runValidateProvenance's file checks + the other file-reading tools' size cap.
  const toCheck: Array<[string, string]> = [
    ["cel", args.cel],
    ["anchor", args.anchor],
  ];
  if (args.existingArtifact) toCheck.push(["existingArtifact", args.existingArtifact]);
  for (const [label, p] of toCheck) {
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
    if (stat.size > MAX_INPUT_BYTES) {
      return {
        content: [
          {
            type: "text",
            text: `${label} file too large: ${stat.size} bytes > ${MAX_INPUT_BYTES}.`,
          },
        ],
        isError: true,
      };
    }
  }
  try {
    const r = generateProvenanceFiles(args.cel, args.anchor, {
      ...(args.policyVersion !== undefined ? { policyVersion: args.policyVersion } : {}),
      ...(args.existingArtifact !== undefined
        ? { existingArtifactPath: args.existingArtifact }
        : {}),
      ...(args.clusterBy !== undefined ? { clusterBy: args.clusterBy } : {}),
    });
    // SUMMARY by default (matches emit_crl_fhir / emit_cel / render_scenario): counts, not the full artifact. The
    // diagnostic counts are the FRESH-scaffold BASELINE; when merged they are PRE-MERGE — steer to validate_provenance.
    const summary = {
      success: true,
      policyId: r.policyId,
      policyVersion: r.policyVersion,
      clusterCount: r.artifact.clusters.length,
      diagnosticCountsByKind: countsByKind(r.diagnostics),
      ...(r.mergeDiagnostics !== undefined
        ? { mergeDiagnosticCountsByKind: countsByKind(r.mergeDiagnostics) }
        : {}),
      merged: r.merged,
      ...(r.merged
        ? {
            note: "diagnostics are the pre-merge baseline; run validate_provenance_worklist on the output for the in-progress residual (or validate_provenance for the final/strict gate).",
          }
        : {}),
      ...(args.includeArtifact ? { artifact: r.artifact } : {}),
    };
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
  } catch (e) {
    return {
      content: [{ type: "text", text: `generate_provenance failed: ${(e as Error).message}` }],
      isError: true,
    };
  }
}

function runValidateProvenance(
  args: { artifact: string; cel: string; anchor: string },
  mode: "worklist" | "final" = "final",
): {
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
    if (stat.size > MAX_INPUT_BYTES) {
      return {
        content: [
          { type: "text", text: `${label} file too large: ${stat.size} bytes > ${MAX_INPUT_BYTES}.` },
        ],
        isError: true,
      };
    }
  }
  try {
    const result = validateProvenanceFiles(args.artifact, args.cel, args.anchor, mode);
    // In worklist mode add a `remaining` note steering the reader: the worklistCount attribution findings are remaining
    // work (graded "warning"), not errors; integrity findings still surface. The base envelope already carries worklistCount.
    const payload =
      mode === "worklist"
        ? {
            ...result,
            remaining:
              `${result.worklistCount} attribution finding(s) remain as warnings (the coverage backlog — ` +
              `remaining work, not errors); integrity findings are still reported at native severity. ` +
              `Use validate_provenance for the final/strict gate.`,
          }
        : result;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  } catch (e) {
    return {
      content: [
        {
          type: "text",
          text: `${mode === "worklist" ? "validate_provenance_worklist" : "validate_provenance"} failed: ${(e as Error).message}`,
        },
      ],
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

function runEmitCrl(args: {
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

  // Same shared two-lane composition as the CLI `--target fhir-def`.
  const two = emitCrlTwoLane(args.path, {
    ...(args.date !== undefined ? { date: args.date } : {}),
    ...(args.capability !== undefined ? { capability: args.capability } : {}),
  });

  const payload = {
    success: two.success,
    cql: {
      libraries: two.cqlLibraries,
    },
    fhir: {
      resourceCount: two.fhir.resources.length,
      resourceManifest: two.fhir.resources.map((r) => ({
        resourceType: r.resourceType,
        id: (r.resource as { id?: string }).id ?? null,
        relativePath: r.relativePath,
        sourceKind: r.sourceKind,
        sourceName: r.sourceName,
      })),
      errors: two.fhir.errors,
      unmatched: two.fhir.unmatched,
      ...(args.includeResources ? { resources: two.fhir.resources } : {}),
    },
    hardErrors: two.hardErrors,
    warnings: two.warnings,
    filenameCollisions: two.filenameCollisions,
    importDiagnostics: two.fhir.importDiagnostics,
    metadataErrors: two.fhir.metadataErrors,
  };

  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
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
