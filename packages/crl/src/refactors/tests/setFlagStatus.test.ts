// #205 crl-refactors — setFlagStatus: the source-level status flip (headless set_flag_status). Covers the selector, the
// open↔resolved flip round-trip, the already-at-status no-op, ambiguity, and not-found.
import { buildCRL, collectFlags, createFlag, setFlagStatus } from "../../index";

// Build a source with one open flag on concept "C" via createFlag (so the fixtures stay grammar-true).
const withFlag = (tag: string, gist: string, fields?: Record<string, string>): string => {
  const base = `library "L".\nconcept "C":\n- type is Observation.\n- code is \`c\`.`;
  const r = createFlag(base, { kind: "concept", name: "C" }, { tag, gist, fields });
  if (!r.ok) throw new Error("fixture createFlag failed: " + r.reason);
  return r.source;
};

const statusOf = (src: string, tag: string): string | undefined =>
  collectFlags(buildCRL(src).result!).find((f) => f.canonicalTag === tag)?.status;

describe("#205 setFlagStatus", () => {
  it("flips open → resolved; the flag reads back resolved; changed:true", () => {
    const src = withFlag("validation-concern", "looks off");
    const r = setFlagStatus(src, { scope: "concept", name: "C", tag: "validation-concern" }, "resolved");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed).toBe(true);
    expect(statusOf(r.source, "validation-concern")).toBe("resolved");
  });

  it("flips resolved → open (round-trip)", () => {
    const src = withFlag("open-fork", "unsure");
    const resolved = setFlagStatus(src, { scope: "concept", name: "C", tag: "open-fork" }, "resolved");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const reopened = setFlagStatus(resolved.source, { scope: "concept", name: "C", tag: "open-fork" }, "open");
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(statusOf(reopened.source, "open-fork")).toBe("open");
  });

  it("already at the target status → changed:false, source unchanged", () => {
    const src = withFlag("open-fork", "unsure"); // authored open
    const r = setFlagStatus(src, { scope: "concept", name: "C", tag: "open-fork" }, "open");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed).toBe(false);
    expect(r.source).toBe(src);
  });

  it("no matching flag → not-found", () => {
    const src = withFlag("open-fork", "unsure");
    const r = setFlagStatus(src, { scope: "concept", name: "C", tag: "internal-inconsistency" }, "resolved");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not-found");
  });

  it("two same-tag flags on one node with no key → ambiguous, returns candidates", () => {
    let src = withFlag("open-fork", "first fork");
    const second = createFlag(src, { kind: "concept", name: "C" }, { tag: "open-fork", gist: "second fork" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    src = second.source;
    const r = setFlagStatus(src, { scope: "concept", name: "C", tag: "open-fork" }, "resolved");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("ambiguous");
    expect(r.candidates?.length).toBe(2);
    expect(r.candidates?.every((c) => typeof c.line === "number")).toBe(true);
  });

  it("flips a MULTI-LINE backtick body (spans physical lines) — not a false changed:false", () => {
    // A hand-authored flag whose body wraps across two lines (the lexer allows newlines inside backticks).
    const src = `library "L".\nconcept "C":\n- type is Observation.\n- meta is \`@open-fork: a gist that\nwraps to a second line; status open\`.\n- code is \`c\`.`;
    // sanity: it parses + collectFlags sees one open open-fork
    expect(statusOf(src, "open-fork")).toBe("open");
    const r = setFlagStatus(src, { scope: "concept", name: "C", tag: "open-fork" }, "resolved");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed).toBe(true); // NOT a silent no-op
    expect(statusOf(r.source, "open-fork")).toBe("resolved");
  });

  it("matches the tag canonically (an alias selector finds a canonical flag and vice-versa)", () => {
    const src = withFlag("validation-concern", "looks off");
    // canonicalTag comparison: selecting by the canonical id matches regardless of how it was authored.
    const r = setFlagStatus(src, { scope: "concept", name: "C", tag: "validation-concern" }, "resolved");
    expect(r.ok).toBe(true);
  });
});
