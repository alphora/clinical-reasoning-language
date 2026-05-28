import { tokenizeCRL, buildCRL } from "@smile-digital-health/crl";
import { readFileSync } from "node:fs";

// Todo 1: minimal standalone entry proving the bundled CRL functions execute
// outside the repo (the antlr4ts ATN deserializes lazily on first lex/parse).
// The real MCP stdio server is wired in todo 2.
function selfTest(fixturePath?: string): number {
  const sample = 'decision "T":\n  - when "C" then recommend activity "A".\n';
  const tok = tokenizeCRL(sample);
  const lexOk =
    tok.success === true && Array.isArray(tok.result) && tok.result.length > 0;

  let buildOk: boolean;
  let report: Record<string, unknown>;
  if (fixturePath) {
    // Strong check (build-time): a known-valid CRL document must build to an AST.
    const built = buildCRL(readFileSync(fixturePath, "utf8"));
    buildOk = built.success === true;
    report = { lexOk, buildOk, fixture: fixturePath };
  } else {
    // Standalone: assert the build path runs and returns a well-formed result.
    const built = buildCRL(sample);
    buildOk = typeof built.success === "boolean";
    report = { lexOk, buildRan: buildOk, tokenCount: tok.result?.length ?? 0 };
  }

  const ok = lexOk && buildOk;
  process.stdout.write(JSON.stringify({ ok, ...report }) + "\n");
  return ok ? 0 : 1;
}

if (process.argv.includes("--selftest")) {
  const fi = process.argv.indexOf("--file");
  const fixture = fi !== -1 ? process.argv[fi + 1] : undefined;
  process.exit(selfTest(fixture));
}
