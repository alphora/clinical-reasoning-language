import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, statSync } from "node:fs";
import { tokenizeCRL, buildCRL, validateCRL, emitCQL } from "@smile-digital-health/crl";

// Caps the CRL SOURCE (input) size. Response size scales with this — there is
// no separate output cap, but bounding input keeps responses bounded enough.
const MAX_INPUT_BYTES = 1_000_000;

type CrlFn = (input: string) => { success: boolean; result?: unknown; errors?: unknown };
type ToolArgs = { code?: string; path?: string };
type ValidateArgs = ToolArgs & { soft?: boolean };
type EmitArgs = ToolArgs & { libraryName?: string; libraryVersion?: string };

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
      "Provide exactly one of `code` (inline CRL) or `path` (a .crl file), not both or neither."
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
    const msg = e instanceof ToolInputError ? e.message : `Unexpected error: ${(e as Error).message}`;
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
    const msg = e instanceof ToolInputError ? e.message : `Unexpected error: ${(e as Error).message}`;
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
  const result = emitCQL(source, {
    libraryName: args.libraryName,
    libraryVersion: args.libraryVersion,
  });
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

function runValidate(args: ValidateArgs) {
  let source: string;
  try {
    source = resolveSource(args);
  } catch (e) {
    const msg = e instanceof ToolInputError ? e.message : `Unexpected error: ${(e as Error).message}`;
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
  // Strip the (potentially large) AST from the response — the agent only
  // needs the diagnostic envelope, not the full tree. Callers that need the
  // tree should use `build_crl_ast` separately.
  const full = validateCRL(source, { soft: args.soft === true });
  const slim = { success: full.success, errors: full.errors, warnings: full.warnings };
  return { content: [{ type: "text" as const, text: JSON.stringify(slim) }] };
}

const inputSchema = {
  code: z
    .string()
    .optional()
    .describe("Inline CRL source text. Provide this OR `path`, not both."),
  path: z
    .string()
    .optional()
    .describe(
      "Path to a .crl file to read (absolute recommended; relative resolves against the server's working directory). Provide this OR `code`, not both."
    ),
};

function createServer(): McpServer {
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
    (args) => runTool(tokenizeCRL, args)
  );

  server.registerTool(
    "build_crl_ast",
    {
      title: "Build CRL AST",
      description:
        "Parse CRL source and build its Abstract Syntax Tree. Pass exactly one of `code` (inline) or `path` (file). " +
        "Returns a ParseResult JSON envelope: { success: boolean; result?: <AST>; errors?: CRLError[] }. " +
        "success:true means lexing/parsing/AST construction succeeded — it does NOT perform semantic validation. " +
        "The AST root is { type: 'CRL', identifier?, statements[], location } (identifier is present only when the document has a header).",
      inputSchema,
    },
    (args) => runTool(buildCRL, args)
  );

  server.registerTool(
    "validate_crl",
    {
      title: "Validate CRL",
      description:
        "Validate a CRL document end-to-end: lex, parse, build AST, then run semantic checks (name uniqueness, " +
        "reference resolution, cycle detection, action uniqueness). Pass exactly one of `code` (inline) or " +
        "`path` (file), plus an optional `soft` flag. " +
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
    (args) => runValidate(args as ValidateArgs)
  );

  server.registerTool(
    "emit_cql",
    {
      title: "Emit CQL",
      description:
        "Emit CQL from a CRL document. Pass exactly one of `code` (inline) or `path` (file), plus optional " +
        "`libraryName` and `libraryVersion`. " +
        "Returns { success, result?, errors? }: on success, `result` is the generated CQL text targeting " +
        "the CRLPatterns library (cql/src/CRLPatterns.cql). Refinement-vs-boolean composition is detected " +
        "per-operand; stub valuesets (empty URL) become parameter declarations; terminology/concept name " +
        "collisions are disambiguated with a ' Code' / ' ValueSet' suffix. The output may still need a CQL " +
        "compiler to validate end-to-end.",
      inputSchema: {
        ...inputSchema,
        libraryName: z.string().optional().describe("Library name for the emitted CQL (default: GeneratedFromCRL)."),
        libraryVersion: z.string().optional().describe("Library version (default: 0.1.0)."),
      },
    },
    (args) => runEmit(args as EmitArgs)
  );

  return server;
}

async function main(): Promise<void> {
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
function selfTest(fixturePath?: string): number {
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

if (process.argv.includes("--selftest")) {
  const fi = process.argv.indexOf("--file");
  process.exit(selfTest(fi !== -1 ? process.argv[fi + 1] : undefined));
} else {
  main().catch((e) => {
    console.error("crl mcp server failed to start:", e);
    process.exit(1);
  });
}
