#!/usr/bin/env ts-node
/**
 * Usage:
 *   npx ts-node scripts/clone-fsh-repo.ts <github-repo-url>
 *
 * - Clones the repo to src/examples/fsh/<repo-name>
 * - Deletes everything in the root folder except .git
 * - Restores only the required files/folders using git restore
 * - Adds the root folder to .gitignore
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const [,, repoUrl] = process.argv;
if (!repoUrl) {
  console.error('Usage: npx ts-node scripts/clone-fsh-repo.ts <github-repo-url>');
  process.exit(1);
}

const repoName = repoUrl.split('/').pop()!.replace(/\.git$/, '');
const targetDir = path.join('src', 'examples', 'fsh', repoName);

// Clone the repo
console.log(`[INFO] Cloning ${repoUrl} to ${targetDir} ...`);
execSync(`git clone ${repoUrl} ${targetDir}`, { stdio: 'inherit' });

// Delete everything in the root except .git
console.log('[INFO] Cleaning up root folder ...');
const files = fs.readdirSync(targetDir);
for (const file of files) {
  if (file !== '.git') {
    const fullPath = path.join(targetDir, file);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}

// Restore required files/folders
const restorePaths = [
  'input/fsh/Aliases.fsh',
  'input/fsh/activitydefinitions',
  'input/fsh/activitydefinition',
  'input/fsh/plandefinitions',
  'input/fsh/plandefinition',
  'input/cql',
  'input/datadictionary',
  'sushi-config.yaml',
  'README.md',
];
for (const relPath of restorePaths) {
  try {
    console.log(`[INFO] Restoring ${relPath} ...`);
    execSync(`git -C ${targetDir} restore --source=HEAD --staged --worktree -- ${relPath}`, { stdio: 'inherit' });
  } catch (e) {
    console.warn(`[WARN] Could not restore ${relPath}`);
  }
}

// Append or update FSHOnly: true in sushi-config.yaml
const sushiConfigPath = path.join(targetDir, 'sushi-config.yaml');
try {
  let sushiConfigContent = fs.readFileSync(sushiConfigPath, 'utf8');
  const fshOnlyRegex = /^\s*FSHOnly\s*:\s*(.*)$/m;
  const match = sushiConfigContent.match(fshOnlyRegex);
  if (match) {
    if (match[1].trim() === 'true') {
      console.log('[INFO] FSHOnly: true already set in sushi-config.yaml');
    } else {
      // Replace the value with true
      sushiConfigContent = sushiConfigContent.replace(fshOnlyRegex, 'FSHOnly: true');
      fs.writeFileSync(sushiConfigPath, sushiConfigContent, 'utf8');
      console.log('[INFO] Updated FSHOnly to true in sushi-config.yaml');
    }
  } else {
    fs.appendFileSync(sushiConfigPath, '\nFSHOnly: true\n');
    console.log('[INFO] Appended FSHOnly: true to sushi-config.yaml');
  }
} catch (e) {
  console.warn('[WARN] Could not update or append FSHOnly: true to sushi-config.yaml');
}

// Add the root folder to .gitignore
const igignorePath = path.join('.gitignore');
const igLine = `src/examples/fsh/${repoName}/`;
let igContent = '';
if (fs.existsSync(igignorePath)) {
  igContent = fs.readFileSync(igignorePath, 'utf8');
}
if (!igContent.includes(igLine)) {
  fs.appendFileSync(igignorePath, igLine + '\n');
  console.log(`[INFO] Added ${igLine} to .gitignore`);
} else {
  console.log(`[INFO] ${igLine} already in .gitignore`);
}

console.log('[DONE]'); 