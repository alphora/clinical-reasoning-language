// #205 crl-refactors — createFlag: the extracted create-flag transform (the Slice-B payoff). Covers all three scopes the
// kit authors at (concept / decision / library), the registry field validation, sanitization, the returned identity, and
// the round-trip (parse → collectFlags finds it open → validator-clean).
import { buildCRL, collectFlags, createFlag, validateCRL } from "../../index";

const CONCEPT = `library "L".\nconcept "C":\n- type is Observation.\n- code is \`c\`.`;
const DECISION = `library "L".\nconcept "A":\n- type is Observation.\n- code is \`a\`.\ndecision "D":\nfirst:\n- when "A" then recommend activity "X".\n- otherwise then recommend activity "X".`;

const errs = (src: string): string[] => (validateCRL(src).errors ?? []).map((e) => (e as { kind?: string }).kind ?? "");

describe("#205 createFlag — concept scope", () => {
  it("authors a flag at the legal slot; parses, collectFlags finds it open, validates clean", () => {
    const r = createFlag(CONCEPT, { kind: "concept", name: "C" }, { tag: "validation-concern", gist: "looks off for the customer" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.flag.canonicalTag).toBe("validation-concern");
    expect(r.flag.status).toBe("open");
    expect(r.flag.scope).toBe("concept");
    expect(r.lineText).toContain("- meta is `@validation-concern: looks off for the customer; status open`.");
    expect(collectFlags(buildCRL(r.source).result!).some((f) => f.canonicalTag === "validation-concern")).toBe(true);
    expect(errs(r.source)).not.toContain("meta-missing-field");
  });

  it("enforces a registry-required field (fidelity-defect needs direction) up front", () => {
    const miss = createFlag(CONCEPT, { kind: "concept", name: "C" }, { tag: "fidelity-defect", gist: "axillary over-reach" });
    expect(miss.ok).toBe(false);
    if (miss.ok) return;
    expect(miss.reason).toBe("missing-field");

    const ok = createFlag(CONCEPT, { kind: "concept", name: "C" }, { tag: "fidelity-defect", gist: "axillary over-reach", fields: { direction: "over-reach" } });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.lineText).toContain("; direction over-reach; status open");
    expect(errs(ok.source)).not.toContain("meta-missing-field");
  });

  it("rejects an out-of-enum field value", () => {
    const r = createFlag(CONCEPT, { kind: "concept", name: "C" }, { tag: "fidelity-defect", gist: "x", fields: { direction: "sideways" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid-value");
  });
});

describe("#205 createFlag — decision + library scope", () => {
  it("authors a decision-scope flag BEFORE first: and validates clean", () => {
    const r = createFlag(DECISION, { kind: "decision", name: "D" }, { tag: "open-fork", gist: "encoded first-applicable but unsure" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.flag.scope).toBe("decision");
    expect(errs(r.source)).not.toContain("decision-shape");
    // the meta line lands before the `first:` block qualifier
    const outLines = r.source.split(/\r?\n/);
    expect(outLines[r.insertLine]).toContain("- meta is `@open-fork:");
  });

  it("authors a LIBRARY-scope flag after `library \"L\".` and validates clean", () => {
    const r = createFlag(CONCEPT, { kind: "library", name: "L" }, { tag: "internal-inconsistency", gist: "the policy contradicts itself across sections" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.flag.scope).toBe("library");
    expect(r.flag.targetName).toBe("L");
    expect(r.insertLine).toBe(1); // right after `library "L".`
    expect(collectFlags(buildCRL(r.source).result!).some((f) => f.scope === "library" && f.canonicalTag === "internal-inconsistency")).toBe(true);
    expect(errs(r.source)).toEqual([]);
  });

  it("a library-scope flag on the WRONG library name → decl-not-found", () => {
    const r = createFlag(CONCEPT, { kind: "library", name: "Nope" }, { tag: "open-fork", gist: "x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("decl-not-found");
  });
});

describe("#205 createFlag — guards", () => {
  it("unknown tag → unknown-tag", () => {
    const r = createFlag(CONCEPT, { kind: "concept", name: "C" }, { tag: "not-a-tag", gist: "x" });
    expect(r.ok && "unreachable").toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unknown-tag");
  });
  it("a gist with a forbidden char → invalid-value (never breaks the backtick body)", () => {
    const r = createFlag(CONCEPT, { kind: "concept", name: "C" }, { tag: "open-fork", gist: "has a ; delimiter" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid-value");
  });
  it("a missing declaration → decl-not-found", () => {
    const r = createFlag(CONCEPT, { kind: "concept", name: "Ghost" }, { tag: "open-fork", gist: "x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("decl-not-found");
  });
  it("a blank line before `- type is` does NOT mis-place the flag (scan skips blanks) — validates clean", () => {
    const blanky = `library "L".\nconcept "C":\n\n- type is Observation.\n- code is \`c\`.`;
    const r = createFlag(blanky, { kind: "concept", name: "C" }, { tag: "open-fork", gist: "x" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(errs(r.source)).toEqual([]); // meta landed AFTER type, not before it (would be a grammar error otherwise)
    expect(r.source).toMatch(/- type is Observation\.\n- meta is `@open-fork: x; status open`\.\n- code is/); // right after type
  });
  it("accepts a MULTI-LINE gist (a real description) — newlines kept, validates clean, collectFlags reads it", () => {
    const desc = "The policy narrative is ambiguous about the lookback window.\nCustomer confirmed 6 months verbally, but the doc says 'recent'.\nNeeds a written decision before this ships.";
    const r = createFlag(CONCEPT, { kind: "concept", name: "C" }, { tag: "validation-concern", gist: desc });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(errs(r.source)).toEqual([]); // a multi-line backtick body is grammar-legal
    expect(r.flag.body).toContain("lookback window"); // the whole description is the gist
    expect(r.flag.body).toContain("before this ships");
    expect(r.flag.status).toBe("open");
  });
  it("still rejects a `;` in the gist (it would start a field) but NOT a newline", () => {
    expect(createFlag(CONCEPT, { kind: "concept", name: "C" }, { tag: "open-fork", gist: "line one\nline two" }).ok).toBe(true);
    const semi = createFlag(CONCEPT, { kind: "concept", name: "C" }, { tag: "open-fork", gist: "a; b" });
    expect(semi.ok).toBe(false);
    if (semi.ok) return;
    expect(semi.reason).toBe("invalid-value");
  });
  it("rejects a `status` smuggled in via fields (use the top-level status)", () => {
    const r = createFlag(CONCEPT, { kind: "concept", name: "C" }, { tag: "open-fork", gist: "x", fields: { status: "resolved" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid-value");
  });
  it("is deterministic regardless of the input field object-key order", () => {
    const a = createFlag(CONCEPT, { kind: "concept", name: "C" }, { tag: "open-fork", gist: "x", fields: { chosen: "A", alternatives: "B" } });
    const b = createFlag(CONCEPT, { kind: "concept", name: "C" }, { tag: "open-fork", gist: "x", fields: { alternatives: "B", chosen: "A" } });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.lineText).toBe(b.lineText); // same fields, different key order → identical output
  });
  it("unparseable source → parse-failed", () => {
    const r = createFlag("this is not crl {{{", { kind: "concept", name: "C" }, { tag: "open-fork", gist: "x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("parse-failed");
  });
  it("preserves CRLF line endings in the returned source", () => {
    const crlf = CONCEPT.replace(/\n/g, "\r\n");
    const r = createFlag(crlf, { kind: "concept", name: "C" }, { tag: "open-fork", gist: "x" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source.includes("\r\n")).toBe(true);
    expect(r.source.includes("\n\n")).toBe(false); // no bare-LF churn introduced
  });
});
