// #vitest-unification T2 — the crl project's setup file. Ports jest.setup.js (console.error mock so expected-error test
// paths don't spam the reporter). `vi` replaces jest's global.
// NOTE: we do NOT `process.chdir` to restore jest's cwd=packages/crl — chdir breaks vitest's own runner resolution (it
// resolves internal modules relative to cwd). The handful of execSync `npm run cli:*` suites that relied on that cwd pass an
// explicit `cwd` (see CRL_PKG_ROOT in those files) instead.
import { beforeAll, vi } from "vitest";

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
