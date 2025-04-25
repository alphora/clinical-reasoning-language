import { readFileSync } from "fs";
import { join } from "path";

import { createParser } from "../parser/createParser";

// Read the example file
const examplePath = join(__dirname, "../examples/cpgl/who/measles/IMMZ_All_Decisions.cpg");
const input = readFileSync(examplePath, "utf-8");

// Create the parser (new API)
const { parser } = createParser(input);

// Parse the input
const tree = parser.cpgl();

// Check if pretty output is requested
const prettyOutput = process.argv.includes("--pretty");

if (!prettyOutput) {
  // Raw parser output
  console.log(tree.toStringTree(parser.ruleNames));
} else {
  // Pretty parser output
  const serializableTree = {
    type: parser.ruleNames[tree.ruleIndex],
    text: tree.text,
    children: tree.children?.map((child) => {
      const childWithRuleIndex = child as { ruleIndex?: number };
      return {
        type: child.constructor.name,
        text: child.text,
        ruleIndex:
          childWithRuleIndex.ruleIndex !== undefined
            ? parser.ruleNames[childWithRuleIndex.ruleIndex]
            : undefined,
      };
    }),
  };

  console.log("Parse Tree:");
  console.log("===========");
  console.log(JSON.stringify(serializableTree, null, 2));
}
