import { ParserRuleContext } from 'antlr4ts';
import { ParseTree } from 'antlr4ts/tree/ParseTree';
import { ParseTreeVisitor } from 'antlr4ts/tree/ParseTreeVisitor';
import { RuleNode } from 'antlr4ts/tree/RuleNode';
import { TerminalNode } from 'antlr4ts/tree/TerminalNode';

import { CPGLLexer } from '../grammar/generated/CPGLLexer';
import {
  CPGLParser,
  DecisionStatementContext,
  TerminologyStatementContext,
  ActivityStatementContext,
  ConceptStatementContext,
} from '../grammar/generated/CPGLParser';

import {
  ASTNode,
  ActionStatement,
  ActionStatementType,
  Activity,
  ActivityType,
  BlockBody,
  BlockBodyType,
  BlockStatement,
  CodedByDefinition,
  CodedByDefinitionType,
  Concept,
  ConceptType,
  Decision,
  DecisionType,
  DoActivity,
  DoActivityType,
  Expression,
  ExpressionType,
  File,
  FileType,
  InferredByDefinition,
  InferredByDefinitionType,
  SingleAction,
  SingleActionType,
  Statement,
  Terminology,
  TerminologyType,
  TerminologyDefinition,
  TerminologyValueset,
  TerminologyValuesetType,
  TerminologyUnknown,
  TerminologyUnknownType,
  TerminologySystemCode,
  TerminologySystemCodeType,
  UseDecision,
  UseDecisionType,
  WhenClause,
  WhenClauseType,
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
    for (let i = 0; i < ctx.childCount; i++) {
      const child = ctx.getChild(i);
      if (child instanceof ParserRuleContext) {
        const statement = this.visitStatement(child);
        if (statement) {
          statements.push(statement);
        }
      }
    }
    return {
      type: FileType.type,
      statements,
      location: this.getLocation(ctx),
    };
  }

  visitStatement(ctx: ParserRuleContext): Statement | null {
    const child = this.getContext(ctx.getChild(0));
    if (child instanceof DecisionStatementContext) {
      return this.visitDecisionStatement(child);
    } else if (child instanceof TerminologyStatementContext) {
      return this.visitTerminologyStatement(child);
    } else if (child instanceof ActivityStatementContext) {
      return this.visitActivityStatement(child);
    } else if (child instanceof ConceptStatementContext) {
      return this.visitConceptStatement(child);
    } else {
      throw new Error(`Unknown statement type: ${child.constructor.name}`);
    }
  }

  visitDecisionStatement(ctx: DecisionStatementContext): Decision {
    const decisionName = this.getStringValue(ctx.getChild(1));
    const blockBody = this.visitBlockBody(this.getContext(ctx.getChild(3)));
    return {
      type: DecisionType.type,
      name: decisionName,
      body: blockBody,
      location: this.getLocation(ctx),
    };
  }

  visitWhenBlock(ctx: ParserRuleContext): WhenClause {
    const condition = this.getStringValue(ctx.getChild(1));
    const body = this.visitWhenClauseBody(this.getContext(ctx.getChild(3)));
    return {
      type: WhenClauseType.type,
      condition,
      body,
      location: this.getLocation(ctx),
    };
  }

  visitWhenClauseBody(ctx: ParserRuleContext): WhenClauseBody {
    if (ctx.childCount === 2 && ctx.getChild(1).text === '.') {
      // Single action statement (ends with a dot)
      return this.visitSingleAction(ctx);
    } else {
      // Block body
      return this.visitBlockBody(ctx);
    }
  }

  visitBlockBody(ctx: ParserRuleContext): BlockBody {
    const statements: BlockStatement[] = [];
    let qualifier: 'any' | 'all' | undefined;
    for (let i = 1; i < ctx.childCount - 1; i++) {
      const child = ctx.getChild(i);
      if (child instanceof ParserRuleContext) {
        if (child.getChild(0).text === 'any' || child.getChild(0).text === 'all') {
          qualifier = child.getChild(0).text as 'any' | 'all';
        } else {
          const statement = this.visitBlockStatement(child);
          statements.push(statement);
        }
      }
    }
    return {
      type: BlockBodyType.type,
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
    const action = this.visitAction(this.getContext(ctx.getChild(0)));
    return {
      type: ActionStatementType.type,
      action,
      location: this.getLocation(ctx),
    };
  }

  private visitAction(ctx: ParserRuleContext): DoActivity | UseDecision {
    const actionType = ctx.getChild(0).text;
    const name = this.getStringValue(ctx.getChild(1));

    if (actionType === CPGLLexer.DO.toString()) {
      return {
        type: DoActivityType.type,
        activityName: name,
        location: this.getLocation(ctx),
      };
    } else {
      return {
        type: UseDecisionType.type,
        decisionName: name,
        location: this.getLocation(ctx),
      };
    }
  }

  visitSingleAction(ctx: ParserRuleContext): SingleAction {
    const action = this.visitAction(this.getContext(ctx.getChild(0)));
    return {
      type: SingleActionType.type,
      action,
      location: this.getLocation(ctx),
    };
  }

  visitTerminologyStatement(ctx: TerminologyStatementContext): Terminology {
    const terminologyName = this.getStringValue(ctx.getChild(1));
    const definition = this.visitTerminologyDefinition(this.getContext(ctx.getChild(3)));
    return {
      type: TerminologyType.type,
      name: terminologyName,
      definition,
      location: this.getLocation(ctx),
    };
  }

  visitActivityStatement(ctx: ActivityStatementContext): Activity {
    const activityName = this.getStringValue(ctx.getChild(1));
    const blockBody = this.visitBlockBody(this.getContext(ctx.getChild(3)));
    return {
      type: ActivityType.type,
      name: activityName,
      body: blockBody,
      location: this.getLocation(ctx),
    };
  }

  visitConceptStatement(ctx: ConceptStatementContext): Concept {
    const conceptName = this.getStringValue(ctx.getChild(1));
    const conceptType = this.getStringValue(ctx.getChild(3));
    const valueType = this.getStringValue(ctx.getChild(5));
    const definition = this.visitConceptDefinition(this.getContext(ctx.getChild(7)));
    return {
      type: ConceptType.type,
      name: conceptName,
      conceptType,
      valueType,
      definition,
      location: this.getLocation(ctx),
    };
  }

  private visitTerminologyDefinition(ctx: ParserRuleContext): TerminologyDefinition {
    const firstChild = ctx.getChild(0);
    if (firstChild.text === CPGLLexer.VALUESET.toString()) {
      return {
        type: TerminologyValuesetType.type,
        valuesetName: this.getStringValue(ctx.getChild(1)),
        location: this.getLocation(ctx),
      };
    } else if (firstChild.text === CPGLLexer.UNKNOWN.toString()) {
      return {
        type: TerminologyUnknownType.type,
        location: this.getLocation(ctx),
      };
    } else {
      // system code
      return {
        type: TerminologySystemCodeType.type,
        system: this.getStringValue(ctx.getChild(1)),
        code: this.getStringValue(ctx.getChild(3)),
        location: this.getLocation(ctx),
      };
    }
  }

  private visitConceptDefinition(ctx: ParserRuleContext): CodedByDefinition | InferredByDefinition {
    const firstChild = ctx.getChild(0);
    if (firstChild.text === CPGLLexer.CODED.toString()) {
      return this.visitCodedByDefinition(ctx);
    } else {
      return this.visitInferredByDefinition(ctx);
    }
  }

  private visitCodedByDefinition(ctx: ParserRuleContext): CodedByDefinition {
    const terminologyName = this.getStringValue(ctx.getChild(1));
    return {
      type: CodedByDefinitionType.type,
      terminologyName,
      location: this.getLocation(ctx),
    };
  }

  private visitInferredByDefinition(ctx: ParserRuleContext): InferredByDefinition {
    const pattern = ctx.childCount > 1 ? this.getStringValue(ctx.getChild(1)) : undefined;
    const concept = ctx.childCount > 2 ? this.getStringValue(ctx.getChild(2)) : undefined;
    const expression =
      ctx.childCount > 3 ? this.visitExpression(this.getContext(ctx.getChild(3))) : undefined;
    return {
      type: InferredByDefinitionType.type,
      pattern,
      concept,
      expression,
      location: this.getLocation(ctx),
    };
  }

  visitExpression(ctx: ParserRuleContext): Expression {
    const operator = ctx.getChild(1).text as 'or' | 'and' | 'atom';
    const left = this.visitExpression(this.getContext(ctx.getChild(0)));
    const right = this.visitExpression(this.getContext(ctx.getChild(2)));
    return {
      type: ExpressionType.type,
      operator,
      left,
      right,
      location: this.getLocation(ctx),
    };
  }

  private getStringValue(node: ParseTree): string {
    if (!(node instanceof ParserRuleContext)) {
      return node.text;
    }
    return node.text;
  }

  private getLocation(ctx: ParserRuleContext): {
    start: { line: number; column: number };
    end: { line: number; column: number };
  } {
    if (!ctx.stop) {
      return {
        start: {
          line: ctx.start.line,
          column: ctx.start.charPositionInLine,
        },
        end: {
          line: ctx.start.line,
          column: ctx.start.charPositionInLine + (ctx.start.text?.length ?? 0),
        },
      };
    }
    return {
      start: {
        line: ctx.start.line,
        column: ctx.start.charPositionInLine,
      },
      end: {
        line: ctx.stop.line,
        column: ctx.stop.charPositionInLine + (ctx.stop.text?.length ?? 0),
      },
    };
  }

  private getContext(node: ParseTree): ParserRuleContext {
    if (!(node instanceof ParserRuleContext)) {
      throw new Error('Expected ParserRuleContext');
    }
    return node;
  }

  private isStatement(node: ASTNode): node is Statement {
    return (
      node.type === DecisionType.type ||
      node.type === TerminologyType.type ||
      node.type === ActivityType.type ||
      node.type === ConceptType.type
    );
  }

  private isBlockStatement(node: ASTNode): node is BlockStatement {
    return node.type === WhenClauseType.type || node.type === ActionStatementType.type;
  }

  visitTerminologyValueset(ctx: ParserRuleContext): TerminologyValueset {
    return {
      type: TerminologyValuesetType.type,
      valuesetName: this.getStringValue(ctx.getChild(1)),
      location: this.getLocation(ctx),
    };
  }

  visitTerminologyUnknown(ctx: ParserRuleContext): TerminologyUnknown {
    return {
      type: TerminologyUnknownType.type,
      location: this.getLocation(ctx),
    };
  }

  visitTerminologySystemCode(ctx: ParserRuleContext): TerminologySystemCode {
    return {
      type: TerminologySystemCodeType.type,
      system: this.getStringValue(ctx.getChild(1)),
      code: this.getStringValue(ctx.getChild(3)),
      location: this.getLocation(ctx),
    };
  }
}
