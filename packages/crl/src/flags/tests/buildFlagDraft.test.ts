// #212 step 2 — the validate-a-draft + build-a-store-record seam (the single validation path for the MCP tool + cockpit).
import { validateAndBuildMvFlagDraft } from "../buildFlagDraft";

const CONCEPT = 'library "L".\nconcept "C":\n- type is Observation.\n- code is `c`.';
const build = (over: { tag?: string; gist?: string; fields?: Record<string, string> } = {}, id = () => "fixed-id", now = () => "2026-07-14T00:00:00.000Z") =>
  validateAndBuildMvFlagDraft(CONCEPT, { kind: "concept", name: "C" }, { tag: over.tag ?? "validation-concern", gist: over.gist ?? "looks off", fields: over.fields }, id, now);

test("a valid draft → a complete MvFlag (concept anchor, canonical tag, host-injected id/createdAt, a dedupKey)", () => {
  const r = build();
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.flag.tag).toBe("validation-concern");
  expect(r.flag.anchor).toMatchObject({ scope: "concept", name: "C", library: "L" });
  expect(r.flag.status).toBe("open");
  expect(r.flag.id).toBe("fixed-id");
  expect(r.flag.createdAt).toBe("2026-07-14T00:00:00.000Z");
  expect(typeof r.flag.dedupKey).toBe("string");
});

test("dedupKey is STABLE across builds of the same content (retry-idempotency) but DIFFERS by gist", () => {
  const a = build({ gist: "same" });
  const b = build({ gist: "same" }, () => "other-id"); // different id, same content
  const c = build({ gist: "different" });
  expect(a.ok && b.ok && c.ok).toBe(true);
  if (!a.ok || !b.ok || !c.ok) return;
  expect(a.flag.dedupKey).toBe(b.flag.dedupKey);
  expect(a.flag.dedupKey).not.toBe(c.flag.dedupKey);
});

test("dedupKey DIFFERS when a meaning-bearing field differs (same anchor+tag+gist) — distinct flags must not collapse", () => {
  // @fidelity-defect requires `direction`; over-reach vs under-reach are DISTINCT findings under one gist (Claude review).
  const over = build({ tag: "fidelity-defect", gist: "dosage mismatch", fields: { direction: "over-reach" } });
  const under = build({ tag: "fidelity-defect", gist: "dosage mismatch", fields: { direction: "criterion-drop" } }, () => "id2");
  expect(over.ok && under.ok).toBe(true);
  if (!over.ok || !under.ok) return;
  expect(over.flag.dedupKey).not.toBe(under.flag.dedupKey);
});

test("an unknown tag → domain failure (reason unknown-tag), never throws", () => {
  const r = build({ tag: "not-a-flag-tag" });
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.reason).toBe("unknown-tag");
});

test("a missing registry-required field → missing-field", () => {
  const r = build({ tag: "fidelity-defect" }); // needs `direction`
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.reason).toBe("missing-field");
});

test("a required field present → ok; the field rides along in fields", () => {
  const r = build({ tag: "fidelity-defect", fields: { direction: "over-reach" } });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.flag.fields.direction).toBe("over-reach");
});

test("the target must exist in the source → decl-not-found for an absent concept", () => {
  const r = validateAndBuildMvFlagDraft(CONCEPT, { kind: "concept", name: "Nope" }, { tag: "validation-concern", gist: "x" });
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.reason).toBe("decl-not-found");
});

test("a parse failure → parse-failed (never a crash)", () => {
  const r = validateAndBuildMvFlagDraft("this is not CRL {{{", { kind: "concept", name: "C" }, { tag: "validation-concern", gist: "x" });
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.reason).toBe("parse-failed");
});

// ── the direct MvFlag build (ported from legacyToMvFlag) — the load-bearing branches (gpt55 + Claude impl review) ─────────────
const DECISION = 'library "L".\nconcept "A":\n- type is Observation.\n- code is `a`.\ndecision "D":\nfirst:\n- when "A" then recommend activity "X".\n- otherwise then recommend activity "X".';

test("a decision-occurrence `; key` (`<nodeId>~<signature>`) promotes to anchor.occurrenceKey + a `name · sig` label; key is stripped from fields", () => {
  const r = validateAndBuildMvFlagDraft(DECISION, { kind: "decision", name: "D" }, { tag: "validation-concern", gist: "wrong node", fields: { key: "when[0]~A" } });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.flag.anchor).toMatchObject({ scope: "decision", name: "D", occurrenceKey: "when[0]~A", label: "D · A" });
  expect(r.flag.fields.key).toBeUndefined(); // key lives in the anchor, not the stored fields
  expect(r.flag.dedupKey).not.toBe("when[0]~A"); // an occurrence key is NOT the dedupKey (it's a synthesized content hash)
});

test("a NON-occurrence `; key` on a decision becomes the dedupKey verbatim (re-add guard) — NOT an occurrenceKey; stripped from fields", () => {
  const r = validateAndBuildMvFlagDraft(DECISION, { kind: "decision", name: "D" }, { tag: "open-fork", gist: "unsettled fork", fields: { key: "src-hash-abc123" } });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.flag.anchor.occurrenceKey).toBeUndefined();
  expect(r.flag.dedupKey).toBe("src-hash-abc123");
  expect(r.flag.fields.key).toBeUndefined();
});

test("a library-target build → a library-scope anchor (name = the library name)", () => {
  const r = validateAndBuildMvFlagDraft(DECISION, { kind: "library", name: "L" }, { tag: "internal-inconsistency", gist: "source contradicts itself" });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.flag.anchor).toMatchObject({ scope: "library", name: "L", label: "L" });
  expect(r.flag.category).toBe("extraction"); // STRICT from the tag
});

test("category is STRICT from the tag — validation-concern → validation, the extraction flags → extraction", () => {
  const vc = build({ tag: "validation-concern" });
  const fd = build({ tag: "fidelity-defect", fields: { direction: "over-reach" } });
  expect(vc.ok && fd.ok).toBe(true);
  if (!vc.ok || !fd.ok) return;
  expect(vc.flag.category).toBe("validation");
  expect(fd.flag.category).toBe("extraction");
});

test("a tag ALIAS canonicalizes through the full seam (over-reach-to-fix → fidelity-defect)", () => {
  const r = build({ tag: "over-reach-to-fix", fields: { direction: "over-reach" } });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.flag.tag).toBe("fidelity-defect");
});
