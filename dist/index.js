"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenizeCRL = tokenizeCRL;
exports.parseCRL = parseCRL;
exports.buildCRL = buildCRL;
exports.validateCRL = validateCRL;
const builder_1 = require("./ast/builder");
const CRLLexer_1 = require("./grammar/generated/antlr/CRLLexer");
const createLexer_1 = require("./lexer/createLexer");
const createParser_1 = require("./parser/createParser");
const validator_1 = require("./validator/validator");
function tokenizeCRL(input) {
    try {
        const { lexer, errorListener } = (0, createLexer_1.createLexer)(input);
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
function parseCRL(input) {
    let lexerErrorListener, parserErrorListener;
    try {
        const parserSetup = (0, createParser_1.createParser)(input);
        lexerErrorListener = parserSetup.lexerErrorListener;
        parserErrorListener = parserSetup.parserErrorListener;
        const tree = parserSetup.parser.crl();
        const errors = [...lexerErrorListener.getErrors(), ...parserErrorListener.getErrors()];
        if (errors.length > 0) {
            return { success: false, errors };
        }
        return { success: true, result: tree };
    }
    catch (error) {
        const errors = [
            ...(lexerErrorListener?.getErrors?.() ?? []),
            ...(parserErrorListener?.getErrors?.() ?? []),
            JSON.stringify({
                type: "Exception",
                message: error instanceof Error ? error.message : String(error),
            }),
        ];
        return {
            success: false,
            errors,
        };
    }
}
function buildCRL(input) {
    let lexerErrorListener, parserErrorListener, builder;
    try {
        const parserSetup = (0, createParser_1.createParser)(input);
        lexerErrorListener = parserSetup.lexerErrorListener;
        parserErrorListener = parserSetup.parserErrorListener;
        const tree = parserSetup.parser.crl();
        builder = new builder_1.CRLAstBuilder();
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
        const errors = [
            ...(lexerErrorListener?.getErrors?.() ?? []),
            ...(parserErrorListener?.getErrors?.() ?? []),
            ...(builder?.getErrors?.() ?? []),
            JSON.stringify({
                type: "Exception",
                message: error instanceof Error ? error.message : String(error),
            }),
        ];
        return {
            success: false,
            errors,
        };
    }
}
function validateCRL(input) {
    try {
        const { parser, lexerErrorListener, parserErrorListener } = (0, createParser_1.createParser)(input);
        const tree = parser.crl();
        const builder = new builder_1.CRLAstBuilder();
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