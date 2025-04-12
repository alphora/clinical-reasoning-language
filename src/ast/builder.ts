import { ParserRuleContext } from 'antlr4ts';
import { ParseTree } from 'antlr4ts/tree/ParseTree';
import { ParseTreeVisitor } from 'antlr4ts/tree/ParseTreeVisitor';
import { RuleNode } from 'antlr4ts/tree/RuleNode';
import { TerminalNode } from 'antlr4ts/tree/TerminalNode';

import { CPGLParser } from '../grammar/generated/CPGLParser';

import {
  ASTNode,
  ActionStatement,
  Expression,
  Statement,
  Activity,
  BlockBody,
  BlockStatement,
  CodedByDefinition,
  Concept,
  Decision,
  DoAction,
  File,
  InferredByDefinition,
  SingleAction,
  Terminology,
  TerminologyDefinition,
  UseAction,
  WhenClause,
  WhenClauseBody,
} from './types';

export class ASTBuilder implements ParseTreeVisitor<ASTNode> {
  visit(tree: ParseTree): ASTNode {
    if (tree instanceof ParserRuleContext) {
      const ruleName = tree.ruleContext.ruleIndex;
      // If it's the root cpgl rule
      if (ruleName === CPGLParser.RULE_cpgl) {
        return this.visitCpgl(tree);
      }
    }
    return tree.accept(this);
  }

  visitChildren(node: RuleNode): ASTNode {
    const children: ASTNode[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.getChild(i);
      if (child instanceof ParserRuleContext) {
        const result = child.accept(this);
        if (result) {
          children.push(result);
        }
      }
    }
    return children[0];
  }

  visitTerminal(_node: TerminalNode): ASTNode {
    throw new Error('Method not implemented.');
  }

  visitErrorNode(_node: TerminalNode): ASTNode {
    throw new Error('Method not implemented.');
  }

  visitCpgl(ctx: ParserRuleContext): File {
    const statements: Statement[] = [];

    for (let i = 0; i < ctx.childCount - 1; i++) {
      // -1 to skip EOF
      const child = ctx.getChild(i);
      if (child instanceof ParserRuleContext) {
        const statement = this.visitStatement(child);
        if (statement && this.isStatement(statement)) {
          statements.push(statement);
        }
      }
    }

    return {
      type: 'File',
      statements,
      location: this.getLocation(ctx),
    };
  }

  visitStatement(ctx: ParserRuleContext): Statement | null {
    const child = ctx.getChild(0);
    if (child instanceof ParserRuleContext) {
      const firstChild = child.getChild(0);
      if (firstChild.text === 'decision') {
        return this.visitDecisionStatement(child);
      } else if (firstChild.text === 'terminology') {
        return this.visitTerminologyStatement(child);
      } else if (firstChild.text === 'activity') {
        return this.visitActivityStatement(child);
      } else if (firstChild.text === 'concept') {
        return this.visitConceptStatement(child);
      }
    }
    return null;
  }

  visitDecisionStatement(ctx: ParserRuleContext): Decision {
    const name = this.getStringValue(ctx.getChild(1));
    const whenClauses: WhenClause[] = [];

    // Visit all when blocks
    const decisionBody = ctx.getChild(3);
    if (decisionBody instanceof ParserRuleContext) {
      for (let i = 0; i < decisionBody.childCount; i++) {
        const child = decisionBody.getChild(i);
        if (child instanceof ParserRuleContext) {
          const whenClause = this.visitWhenBlock(child);
          if (whenClause.type === 'WhenClause') {
            whenClauses.push(whenClause);
          }
        }
      }
    }

    return {
      type: 'Decision',
      name,
      whenClauses,
      location: this.getLocation(ctx),
    };
  }

  visitWhenBlock(ctx: ParserRuleContext): WhenClause {
    const condition = this.getStringValue(ctx.getChild(1));
    const body = ctx.getChild(3);
    let whenClauseBody: WhenClauseBody;
    if (body instanceof ParserRuleContext) {
      if (body.childCount === 2 && body.getChild(1).text === '.') {
        // Single action statement (ends with a dot)
        whenClauseBody = this.visitSingleAction(body);
      } else {
        // Block body
        whenClauseBody = this.visitBlockBody(body);
      }
    } else {
      throw new Error('Invalid when block body');
    }

    return {
      type: 'WhenClause',
      condition,
      body: whenClauseBody,
      location: this.getLocation(ctx),
    };
  }

  visitBlockBody(ctx: ParserRuleContext): BlockBody {
    const statements: BlockStatement[] = [];
    let qualifier: 'any' | 'all' | undefined;

    // Check for any/all qualifier
    const anyOrAllClause = ctx.getChild(1);
    if (anyOrAllClause instanceof ParserRuleContext) {
      qualifier = anyOrAllClause.getChild(0).text as 'any' | 'all';
    }

    // Process block statements
    const startIndex = qualifier ? 2 : 1;
    for (let i = startIndex; i < ctx.childCount - 1; i++) {
      const child = ctx.getChild(i);
      if (child instanceof ParserRuleContext) {
        const statement = this.visitBlockStatement(child);
        if (this.isBlockStatement(statement)) {
          statements.push(statement);
        }
      }
    }

    return {
      type: 'BlockBody',
      qualifier,
      statements,
      location: this.getLocation(ctx),
    };
  }

