"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const CRLLexer_1 = require("../grammar/generated/antlr/CRLLexer");
const createLexer_1 = require("../lexer/createLexer");
const examplePath = (0, path_1.join)(__dirname, "../examples/crl/who/smart-example-immz/IMMZ_All_Decisions.crl");
const input = (0, fs_1.readFileSync)(examplePath, "utf8");
const { lexer } = (0, createLexer_1.createLexer)(input);
const tokens = [];
let token = lexer.nextToken();
while (token.type !== CRLLexer_1.CRLLexer.EOF) {
    if (token.channel === 0) {
        const typeName = lexer.vocabulary.getSymbolicName(token.type) ?? `Unknown (${token.type})`;
        tokens.push({
            line: token.line,
            column: token.charPositionInLine,
            type: typeName,
            text: token.text ?? "",
        });
    }
    token = lexer.nextToken();
}
const prettyOutput = process.argv.includes("--pretty");
if (!prettyOutput) {
    console.log(JSON.stringify(tokens, null, 2));
}
else {
    console.log("\nTokenizing grammar-example.crl:\n");
    console.log("Line | Column | Type | Text");
    console.log("-----|--------|------|------");
    let lastLine = 0;
    tokens.forEach((token) => {
        if (token.line !== lastLine) {
            console.log();
            lastLine = token.line;
        }
        console.log(`${token.line.toString().padStart(4)} | ${token.column.toString().padStart(6)} | ${token.type.padEnd(20)} | "${token.text}"`);
    });
}
//# sourceMappingURL=run-lexer.js.map