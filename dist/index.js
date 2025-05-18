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
        const errorObj = {
            type: "Exception",
            message: error instanceof Error ? error.message : String(error),
        };
        return { success: false, errors: [errorObj] };
    }
}
function parseCRL(input) {
    let lexerErrorListener, parserErrorListener;
    try {
        const parserSetup = (0, createParser_1.createParser)(input);
        lexerErrorListener = parserSetup.lexerErrorListener;
        parserErrorListener = parserSetup.parserErrorListener;
        const tree = parserSetup.parser.crl();
        const parserErrors = parserErrorListener.getErrors();
        if (parserErrors.length > 0) {
            return { success: false, errors: parserErrors };
        }
        const lexerErrors = lexerErrorListener.getErrors();
        if (lexerErrors.length > 0) {
            return { success: false, errors: lexerErrors };
        }
        return { success: true, result: tree };
    }
    catch (error) {
        const errors = [
            ...(lexerErrorListener?.getErrors() ?? []),
            ...(parserErrorListener?.getErrors() ?? []),
            {
                type: "Exception",
                message: error instanceof Error ? error.message : String(error),
            },
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
        const parserErrors = parserErrorListener.getErrors();
        if (parserErrors.length > 0) {
            return { success: false, errors: parserErrors };
        }
        const lexerErrors = lexerErrorListener.getErrors();
        if (lexerErrors.length > 0) {
            return { success: false, errors: lexerErrors };
        }
        const builderErrors = builder.getErrors();
        if (builderErrors.length > 0) {
            return { success: false, errors: builderErrors };
        }
        return { success: true, result: ast };
    }
    catch (error) {
        const errors = [
            ...(lexerErrorListener?.getErrors() ?? []),
            ...(parserErrorListener?.getErrors() ?? []),
            ...(builder?.getErrors() ?? []),
            {
                type: "Exception",
                message: error instanceof Error ? error.message : String(error),
            },
        ];
        return {
            success: false,
            errors,
        };
    }
}
function validateCRL(input) {
    const result = buildCRL(input);
    if (!result.success) {
        throw new Error(`validateCRL is not currently implemented. Use buildCRL instead. Look for updates in the future. Build errors: ${JSON.stringify(result.errors, null, 2)}`);
    }
    throw new Error("validateCRL is not currently implemented. Use buildCRL instead. Look for updates in the future.");
}
//# sourceMappingURL=index.js.map