const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Move files matching a pattern from srcDir to destDir.
 * @param {string} srcDir - Source directory
 * @param {RegExp|string} pattern - RegExp or string to match filenames
 * @param {string} destDir - Destination directory
 */
function moveFiles(srcDir, pattern, destDir) {
  ensureDir(destDir);
  const files = fs.readdirSync(srcDir).filter(f =>
    pattern instanceof RegExp ? pattern.test(f) : f.endsWith(pattern)
  );
  files.forEach(file => {
    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);
    fs.renameSync(src, dest);
    console.log(`Moved ${src} -> ${dest}`);
  });
}

// TODO: There must be a way to have local and github workflows use the same files
// The problem is that if you try to set the output directory for the github workflow,
// it will not be able to find the files because the files because it adds to the path
// The only way to get it to work is to build in the root directory locally.
const rootDir = path.join(__dirname, '..');
const antlrDir = path.join(__dirname, '../src/grammar/generated/antlr');
const grammarDir = path.join(__dirname, '../src/grammar');

// Move ANTLR generated files - for development builds
moveFiles(rootDir, /^CRLLexer.*\.ts$/, antlrDir);
moveFiles(rootDir, /^CRLParser.*\.ts$/, antlrDir);
moveFiles(rootDir, /\.tokens$/, antlrDir);
moveFiles(rootDir, /\.interp$/, antlrDir);

// Move ANTLR generated files - for automated builds
moveFiles(grammarDir, /^CRLLexer.*\.ts$/, antlrDir);
moveFiles(grammarDir, /^CRLParser.*\.ts$/, antlrDir);
moveFiles(grammarDir, /\.tokens$/, antlrDir);
moveFiles(grammarDir, /\.interp$/, antlrDir);