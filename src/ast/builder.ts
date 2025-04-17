import { ParserRuleContext } from 'antlr4ts';
import { ParseTree } from 'antlr4ts/tree/ParseTree';
import { ParseTreeVisitor } from 'antlr4ts/tree/ParseTreeVisitor';
import { RuleNode } from 'antlr4ts/tree/RuleNode';
import { TerminalNode } from 'antlr4ts/tree/TerminalNode';

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
  ConceptReferenceType,
  Decision,
  DecisionType,
  DoActivity,
  DoActivityType,
  CPGL,
  FileType,
  GroupExpressionType,
  InferredByConceptType,
  InferredByDefinitionType,
  InformalAndType,
  InformalOrType,
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
  ConceptValueType,
} from './types';

export class ASTBuilder implements ParseTreeVisitor<ASTNode | CPGL> {
  visit(tree: ParseTree): ASTNode | CPGL {
    if (tree instanceof ParserRuleContext) {
      const ruleName = tree.ruleContext.ruleIndex;
      // If it's the root cpgl rule
      if (ruleName === CPGLParser.RULE_cpgl) {
        return this.visitCpgl(tree);
      }
    }
    return tree.accept(this);
  }

  visitChildren(node: RuleNode): ASTNode | CPGL {
    const children: (ASTNode | CPGL)[] = [];
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

  visitTerminal(_node: TerminalNode): ASTNode | CPGL {
    throw new Error('Method not implemented.');
  }

  visitErrorNode(_node: TerminalNode): ASTNode | CPGL {
    throw new Error('Method not implemented.');
  }

  visitCpgl(ctx: ParserRuleContext): CPGL {
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
        const whenBlock = this.visitWhenBlock(child);
        whenBlocks.push(whenBlock);
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
    // 1) Grab the concept name directly
    const conceptName = this.getStringValue(ctx.conceptReference());
  
    // 2) Dispatch on which branch matched
    let body: BlockBody | SingleAction;
    if (ctx.blockBody()) {
      // the grammar ensured this is a full BlockBody
      body = this.visitBlockBody(ctx.blockBody()!);
    } else {
      // it must be the single‑action branch
      body = this.visitSingleAction(ctx.singleActionStatement()!);
    }
  
    // 3) Return your AST node—no dedupe logic needed here
    return {
      type: WhenBlockType.type,
      conceptName,
      body,
      location: this.getLocation(ctx),
    };
  }
  
  visitNestedWhenBlock(ctx: ParserRuleContext): WhenBlock {
    // ctx.whenBlock() is guaranteed non-null
    return this.visitWhenBlock(ctx.whenBlock()!);
  }
  
  // Delegates to your ActionStatement logic:
  visitBlockAction(ctx: ParserRuleContext): ActionStatement {
    // ctx.actionStatement() is guaranteed non-null
    return this.visitActionStatement(ctx.actionStatement()!);
  }

  visitBlockBody(ctx: ParserRuleContext): BlockBody {
    // 1) Qualifier (if present) comes from anyOrAllClause()
    //    .text will be either "any:" or "all:", so slice off the trailing colon
    const qualifierCtx = ctx.anyOrAllClause();
    const qualifier = qualifierCtx
      ? qualifierCtx.text.slice(0, -1)    // "any:" → "any", "all:" → "all"
      : undefined;
  
    // 2) Collect the two kinds of block statements by their labeled contexts
    const statements: (WhenBlock | ActionStatement)[] = [
      ...ctx.nestedWhenBlock().map(nestedCtx => this.visitNestedWhenBlock(nestedCtx)),
      ...ctx.blockAction().map(actionCtx  => this.visitBlockAction(actionCtx)),
    ];
  
    // 3) Return the clean AST node
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
    // Get the full text and remove the dot at the end if present
    const fullText = ctx.text.endsWith('.') ? ctx.text.slice(0, -1) : ctx.text;

    // Extract the action type (do or use) and the name
    const actionType = fullText.startsWith('do') ? 'do' : 'use';
    const name = fullText.slice(actionType.length).trim().replace(/"/g, '');

    if (actionType === 'do') {
      const activity = {
        type: DoActivityType.type,
        activityName: name,
        location: this.getLocation(ctx),
      };
      return activity;
    } else {
      const decision = {
        type: UseDecisionType.type,
        decisionName: name,
        location: this.getLocation(ctx),
      };
      return decision;
    }
  }

  visitTerminologyStatement(ctx: TerminologyStatementContext): Terminology {
    const name = this.getStringValue(ctx.getChild(1));
    const terminology = {
      type: TerminologyType.type,
      name,
      location: this.getLocation(ctx),
    } as Terminology;

    // Check for valueset, system/code, or unknown
    if (ctx.terminologyValueset()) {
      const valuesetCtx = ctx.terminologyValueset()!;
      terminology.definition = {
        type: TerminologyValuesetType.type,
        valuesetName: this.getStringValue(valuesetCtx.getChild(1)),
        location: this.getLocation(valuesetCtx),
      };
    } else if (ctx.terminologySystemCode()) {
      const systemCodeCtx = ctx.terminologySystemCode()!;
      terminology.definition = {
        type: TerminologySystemCodeType.type,
        system: this.getStringValue(systemCodeCtx.getChild(1)),
        code: this.getStringValue(systemCodeCtx.getChild(3)),
        location: this.getLocation(systemCodeCtx),
      };
    } else if (ctx.terminologyUnknown()) {
      const unknownCtx = ctx.terminologyUnknown()!;
      terminology.definition = {
        type: TerminologyUnknownType.type,
        location: this.getLocation(unknownCtx),
      };
    }

    return terminology;
  }

  visitActivityStatement(ctx: ActivityStatementContext): Activity {
    const activityName = this.getStringValue(ctx.getChild(1));
    const perform = this.getStringValue(ctx.getChild(3)) as ActivityType;
    const terminologyReference =
      ctx.childCount > 5 ? this.getStringValue(ctx.getChild(5)) : undefined;
    return {
      type: ActivityType.type,
      name: activityName,
      perform,
      terminologyReference,
      location: this.getLocation(ctx),
    };
  }

  visitConceptStatement(ctx: ConceptStatementContext): Concept {
    const conceptName = this.getStringValue(ctx.getChild(1));
    const conceptBody = this.getContext(ctx.getChild(3));

    // Find the type, valueType, provenance, and definition
    let conceptType = '';
    let valueType = '';
    let provenance: string | undefined;
    let definition: ConceptDefinition | undefined;

    for (let i = 0; i < conceptBody.childCount; i++) {
      const child = conceptBody.getChild(i);
      if (child instanceof ParserRuleContext) {
        const firstToken = child.getChild(0)?.text;
        if (firstToken === 'has') {
          const secondToken = child.getChild(1)?.text;
          if (secondToken === 'type') {
            conceptType = this.getStringValue(child.getChild(2)) as ConceptType;
          } else if (secondToken === 'valuetype') {
            valueType = this.getStringValue(child.getChild(2)) as ConceptValueType;
          } else if (secondToken === 'provenance') {
            provenance = this.getStringValue(child.getChild(2));
          }
        } else if (firstToken === 'coded' || firstToken === 'inferred') {
          definition = this.visitConceptDefinition(child);
        }
      }
    }

    if (!definition) {
      throw new Error('Concept definition is required');
    }

    return {
      type: ConceptType.type,
      name: conceptName,
      conceptType: conceptType as ConceptType,
      valueType: valueType as ConceptValueType,
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
    const inferredBody = this.getContext(ctx.getChild(2));

    // Check if it's a descriptive logic (enclosed in parentheses)
    if (
      inferredBody.getChild(0) instanceof ParserRuleContext &&
      inferredBody.getChild(0).constructor.name === 'InferredByDescriptiveLogicContext'
    ) {
      return {
        type: InferredByDefinitionType.type,
        descriptiveLogic: inferredBody.text,
        location: this.getLocation(ctx),
      };
    }

    // Otherwise it's a concept reference with optional pattern
    const text = inferredBody.text;
    const matches = text.match(/"([^"]+)"\s*"([^"]+)"/);

    if (matches && matches.length === 3) {
      // We have both pattern and concept
      return {
        type: InferredByDefinitionType.type,
        pattern: matches[1],
        concept: matches[2],
        location: this.getLocation(ctx),
      };
    } else {
      // Just a concept reference
      const concept = this.getStringValue(inferredBody.getChild(0));
      return {
        type: InferredByDefinitionType.type,
        concept,
        location: this.getLocation(ctx),
      };
    }
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