  visitBlockStatement(ctx: ParserRuleContext): BlockStatement {
    const child = ctx.getChild(0);
    if (child instanceof ParserRuleContext) {
      if (child.getChild(0).text === 'when') {
        return this.visitWhenBlock(child);
      } else {
        return this.visitActionStatement(child);
      }
    }
    throw new Error('Invalid block statement');
  }

  visitActionStatement(ctx: ParserRuleContext): ActionStatement {
    const action = this.visitAction(ctx.getChild(0) as ParserRuleContext);
    return {
      type: 'ActionStatement',
      action,
      location: this.getLocation(ctx),
    };
  }

  private visitAction(ctx: ParserRuleContext): DoAction | UseAction {
    const actionType = ctx.getChild(0).text;
    const name = this.getStringValue(ctx.getChild(1));

    if (actionType === 'do') {
      return {
        type: 'DoAction',
        name,
        location: this.getLocation(ctx),
      };
    } else {
      return {
        type: 'UseAction',
        decisionName: name,
        location: this.getLocation(ctx),
      };
    }
  }

  visitSingleAction(ctx: ParserRuleContext): SingleAction {
    const action = this.visitAction(ctx.getChild(0) as ParserRuleContext);
    return {
      type: 'SingleAction',
      action,
      location: this.getLocation(ctx),
    };
  }

  visitTerminologyStatement(ctx: ParserRuleContext): Terminology {
    const name = this.getStringValue(ctx.getChild(1));
    let definition: TerminologyDefinition;

    const definitionNode = ctx.getChild(2);
    if (definitionNode instanceof ParserRuleContext) {
      const firstChild = definitionNode.getChild(0);
      if (firstChild.text === 'valueset') {
        definition = {
          type: 'TerminologyValueset',
          valuesetName: this.getStringValue(definitionNode.getChild(1)),
          location: this.getLocation(definitionNode),
        };
      } else if (firstChild.text === 'unknown') {
        definition = {
          type: 'TerminologyUnknown',
          location: this.getLocation(definitionNode),
        };
      } else {
        // system code
        definition = {
          type: 'TerminologySystemCode',
          system: this.getStringValue(definitionNode.getChild(1)),
          code: this.getStringValue(definitionNode.getChild(3)),
          location: this.getLocation(definitionNode),
        };
      }
    } else {
      throw new Error('Invalid terminology definition');
    }

    return {
      type: 'Terminology',
      name,
      definition,
      location: this.getLocation(ctx),
    };
  }

  visitActivityStatement(ctx: ParserRuleContext): Activity {
    const name = this.getStringValue(ctx.getChild(1));
    const activityType = ctx.getChild(3).text;
    let of: string | undefined;

    if (ctx.childCount > 5) {
      of = this.getStringValue(ctx.getChild(5));
    }

    return {
      type: 'Activity',
      name,
      activityType,
      of,
      location: this.getLocation(ctx),
    };
  }

