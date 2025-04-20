"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printAST = printAST;
exports.compareASTs = compareASTs;
function printAST(node, indent = 0) {
    const spaces = '  '.repeat(indent);
    let output = `${spaces}${node.type}\n`;
    if ('name' in node) {
        output += `${spaces}  name: ${node.name}\n`;
    }
    if ('decisionName' in node) {
        output += `${spaces}  decisionName: "${node.decisionName}"\n`;
    }
    if ('activityName' in node) {
        output += `${spaces}  activityName: "${node.activityName}"\n`;
    }
    if ('conceptName' in node) {
        output += `${spaces}  conceptName: "${node.conceptName}"\n`;
    }
    if ('qualifier' in node && node.qualifier) {
        output += `${spaces}  qualifier: "${String(node.qualifier)}"\n`;
    }
    if ('activityTypeValue' in node && node.activityTypeValue) {
        output += `${spaces}  activityTypeValue: "${String(node.activityTypeValue)}"\n`;
    }
    if ('rationale' in node && node.rationale) {
        output += `${spaces}  rationale: "${String(node.rationale)}"\n`;
    }
    if ('statements' in node && Array.isArray(node.statements)) {
        node.statements.forEach((statement) => {
            output += printAST(statement, indent + 1);
        });
    }
    if ('body' in node && node.body) {
        const body = node.body;
        output += printAST(body, indent + 1);
    }
    if ('action' in node && node.action) {
        const action = node.action;
        output += printAST(action, indent + 1);
    }
    return output;
}
function compareASTs(generatedAST, expectedAST) {
    const normalizedGenerated = generatedAST.replace(/\r\n/g, '\n').trim();
    const normalizedExpected = expectedAST.replace(/\r\n/g, '\n').trim();
    const generatedLines = normalizedGenerated.split('\n');
    const expectedLines = normalizedExpected.split('\n');
    const generatedLineCount = generatedLines.length;
    const expectedLineCount = expectedLines.length;
    const maxLines = Math.max(generatedLineCount, expectedLineCount);
    const noWhitespaceGenerated = normalizedGenerated.replace(/\s+/g, '');
    const noWhitespaceExpected = normalizedExpected.replace(/\s+/g, '');
    return {
        lineCountsMatch: generatedLineCount === expectedLineCount,
        whitespaceNormalizedMatch: normalizedGenerated === normalizedExpected,
        structureMatch: noWhitespaceGenerated === noWhitespaceExpected,
        generatedLineCount,
        expectedLineCount,
        maxLines,
        generatedLines,
        expectedLines,
    };
}
//# sourceMappingURL=utils.js.map