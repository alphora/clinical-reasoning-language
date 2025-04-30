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
  console.log(`[DEBUGGING] Scanning directory: ${srcDir}`);
  console.log(`[DEBUGGING] Using pattern: ${pattern instanceof RegExp ? pattern.toString() : pattern}`);
  const files = fs.readdirSync(srcDir).filter(f =>
    pattern instanceof RegExp ? pattern.test(f) : f.endsWith(pattern)
  );
  if (files.length === 0) {
    console.log(`[DEBUGGING] No files matched pattern in ${srcDir}`);
  } else {
    console.log(`[DEBUGGING] Files to move: ${files.join(', ')}`);
  }
  files.forEach(file => {
    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);
    fs.renameSync(src, dest);
    console.log(`[DEBUGGING] Moved ${src} -> ${dest}`);
  });
  console.log(`[DEBUGGING] Moved ${files.length} file(s) from ${srcDir} to ${destDir} for pattern ${pattern instanceof RegExp ? pattern.toString() : pattern}`);
}

// TODO: There must be a way to have local and github workflows use the same files
// The problem is that if you try to set the output directory for the github workflow,
// it will not be able to find the files because it adds to the path.
// The only way to get it to work is to build in the root directory locally 
// so when it adds to the path it is correct.
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