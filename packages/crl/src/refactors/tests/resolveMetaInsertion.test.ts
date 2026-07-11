// #203 Todo 4b Slice B — the resolveMetaInsertion source-scanner: the grammar-edge matrix (the slots that would be
// grammar-REJECTED if the resolver got them wrong) + the parse→insert→collectFlags→VALIDATOR-CLEAN round-trip
// (collectFlags is detection-only, so a valid slot must ALSO pass MetaTagValidator — Claude design review).
import { buildCRL, collectFlags, resolveMetaInsertion, validateCRL } from "../../index";

// Find the 1-based decl line of `concept "X":` / `decision "X":` in a source (mirrors what the cockpit reads off the AST).
const declLineOf = (src: string, re: RegExp): number => src.split("\n").findIndex((l) => re.test(l)) + 1;

// Apply a resolved insertion: splice `${indent}- meta is \`<body>\`.` in at insertLine (0-based).
const applyInsert = (src: string, kind: "concept" | "decision", declLine: number, body: string): string => {
  const r = resolveMetaInsertion(src, { kind, declLine });
  if (!r.ok) throw new Error("resolve failed: " + r.reason);
  const lines = src.split("\n");
  lines.splice(r.insertLine, 0, `${r.indent}- meta is \`${body}\`.`);
  return lines.join("\n");
};
const kinds = (list: { kind?: string }[]): string[] => list.map((e) => e.kind ?? "");
const astOf = (src: string) => {
  const b = buildCRL(src);
  if (!b.success || !b.result) throw new Error("build failed: " + JSON.stringify(b.errors));
  return b.result;
};

describe("#203 Slice B resolveMetaInsertion — concept meta slot (after type/valueType/meta, before code/etc)", () => {
  const concept = (bodyLines: string): string => `library "L".\nconcept "C":\n${bodyLines}`;
  const line = (src: string) => resolveMetaInsertion(src, { kind: "concept", declLine: declLineOf(src, /^concept "C":/) });

  it("decl + type + valueType + existing-meta + code → insert AFTER the last meta (before code)", () => {
    const src = concept("- type is Observation.\n- value type is Quantity.\n- meta is `@description: d`.\n- code is `c`.");
    const r = line(src);
    expect(r.ok && src.split("\n")[r.insertLine]).toBe("- code is `c`."); // inserts before `- code is`
  });
  it("decl + type + code (NO meta) → insert AFTER type (before code)", () => {
    const src = concept("- type is Observation.\n- code is `c`.");
    const r = line(src);
    expect(r.ok && src.split("\n")[r.insertLine]).toBe("- code is `c`.");
  });
  it("decl + code ONLY (no type) → insert AFTER decl (before code) — meta legally precedes code", () => {
    const src = concept("- code is `c`.");
    const r = line(src);
    expect(r.ok && src.split("\n")[r.insertLine]).toBe("- code is `c`.");
  });
  it("decl + type + evidence → insert BEFORE evidence", () => {
    const src = concept("- type is Observation.\n- evidence is `the source quote`.\n- code is `c`.");
    const r = line(src);
    expect(r.ok && src.split("\n")[r.insertLine]).toMatch(/- evidence is/);
  });
  it("decl + `defined as`-only → insert BEFORE the defined-as line (don't walk into its operands)", () => {
    const src = concept("- defined as ( \"A\" sem-or \"B\" ).");
    const r = line(src);
    expect(r.ok && src.split("\n")[r.insertLine]).toMatch(/- defined as/);
  });
  it("decl + type + `source representation` → insert BEFORE source-rep (never into its nested `- type is`)", () => {
    const src = concept("- type is Observation.\n- source representation: - type is Claim.");
    const r = line(src);
    expect(r.ok && src.split("\n")[r.insertLine]).toMatch(/- source representation/);
  });
});

describe("#203 Slice B resolveMetaInsertion — decision meta slot (leading, before first:/branches)", () => {
  const line = (src: string) => resolveMetaInsertion(src, { kind: "decision", declLine: declLineOf(src, /^decision "D":/) });

  it("decl + first: (NO meta) → insert AFTER decl (before first:)", () => {
    const src = `library "L".\ndecision "D":\nfirst:\n- when "A" then recommend activity "X".\n- otherwise then recommend activity "Y".`;
    const r = line(src);
    expect(r.ok && src.split("\n")[r.insertLine]).toBe("first:");
  });
  it("decl + existing meta + first: → insert AFTER the last leading meta (before first:)", () => {
    const src = `library "L".\ndecision "D":\n- meta is \`@description: d\`.\nfirst:\n- when "A" then recommend activity "X".\n- otherwise then recommend activity "Y".`;
    const r = line(src);
    expect(r.ok && src.split("\n")[r.insertLine]).toBe("first:");
  });
});

describe("#203 Slice B resolveMetaInsertion — result contract + round-trip", () => {
  it("an out-of-range decl line → {ok:false}, never a guessed slot", () => {
    const r = resolveMetaInsertion("library \"L\".\n", { kind: "concept", declLine: 999 });
    expect(r.ok).toBe(false);
  });

  it("ROUND-TRIP: insert an open flag on a concept → it PARSES, collectFlags finds it open, AND validates clean", () => {
    const src = `library "L".\nconcept "C":\n- type is Observation.\n- code is \`c\`.`;
    const declLine = declLineOf(src, /^concept "C":/);
    const after = applyInsert(src, "concept", declLine, "@validation-concern: policy looks wrong for the customer; status open");
    const ast = astOf(after); // parses
    const f = collectFlags(ast).find((x) => x.canonicalTag === "validation-concern");
    expect(f?.status).toBe("open"); // collected, open
    expect((validateCRL(after).errors ?? []).map((e) => (e as { kind?: string }).kind)).not.toContain("meta-missing-field"); // valid, not just parseable
  });

  it("ROUND-TRIP: a `@fidelity-defect` WITH its required `; direction` inserts + validates clean; the slot is byte-legal", () => {
    const src = `library "L".\nconcept "C":\n- type is Observation.\n- value type is Quantity.\n- code is \`c\`.`;
    const declLine = declLineOf(src, /^concept "C":/);
    const after = applyInsert(src, "concept", declLine, "@fidelity-defect: axillary over-reach; direction over-reach; status open");
    const errs = validateCRL(after).errors ?? [];
    expect(errs.filter((e) => (e as { kind?: string }).kind === "decision-shape")).toEqual([]); // grammar-legal slot
    expect(kinds(errs)).not.toContain("meta-missing-field"); // direction present → clean
  });

  it("ROUND-TRIP: a decision-scope flag inserts before `first:` and validates clean", () => {
    const src = `library "L".\nconcept "A":\n- type is Observation.\n- code is \`a\`.\ndecision "D":\nfirst:\n- when "A" then recommend activity "X".\n- otherwise then recommend activity "X".`;
    const declLine = declLineOf(src, /^decision "D":/);
    const after = applyInsert(src, "decision", declLine, "@open-fork: encoded first-applicable but unsure; status open");
    const ast = astOf(after);
    expect(collectFlags(ast).some((f) => f.scope === "decision" && f.canonicalTag === "open-fork")).toBe(true);
    expect((validateCRL(after).errors ?? []).filter((e) => (e as { kind?: string }).kind === "decision-shape")).toEqual([]);
  });
});
