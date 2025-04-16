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
  ConceptValueType,
} from './types';

export class ASTBuilder implements ParseTreeVisitor<ASTNode | File> {
  private readonly seenConcepts: Set<string> = new Set();
  private readonly seenActions: Set<string> = new Set();
  private readonly seenDecisionNames: Set<string> = new Set();
  private readonly seenConceptNames: Set<string> = new Set();
  private readonly seenTerminologyNames: Set<string> = new Set();
  private readonly seenActivityNames: Set<string> = new Set();

  visit(tree: ParseTree): ASTNode | File {
    if (tree instanceof ParserRuleContext) {
      const ruleName = tree.ruleContext.ruleIndex;
      // If it's the root cpgl rule
      if (ruleName === CPGLParser.RULE_cpgl) {
        return this.visitCpgl(tree);
      }
    }
    return tree.accept(this);
  }

  visitChildren(node: RuleNode): ASTNode | File {
    const children: (ASTNode | File)[] = [];
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

  visitTerminal(_node: TerminalNode): ASTNode | File {
    throw new Error('Method not implemented.');
  }

  visitErrorNode(_node: TerminalNode): ASTNode | File {
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
    if (this.seenDecisionNames.has(decisionName)) {
      throw new Error(`Duplicate decision name: ${decisionName}`);
    }
    this.seenDecisionNames.add(decisionName);
    const whenBlocks: WhenBlock[] = [];
    const seenConcepts = new Set<string>();
    const blockBody = this.getContext(ctx.getChild(3));
    for (let i = 0; i < blockBody.childCount; i++) {
      const child = blockBody.getChild(i);
      if (child instanceof ParserRuleContext && child.getChild(0)?.text === 'when') {
        const whenBlock = this.visitWhenBlock(child);
        if (!seenConcepts.has(whenBlock.conceptName)) {
          seenConcepts.add(whenBlock.conceptName);
        } else {
          console.warn(
            '[Builder - Duplication] Duplicate whenBlock concept name: ',
            whenBlock.conceptName,
          );
        }
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
    const conceptName = this.getStringValue(ctx.getChild(1));
    const body = this.visitWhenBlockBody(this.getContext(ctx.getChild(3)));

    // If the body is a block body, we need to ensure we don't have duplicate statements
    if (body.type === BlockBodyType.type) {
      const statements: (WhenBlock | ActionStatement)[] = [];

      for (const statement of body.statements) {
        if (statement.type === WhenBlockType.type) {
          const whenBlock = statement as WhenBlock;
          const conceptKey = `${conceptName}:${whenBlock.conceptName}`;
          if (!this.seenConcepts.has(conceptKey)) {
            this.seenConcepts.add(conceptKey);
          } else {
            console.warn('[Builder - Duplication]: duplicate concept key: ', conceptKey);
          }
          statements.push(statement);
        } else if (statement.type === ActionStatementType.type) {
          const actionStatement = statement as ActionStatement;
          const actionKey =
            actionStatement.action.type === DoActivityType.type
              ? `${conceptName}:do:${(actionStatement.action as DoActivity).activityName}`
              : `${conceptName}:use:${(actionStatement.action as UseDecision).decisionName}`;
          if (!this.seenActions.has(actionKey)) {
            this.seenActions.add(actionKey);
          } else {
            console.warn('[Builder - Duplication]: duplicate action key: ', actionKey);
          }
          statements.push(statement);
        }
      }

      body.statements = statements;
    }

    return {
      type: WhenBlockType.type,
      conceptName,
      body,
      location: this.getLocation(ctx),
    };
  }

  visitWhenBlockBody(ctx: ParserRuleContext): WhenBlockBody {
    // If the first child is a 'do' or 'use' statement and it's followed by a dot,
    // then it's a single action
    const firstChild = ctx.getChild(0);
    if (firstChild instanceof ParserRuleContext) {
      const actionType = firstChild.getChild(0)?.text;
      if ((actionType === 'do' || actionType === 'use') && ctx.getChild(1)?.text === '.') {
        return this.visitSingleAction(firstChild);
      }
    }

    // Otherwise, it's a block body
    return this.visitBlockBody(ctx);
  }

  visitBlockBody(ctx: ParserRuleContext): BlockBody {
    const statements: (WhenBlock | ActionStatement)[] = [];
    let qualifier: string | undefined;
    let currentIndex = 0;

    // Skip the initial COLON
    if (ctx.childCount > 0 && ctx.getChild(0).text === ':') {
      currentIndex = 1;
    }

    // Check for qualifier (any/all)
    if (currentIndex < ctx.childCount) {
      const child = ctx.getChild(currentIndex);
      if (child instanceof ParserRuleContext) {
        const firstToken = child.getChild(0)?.text;
        if (firstToken === 'any' || firstToken === 'all') {
          qualifier = firstToken;
          currentIndex++;
        }
      }
    }

    // Process block statements
    while (currentIndex < ctx.childCount) {
      const child = ctx.getChild(currentIndex);
      if (child instanceof ParserRuleContext) {
        if (child.constructor.name === 'BlockStatementContext') {
          const statementChild = child.getChild(0);
          if (statementChild instanceof ParserRuleContext) {
            const firstChild = statementChild.getChild(0);
            if (firstChild) {
              const text = firstChild.text;

              if (text === 'when') {
                const whenBlock = this.visitWhenBlock(statementChild);
                // Only add if we haven't seen this when block before
                if (
                  !statements.some(
                    s =>
                      s.type === WhenBlockType.type &&
                      (s as WhenBlock).conceptName === whenBlock.conceptName,
                  )
                ) {
                  statements.push(whenBlock);
                } else {
                  console.warn(
                    '[Builder - Duplication] Duplicate when block at same level: ',
                    whenBlock.conceptName,
                  );
                }
              } else if (RegExp(/^(do|use)"[^"]+"/).exec(text)) {
                // Process action statement
                const action = this.visitAction(statementChild);
                const actionStatement: ActionStatement = {
                  type: ActionStatementType.type,
                  action,
                  location: this.getLocation(statementChild),
                };
                // Only add if we haven't seen this action before
                if (
                  !statements.some(s => {
                    if (s.type !== ActionStatementType.type) return false;
                    const existingAction = (s as ActionStatement).action;
                    if (existingAction.type !== action.type) return false;
                    if (action.type === DoActivityType.type) {
                      return (
                        (existingAction as DoActivity).activityName ===
                        (action as DoActivity).activityName
                      );
                    } else {
                      return (
                        (existingAction as UseDecision).decisionName ===
                        (action as UseDecision).decisionName
                      );
                    }
                  })
                ) {
                  statements.push(actionStatement);
                } else {
                  console.warn(
                    '[Builder - Duplication] Duplicate action at same level: ',
                    action.type === DoActivityType.type
                      ? (action as DoActivity).activityName
                      : (action as UseDecision).decisionName,
                  );
                }

                // Skip the dot if present
                if (ctx.getChild(currentIndex + 1)?.text === '.') {
                  currentIndex++;
                }
              }
            }
          }
        }
      }
      currentIndex++;
    }

    return {
      type: BlockBodyType.type,
      statements,
      qualifier,
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
    const terminologyName = this.getStringValue(ctx.getChild(1));
    if (this.seenTerminologyNames.has(terminologyName)) {
      throw new Error(`Duplicate terminologyName name: ${terminologyName}`);
    }
    this.seenTerminologyNames.add(terminologyName);
    const definition = this.visitTerminologyDefinition(this.getContext(ctx.getChild(2)));
    return {
      type: TerminologyType.type,
      name: terminologyName,
      definition,
      location: this.getLocation(ctx),
    };
  }

  visitActivityStatement(ctx: ActivityStatementContext): Activity {
    const activityName = this.getStringValue(ctx.getChild(1));
    if (this.seenActivityNames.has(activityName)) {
      throw new Error(`Duplicate activity name: ${activityName}`);
    }
    this.seenActivityNames.add(activityName);
    const activityType = this.getStringValue(ctx.getChild(3)) as ActivityType;
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
    if (this.seenConceptNames.has(conceptName)) {
      throw new Error(`Duplicate concept name: ${conceptName}`);
    }
    this.seenConceptNames.add(conceptName);
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
      const descriptiveLogic = inferredBody.text;

      // For simple descriptive logic (no nested parentheses), remove all parentheses
      // For complex descriptive logic (with nested parentheses), keep them
      const hasNestedParentheses = (descriptiveLogic.match(/\(/g) || []).length > 1;

      let cleanedLogic = descriptiveLogic;
      if (!hasNestedParentheses) {
        // Simple case - remove all parentheses
        cleanedLogic = cleanedLogic
          .slice(1, -1) // Remove outer parentheses
          .replace(/[()]/g, '') // Remove all parentheses
          .replace(/"/g, '') // Remove all quotes
          .replace(/\s+/g, ' ') // Normalize whitespace
          .replace(/\s*(and|or)\s*/g, ' $1 ') // Ensure spaces around operators
          .trim(); // Remove leading/trailing whitespace
      } else {
        // Complex case - keep parentheses structure but clean up formatting
        cleanedLogic = cleanedLogic
          .slice(1, -1) // Remove outer parentheses
          .replace(/"\s*([^"]+)\s*"/g, '$1') // Remove quotes but keep content
          .replace(/\s+/g, ' ') // Normalize whitespace
          .replace(/\s*\(\s*/g, '(') // Remove spaces after opening parentheses
          .replace(/\s*\)\s*/g, ') ') // Keep one space after closing parentheses
          .replace(/\s*(and|or)\s*/g, ' $1 ') // Ensure spaces around operators
          .trim(); // Remove leading/trailing whitespace
      }

      return {
        type: InferredByDefinitionType.type,
        descriptiveLogic: cleanedLogic,
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
