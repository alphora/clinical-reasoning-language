import path from 'path';
import { loadFSH } from '../transformer/fsh-to-cpgl/sushi-loader';
import { transformFSHToCPGL } from '../transformer/fsh-to-cpgl/transformer';

// Get the FSH directory path from command line args or use default
const inputPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(__dirname, '../examples/fsh/who/measles');

(async () => {
  try {
    console.log(`[DEBUGGING] Loading FSH files from: ${inputPath}`);
    const fshResult = await loadFSH({ path: inputPath });
    console.log(`[DEBUGGING] Loaded ${fshResult.instances.length} FSH instances.`);
    const cpglOutput = transformFSHToCPGL(fshResult);
    console.log('[DEBUGGING] Generated CPG-L output:\n');
    // Trim trailing newlines and ensure only a single newline at the end
    process.stdout.write(cpglOutput.replace(/\n+$/, '') + '\n');
  } catch (err) {
    console.error('[DEBUGGING] Error in transformer CLI:', err);
    process.exit(1);
  }
})(); 