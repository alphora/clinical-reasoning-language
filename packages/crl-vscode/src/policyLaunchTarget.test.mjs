// #244 — the launch-argument resolver. Runs against real temp workspaces laid out like crl-content:
//   artifacts/<policy>/src/{cel,provenance,medical-validation}
// with the `.cel` files under `src/cel/` (NOT directly in `src/`) — the layout the design review caught the first plan
// getting wrong, which would have failed loudly on every well-formed artifact.
import * as mod from "../dist/policyLaunchTarget.js";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { resolveLaunchTarget } = mod;

const check = (label, fn) =>
  test(label, () => {
    const root = mkdtempSync(join(tmpdir(), "crl-launch-"));
    try {
      fn(root);
    } finally {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {}
    }
  });

/** Build a policy artifact. `cels` are paths RELATIVE to `src/`. Returns the useful anchors. */
function makePolicy(root, policyName = "rx501-105-medical-policy", cels = ["cel/p.cel"]) {
  const artifact = join(root, "artifacts", policyName);
  const src = join(artifact, "src");
  mkdirSync(join(src, "provenance"), { recursive: true });
  const celPaths = cels.map((rel) => {
    const p = join(src, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, '# C\nlibrary "C".\ncovers "P".\n');
    return p;
  });
  // KELP's anchor — the MV entity folder. Deliberately NOT created on disk by default (it is made lazily on first save).
  const mvEntityFolder = join(src, "medical-validation");
  return { artifact, src, celPaths, mvEntityFolder };
}

const uri = (fsPath, scheme = "file") => ({ scheme, fsPath });

// ── no target ────────────────────────────────────────────────────────────────

check("no argument → no-target (the palette/keybinding path keeps the picker)", () => {
  assert.equal(resolveLaunchTarget(undefined).kind, "no-target");
  assert.equal(resolveLaunchTarget(null).kind, "no-target");
});

check("a NON-file Uri → no-target, not an error (the diff-editor case for the editor/title button)", () => {
  // editor/title passes the active resource; in a diff editor that can be `git:`-scheme. Pre-#244 this fell through to
  // the picker, and it must keep doing so rather than newly erroring.
  assert.equal(resolveLaunchTarget(uri("/x/policy.cel", "git")).kind, "no-target");
});

// ── KELP's actual contract ───────────────────────────────────────────────────

check("KELP's entity-folder Uri → the policy's single .cel, WITHOUT the folder existing on disk", (root) => {
  const { celPaths, mvEntityFolder } = makePolicy(root);
  // mvEntityFolder is deliberately not created: a policy with no saved verdict has no medical-validation/ dir yet, and
  // that is exactly the first-use flow. Classifying by stat would fail loudly on a perfectly resolvable target.
  const r = resolveLaunchTarget(uri(mvEntityFolder));
  assert.equal(r.kind, "cel");
  assert.equal(r.celPath, celPaths[0]);
});

check("the .cel lives under src/cel/, not directly in src/ (the layout the first plan got wrong)", (root) => {
  const { celPaths } = makePolicy(root, "p", ["cel/deep/nested/x.cel"]);
  const r = resolveLaunchTarget(uri(join(root, "artifacts", "p", "src", "medical-validation")));
  assert.equal(r.kind, "cel", "a nested .cel under src/cel/ must still resolve");
  assert.equal(r.celPath, celPaths[0]);
});

check("the artifact ROOT resolves too — src/ is a CHILD there, so the upward walk alone can't find it", (root) => {
  const { artifact, celPaths } = makePolicy(root);
  const r = resolveLaunchTarget(uri(artifact));
  assert.equal(r.kind, "cel");
  assert.equal(r.celPath, celPaths[0]);
});

check("src/ itself, and a deep descendant, both resolve (anchor-insensitive)", (root) => {
  const { src, celPaths } = makePolicy(root);
  assert.equal(resolveLaunchTarget(uri(src)).celPath, celPaths[0]);
  assert.equal(resolveLaunchTarget(uri(join(src, "cel"))).celPath, celPaths[0]);
});

// ── ambiguity ────────────────────────────────────────────────────────────────

