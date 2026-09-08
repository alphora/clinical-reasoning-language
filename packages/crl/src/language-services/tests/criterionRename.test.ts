import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ProjectIndex } from "../projectIndex";
import { computeRename } from "../navigation";
import { buildCRL } from "../../index";

it.each(["concept", "decision"])("renames presentation %s references without touching identical prose", (kind) => {
  const directory = mkdtempSync(join(tmpdir(), "crl-presentation-rename-"));
  try {
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "rename", crl: { canonicalBase: "https://example.org" } }));
    writeFileSync(join(directory, "other.crl"), 'library "Other".');
    const file = join(directory, "policy.crl");
    const name = kind === "concept" ? "Answer" : "Coverage";
    const source = `library "P".
concept "Answer": - type is Observation. - value type is boolean. - code is \`answer\`.
activity "Met": - request CPGCommunicationRequest. - with \`MET\`.
decision "Coverage": - when "Answer" then recommend activity "Met".
presentation for "Answer": - question text is "${name}". - in decision "Coverage".
`;
    writeFileSync(file, source);
    const edits = computeRename(file, { line: kind === "concept" ? 1 : 3, character: 12 }, "Renamed", new ProjectIndex())!;
    expect(edits).toHaveLength(kind === "concept" ? 3 : 2);
    const lines = source.split("\n");
    for (const edit of edits.sort((a, b) => b.range.startLine - a.range.startLine || b.range.startCol - a.range.startCol)) {
      const range = edit.range;
      lines[range.startLine] = lines[range.startLine].slice(0, range.startCol) + edit.newText + lines[range.endLine].slice(range.endCol);
    }
    const changed = lines.join("\n");
    expect(changed).toContain(`question text is "${name}"`);
    expect(buildCRL(changed).success).toBe(true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("renames a criterion declaration, presentation scope, nested criterion, and decision guard together", () => {
  const directory = mkdtempSync(join(tmpdir(), "crl-criterion-rename-"));
  try {
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "rename", crl: { canonicalBase: "https://example.org" } }));
    const file = join(directory, "policy.crl");
    const source = `library "P".
concept "Answer": - type is Observation. - value type is boolean. - code is \`answer\`.
criterion "Review": - when ("Answer").
criterion "Nested": - when ("Review").
presentation for "Answer": - question text is "Review". - in criterion "Review".
activity "Met": - request CPGCommunicationRequest. - with \`MET\`.
decision "D": - when "Review" then recommend activity "Met".
`;
    writeFileSync(file, source);
    writeFileSync(join(directory, "other.crl"), 'library "Other".');
    const edits = computeRename(file, { line: 2, character: 13 }, "Renamed", new ProjectIndex())!;
    expect(edits).toHaveLength(4);
    const lines = source.split("\n");
    for (const edit of edits.sort((a, b) => b.range.startLine - a.range.startLine || b.range.startCol - a.range.startCol)) {
      const range = edit.range;
      lines[range.startLine] = lines[range.startLine].slice(0, range.startCol) + edit.newText + lines[range.endLine].slice(range.endCol);
    }
    const changed = lines.join("\n");
    expect(changed.match(/"Renamed"/g)).toHaveLength(4);
    expect(changed).toContain('question text is "Review"');
    expect(buildCRL(changed).success).toBe(true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
