// #vitest-unification T1 — the crl project's setup file, porting jest.setup.js (which mocks console.error so expected-error
// test paths don't spam the reporter). `vi` replaces jest's global. Kept alongside jest.setup.js until T2 removes jest.
import { beforeAll, vi } from "vitest";

beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
