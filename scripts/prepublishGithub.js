#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

function run(cmd) {
  console.log(`[prepublish:github] $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function updateGitignore(removeDist) {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  let gitignore = fs.readFileSync(gitignorePath, 'utf8').split('\n');
  if (removeDist) {
    gitignore = gitignore.filter(line => !/^dist\/?$/.test(line.trim()));
  } else {
    if (!gitignore.some(line => /^dist\/?$/.test(line.trim()))) {
      gitignore.push('dist/');
    }
  }
  fs.writeFileSync(gitignorePath, gitignore.join('\n'));
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npm run prepublish:github -- <patch|minor|major|version>');
    process.exit(1);
  }

  // 1. Remove dist/ from .gitignore
  updateGitignore(true);
  console.log('[prepublish:github] Removed dist/ from .gitignore');

  // 2. Build the project
  run('npm run build');

  // 3. Add and commit dist/
  run('git add dist .gitignore');
  run('git commit -m "Include dist for GitHub release"');

  // 4. Tag (version increment or explicit version)
  run(`npm version ${arg}`);

  // 5. Push
  run('git push');
  run('git push --tags');

  // 6. Re-add dist/ to .gitignore
  updateGitignore(false);
  run('git add .gitignore');
  run('git commit -m "Restore dist/ to .gitignore after release"');
  run('git push');

  console.log('[prepublish:github] Release process complete!');
}

main(); 