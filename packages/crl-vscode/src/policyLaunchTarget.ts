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
import { findPolicySrcNear, collectPolicyCels, isFile } from "./provenanceFindings";
import { isAbsolute, resolve } from "node:path";

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

  // A `.cel` was named directly (the editor/title button, or any caller that already knows the file).
  if (path.toLowerCase().endsWith(".cel")) {
    if (!isFile(path)) return { kind: "error", detail: `no such .cel file: ${path}` };
    // Deliberately NOT requiring it to sit inside a policy `src/`: the pre-#244 active-editor fast path accepted any
    // `.cel`, and MV degrades honestly (no sidecar, no flag store) rather than breaking. Keeping that reachable.
    return { kind: "cel", celPath: path };
  }

  // Otherwise treat it as a folder and find the policy it belongs to — up from the folder itself, then one level down
  // (so an artifact ROOT, whose `src/` is a child, resolves too).
  const policySrc = findPolicySrcNear(path);
  if (!policySrc) {
    return { kind: "error", detail: `${path} is not inside a policy (no src/ with a provenance/ folder).` };
  }

  const { cels, complete, unreadable } = collectPolicyCels(policySrc);
  if (cels.length === 0) {
    // Say WHY we found nothing. "No .cel files here" and "we could not read part of the tree" are different faults and
    // send whoever reads the message to different places.
    return {
      kind: "error",
      detail: complete
        ? `no .cel files found under ${policySrc}`
        : `no .cel files found under ${policySrc} — and part of the tree could not be read (${unreadable.join(", ")}).`,
    };
  }
  // Several is NORMAL, not a fault: a policy may hold multiple `.cel` clusters under `src/cel/`. Ambiguous ≠ unresolvable
  // — several valid targets exist and only a human can choose, so offer exactly those rather than failing.
  //
  // An INCOMPLETE enumeration is treated as ambiguous even when it yielded exactly one hit: we cannot claim it is the
  // only candidate when we know we did not see everything, and silently opening the wrong artifact is the bad outcome.
  if (cels.length === 1 && complete) return { kind: "cel", celPath: cels[0] };
  return { kind: "ambiguous", policySrc, cels };
}