check("several .cel under one policy → ambiguous (a NORMAL layout, not a fault)", (root) => {
  const { src, mvEntityFolder } = makePolicy(root, "multi", ["cel/a.cel", "cel/b.cel", "cel/sub/c.cel"]);
  const r = resolveLaunchTarget(uri(mvEntityFolder));
  assert.equal(r.kind, "ambiguous");
  assert.equal(r.policySrc, src);
  assert.equal(r.cels.length, 3);
  assert.deepEqual([...r.cels].sort(), r.cels, "candidates must be deterministically ordered");
});

check("ambiguity is scoped to ONE policy — a sibling policy's cels are never offered", (root) => {
  const mine = makePolicy(root, "mine", ["cel/a.cel", "cel/b.cel"]);
  const other = makePolicy(root, "other", ["cel/x.cel", "cel/y.cel"]);
  const r = resolveLaunchTarget(uri(mine.mvEntityFolder));
  assert.equal(r.kind, "ambiguous");
  assert.deepEqual(r.cels, mine.celPaths.sort());
  for (const p of other.celPaths) assert.ok(!r.cels.includes(p), "another policy's .cel must not appear");
});

check("candidates come from src/cel/ — a stray .cel elsewhere under src/ is not a launch target", (root) => {
  const { src, celPaths, mvEntityFolder } = makePolicy(root, "stray", ["cel/real.cel"]);
  // A generated/backup .cel sitting in a sibling entity folder must not become a candidate — it would either be offered
  // as a choice or, if cel/ were empty, be silently chosen AS the target.
  writeFileSync(join(src, "provenance", "notes.cel"), "x");
  mkdirSync(mvEntityFolder, { recursive: true });
  writeFileSync(join(mvEntityFolder, "old.cel"), "x");
  const r = resolveLaunchTarget(uri(mvEntityFolder));
  assert.equal(r.kind, "cel");
  assert.equal(r.celPath, celPaths[0], "only the .cel under src/cel/ is a candidate");
});

// ── a .cel named directly ────────────────────────────────────────────────────

check("a .cel Uri → that .cel (the editor/title button's shape)", (root) => {
  const { celPaths } = makePolicy(root);
  const r = resolveLaunchTarget(uri(celPaths[0]));
  assert.equal(r.kind, "cel");
  assert.equal(r.celPath, celPaths[0]);
});

check("a .cel OUTSIDE any policy still opens — MV degrades honestly, and the pre-#244 fast path allowed it", (root) => {
  const loose = join(root, "loose.cel");
  writeFileSync(loose, "x");
  assert.equal(resolveLaunchTarget(uri(loose)).kind, "cel");
});

check("a .cel path that does not exist → error, NOT a picker fallback", (root) => {
  const r = resolveLaunchTarget(uri(join(root, "nope.cel")));
  assert.equal(r.kind, "error");
  assert.match(r.detail, /no such \.cel file/);
  assert.ok(r.detail.includes("nope.cel"), "the message must name the path");
  // Surface-NEUTRAL: this resolver serves the cockpit too, so it must not hard-code "Medical Validation".
  assert.ok(!/Medical Validation|cockpit/i.test(r.detail), "the detail must not name a panel — the caller prefixes that");
});

check("a DIRECTORY named foo.cel → error (suffix alone must not be trusted)", (root) => {
  const d = join(root, "trap.cel");
  mkdirSync(d, { recursive: true });
  const r = resolveLaunchTarget(uri(d));
  assert.equal(r.kind, "error");
});

// ── unresolvable folders ─────────────────────────────────────────────────────

check("a folder outside any policy → error naming the path", (root) => {
  const r = resolveLaunchTarget(uri(root));
  assert.equal(r.kind, "error");
  assert.match(r.detail, /not inside a policy/);
});

check("a policy src/ with NO .cel anywhere → error naming the src", (root) => {
  const { src, mvEntityFolder } = makePolicy(root, "empty", []);
  const r = resolveLaunchTarget(uri(mvEntityFolder));
  assert.equal(r.kind, "error");
  assert.match(r.detail, /no \.cel files found/);
  assert.ok(r.detail.includes(src));
});

