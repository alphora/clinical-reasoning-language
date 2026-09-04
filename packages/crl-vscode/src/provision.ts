import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// Project-scoped provisioning for Claude Code, mirroring the vibe-tools extension:
// merge a `crl` stdio server into <workspace>/.mcp.json, and inject/refresh a
// managed instructions block in <workspace>/CLAUDE.md. Pure (node fs only) — no
// `vscode` dependency — so it is unit-testable against a temp workspace.

export const SERVER_KEY = "crl";
const BLOCK_START_PREFIX = "<!-- crl-tools-start";
const BLOCK_END = "<!-- crl-tools-end -->";
// Ownership fingerprint: the VS Code install dir is `<publisher>.crl-language-support-<version>`,
// so our server path contains this regardless of version. Used by remove() to
// avoid deleting a user's unrelated `crl` server.
const OWNERSHIP_MARKER = "crl-language-support";

export interface ProvisionContext {
  workspaceRoot: string;
  serverScriptPath: string;
  /**
   * Whether `emit_results` may spawn a JVM — from the MACHINE-scoped `crl.enableResults` setting.
   *
   * ⚠ This is the opt-in itself, not a hint about it. It is written into the server block’s `env`,
   * which the client hands DIRECTLY to the spawned process — so it does not depend on the process
   * inheriting anything. See ENABLE_RESULTS_ENV below for why that distinction is the whole fix.
   */
  enableResults: boolean;
}

export type McpOutcome = "created" | "updated" | "unchanged" | "removed";
export type MdOutcome = "created" | "updated" | "appended" | "unchanged" | "skipped" | "removed";

export interface ProvisionResult {
  mcp: McpOutcome;
  claudeMd: MdOutcome;
  warnings: string[];
}

export interface ProvisionTarget {
  readonly id: string;
  readonly displayName: string;
  apply(ctx: ProvisionContext): ProvisionResult;
  remove(ctx: ProvisionContext): ProvisionResult;
}

function atomicWrite(file: string, content: string): void {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, content, "utf8");
  // rename replaces the target (atomic on POSIX; replaces on Windows too, though
  // it can throw EPERM/EBUSY if the target is held open by another process).
  renameSync(tmp, file);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// --- .mcp.json ---

function readMcpRoot(file: string): { raw: string; root: Record<string, unknown> } {
  if (!existsSync(file)) return { raw: "", root: { mcpServers: {} } };
  const raw = readFileSync(file, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(".mcp.json is not valid JSON; refusing to modify it. Fix or remove it and retry.");
  }
  if (!isPlainObject(parsed)) {
    throw new Error(".mcp.json root is not a JSON object; refusing to modify it.");
  }
  if (parsed.mcpServers !== undefined && !isPlainObject(parsed.mcpServers)) {
    throw new Error('.mcp.json "mcpServers" is not an object; refusing to modify it.');
  }
  return { raw, root: parsed };
}

/** The variable the MCP server gates result production on. Must match `server.ts`. */
export const ENABLE_RESULTS_ENV = "CRL_ENABLE_RESULTS";

/**
 * ⭐ WHY THE OPT-IN IS WRITTEN HERE AND NOT LEFT TO THE USER’S ENVIRONMENT.
 *
 * The server reads `CRL_ENABLE_RESULTS` from its own process environment, and telling a human to put
 * it there is advice that CANNOT BE RELIABLY FOLLOWED on any platform:
 *
 *   Windows  `setx` writes the registry; a process launched from a window that predates it never
 *            re-reads it, so "set it and restart the client" silently does nothing.
 *   macOS    a GUI-launched editor inherits launchd’s environment, not your shell rc exports.
 *   Linux    a desktop-launched app inherits the session environment, not your shell rc.
 *
 * Reported by the IEHP knowledge-engineering project, who did exactly what our error message said and
 * were told to do it again — the worst failure available, because the instruction and the remedy are
 * the same sentence. It is NOT a Windows bug; Windows is just the spelling they hit.
 *
 * `.mcp.json` `env` is handed DIRECTLY to the spawned process by the client. No inheritance chain
 * exists to break, on any OS. And it keeps the property the env var was chosen for: `.mcp.json` is
 * The setting is MACHINE-scoped, so it cannot be set from `.vscode/settings.json`.
 *
 * ⚠⚠ DO NOT DESCRIBE THIS AS "a repository cannot opt a user into running a JVM". That claim was made
 * here and it is not enforced. It rests on `.mcp.json` being machine-local, and NOTHING in this
 * extension puts it in a user's `.gitignore` or checks that it is ignored — that is true of the CRL
 * repo and was generalised to everyone else's. A project that commits `.mcp.json` commits the flag,
 * and the next clone spawns a JVM without its owner ever setting anything. Machine scope also does
 * not block a `devcontainer.json` `customizations.vscode.settings` block, which seeds the settings of
 * the machine it creates; `crl.autoProvision` has the same hole.
 *
 * What IS true: the flag is never read from workspace SETTINGS, and it is never synthesised from
 * repository content. Say that, and treat `.mcp.json` as commit-sensitive.
 */
