import path from 'path';
import { loadFSH } from '../transformer/fsh-to-cpgl/sushi-loader';

// Get the FSH directory path from command line args or use default
const inputPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(__dirname, '../examples/fsh/who/measles');

(async () => {
  try {
    console.log(`[DEBUGGING] Loading FSH files from: ${inputPath}`);
    const result = await loadFSH({ path: inputPath });
    console.log(`[DEBUGGING] Loaded ${result.instances.length} FSH instances.`);
    result.instances.forEach(inst => {
      console.log(`[DEBUGGING] Instance: ${inst.name} (InstanceOf: ${inst.instanceOf})`);
    });
  } catch (err) {
    console.error('[DEBUGGING] Error loading FSH:', err);
    process.exit(1);
  }
})(); 