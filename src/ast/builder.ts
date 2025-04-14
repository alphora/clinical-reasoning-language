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
    console.log('[DEBUGGING] WhenBlock - Processing when block:', {
      text: ctx.text,
      childCount: ctx.childCount,
    });
    const conceptName = this.getStringValue(ctx.getChild(1));
    const body = this.visitWhenBlockBody(this.getContext(ctx.getChild(3)));
    console.log('[DEBUGGING] WhenBlock - Created when block:', {
      conceptName,
      bodyType: body.type,
    });
    return {
      type: WhenBlockType.type,
      conceptName,
      body,
      location: this.getLocation(ctx),
    };
  }

  visitWhenBlockBody(ctx: ParserRuleContext): WhenBlockBody {
    console.log('[DEBUGGING] WhenBlockBody - Processing body:', {
      text: ctx.text,
      childCount: ctx.childCount,
      lastChild: ctx.getChild(ctx.childCount - 1).text,
    });

    // If the first child is a 'do' or 'use' statement and it's followed by a dot,
    // then it's a single action
    const firstChild = ctx.getChild(0);
    if (firstChild instanceof ParserRuleContext) {
      const actionType = firstChild.getChild(0)?.text;
      if ((actionType === 'do' || actionType === 'use') && ctx.getChild(1)?.text === '.') {
        console.log('[DEBUGGING] WhenBlockBody - Found single action statement');
        return this.visitSingleAction(firstChild);
      }
    }

    // Otherwise, it's a block body
    console.log('[DEBUGGING] WhenBlockBody - Found block body');
    return this.visitBlockBody(ctx);
  }

  visitBlockBody(ctx: ParserRuleContext): BlockBody {
    const statements: (WhenBlock | ActionStatement)[] = [];
    let qualifier: string | undefined;
    let currentIndex = 0;

    console.log('[DEBUGGING] BlockBody - Starting to process block body');
    console.log('[DEBUGGING] BlockBody - Total children:', ctx.childCount);

    // Log the structure of the context
    for (let j = 0; j < ctx.childCount; j++) {
      const child = ctx.getChild(j);
      console.log('[DEBUGGING] BlockBody - Child ' + j + ':', {
        text: child.text,
        type: child instanceof ParserRuleContext ? child.constructor.name : 'Terminal',
      });
    }

    // Skip the initial COLON
    if (ctx.childCount > 0 && ctx.getChild(0).text === ':') {
      currentIndex = 1;
      console.log('[DEBUGGING] BlockBody - Skipped initial COLON, currentIndex:', currentIndex);
    }

    // Check for qualifier (any/all)
    if (currentIndex < ctx.childCount) {
      const child = ctx.getChild(currentIndex);
      if (child instanceof ParserRuleContext) {
        const firstToken = child.getChild(0)?.text;
        if (firstToken === 'any' || firstToken === 'all') {
          qualifier = firstToken;
          currentIndex++;
          console.log(
            '[DEBUGGING] BlockBody - Found qualifier:',
            qualifier,
            'currentIndex:',
            currentIndex,
          );
        }
      }
    }

    // Process block statements
    while (currentIndex < ctx.childCount) {
      const child = ctx.getChild(currentIndex);
      if (child instanceof ParserRuleContext) {
        console.log('[DEBUGGING] BlockBody - Processing child:', {
          text: child.text,
          type: child.constructor.name,
        });

        if (child.constructor.name === 'BlockStatementContext') {
          const statementChild = child.getChild(0);
          if (statementChild instanceof ParserRuleContext) {
            const firstChild = statementChild.getChild(0);
            if (firstChild) {
              const text = firstChild.text;
              console.log('[DEBUGGING] BlockBody - Processing statement:', text);

              if (text === 'when') {
                const whenBlock = this.visitWhenBlock(statementChild);
                statements.push(whenBlock);
                console.log('[DEBUGGING] BlockBody - Added when block:', {
                  conceptName: whenBlock.conceptName,
                  statementsLength: statements.length,
                });
              } else if (RegExp(/^(do|use)"[^"]+"/).exec(text)) {
                // Process action statement
                const action = this.visitAction(statementChild);
                const actionStatement: ActionStatement = {
                  type: ActionStatementType.type,
                  action,
                  location: this.getLocation(statementChild),
                };
                statements.push(actionStatement);
                console.log('[DEBUGGING] BlockBody - Added action statement:', {
                  type: action.type,
                  name:
                    action.type === DoActivityType.type
                      ? (action as DoActivity).activityName
                      : (action as UseDecision).decisionName,
                  statementsLength: statements.length,
                });

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

    console.log(
      '[DEBUGGING] BlockBody - Final statements array:',
      statements.map(s => ({
        type: s.type,
        details:
          s.type === WhenBlockType.type
            ? s.conceptName
            : 'activityName' in s.action
              ? s.action.activityName
              : s.action.decisionName,
      })),
    );

    return {
      type: BlockBodyType.type,
      statements,
      qualifier,
      location: this.getLocation(ctx),
    };
  }

  visitActionStatement(ctx: ParserRuleContext): ActionStatement {
    console.log('[DEBUGGING] ActionStatement - Processing action statement:', {
      text: ctx.text,
      childCount: ctx.childCount,
    });
    const action = this.visitAction(ctx);
    console.log('[DEBUGGING] ActionStatement - Created action:', {
      type: action.type,
      name: 'activityName' in action ? action.activityName : action.decisionName,
    });
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
    console.log('[DEBUGGING] Action - Processing action:', {
      text: ctx.text,
      childCount: ctx.childCount,
    });

    // Get the full text and remove the dot at the end if present
    const fullText = ctx.text.endsWith('.') ? ctx.text.slice(0, -1) : ctx.text;

    // Extract the action type (do or use) and the name
    const actionType = fullText.startsWith('do') ? 'do' : 'use';
    const name = fullText.slice(actionType.length).trim().replace(/"/g, '');

    console.log('[DEBUGGING] Action - Parsed action:', {
      type: actionType,
      name,
    });

    if (actionType === 'do') {
      const activity = {
        type: DoActivityType.type,
        activityName: name,
        location: this.getLocation(ctx),
      };
      console.log('[DEBUGGING] Action - Created do activity:', activity);
      return activity;
    } else {
      const decision = {
        type: UseDecisionType.type,
        decisionName: name,
        location: this.getLocation(ctx),
      };
      console.log('[DEBUGGING] Action - Created use decision:', decision);
      return decision;
    }
  }

  visitTerminologyStatement(ctx: TerminologyStatementContext): Terminology {
    const terminologyName = this.getStringValue(ctx.getChild(1));
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
            conceptType = this.getStringValue(child.getChild(2));
          } else if (secondToken === 'valuetype') {
            valueType = this.getStringValue(child.getChild(2));
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
