"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const createParser_1 = require("../parser/createParser");
const examplePath = (0, path_1.join)(__dirname, "../examples/cpgl/who/measles/IMMZ_All_Decisions.cpg");
const input = (0, fs_1.readFileSync)(examplePath, "utf-8");
const { parser } = (0, createParser_1.createParser)(input);
const tree = parser.cpgl();
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
    console.log("Parse Tree:");
    console.log("===========");
    console.log(JSON.stringify(serializableTree, null, 2));
}
//# sourceMappingURL=run-parser.js.map