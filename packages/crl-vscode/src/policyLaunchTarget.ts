import { resolveCelSuite } from "@smile-digital-health/crl";
// #244 — resolving a LAUNCH ARGUMENT into a policy `.cel` to open Medical Validation (or the cockpit) on.
//
// Who calls the commands with an argument:
//   - KELP's "Open in Medical Validation" flyout button, which does `executeCommand(cmd, folderUri)` with ONE
//     `vscode.Uri` for the ENTITY FOLDER of the clicked row (e.g. `<artifact>/src/medical-validation`). Their contract
//     is fixed: one folder Uri, never a `.cel`, never an id — KELP hands off a folder and never learns our target shape.
//   - VS Code itself, for the `editor/title` buttons both commands contribute: it passes the active editor's resource
//     Uri. This is PRE-EXISTING — the old zero-arg closures silently dropped it. Its scheme is not always `file`
//     (a diff editor surfaces e.g. `git:`), which is why a non-file Uri means "no usable target", NOT an error.
//
// The agreed error policy (with KELP): an argument supplied but UNRESOLVABLE fails loudly, naming the path — a silent
// fall-back to the workspace picker would turn a mis-wired caller into "the integration is flaky". No argument at all
// (palette, keybinding) keeps the picker: there is no target to fail on.
//
// vscode-free on purpose (a structural Uri shape, not the class) so the whole policy is unit-testable; the cockpit keeps
// only the `showErrorMessage` / QuickPick presentation.
import { findPolicySrcNear, isFile } from "./provenanceFindings";
import { isAbsolute, join, resolve } from "node:path";
import { existsSync } from "node:fs";

/** The structural shape we accept for a `vscode.Uri` — matching the class by duck-type keeps this module vscode-free. */
interface UriLike {
  scheme: string;
  fsPath: string;
}

function isUriLike(v: unknown): v is UriLike {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { scheme?: unknown }).scheme === "string" &&
    typeof (v as { fsPath?: unknown }).fsPath === "string"
  );
}

export type LaunchTarget =
  /** No usable argument — run today's behaviour (active editor, else the workspace-wide picker). */
  | { kind: "no-target" }
  /** Resolved to exactly one `.cel`: open/retarget on it directly. */
  | { kind: "cel"; celPath: string }
  /** Several `.cel`s under one policy — a genuine ambiguity only a human can settle. Pick among THESE (not the workspace). */
  | { kind: "ambiguous"; policySrc: string; cels: string[] }
  /** An argument was supplied and could not be resolved. Do NOT fall back to the picker — show `detail`.
   *  `detail` is SURFACE-NEUTRAL: this resolver serves both the cockpit and Medical Validation, so the caller prefixes
   *  it with the panel actually being opened rather than the message naming the wrong one (#244 impl review). */
  | { kind: "error"; detail: string };

/**
 * Resolve a command argument into something to open.
 *
 * Classification is by PATH STRING, not by `stat`, for the folder case: the MV entity folder KELP anchors on is created
 * lazily (on the first saved verdict), so a policy that has never been reviewed has no `medical-validation/` directory
 * on disk — and that is exactly the first-use flow this feature exists for. Requiring the anchor to exist would fail
 * loudly on a perfectly resolvable target. A supplied `.cel`, by contrast, must really be a file.
 */
export function resolveLaunchTarget(arg: unknown): LaunchTarget {
  // Absent → the picker. `null` counts as absent too: a caller passing it is signalling "no selection", which is what a
  // menu with nothing selected naturally produces. Erroring on it would break a plausible caller to catch a mis-wire
  // that `undefined` already covers. (Reviewed and kept deliberately — #244 impl review.)
  if (arg === undefined || arg === null) return { kind: "no-target" };

  let raw: string;
  if (isUriLike(arg)) {
    // A non-file Uri is not a local path we can resolve at all (the diff-editor case). Treat it as "no target" so the
    // editor/title button keeps behaving exactly as it did before #244, rather than newly erroring.
    if (arg.scheme !== "file") return { kind: "no-target" };
    raw = arg.fsPath;
  } else if (typeof arg === "string") {
    raw = arg;
  } else {
    // A caller passed something structured that isn't a Uri — a mis-wire we must not paper over with a picker.
    return { kind: "error", detail: `unsupported launch argument (${typeof arg}).` };
  }

  if (raw.trim() === "") return { kind: "error", detail: "the launch argument was an empty path." };
  // Normalize before walking: trailing separators and `.`/`..` segments would otherwise skew the ancestor walk. A relative
  // string resolves against the extension host's cwd, which is not meaningful — require absolute and say so.
  if (!isAbsolute(raw)) return { kind: "error", detail: `the launch path must be absolute: ${raw}` };
  const path = resolve(raw);

  // REFACTOR:grounded: one policy's complete MV suite is one launch target.
  const policySrc = findPolicySrcNear(path);
  if (!policySrc) return { kind: "error", detail: `No policy src/ found near ${path}.` };
  if (path.toLowerCase().endsWith(".cel") && !isFile(path)) return { kind: "error", detail: `No such .cel file: ${path}` };
  const selected = resolveCelSuite(existsSync(path) ? path : policySrc);
  if (!selected.ok) return { kind: "error", detail: selected.diagnostics.map(d => d.message).join("; ") };
  return { kind: "cel", celPath: selected.suite.files[0]?.path ?? join(policySrc, "cel/mv") };
}
