// Real-index integration for CEL completion (#4 slice 1). The unit tests use a fake index; this builds a
// REAL ProjectIndex over a temp fixture (2 .crl → isCrlProject; covered "Lib" + a sibling "Other") to prove
// the end-to-end paths the fake index can't: decision `arms` populated by the real index, cross-library
// qualified `defined by`, and getAllProjectDeclarations surfacing sibling libs (localLibraries).
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildCEL } from "../../cel";
import { ProjectIndex } from "../projectIndex";
import { computeCelCompletion, celDocContext } from "../celCompletion";

const LIB = [
  "# Lib",
  'library "Lib".',
  'concept "Nonunion":',
  "- type is Condition.",
  "- code is `n`.",
  'concept "IsBool":',
  "- type is Observation.",
  "- value type is boolean.",
  "- code is `ib`.",
  'activity "SomeActivity":',
  "- request CPGServiceRequest.",
  "- with `x`.",
  'activity "Approve":',
  "- request CPGServiceRequest.",
  "- with `a`.",
  'activity "Deny":',
  "- request CPGServiceRequest.",
  "- with `d`.",
  'decision "Coverage":',
  "first:",
  '- when "Nonunion" then recommend activity "Approve".',
  '- otherwise then recommend activity "Deny".',
].join("\n");

const OTHER = ["# Other", 'library "Other".', 'concept "OtherConcept":', "- type is Condition.", "- code is `o`."].join("\n");

const CEL = [
  "# Cases",
  'library "Cases".',
  'covers "Lib".',
  'fact "fA":',
  '- code is "http://x|a".',
  '- defined by "Patient".',
  'fact "fB":',
  '- code is "http://x|b".',
  '- defined by "Lib"."Nonunion".',
  'case "c1":',
  '- subject is "fA".',
  '- result is "Coverage" is "Approve".',
].join("\n");

describe("computeCelCompletion — real ProjectIndex integration (#4)", () => {
  let root: string;
  let index: ProjectIndex;
  let folders: string[];

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "crl-cel-comp-"));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "tmp", version: "0.0.0" }));
    fs.writeFileSync(path.join(root, "lib.crl"), LIB);
    fs.writeFileSync(path.join(root, "other.crl"), OTHER);
    fs.writeFileSync(path.join(root, "cases.cel"), CEL);
    index = new ProjectIndex();
    folders = [root];
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  const built = () => {
    const b = buildCEL(CEL);
    if (!b.success || !b.result) throw new Error("fixture CEL did not parse");
    return celDocContext(b.result);
  };
  const labels = (prefix: string) =>
    computeCelCompletion(prefix, built(), index, folders, ["Condition", "Observation"]).map((i) => i.label);

  it("library slot → all project .crl libraries (covered + sibling)", () => {
    expect(labels('covers "')).toEqual(["Lib", "Other"]);
  });
  it("fact slot → the .cel's own facts", () => {
    expect(labels('- subject is "')).toEqual(["fA", "fB"]);
  });
  it("qualified defined by → the library's concepts + activities", () => {
    expect(labels('- defined by "Lib"."')).toEqual(["Approve", "Deny", "IsBool", "Nonunion", "SomeActivity"]);
  });
  it("cross-library qualified defined by → the SIBLING library's symbols (localLibraries path)", () => {
    expect(labels('- defined by "Other"."')).toEqual(["OtherConcept"]);
  });
  it("leaf slot → covered library's decisions + concepts", () => {
    expect(labels('- result is "')).toEqual(["Coverage", "IsBool", "Nonunion"]);
  });
  it("result-arm (quoted) for a decision → its arms (populated by the REAL index)", () => {
    expect(labels('- result is "Coverage" is "')).toEqual(["Approve", "Deny"]);
  });
  it("result-bool (bare) → true/false (the concept boolean syntax `is true`)", () => {
    expect(labels('- result is "IsBool" is ')).toEqual(["true", "false"]);
  });
});
