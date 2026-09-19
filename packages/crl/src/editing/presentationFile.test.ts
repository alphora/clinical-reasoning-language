import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  previewPresentationFileEdit,
  applyPresentationFileEdit,
  revertPresentationFileEdit,
  resolvePresentationFile,
} from "./presentationFile";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    renameSync: vi.fn(actual.renameSync),
    writeFileSync: vi.fn(actual.writeFileSync),
  };
});

const source =
  'library "L".\nconcept "Complaint":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `complaint`.\n- shape reduction is most recent.\npresentation for "Complaint":\n- question text is "Complaint?".\n- question description is "Details".\n';
const request = { library: "L", concept: "Complaint", questionText: "Describe the complaint?" };
const directories: string[] = [];
function fixture() {
  const projectRoot = fs.mkdtempSync(join(tmpdir(), "crl-wording-"));
  directories.push(projectRoot);
  const filePath = join(projectRoot, "src", "crl", "policy.crl");
  fs.mkdirSync(join(projectRoot, "src", "crl"), { recursive: true });
  fs.writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify({
      name: "wording",
      version: "1.0.0",
      crl: { canonicalBase: "https://example.org/wording" },
    }),
  );
  fs.writeFileSync(filePath, source);
  return { projectRoot, filePath };
}
afterEach(() => {
  vi.restoreAllMocks();
  directories.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
});

describe("project presentation editing", () => {
  it("previews without mutation and applies/reverses only the owned source", () => {
    const target = fixture(),
      other = join(target.projectRoot, "notes.txt");
    fs.writeFileSync(other, "Keep me");
    const preview = previewPresentationFileEdit(target, request);
    expect(fs.readFileSync(target.filePath, "utf8")).toBe(source);
    const applied = applyPresentationFileEdit(target, request, preview.previewToken);
    expect(fs.readFileSync(target.filePath, "utf8")).toBe(preview.candidateSource);
    expect(applied.validation.remaining).toContain("Emission presentation coexistence checks");
    revertPresentationFileEdit(JSON.parse(JSON.stringify(applied.receipt)));
    expect(fs.readFileSync(target.filePath, "utf8")).toBe(source);
    expect(fs.readFileSync(other, "utf8")).toBe("Keep me");
    expect(fs.readdirSync(join(target.projectRoot, "src", "crl"))).toEqual(["policy.crl"]);
  });
  it("refuses changed source, proposed wording and absent preview token", () => {
    const target = fixture(),
      p = previewPresentationFileEdit(target, request);
    expect(() =>
      applyPresentationFileEdit(target, { ...request, questionText: "Another?" }, p.previewToken),
    ).toThrow(/changed since preview/);
    expect(() => applyPresentationFileEdit(target, request, "")).toThrow(/changed since preview/);
    fs.appendFileSync(target.filePath, "// intervening edit\n");
    expect(() => applyPresentationFileEdit(target, request, p.previewToken)).toThrow(
      /changed since preview/,
    );
    expect(fs.readFileSync(target.filePath, "utf8")).toBe(source + "// intervening edit\n");
  });
  it.each(["configuration", "new library", "nested boundary", "dependency content"])(
    "refuses stale %s without replacing source",
    (kind) => {
      const target = fixture(),
        sibling = join(target.projectRoot, "src", "crl", "other.crl");
      if (kind === "dependency content")
        fs.writeFileSync(sibling, source.replaceAll('"L"', '"Other"'));
      const p = previewPresentationFileEdit(target, request);
      if (kind === "configuration") {
        const pkg = join(target.projectRoot, "package.json");
        const value = JSON.parse(fs.readFileSync(pkg, "utf8"));
        value.description = "Changed";
        fs.writeFileSync(pkg, JSON.stringify(value));
      }
      if (kind === "new library") fs.writeFileSync(sibling, source.replaceAll('"L"', '"Other"'));
      if (kind === "nested boundary")
        fs.writeFileSync(join(target.projectRoot, "src", "package.json"), "{}");
      if (kind === "dependency content") fs.appendFileSync(sibling, "\n// changed");
      expect(() => applyPresentationFileEdit(target, request, p.previewToken)).toThrow();
      expect(fs.readFileSync(target.filePath, "utf8")).toBe(source);
    },
  );
  it("does not silently ignore malformed local files during source validation", () => {
    const target = fixture();
    fs.writeFileSync(join(target.projectRoot, "src", "crl", "broken.crl"), "not CRL");
    expect(() => previewPresentationFileEdit(target, request)).toThrow(
      /project source\/import validation/,
    );
    expect(fs.readFileSync(target.filePath, "utf8")).toBe(source);
  });
  it("uses unsaved overlays for planning and snapshot parity, with no saved-file apply", () => {
    const target = fixture(),
      buffer = source.replace("Complaint?", "Current buffer?");
    const overlay = new Map([[target.filePath, buffer]]);
    const p = previewPresentationFileEdit(target, request, { overlays: overlay });
    expect(p.source).toBe(buffer);
    expect(p.candidateSource).toContain(request.questionText);
    expect(() => applyPresentationFileEdit(target, request, p.previewToken)).toThrow(
      /changed since preview/,
    );
    const changed = previewPresentationFileEdit(target, request, {
      overlays: new Map([[target.filePath, buffer + "\n"]]),
    });
    expect(changed.previewToken).not.toBe(p.previewToken);
    expect(fs.readFileSync(target.filePath, "utf8")).toBe(source);
  });
  it("refuses unsafe undo after an intervening owner edit", () => {
    const target = fixture(),
      p = previewPresentationFileEdit(target, request),
      a = applyPresentationFileEdit(target, request, p.previewToken);
    fs.appendFileSync(target.filePath, "// preserved\n");
    expect(() => revertPresentationFileEdit(a.receipt)).toThrow(/changed after the edit/);
    expect(fs.readFileSync(target.filePath, "utf8")).toContain("// preserved");
  });
  it("refuses wrong project, packaged source and symlink escape", () => {
    const target = fixture(),
      outside = fixture();
    expect(() => resolvePresentationFile({ ...target, filePath: outside.filePath })).toThrow(
      /inside/,
    );
    const packaged = join(target.projectRoot, "node_modules", "pkg");
    fs.mkdirSync(packaged, { recursive: true });
    fs.writeFileSync(join(packaged, "input.crl"), source);
    expect(() =>
      resolvePresentationFile({ ...target, filePath: join(packaged, "input.crl") }),
    ).toThrow(/not local editing/);
    const link = join(target.projectRoot, "linked");
    fs.symlinkSync(outside.projectRoot, link, process.platform === "win32" ? "junction" : "dir");
    expect(() =>
      resolvePresentationFile({ ...target, filePath: join(link, "src", "crl", "policy.crl") }),
    ).toThrow(/inside/);
    fs.unlinkSync(link);
  });
  it("refuses a project change between temp preparation and replacement", () => {
    const target = fixture(),
      p = previewPresentationFileEdit(target, request);
    const original = vi.mocked(fs.writeFileSync).getMockImplementation()!;
    vi.mocked(fs.writeFileSync).mockImplementationOnce(((
      ...args: Parameters<typeof fs.writeFileSync>
    ) => {
      original(...args);
      fs.appendFileSync(target.filePath, "// concurrent owner edit\n");
    }) as typeof fs.writeFileSync);
    expect(() => applyPresentationFileEdit(target, request, p.previewToken)).toThrow(
      /changed before apply/,
    );
    expect(fs.readFileSync(target.filePath, "utf8")).toBe(source + "// concurrent owner edit\n");
    expect(fs.readdirSync(join(target.projectRoot, "src", "crl"))).toEqual(["policy.crl"]);
  });
  it("a failed temp write is cleaned without touching source", () => {
    const target = fixture(),
      p = previewPresentationFileEdit(target, request);
    vi.mocked(fs.writeFileSync).mockImplementationOnce(() => {
      throw new Error("write failed after open");
    });
    expect(() => applyPresentationFileEdit(target, request, p.previewToken)).toThrow(
      /write failed after open/,
    );
    expect(fs.readFileSync(target.filePath, "utf8")).toBe(source);
    expect(fs.readdirSync(join(target.projectRoot, "src", "crl"))).toEqual(["policy.crl"]);
  });
  it("a failed rename preserves the source and cleans only its own temp", () => {
    const target = fixture(),
      p = previewPresentationFileEdit(target, request);
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("simulated write refusal");
    });
    expect(() => applyPresentationFileEdit(target, request, p.previewToken)).toThrow(
      /simulated write refusal/,
    );
    expect(fs.readFileSync(target.filePath, "utf8")).toBe(source);
    expect(fs.readdirSync(join(target.projectRoot, "src", "crl"))).toEqual(["policy.crl"]);
  });
});

