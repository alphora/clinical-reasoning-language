import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";

import * as fsExtra from "fs-extra";

const root = path.resolve(__dirname, "../..");
const extRoot = path.resolve(__dirname, "..");
const tmpDir = path.resolve(root, ".crl-vscode-tmp");

function run(cmd: string, cwd: string): void {
  child_process.execSync(cmd, { cwd, stdio: "inherit" });
}

function main(): void {
  // Clean temp dir
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Copy everything from extension root to temp dir
  fsExtra.copySync(extRoot, tmpDir, {
    filter: (src: string) =>
      !path.relative(extRoot, src).startsWith("node_modules") &&
      !path.relative(extRoot, src).startsWith("dist") &&
      !path.relative(extRoot, src).startsWith("out"),
  });

  // Run vsce package
  run("npx vsce package", tmpDir);

  // Move .vsix back
  const vsix = fs.readdirSync(tmpDir).find((f) => f.endsWith(".vsix"));
  if (vsix) {
    fs.renameSync(path.join(tmpDir, vsix), path.join(extRoot, vsix));
    console.log(`VSIX moved to ${path.join(extRoot, vsix)}`);
  } else {
    throw new Error("VSIX file not found in temp directory");
  }

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log("Temporary directory cleaned up.");
}

main();
