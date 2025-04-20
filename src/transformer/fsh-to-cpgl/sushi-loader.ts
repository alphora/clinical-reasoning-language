import path from 'path';
import fs from 'fs';
import os from 'os';
import { FSHTank } from 'fsh-sushi/dist/import/FSHTank';
import { importConfiguration } from 'fsh-sushi/dist/import/importConfiguration';
import { FSHImporter } from 'fsh-sushi/dist/import/FSHImporter';
import YAML from 'yaml';

/**
 * Result type for loaded FSH resources.
 */
export interface FSHLoadResult {
  tank: FSHTank;
  instances: any[];
  docs: any[];
}

/**
 * Load FSH files from a directory or from a string, using SUSHI as a library.
 * @param options.path Directory or file path to FSH files (relative or absolute)
 * @param options.content Raw FSH string (if provided, takes precedence over path)
 */
export async function loadFSH(options: {
  path?: string;
  content?: string;
}): Promise<FSHLoadResult> {
  let fshPath = options.path;
  let tempDir: string | undefined;

  // If content is provided, write to a temp .fsh file
  if (options.content) {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsh-loader-'));
    const tempFile = path.join(tempDir, 'input.fsh');
    fs.writeFileSync(tempFile, options.content, 'utf8');
    fshPath = tempDir;
  }

  if (!fshPath) {
    throw new Error('Either path or content must be provided to loadFSH.');
  }

  // Resolve path for cross-platform compatibility
  const resolvedFSHPath = path.isAbsolute(fshPath) ? fshPath : path.resolve(process.cwd(), fshPath);

  // Find and read sushi-config.yaml
  const configPath = path.join(resolvedFSHPath, 'sushi-config.yaml');
  if (!fs.existsSync(configPath)) {
    throw new Error(`sushi-config.yaml not found in ${resolvedFSHPath}`);
  }
  const configYaml = fs.readFileSync(configPath, 'utf8');
  const config = importConfiguration(configYaml, configPath);

  // Read all .fsh files in the directory
  const fshFiles = fs.readdirSync(resolvedFSHPath).filter(f => f.endsWith('.fsh'));
  const rawFSHes = fshFiles.map(f => {
    const filePath = path.join(resolvedFSHPath, f);
    return {
      content: fs.readFileSync(filePath, 'utf8'),
      file: filePath,
      path: filePath
    };
  });

  // Parse FSH files
  const importer = new FSHImporter();
  const docs = importer.import(rawFSHes);

  // Create FSHTank
  const tank = new FSHTank(docs, config);
  const instances = tank.getAllInstances();

  // Clean up temp dir if used
  if (tempDir) {
    // Optionally, remove temp files after use
    // fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return { tank, instances, docs };
}

// [DEBUGGING] Example usage (uncomment for local testing):
// (async () => {
//   const result = await loadFSH({ path: '../../examples/fsh/who/measles' });
//   console.log('[DEBUGGING] Loaded instances:', result.instances.map(i => i.name));
// })(); 