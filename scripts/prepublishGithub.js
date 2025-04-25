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

function isBranchUpToDate() {
  // Fetch latest remote info
  execSync('git fetch');
  // Check if local branch is behind remote
  const status = execSync('git status -uno').toString();
  return !status.includes('Your branch is behind');
}

function getCurrentBranch() {
  return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
}

function getRemoteCommit(branch) {
  return execSync(`git rev-parse origin/${branch}`).toString().trim();
}

function getRemoteTags() {
  return execSync('git ls-remote --tags origin')
    .toString()
    .split('\n')
    .map(line => line.split('\t')[1])
    .filter(Boolean)
    .map(ref => ref.replace('refs/tags/', ''));
}

function getLocalTags() {
  return execSync('git tag').toString().split('\n').filter(Boolean);
}

function getPackageJsonVersion() {
  return require(path.join(process.cwd(), 'package.json')).version;
}

function verifyPostRollback(originalCommit, originalVersion, originalLocalTags) {
  const currentCommit = execSync('git rev-parse HEAD').toString().trim();
  const currentVersion = getPackageJsonVersion();
  const currentTags = getLocalTags();
  let ok = true;
  if (currentCommit !== originalCommit) {
    console.error(`[prepublish:github] WARNING: Commit hash after rollback (${currentCommit}) does not match original (${originalCommit})!`);
    ok = false;
  }
  if (currentVersion !== originalVersion) {
    console.error(`[prepublish:github] WARNING: package.json version after rollback (${currentVersion}) does not match original (${originalVersion})!`);
    ok = false;
  }
  const missingTags = originalLocalTags.filter(tag => !currentTags.includes(tag));
  const extraTags = currentTags.filter(tag => !originalLocalTags.includes(tag));
  if (missingTags.length > 0 || extraTags.length > 0) {
    console.error(`[prepublish:github] WARNING: Tag set after rollback does not match original.`);
    if (missingTags.length > 0) console.error(`[prepublish:github] Missing tags: ${missingTags.join(', ')}`);
    if (extraTags.length > 0) console.error(`[prepublish:github] Extra tags: ${extraTags.join(', ')}`);
    ok = false;
  }
  if (ok) {
    console.log('[prepublish:github] Post-rollback verification: local state matches original.');
  } else {
    console.error('[prepublish:github] Post-rollback verification: local state does NOT match original. Manual intervention may be required.');
  }
}

