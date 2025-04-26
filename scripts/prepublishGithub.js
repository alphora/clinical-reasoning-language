#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const crypto = require('crypto');

function run(cmd) {
  console.log(`[prepublish:github] $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function tryRun(cmd) {
  try {
    run(cmd);
    return true;
  } catch (e) {
    console.warn(`[prepublish:github] Command failed: ${cmd}\n${e}`);
    return false;
  }
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function updateGitignore(removeDist) {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  const originalContent = fs.readFileSync(gitignorePath, 'utf8');
  const originalHash = hashContent(originalContent);

  let gitignoreLines = originalContent.split('\n');
  const normalizedLines = gitignoreLines.map(line => line.trim());
  const distIndex = normalizedLines.findIndex(line => line === 'dist/' || line === 'dist');

  if (removeDist) {
    if (distIndex !== -1) {
      gitignoreLines = gitignoreLines.filter((_, idx) => idx !== distIndex);
      fs.writeFileSync(gitignorePath, gitignoreLines.join('\n'));
      console.log('[prepublish:github] Removed dist/ from .gitignore');
    } else {
      console.log('[prepublish:github] dist/ was not in .gitignore, no changes needed.');
    }
  } else {
    if (distIndex === -1) {
      gitignoreLines.push('dist/');
      fs.writeFileSync(gitignorePath, gitignoreLines.join('\n'));
      console.log('[prepublish:github] Added dist/ back to .gitignore');
    } else {
      console.log('[prepublish:github] dist/ already present in .gitignore, no changes needed.');
    }
  }

  const updatedContent = fs.readFileSync(gitignorePath, 'utf8');
  const updatedHash = hashContent(updatedContent);

  const modified = originalHash !== updatedHash;
  if (modified) {
    console.log('[prepublish:github] .gitignore was modified.');
  } else {
    console.log('[prepublish:github] .gitignore remained unchanged.');
  }

  return modified;
}

function rollbackGitignore(originalContent) {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  const currentContent = fs.readFileSync(gitignorePath, 'utf8');

  if (currentContent !== originalContent) {
    fs.writeFileSync(gitignorePath, originalContent);
    console.warn('[prepublish:github] Rolled back .gitignore to original state.');
  } else {
    console.log('[prepublish:github] No rollback needed for .gitignore (unchanged).');
  }
}

function isWorkingDirectoryClean() {
  const status = execSync('git status --porcelain').toString().trim();
  return status === '';
}

function isBranchUpToDate() {
  execSync('git fetch');
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
    console.error('[prepublish:github] WARNING: Tag set after rollback does not match original.');
    if (missingTags.length > 0) console.error(`Missing tags: ${missingTags.join(', ')}`);
    if (extraTags.length > 0) console.error(`Extra tags: ${extraTags.join(', ')}`);
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
  if (currentRemoteCommit !== originalRemoteCommit) {
    console.error(`[prepublish:github] CRITICAL: Remote commit after rollback (${currentRemoteCommit}) does not match original remote commit (${originalRemoteCommit})! Manual intervention required.`);
  } else {
    console.log('[prepublish:github] Post-rollback verification: remote state matches original.');
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

  const originalCommit = execSync('git rev-parse HEAD').toString().trim();
  const branch = getCurrentBranch();
  const originalRemoteCommit = getRemoteCommit(branch);
  const originalGitignore = fs.readFileSync('.gitignore', 'utf8');
  const originalLocalTags = getLocalTags();
  const originalVersion = getPackageJsonVersion();

  // Rollback flags
  let gitignoreModified = false;
  let distCommitted = false;
  let versionTagged = false;
  let versionBumpCommit = null;
  let tagsPushed = false;
  let taggedVersion = null;

  try {
    // 1. Update .gitignore if needed
    gitignoreModified = updateGitignore(true);

    // 2. Build
    run('npm run build');

    // 3. Add and commit dist/ + .gitignore
    run('git add dist .gitignore');
    run('git commit -m "Include dist for GitHub Publish"');
    distCommitted = true;

    // 4. Bump version and tag
    run(`npm version ${arg}`);
    taggedVersion = require(path.join(process.cwd(), 'package.json')).version;
    versionBumpCommit = execSync('git rev-parse HEAD').toString().trim();
    versionTagged = true;

    // 5. Push commits and tags
    run('git push');
    run('git push --tags');
    tagsPushed = true;

    // 6. Restore .gitignore
    if (gitignoreModified) {
      updateGitignore(false);
      run('git add .gitignore');
      run('git commit -m "Restore dist/ to .gitignore after GitHub Publish"');
      run('git push');
    }

    console.log('[prepublish:github] Release process complete!');
  } catch (err) {
    console.warn('[prepublish:github] Error occurred, starting rollback...');
    if (tagsPushed && taggedVersion) {
      tryRun(`git push --delete origin v${taggedVersion}`);
    }
    if (versionTagged && versionBumpCommit) {
      tryRun(`git reset --hard ${originalCommit}`);
    }
    if (distCommitted) {
      tryRun('git reset --hard HEAD~1');
    }
    if (gitignoreModified) {
      rollbackGitignore(originalGitignore);
      tryRun('git add .gitignore');
      tryRun('git commit -m "Restore .gitignore after failed prepublish:github"');
      tryRun('git push');
    }
    verifyPostRollback(originalCommit, originalVersion, originalLocalTags);
    verifyRemotePostRollback(originalRemoteCommit, branch);
    console.error('[prepublish:github] Release failed. All possible changes rolled back.');
    console.error(err);
    process.exit(1);
  }
}

main();