export function mergeEnableResultsEnv(
  existingEnv: unknown,
  enable: boolean,
): Record<string, unknown> | undefined {
  // ⚠ THROW, do not silently pass through. Returning the value untouched preserved the user’s file
  // but wrote NOTHING — so turning the setting on produced `unchanged`, the watcher said "restart
  // your MCP client to apply", and nothing had been applied. That is verbatim the "I did what you
  // said and nothing happened" failure this whole setting exists to remove.
  //
  // The refuse-to-clobber posture for the server entry is a THROW (see `mergeMcp`), so this now
  // matches it rather than merely citing it. The caller catches and reports.
  if (existingEnv !== undefined && !isPlainObject(existingEnv)) {
    throw new Error(
      `.mcp.json "${SERVER_KEY}" has an \`env\` that is not an object; refusing to overwrite it. ` +
        "Fix or remove it, then toggle crl.enableResults again.",
    );
  }
  const env: Record<string, unknown> = { ...(isPlainObject(existingEnv) ? existingEnv : {}) };
  if (enable) env[ENABLE_RESULTS_ENV] = "1";
  else delete env[ENABLE_RESULTS_ENV];
  return Object.keys(env).length > 0 ? env : undefined;
}

function mergeMcp(ctx: ProvisionContext): McpOutcome {
  const file = join(ctx.workspaceRoot, ".mcp.json");
  const preExisting = existsSync(file);
  const { raw, root } = readMcpRoot(file);

  const servers = isPlainObject(root.mcpServers) ? { ...root.mcpServers } : {};
  // We own the `crl` key, but refuse to clobber a present-but-non-object value
  // (consistent with the refuse-to-touch posture for the root/mcpServers above).
  if (SERVER_KEY in servers && !isPlainObject(servers[SERVER_KEY])) {
    throw new Error(`.mcp.json "${SERVER_KEY}" entry is not an object; refusing to overwrite it.`);
  }
  const existing = isPlainObject(servers[SERVER_KEY]) ? (servers[SERVER_KEY] as Record<string, unknown>) : {};

  // Spread-then-override: preserve unknown fields + a user-pinned `command`; force `type` and `args`.
  servers[SERVER_KEY] = {
    ...existing,
    type: "stdio",
    command: typeof existing.command === "string" ? existing.command : "node",
    args: [ctx.serverScriptPath],
  };
  const env = mergeEnableResultsEnv(existing.env, ctx.enableResults);
  if (env === undefined) delete (servers[SERVER_KEY] as Record<string, unknown>).env;
  else (servers[SERVER_KEY] as Record<string, unknown>).env = env;
  root.mcpServers = servers;

  // Full-file string compare (matching vibe-tools). A user file authored with a
  // different key order or CRLF endings triggers one benign one-time rewrite to
  // our canonical LF form; subsequent applies are stable.
  const after = JSON.stringify(root, null, 2) + "\n";
  if (preExisting && raw.trim() === after.trim()) return "unchanged";
  atomicWrite(file, after);
  return preExisting ? "updated" : "created";
}

function ownsMcpEntry(entry: unknown): boolean {
  if (!isPlainObject(entry) || !Array.isArray(entry.args)) return false;
  const first = entry.args[0];
  if (typeof first !== "string") return false;
  const norm = first.replace(/\\/g, "/"); // normalize Windows separators
  return norm.includes(OWNERSHIP_MARKER) && norm.endsWith("mcp-server.js");
}

function removeMcp(ctx: ProvisionContext, warnings: string[]): McpOutcome {
  const file = join(ctx.workspaceRoot, ".mcp.json");
  if (!existsSync(file)) return "unchanged";
  const { raw, root } = readMcpRoot(file);
  if (!isPlainObject(root.mcpServers) || !(SERVER_KEY in root.mcpServers)) return "unchanged";

  if (!ownsMcpEntry(root.mcpServers[SERVER_KEY])) {
    warnings.push(`.mcp.json "${SERVER_KEY}" server is not managed by this extension; left unchanged.`);
    return "unchanged";
  }
  const servers = { ...root.mcpServers };
  delete servers[SERVER_KEY];
  root.mcpServers = servers;
  const after = JSON.stringify(root, null, 2) + "\n";
  if (raw.trim() === after.trim()) return "unchanged";
  atomicWrite(file, after);
  return "removed";
}

