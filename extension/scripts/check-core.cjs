// Pre-flight for the extension build. The extension consumes the core package
// `@smile-digital-health/crl` via a `file:..` dependency, which npm links as a
// junction (extension/node_modules/@smile-digital-health/crl -> repo root). That
// junction stores an ABSOLUTE path, so it breaks if the repo directory moves
// (e.g. a drive change); `npm install` in extension/ regenerates it. This guard
// turns the otherwise-cryptic downstream tsc/esbuild failure into a clear action.
try {
  const entry = require.resolve("@smile-digital-health/crl"); // throws if junction is missing/stale
  require("fs").accessSync(entry); // throws if core's built dist is absent
} catch (e) {
  console.error(
    "\n[crl] Core package `@smile-digital-health/crl` is not resolvable/built.\n" +
      "  From extension/:  npm install     (relinks the file:.. junction to core)\n" +
      "  From repo root:   npm run build    (builds core's dist)\n"
  );
  process.exit(1);
}
