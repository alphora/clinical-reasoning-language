"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenizeCPGL = tokenizeCPGL;
exports.parseCPGL = parseCPGL;
exports.buildCPGL = buildCPGL;
exports.validateCPGL = validateCPGL;
const builder_1 = require("./ast/builder");
const CPGLLexer_1 = require("./grammar/generated/antlr/CPGLLexer");
const createLexer_1 = require("./lexer/createLexer");
const createParser_1 = require("./parser/createParser");
const validator_1 = require("./validator/validator");
function tokenizeCPGL(input) {
    try {
        const { lexer, errorListener } = (0, createLexer_1.createLexer)(input);
        const tokens = [];
        let token = lexer.nextToken();
        while (token.type !== CPGLLexer_1.CPGLLexer.EOF) {
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
        const errors = errorListener.getErrors();
        if (errors.length > 0) {
            return { success: false, errors };
        }
        return { success: true, result: tokens };
    }
    catch (error) {
        return { success: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
}
function parseCPGL(input) {
    try {
        const { parser, lexerErrorListener, parserErrorListener } = (0, createParser_1.createParser)(input);
        const tree = parser.cpgl();
        const errors = [...lexerErrorListener.getErrors(), ...parserErrorListener.getErrors()];
        if (errors.length > 0) {
            return { success: false, errors };
        }
        return { success: true, result: tree };
    }
    catch (error) {
        return {
            success: false,
            errors: [
                JSON.stringify({
                    type: "Exception",
                    message: error instanceof Error ? error.message : String(error),
                }),
            ],
        };
    }
}
function buildCPGL(input) {
    try {
        const { parser, lexerErrorListener, parserErrorListener } = (0, createParser_1.createParser)(input);
        const tree = parser.cpgl();
        const builder = new builder_1.CPGLAstBuilder();
        const ast = builder.visit(tree);
        const errors = [
            ...lexerErrorListener.getErrors(),
            ...parserErrorListener.getErrors(),
            ...builder.getErrors(),
        ];
        if (errors.length > 0) {
            return { success: false, errors };
        }
        return { success: true, result: ast };
    }
    catch (error) {
        return {
            success: false,
            errors: [
                JSON.stringify({
                    type: "Exception",
                    message: error instanceof Error ? error.message : String(error),
                }),
            ],
        };
    }
}
function validateCPGL(input) {
    try {
        const { parser, lexerErrorListener, parserErrorListener } = (0, createParser_1.createParser)(input);
        const tree = parser.cpgl();
        const builder = new builder_1.CPGLAstBuilder();
        const ast = builder.visit(tree);
        const errors = [...lexerErrorListener.getErrors(), ...parserErrorListener.getErrors()];
        if (errors.length > 0) {
            return { success: false, errors };
        }
        const validator = new validator_1.Validator();
        const validationResult = validator.validate(ast);
        if (!validationResult.isValid) {
            return {
                success: false,
                errors: [
                    ...validationResult.errors.map((e) => e.message),
                    ...validationResult.warnings.map((w) => w.message),
                ],
            };
        }
        return { success: true, result: ast };
    }
    catch (error) {
        return {
            success: false,
            errors: [
                JSON.stringify({
                    type: "Exception",
                    message: error instanceof Error ? error.message : String(error),
                }),
            ],
        };
    }
}
//# sourceMappingURL=index.js.map