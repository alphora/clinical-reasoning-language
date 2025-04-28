"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const transformer_1 = require("../transformer/fsh-to-cpgl/transformer");
const inputPath = process.argv[2]
    ? path_1.default.resolve(process.cwd(), process.argv[2])
    : path_1.default.resolve(__dirname, "../examples/fsh/smart-example-immz");
(async () => {
    try {
        const cpglOutput = (0, transformer_1.transformFSHToCPGL)(inputPath);
        process.stdout.write(cpglOutput.replace(/\n+$/, "") + "\n");
    }
    catch {
        process.exit(1);
    }
})();
//# sourceMappingURL=run-transformer-fsh-to-cpgl.js.map