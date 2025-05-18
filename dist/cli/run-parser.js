"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const createParser_1 = require("../parser/createParser");
const pathArgIndex = process.argv.indexOf("--path");
const filePath = (pathArgIndex !== -1 && process.argv[pathArgIndex + 1]) ||
    (0, path_1.join)(__dirname, "../examples/crl/who/smart-example-immz/IMMZ_All_Decisions.crl");
const input = (0, fs_1.readFileSync)(filePath, "utf-8");
const { parser, parserErrorListener, lexerErrorListener } = (0, createParser_1.createParser)(input);
const tree = parser.crl();
const parserErrors = parserErrorListener.getErrors();
if (parserErrors.length > 0) {
    console.error("Parser errors:");
    parserErrors.forEach((e) => console.error(JSON.stringify(e, null, 2)));
    process.exit(1);
}
const lexerErrors = lexerErrorListener.getErrors();
if (lexerErrors.length > 0) {
    console.error("Lexer errors:");
    lexerErrors.forEach((e) => console.error(JSON.stringify(e, null, 2)));
    process.exit(1);
}
const prettyOutput = process.argv.includes("--pretty");
if (!prettyOutput) {
    console.log(tree.toStringTree(parser.ruleNames));
}
else {
    const serializableTree = {
        type: parser.ruleNames[tree.ruleIndex],
        text: tree.text,
        children: tree.children?.map((child) => {
            const childWithRuleIndex = child;
            return {
                type: child.constructor.name,
                text: child.text,
                ruleIndex: childWithRuleIndex.ruleIndex !== undefined
                    ? parser.ruleNames[childWithRuleIndex.ruleIndex]
                    : undefined,
            };
        }),
    };
    console.log(`Parse Tree for: ${filePath}`);
    console.log("===========");
    console.log(JSON.stringify(serializableTree, null, 2));
}
//# sourceMappingURL=run-parser.js.map