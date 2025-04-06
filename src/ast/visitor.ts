import { ParserRuleContext } from 'antlr4ts';
import { ParseTree, ParseTreeVisitor, RuleNode, TerminalNode } from 'antlr4ts/tree';

import { ASTNode, Decision, DoClause, File, Statement, UseClause, WhenClause } from './types';

export class ASTVisitor implements ParseTreeVisitor<ASTNode> {
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

  visitFile(ctx: ParserRuleContext): File {
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
    return node.type === 'Decision' || node.type === 'Action' || node.type === 'CaseFeature';
  }

  visitStatement(ctx: ParserRuleContext): ASTNode | null {
    const child = ctx.getChild(0);
    if (child instanceof ParserRuleContext) {
      return child.accept(this);
    }
    return null;
  }

  visitDecision(ctx: ParserRuleContext): Decision {
    const name = this.getStringValue(ctx.getChild(1));
    const block = ctx.getChild(3);
    const whenClauses: WhenClause[] = [];
    const useClauses: UseClause[] = [];

    if (block instanceof ParserRuleContext) {
      // Check if this is a qualifierBlock
      const firstChild = block.getChild(1);
      if (firstChild instanceof ParserRuleContext && firstChild.text === 'any' || firstChild.text === 'all') {
        // This is a qualifierBlock, process the when clauses
        for (let i = 3; i < block.childCount - 1; i++) {
          const child = block.getChild(i);
          if (child instanceof ParserRuleContext) {
            const statement = this.visitWhenClause(child);
            if (statement.type === 'WhenClause') {
              whenClauses.push(statement as WhenClause);
            }
          }
        }
      } else {
        // Process regular statementLines
        for (let i = 1; i < block.childCount - 1; i++) {
          const child = block.getChild(i);
          if (child instanceof ParserRuleContext) {
            const statement = this.visitStatementLine(child);
            if (statement.type === 'WhenClause') {
              whenClauses.push(statement as WhenClause);
            } else if (statement.type === 'UseClause') {
              useClauses.push(statement as UseClause);
            }
          }
        }
      }
    }

    return {
      type: 'Decision',
      name,
      whenClauses,
      useClauses,
      location: this.getLocation(ctx),
    };
  }

  visitWhenClause(ctx: ParserRuleContext): WhenClause {
    const condition = this.getStringValue(ctx.getChild(1));
    const block = ctx.getChild(4);
    const actions: DoClause[] = [];
    const nestedWhenClauses: WhenClause[] = [];

    if (block instanceof ParserRuleContext) {
      for (let i = 1; i < block.childCount - 1; i++) {
        const child = block.getChild(i);
        if (child instanceof ParserRuleContext) {
          const statement = this.visitStatementLine(child);
          if (statement.type === 'DoClause') {
            actions.push(statement as DoClause);
          } else if (statement.type === 'WhenClause') {
            nestedWhenClauses.push(statement as WhenClause);
          }
        }
      }
    }

    return {
      type: 'WhenClause',
      condition,
      actions,
      nestedWhenClauses,
      location: this.getLocation(ctx),
    };
  }

  visitDoClause(ctx: ParserRuleContext): DoClause {
    return {
      type: 'DoClause',
      action: this.getStringValue(ctx.getChild(1)),
      location: this.getLocation(ctx),
    };
  }

  visitUseClause(ctx: ParserRuleContext): UseClause {
    return {
      type: 'UseClause',
      decisionName: this.getStringValue(ctx.getChild(1)),
      location: this.getLocation(ctx),
    };
  }

  private visitStatementLine(ctx: ParserRuleContext): ASTNode {
    const child = ctx.getChild(0);
    if (child instanceof ParserRuleContext) {
      return child.accept(this);
    }
    throw new Error('Invalid statement line');
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