  visitConceptStatement(ctx: ParserRuleContext): Concept {
    const name = this.getStringValue(ctx.getChild(1));
    const conceptBody = ctx.getChild(3); // Skip the COLON token

    if (!(conceptBody instanceof ParserRuleContext)) {
      throw new Error('Invalid concept body');
    }

    // Get concept type from hasTypeLine
    const hasTypeLine = conceptBody.getChild(0);
    if (!(hasTypeLine instanceof ParserRuleContext)) {
      throw new Error('Invalid concept type line');
    }
    const conceptType = hasTypeLine.getChild(2).text;

    // Get value type from hasValueTypeLine
    const hasValueTypeLine = conceptBody.getChild(1);
    if (!(hasValueTypeLine instanceof ParserRuleContext)) {
      throw new Error('Invalid value type line');
    }
    const valueType = hasValueTypeLine.getChild(2).text;

    let provenance: string | undefined;
    let definition: CodedByDefinition | InferredByDefinition;

    // Check for provenance line
    let currentIndex = 2;
    const provenanceLine = conceptBody.getChild(currentIndex);
    if (provenanceLine instanceof ParserRuleContext && provenanceLine.getChild(0).text === 'has') {
      provenance = this.getStringValue(provenanceLine.getChild(2));
      currentIndex++;
    }

    // Get definition (coded by or inferred by)
    const definitionLine = conceptBody.getChild(currentIndex);
    if (!(definitionLine instanceof ParserRuleContext)) {
      throw new Error('Invalid concept definition');
    }

    if (definitionLine.getChild(0).text === 'coded') {
      definition = {
        type: 'CodedByDefinition',
        terminologyName: this.getStringValue(definitionLine.getChild(2)),
        location: this.getLocation(definitionLine),
      };
    } else {
      // inferred by
      const inferredBody = definitionLine.getChild(2);
      if (!(inferredBody instanceof ParserRuleContext)) {
        throw new Error('Invalid inferred by definition');
      }

      // Check if this is an expression or pattern
      const children = inferredBody.children || [];
      if (children.length === 0) {
        throw new Error('Invalid inferred by: expected expression or pattern');
      }

      const firstChild = children[0];
      if (firstChild instanceof ParserRuleContext && firstChild.childCount > 0 && firstChild.getChild(0).text === '(') {
        // Expression case: inferred by (expr)
        definition = {
          type: 'InferredByDefinition',
          expression: this.visitExpression(firstChild),
          location: this.getLocation(definitionLine),
        };
      } else {
        // Pattern case: inferred by [pattern] concept
        // Get the pattern context
        const patternContext = firstChild as ParserRuleContext;
        const patternChildren = patternContext.children || [];

        // The first identifier is optional and represents the pattern
        let pattern: string | undefined;
        let concept: string;

        if (patternChildren.length === 1) {
          // Only concept
          concept = patternChildren[0].text;
        } else if (patternChildren.length === 2) {
          // Pattern and concept
          pattern = patternChildren[0].text;
          concept = patternChildren[1].text;
        } else {
          throw new Error('Invalid inferred by pattern: expected one or two identifiers');
        }

        // Validate strings
        if (pattern && (!pattern.startsWith('"') || !pattern.endsWith('"'))) {
          throw new Error('Invalid inferred by pattern: pattern must be a quoted string');
        }
        if (!concept.startsWith('"') || !concept.endsWith('"')) {
          throw new Error('Invalid inferred by pattern: concept must be a quoted string');
        }

        definition = {
          type: 'InferredByDefinition',
          pattern: pattern ? pattern.slice(1, -1) : undefined,
          concept: concept.slice(1, -1),
          location: this.getLocation(definitionLine),
        };
      }
    }

    return {
      type: 'Concept',
      name,
      conceptType,
      valueType,
      provenance,
      definition,
      location: this.getLocation(ctx),
    };
  }

  visitExpression(ctx: ParserRuleContext): Expression {
    const orExpr = ctx.getChild(0);
    if (!(orExpr instanceof ParserRuleContext)) {
      throw new Error('Invalid expression');
    }

    return this.visitOrExpr(orExpr);
  }

  visitOrExpr(ctx: ParserRuleContext): Expression {
    const left = this.visitAndExpr(ctx.getChild(0) as ParserRuleContext);
    if (ctx.childCount === 1) {
      return left;
    }

    const right = this.visitOrExpr(ctx.getChild(2) as ParserRuleContext);
    return {
      type: 'Expression',
      operator: 'or',
      left,
      right,
      location: this.getLocation(ctx),
    };
  }

  visitAndExpr(ctx: ParserRuleContext): Expression {
    const left = this.visitAtom(ctx.getChild(0) as ParserRuleContext);
    if (ctx.childCount === 1) {
      return left;
    }

    const right = this.visitAndExpr(ctx.getChild(2) as ParserRuleContext);
    return {
      type: 'Expression',
      operator: 'and',
      left,
      right,
      location: this.getLocation(ctx),
    };
  }

  visitAtom(ctx: ParserRuleContext): Expression {
    const firstChild = ctx.getChild(0);
    if (firstChild.text === '(') {
      return this.visitOrExpr(ctx.getChild(1) as ParserRuleContext);
    } else {
      const value = this.getStringValue(firstChild);
      return {
        type: 'Expression',
        operator: 'atom',
        left: value,
        right: value,
        location: this.getLocation(ctx),
      };
    }
  }

  private getStringValue(node: ParseTree): string {
    const text = node.text;
    // If the text starts and ends with quotes, remove them
    if (text.startsWith('"') && text.endsWith('"')) {
      return text.slice(1, -1);
    }
    return text;
  }

  private getLocation(node: ParserRuleContext): {
    start: { line: number; column: number };
    end: { line: number; column: number };
  } {
    return {
      start: {
        line: node.start.line,
        column: node.start.charPositionInLine,
      },
      end: {
        line: node.stop?.line ?? node.start.line,
        column: node.stop?.charPositionInLine ?? node.start.charPositionInLine,
      },
    };
  }

  private isStatement(node: ASTNode): node is Statement {
    return (
      node.type === 'Decision' ||
      node.type === 'Terminology' ||
      node.type === 'Activity' ||
      node.type === 'Concept'
    );
  }

  private isBlockStatement(node: ASTNode): node is BlockStatement {
    return node.type === 'WhenClause' || node.type === 'ActionStatement';
  }
}
