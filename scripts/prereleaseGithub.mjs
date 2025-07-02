#!/usr/bin/env node
import { execSync } from "child_process";
import { createRequire } from "module";
import path from "path";

const require = createRequire(import.meta.url);

function run(cmd) {
  console.log(`[prerelease] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function tryRun(cmd) {
  try {
    run(cmd);
    return true;
  } catch (e) {
    console.warn(`[prerelease] Command failed: ${cmd}\n${e}`);
    return false;
  }
}

function getCurrentBranch() {
  return execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
}

function getRemoteCommit(branch) {
  return execSync(`git rev-parse origin/${branch}`).toString().trim();
}

function getLocalTags() {
  return execSync("git tag").toString().split("\n").filter(Boolean);
}

function getPackageJsonVersion() {
  return require(path.join(process.cwd(), "package.json")).version;
}

function isWorkingDirectoryClean() {
  // Check git status from repository root
  const rootDir = execSync("git rev-parse --show-toplevel").toString().trim();
  const status = execSync("git status --porcelain", { cwd: rootDir }).toString().trim();
  return status === "";
}

function isBranchUpToDate() {
  const rootDir = execSync("git rev-parse --show-toplevel").toString().trim();
  execSync("git fetch", { cwd: rootDir });
  const status = execSync("git status -uno", { cwd: rootDir }).toString();
  return !status.includes("Your branch is behind");
}

function verifyPostRollback(originalCommit, originalVersion, originalLocalTags) {
  const rootDir = execSync("git rev-parse --show-toplevel").toString().trim();
  const currentCommit = execSync("git rev-parse HEAD", { cwd: rootDir }).toString().trim();
  const currentVersion = getPackageJsonVersion();
  const currentTags = getLocalTags();
  let ok = true;

  if (currentCommit !== originalCommit) {
    console.error(
      `[prerelease] WARNING: Commit hash after rollback (${currentCommit}) does not match original (${originalCommit})!`,
    );
    ok = false;
  }
  if (currentVersion !== originalVersion) {
    console.error(
      `[prerelease] WARNING: package.json version after rollback (${currentVersion}) does not match original (${originalVersion})!`,
    );
    ok = false;
  }
  const missingTags = originalLocalTags.filter((tag) => !currentTags.includes(tag));
  const extraTags = currentTags.filter((tag) => !originalLocalTags.includes(tag));
  if (missingTags.length > 0 || extraTags.length > 0) {
    console.error("[prerelease] WARNING: Tag set after rollback does not match original.");
    if (missingTags.length > 0) console.error(`Missing tags: ${missingTags.join(", ")}`);
    if (extraTags.length > 0) console.error(`Extra tags: ${extraTags.join(", ")}`);
    ok = false;
  }
  if (ok) {
    console.log("[prerelease] Post-rollback verification: local state matches original.");
  } else {
    console.error(
      "[prerelease] Post-rollback verification: local state does NOT match original. Manual intervention may be required.",
    );
  }
}

function verifyRemotePostRollback(originalRemoteCommit, branch) {
  const currentRemoteCommit = getRemoteCommit(branch);
  if (currentRemoteCommit !== originalRemoteCommit) {
    console.error(
      `[prerelease] CRITICAL: Remote commit after rollback (${currentRemoteCommit}) does not match original remote commit (${originalRemoteCommit})! Manual intervention required.`,
    );
  } else {
    console.log("[prerelease] Post-rollback verification: remote state matches original.");
  }
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: npm run prerelease -- <patch|minor|major|version>");
    process.exit(1);
  }

  if (!isWorkingDirectoryClean()) {
    console.error(
      "[prerelease] Working directory is not clean. Please commit, stash, or discard your changes before running this script.",
    );
    process.exit(1);
  }

  if (!isBranchUpToDate()) {
    console.error(
      "[prerelease] Local branch is behind the remote. Please pull the latest changes before running this script.",
    );
    process.exit(1);
  }

  const rootDir = execSync("git rev-parse --show-toplevel").toString().trim();
  const originalCommit = execSync("git rev-parse HEAD", { cwd: rootDir }).toString().trim();
  const branch = getCurrentBranch();
  const originalRemoteCommit = getRemoteCommit(branch);
  const originalLocalTags = getLocalTags();
  const originalVersion = getPackageJsonVersion();

  // Rollback flags
  let versionTagged = false;
  let versionBumpCommit = null;
  let tagsPushed = false;
  let taggedVersion = null;

  try {
    // 1. Build (keep this step, but do not add/commit dist/)
    run("npm run build");

    // 2. Bump version and tag (this will commit package.json automatically)
    run(`npm version ${arg}`);
    taggedVersion = require(path.join(process.cwd(), "package.json")).version;
    versionBumpCommit = execSync("git rev-parse HEAD", { cwd: rootDir }).toString().trim();
    
    // Check if the tag was actually created by npm version
    const expectedTag = `v${taggedVersion}`;
    const tagExists = execSync(`git tag -l ${expectedTag}`, { cwd: rootDir }).toString().trim();
    
    if (!tagExists) {
      console.log(`[prerelease] npm version failed to create tag ${expectedTag}, creating it manually...`);
      run(`git tag ${expectedTag}`);
    }
    
    versionTagged = true;

    // 3. Check if root package-lock.json was updated and commit it
    const statusAfterVersion = execSync("git status --porcelain", { cwd: rootDir }).toString().trim();
    if (statusAfterVersion.includes("package-lock.json")) {
      console.log("[prerelease] Committing updated root package-lock.json");
      run(`git add ${path.join(rootDir, "package-lock.json")}`);
      run(`git commit -m "Update package-lock.json for v${taggedVersion}"`);
    }

    // 4. Push commits and tags
    run("git push");
    run("git push --tags");
    tagsPushed = true;

    console.log("[prerelease] Release process complete!");
  } catch (err) {
    console.warn("[prerelease] Error occurred, starting rollback...");
    if (tagsPushed && taggedVersion) {
      tryRun(`git push --delete origin v${taggedVersion}`);
    }
    if (versionTagged && versionBumpCommit) {
      tryRun(`git reset --hard ${originalCommit}`);
    }
    verifyPostRollback(originalCommit, originalVersion, originalLocalTags);
    verifyRemotePostRollback(originalRemoteCommit, branch);
    console.error("[prerelease] Release failed. All possible changes rolled back.");
    console.error(err);
    process.exit(1);
  }
}

main();
