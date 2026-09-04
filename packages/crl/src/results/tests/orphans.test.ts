/**
 * Orphan detection and the prune split.
 *
 * The field report this exists for: switching producers left a KE with 88 QuestionnaireResponses in a
 * 44-case artifact, because our filenames (`<engine id>-<compartmentId>.json`) differ from the ones
 * they had written by hand (`qr-<caseId>.json`) — so ours landed BESIDE theirs, and the manifest said
 * `44 generated`, which was true and not the whole picture.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  heldBackCompartments,
  isInsideResultsTree,
  pruneRefusalReason,
  scanOrphans,
  splitOrphans,
} from "../orphans";
import { RESULTS_ROOT } from "../useCases";
import type { ProducerManifest } from "../manifest";

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "crl-orphans-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write a file into the results tree at a repo-relative path. */
function put(rel: string): string {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, "{}", "utf8");
  return rel;
}

const CLAIMED = `${RESULTS_ROOT}/patient/case-a/questionnaire/mine.json`;
const manifestClaiming = (...paths: string[]): ProducerManifest =>
  ({
    cases: [
      {
        caseName: "a",
        artifacts: paths.map((p) => ({ id: "x", path: p, sha256: "0", resourceType: "Questionnaire" })),
      },
    ],
  }) as unknown as ProducerManifest;

describe("scanOrphans", () => {
  it("reports what the manifest does not claim, and nothing it does", () => {
    put(CLAIMED);
    const stale = put(`${RESULTS_ROOT}/patient/case-a/questionnaireresponse/qr-hand-built.json`);
    expect(scanOrphans(root, manifestClaiming(CLAIMED)).orphans).toEqual([stale]);
  });

  // The rename case, which is the one that reaches a reviewer: the old compartment survives intact,
  // holding a complete pair for a case the suite no longer contains.
  it("finds a whole compartment left behind by a renamed case", () => {
    put(CLAIMED);
    const ghostQ = put(`${RESULTS_ROOT}/patient/old-name/questionnaire/ghost.json`);
    const ghostQr = put(`${RESULTS_ROOT}/patient/old-name/questionnaireresponse/ghost.json`);
    expect(scanOrphans(root, manifestClaiming(CLAIMED)).orphans).toEqual([ghostQ, ghostQr].sort());
  });

  it("is empty when the tree holds exactly what the run wrote", () => {
    put(CLAIMED);
    expect(scanOrphans(root, manifestClaiming(CLAIMED)).orphans).toEqual([]);
  });

  // A first run against a clean checkout must not fail merely because there is nothing to walk.
  it("treats a missing tree as no orphans, not an error", () => {
    expect(scanOrphans(root, manifestClaiming()).orphans).toEqual([]);
  });
});

