// Pre-flight for the extension build. The extension consumes the core package
// `@smile-digital-health/crl` as an npm workspace dependency (packages/crl),
// which npm links into node_modules. If the link is missing/stale (e.g. before
// `npm install`, or after a repo move) or core's dist is unbuilt, this guard
// turns the otherwise-cryptic downstream tsc/esbuild failure into a clear action.
try {
  const entry = require.resolve("@smile-digital-health/crl"); // throws if junction is missing/stale
  require("fs").accessSync(entry); // throws if core's built dist is absent
} catch (e) {
  console.error(
    "\n[crl] Core package `@smile-digital-health/crl` is not resolvable/built.\n" +
      "  At the repo root:  npm install                                  (links the workspace dep)\n" +
      "  At the repo root:  npm run build -w @smile-digital-health/crl   (builds core)\n"
  );
  process.exit(1);
}
