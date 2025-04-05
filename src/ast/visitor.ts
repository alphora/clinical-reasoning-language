import { ParseTreeVisitor } from 'antlr4ts/tree/ParseTreeVisitor';
import { ParseTree } from 'antlr4ts/tree/ParseTree';
import { TerminalNode } from 'antlr4ts/tree/TerminalNode';
import { RuleNode } from 'antlr4ts/tree/RuleNode';
import { ParserRuleContext } from 'antlr4ts';
import { 
    File, Decision, WhenClause, DoClause, UseClause, 
    Action, CaseFeature, ASTNode, Statement 
} from './types';

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
            location: this.getLocation(ctx)
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
            for (let i = 0; i < block.childCount; i++) {
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

        return {
            type: 'Decision',
            name,
            whenClauses,
            useClauses,
            location: this.getLocation(ctx)
        };
    }

    visitWhenClause(ctx: ParserRuleContext): WhenClause {
        const condition = this.getStringValue(ctx.getChild(1));
        const block = ctx.getChild(4);
        const actions: DoClause[] = [];

        if (block instanceof ParserRuleContext) {
            for (let i = 0; i < block.childCount; i++) {
                const child = block.getChild(i);
                if (child instanceof ParserRuleContext) {
                    const statement = this.visitStatementLine(child);
                    if (statement.type === 'DoClause') {
                        actions.push(statement as DoClause);
                    }
                }
            }
        }

        return {
            type: 'WhenClause',
            condition,
            actions,
            location: this.getLocation(ctx)
        };
    }

    visitDoClause(ctx: ParserRuleContext): DoClause {
        return {
            type: 'DoClause',
            action: this.getStringValue(ctx.getChild(1)),
            location: this.getLocation(ctx)
        };
    }

    visitUseClause(ctx: ParserRuleContext): UseClause {
        return {
            type: 'UseClause',
            decisionName: this.getStringValue(ctx.getChild(1)),
            location: this.getLocation(ctx)
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
        return text.startsWith('"') && text.endsWith('"') 
            ? text.slice(1, -1) 
            : text;
    }

    private getLocation(ctx: ParserRuleContext) {
        return {
            start: {
                line: ctx.start.line,
                column: ctx.start.charPositionInLine
            },
            end: {
                line: ctx.stop?.line ?? ctx.start.line,
                column: ctx.stop?.charPositionInLine ?? ctx.start.charPositionInLine
            }
        };
    }
} 