check("`provenance` as a FILE does not mark a policy src/", (root) => {
  const src = join(root, "artifacts", "fake", "src");
  mkdirSync(join(src, "cel"), { recursive: true });
  writeFileSync(join(src, "provenance"), "not a directory");
  writeFileSync(join(src, "cel", "p.cel"), "x");
  const r = resolveLaunchTarget(uri(join(src, "medical-validation")));
  assert.equal(r.kind, "error", "a file named provenance must not satisfy the policy-src predicate");
});

// ── bad arguments ────────────────────────────────────────────────────────────

check("a non-Uri, non-string argument → error (a mis-wired caller must not look like normal use)", () => {
  for (const bad of [42, true, {}, { scheme: "file" }, [], () => {}]) {
    const r = resolveLaunchTarget(bad);
    assert.equal(r.kind, "error", `expected an error for ${JSON.stringify(bad) ?? typeof bad}`);
  }
});

check("an empty or relative path string → error, never a silent picker", () => {
  assert.equal(resolveLaunchTarget("").kind, "error");
  assert.equal(resolveLaunchTarget("   ").kind, "error");
  const rel = resolveLaunchTarget("artifacts/p/src");
  assert.equal(rel.kind, "error");
  assert.match(rel.detail, /must be absolute/);
});

check("a plain absolute string path is accepted (tolerated alongside a Uri)", (root) => {
  const { celPaths, mvEntityFolder } = makePolicy(root);
  const r = resolveLaunchTarget(mvEntityFolder);
  assert.equal(r.kind, "cel");
  assert.equal(r.celPath, celPaths[0]);
});

check("a trailing separator / dot segments normalize rather than skewing the walk", (root) => {
  const { celPaths, mvEntityFolder } = makePolicy(root);
  assert.equal(resolveLaunchTarget(mvEntityFolder + "/").celPath, celPaths[0]);
  assert.equal(resolveLaunchTarget(join(mvEntityFolder, "..", "medical-validation")).celPath, celPaths[0]);
});

// ── the cockpit wiring (source assertions) ───────────────────────────────────
// runShow lives inside the cockpit's closure with live vscode calls, so the concurrency contract is pinned here by
// source shape. The rules that matter: a TARGETED launch never waits on a pending pick and always supersedes it, and
// every async continuation re-checks its epoch before acting.

const COCKPIT_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "correspondenceCockpit.ts"), "utf8");
const RUN_SHOW = COCKPIT_SRC.slice(COCKPIT_SRC.indexOf("function runShow("), COCKPIT_SRC.indexOf("const showCmd"));

