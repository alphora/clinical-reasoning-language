// #250 — the ONE home for the `derivedFrom` carrier-path policy, so the producer (writes), the detectors (validators),
// and the normalizer (repair) can never drift on what a valid path is. This slice (Todo B) is the pure LEXICAL half:
// classify a stored `derivedFrom` string as ok / absolute / malformed. The path-WRITING helpers (relativize against a
// carrier dir, POSIX-ify) and the fs-touching RESOLUTION/hash checks land with the producer (A) and the resolve detector (C).
//
// A valid `derivedFrom` is a **carrier-relative, POSIX-separated** path — relative to the directory of the file that
// carries it, using `/` only. That is the single convention the whole #250 gate is built on:
//   - carrier-relative (not repo-root-relative) → no `.git` discovery, portable inside the repo, worktree-independent;
//   - POSIX `/` → resolves identically on the Windows authoring machine AND the Linux/browser reviewer clone (a `\`
//     separator, a drive letter, or a URI scheme is dead off the authoring machine — the class of defect #250 catches).
import { win32 as pathWin32, posix as pathPosix, relative, resolve, sep } from "node:path";

/** ok = a carrier-relative POSIX path; absolute = machine/drive/scheme-bound (dead off the authoring machine); malformed =
 *  not a usable relative path string at all (absent/blank/NUL, or a `\`-separated relative path that isn't POSIX). */
export type DerivedFromClass = "ok" | "absolute" | "malformed";

/** Drive-qualified Windows forms (`C:\x`, `C:/x`, and drive-RELATIVE `C:foo`) AND URI-scheme forms (`file:///…`,
 *  `https://…`) — anything of the shape `<letter><scheme-chars>*:` at the start. `path.win32.isAbsolute("C:foo")` is
 *  FALSE and a multi-letter scheme has no drive semantics at all, so both would slip past the isAbsolute checks; one
 *  test catches the whole family and buckets it `absolute` (machine/scheme-bound — the repair is the same: make it a
 *  carrier-relative path). A `:` cannot appear in a Windows filename, so this has no false positive on a Windows-authored
 *  corpus; a POSIX relative name with a colon in its FIRST segment (`foo:bar.docx` — rare, and illegal on Windows) is the
 *  only over-reach, and such a name is genuinely non-portable anyway. crl-vscode traffics in `vscode.Uri`, so a producer
 *  that stringifies one (`file:///e%3A/…`) is a real path this must catch, not a hypothetical. */
const DRIVE_OR_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * The #250 gate is ENFORCED (findings fail `pass`) only from the bundled delivery (H) that also ships the producer fix
 * (A — so freshly emitted artifacts are already carrier-relative) and the normalizer (E — so an existing corpus can
 * mechanically repair itself). Until then the detector RUNS but its findings are a NON-BLOCKING `warning` — visible, yet
 * they never fail a gate — so an interim crl / crl-vscode release cut from develop before H cannot hard-fail a corpus
 * that has no repair tool yet. Flip to `true` in the H slice, together with A + E, and re-grade the finding severity.
 * (disc 375 P2; both impl-review arms required an actual mechanism here, not "we intend not to release".)
 */
export const DERIVED_FROM_GATE_ENFORCED = false;

/**
 * Classify a stored `derivedFrom` value by LEXICAL inspection only — no filesystem access (this stays usable inside the
 * pure `validateProvenance`). Precedence matches the #250 cascade (non-path inputs first, then absolute):
 *   - not a string / blank (empty or whitespace-only) / contains NUL → `malformed` (not a path at all);
 *   - absolute under EITHER host's rules (`path.win32.isAbsolute` catches `C:\`, `C:/`, a rooted `\foo`, and UNC `\\host`;
 *     `path.posix.isAbsolute` catches `/foo`) OR drive/scheme-qualified (`C:foo`, `file:///…`, `https://…`) → `absolute`.
 *     Checking BOTH hosts is load-bearing: `path.isAbsolute` is platform-local, so a validator running on Linux would read
 *     `E:\src\…` as NOT absolute and pass it on exactly the machine where that path is dead;
 *   - a `\` anywhere in an otherwise-relative path → `malformed` (a Windows separator that will not resolve on POSIX);
 *   - otherwise → `ok`.
 */
export function classifyDerivedFrom(value: unknown): DerivedFromClass {
  if (typeof value !== "string" || value.trim() === "" || value.includes("\0")) return "malformed";
  if (pathWin32.isAbsolute(value) || pathPosix.isAbsolute(value) || DRIVE_OR_SCHEME.test(value))
    return "absolute";
  if (value.includes("\\")) return "malformed"; // a relative path with a backslash separator — not POSIX
  return "ok";
}

/**
 * The producer's write-side other half (Todo A): turn an absolute (or CWD-relative) `sourcePath` into the carrier-relative
 * POSIX `derivedFrom` that `classifyDerivedFrom` blesses. `carrierDir` is the directory of the file that will CARRY the
 * record (the artifact JSON / the anchormeta sidecar). Pure path math (`path.relative` on the host), no fs.
 *
 * It can FAIL: on Windows `path.relative` across DRIVES returns the absolute target (`C:\src.docx` when the carrier is on
 * `E:`), which POSIX-ified is drive-qualified and `classifyDerivedFrom` rightly rejects — there is NO carrier-relative
 * representation. Rather than emit a value its own detector would reject, the producer must FAIL LOUDLY; hence a discriminated
 * result, never a bare string (docx on `C:` + a corpus on the `E:` Dev Drive is real on this machine, not hypothetical).
 * `escapesCarrierDir` (a leading `..`) is returned for the caller's best-effort out-of-tree advisory — it is NOT itself an
 * error (a `../sibling/anchor.txt` layout is legitimate and portable within a checkout holding both).
 */
export type CarrierRelativeResult =
  | { ok: true; path: string; escapesCarrierDir: boolean }
  | { ok: false; reason: "no-carrier-relative-representation"; attempted: string };

export function toCarrierRelative(sourcePath: string, carrierDir: string): CarrierRelativeResult {
  const rel = relative(resolve(carrierDir), resolve(sourcePath));
  const posix = rel.split(sep).join("/");
  if (classifyDerivedFrom(posix) !== "ok") {
    return { ok: false, reason: "no-carrier-relative-representation", attempted: posix };
  }
  return { ok: true, path: posix, escapesCarrierDir: posix === ".." || posix.startsWith("../") };
}
