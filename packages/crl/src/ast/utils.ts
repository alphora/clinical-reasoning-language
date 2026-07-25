import { ASTNode, getRefName, type BranchCondition } from "./types";
import { describeBranchCondition } from "./branchCondition";

interface ASTComparison {
  lineCountsMatch: boolean;
  whitespaceNormalizedMatch: boolean;
  structureMatch: boolean;
  generatedLineCount: number;
  expectedLineCount: number;
  maxLines: number;
  generatedLines: string[];
  expectedLines: string[];
}

/**
 * Prints an AST node with proper indentation
 * @param node The AST node to print
 * @param indent The current indentation level
 * @returns The string representation of the AST
 */
export function printAST(node: ASTNode, indent = 0): string {
  const spaces = "  ".repeat(indent);
  let output = `${spaces}${node.type}\n`;

  // Print node-specific properties
  if ("name" in node) {
    output += `${spaces}  name: ${node.name}\n`;
  }
  if ("decisionName" in node) {
    output += `${spaces}  decisionName: "${node.decisionName}"\n`;
  }
  if ("activityName" in node) {
    output += `${spaces}  activityName: "${node.activityName}"\n`;
  }
  // ActionGuard still carries a single `conceptName`; the `when` branch guard
  // is now a `condition` expression (#224).
  if ("conceptName" in node) {
    output += `${spaces}  conceptName: "${node.conceptName}"\n`;
  }
  if ("condition" in node && node.type === "WhenBlock") {
    const c = (node as { condition: BranchCondition }).condition;
    output += `${spaces}  condition: ${describeBranchCondition(c, getRefName)}\n`;
  }
  if ("qualifier" in node && node.qualifier) {
    output += `${spaces}  qualifier: "${String(node.qualifier)}"\n`;
  }
  if ("activityTypeValue" in node && node.activityTypeValue) {
    output += `${spaces}  activityTypeValue: "${String(node.activityTypeValue)}"\n`;
  }
  if ("rationale" in node && node.rationale) {
    output += `${spaces}  rationale: "${String(node.rationale)}"\n`;
  }

  // Handle statements
  if ("statements" in node && Array.isArray(node.statements)) {
    node.statements.forEach((statement: ASTNode) => {
      output += printAST(statement, indent + 1);
    });
  }

  // Handle body
  if ("body" in node && node.body) {
    const body = node.body as ASTNode;
    output += printAST(body, indent + 1);
  }

  // Handle action
  if ("action" in node && node.action) {
    const action = node.action as ASTNode;
    output += printAST(action, indent + 1);
  }

  return output;
}

/**
 * Compares two AST strings and returns detailed comparison results
 * @param generatedAST The generated AST string
 * @param expectedAST The expected AST string
 * @returns An object containing comparison results and details
 */
export function compareASTs(generatedAST: string, expectedAST: string): ASTComparison {
  // Normalize line endings to LF
  const normalizedGenerated = generatedAST.replace(/\r\n/g, "\n").trim();
  const normalizedExpected = expectedAST.replace(/\r\n/g, "\n").trim();

  // Split into lines
  const generatedLines = normalizedGenerated.split("\n");
  const expectedLines = normalizedExpected.split("\n");

  // Compare line counts
  const generatedLineCount = generatedLines.length;
  const expectedLineCount = expectedLines.length;
  const maxLines = Math.max(generatedLineCount, expectedLineCount);

  // Create a version with all whitespace removed for strict comparison
  const noWhitespaceGenerated = normalizedGenerated.replace(/\s+/g, "");
  const noWhitespaceExpected = normalizedExpected.replace(/\s+/g, "");

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
