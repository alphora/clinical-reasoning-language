// ⚠ FORCE THE BUILD BEFORE THIS PROJECT'S SUITES RUN.
//
// The crl-vscode suites do NOT run against source. They import `@smile-digital-health/crl` — which resolves to
// the BUILT `packages/crl/dist` — and several spawn the esbuild-bundled `dist/mcp-server.js`. So without a build
// they test whatever was compiled last, which may be a different commit entirely.
//
// MEASURED, 2026-08-31: that is not theoretical. `99f70207` made `crl.canonicalBase` required and removed the
// name-presence fallback, which broke 66 tests in this project — and the full-suite run stayed GREEN, because
// `dist` predated the change. The failures only appeared when someone happened to rebuild. A gate that reports
// green against a stale artifact is worse than no gate: every "suite is green" claim in between was false.
//
// `npm run compile` runs `precompile` → `build:crl` (tsc + catalog copy) → `typecheck` → esbuild, so this single
// call refreshes BOTH the core dist these suites import and the bundles they spawn.
//
// Scoped to the crl-vscode project only (see the root vitest config): the `crl` project runs its own TypeScript
// sources through vitest's transform and needs no build, so `--project crl` pays nothing for this.
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export default function setup() {
  // `execSync` (a shell), NOT `execFileSync`: on Windows `npm` is `npm.cmd`, and Node refuses to spawn a `.cmd`
  // without a shell (EINVAL, the CVE-2024-27980 hardening). The command is a fixed literal with nothing
  // interpolated into it, so the shell buys portability without buying an injection surface.
  //
  // `stdio: "inherit"` on purpose — a build failure must be readable in the test output, not swallowed into a
  // bare non-zero exit.
  execSync("npm run compile", { cwd: pkgRoot, stdio: "inherit" });
}
