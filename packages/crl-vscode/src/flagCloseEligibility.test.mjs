// Todo 4 (impl-review) — the PURE delete-close eligibility, tested executably (the two locked operator decisions + the
// fail-closed rules the panel surfaced): decision 1(b) shared-ref skip, 2(b) resolved skip, warning fail-closed, ref shape.
import assert from "node:assert/strict";

import { flagCloseEligibility } from "./flagCloseEligibility.ts";

// A minimal flag — the helper reads only id / fields.ref / status.
const f = (id, ref, status = "open") => ({ id, status, fields: ref === undefined ? {} : { ref } });

test("present=false when the id isn't in the load (already gone / among the unreadable set)", () => {
  const e = flagCloseEligibility([f("a", "#1")], false, "zzz");
  assert.equal(e.present, false);
  assert.equal(e.willClose, false);
});

test("1:1 open flag with a numeric ref → willClose, issueNo + refStr surfaced", () => {
  const e = flagCloseEligibility([f("a", "#42")], false, "a");
  assert.deepEqual(e, { present: true, willClose: true, issueNo: 42, refStr: "42" });
});

test("2(b): a RESOLVED flag never closes its issue (present + refStr, but willClose=false)", () => {
  const e = flagCloseEligibility([f("a", "#42", "resolved")], false, "a");
  assert.equal(e.present, true);
  assert.equal(e.willClose, false);
  assert.equal(e.issueNo, 42);
});

test("1(b): another live flag sharing the same issue → skip the close", () => {
  const e = flagCloseEligibility([f("a", "#42"), f("b", "#42")], false, "a");
  assert.equal(e.willClose, false); // b still references #42
  assert.equal(e.refStr, "42");
  // …but if the OTHER flag references a different issue, the close proceeds
  const e2 = flagCloseEligibility([f("a", "#42"), f("b", "#43")], false, "a");
  assert.equal(e2.willClose, true);
});

test("warning → fail closed (an unreadable record may share the ref; sole ownership unprovable)", () => {
  const e = flagCloseEligibility([f("a", "#42")], true, "a");
  assert.equal(e.present, true); // the target itself parsed cleanly
  assert.equal(e.willClose, false); // but a warning blocks the close
});

test("a non-numeric / absent ref → no issue to close (willClose=false, issueNo undefined)", () => {
  assert.equal(flagCloseEligibility([f("a", "disc 173")], false, "a").willClose, false);
  assert.equal(flagCloseEligibility([f("a", undefined)], false, "a").willClose, false);
  assert.equal(flagCloseEligibility([f("a", "disc 173")], false, "a").issueNo, undefined);
});

console.log("flagCloseEligibility.test: ok");
