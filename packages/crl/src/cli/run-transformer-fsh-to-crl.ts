import path from "path";

import { transformFSHToCRL } from "../transformer/fsh-to-crl/transformer";

// Get the FSH directory path from command line args or use default
const inputPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(__dirname, "../../examples/fsh/smart-example-immz");

(async (): Promise<void> => {
  try {
    const crlOutput = transformFSHToCRL(inputPath);
    process.stdout.write(crlOutput.replace(/\n+$/, "") + "\n");
  } catch {
    process.exit(1);
  }
})();
