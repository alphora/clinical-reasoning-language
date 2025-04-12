import { ParserRuleContext } from 'antlr4ts';
import { ParseTree } from 'antlr4ts/tree/ParseTree';
import { ParseTreeVisitor } from 'antlr4ts/tree/ParseTreeVisitor';
import { RuleNode } from 'antlr4ts/tree/RuleNode';
import { TerminalNode } from 'antlr4ts/tree/TerminalNode';

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
  ConceptDefinition,
  Decision,
  DoAction,
  File,
  InferredByDefinition,
  SingleAction,
  Terminology,
  TerminologyDefinition,
  TerminologySystemCode,
  TerminologyUnknown,
  TerminologyValueset,
  UseAction,
  WhenClause,
  WhenClauseBody,
} from './types';

export class ASTBuilder implements ParseTreeVisitor<ASTNode> {
  visit(tree: ParseTree): ASTNode {
    return tree.accept(this);
  }

  visitChildren(_node: RuleNode): ASTNode {
    throw new Error('Method not implemented.');
  }

  visitTerminal(_node: TerminalNode): ASTNode {
    throw new Error('Method not implemented.');
  }

  visitErrorNode(_node: TerminalNode): ASTNode {
    throw new Error('Method not implemented.');
  }

  visitCpgl(ctx: ParserRuleContext): File {
    const statements: Statement[] = [];
    for (let i = 0; i < ctx.childCount; i++) {
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

  private isStatement(node: ASTNode): node is Statement {
    return (
      node.type === 'Decision' ||
      node.type === 'Terminology' ||
      node.type === 'Activity' ||
      node.type === 'Concept'
    );
  }

  visitStatement(ctx: ParserRuleContext): ASTNode | null {
    const child = ctx.getChild(0);
    if (child instanceof ParserRuleContext) {
      return child.accept(this);
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
    let startIndex = 0;
    let qualifier: 'any' | 'all' | undefined;

    // Check for qualifier
    if (ctx.childCount > 4 && (ctx.getChild(0).text === 'any' || ctx.getChild(0).text === 'all')) {
      qualifier = ctx.getChild(0).text as 'any' | 'all';
      startIndex = 2; // Skip qualifier and NEWLINE
    }

    const condition = this.getStringValue(ctx.getChild(startIndex + 1));
    const body = this.visitWhenBlockBody(ctx.getChild(startIndex + 4) as ParserRuleContext);

    return {
      type: 'WhenClause',
      condition,
      qualifier,
      body,
      location: this.getLocation(ctx),
    };
  }

  private visitWhenBlockBody(ctx: ParserRuleContext): WhenClauseBody {
    const firstChild = ctx.getChild(0);
    if (firstChild.text === ':') {
      // This is a block body
      return this.visitBlockBody(ctx);
    } else {
      // This is a single action
      return this.visitSingleAction(ctx);
    }
  }

  visitBlockBody(ctx: ParserRuleContext): BlockBody {
    let qualifier: 'any' | 'all' | undefined;
    const statements: BlockStatement[] = [];

    // Check for qualifier
    const anyOrAllClause = ctx.getChild(1);
    if (anyOrAllClause instanceof ParserRuleContext) {
      qualifier = anyOrAllClause.getChild(0).text as 'any' | 'all';
    }

    // Visit all block statements
    for (let i = 2; i < ctx.childCount - 1; i++) {
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

  private isBlockStatement(node: ASTNode): node is BlockStatement {
    return node.type === 'WhenClause' || node.type === 'ActionStatement';
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
    const definition = this.visitTerminologyDefinition(ctx.getChild(2) as ParserRuleContext);

    return {
      type: 'Terminology',
      name,
      definition,
      location: this.getLocation(ctx),
    };
  }

  private visitTerminologyDefinition(ctx: ParserRuleContext): TerminologyDefinition {
    const firstChild = ctx.getChild(0);
    if (firstChild.text === 'valueset') {
      return this.visitTerminologyValueset(ctx);
    } else if (firstChild.text === 'unknown') {
      return this.visitTerminologyUnknown(ctx);
    } else {
      return this.visitTerminologySystemCode(ctx);
    }
  }

  visitTerminologyValueset(ctx: ParserRuleContext): TerminologyValueset {
    const valuesetName = this.getStringValue(ctx.getChild(1));
    return {
      type: 'TerminologyValueset',
      valuesetName,
      location: this.getLocation(ctx),
    };
  }

  visitTerminologyUnknown(ctx: ParserRuleContext): TerminologyUnknown {
    return {
      type: 'TerminologyUnknown',
      location: this.getLocation(ctx),
    };
  }

  visitTerminologySystemCode(ctx: ParserRuleContext): TerminologySystemCode {
    const system = this.getStringValue(ctx.getChild(1));
    const code = this.getStringValue(ctx.getChild(3));
    return {
      type: 'TerminologySystemCode',
      system,
      code,
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
    const conceptBody = ctx.getChild(3);

    if (!(conceptBody instanceof ParserRuleContext)) {
      throw new Error('Invalid concept body');
    }

    const type = this.getStringValue(conceptBody.getChild(1));
    const valueType = this.getStringValue(conceptBody.getChild(3));
    let provenance: string | undefined;
    let definition: ConceptDefinition;

    // Check for provenance
    if (conceptBody.childCount > 4) {
      const provenanceLine = conceptBody.getChild(4);
      if (provenanceLine instanceof ParserRuleContext) {
        provenance = this.getStringValue(provenanceLine.getChild(2));
      }
    }

    // Get definition (coded by or inferred by)
    const definitionLine = conceptBody.getChild(conceptBody.childCount - 2);
    if (definitionLine instanceof ParserRuleContext) {
      if (definitionLine.getChild(0).text === 'coded') {
        definition = this.visitCodedByDefinition(definitionLine);
      } else {
        definition = this.visitInferredByDefinition(definitionLine);
      }
    } else {
      throw new Error('Invalid concept definition');
    }

    return {
      type: 'Concept',
      name,
      conceptType: type,
      valueType,
      provenance,
      definition,
      location: this.getLocation(ctx),
    };
  }

  visitCodedByDefinition(ctx: ParserRuleContext): CodedByDefinition {
    const terminologyName = this.getStringValue(ctx.getChild(2));
    return {
      type: 'CodedByDefinition',
      terminologyName,
      location: this.getLocation(ctx),
    };
  }

  visitInferredByDefinition(ctx: ParserRuleContext): InferredByDefinition {
    const inferredBody = ctx.getChild(2);
    if (!(inferredBody instanceof ParserRuleContext)) {
      throw new Error('Invalid inferred body');
    }

    if (inferredBody.getChild(0).text === '(') {
      // This is an expression
      return {
        type: 'InferredByDefinition',
        expression: this.visitExpression(inferredBody),
        location: this.getLocation(ctx),
      };
    } else {
      // This is a pattern
      const pattern = this.getStringValue(inferredBody.getChild(0));
      const concept = this.getStringValue(inferredBody.getChild(1));
      return {
        type: 'InferredByDefinition',
        pattern,
        concept,
        location: this.getLocation(ctx),
      };
    }
  }

  visitExpression(ctx: ParserRuleContext): Expression {
    const orExpr = ctx.getChild(1);
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
    // Remove quotes from string literals
    return text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
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
}