test("#244: both commands thread their first argument into runShow", () => {
  assert.match(
    COCKPIT_SRC,
    /registerCommand\("crl\.cockpit\.show", \(\.\.\.args: unknown\[\]\) =>\s*runShow\("cockpit", args\[0\]\)/,
    "crl.cockpit.show must pass its argument through",
  );
  assert.match(
    COCKPIT_SRC,
    /registerCommand\("crl\.medicalValidation\.show", \(\.\.\.args: unknown\[\]\) =>\s*runShow\("medical-validation", args\[0\]\)/,
    "crl.medicalValidation.show must pass its argument through — this is the KELP entry point",
  );
});

test("#244: the first-wins gate is the UNTARGETED marker, and every targeted branch returns before it", () => {
  const gate = RUN_SHOW.search(/if \(untargetedEpoch !== undefined\) return;/);
  assert.ok(gate > 0, "the first-wins gate must exist for untargeted shows");
  for (const branch of ['target.kind === "error"', 'target.kind === "cel"', 'target.kind === "ambiguous"']) {
    assert.ok(RUN_SHOW.indexOf(branch) < gate, `the ${branch} branch must be handled before the untargeted gate`);
  }
  // The marker is taken SYNCHRONOUSLY — before the await inside pickCelForPanel — or two shows slip through that window.
  assert.ok(
    RUN_SHOW.indexOf("untargetedEpoch = epoch;") < RUN_SHOW.indexOf("pickCelForPanel(epoch)"),
    "the marker must be set before the pick is started",
  );
  // Released on BOTH continuations, or a rejected pick swallows every later untargeted show forever.
  assert.equal((RUN_SHOW.match(/\brelease\(\);/g) ?? []).length, 2, "release() must run on the resolve AND reject paths");
  // …and only by its owner, so a stale continuation can't clear a newer show's marker.
  assert.match(RUN_SHOW, /if \(untargetedEpoch === epoch\) untargetedEpoch = undefined;/, "release must be ownership-checked");
});

test("#244: every async continuation re-checks its epoch, and a superseded picker is taken OFF SCREEN", () => {
  const guards = RUN_SHOW.match(/if \(epoch !== showEpoch\) return;/g) ?? [];
  assert.equal(guards.length, 2, "both the scoped pick and the workspace pick must guard on their captured epoch");
  // A direct open supersedes AND dismisses — leaving the old picker up means the user can choose into a void.
  const celBranch = RUN_SHOW.slice(RUN_SHOW.indexOf('target.kind === "cel"'), RUN_SHOW.indexOf('target.kind === "ambiguous"'));
  assert.match(celBranch, /showEpoch \+= 1;/, "the direct-open path must bump the epoch");
  assert.match(celBranch, /cancelActivePick\(\);/, "…and dismiss any on-screen pick");
  // The scan itself bails if superseded, so no picker appears after the fact.
  assert.match(COCKPIT_SRC, /if \(epoch !== showEpoch\) return undefined;/, "pickCelForPanel must bail after its await if superseded");
});

test("#244: a FAILED launch supersedes nothing — it must not void the user's in-flight pick", () => {
  const errBranch = RUN_SHOW.slice(RUN_SHOW.indexOf('target.kind === "error"'), RUN_SHOW.indexOf('target.kind === "cel"'));
  assert.match(errBranch, /showErrorMessage\(`CRL: cannot open \$\{label\} — \$\{target\.detail\}`\)/, "the error must be surfaced, naming the panel");
  assert.ok(!/showEpoch/.test(errBranch), "an errored launch opened nothing, so it must NOT take an epoch");
  assert.ok(!/cancelActivePick/.test(errBranch), "…and must not dismiss a pick the user is still using");
  assert.ok(!/pickCelForPanel/.test(errBranch), "the error path must never reach the workspace picker");
});

test("#244: the pick UI is cancellable — showQuickPick cannot be dismissed programmatically", () => {
  // Scoped to the two CEL-pick paths; the cockpit has other, unrelated quick-picks (e.g. setPrimary's pane chooser).
  assert.match(COCKPIT_SRC, /function pickCel\(/, "both cel-pick paths must share one cancellable helper");
  const pickCelFn = COCKPIT_SRC.slice(COCKPIT_SRC.indexOf("function pickCel("), COCKPIT_SRC.indexOf("function cancelActivePick("));
  assert.match(pickCelFn, /vscode\.window\.createQuickPick</, "the helper must use createQuickPick so a pick can be hidden");
  // Neither cel path may go back to showQuickPick — a superseded one could not then be taken off screen.
  assert.ok(!/vscode\.window\.showQuickPick/.test(pickCelFn), "the helper must not use showQuickPick");
  assert.match(RUN_SHOW, /pickCel\(items,/, "the ambiguity branch must use the cancellable helper");
  const forPanel = COCKPIT_SRC.slice(COCKPIT_SRC.indexOf("async function pickCelForPanel("), COCKPIT_SRC.indexOf("function pickCel("));
  assert.match(forPanel, /return pickCel\(items,/, "the workspace picker must use the cancellable helper too");
  assert.ok(!/vscode\.window\.showQuickPick/.test(forPanel), "the workspace picker must not use showQuickPick");
  // Resolve-exactly-once: onDidHide also fires after an accept.
  assert.match(COCKPIT_SRC, /if \(done\) return;/, "the pick promise must settle exactly once");
  // And a settling pick must not clear a NEWER pick's registration.
  assert.match(COCKPIT_SRC, /if \(activePick === qp\) activePick = undefined;/, "only its own registration may be cleared");
});
