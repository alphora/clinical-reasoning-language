#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

function run(cmd) {
  console.log(`[prepublish:github] $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function tryRun(cmd) {
  try {
    run(cmd);
    return true;
  } catch (e) {
    // Log the error for debugging purposes
    console.warn(`[prepublish:github] Command failed: ${cmd}\n${e}`);
    return false;
  }
}

function updateGitignore(removeDist) {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  let gitignore = fs.readFileSync(gitignorePath, 'utf8').split('\n');
  if (removeDist) {
    gitignore = gitignore.filter(line => !/^dist\/?$/.test(line.trim()));
  } 
  if (!removeDist) {
    if (!gitignore.some(line => /^dist\/?$/.test(line.trim()))) {
      gitignore.push('dist/');
    }
  }
  fs.writeFileSync(gitignorePath, gitignore.join('\n'));
}

function rollback(steps) {
  for (const step of steps.reverse()) {
    try {
      step();
    } catch (e) {
      // Log rollback errors for visibility
      console.warn('[prepublish:github] Rollback step failed:', e);
    }
  }
}

function isWorkingDirectoryClean() {
  const status = execSync('git status --porcelain').toString().trim();
  return status === '';
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npm run prepublish:github -- <patch|minor|major|version>');
    process.exit(1);
  }

  if (!isWorkingDirectoryClean()) {
    console.error('[prepublish:github] Working directory is not clean. Please commit, stash, or discard your changes before running this script.');
    process.exit(1);
  }

  const rollbackSteps = [];
  let taggedVersion = null;
  let versionBumpCommit = null;
  let tagsPushed = false;

  try {
    // 1. Remove dist/ from .gitignore
    updateGitignore(true);
    rollbackSteps.push(() => {
      console.warn('[prepublish:github] Rolling back: restoring .gitignore');
      updateGitignore(false);
      run('git add .gitignore');
      tryRun('git commit -m "Restore dist/ to .gitignore after failed release"');
    });
    console.log('[prepublish:github] Removed dist/ from .gitignore');

    // 2. Build the project
    run('npm run build');

    // 3. Add and commit dist/
    run('git add dist .gitignore');
    run('git commit -m "Include dist for GitHub release"');
    rollbackSteps.push(() => {
      console.warn('[prepublish:github] Rolling back: resetting commit that included dist/');
      tryRun('git reset --hard HEAD~1');
    });

    // 4. Tag (version increment or explicit version)
    run(`npm version ${arg}`);
    taggedVersion = require(path.join(process.cwd(), 'package.json')).version;
    // Get the commit hash of the version bump
    versionBumpCommit = execSync('git rev-parse HEAD').toString().trim();
    rollbackSteps.push(() => {
      if (taggedVersion) {
        console.warn(`[prepublish:github] Rolling back: deleting tag v${taggedVersion}`);
        tryRun(`git tag -d v${taggedVersion}`);
        tryRun(`git push --delete origin v${taggedVersion}`);
      }
      if (versionBumpCommit) {
        console.warn('[prepublish:github] Rolling back: resetting version bump commit');
        tryRun('git reset --hard HEAD~1');
      }
    });

    // 5. Push
    run('git push');
    run('git push --tags');
    tagsPushed = true;
    rollbackSteps.push(() => {
      if (tagsPushed && taggedVersion) {
        console.warn('[prepublish:github] WARNING: Tags were pushed to remote. Attempting to delete remote tag. Manual intervention may be required.');
        tryRun(`git push --delete origin v${taggedVersion}`);
      } else {
        console.warn('[prepublish:github] WARNING: Changes were pushed to remote. Manual intervention may be required to fully rollback.');
      }
    });

    // 6. Re-add dist/ to .gitignore
    updateGitignore(false);
    run('git add .gitignore');
    run('git commit -m "Restore dist/ to .gitignore after release"');
    run('git push');

    console.log('[prepublish:github] Release process complete!');
  } catch (err) {
    console.warn('[prepublish:github] Error occurred, starting rollback...');
    rollback(rollbackSteps);
    console.error('[prepublish:github] Release failed. All possible changes rolled back.');
    console.error(err);
    process.exit(1);
  }
}

main(); 