// --- CLAUDE.md managed block ---

/**
 * Rewrite ONLY the `crl` server block in `.mcp.json`. Nothing else.
 *
 * ⚠ DELIBERATELY NARROWER THAN `apply`. This exists for the `crl.enableResults` watcher, where the
 * user changed a SETTING and did not ask us to do anything. Routing that through the full provisioning
 * path would also rewrite CLAUDE.md and apply global highlighting settings, and would surface
 * error/warning toasts from inside — all as a side effect of ticking a checkbox. A settings change
 * gets the one write it implies and no more.
 *
 * Throws like `mergeMcp` does, so a malformed `.mcp.json` refuses loudly rather than being clobbered;
 * the caller decides how quiet to be about it.
 */
export function refreshMcpEnv(ctx: ProvisionContext): McpOutcome {
  return mergeMcp(ctx);
}

export function crlBlockBody(): string {
  return `## Clinical Reasoning Language (CRL) tools

This workspace has the CRL parser available to you as MCP tools (server \`crl\`):

- \`tokenize_crl\` — lex CRL source into tokens.
- \`build_crl_ast\` — parse CRL source and build its Abstract Syntax Tree.

Use these whenever the user is working with \`.crl\` files or Clinical Reasoning Language — to check syntax, inspect structure, or answer questions about a CRL document. Prefer \`build_crl_ast\` for structure/meaning; use \`tokenize_crl\` for token-level questions.

Each tool takes exactly one of \`code\` (inline CRL text) or \`path\` (a \`.crl\` file — pass an **absolute** path; relative paths resolve against the server's working directory, not the workspace).

On valid input a tool returns a JSON \`ParseResult\` envelope — always check \`success\` first, and on \`success: false\` read \`errors[]\` and report them to the user. See each tool's own description for the exact result and error shape. Bad arguments or an unreadable/oversized file come back as a tool error (fix the input and retry). \`build_crl_ast\` success means parsing/AST construction succeeded — it does NOT perform semantic validation.`;
}

// The managed block carries NO version in its marker (disc 371): a `version="X"` attribute meant every extension version bump
// rewrote the block → git churn in a committed CLAUDE.md. The block is now refreshed by CONTENT diff (below), so it changes
// only when the body text actually changes. `findBlock` still locates a legacy versioned marker via the prefix, so an existing
// `<!-- crl-tools-start version="…" -->` migrates to the versionless form on the next provision — a ONE-TIME rewrite, then stable.
const START_MARKER = `${BLOCK_START_PREFIX} -->`;

function renderBlock(): string {
  return `${START_MARKER}\n${crlBlockBody()}\n${BLOCK_END}`;
}

// Returns the indices of the single well-formed managed block, or a marker error.
function findBlock(content: string): { start: number; end: number } | "none" | "malformed" {
  const startCount = content.split(BLOCK_START_PREFIX).length - 1;
  const endCount = content.split(BLOCK_END).length - 1;
  const start = content.indexOf(BLOCK_START_PREFIX);
  const end = content.indexOf(BLOCK_END);
  if (start === -1 && end === -1) return "none";
  if (start === -1 || end === -1 || startCount > 1 || endCount > 1 || end < start) return "malformed";
  return { start, end: end + BLOCK_END.length };
}

function writeClaudeMd(ctx: ProvisionContext, warnings: string[]): MdOutcome {
  const file = join(ctx.workspaceRoot, "CLAUDE.md");
  const block = renderBlock();

  if (!existsSync(file)) {
    atomicWrite(file, block + "\n");
    return "created";
  }
  const content = readFileSync(file, "utf8");
  const loc = findBlock(content);
  if (loc === "malformed") {
    warnings.push("CLAUDE.md has malformed/duplicate crl-tools markers; left unchanged. Repair manually.");
    return "skipped";
  }
  if (loc === "none") {
    const sep = content.endsWith("\n") ? "\n" : "\n\n";
    atomicWrite(file, content + sep + block + "\n");
    return "appended";
  }
  // Content-idempotent: rewrite ONLY when the block text actually differs — a version bump alone never touches CLAUDE.md.
  const existing = content.slice(loc.start, loc.end);
  if (existing === block) return "unchanged";
  atomicWrite(file, content.slice(0, loc.start) + block + content.slice(loc.end));
  return "updated";
}

