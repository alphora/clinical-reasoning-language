import path from "path";

import { transformFSHToCPGL } from "../transformer/fsh-to-cpgl/transformer";

// Get the FSH directory path from command line args or use default
const inputPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(__dirname, "../examples/fsh/smart-example-immz");

(async (): Promise<void> => {
  try {
    const cpglOutput = transformFSHToCPGL(inputPath);
    process.stdout.write(cpglOutput.replace(/\n+$/, "") + "\n");
  } catch {
    process.exit(1);
  }
})();