function verifyRemotePostRollback(originalRemoteCommit, branch) {
  const currentRemoteCommit = getRemoteCommit(branch);
  let ok = true;
  if (currentRemoteCommit !== originalRemoteCommit) {
    console.error(`[prepublish:github] CRITICAL: Remote commit after rollback (${currentRemoteCommit}) does not match original remote commit (${originalRemoteCommit})! Manual intervention required.`);
    ok = false;
  }
  if (ok) {
    console.log('[prepublish:github] Post-rollback verification: remote state matches original.');
  } else {
    console.error('[prepublish:github] Post-rollback verification: remote state does NOT match original.');
  }
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

  if (!isBranchUpToDate()) {
    console.error('[prepublish:github] Local branch is behind the remote. Please pull the latest changes before running this script.');
    process.exit(1);
  }

  // --- Record initial state ---
  const originalCommit = execSync('git rev-parse HEAD').toString().trim();
  const branch = getCurrentBranch();
  const originalRemoteCommit = getRemoteCommit(branch);
  const originalGitignore = fs.readFileSync('.gitignore', 'utf8');
  const originalRemoteTags = getRemoteTags();
  const originalLocalTags = getLocalTags();
  const originalVersion = getPackageJsonVersion();

  const rollbackSteps = [];
  let taggedVersion = null;
  let versionBumpCommit = null;
  let tagsPushed = false;
  let newTags = [];

  try {
    // 1. Remove dist/ from .gitignore
    updateGitignore(true);
    rollbackSteps.push(() => {
      console.warn('[prepublish:github] Rolling back: restoring .gitignore');
      updateGitignore(false);
      tryRun('git add .gitignore');
      // Only commit if there are staged changes
      const status = require('child_process').execSync('git diff --cached --name-only').toString().trim();
      if (status) {
        tryRun('git commit -m "Restore dist/ to .gitignore after failed prepublish:github"');
      } else {
        console.warn('[prepublish:github] No staged changes to commit for .gitignore rollback.');
      }
    });
    console.log('[prepublish:github] Removed dist/ from .gitignore');

    // 2. Build the project
    run('npm run build');

    // 3. Add and commit dist/ and all generated files
    run('git add dist src/grammar/generated/antlr src/grammar/generated/types .gitignore');
    run('git commit -m "Include dist and generated files for GitHub Publish"');
    rollbackSteps.push(() => {
      console.warn('[prepublish:github] Rolling back: resetting commit that included dist/');
      tryRun('git reset --hard HEAD~1');
    });

    // 4. Tag (version increment or explicit version)
    run(`npm version ${arg}`);
    taggedVersion = require(path.join(process.cwd(), 'package.json')).version;
    versionBumpCommit = execSync('git rev-parse HEAD').toString().trim();
    // Track new local tags
    newTags = getLocalTags().filter(tag => !originalLocalTags.includes(tag));
    rollbackSteps.push(() => {
      if (taggedVersion) {
        console.warn(`[prepublish:github] Rolling back: deleting tag v${taggedVersion}`);
        tryRun(`git tag -d v${taggedVersion}`);
        tryRun(`git push --delete origin v${taggedVersion}`);
      }
      if (versionBumpCommit) {
        console.warn('[prepublish:github] Rolling back: resetting version bump commit');
        tryRun(`git reset --hard ${originalCommit}`);
      }
      // Delete any new local tags
      for (const tag of newTags) {
        if (!originalLocalTags.includes(tag)) {
          console.warn(`[prepublish:github] Rolling back: deleting new local tag ${tag}`);
          tryRun(`git tag -d ${tag}`);
        }
      }
    });

    // 5. Push
    run('git push');
    run('git push --tags');
    tagsPushed = true;
    rollbackSteps.push(() => {
      if (tagsPushed) {
        if (process.env.NO_FORCE_ROLLBACK === '1') {
          console.warn('[prepublish:github] Skipping remote force-push rollback due to NO_FORCE_ROLLBACK=1. Manual intervention required to restore remote state.');
        } else {
          console.warn('[prepublish:github] WARNING: Force-pushing original remote commit to remote branch to complete rollback. This will overwrite remote history!');
          tryRun(`git push --force origin ${originalRemoteCommit}:${branch}`);
          // Delete any new remote tags
          const currentRemoteTags = getRemoteTags();
          for (const tag of currentRemoteTags) {
            if (!originalRemoteTags.includes(tag)) {
              console.warn(`[prepublish:github] Rolling back: deleting new remote tag ${tag}`);
              tryRun(`git push --delete origin ${tag}`);
            }
          }
        }
      }
    });

    // 6. Re-add dist/ to .gitignore
    updateGitignore(false);
    run('git add .gitignore');
    run('git commit -m "Restore dist/ to .gitignore after GitHub Publish"');
    run('git push');

    console.log('[prepublish:github] Release process complete!');
  } catch (err) {
    console.warn('[prepublish:github] Error occurred, starting rollback...');
    // --- Full transactional rollback ---
    // Restore .gitignore
    fs.writeFileSync('.gitignore', originalGitignore);
    rollback(rollbackSteps);
    verifyPostRollback(originalCommit, originalVersion, originalLocalTags);
    verifyRemotePostRollback(originalRemoteCommit, branch);
    console.error('[prepublish:github] Release failed. All possible changes rolled back.');
    console.error(err);
    process.exit(1);
  }
}

main(); 