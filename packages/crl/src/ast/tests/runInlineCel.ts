import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveCelImports } from "../../cel/imports";
import { runCel } from "../../cre/run";

/** Exercise the normal project/record-emission boundary with inline test sources. */
export function runInlineCel(crl: string, cel: string): ReturnType<typeof runCel> {
  const parent = path.resolve(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(parent, "crl-ast-records-"));
  if (path.dirname(dir) !== parent || !path.basename(dir).startsWith("crl-ast-records-")) throw new Error("Unexpected temporary path");
  try {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "ast-records", version: "1.0.0", crl: { canonicalBase: "http://example.org/crl/test" } }));
    fs.writeFileSync(path.join(dir, "policy.crl"), crl);
    const celPath = path.join(dir, "cases.cel");
    fs.writeFileSync(celPath, cel);
    return runCel(resolveCelImports(celPath));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
