"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FHIR_VALUE_TYPES = exports.CASEFEATURE_FHIR_TYPES = exports.ACTION_FHIR_TYPES = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function extractTypesFromLexerAction(lexerSource, actionName) {
    const actionRegex = new RegExp(`${actionName}[^{]*?{[^{]*?validTypes\\s*=\\s*\\[\\s*([^\\]]+?)\\s*\\]`, 's');
    const match = actionRegex.exec(lexerSource);
    if (!match?.[1]) {
        console.warn(`Could not find ${actionName} types in lexer source - returning empty set`);
        return new Set();
    }
    const types = match[1]
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line !== ',')
        .map(line => line.replace(/[',]/g, '').trim());
    return new Set(types);
}
const grammarPath = path_1.default.join(__dirname, 'CPGLLexer.g4');
const lexerSource = fs_1.default.readFileSync(grammarPath, 'utf8');
exports.ACTION_FHIR_TYPES = extractTypesFromLexerAction(lexerSource, 'ACTIVITY_TYPE');
exports.CASEFEATURE_FHIR_TYPES = extractTypesFromLexerAction(lexerSource, 'CONCEPT_TYPE');
exports.FHIR_VALUE_TYPES = extractTypesFromLexerAction(lexerSource, 'CONCEPT_VALUE_TYPE');
//# sourceMappingURL=fhirTypes.js.map