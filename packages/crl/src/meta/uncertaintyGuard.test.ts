import { describe, expect, it } from "vitest";
import { parseInput } from "../ast/tests/parseInput";
import type { MetaEntry } from "../ast/types";
import { validateCRL } from "../index";
import { uncertaintyGuardMetadata } from "./uncertaintyGuard";

// REFACTOR:grounded: only explicit, uniquely typed author metadata enables the view role.
const entries = (...text: string[]): MetaEntry[] => text.map(text => ({ text, location: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } } }));
const tag = (pass: string) => `@tree-uncertainty-guard: Terminal check; pass ${pass}`;

describe("uncertainty guard metadata", () => {
  // @kit uncertainty-guard-display:explicit-marker
  it.each([true, false])("decodes explicit pass polarity %s without inspecting names or body", passWhen => {
    expect(uncertaintyGuardMetadata(entries(tag(String(passWhen))))).toEqual({ kind: "guard", passWhen });
    expect(uncertaintyGuardMetadata(entries("a note about Uncertainty"))).toEqual({ kind: "absent" });
  });
  it.each([
    "@tree-uncertainty-guard: missing pass",
    tag("maybe"),
    tag("true") + "; pass false",
    tag("true") + "; status open",
    "@Tree-uncertainty-guard: malformed; pass true",
  ])("fails closed for %s", value => {
    expect(uncertaintyGuardMetadata(entries(value))).toEqual({ kind: "invalid" });
  });
  it("refuses duplicate annotations rather than choosing one", () => {
    expect(uncertaintyGuardMetadata(entries(tag("true"), tag("false")))).toEqual({ kind: "invalid" });
  });
  // @kit uncertainty-guard-display:criterion-annotation
  it.each([true, false])("retains criterion metadata and description in either order (%s)", first => {
    const lines = ["- description is \"Explanation\".", `- meta is \`${tag("false")}\`.`];
    if (!first) lines.reverse();
    const ast = parseInput(`library "T". criterion "Check": ${lines.join("\n")} - when ("Q").`);
    const node = ast.statements[0];
    expect(node.type).toBe("Criterion");
    if (node.type !== "Criterion") throw new Error("Expected criterion");
    expect(node.description).toBe("Explanation");
    expect(uncertaintyGuardMetadata(node.meta)).toEqual({ kind: "guard", passWhen: false });
    expect(() => parseInput(`library "T". criterion "Check": ${lines.join("\n")} - description is "Duplicate". - when ("Q").`)).toThrow(/only once/);
  });
  // @kit uncertainty-guard-display:target-validation
  it.each(["library", "decision", "string"])("refuses %s as a display guard target", kind => {
    const meta = `- meta is \`${tag("false")}\`.`;
    const source = kind === "library" ? `library "T". ${meta}` : kind === "decision"
      ? `library "T". activity "A": - request CPGTaskRequest. - with \`A\`. decision "D": ${meta} - when "Q" then recommend activity "A".`
      : `library "T". concept "Q": - shape is Record. - type is Observation. - value type is string. ${meta} - shape reduction is most recent.`;
    expect(validateCRL(source).errors.map(e => e.kind)).toContain("meta-invalid-target");
  });
  it.each(["true", "false"])("accepts a Boolean concept with pass %s", pass => {
    const result = validateCRL(`library "T". concept "Q": - shape is Record. - type is Observation. - value type is boolean. - code is \`q\`. - meta is \`${tag(pass)}\`. - shape reduction is most recent.`);
    expect((result.errors ?? []).filter(e => e.kind.startsWith("meta-"))).toEqual([]);
  });
});
