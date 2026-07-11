// #205 crl-refactors instance #1 — the flag-status flip. PURE-transform tests + the ROUND-TRIP guardrail
// (write → collectFlags → assert the status reads back as intended; a rewrite the parser re-reads differently is a
// silent stuck-open bug). Covers: open↔resolved, absent→add, status-in-body (must NOT match), trailing ruling,
// spacing preservation, indentation/backtick/`.` preservation, duplicate status.
import { buildCRL, collectFlags, rewriteMetaStatus, rewriteStatusInBody } from "../../index";

const ast = (input: string) => {
  const b = buildCRL(input);
  if (!b.success || !b.result) throw new Error("build failed: " + JSON.stringify(b.errors));
  return b.result;
};
const statusOf = (crl: string, tag = "open-fork") =>
  collectFlags(ast(crl)).find((f) => f.canonicalTag === tag)?.status;

describe("#205 rewriteStatusInBody — pure status-field edit on the backtick body", () => {
  it("open → resolved (swaps only the value token)", () => {
    expect(rewriteStatusInBody("@open-fork: AR vs IL; status open", "resolved")).toBe(
      "@open-fork: AR vs IL; status resolved",
    );
  });
  it("resolved → open", () => {
    expect(rewriteStatusInBody("@open-fork: AR vs IL; status resolved", "open")).toBe(
      "@open-fork: AR vs IL; status open",
    );
  });
  it("absent → appends `; status <next>`", () => {
    expect(rewriteStatusInBody("@open-fork: AR vs IL", "resolved")).toBe("@open-fork: AR vs IL; status resolved");
  });
  it("absent with other fields → appends after them", () => {
    expect(rewriteStatusInBody("@fidelity-defect: x; direction over-reach", "open")).toBe(
      "@fidelity-defect: x; direction over-reach; status open",
    );
  });
  it("a `status` word in the BODY (seg0) is never matched", () => {
    expect(rewriteStatusInBody("@open-fork: status quo is unclear; status open", "resolved")).toBe(
      "@open-fork: status quo is unclear; status resolved",
    );
  });
  it("NORMALIZES the status value to the bare token (a trailing ruling is dropped — else the parser reads it as the status)", () => {
    expect(rewriteStatusInBody("@open-fork: x; status open (pending)", "resolved")).toBe(
      "@open-fork: x; status resolved",
    );
    expect(rewriteStatusInBody("@open-fork: x; status resolved (per Dr X)", "open")).toBe(
      "@open-fork: x; status open",
    );
  });
  it("preserves other fields + their spacing; only the status value changes", () => {
    expect(rewriteStatusInBody("@fidelity-defect: x; direction over-reach; status open; ref #12", "resolved")).toBe(
      "@fidelity-defect: x; direction over-reach; status resolved; ref #12",
    );
  });
  it("a lone trailing `;` before an appended status does not double up", () => {
    expect(rewriteStatusInBody("@open-fork: AR vs IL;", "open")).toBe("@open-fork: AR vs IL; status open");
  });
  it("duplicate status fields → ALL rewritten (deterministic vs the parser's last-wins)", () => {
    expect(rewriteStatusInBody("@open-fork: x; status open; status open", "resolved")).toBe(
      "@open-fork: x; status resolved; status resolved",
    );
  });
});

describe("#205 rewriteMetaStatus — full source-LINE edit, preserving everything outside the body", () => {
  it("preserves indentation, `- meta is `, backticks and the trailing `.`", () => {
    const line = "  - meta is `@open-fork: AR vs IL; status open`.";
    expect(rewriteMetaStatus(line, "resolved")).toBe("  - meta is `@open-fork: AR vs IL; status resolved`.");
  });
  it("preserves a trailing newline", () => {
    const line = "- meta is `@open-fork: x; status open`.\n";
    expect(rewriteMetaStatus(line, "resolved")).toBe("- meta is `@open-fork: x; status resolved`.\n");
  });
  it("a line with no backtick pair is returned unchanged", () => {
    expect(rewriteMetaStatus("- type is Observation.", "resolved")).toBe("- type is Observation.");
  });
});

describe("#205 ROUND-TRIP — write then re-parse; status reads back as intended", () => {
  const doc = (metaLine: string) => `library "L".
concept "C":
- type is Observation.
- meta is \`${metaLine}\`.
- code is \`c\`.
`;
  it("open → resolved: collectFlags reads resolved (drops from openFlags)", () => {
    const before = doc("@open-fork: AR vs IL; status open");
    expect(statusOf(before)).toBe("open");
    // rewrite just the meta line's inner body, reassemble the doc, re-parse.
    const after = before.replace(
      "@open-fork: AR vs IL; status open",
      rewriteStatusInBody("@open-fork: AR vs IL; status open", "resolved"),
    );
    expect(statusOf(after)).toBe("resolved");
  });
  it("absent → add resolved: reads back resolved (was open by default)", () => {
    const before = doc("@open-fork: AR vs IL");
    expect(statusOf(before)).toBe("open"); // absent status defaults open
    const after = before.replace(
      "@open-fork: AR vs IL",
      rewriteStatusInBody("@open-fork: AR vs IL", "resolved"),
    );
    expect(statusOf(after)).toBe("resolved");
  });
  it("resolved → open: reads back open", () => {
    const before = doc("@open-fork: x; status resolved");
    expect(statusOf(before)).toBe("resolved");
    const after = before.replace(
      "@open-fork: x; status resolved",
      rewriteStatusInBody("@open-fork: x; status resolved", "open"),
    );
    expect(statusOf(after)).toBe("open");
  });
  it("a status with a trailing ruling → reads back EXACTLY 'resolved' (not stuck-open — gpt55 impl review)", () => {
    const before = doc("@open-fork: x; status open (pending clinician)");
    expect(statusOf(before)).not.toBe("resolved"); // reads as "open (pending clinician)" → blocks the gate (correct)
    const after = before.replace(
      "@open-fork: x; status open (pending clinician)",
      rewriteStatusInBody("@open-fork: x; status open (pending clinician)", "resolved"),
    );
    expect(statusOf(after)).toBe("resolved"); // NOT "resolved (pending clinician)" → the gate can now clear
  });
});
