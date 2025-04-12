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
  CodedByDefinition,
  CodedByDefinitionType,
  Concept,
  ConceptType,
  ConceptDefinition,
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
  WhenBlock,
  WhenBlockType,
  WhenBlockBody,
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
    const whenBlocks: WhenBlock[] = [];
    const blockBody = this.getContext(ctx.getChild(3));
    for (let i = 0; i < blockBody.childCount; i++) {
      const child = blockBody.getChild(i);
      if (child instanceof ParserRuleContext && child.getChild(0)?.text === 'when') {
        whenBlocks.push(this.visitWhenBlock(child));
      }
    }
    return {
      type: DecisionType.type,
      name: decisionName,
      body: {
        type: 'DecisionBody',
        statements: whenBlocks,
        location: this.getLocation(ctx),
      },
      location: this.getLocation(ctx),
    };
  }

  visitWhenBlock(ctx: ParserRuleContext): WhenBlock {
    const condition = this.getStringValue(ctx.getChild(1));
    const body = this.visitWhenBlockBody(this.getContext(ctx.getChild(3)));
    return {
      type: WhenBlockType.type,
      condition,
      body,
      location: this.getLocation(ctx),
    };
  }

  visitWhenBlockBody(ctx: ParserRuleContext): WhenBlockBody {
    if (ctx.childCount === 2 && ctx.getChild(1).text === '.') {
      // Single action statement (ends with a dot)
      return this.visitSingleAction(this.getContext(ctx.getChild(0)));
    } else {
      // Block body
      return this.visitBlockBody(ctx);
    }
  }

  visitBlockBody(ctx: ParserRuleContext): BlockBody {
    const statements: (WhenBlock | ActionStatement)[] = [];
    let qualifier: string | undefined;
    for (let i = 0; i < ctx.childCount; i++) {
      const child = ctx.getChild(i);
      if (child instanceof ParserRuleContext) {
        const firstChild = child.getChild(0);
        if (firstChild?.text === 'any') {
          qualifier = CPGLLexer.ANY.toString();
        } else if (firstChild?.text === 'all') {
          qualifier = CPGLLexer.ALL.toString();
        } else if (firstChild?.text === 'when') {
          statements.push(this.visitWhenBlock(child));
        } else if (firstChild?.text === 'do' || firstChild?.text === 'use') {
          statements.push(this.visitActionStatement(child));
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

  visitActionStatement(ctx: ParserRuleContext): ActionStatement {
    const action = this.visitAction(ctx);
    return {
      type: ActionStatementType.type,
      action,
      location: this.getLocation(ctx),
    };
  }

  visitSingleAction(ctx: ParserRuleContext): SingleAction {
    const action = this.visitAction(ctx);
    return {
      type: SingleActionType.type,
      action,
      location: this.getLocation(ctx),
    };
  }

  private visitAction(ctx: ParserRuleContext): DoActivity | UseDecision {
    const actionType = ctx.getChild(0).text;
    const name = this.getStringValue(ctx.getChild(1));

    if (actionType === 'do') {
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
    const activityType = this.getStringValue(ctx.getChild(3));
    const terminologyReference =
      ctx.childCount > 5 ? this.getStringValue(ctx.getChild(5)) : undefined;
    return {
      type: ActivityType.type,
      name: activityName,
      activityType,
      terminologyReference,
      location: this.getLocation(ctx),
    };
  }

  visitConceptStatement(ctx: ConceptStatementContext): Concept {
    const conceptName = this.getStringValue(ctx.getChild(1));
    const conceptType = this.getStringValue(ctx.getChild(3));
    const valueType = this.getStringValue(ctx.getChild(5));
    const provenance = ctx.childCount > 7 ? this.getStringValue(ctx.getChild(7)) : undefined;
    const definition = this.visitConceptDefinition(
      this.getContext(ctx.getChild(ctx.childCount - 2)),
    );

    return {
      type: ConceptType.type,
      name: conceptName,
      conceptType,
      valueType,
      provenance,
      definition,
      location: this.getLocation(ctx),
    };
  }

  visitTerminologyDefinition(ctx: ParserRuleContext): TerminologyDefinition {
    const firstToken = ctx.getChild(0).text;
    if (firstToken === 'valueset') {
      return this.visitTerminologyValueset(ctx);
    } else if (firstToken === 'system') {
      return this.visitTerminologySystemCode(ctx);
    } else {
      return this.visitTerminologyUnknown(ctx);
    }
  }

  visitTerminologyValueset(ctx: ParserRuleContext): TerminologyValueset {
    const valuesetName = this.getStringValue(ctx.getChild(1));
    return {
      type: TerminologyValuesetType.type,
      valuesetName,
      location: this.getLocation(ctx),
    };
  }

  visitTerminologySystemCode(ctx: ParserRuleContext): TerminologySystemCode {
    const system = this.getStringValue(ctx.getChild(1));
    const code = this.getStringValue(ctx.getChild(3));
    return {
      type: TerminologySystemCodeType.type,
      system,
      code,
      location: this.getLocation(ctx),
    };
  }

  visitTerminologyUnknown(ctx: ParserRuleContext): TerminologyUnknown {
    return {
      type: TerminologyUnknownType.type,
      location: this.getLocation(ctx),
    };
  }

  visitConceptDefinition(ctx: ParserRuleContext): ConceptDefinition {
    const firstToken = ctx.getChild(0).text;
    if (firstToken === 'coded') {
      return this.visitCodedByDefinition(ctx);
    } else {
      return this.visitInferredByDefinition(ctx);
    }
  }

  visitCodedByDefinition(ctx: ParserRuleContext): CodedByDefinition {
    const terminologyName = this.getStringValue(ctx.getChild(2));
    return {
      type: CodedByDefinitionType.type,
      terminologyName,
      location: this.getLocation(ctx),
    };
  }

  visitInferredByDefinition(ctx: ParserRuleContext): InferredByDefinition {
    const pattern = ctx.childCount > 2 ? this.getStringValue(ctx.getChild(2)) : undefined;
    const concept = ctx.childCount > 4 ? this.getStringValue(ctx.getChild(4)) : undefined;
    const descriptiveLogic = ctx.childCount > 6 ? this.getStringValue(ctx.getChild(6)) : undefined;
    return {
      type: InferredByDefinitionType.type,
      pattern,
      concept,
      descriptiveLogic,
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
    const text = node.text;
    // Remove quotes if present
    return text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
  }

  private getLocation(ctx: ParserRuleContext): {
    start: { line: number; column: number };
    end: { line: number; column: number };
  } {
    return {
      start: {
        line: ctx.start.line,
        column: ctx.start.charPositionInLine,
      },
      end: {
        line: ctx.stop?.line ?? ctx.start.line,
        column: ctx.stop?.charPositionInLine ?? ctx.start.charPositionInLine,
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

  private isBlockStatement(node: ASTNode): node is WhenBlock | ActionStatement {
    return node.type === WhenBlockType.type || node.type === ActionStatementType.type;
  }
}