describe("splitOrphans", () => {
  const q = `${RESULTS_ROOT}/patient/c/questionnaire/a.json`;
  const qr = `${RESULTS_ROOT}/patient/c/questionnaireresponse/b.json`;
  const foreign = `${RESULTS_ROOT}/patient/c/somethingelse/c.json`;

  it("prunes only the resource types the use case owns", () => {
    const { prunable, reportOnly } = splitOrphans([q, qr, foreign], "prior-auth");
    expect(prunable).toEqual([q, qr]);
    // Deleting a file we do not understand is worse than leaving it, permanently.
    expect(reportOnly).toEqual([foreign]);
  });

  // ⚠ Ownership is decided by the TYPE DIRECTORY, never the filename — filenames are precisely what
  // differed between producers in the field, so trusting them here would reproduce the bug.
  it("ignores the filename entirely", () => {
    const oddly = `${RESULTS_ROOT}/patient/c/questionnaire/not-a-name-we-would-ever-write.json`;
    expect(splitOrphans([oddly], "prior-auth").prunable).toEqual([oddly]);
  });

  it("a different use case owns different types", () => {
    const report = `${RESULTS_ROOT}/patient/c/measurereport/m.json`;
    expect(splitOrphans([report, q], "measure")).toEqual({ prunable: [report], reportOnly: [q] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The DELETION decision. These are the tests that matter most in this file: everything above decides
// what to REPORT, and being wrong there is noise. Being wrong here destroys someone's work.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const withCases = (cases: unknown[]): ProducerManifest =>
  ({ celLibrary: "suite-a", cases }) as unknown as ProducerManifest;
const producing = { caseName: "ok", compartmentDir: "patient/c1", artifacts: [{ path: "p" }] };

describe("pruneRefusalReason", () => {
  const clean = { unreadable: [] };

  it("allows pruning for an ordinary run that produced something", () => {
    expect(pruneRefusalReason(withCases([producing]), clean, undefined)).toBeUndefined();
  });

  // ⚠⚠ THE ZERO-CASE WIPE. MEASURED before the guard existed: a run whose cases all dropped out claims
  // nothing, so every artifact in the tree read as stale and was marked for deletion — destroying the
  // tree exactly when the run failed.
  it("REFUSES when the run produced no artifacts at all", () => {
    expect(pruneRefusalReason(withCases([]), clean, undefined)).toMatch(/produced no artifacts/);
    expect(
      pruneRefusalReason(withCases([{ caseName: "t", compartmentDir: "patient/c1" }]), clean, undefined),
    ).toMatch(/produced no artifacts/);
  });

  // A sibling manifest that fails to parse would otherwise protect NOTHING — the opposite of its job.
  it("REFUSES when the scan was incomplete", () => {
    expect(
      pruneRefusalReason(withCases([producing]), { unreadable: ["tests/results/x.json"] }, undefined),
    ).toMatch(/could not be fully read/);
  });

  it("reports the explicit opt-out as its own reason", () => {
    expect(pruneRefusalReason(withCases([producing]), clean, false)).toMatch(/--no-prune/);
  });
});

describe("heldBackCompartments", () => {
  // A case that timed out has no artifacts this run, so its last-good pair reads as unclaimed. One
  // flaky JVM timeout must not delete a committed artifact: the case did not go away.
  it("protects a compartment whose case produced nothing this run", () => {
    const held = heldBackCompartments(
      withCases([producing, { caseName: "timed out", compartmentDir: "patient/c2" }]),
    );
    expect(held).toEqual([`${RESULTS_ROOT}/patient/c2/`]);
  });

  it("holds back nothing when every case produced", () => {
    expect(heldBackCompartments(withCases([producing]))).toEqual([]);
  });
});

describe("isInsideResultsTree", () => {
  it("accepts a path within the tree and rejects one that escapes it", () => {
    expect(isInsideResultsTree("/root", `${RESULTS_ROOT}/patient/c/questionnaire/a.json`)).toBe(true);
    expect(isInsideResultsTree("/root", `${RESULTS_ROOT}/../../../etc/passwd`)).toBe(false);
    expect(isInsideResultsTree("/root", "tests/data/fhir/patient/c/observation/a.json")).toBe(false);
  });

  it("rejects the tree root itself — there is no file there to delete", () => {
    expect(isInsideResultsTree("/root", RESULTS_ROOT)).toBe(false);
  });
});

describe("scanOrphans safety", () => {
  // ⚠ MEASURED with a real junction before the fix: `statSync` followed it and the external file was
  // classified prunable. `lstatSync` describes the link instead of resolving it.
  it("never follows a symlink, and says it found one", () => {
    const outside = mkdtempSync(path.join(tmpdir(), "crl-outside-"));
    writeFileSync(path.join(outside, "DO-NOT-DELETE.json"), "{}", "utf8");
    const linkAt = path.join(root, RESULTS_ROOT, "patient/c/questionnaire");
    mkdirSync(path.dirname(linkAt), { recursive: true });
    try {
      symlinkSync(outside, linkAt, "junction");
    } catch {
      return; // a platform without symlink permission cannot exercise this
    }
    try {
      const scan = scanOrphans(root, manifestClaiming());
      expect(scan.orphans).toEqual([]);
      expect(scan.skippedLinks).toEqual([`${RESULTS_ROOT}/patient/c/questionnaire`]);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  // One manifest per CEL source, ONE shared tree: a sibling suite's live artifacts are unclaimed by
  // this run's manifest, so without this "re-run suite A" becomes "destroy suite B".
  it("honours a sibling suite's manifest", () => {
    const theirs = put(`${RESULTS_ROOT}/patient/suite-b-case/questionnaire/b.json`);
    const mine = put(CLAIMED);
    mkdirSync(path.join(root, "tests/results"), { recursive: true });
    writeFileSync(
      path.join(root, "tests/results/questionnaire-manifest-suite-b.json"),
      JSON.stringify({ celLibrary: "suite-b", cases: [{ artifacts: [{ path: theirs }] }] }),
      "utf8",
    );
    expect(scanOrphans(root, manifestClaiming(mine)).orphans).toEqual([]);
  });

  it("reports a sibling manifest it cannot parse instead of ignoring it", () => {
    put(CLAIMED);
    mkdirSync(path.join(root, "tests/results"), { recursive: true });
    writeFileSync(path.join(root, "tests/results/questionnaire-manifest-broken.json"), "{ not json", "utf8");
    expect(scanOrphans(root, manifestClaiming(CLAIMED)).unreadable).toEqual([
      "tests/results/questionnaire-manifest-broken.json",
    ]);
  });
});