function removeClaudeMd(ctx: ProvisionContext, warnings: string[]): MdOutcome {
  const file = join(ctx.workspaceRoot, "CLAUDE.md");
  if (!existsSync(file)) return "unchanged";
  const content = readFileSync(file, "utf8");
  const loc = findBlock(content);
  if (loc === "none") return "unchanged";
  if (loc === "malformed") {
    warnings.push("CLAUDE.md has malformed/duplicate crl-tools markers; left unchanged. Repair manually.");
    return "skipped";
  }
  // Join only at the seam — don't touch blank lines elsewhere in the user's file.
  const head = content.slice(0, loc.start).replace(/\s+$/, "");
  const tail = content.slice(loc.end).replace(/^\s+/, "");
  const joined = head && tail ? `${head}\n\n${tail}` : head + tail;
  atomicWrite(file, joined.length === 0 || joined.endsWith("\n") ? joined : joined + "\n");
  return "removed";
}

// --- consent-based provisioning: the pure decision layer (disc 369) ---

export type AutoProvisionMode = "prompt" | "always" | "never";
export type ProvisionDecision = "installed" | "never";

/** Resolve the tri-state provisioning mode from the raw config value. Back-compat: the setting was a boolean (default true),
 *  so an existing `true`/`false` in a user's settings.json still resolves — `true`→"always" (preserves the observed silent-
 *  provision behavior the old default gave them; note most users never explicitly chose it), `false`→"never". Any
 *  unrecognized value → the safe "prompt" default. */
export function resolveAutoProvisionMode(raw: unknown): AutoProvisionMode {
  if (raw === true) return "always";
  if (raw === false) return "never";
  if (raw === "always" || raw === "never" || raw === "prompt") return raw;
  return "prompt";
}

/** Decide what activation should do, from the mode + the per-workspace memento decision + whether THIS machine already
 *  provisioned the workspace. `"check-relevance"` means the answer depends on whether the workspace actually contains CRL
 *  files (the caller computes that LAZILY, only then). A per-workspace decision (installed/never) WINS over the global mode —
 *  the mode governs only UNDECIDED workspaces (so `crl.remove`→"never" can't be silently undone by mode "always", and an
 *  installed workspace keeps refreshing under mode "never"). */
export function decideProvisioning(
  mode: AutoProvisionMode,
  decision: ProvisionDecision | undefined,
  alreadyProvisioned: boolean,
): "silent" | "skip" | "check-relevance" {
  if (decision === "never") return "skip"; // an explicit per-workspace "never" beats any mode (incl. "always")
  if (decision === "installed") return "silent"; // …and an explicit "installed" keeps refreshing regardless of mode
  if (mode === "never") return "skip";
  if (mode === "always") return "silent";
  // mode "prompt", undecided:
  if (alreadyProvisioned) return "silent"; // MIGRATION: this machine already provisioned it silently → refresh, don't re-prompt
  return "check-relevance"; // undecided + not provisioned here → the caller checks for CRL files, then offer/skip
}

/** Does THIS machine's `.mcp.json` already carry the owned `crl` server pointing at `expectedServerPath`? Distinguishes our
 *  own past silent provisioning (migration → don't re-prompt) from a teammate's COMMITTED entry on a fresh clone (whose args
 *  path is the AUTHOR's globalStorage → NOT provisioned here → should be offered). Separator-normalized compare; a malformed
 *  or absent `.mcp.json` → false. */
export function isProvisionedByPath(workspaceRoot: string, expectedServerPath: string): boolean {
  const file = join(workspaceRoot, ".mcp.json");
  if (!existsSync(file)) return false;
  let root: Record<string, unknown>;
  try {
    root = readMcpRoot(file).root;
  } catch {
    return false; // malformed → not "provisioned by us" (the apply path surfaces the refuse-to-touch error if the user opts in)
  }
  const servers = isPlainObject(root.mcpServers) ? root.mcpServers : {};
  const entry = servers[SERVER_KEY];
  if (!ownsMcpEntry(entry)) return false;
  const first = (entry as { args: unknown[] }).args[0];
  if (typeof first !== "string") return false;
  const norm = (p: string): string => p.replace(/\\/g, "/");
  return norm(first) === norm(expectedServerPath);
}

export const claudeCodeTarget: ProvisionTarget = {
  id: "claude-code",
  displayName: "Claude Code",

  apply(ctx) {
    if (!existsSync(ctx.serverScriptPath)) {
      throw new Error(`MCP server bundle missing at ${ctx.serverScriptPath}; the extension build may be incomplete.`);
    }
    const warnings: string[] = [];
    // MCP first; mergeMcp throws on refuse-to-touch, so a malformed .mcp.json
    // aborts before we advertise tools in CLAUDE.md that aren't registered.
    const mcp = mergeMcp(ctx);
    const claudeMd = writeClaudeMd(ctx, warnings);
    return { mcp, claudeMd, warnings };
  },

  remove(ctx) {
    const warnings: string[] = [];
    const mcp = removeMcp(ctx, warnings);
    const claudeMd = removeClaudeMd(ctx, warnings);
    return { mcp, claudeMd, warnings };
  },
};