test("installed package cannot become local by selecting it as the root", () => {
  const target = fixture(),
    projectRoot = join(target.projectRoot, "node_modules", "pkg");
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.copyFileSync(join(target.projectRoot, "package.json"), join(projectRoot, "package.json"));
  const filePath = join(projectRoot, "package.crl");
  fs.writeFileSync(filePath, source);
  expect(() => previewPresentationFileEdit({ projectRoot, filePath }, request)).toThrow(
    /Installed package/,
  );
  expect(fs.readFileSync(filePath, "utf8")).toBe(source);
});

test("malformed UTF-8 in a comment refuses without replacing original bytes", () => {
  const target = fixture();
  const bytes = Buffer.concat([
    Buffer.from(source + "// "),
    Buffer.from([0xff]),
    Buffer.from("\n"),
  ]);
  fs.writeFileSync(target.filePath, bytes);
  expect(() => previewPresentationFileEdit(target, request)).toThrow(/lossless UTF-8/);
  expect(fs.readFileSync(target.filePath)).toEqual(bytes);
});

test("UTF-8 BOM is preserved by saved-file apply and exact reversal", () => {
  const target = fixture();
  const original = Buffer.from("\uFEFF" + source);
  fs.writeFileSync(target.filePath, original);
  const p = previewPresentationFileEdit(target, request);
  const a = applyPresentationFileEdit(target, request, p.previewToken);
  expect(fs.readFileSync(target.filePath).subarray(0, 3)).toEqual(original.subarray(0, 3));
  revertPresentationFileEdit(a.receipt);
  expect(fs.readFileSync(target.filePath)).toEqual(original);
});

test("unpaired surrogate wording and editor overlays refuse while supplementary Unicode persists", () => {
  const target = fixture();
  expect(() =>
    previewPresentationFileEdit(target, { ...request, questionText: "Broken \ud800" }),
  ).toThrow(/lossless UTF-8/);
  expect(() =>
    previewPresentationFileEdit(target, request, {
      overlays: new Map([[target.filePath, source + "// \udfff"]]),
    }),
  ).toThrow(/lossless UTF-8/);
  expect(fs.readFileSync(target.filePath, "utf8")).toBe(source);
  const good = { ...request, questionText: "Question \ud83e\ude7a?" };
  const p = previewPresentationFileEdit(target, good);
  const a = applyPresentationFileEdit(target, good, p.previewToken);
  expect(fs.readFileSync(target.filePath, "utf8")).toBe(p.candidateSource);
  revertPresentationFileEdit(a.receipt);
  expect(fs.readFileSync(target.filePath, "utf8")).toBe(source);
});
