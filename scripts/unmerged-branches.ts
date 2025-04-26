import { execSync } from "child_process";
import fs from "fs";

const prompts = require("prompts");

function run(cmd: string, options: { silent?: boolean } = {}): string {
  const result = execSync(cmd, { encoding: "utf8", stdio: options.silent ? "pipe" : "inherit" });
  return result ? result.trim() : "";
}

function isMergeInProgress(): boolean {
  return fs.existsSync(".git/MERGE_HEAD");
}

function getLocalBranches(): string[] {
  const branches = run('git branch --format="%(refname:short)"', { silent: true })
    .split("\n")
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && b !== "main");
  return branches;
}

function verifyBranchMerged(branch: string, baseBranch: string): boolean {
  try {
    run(`git checkout ${baseBranch}`, { silent: true });
    run(`git merge --no-commit --no-ff ${branch}`, { silent: true });
    if (isMergeInProgress()) {
      run("git merge --abort", { silent: true });
    }
    return false; // Merge succeeded → differences exist
  } catch (e) {
    if (isMergeInProgress()) {
      run("git merge --abort", { silent: true });
    }
    return true; // Merge failed → branch already fully merged
  }
}

async function promptBranchDeletion(mergedBranches: string[]) {
  if (mergedBranches.length === 0) {
    console.log("✅ No merged branches to delete.");
    return;
  }

  const { deleteMode } = await prompts({
    type: "select",
    name: "deleteMode",
    message: "Branches are fully merged. How would you like to clean them up?",
    choices: [
      { title: "Delete all merged branches", value: "all" },
      { title: "Select branches manually", value: "select" },
      { title: "Do not delete anything", value: "none" },
    ],
  });

  if (deleteMode === "none") {
    console.log("🚫 No branches deleted.");
    return;
  }

  let branchesToDelete: string[] = [];

  if (deleteMode === "all") {
    branchesToDelete = mergedBranches;
  } else if (deleteMode === "select") {
    const { selected } = await prompts({
      type: "multiselect",
      name: "selected",
      message: "Select branches to delete:",
      choices: mergedBranches.map((b) => ({ title: b, value: b })),
      min: 1,
    });
    branchesToDelete = selected;
  }

  for (const branch of branchesToDelete) {
    console.log(`🗑 Deleting branch: ${branch}`);
    run(`git branch -d ${branch}`);
  }

  console.log(`✅ Deleted ${branchesToDelete.length} branches.`);
}

async function main() {
  const originalBranch = run("git rev-parse --abbrev-ref HEAD", { silent: true });
  const baseBranch = "main";
  const branches = getLocalBranches();

  if (branches.length === 0) {
    console.log("No local branches found (except main).");
    return;
  }

  console.log(`🔍 Checking all local branches (excluding '${baseBranch}')...\n`);

  const results: { branch: string; merged: boolean }[] = [];

  for (const branch of branches) {
    const merged = verifyBranchMerged(branch, baseBranch);
    results.push({ branch, merged });
  }

  run(`git checkout ${originalBranch}`, { silent: true });

  console.log("\n📋 Merge Results:");
  results.forEach(({ branch, merged }) => {
    if (merged) {
      console.log(`✅ ${branch} is fully merged into ${baseBranch}`);
    } else {
      console.log(`🔴 ${branch} still has differences from ${baseBranch}`);
    }
  });

  const mergedBranches = results.filter((r) => r.merged).map((r) => r.branch);

  if (mergedBranches.length > 0) {
    console.log("\n🧹 Cleanup Options:");
    await promptBranchDeletion(mergedBranches);
  }
}

main();
