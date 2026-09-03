// Integrity tests for the VENDORED LForms runtime (packages/crl-vscode/media/lforms/).
//
// Nobody can review 3.6 MB of minified third-party JS, so the only reviewable property is PROVENANCE. These
// tests make media/lforms/README.md's hash table executable instead of decorative: a quiet local edit to a
// bundle, a truncated copy, or a version bump that forgets to update the record all fail here.
//
// They also pin the two runtime properties the CSP conclusion rests on — that the bundles carry no `eval(` or
// `new Function(`, which is why `script-src` stays nonce-only.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const vendorDir = join(here, "..", "media", "lforms");
const readme = readFileSync(join(vendorDir, "README.md"), "utf8");

/** The files the renderer actually loads, plus the two images styles.css references. */
const REQUIRED = [
  "lhc-forms.js",
  "lformsFHIR.min.js",
  "zone.min.js",
  "styles.css",
  "magnifying_glass.png",
  "down_arrow_gray_10_10.png",
];

const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

/** Pull `| `name` | … | `hash` |` rows out of the README's integrity table. */
function recordedHashes() {
  const out = {};
  for (const line of readme.split("\n")) {
    const m = line.match(/^\|\s*`([^`]+)`\s*\|.*\|\s*`([0-9a-f]{64})`\s*\|/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

describe("vendored LForms integrity", () => {
  it("every required runtime file is present", () => {
    for (const f of REQUIRED) {
      assert.ok(existsSync(join(vendorDir, f)), `missing vendored file: ${f}`);
    }
  });

  it("the README records a hash for every required file, and no stale extras", () => {
    const recorded = recordedHashes();
    assert.deepEqual(
      Object.keys(recorded).sort(),
      [...REQUIRED].sort(),
      "README integrity table and REQUIRED disagree — one of them was not updated",
    );
  });

  it("every vendored file matches its recorded sha256", () => {
    const recorded = recordedHashes();
    for (const f of REQUIRED) {
      assert.equal(sha256(join(vendorDir, f)), recorded[f], `sha256 mismatch for ${f} — bytes differ from the record`);
    }
  });

  it("the JS bundles contain no eval( or new Function( — this is what keeps script-src nonce-only", () => {
    for (const f of ["lhc-forms.js", "lformsFHIR.min.js"]) {
      const text = readFileSync(join(vendorDir, f), "utf8");
      assert.equal((text.match(/new Function\s*\(/g) ?? []).length, 0, `${f} introduced new Function(`);
      assert.equal((text.match(/[^.\w]eval\s*\(/g) ?? []).length, 0, `${f} introduced eval(`);
    }
  });

  it("the README pins the version it was measured against", () => {
    assert.match(readme, /\*\*43\.1\.0\*\*/, "vendored version missing from README — update it with the hashes");
  });
});
