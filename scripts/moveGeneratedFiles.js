const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function moveFiles(pattern, destDir) {
  ensureDir(destDir);
  const srcDir = path.dirname(pattern);
  const ext = path.extname(pattern);
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith(ext));
  files.forEach(file => {
    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);
    fs.renameSync(src, dest); // Move (use fs.copyFileSync for copy)
    console.log(`Moved ${src} -> ${dest}`);
  });
}

// Move ANTLR generated files
moveFiles('CRLLexer*.ts', 'src/grammar/generated/antlr');
moveFiles('CRLParser*.ts', 'src/grammar/generated/antlr');
moveFiles('*.tokens', 'src/grammar/generated/antlr');
moveFiles('*.interp', 'src/grammar/generated/antlr');